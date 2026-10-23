// Add / edit / delete a book. A PDF is checked (real "%PDF-" header, size limits, readable, page count) before upload.
import { h, clear, add, fmtBytes, makeId, plural, safeColor } from '../dom.js';
import * as store from '../store.js';
import { runCommit, ensureSignedIn } from './commit.js';
import { MAX_PDF_BYTES, WARN_PDF_BYTES } from './github.js';
import { openPdf, PdfError } from '../pdf.js';
import { openDialog, toast } from '../ui/dialogs.js';

const guard = (fn) => async (...args) => {
  try { return await fn(...args); } catch (e) { toast(e && e.message ? e.message : 'Something went wrong.', { error: true }); return null; }
};
const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }, input), hint ? h('div', { class: 'hint', text: hint }) : null);

/** Throws a plain-English Error if the file cannot be used. Returns { pages, bytes }. */
export async function inspectPdf(file) {
  if (!file) throw new Error('Please choose a PDF file.');
  if (file.size > MAX_PDF_BYTES) throw new Error(`This file is ${fmtBytes(file.size)}. GitHub does not accept files over 100 MB, so the limit here is 95 MB. Add bigger files with git or GitHub Desktop instead.`);
  const head = await file.slice(0, 5).text();
  if (head !== '%PDF-') throw new Error('This is not a real PDF file (it does not start with %PDF-). Please choose a PDF.');
  let pages = 0;
  try {
    const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
    pages = doc.numPages;
    doc.destroy();
  } catch (e) {
    if (e instanceof PdfError && (e.kind === 'password' || e.kind === 'invalid' || e.kind === 'empty')) throw new Error(e.message + ' Please choose a different file.');
    pages = 0; // too big for this device to open here: upload anyway, page count stays unknown
  }
  return { pages, bytes: file.size };
}

const titleFromFile = (name) => name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

function bookForm({ book, folderId }) {
  const editing = !!book;
  let picked = null; // { file, pages, bytes }
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'input', 'aria-label': editing ? 'Replace the PDF (optional)' : 'PDF file' });
  const fileInfo = h('p', { class: 'hint', role: 'status', text: editing ? `Current file: ${fmtBytes(book.sizeBytes)}, ${book.pages || '?'} pages. Leave empty to keep it.` : '' });
  const title = h('input', { type: 'text', class: 'input', value: book ? book.title : '', maxlength: '160', 'aria-label': 'Title', autocomplete: 'off' });
  const titleLocal = h('input', { type: 'text', class: 'input', lang: 'gu', value: book ? book.titleLocal : '', maxlength: '160', 'aria-label': 'Gujarati title', placeholder: 'ગુજરાતી શીર્ષક (optional)', autocomplete: 'off' });
  const author = h('input', { type: 'text', class: 'input', value: book ? book.author : '', maxlength: '120', 'aria-label': 'Author', autocomplete: 'off' });
  const tradition = h('input', { type: 'text', class: 'input', value: book ? book.tradition : '', maxlength: '80', 'aria-label': 'Tradition', placeholder: 'e.g. Swaminarayan', autocomplete: 'off' });
  const language = h('input', { type: 'text', class: 'input', value: book ? book.language : '', maxlength: '40', list: 'lang-list', 'aria-label': 'Language', autocomplete: 'off' });
  const description = h('textarea', { class: 'textarea', rows: '3', maxlength: '1000', 'aria-label': 'Description', value: book ? book.description : '' });
  let color = book ? book.color : store.BOOK_COLORS[0];
  const colorRow = h('div', { class: 'swatch-row', role: 'group', 'aria-label': 'Cover colour' });
  const drawColors = () => { clear(colorRow); store.BOOK_COLORS.forEach((c) => add(colorRow, h('button', { type: 'button', class: 'swatch-pick', 'aria-label': 'Colour ' + c, 'aria-pressed': String(c === color), style: { '--c': c }, onClick: () => { color = c; drawColors(); } }))); };
  drawColors();
  const chosenFolders = new Set(book ? book.folders.filter(store.getFolder) : folderId ? [folderId] : []);
  const chosenTopics = new Set(book ? book.topics.filter(store.getTopic) : []);
  const tick = (set, id, label, depth = 0, dot) => h('label', { class: 'check', style: { paddingLeft: depth * 16 + 'px' } }, h('input', { type: 'checkbox', checked: set.has(id), onChange: (e) => { if (e.target.checked) set.add(id); else set.delete(id); } }), dot ? h('span', { class: 'dot-color', style: { '--c': dot } }) : null, h('span', { text: label }));

  fileInput.addEventListener('change', async () => {
    picked = null;
    const file = fileInput.files[0];
    if (!file) return;
    fileInfo.textContent = 'Checking the file…';
    fileInfo.classList.remove('note-warn');
    try {
      const info = await inspectPdf(file);
      picked = { file, ...info };
      fileInfo.textContent = `${file.size > WARN_PDF_BYTES ? 'Large file: ' : ''}${fmtBytes(file.size)}, ${info.pages ? plural(info.pages, 'page') : 'page count unknown'}.` + (file.size > WARN_PDF_BYTES ? ' Over 25 MB: it will take a while and uses up your GitHub space. Consider compressing it.' : '');
      if (file.size > WARN_PDF_BYTES) fileInfo.classList.add('note-warn');
      if (!title.value.trim()) title.value = titleFromFile(file.name);
    } catch (e) { fileInput.value = ''; fileInfo.textContent = e.message; fileInfo.classList.add('note-warn'); }
  });

  const body = h('div', {},
    editing ? null : h('p', { class: 'dry-banner', text: 'Everything you add here is public on the internet. Only add books you have the right to share.' }),
    field(editing ? 'Replace PDF (optional)' : 'PDF file', fileInput), fileInfo,
    field('Title', title), field('Gujarati title', titleLocal), h('div', { class: 'field-row' }, field('Author', author), field('Tradition', tradition)),
    field('Language', language), h('datalist', { id: 'lang-list' }, ['English', 'Gujarati', 'Sanskrit', 'Hindi'].map((l) => h('option', { value: l }))),
    field('Description', description, 'Web links (http or https) become clickable.'),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Cover colour' }), colorRow),
    h('div', { class: 'label-caps', text: 'In my folders' }), store.allFolders().length ? store.folderTree().map(({ folder, depth }) => tick(chosenFolders, folder.id, folder.name, depth)) : h('p', { class: 'hint', text: 'No folders yet. You can add the book to folders later.' }),
    h('div', { class: 'label-caps', text: 'Topics' }), store.allTopics().length ? store.allTopics().map((t) => tick(chosenTopics, t.id, t.name, 0, t.color)) : h('p', { class: 'hint', text: 'No topics yet.' }));

  return { body, read: () => ({ picked, title: title.value.trim(), titleLocal: titleLocal.value.trim(), author: author.value.trim(), tradition: tradition.value.trim(), language: language.value.trim(), description: description.value.trim(), color: safeColor(color), folders: [...chosenFolders], topics: [...chosenTopics] }) };
}

export const addBook = guard(async ({ folderId = null } = {}) => {
  if (!(await ensureSignedIn())) return;
  const form = bookForm({ folderId });
  openDialog({ title: 'Add PDF', wide: true, body: form.body, actions: [
    { label: 'Cancel', kind: 'cancel' },
    { label: 'Continue', kind: 'primary', onClick: async () => {
      const v = form.read();
      if (!v.picked) throw new Error('Please choose a PDF file first.');
      if (!v.title) throw new Error('Please type a title.');
      const r = await runCommit({ message: `admin: add book "${v.title}"`, apply: (w) => {
        const list = w.books.books;
        const id = makeId(v.title, new Set(list.map((b) => b.id)));
        const now = new Date().toISOString();
        list.push({ id, title: v.title, titleLocal: v.titleLocal, author: v.author, tradition: v.tradition, language: v.language, description: v.description, file: `books/${id}.pdf`,
          pages: v.picked.pages, sizeBytes: v.picked.bytes, color: v.color, folders: v.folders.filter((f) => w.folders.folders.some((x) => x.id === f)), topics: v.topics.filter((t) => w.topics.topics.some((x) => x.id === t)), addedAt: now, updatedAt: now });
        return { files: [{ path: `books/${id}.pdf`, blob: v.picked.file }] };
      } });
      return r ? true : false;
    } },
  ] });
});

export const editBook = guard(async (id) => {
  const book = store.getBook(id);
  if (!book) throw new Error('That book no longer exists.');
  if (!(await ensureSignedIn())) return;
  const form = bookForm({ book });
  openDialog({ title: 'Edit details', subtitle: book.title, wide: true, body: form.body, actions: [
    { label: 'Cancel', kind: 'cancel' },
    { label: 'Save', kind: 'primary', onClick: async () => {
      const v = form.read();
      if (!v.title) throw new Error('Please type a title.');
      const r = await runCommit({ message: v.picked ? `admin: replace PDF of book "${v.title}"` : `admin: edit book "${v.title}"`, apply: (w) => {
        const t = w.books.books.find((b) => b.id === id);
        if (!t) throw new Error('That book no longer exists. Please reload.');
        Object.assign(t, { title: v.title, titleLocal: v.titleLocal, author: v.author, tradition: v.tradition, language: v.language, description: v.description, color: v.color,
          folders: v.folders.filter((f) => w.folders.folders.some((x) => x.id === f)), topics: v.topics.filter((x) => w.topics.topics.some((y) => y.id === x)), updatedAt: new Date().toISOString() });
        if (v.picked) { t.pages = v.picked.pages; t.sizeBytes = v.picked.bytes; return { files: [{ path: t.file, blob: v.picked.file }] }; }
        return null;
      } });
      return r ? true : false;
    } },
  ] });
});

export const deleteBook = guard(async (id) => {
  const book = store.getBook(id);
  if (!book) throw new Error('That book no longer exists.');
  return runCommit({ title: 'Delete book', danger: true, message: `admin: delete book "${book.title}"`,
    intro: `Delete “${book.title}”? The book and its PDF are removed from the library in one commit. GitHub keeps the old version in its history. Visitors' own notes about it stay on their devices and will show “This book was removed”.`,
    apply: (w) => {
      const t = w.books.books.find((b) => b.id === id);
      if (!t) throw new Error('That book no longer exists. Please reload.');
      w.books.books = w.books.books.filter((b) => b.id !== id);
      return { files: [{ path: t.file, delete: true }] };
    } });
});
