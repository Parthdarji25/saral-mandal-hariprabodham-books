// The Reader (desktop window): thumbnails, page, notebook, find, zoom, night mode, full screen.
import { h, clear, plural, debounce, add } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import { icon } from './icons.js';
import { ReaderEngine } from './reader-engine.js';
import { createNotebookPanel } from './notebook.js';
import { toast } from './dialogs.js';

let win = null;
let view = null;

export function openDesktop(wm, route) {
  const page = parseInt(route.params.p, 10) || 0;
  const find = route.params.find || '';
  if (!win || !win.isOpen) {
    win = wm.open('reader', {
      title: 'Reader',
      build: (w) => { view = createReaderView(w, wm); return view.el; },
      onClose: () => { view.destroy(); view = null; win = null; if (router.current().name === 'reader') router.go('home', '', {}, { replace: true }); },
    });
  } else { win.restore(); win.focus(); }
  view.load(route.id, page, find);
}

function createReaderView(w, wm) {
  let book = null, engine = null, notebook = null, findToken = 0, lastSavedPage = 0;
  const prefs = () => local.prefs();

  // ---- toolbar ----
  const titleEl = h('div', { class: 'rd-title' });
  const subEl = h('div', { class: 'rd-sub' });
  const pageInput = h('input', { type: 'text', inputmode: 'numeric', class: 'input page-input', 'aria-label': 'Page number',
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const n = parseInt(pageInput.value, 10); if (engine && n) engine.goTo(n); sync(); pageInput.blur(); } e.stopPropagation(); },
    onBlur: () => sync() });
  const ofEl = h('span', { class: 'of-text' });
  const zoomEl = h('span', { class: 'zoom-text', 'aria-live': 'polite' });
  const findInput = h('input', { type: 'search', class: 'input find-input', placeholder: 'Find in this book', 'aria-label': 'Find in this book',
    onInput: debounce(() => runFind(), 250),
    onKeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); if (engine) engine.findStep(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { findInput.value = ''; runFind(); findInput.blur(); } } });
  const findStatus = h('span', { class: 'find-status', role: 'status' });
  const nightBtn = h('button', { type: 'button', class: 'btn icon', title: 'Night mode', 'aria-label': 'Night mode', onClick: () => local.setPref('night', !prefs().night) }, icon('moon', 17));
  const nbBtn = h('button', { type: 'button', class: 'btn', onClick: () => local.setPref('notebookOpen', !prefs().notebookOpen) }, icon('notebook', 16), ' Notebook');
  const dlLink = h('a', { class: 'btn icon', title: 'Download', 'aria-label': 'Download PDF', rel: 'noopener' }, icon('download', 17));
  const fsBtn = h('button', { type: 'button', class: 'btn icon', title: 'Full screen', 'aria-label': 'Full screen', onClick: toggleFull }, icon('fullscreen', 17));
  const prevBtn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Previous page', title: 'Previous page', onClick: () => engine && engine.prev() }, icon('chevL', 17));
  const nextBtn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Next page', title: 'Next page', onClick: () => engine && engine.next() }, icon('chevR', 17));
  const zoomOut = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Zoom out', title: 'Zoom out', onClick: () => zoomStep(-1) }, icon('minus', 17));
  const zoomIn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Zoom in', title: 'Zoom in', onClick: () => zoomStep(1) }, icon('plus', 17));
  const fitBtn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Fit width', title: 'Fit width', onClick: () => { if (engine) { engine.fitWidth(); local.setPref('zoom', null); } } }, icon('fitWidth', 17));
  const backBtn = h('button', { type: 'button', class: 'btn', onClick: backToLibrary }, icon('chevL', 16), ' Library');

  const toolbar = h('div', { class: 'wtoolbar rd-toolbar', 'data-drag': '' }, w.dots(), backBtn,
    h('div', { class: 'rd-name' }, titleEl, subEl),
    h('div', { class: 'tb-group' }, prevBtn, pageInput, ofEl, nextBtn),
    h('div', { class: 'tb-group' }, zoomOut, zoomEl, zoomIn, fitBtn),
    h('div', { class: 'find-box' }, findInput, findStatus),
    nightBtn, nbBtn, dlLink, fsBtn);

  // ---- body ----
  const progressFill = h('div', { class: 'progress-line-fill' });
  const thumbs = h('aside', { class: 'thumbs', 'aria-label': 'Page thumbnails' });
  const pageArea = h('div', { class: 'page-area', tabindex: '-1' });
  const status = h('div', { class: 'reader-status', role: 'status' });
  const center = h('div', { class: 'reader-center' }, pageArea, status);
  const nbSide = h('aside', { class: 'nb-side', 'aria-label': 'Notebook' });
  const el = h('div', { class: 'wcol reader' }, toolbar, h('div', { class: 'progress-line', role: 'progressbar', 'aria-label': 'Reading progress' }, progressFill), h('div', { class: 'reader-body' }, thumbs, center, nbSide));

  const unsubs = [local.subscribe(sync)];
  const saveProgress = debounce(() => { if (engine && engine.status === 'ready' && book) local.setProgress(book.id, engine.page, engine.pages); }, 400);

  // ---- loading a book ----
  function load(bookId, page, find) {
    if (book && book.id === bookId && engine) {
      if (page) engine.goTo(page);
      if (find) { findInput.value = find; runFind(); }
      return;
    }
    teardown();
    lastSavedPage = 0;
    book = store.getBook(bookId);
    if (!book) { showMissing(); return; }
    const saved = local.getProgress(book.id);
    const start = page || (saved ? saved.page : 1);
    titleEl.textContent = book.title;
    titleEl.title = book.title;
    dlLink.href = book.file; dlLink.setAttribute('download', book.id + '.pdf');
    w.el.setAttribute('aria-label', 'Reader: ' + book.title);
    engine = new ReaderEngine({ host: pageArea, padding: 52, onChange: sync });
    notebook = createNotebookPanel({ book, getPage: () => (engine ? engine.page : 1), goToPage: (n) => engine && engine.goTo(n) });
    add(clear(nbSide), notebook.el);
    findInput.value = find || '';
    engine.open(book, start, prefs().zoom).then(() => {
      if (!engine || engine.status !== 'ready') return;
      engine.buildThumbs(thumbs, (n) => engine.goTo(n));
      if (find) runFind();
      // keep the saved total in step if the PDF was replaced with a different length
      sync();
    });
    sync();
  }

  function teardown() {
    findToken++;
    if (engine) { engine.destroy(); engine = null; }
    if (notebook) { notebook.destroy(); notebook = null; }
    clear(thumbs); clear(nbSide);
  }

  function showMissing() {
    titleEl.textContent = 'Book not found'; subEl.textContent = '';
    add(clear(status), h('div', { class: 'empty' }, icon('books', 56), h('h3', { text: 'This book was not found.' }), h('p', { text: 'It may have been removed from the library, or the link is wrong.' }),
      h('button', { type: 'button', class: 'btn primary big', text: 'Go to the Library', onClick: () => router.go('library') })));
    status.hidden = false;
    sync();
  }

  // ---- state → screen ----
  function sync() {
    const p = prefs();
    const ready = engine && engine.status === 'ready';
    const folder = book ? store.foldersOf(book)[0] : null;
    if (book) subEl.textContent = [folder ? folder.name : '', engine && engine.pages ? plural(engine.pages, 'page') : ''].filter(Boolean).join(' · ');
    if (document.activeElement !== pageInput) pageInput.value = ready ? String(engine.page) : '';
    ofEl.textContent = ready ? 'of ' + engine.pages : '';
    zoomEl.textContent = ready ? Math.round(engine.scale * 100) + '%' : '';
    progressFill.style.width = ready ? (engine.page / engine.pages) * 100 + '%' : '0%';
    [prevBtn, nextBtn, zoomIn, zoomOut, fitBtn, pageInput, findInput].forEach((b) => { b.disabled = !ready; });
    prevBtn.disabled = !ready || engine.page <= 1; nextBtn.disabled = !ready || engine.page >= engine.pages;
    pageArea.classList.toggle('night', p.night);
    nightBtn.classList.toggle('dark', p.night); nightBtn.setAttribute('aria-pressed', String(p.night));
    nbBtn.classList.toggle('dark', p.notebookOpen); nbBtn.setAttribute('aria-pressed', String(p.notebookOpen));
    nbSide.hidden = !p.notebookOpen;
    if (engine && engine.status === 'loading') drawStatus('loading');
    else if (engine && engine.status === 'error') drawStatus('error');
    else if (ready) { status.hidden = true; }
    if (ready) {
      if (engine.thumbs) engine.thumbs.mark(engine.page);
      if (notebook) notebook.setPage();
      if (engine.page !== lastSavedPage) { lastSavedPage = engine.page; router.setQuiet('reader', book.id, { p: engine.page }); saveProgress(); }
      const fr = engine.matches.length ? `${engine.matchIndex + 1} of ${plural(engine.matches.length, 'page')}` : '';
      if (fr) findStatus.textContent = fr;
    }
  }

  let drawnStatus = '';
  function drawStatus(kind) {
    const key = kind + (engine.error ? engine.error.kind : '');
    if (drawnStatus === key) { status.hidden = false; return; }
    drawnStatus = key;
    clear(status);
    if (kind === 'loading') add(status, h('div', { class: 'status-card' }, h('div', { class: 'spinner' }), h('p', { text: `Opening ${book.title}…` })));
    else add(status, h('div', { class: 'status-card' }, icon('openBook', 44), h('h3', { text: 'This book cannot be shown' }), h('p', { text: engine.error.message }),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn primary', text: 'Try again', onClick: () => { const b = book; book = null; drawnStatus = ''; load(b.id, engine ? engine.page : 0, ''); } }),
        h('a', { class: 'btn', href: book.file, download: book.id + '.pdf', rel: 'noopener' }, icon('download', 16), ' Download instead'))));
    status.hidden = false;
  }

  async function runFind() {
    if (!engine) return;
    const token = ++findToken;
    const q = findInput.value;
    findStatus.textContent = q.trim() ? 'Searching…' : '';
    const res = await engine.find(q);
    if (token !== findToken) return;
    if (!q.trim()) findStatus.textContent = '';
    else if (res === 'noText') findStatus.textContent = 'This book has no searchable text';
    else if (res === 'none') findStatus.textContent = 'No matches';
    else findStatus.textContent = `${engine.matchIndex + 1} of ${plural(engine.matches.length, 'page')}`;
  }

  function zoomStep(dir) { if (!engine) return; engine.zoomBy(dir); local.setPref('zoom', engine.zoom); }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (w.el.requestFullscreen) w.el.requestFullscreen().catch(() => toast('Full screen is not available here.'));
    else toast('Full screen is not available in this browser.');
  }
  function backToLibrary() {
    const folder = book ? store.foldersOf(book)[0] : null;
    router.go('library', '', { f: folder ? folder.id : '', sel: book ? book.id : '' });
  }

  // ---- keyboard ----
  const isTop = () => wm.topWindow() === w && !document.querySelector('#layer-dialogs .overlay, .spot-overlay');
  const onKey = (e) => {
    if (!isTop() || !engine || engine.status !== 'ready') return;
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); findInput.focus(); findInput.select(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); engine.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); engine.prev(); }
    else if (e.key === 'Home') { e.preventDefault(); engine.goTo(1); }
    else if (e.key === 'End') { e.preventDefault(); engine.goTo(engine.pages); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomStep(-1); }
  };
  document.addEventListener('keydown', onKey);
  const onCmd = (e) => {
    if (!engine) return;
    const c = e.detail;
    if (c === 'find') { findInput.focus(); findInput.select(); }
    else if (c === 'zoomIn') zoomStep(1);
    else if (c === 'zoomOut') zoomStep(-1);
    else if (c === 'fit') { engine.fitWidth(); local.setPref('zoom', null); }
  };
  document.addEventListener('smh:reader-cmd', onCmd);

  return {
    el, load,
    destroy() {
      teardown();
      unsubs.forEach((u) => u());
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('smh:reader-cmd', onCmd);
      if (document.fullscreenElement) document.exitFullscreen();
    },
  };
}
