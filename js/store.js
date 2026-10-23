// Library data: loads /data/*.json, validates it, and answers every lookup the screens need.
import { nfc, compareEn, compareGu, sortKey, letterOf, safeColor, withTimeout } from './dom.js';

export const MAX_DEPTH = 4;
export const FOLDER_COLOR_KEYS = ['amber', 'saffron', 'blue'];
export const TOPIC_PALETTE = ['#C8371D', '#D9772B', '#D9A520', '#2F7A5B', '#1F5F7A', '#4867C9', '#7A4FB0', '#BE123C', '#6B6F7E'];
export const BOOK_COLORS = ['#B4520F', ...TOPIC_PALETTE];
export const DATA_FILES = { books: 'data/books.json', folders: 'data/folders.json', topics: 'data/topics.json', settings: 'data/settings.json' };

const DEFAULT_SETTINGS = {
  version: 1,
  siteName: 'Saral Mandal HariPrabodham',
  tagline: '',
  showLockScreen: true,
  verses: [],
  github: { owner: '', repo: 'saral-mandal-hariprabodham', branch: 'main' },
};

const state = { raw: null, settings: DEFAULT_SETTINGS, books: [], folders: [], topics: [] };
let maps = { book: new Map(), folder: new Map(), topic: new Map(), children: new Map(), direct: new Map() };
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

// ---------- loading ----------
/** Visitors read the public JSON with no caching; a custom reader (the admin's API reader) can be passed instead. */
export async function fetchPublicJson(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(path, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) throw new Error(`${path} could not be loaded (error ${res.status}).`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${path} took too long to load. Check your connection and try again.`);
    if (e instanceof SyntaxError) throw new Error(`${path} is damaged and cannot be read.`);
    throw e;
  } finally { clearTimeout(timer); }
}

export async function load(readJson = fetchPublicJson) {
  const [books, folders, topics, settings] = await Promise.all(
    ['books', 'folders', 'topics', 'settings'].map((k) => withTimeout(readJson(DATA_FILES[k]), 25000, `${DATA_FILES[k]} took too long to load.`)),
  );
  setRaw({ books, folders, topics, settings });
}

/** Accepts the four raw JSON documents, validates them, and rebuilds every lookup. */
export function setRaw(raw) {
  const need = (doc, key, file) => {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc[key])) throw new Error(`${file} is not in the expected format.`);
  };
  need(raw.books, 'books', DATA_FILES.books);
  need(raw.folders, 'folders', DATA_FILES.folders);
  need(raw.topics, 'topics', DATA_FILES.topics);
  if (!raw.settings || typeof raw.settings !== 'object') throw new Error(`${DATA_FILES.settings} is not in the expected format.`);
  state.raw = raw;
  state.settings = cleanSettings(raw.settings);
  state.topics = cleanTopics(raw.topics.topics);
  state.folders = cleanFolders(raw.folders.folders);
  state.books = cleanBooks(raw.books.books);
  rebuild();
  emit();
}

export const getRaw = () => structuredClone(state.raw);
export const settings = () => state.settings;
export const allBooks = () => state.books;
export const allFolders = () => state.folders;
export const allTopics = () => state.topics;

// ---------- validation ----------
const str = (v) => (typeof v === 'string' ? nfc(v).trim() : '');
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);

export function safeBookPath(p) {
  return typeof p === 'string' && /^books\/[A-Za-z0-9_-]+\.pdf$/i.test(p);
}

function cleanSettings(s) {
  const g = s.github && typeof s.github === 'object' ? s.github : {};
  return {
    version: 1,
    siteName: str(s.siteName) || DEFAULT_SETTINGS.siteName,
    tagline: str(s.tagline),
    showLockScreen: s.showLockScreen !== false,
    verses: (Array.isArray(s.verses) ? s.verses : [])
      .filter((v) => v && typeof v === 'object' && str(v.text))
      .map((v) => ({ text: str(v.text), source: str(v.source), bookId: idOk(v.bookId) ? v.bookId : null })),
    github: {
      owner: str(g.owner),
      repo: str(g.repo) || DEFAULT_SETTINGS.github.repo,
      branch: str(g.branch) || 'main',
    },
  };
}

function cleanTopics(list) {
  const seen = new Set();
  const out = [];
  list.forEach((t, i) => {
    if (!t || !idOk(t.id) || !str(t.name) || seen.has(t.id)) { console.warn('Skipped a broken topic record', t); return; }
    seen.add(t.id);
    out.push({ id: t.id, name: str(t.name), nameLocal: str(t.nameLocal), color: safeColor(t.color, '#6B6F7E'), order: Number.isFinite(t.order) ? t.order : i });
  });
  return out.sort((a, b) => a.order - b.order || compareEn(a.name, b.name));
}

function cleanFolders(list) {
  const byId = new Map();
  list.forEach((f, i) => {
    if (!f || !idOk(f.id) || !str(f.name) || byId.has(f.id)) { console.warn('Skipped a broken folder record', f); return; }
    byId.set(f.id, {
      id: f.id, name: str(f.name), nameLocal: str(f.nameLocal),
      parentId: idOk(f.parentId) ? f.parentId : null,
      color: FOLDER_COLOR_KEYS.includes(f.color) ? f.color : 'amber',
      order: Number.isFinite(f.order) ? f.order : i,
    });
  });
  // Drop folders whose parent chain is missing, loops, or is deeper than MAX_DEPTH.
  const depthOf = (f) => {
    let d = 1, cur = f;
    const seen = new Set([f.id]);
    while (cur.parentId) {
      cur = byId.get(cur.parentId);
      if (!cur || seen.has(cur.id)) return Infinity;
      seen.add(cur.id);
      d++;
    }
    return d;
  };
  const ok = [...byId.values()].filter((f) => {
    const good = depthOf(f) <= MAX_DEPTH;
    if (!good) console.warn('Skipped a folder with a missing parent, a loop, or too much nesting:', f.id);
    return good;
  });
  return ok.sort((a, b) => a.order - b.order || compareEn(a.name, b.name));
}

function cleanBooks(list) {
  const seen = new Set();
  const out = [];
  for (const b of list) {
    if (!b || !idOk(b.id) || !str(b.title) || !safeBookPath(b.file) || seen.has(b.id)) { console.warn('Skipped a broken book record', b && b.id); continue; }
    seen.add(b.id);
    const ids = (a) => (Array.isArray(a) ? a.filter(idOk) : []);
    out.push({
      id: b.id, title: str(b.title), titleLocal: str(b.titleLocal), author: str(b.author),
      tradition: str(b.tradition), language: str(b.language), description: str(b.description),
      file: b.file, pages: num(b.pages), sizeBytes: num(b.sizeBytes), color: safeColor(b.color),
      folders: ids(b.folders), topics: ids(b.topics), addedAt: str(b.addedAt), updatedAt: str(b.updatedAt),
    });
  }
  return out.sort(compareBooks);
}

// ---------- lookups ----------
export function compareBooks(a, b) {
  return compareEn(sortKey(a.title), sortKey(b.title)) || compareGu(a.titleLocal, b.titleLocal);
}

function rebuild() {
  const m = { book: new Map(), folder: new Map(), topic: new Map(), children: new Map(), direct: new Map() };
  state.books.forEach((b) => m.book.set(b.id, b));
  state.folders.forEach((f) => m.folder.set(f.id, f));
  state.topics.forEach((t) => m.topic.set(t.id, t));
  state.folders.forEach((f) => {
    const k = f.parentId || '';
    if (!m.children.has(k)) m.children.set(k, []);
    m.children.get(k).push(f);
  });
  state.books.forEach((b) => b.folders.forEach((fid) => {
    if (!m.folder.has(fid)) return; // ids of deleted folders are ignored
    if (!m.direct.has(fid)) m.direct.set(fid, []);
    m.direct.get(fid).push(b);
  }));
  maps = m;
}

export const getBook = (id) => maps.book.get(id) || null;
export const getFolder = (id) => maps.folder.get(id) || null;
export const getTopic = (id) => maps.topic.get(id) || null;
export const childFolders = (parentId) => maps.children.get(parentId || '') || [];

export function folderPath(id) {
  const path = [];
  let cur = getFolder(id);
  while (cur) { path.unshift(cur); cur = cur.parentId ? getFolder(cur.parentId) : null; }
  return path;
}

export function descendantIds(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) childFolders(ids[i]).forEach((c) => ids.push(c.id));
  return ids;
}
/** How many levels the subtree below (and including) this folder uses. */
export function subtreeHeight(id) {
  const walk = (fid) => 1 + Math.max(0, ...childFolders(fid).map((c) => walk(c.id)));
  return walk(id);
}

/** Books in a folder; by default also those in its sub-folders. */
export function booksInFolder(id, recursive = true) {
  const ids = recursive ? descendantIds(id) : [id];
  const seen = new Set();
  const out = [];
  ids.forEach((fid) => (maps.direct.get(fid) || []).forEach((b) => { if (!seen.has(b.id)) { seen.add(b.id); out.push(b); } }));
  return out.sort(compareBooks);
}
export const booksInTopic = (id) => state.books.filter((b) => b.topics.includes(id));
export const topicsOf = (book) => book.topics.map(getTopic).filter(Boolean);
export const foldersOf = (book) => book.folders.map(getFolder).filter(Boolean);

export function folderCounts(id) {
  return { folders: childFolders(id).length, books: booksInFolder(id, true).length };
}

/** The folder tree flattened for the sidebar and tick-box lists. */
export function folderTree() {
  const out = [];
  const walk = (parentId, depth) => childFolders(parentId).forEach((f) => {
    out.push({ folder: f, depth, count: booksInFolder(f.id, true).length });
    walk(f.id, depth + 1);
  });
  walk(null, 0);
  return out;
}

export function groupByLetter(books) {
  const groups = new Map();
  books.forEach((b) => {
    const l = letterOf(b.title);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(b);
  });
  return [...groups.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a < b ? -1 : 1)).map(([letter, items]) => ({ letter, books: items }));
}
export const lettersIn = (books) => new Set(books.map((b) => letterOf(b.title)));

/**
 * What a Library view shows for a route like { f, t, recent }.
 * Returns { kind, title, folders, books, folder?, topic?, missing? }.
 */
export function place({ f, t, recent } = {}, recentIds = []) {
  if (f) {
    const folder = getFolder(f);
    if (!folder) return { kind: 'folder', missing: 'folder', title: 'Folder', folders: [], books: [] };
    return { kind: 'folder', title: folder.name, titleLocal: folder.nameLocal, folder, folders: childFolders(f), books: booksInFolder(f, false) };
  }
  if (t) {
    const topic = getTopic(t);
    if (!topic) return { kind: 'topic', missing: 'topic', title: 'Topic', folders: [], books: [] };
    return { kind: 'topic', title: topic.name, titleLocal: topic.nameLocal, topic, folders: [], books: booksInTopic(t).sort(compareBooks) };
  }
  if (recent) {
    const books = recentIds.map(getBook).filter(Boolean);
    return { kind: 'recent', title: 'Recently Read', folders: [], books };
  }
  return { kind: 'all', title: 'All Books', folders: childFolders(null), books: state.books };
}

export const verseOfTheDay = () => {
  const v = state.settings.verses;
  return v.length ? v[Math.floor(Math.random() * v.length)] : null;
};
