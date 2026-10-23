// "Search everything" (desktop): / or Ctrl/⌘+K. Grouped results with a preview, keyboard driven.
import { h, clear, gu, plural, fmtBytes, trapFocus, debounce, add } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import * as search from '../search.js';
import { icon, folderIcon } from './icons.js';

const FILTERS = search.FILTERS;
let current = null;

export function open({ q = '', onClose } = {}) {
  if (current) { current.setQuery(q); return; }
  current = createSpotlight(q, onClose);
}
export function setQuery(q) { if (current) current.setQuery(q); }
export function close() { if (current) current.close(); }

function createSpotlight(initialQuery, onClose) {
  const st = { q: '', filter: 'all', sel: 0, items: [], inside: [], indexing: null, runId: 0 };
  const input = h('input', { type: 'text', class: 'spot-input', placeholder: 'Search in English or ગુજરાતી', 'aria-label': 'Search everything', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'spot-list', autocomplete: 'off', spellcheck: 'false' });
  const countEl = h('span', { class: 'spot-count' });
  const chips = h('div', { class: 'spot-chips', role: 'tablist', 'aria-label': 'Search in' });
  const list = h('div', { class: 'spot-list', id: 'spot-list', role: 'listbox', 'aria-label': 'Results' });
  const preview = h('aside', { class: 'spot-preview', 'aria-label': 'Preview' });
  const footer = h('div', { class: 'spot-footer' }, h('span', { text: '↑ ↓ move · Enter open · Esc close' }), h('span', { text: 'Searches titles, authors, folders, topics, words inside PDFs and your notes' }));
  const panel = h('div', { class: 'spot-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search everything' },
    h('div', { class: 'spot-input-row' }, icon('search', 26), input, countEl), chips, h('div', { class: 'spot-body' }, list, preview), footer);
  const overlay = h('div', { class: 'spot-overlay', onPointerdown: (e) => { if (e.target === overlay) close(); } }, panel);
  document.getElementById('app').append(overlay);
  const release = trapFocus(panel, close);

  function close() {
    if (!current) return;
    st.runId++;
    release();
    overlay.remove();
    current = null;
    onClose && onClose();
  }

  const pushUrl = debounce(() => router.go('search', '', { q: st.q }, { replace: true }), 300);

  function setQuery(q) {
    if (q === input.value && st.q === q) return;
    input.value = q;
    run(q);
  }

  input.addEventListener('input', () => { run(input.value); pushUrl(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = st.items[st.sel]; if (it) activate(it); }
  });

  // ----- searching -----
  function run(q) {
    st.q = q;
    st.sel = 0;
    st.runId++;
    const id = st.runId;
    const ws = search.words(q);
    st.inside = ws.length ? search.insideFromIndex(q) : [];
    st.indexing = null;
    build();
    if (ws.length && st.filter === 'inside') runInside(q, id);
  }

  async function runInside(q, id) {
    if (!store.allBooks().length) { build(); return; }
    st.indexing = { done: 0, total: store.allBooks().length };
    build();
    await search.searchInside(q, (done, total, results) => {
      if (id !== st.runId) return;
      st.indexing = { done, total };
      st.inside = results;
      build(true);
    }, () => id !== st.runId);
    if (id === st.runId) { st.indexing = null; build(true); }
  }

  function setFilter(f) {
    st.filter = f; st.sel = 0;
    run(input.value);
    input.focus();
  }

  // ----- results model -----
  const model = () => search.groupedResults(st.q, st.filter, st.inside);

  function recentSuggestions() {
    const books = local.recentIds().map(store.getBook).filter(Boolean).slice(0, 5);
    return books.map((book) => ({ kind: 'book', id: 'b-' + book.id, book, title: book.title, local: book.titleLocal, sub: 'Recently read', page: local.getProgress(book.id).page }));
  }

  // ----- drawing -----
  function swatch(it) {
    if (it.kind === 'book') return h('span', { class: 'sw cover-sw', style: { '--c': it.book.color } });
    if (it.kind === 'folder') return h('span', { class: 'sw plain' }, folderIcon(it.folder.color, 30));
    if (it.kind === 'topic') return h('span', { class: 'sw topic-sw', style: { '--c': it.topic.color } });
    return h('span', { class: 'sw text-sw', text: it.kind === 'note' ? '✎' : 'Aa' });
  }

  function build(keepScroll = false) {
    const ws = search.words(st.q);
    const m = ws.length ? model() : null;
    const flat = [];
    clear(list);
    if (!ws.length) {
      const rec = recentSuggestions();
      if (rec.length) { add(list, h('div', { class: 'group-label', text: 'Recently read' })); rec.forEach((it) => { flat.push(it); add(list, row(it, flat.length - 1)); }); }
      else add(list, h('div', { class: 'empty small' }, icon('search', 40), h('p', { text: 'Type a title, an author, a folder or a word. English or ગુજરાતી.' })));
    } else {
      if (st.indexing) add(list, h('div', { class: 'indexing', role: 'status' }, h('span', { class: 'spinner small' }), ` Reading inside books… ${st.indexing.done} of ${st.indexing.total}`));
      m.groups.forEach((g) => {
        add(list, h('div', { class: 'group-label', text: g.label }));
        g.items.forEach((it) => { flat.push(it); add(list, row(it, flat.length - 1)); });
      });
      if (!flat.length && !st.indexing) add(list, emptyResults());
      if (st.filter === 'inside' && !st.indexing) {
        const scanned = search.unsearchableBooks();
        if (scanned.length) add(list, h('p', { class: 'scan-note', text: `${plural(scanned.length, 'book')} ${scanned.length === 1 ? 'has' : 'have'} no searchable text (scanned pages): ${scanned.slice(0, 3).map((b) => b.title).join(', ')}${scanned.length > 3 ? '…' : ''}` }));
      } else if (st.filter === 'all' && !st.inside.length) add(list, h('p', { class: 'scan-note', text: 'To search the words inside PDFs, choose “Inside books”.' }));
    }
    st.items = flat;
    st.sel = Math.min(st.sel, Math.max(0, flat.length - 1));
    countEl.textContent = m ? plural(m.counts.all, 'result') : '';
    drawChips(m ? m.counts : null);
    markSelected(!keepScroll);
    drawPreview();
  }

  function emptyResults() {
    const text = st.filter === 'inside' ? (store.allBooks().length ? 'No book has those words inside.' : 'Add books to search inside them.') : 'Nothing found.';
    return h('div', { class: 'empty small' }, icon('search', 40), h('h3', { text }), h('p', { text: 'Try fewer or different words. You can type in English or ગુજરાતી.' }));
  }

  function row(it, index) {
    return h('button', { type: 'button', class: 'spot-row', id: 'spot-r' + index, role: 'option', 'data-i': index, onClick: () => activate(it), onMousemove: () => { if (st.sel !== index) { st.sel = index; markSelected(false); drawPreview(); } } },
      swatch(it),
      h('span', { class: 'spot-text' },
        h('span', { class: 'spot-title' }, h('span', { text: it.title }), it.local ? [' ', gu(it.local, 'spot-gu')] : null),
        h('span', { class: 'spot-sub', text: it.sub })),
      it.page ? h('span', { class: 'spot-page', text: 'p. ' + it.page }) : null);
  }

  function drawChips(counts) {
    clear(chips);
    FILTERS.forEach(([key, label]) => {
      const n = counts && key !== 'all' ? ' · ' + counts[key] : '';
      add(chips, h('button', { type: 'button', role: 'tab', class: 'spot-chip', 'aria-selected': String(st.filter === key), text: label + n, onClick: () => setFilter(key) }));
    });
  }

  function markSelected(scroll) {
    list.querySelectorAll('.spot-row').forEach((r) => { const on = +r.dataset.i === st.sel; r.classList.toggle('selected', on); r.setAttribute('aria-selected', String(on)); if (on && scroll) r.scrollIntoView({ block: 'nearest' }); });
    input.setAttribute('aria-activedescendant', st.items.length ? 'spot-r' + st.sel : '');
  }

  function move(d) {
    if (!st.items.length) return;
    st.sel = (st.sel + d + st.items.length) % st.items.length;
    markSelected(true); drawPreview();
  }

  function bigCover(book) {
    return h('div', { class: 'big-cover', style: { '--c': book.color } }, h('span', { class: 'big-cover-title', text: book.title }));
  }

  function drawPreview() {
    clear(preview);
    const it = st.items[st.sel];
    if (!it) { add(preview, h('p', { class: 'preview-empty', text: 'Select a result to see a preview.' })); return; }
    const openBtn = (label, fn) => h('button', { type: 'button', class: 'btn primary big', text: label, onClick: fn });
    const showIn = (book) => h('button', { type: 'button', class: 'btn big', text: 'Show in Library', onClick: () => showInLibrary(book) });
    if (it.kind === 'book' || it.kind === 'inside' || it.kind === 'note') {
      const b = it.book;
      if (!b) { add(preview, h('p', { class: 'preview-empty', text: 'This book was removed from the library.' })); return; }
      const prog = local.getProgress(b.id);
      const folders = store.foldersOf(b).map((f) => f.name).join(', ');
      const page = it.page || (prog && prog.page) || 1;
      add(preview, bigCover(b), h('h3', { class: 'pv-title', text: b.title }), b.titleLocal ? gu(b.titleLocal, 'pv-gu') : null,
        h('p', { class: 'pv-meta', text: [b.author, b.tradition, b.pages ? plural(b.pages, 'page') : '', b.sizeBytes ? fmtBytes(b.sizeBytes) : ''].filter(Boolean).join(' · ') }),
        h('p', { class: 'pv-meta', text: `${folders ? 'In: ' + folders + '. ' : ''}${prog ? 'You stopped on page ' + prog.page + '.' : ''}` }));
      if (it.kind === 'note') add(preview, h('blockquote', { class: 'pv-note', text: it.note.text }));
      if (it.kind === 'inside') add(preview, h('div', { class: 'chips' }, it.pages.slice(0, 12).map((p) => h('button', { type: 'button', class: 'chip as-btn', text: `p. ${p.page}`, onClick: () => openBook(b, p.page, st.q) }))));
      add(preview, h('div', { class: 'info-actions' }, openBtn(`Open at page ${page}`, () => activate(it)), showIn(b)));
    } else if (it.kind === 'folder') {
      const c = store.folderCounts(it.folder.id);
      add(preview, h('div', { class: 'info-hero' }, folderIcon(it.folder.color, 110)), h('h3', { class: 'pv-title', text: it.folder.name }), it.folder.nameLocal ? gu(it.folder.nameLocal, 'pv-gu') : null,
        h('p', { class: 'pv-meta', text: `${plural(c.folders, 'folder')} · ${plural(c.books, 'book')}` }), h('div', { class: 'info-actions' }, openBtn('Open folder', () => activate(it))));
    } else if (it.kind === 'topic') {
      add(preview, h('div', { class: 'info-hero' }, h('span', { class: 'dot-color huge', style: { '--c': it.topic.color } })), h('h3', { class: 'pv-title', text: it.topic.name }), it.topic.nameLocal ? gu(it.topic.nameLocal, 'pv-gu') : null,
        h('p', { class: 'pv-meta', text: plural(store.booksInTopic(it.topic.id).length, 'book') }), h('div', { class: 'info-actions' }, openBtn('Show books', () => activate(it))));
    }
  }

  // ----- actions -----
  function openBook(book, page, find) {
    router.go('reader', book.id, { p: page || '', find: find || '' });
    close();
  }
  function showInLibrary(book) {
    const f = store.foldersOf(book)[0];
    router.go('library', '', { f: f ? f.id : '', sel: book.id });
    close();
  }
  function activate(it) {
    if (it.kind === 'book') openBook(it.book, it.page);
    else if (it.kind === 'inside') openBook(it.book, it.page, st.q);
    else if (it.kind === 'note') { if (it.book) openBook(it.book, it.note.page); }
    else if (it.kind === 'folder') { router.go('library', '', { f: it.folder.id }); close(); }
    else if (it.kind === 'topic') { router.go('library', '', { t: it.topic.id }); close(); }
  }

  const api = { setQuery, close };
  input.value = initialQuery;
  run(initialQuery);
  return api;
}
