// The Reader on phones: top bar, full-width page, swipe to turn, pinch to zoom, floating page pill, notebook bottom sheet.
import { h, clear, add, debounce } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import { icon } from './icons.js';
import { ReaderEngine } from './reader-engine.js';
import { createNotebookPanel } from './notebook.js';

const SHEET_PEEK = 236;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function readerScreen(route) {
  const book = store.getBook(route.id);
  const backToLibrary = () => {
    const f = book ? store.foldersOf(book)[0] : null;
    router.go('library', '', f ? { f: f.id } : {});
  };
  const backBtn = h('button', { type: 'button', class: 'mr-btn back', 'aria-label': 'Back to library', onClick: backToLibrary }, icon('chevL', 24));

  if (!book) {
    return { destroy() {}, el: h('div', { class: 'm-screen m-reader' }, h('header', { class: 'mr-top' }, backBtn),
      h('div', { class: 'empty' }, icon('books', 56), h('h3', { text: 'This book was not found.' }), h('p', { text: 'It may have been removed from the library, or the link is wrong.' }), h('button', { type: 'button', class: 'btn primary big', text: 'Go to the Library', onClick: () => router.go('library') }))) };
  }

  let engine, notebook, sheetH = SHEET_PEEK, findToken = 0, lastSavedPage = 0, drawnStatus = '';
  const prefs = () => local.prefs();

  // ---- top bar ----
  const titleEl = h('div', { class: 'mr-title', text: book.title });
  const subEl = h('div', { class: 'mr-sub' });
  const findBtn = h('button', { type: 'button', class: 'mr-btn', 'aria-label': 'Find in this book', onClick: toggleFind }, icon('search', 22));
  const nightBtn = h('button', { type: 'button', class: 'mr-btn', 'aria-label': 'Night mode', onClick: () => local.setPref('night', !prefs().night) }, icon('moon', 22));
  const markBtn = h('button', { type: 'button', class: 'mr-btn', 'aria-label': 'Bookmark this page', onClick: () => engine && engine.status === 'ready' && local.toggleBookmark(book.id, engine.page) }, icon('bookmark', 22));
  const progressFill = h('div', { class: 'progress-line-fill' });

  const findInput = h('input', { type: 'search', class: 'mr-find-input', placeholder: 'Find in this book', 'aria-label': 'Find in this book', onInput: debounce(() => runFind(), 250),
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (engine) engine.findStep(e.shiftKey ? -1 : 1); } } });
  const findStatus = h('span', { class: 'mr-find-status', role: 'status' });
  const findBar = h('div', { class: 'mr-findbar', hidden: true }, findInput, findStatus,
    h('button', { type: 'button', class: 'mr-btn small', 'aria-label': 'Previous match', onClick: () => engine && engine.findStep(-1) }, icon('chevUp', 20)),
    h('button', { type: 'button', class: 'mr-btn small', 'aria-label': 'Next match', onClick: () => engine && engine.findStep(1) }, icon('chevDown', 20)));

  // ---- page, pill, sheet ----
  const pageArea = h('div', { class: 'page-area m-page-area' });
  const status = h('div', { class: 'reader-status', role: 'status' });
  const prevBtn = h('button', { type: 'button', class: 'pill-btn', 'aria-label': 'Previous page', onClick: () => engine && engine.prev() }, icon('chevL', 20));
  const nextBtn = h('button', { type: 'button', class: 'pill-btn', 'aria-label': 'Next page', onClick: () => engine && engine.next() }, icon('chevR', 20));
  const pillText = h('span', { class: 'pill-text' });
  const pill = h('div', { class: 'mr-pill', role: 'group', 'aria-label': 'Page' }, prevBtn, pillText, nextBtn);
  const sheetBody = h('div', { class: 'sheet-body' });
  const grabber = h('button', { type: 'button', class: 'sheet-grab', 'aria-label': 'Resize notebook', onClick: () => setSheet(sheetH > SHEET_PEEK + 40 ? SHEET_PEEK : maxSheet()) }, h('span'));
  const sheet = h('section', { class: 'nb-sheet', 'aria-label': 'Notebook' }, grabber, sheetBody);
  const el = h('div', { class: 'm-screen m-reader' },
    h('header', { class: 'mr-top' }, backBtn, h('div', { class: 'mr-name' }, titleEl, subEl), findBtn, nightBtn, markBtn),
    h('div', { class: 'progress-line', role: 'progressbar', 'aria-label': 'Reading progress' }, progressFill), findBar,
    h('div', { class: 'reader-center' }, pageArea, status), pill, sheet);

  const maxSheet = () => Math.round(window.innerHeight * 0.88);
  function setSheet(px) {
    sheetH = clamp(px, SHEET_PEEK, maxSheet());
    sheet.style.height = sheetH + 'px';
    el.style.setProperty('--sheet-h', sheetH + 'px');
    pageArea.style.paddingBottom = sheetH + 'px';
    pill.hidden = sheetH > window.innerHeight * 0.6;
  }

  // sheet drag
  let drag = null;
  grabber.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, h: sheetH, moved: false }; grabber.setPointerCapture(e.pointerId); });
  grabber.addEventListener('pointermove', (e) => { if (!drag) return; const dy = drag.y - e.clientY; if (Math.abs(dy) > 4) drag.moved = true; if (drag.moved) { sheetH = clamp(drag.h + dy, SHEET_PEEK, maxSheet()); sheet.style.height = sheetH + 'px'; } });
  grabber.addEventListener('pointerup', () => { if (drag && drag.moved) { setSheet(sheetH > (SHEET_PEEK + maxSheet()) / 2 ? maxSheet() : SHEET_PEEK); } const was = drag; drag = null; if (was && was.moved) grabber.addEventListener('click', swallow, { once: true, capture: true }); });
  function swallow(e) { e.stopPropagation(); e.preventDefault(); }

  // ---- swipe to turn pages, pinch and double-tap to zoom ----
  let touch = null, pinch = null, lastTap = 0;
  pageArea.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = { d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s0: engine ? engine.scale : 1, f: 1 };
      touch = null;
    } else if (e.touches.length === 1 && !pinch) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  pageArea.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      pinch.f = clamp(Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d0, 0.5, 4);
      const wrap = pageArea.querySelector('.page-wrap');
      if (wrap) wrap.style.transform = `scale(${pinch.f})`;
    }
  }, { passive: false });
  pageArea.addEventListener('touchend', (e) => {
    if (pinch) {
      if (e.touches.length < 2) {
        const wrap = pageArea.querySelector('.page-wrap');
        if (wrap) wrap.style.transform = '';
        if (engine && Math.abs(pinch.f - 1) > 0.05) { engine.setZoom(pinch.s0 * pinch.f); local.setPref('zoom', engine.zoom); }
        pinch = null; touch = null;
      }
      return;
    }
    if (!touch || !engine || engine.status !== 'ready') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && engine.zoom === null) { if (dx < 0) engine.next(); else engine.prev(); }
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - touch.t < 250) {
      if (Date.now() - lastTap < 300) { engine.setZoom(engine.zoom === null ? engine.scale * 2 : null); local.setPref('zoom', engine.zoom); lastTap = 0; }
      else lastTap = Date.now();
    }
    touch = null;
  }, { passive: true });

  // ---- state → screen ----
  const saveProgress = debounce(() => { if (engine && engine.status === 'ready') local.setProgress(book.id, engine.page, engine.pages); }, 400);
  const unsub = local.subscribe(sync);

  function sync() {
    const ready = engine && engine.status === 'ready';
    const p = prefs();
    subEl.textContent = ready ? `Page ${engine.page} of ${engine.pages} · ${Math.round((engine.page / engine.pages) * 100)}%` : '';
    pillText.textContent = ready ? `${engine.page} / ${engine.pages}` : '';
    progressFill.style.width = ready ? (engine.page / engine.pages) * 100 + '%' : '0%';
    prevBtn.disabled = !ready || engine.page <= 1; nextBtn.disabled = !ready || engine.page >= engine.pages;
    pageArea.classList.toggle('night', p.night);
    nightBtn.classList.toggle('active', p.night); nightBtn.setAttribute('aria-pressed', String(p.night));
    const marked = ready && local.bookmarksFor(book.id).includes(engine.page);
    markBtn.classList.toggle('active', !!marked); markBtn.setAttribute('aria-pressed', String(!!marked));
    if (engine && engine.status === 'loading') drawStatus('loading');
    else if (engine && engine.status === 'error') drawStatus('error');
    else if (ready) status.hidden = true;
    if (ready) {
      if (notebook) notebook.setPage();
      if (engine.page !== lastSavedPage) { lastSavedPage = engine.page; router.setQuiet('reader', book.id, { p: engine.page }); saveProgress(); }
      if (engine.matches.length) findStatus.textContent = `${engine.matchIndex + 1}/${engine.matches.length}`;
    }
  }

  function drawStatus(kind) {
    const key = kind + (engine.error ? engine.error.kind : '');
    if (drawnStatus === key) { status.hidden = false; return; }
    drawnStatus = key;
    clear(status);
    if (kind === 'loading') add(status, h('div', { class: 'status-card' }, h('div', { class: 'spinner' }), h('p', { text: `Opening ${book.title}…` })));
    else add(status, h('div', { class: 'status-card' }, icon('openBook', 44), h('h3', { text: 'This book cannot be shown' }), h('p', { text: engine.error.message }),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn primary big', text: 'Try again', onClick: start }), h('a', { class: 'btn big', href: book.file, download: book.id + '.pdf', rel: 'noopener' }, icon('download', 16), ' Download instead'))));
    status.hidden = false;
  }

  function toggleFind() {
    findBar.hidden = !findBar.hidden;
    findBtn.classList.toggle('active', !findBar.hidden);
    if (!findBar.hidden) findInput.focus(); else { findInput.value = ''; runFind(); }
  }
  async function runFind() {
    if (!engine) return;
    const token = ++findToken;
    const q = findInput.value;
    findStatus.textContent = q.trim() ? '…' : '';
    const res = await engine.find(q);
    if (token !== findToken) return;
    findStatus.textContent = !q.trim() ? '' : res === 'noText' ? 'No searchable text' : res === 'none' ? 'No matches' : `${engine.matchIndex + 1}/${engine.matches.length}`;
  }

  function start() {
    drawnStatus = ''; lastSavedPage = 0;
    if (engine) engine.destroy();
    const saved = local.getProgress(book.id);
    const page = parseInt(route.params.p, 10) || (saved ? saved.page : 1);
    engine = new ReaderEngine({ host: pageArea, phone: true, padding: 28, onChange: sync });
    engine.open(book, page, prefs().zoom).then(() => {
      if (route.params.find && engine && engine.status === 'ready') { findBar.hidden = false; findBtn.classList.add('active'); findInput.value = route.params.find; runFind(); }
    });
    sync();
  }

  notebook = createNotebookPanel({ book, getPage: () => (engine ? engine.page : 1), goToPage: (n) => engine && engine.goTo(n), tabs: ['notes', 'quotes'], phone: true });
  add(sheetBody, notebook.el);

  return {
    el,
    afterMount() { setSheet(SHEET_PEEK); start(); },
    destroy() { findToken++; unsub(); if (engine) engine.destroy(); if (notebook) notebook.destroy(); },
  };
}
