// The notebook: the panel beside the reader (notes, quotes, bookmarks) and the Notebook app (everything, with backup).
import { h, clear, gu, plural, fmtDate, downloadText, add } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import { icon } from './icons.js';
import { confirmDialog, toast } from './dialogs.js';

// ---------- the panel beside the reader ----------
/**
 * book, getPage() -> current page, goToPage(n). `tabs` is ['notes','quotes','bookmarks'] (desktop) or ['notes','quotes'] (phone).
 * Returns { el, refresh, setPage, destroy }.
 */
export function createNotebookPanel({ book, getPage, goToPage, tabs = ['notes', 'quotes', 'bookmarks'], phone = false }) {
  const st = { tab: 'notes', editing: null };
  let formPage = null;
  const titleEl = h('h2', { class: 'nb-title', text: 'Notebook' });
  const subEl = h('p', { class: 'nb-sub' });
  const tabBar = h('div', { class: 'segmented nb-tabs', role: 'tablist', 'aria-label': 'Notebook sections' });
  const paper = h('div', { class: 'paper' });
  const form = h('div', { class: 'nb-form' });
  const el = h('section', { class: 'notebook' + (phone ? ' phone' : ''), 'aria-label': 'Notebook' }, h('header', { class: 'nb-head' }, titleEl, subEl, tabBar), paper, form);
  const unsub = local.subscribe(refresh);
  const LABEL = { notes: 'Notes', quotes: 'Quotes', bookmarks: 'Bookmarks' };

  function refresh() {
    const notes = local.notesFor(book.id, 'note'), quotes = local.notesFor(book.id, 'quote');
    subEl.textContent = phone ? '' : `${book.title} · ${plural(notes.length, 'note')} · ${plural(quotes.length, 'quote')}`;
    titleEl.textContent = phone ? `Notebook · ${plural(notes.length + quotes.length, 'note')}` : 'Notebook';
    clear(tabBar);
    tabs.forEach((t) => add(tabBar, h('button', { type: 'button', role: 'tab', 'aria-selected': String(st.tab === t), text: LABEL[t], onClick: () => { clear(form); st.tab = t; st.editing = null; refresh(); } })));
    drawPaper(notes, quotes);
    drawForm();
  }

  function drawPaper(notes, quotes) {
    clear(paper);
    if (st.tab === 'bookmarks') {
      const marks = local.bookmarksFor(book.id);
      if (!marks.length) add(paper, emptyLine('No bookmarks yet. Press the bookmark button to mark the page you are on.'));
      marks.forEach((p) => add(paper, h('div', { class: 'entry' }, h('div', { class: 'entry-top' }, pageChip(p), h('span', { class: 'entry-date', text: 'Bookmarked page' }), h('span', { class: 'grow' }),
        iconBtn('trash', 'Remove bookmark on page ' + p, () => local.toggleBookmark(book.id, p))))));
      return;
    }
    const list = st.tab === 'quotes' ? quotes : notes;
    if (!list.length) add(paper, emptyLine(st.tab === 'quotes' ? 'No quotes yet. Select words on the page, then use “Use selected text”.' : 'No notes yet. Write one below. It stays on this device.'));
    list.forEach((n) => add(paper, entry(n)));
  }

  const emptyLine = (text) => h('p', { class: 'nb-empty', text });
  const pageChip = (p) => h('button', { type: 'button', class: 'page-chip', text: 'p. ' + p, 'aria-label': 'Go to page ' + p, onClick: () => goToPage(p) });
  const iconBtn = (name, label, fn) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onClick: fn }, icon(name, 15));

  function entry(n) {
    const editing = st.editing === n.id;
    const text = editing ? editor(n) : n.kind === 'quote' ? h('blockquote', { class: 'entry-quote', text: `“${n.text}”` }) : h('p', { class: 'entry-text', text: n.text });
    return h('div', { class: 'entry' },
      h('div', { class: 'entry-top' }, pageChip(n.page), h('span', { class: 'entry-date', text: fmtDate(n.updatedAt) }), h('span', { class: 'grow' }),
        iconBtn('pencil', 'Edit this ' + n.kind, () => { st.editing = n.id; refresh(); }),
        iconBtn('trash', 'Delete this ' + n.kind, async () => { if (await confirmDialog({ title: `Delete this ${n.kind}?`, message: 'This cannot be undone. It only exists on this device.', confirmLabel: 'Delete', danger: true })) local.deleteNote(n.id); })),
      text);
  }

  function editor(n) {
    const ta = h('textarea', { class: 'nb-textarea', 'aria-label': 'Edit text', maxlength: '5000', value: n.text, onKeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } } });
    const save = () => { local.updateNote(n.id, ta.value); st.editing = null; refresh(); };
    requestAnimationFrame(() => ta.focus());
    return h('div', { class: 'edit-box' }, ta, h('div', { class: 'edit-actions' },
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: () => { st.editing = null; refresh(); } }), h('button', { type: 'button', class: 'btn primary', text: 'Save', onClick: save })));
  }

  function drawForm() {
    const keep = form.querySelector('textarea');
    const typed = keep ? keep.value : '';
    clear(form);
    const page = getPage();
    formPage = page;
    if (st.tab === 'bookmarks') {
      const on = local.bookmarksFor(book.id).includes(page);
      add(form, h('button', { type: 'button', class: 'btn big' + (on ? '' : ' primary'), onClick: () => local.toggleBookmark(book.id, page) }, icon('bookmark', 16), on ? ` Remove bookmark from page ${page}` : ` Bookmark page ${page}`));
      return;
    }
    const kind = st.tab === 'quotes' ? 'quote' : 'note';
    const ta = h('textarea', { class: 'nb-textarea', placeholder: phone ? `${kind === 'quote' ? 'Quote' : 'Note'} on page ${page}…` : '', maxlength: '5000', rows: phone ? '1' : '3', 'aria-label': `${kind === 'quote' ? 'Quote' : 'Note'} on page ${page}`,
      onKeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } } });
    ta.value = typed;
    const save = () => {
      const text = ta.value;
      if (!text.trim()) { ta.focus(); return; }
      ta.value = '';
      local.addNote({ bookId: book.id, page: getPage(), kind, text });
    };
    const pick = kind === 'quote' ? h('button', { type: 'button', class: 'link-btn', text: 'Use selected text', onMousedown: (e) => e.preventDefault(), onClick: () => {
      const s = String(window.getSelection() || '').replace(/\s+/g, ' ').trim();
      if (s) ta.value = s.slice(0, 5000); else toast('Select some words on the page first.');
    } }) : null;
    if (phone) add(form, ...[h('div', { class: 'nb-row' }, ta, h('button', { type: 'button', class: 'btn primary save-sm', text: 'Save', onClick: save })), pick].filter(Boolean));
    else add(form, ...[h('label', { class: 'nb-label' }, `${kind === 'quote' ? 'Quote' : 'Note'} on page ${page}`, ta), pick,
      h('button', { type: 'button', class: 'btn primary', text: kind === 'quote' ? 'Save quote' : 'Save note', onClick: save }), h('p', { class: 'nb-hint', text: 'Ctrl+Enter also saves. Notes stay on this device only.' })].filter(Boolean));
  }

  refresh();
  return { el, refresh, setPage: () => { if (getPage() !== formPage) drawForm(); }, destroy: unsub };
}

// ---------- backup, export, restore (shared by menus and the Notebook app) ----------
export const titleOf = (id) => { const b = store.getBook(id); return b ? b.title : 'Removed book'; };

export function exportNotes() {
  downloadText('my-notes.txt', local.exportNotesTxt(titleOf));
  toast('Notes exported as a text file.');
}
export function backupNotes() {
  downloadText(`notebook-backup-${new Date().toISOString().slice(0, 10)}.json`, local.exportBackup(), 'application/json');
  toast('Backup saved. Keep it somewhere safe.');
}
export function restoreNotes() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('This file is too large to be a notebook backup (limit 5 MB).');
      const res = local.importBackup(await file.text());
      toast(`Backup restored. ${plural(res.notes, 'new note')} added.`);
    } catch (e) { toast(e.message, { error: true }); }
  });
  document.body.append(input);
  input.click();
}

// ---------- the Notebook app ----------
export function createNotebookApp({ phone = false } = {}) {
  const st = { tab: 'all' };
  const list = h('div', { class: 'nbapp-list' });
  const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Show' });
  const warn = !local.storageWorks() ? h('p', { class: 'nb-warn', role: 'alert', text: 'Saving is switched off in this browser, so your notes will be lost when you close this tab. Use “Back up” to keep a copy.' }) : null;
  const head = h('div', { class: 'nbapp-head' },
    h('p', { class: 'nb-sub', text: 'Your notes, quotes and bookmarks are saved only on this device. Back them up now and then.' }),
    h('div', { class: 'nbapp-actions' },
      h('button', { type: 'button', class: 'btn', onClick: exportNotes }, icon('download', 16), ' Export notes (.txt)'),
      h('button', { type: 'button', class: 'btn', onClick: backupNotes }, icon('download', 16), ' Back up (.json)'),
      h('button', { type: 'button', class: 'btn', onClick: restoreNotes }, icon('refresh', 16), ' Restore…')),
    warn, tabs);
  const el = h('div', { class: 'nbapp' + (phone ? ' phone' : '') }, head, list);
  const unsub = [local.subscribe(draw), store.subscribe(draw)];

  function draw() {
    clear(tabs);
    [['all', 'All'], ['note', 'Notes'], ['quote', 'Quotes'], ['marks', 'Bookmarks']].forEach(([k, label]) => add(tabs, h('button', { type: 'button', role: 'tab', 'aria-selected': String(st.tab === k), text: label, onClick: () => { st.tab = k; draw(); } })));
    clear(list);
    const ids = local.knownBookIds();
    const notes = local.allNotes();
    const marks = local.allBookmarks();
    let shown = 0;
    ids.sort((a, b) => (local.getProgress(b)?.at || 0) - (local.getProgress(a)?.at || 0)).forEach((id) => {
      const book = store.getBook(id);
      const mine = notes.filter((n) => n.bookId === id && (st.tab === 'all' || st.tab === n.kind)).sort((a, b) => a.page - b.page);
      const pages = st.tab === 'all' || st.tab === 'marks' ? marks[id] || [] : [];
      if (!mine.length && !pages.length) return;
      shown++;
      const open = (p) => book && router.go('reader', id, { p });
      add(list, h('section', { class: 'nb-book' },
        h('header', { class: 'nb-book-head' },
          h('div', {}, h('h3', { text: book ? book.title : 'This book was removed' }), book && book.titleLocal ? gu(book.titleLocal) : null),
          book ? h('button', { type: 'button', class: 'btn', text: 'Open', onClick: () => open(local.getProgress(id)?.page || 1) })
            : h('button', { type: 'button', class: 'btn danger', text: 'Delete these notes', onClick: async () => { if (await confirmDialog({ title: 'Delete notes for a removed book?', message: 'Its notes, quotes, bookmarks and reading position will be deleted from this device.', confirmLabel: 'Delete', danger: true })) local.removeBookData(id); } })),
        pages.length ? h('div', { class: 'chips' }, pages.map((p) => h('button', { type: 'button', class: 'page-chip', disabled: !book, 'aria-label': `Bookmark, page ${p}`, onClick: () => open(p) }, icon('bookmark', 12), ' p. ' + p))) : null,
        mine.map((n) => h('div', { class: 'nb-line' }, h('button', { type: 'button', class: 'page-chip', disabled: !book, text: 'p. ' + n.page, onClick: () => open(n.page) }),
          h('span', { class: n.kind === 'quote' ? 'entry-quote' : 'entry-text', text: n.kind === 'quote' ? `“${n.text}”` : n.text })))));
    });
    if (!shown) add(list, h('div', { class: 'empty' }, icon('notebook', 56), h('h3', { text: 'No notes yet.' }), h('p', { text: 'Open a book and write your first note in the notebook beside the page.' })));
  }

  draw();
  return { el, destroy: () => unsub.forEach((u) => u()) };
}

let nbWin = null;
export function openDesktop(wm) {
  if (!nbWin || !nbWin.isOpen) {
    let app;
    nbWin = wm.open('notebook', {
      title: 'Notebook', width: 760, height: 700,
      build: (w) => { app = createNotebookApp(); return h('div', { class: 'wcol' }, h('div', { class: 'wtoolbar', 'data-drag': '' }, w.dots(), h('h2', { class: 'wtitle', text: 'Notebook' })), app.el); },
      onClose: () => { app.destroy(); nbWin = null; if (router.current().name === 'notebook') router.go('home', '', {}, { replace: true }); },
    });
  } else { nbWin.restore(); nbWin.focus(); }
}
