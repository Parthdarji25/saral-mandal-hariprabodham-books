// Searching: books, folders, topics, visitor notes, and (lazily) the text inside PDFs.
import { norm, compareEn, sortKey, plural } from './dom.js';
import * as store from './store.js';
import * as local from './local.js';
import { openPdf, PdfError } from './pdf.js';

export const words = (q) => norm(q).split(/\s+/).filter(Boolean);

// ---------- books ----------
let hayCache = new Map();
store.subscribe(() => { hayCache = new Map(); });

function haystack(book) {
  let hay = hayCache.get(book.id);
  if (hay === undefined) {
    const parts = [book.title, book.titleLocal, book.author, book.tradition, book.language, book.description];
    store.foldersOf(book).forEach((f) => parts.push(f.name, f.nameLocal));
    store.topicsOf(book).forEach((t) => parts.push(t.name, t.nameLocal));
    hay = norm(parts.join(' '));
    hayCache.set(book.id, hay);
  }
  return hay;
}

/** Every word typed must match somewhere on the book. */
export const matchBook = (book, ws) => ws.every((w) => haystack(book).includes(w));
export const matchFolder = (folder, ws) => { const h = norm(folder.name + ' ' + folder.nameLocal); return ws.every((w) => h.includes(w)); };
export const matchTopic = matchFolder;

function bookScore(book, ws) {
  const title = norm(book.title + ' ' + book.titleLocal);
  const first = ws[0] || '';
  if (title.startsWith(first)) return 3;
  if (ws.every((w) => title.includes(w))) return 2;
  return 1;
}

/** Filter a list of books by typed text and/or a starting letter. */
export function filterBooks(books, { q = '', letter = '' } = {}) {
  const ws = words(q);
  return books.filter((b) => (!letter || (letter === '#' ? !/^[a-z]/i.test(sortKey(b.title)) : sortKey(b.title).toUpperCase().startsWith(letter))) && (!ws.length || matchBook(b, ws)));
}

export function searchLibrary(q) {
  const ws = words(q);
  if (!ws.length) return { books: [], folders: [], topics: [], notes: [] };
  const books = store.allBooks().filter((b) => matchBook(b, ws))
    .map((book) => ({ book, score: bookScore(book, ws) }))
    .sort((a, b) => b.score - a.score || compareEn(sortKey(a.book.title), sortKey(b.book.title)));
  const folders = store.allFolders().filter((f) => matchFolder(f, ws));
  const topics = store.allTopics().filter((t) => matchTopic(t, ws));
  const notes = local.allNotes().filter((n) => {
    const book = store.getBook(n.bookId);
    const hay = norm(n.text + ' ' + (book ? book.title + ' ' + book.titleLocal : ''));
    return ws.every((w) => hay.includes(w));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { books, folders, topics, notes };
}

// ---------- text inside PDFs ----------
// Pages' text is extracted lazily, one book at a time, and kept in memory only.
const index = new Map(); // bookId -> { pages: string[], searchable: boolean }
const pending = new Map();

export const isIndexed = (bookId) => index.has(bookId);

export function indexBook(book) {
  if (index.has(book.id)) return Promise.resolve(index.get(book.id));
  if (pending.has(book.id)) return pending.get(book.id);
  const job = (async () => {
    let doc;
    try {
      doc = await openPdf(book.file);
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(norm(content.items.map((it) => it.str).join(' ')));
        page.cleanup();
      }
      const entry = { pages, searchable: pages.some((t) => t.replace(/\s/g, '').length > 20) };
      index.set(book.id, entry);
      return entry;
    } catch (e) {
      if (!(e instanceof PdfError)) console.warn('Could not index', book.id, e && e.message);
      const entry = { pages: [], searchable: false, failed: true };
      index.set(book.id, entry);
      return entry;
    } finally {
      if (doc) doc.destroy();
      pending.delete(book.id);
    }
  })();
  pending.set(book.id, job);
  return job;
}

/** Pages of one book that contain every word, e.g. [{ page: 3, count: 2 }]. */
export function findInIndex(bookId, q) {
  const entry = index.get(bookId);
  const ws = words(q);
  if (!entry || !ws.length) return [];
  const out = [];
  entry.pages.forEach((text, i) => {
    if (ws.every((w) => text.includes(w))) {
      let count = 0;
      for (let at = text.indexOf(ws[0]); at !== -1; at = text.indexOf(ws[0], at + ws[0].length)) count++;
      out.push({ page: i + 1, count });
    }
  });
  return out;
}

/** Hits from books that are already indexed (cheap; used by the "Everything" view). */
export function insideFromIndex(q) {
  return store.allBooks().filter((b) => isIndexed(b.id)).map((book) => {
    const pages = findInIndex(book.id, q);
    return { book, pages, total: pages.reduce((s, h) => s + h.count, 0) };
  }).filter((r) => r.pages.length).sort((a, b) => b.total - a.total);
}

/**
 * Search the text inside every book, indexing the ones not yet read.
 * onProgress(done, total, partialResults) is called as each book finishes; stop() cancels.
 */
export async function searchInside(q, onProgress, shouldStop = () => false) {
  const books = store.allBooks();
  const results = [];
  let done = 0;
  for (const book of books) {
    if (shouldStop()) break;
    const entry = await indexBook(book);
    done++;
    const hits = entry.searchable ? findInIndex(book.id, q) : [];
    if (hits.length) {
      results.push({ book, pages: hits, total: hits.reduce((s, h) => s + h.count, 0) });
      results.sort((a, b) => b.total - a.total);
    }
    onProgress && onProgress(done, books.length, results.slice());
  }
  return results;
}

export const unsearchableBooks = () => store.allBooks().filter((b) => { const e = index.get(b.id); return e && !e.searchable; });

// ---------- grouped results (shared by Search everything and the phone Search screen) ----------
export const FILTERS = [['all', 'Everything'], ['books', 'Books'], ['folders', 'Folders'], ['topics', 'Topics'], ['inside', 'Inside books'], ['notes', 'My notes']];

/**
 * { groups: [{ label, items }], counts } for a query and a filter key.
 * `inside` is the list of in-PDF hits found so far (from searchInside or insideFromIndex).
 */
export function groupedResults(q, filter, inside = []) {
  const ws = words(q);
  const lib = ws.length ? searchLibrary(q) : { books: [], folders: [], topics: [], notes: [] };
  const progress = (b) => local.getProgress(b.id);
  const bookItem = ({ book }) => ({ kind: 'book', id: 'b-' + book.id, book, title: book.title, local: book.titleLocal, sub: [book.author, book.tradition, book.language].filter(Boolean).join(' · ') || 'Book', page: progress(book) ? progress(book).page : null });
  const folderItem = (f) => ({ kind: 'folder', id: 'f-' + f.id, folder: f, title: f.name, local: f.nameLocal, sub: store.folderPath(f.id).map((x) => x.name).join(' › ') });
  const topicItem = (t) => ({ kind: 'topic', id: 't-' + t.id, topic: t, title: t.name, local: t.nameLocal, sub: `Topic · ${plural(store.booksInTopic(t.id).length, 'book')}` });
  const insideItem = (r) => ({ kind: 'inside', id: 'i-' + r.book.id, book: r.book, pages: r.pages, title: `The word “${ws.join(' ')}” appears on ${plural(r.pages.length, 'page')}`, sub: `Inside ${r.book.title} — first on page ${r.pages[0].page}`, page: r.pages[0].page });
  const noteItem = (n) => { const book = store.getBook(n.bookId); return { kind: 'note', id: 'n-' + n.id, note: n, book, title: n.text.replace(/\s+/g, ' ').slice(0, 70), sub: book ? book.title : 'This book was removed', page: n.page }; };

  const all = { books: lib.books.map(bookItem), folders: lib.folders.map(folderItem), topics: lib.topics.map(topicItem), inside: inside.map(insideItem), notes: lib.notes.map(noteItem) };
  const counts = { books: all.books.length, folders: all.folders.length, topics: all.topics.length, inside: all.inside.length, notes: all.notes.length };
  counts.all = counts.books + counts.folders + counts.topics + counts.inside + counts.notes;

  const groups = [];
  if (filter === 'all') {
    const first = all.books[0] || all.folders[0] || all.topics[0] || null;
    if (first) groups.push({ label: 'Top hit', items: [first] });
    const rest = (arr) => arr.filter((x) => x !== first);
    [['Books', rest(all.books)], ['Folders', rest(all.folders)], ['Topics', rest(all.topics)], ['Inside books', all.inside.slice(0, 8)], ['My notes', all.notes.slice(0, 8)]]
      .forEach(([label, items]) => { if (items.length) groups.push({ label, items }); });
  } else if (all[filter].length) groups.push({ label: FILTERS.find(([k]) => k === filter)[1], items: all[filter] });
  return { groups, counts };
}
