// Visitor data (notes, quotes, bookmarks, reading position, preferences). Lives only in this browser's localStorage.
// Every storage call is wrapped in try/catch; when storage is blocked the app keeps working from memory.
import { nfc, uid4 } from './dom.js';

const PREFIX = 'smh:';
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_NOTE_CHARS = 5000;
const memory = {};
const okId = (id) => /^[A-Za-z0-9_-]{1,80}$/.test(id) && id !== '__proto__';
const listeners = new Set();
const quotaListeners = new Set();

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onQuotaError = (fn) => { quotaListeners.add(fn); return () => quotaListeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch { /* blocked or damaged: use memory */ }
  return key in memory ? memory[key] : fallback;
}

function write(key, value) {
  memory[key] = value;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (quota) quotaListeners.forEach((fn) => fn());
    return false;
  } finally { emit(); }
}

export function storageWorks() {
  try { window.localStorage.setItem(PREFIX + 'probe', '1'); window.localStorage.removeItem(PREFIX + 'probe'); return true; } catch { return false; }
}

// ---------- preferences ----------
const DEFAULT_PREFS = { night: false, zoom: null, notebookOpen: true, view: 'icons', lockSeenAt: 0 };
export function prefs() {
  const p = read('prefs', {});
  return {
    night: p.night === true,
    zoom: Number.isFinite(p.zoom) && p.zoom >= 0.25 && p.zoom <= 5 ? p.zoom : DEFAULT_PREFS.zoom,
    notebookOpen: p.notebookOpen !== false,
    view: p.view === 'list' ? 'list' : 'icons',
    lockSeenAt: Number.isFinite(p.lockSeenAt) ? p.lockSeenAt : 0,
  };
}
export const setPref = (key, value) => write('prefs', { ...prefs(), [key]: value });

// ---------- notes and quotes ----------
function cleanNote(n) {
  if (!n || typeof n !== 'object' || typeof n.id !== 'string' || typeof n.bookId !== 'string') return null;
  const text = nfc(typeof n.text === 'string' ? n.text : '').slice(0, MAX_NOTE_CHARS);
  if (!text.trim()) return null;
  const page = Number.isInteger(n.page) && n.page > 0 ? n.page : 1;
  const stamp = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : new Date().toISOString());
  return { id: n.id.slice(0, 40), bookId: n.bookId.slice(0, 80), page, kind: n.kind === 'quote' ? 'quote' : 'note', text, createdAt: stamp(n.createdAt), updatedAt: stamp(n.updatedAt) };
}
export const allNotes = () => (Array.isArray(read('notes', [])) ? read('notes', []) : []).map(cleanNote).filter(Boolean);
export const notesFor = (bookId, kind) => allNotes()
  .filter((n) => n.bookId === bookId && (!kind || n.kind === kind))
  .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));

export function addNote({ bookId, page, kind = 'note', text }) {
  const note = cleanNote({ id: 'n' + Date.now().toString(36) + uid4(), bookId, page, kind, text });
  if (!note) return null;
  write('notes', [...allNotes(), note]);
  return note;
}
export function updateNote(id, text) {
  const t = nfc(text).slice(0, MAX_NOTE_CHARS);
  if (!t.trim()) return;
  write('notes', allNotes().map((n) => (n.id === id ? { ...n, text: t, updatedAt: new Date().toISOString() } : n)));
}
export const deleteNote = (id) => write('notes', allNotes().filter((n) => n.id !== id));

// ---------- reading position ----------
export function allProgress() {
  const p = read('progress', {});
  const out = {};
  if (p && typeof p === 'object') {
    for (const [id, v] of Object.entries(p)) {
      if (okId(id) && v && Number.isInteger(v.page) && v.page > 0) out[id] = { page: v.page, pages: Number.isInteger(v.pages) ? v.pages : 0, at: Number.isFinite(v.at) ? v.at : 0 };
    }
  }
  return out;
}
export const getProgress = (bookId) => allProgress()[bookId] || null;
export function setProgress(bookId, page, pages) {
  write('progress', { ...allProgress(), [bookId]: { page, pages, at: Date.now() } });
}
/** Book ids, most recently read first. */
export const recentIds = () => Object.entries(allProgress()).sort(([, a], [, b]) => b.at - a.at).map(([id]) => id);

// ---------- bookmarks ----------
export function allBookmarks() {
  const b = read('bookmarks', {});
  const out = {};
  if (b && typeof b === 'object') {
    for (const [id, pages] of Object.entries(b)) {
      if (okId(id) && Array.isArray(pages)) out[id] = [...new Set(pages.filter((p) => Number.isInteger(p) && p > 0))].sort((x, y) => x - y);
    }
  }
  return out;
}
export const bookmarksFor = (bookId) => allBookmarks()[bookId] || [];
export function toggleBookmark(bookId, page) {
  const all = allBookmarks();
  const list = new Set(all[bookId] || []);
  if (list.has(page)) list.delete(page); else list.add(page);
  all[bookId] = [...list].sort((a, b) => a - b);
  if (!all[bookId].length) delete all[bookId];
  write('bookmarks', all);
  return list.has(page);
}

/** Every book id that has any visitor data. */
export function knownBookIds() {
  return [...new Set([...allNotes().map((n) => n.bookId), ...Object.keys(allProgress()), ...Object.keys(allBookmarks())])];
}
/** Remove everything saved for a book (used when the book was removed from the library). */
export function removeBookData(bookId) {
  write('notes', allNotes().filter((n) => n.bookId !== bookId));
  const p = allProgress(); delete p[bookId]; write('progress', p);
  const b = allBookmarks(); delete b[bookId]; write('bookmarks', b);
}

// ---------- export / backup / restore ----------
export function exportNotesTxt(titleOf) {
  const lines = ['Saral Mandal HariPrabodham: my notes', 'Exported ' + new Date().toLocaleString(), ''];
  const byBook = new Map();
  allNotes().forEach((n) => { if (!byBook.has(n.bookId)) byBook.set(n.bookId, []); byBook.get(n.bookId).push(n); });
  for (const [bookId, notes] of byBook) {
    lines.push(titleOf(bookId), '='.repeat(Math.min(60, titleOf(bookId).length)));
    notes.sort((a, b) => a.page - b.page).forEach((n) => lines.push(`p. ${n.page} [${n.kind}] ${n.text}`, ''));
  }
  if (byBook.size === 0) lines.push('(no notes yet)');
  return lines.join('\n');
}

export function exportBackup() {
  return JSON.stringify({
    app: 'saral-mandal-hariprabodham', version: 1, exportedAt: new Date().toISOString(),
    notes: allNotes(), progress: allProgress(), bookmarks: allBookmarks(), prefs: prefs(),
  }, null, 2);
}

/** Validates a backup file (shape and size) and merges it in. Nothing in the file is ever executed. */
export function importBackup(text) {
  if (typeof text !== 'string' || new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('This file is too large to be a notebook backup (limit 5 MB).');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a valid backup (it is not JSON).'); }
  if (!data || typeof data !== 'object' || data.app !== 'saral-mandal-hariprabodham' || !Array.isArray(data.notes)) throw new Error('This file is not a Saral Mandal HariPrabodham backup.');

  const have = new Map(allNotes().map((n) => [n.id, n]));
  let added = 0;
  data.notes.map(cleanNote).filter(Boolean).forEach((n) => {
    const old = have.get(n.id);
    if (!old) added++;
    if (!old || old.updatedAt < n.updatedAt) have.set(n.id, n);
  });
  write('notes', [...have.values()]);

  const progress = allProgress();
  if (data.progress && typeof data.progress === 'object') {
    for (const [id, v] of Object.entries(data.progress)) {
      if (okId(id) && v && Number.isInteger(v.page) && v.page > 0 && Number.isFinite(v.at) && (!progress[id] || progress[id].at < v.at)) {
        progress[id] = { page: v.page, pages: Number.isInteger(v.pages) ? v.pages : 0, at: v.at };
      }
    }
  }
  write('progress', progress);

  const marks = allBookmarks();
  if (data.bookmarks && typeof data.bookmarks === 'object') {
    for (const [id, pages] of Object.entries(data.bookmarks)) {
      if (okId(id) && Array.isArray(pages)) marks[id] = [...new Set([...(marks[id] || []), ...pages.filter((p) => Number.isInteger(p) && p > 0)])].sort((a, b) => a - b);
    }
  }
  write('bookmarks', marks);
  return { notes: added };
}
