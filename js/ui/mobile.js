// Phone layout (≤ 768px): lock, home, library, topics, search, notebook and reader screens with a tab bar.
import { h, clear, add, gu, plural, LETTERS, debounce } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import * as auth from '../admin/auth.js';
import * as search from '../search.js';
import { icon, folderIcon, appTile, APPS, cover } from './icons.js';
import { createLock, shouldShowLock, liveClock, clockTime } from './lock.js';
import { actionSheet, toast } from './dialogs.js';
import { createNotebookApp, exportNotes, backupNotes, restoreNotes } from './notebook.js';

const admin = () => import('../admin/admin.js');
const TABS = [['home', 'Home', 'home'], ['library', 'Library', 'books'], ['search', 'Search', 'search'], ['notebook', 'Notebook', 'notebook']];

export function mountPhone(root) {
  const host = h('div', { class: 'm-screens' });
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' });
  const clockEl = h('span', { class: 'sb-clock' });
  const statusbar = h('header', { class: 'm-statusbar on-dark' },
    h('span', { class: 'sb-logo', 'aria-hidden': 'true' }, icon('lotus', 20)),
    h('span', { class: 'sb-name', text: store.settings().siteName }),
    clockEl,
    h('button', { type: 'button', class: 'sb-menu', 'aria-label': 'Menu', onClick: openMenu }, icon('more', 22)));
  const stopClock = liveClock(() => { clockEl.textContent = clockTime(); });
  const phone = h('div', { class: 'phone-shell' }, host, tabbar, statusbar);
  root.append(phone);
  let screen = null;
  let lockEl = null;
  let current = { name: 'home', id: '', params: {} };

  // ---------- helpers ----------
  const goBook = (id, page, find) => router.go('reader', id, { p: page || '', find: find || '' });
  const lastRead = () => {
    const book = local.recentIds().map(store.getBook).find(Boolean);
    return book ? { book, progress: local.getProgress(book.id) } : null;
  };
  const isAdmin = () => auth.isAdmin();

  function showLock(force) {
    if (lockEl || (!force && !shouldShowLock())) return;
    const lock = createLock({ phone: true, onOpen: () => { lockEl = null; root.classList.remove('is-locked'); }, onContinueBook: (id, page) => goBook(id, page) });
    lockEl = lock.el;
    root.classList.add('is-locked');
    root.append(lockEl);
  }

  function openApp(name) {
    if (name === 'library') router.go('library');
    else if (name === 'search') router.go('search');
    else if (name === 'topics') router.go('topics');
    else if (name === 'recent') router.go('recent');
    else if (name === 'notebook') router.go('notebook');
    else if (name === 'admin') router.go(router.ADMIN_ROUTE);
    else if (name === 'lock') showLock(true);
    else if (name === 'reader') {
      const last = lastRead();
      if (last) goBook(last.book.id, last.progress.page);
      else toast('Pick a book in the Library and it will open here.');
    }
  }

  /** The phone version of the desktop File / Edit / View / Go menus. */
  function openMenu() {
    const prefs = local.prefs();
    actionSheet({ title: store.settings().siteName, subtitle: 'Menu', actions: [
      { label: 'Go: Library', run: () => router.go('library') },
      { label: 'Go: Recently read', run: () => router.go('recent') },
      { label: 'Go: Search', run: () => router.go('search') },
      { label: 'Go: Notebook', run: () => router.go('notebook') },
      { label: 'View: Night mode in the reader ' + (prefs.night ? '(on)' : '(off)'), run: () => local.setPref('night', !prefs.night) },
      { label: 'File: Lock screen', run: () => showLock(true) },
      { label: 'Edit: Export my notes (.txt)', run: exportNotes },
      { label: 'Edit: Back up notebook (.json)', run: backupNotes },
      { label: 'Edit: Restore notebook…', run: restoreNotes },
      { label: 'Help: Your notes stay only on this device', run: () => toast('Notes, quotes and bookmarks are saved only in this browser. Back them up from this menu.', { ms: 8000 }) },
    ] });
  }

  function renderTabs(active) {
    clear(tabbar);
    tabbar.hidden = !active;
    if (!active) return;
    TABS.forEach(([key, label, glyph]) => add(tabbar, h('button', { type: 'button', class: 'tab' + (active === key ? ' active' : ''), 'aria-current': active === key ? 'page' : null, onClick: () => router.go(key === 'home' ? 'home' : key) },
      icon(glyph, 24), h('span', { text: label }))));
  }

  // ---------- routing ----------
  async function handleRoute(route) {
    current = route;
    if (screen) { screen.destroy(); screen = null; }
    clear(host);
    let built, tab = null;
    switch (route.name) {
      case 'library': built = libraryScreen(route.params); tab = 'library'; break;
      case 'recent': built = libraryScreen({ recent: '1' }); tab = 'library'; break;
      case 'topics': built = topicsScreen(); tab = 'library'; break;
      case 'search': built = searchScreen(route.params.q || ''); tab = 'search'; break;
      case 'notebook': built = notebookScreen(); tab = 'notebook'; break;
      case 'reader': built = (await import('./reader-mobile.js')).readerScreen(route); tab = null; break;
      case router.ADMIN_ROUTE: auth.reveal(); built = (await import('../admin/admin.js')).phonePanel(); tab = 'home'; break;
      default: built = homeScreen(); tab = null;
    }
    if (current !== route) return; // a newer navigation won the race
    screen = built;
    host.append(built.el);
    host.classList.toggle('has-tabs', !!tab);
    renderTabs(tab);
    if (built.afterMount) built.afterMount();
  }

  // ---------- Home ----------
  function homeScreen() {
    const last = lastRead();
    const tiles = ['topics', 'recent', 'lock', ...(isAdmin() ? ['admin'] : [])]; // Library, Search, Reader and Notebook are in the dock below
    const el = h('div', { class: 'm-screen m-home on-dark' },
      h('button', { type: 'button', class: 'home-search', onClick: () => router.go('search') }, icon('search', 20), h('span', { text: 'Search books, folders, words…' })),
      last && last.progress ? continueWidget(last) : null,
      h('div', { class: 'home-grid' }, tiles.map((t) => h('button', { type: 'button', class: 'home-tile', onClick: () => openApp(t) }, appTile(t, 64), h('span', { text: APPS[t].label })))),
      h('div', { class: 'home-dock' }, ['library', 'search', 'reader', 'notebook'].map((t) => h('button', { type: 'button', class: 'dock-tile', 'aria-label': APPS[t].label, onClick: () => openApp(t) }, appTile(t, 62)))));
    return { el, destroy() {} };
  }

  function continueWidget({ book, progress }) {
    const pages = progress.pages || book.pages;
    return h('button', { type: 'button', class: 'home-widget', onClick: () => goBook(book.id, progress.page) },
      cover(book.color, 46, 62),
      h('span', { class: 'hw-text' },
        h('span', { class: 'label-caps', text: 'Continue reading' }),
        h('span', { class: 'hw-title', text: book.title }),
        h('span', { class: 'hw-sub', text: `Page ${progress.page}${pages ? ' of ' + pages : ''}` }),
        h('span', { class: 'progress-track slim' }, h('span', { class: 'progress-fill', style: { width: pages ? Math.min(100, (progress.page / pages) * 100) + '%' : '0%' } }))));
  }

  // ---------- Library ----------
  function libraryScreen(params) {
    const st = { f: params.f || '', t: params.t || '', recent: !!params.recent, letter: '', q: '' };
    const pl = () => store.place({ f: st.f, t: st.t, recent: st.recent }, local.recentIds());
    const content = h('div', { class: 'm-content' });
    const strip = h('nav', { class: 'az-strip', 'aria-label': 'A to Z index' });
    const header = h('header', { class: 'm-header' });
    const searchInput = h('input', { type: 'search', class: 'm-search', placeholder: 'Search in English or ગુજરાતી', 'aria-label': 'Search this list',
      onInput: debounce((e) => { st.q = e.target.value; drawBody(); }, 120) });
    const el = h('div', { class: 'm-screen m-library' }, header, content, strip);
    drawHeader(); drawBody();

    function goTo(p) { router.go('library', '', p); }

    function drawHeader() {
      const place = pl();
      const inFolder = place.kind === 'folder' && place.folder;
      const parent = inFolder && place.folder.parentId ? store.getFolder(place.folder.parentId) : null;
      const row = h('div', { class: 'm-toprow' },
        inFolder ? h('button', { type: 'button', class: 'm-back', onClick: () => goTo(parent ? { f: parent.id } : {}) }, icon('chevL', 20), h('span', { text: parent ? parent.name : 'Library' })) : h('span'),
        h('span', { class: 'grow' }),
        inFolder ? h('button', { type: 'button', class: 'm-iconbtn', 'aria-label': 'Folder actions', onClick: () => folderActions(place.folder) }, icon('more', 22)) : null,
        isAdmin() && (place.kind === 'all' || inFolder) ? h('button', { type: 'button', class: 'm-iconbtn accent', 'aria-label': 'New folder', onClick: async () => (await admin()).newFolder(st.f || null) }, icon('folderPlus', 22)) : null);
      const chips = h('div', { class: 'topic-row', role: 'group', 'aria-label': 'Topics' },
        isAdmin() ? h('button', { type: 'button', class: 'topic-chip new', onClick: async () => (await admin()).newTopic() }, '+ New topic') : null,
        store.allTopics().map((t) => h('button', { type: 'button', class: 'topic-chip' + (st.t === t.id ? ' active' : ''), 'aria-pressed': String(st.t === t.id), onClick: () => goTo(st.t === t.id ? {} : { t: t.id }) },
          h('i', { style: { '--c': t.color } }), t.name)));
      clear(header);
      add(header, row, h('h1', { class: 'm-title', text: place.title, lang: 'en' }), searchInput, store.allTopics().length || isAdmin() ? chips : null);
    }

    function folderActions(f) {
      const c = store.folderCounts(f.id);
      actionSheet({ title: f.name, subtitle: `${plural(c.folders, 'folder')} · ${plural(c.books, 'book')}`, actions: [
        { label: 'Open folder', run: () => goTo({ f: f.id }) },
        ...(isAdmin() ? [{ label: 'Rename', run: async () => (await admin()).renameFolder(f.id) }, { label: 'Colour and move…', run: async () => (await admin()).editFolder(f.id) }, { label: 'Delete folder', kind: 'danger', run: async () => (await admin()).deleteFolder(f.id) }] : []),
      ] });
    }

    function bookActions(b) {
      actionSheet({ title: b.title, subtitle: b.titleLocal || b.author, actions: [
        { label: 'Open', run: () => goBook(b.id) },
        { label: 'Edit details', run: async () => (await admin()).editBook(b.id) },
        { label: 'Delete', kind: 'danger', run: async () => (await admin()).deleteBook(b.id) },
      ] });
    }

    function drawBody() {
      const place = pl();
      clear(content);
      if (place.missing) {
        add(content, h('div', { class: 'empty' }, icon('folder', 56), h('h3', { text: `That ${place.missing} was not found.` }), h('p', { text: 'It may have been renamed or removed.' }), h('button', { type: 'button', class: 'btn primary big', text: 'Go to the Library', onClick: () => goTo({}) })));
        clear(strip); return;
      }
      const ws = search.words(st.q);
      const folders = st.letter ? [] : place.folders.filter((f) => !ws.length || search.matchFolder(f, ws));
      const byQuery = search.filterBooks(place.books, { q: st.q });
      const books = st.letter ? search.filterBooks(byQuery, { letter: st.letter }) : byQuery;
      const have = store.lettersIn(byQuery);

      if (folders.length) {
        add(content, h('div', { class: 'm-sec' }, h('h2', { text: place.kind === 'folder' ? 'Folders inside' : 'My folders' }), h('span', { class: 'm-count', text: String(folders.length) })),
          h('div', { class: 'folder-grid' }, folders.map((f) => {
            const c = store.folderCounts(f.id);
            return h('div', { class: 'folder-card' },
              h('button', { type: 'button', class: 'fc-main', onClick: () => goTo({ f: f.id }) }, folderIcon(f.color, 46), h('span', { class: 'fc-name', text: f.name, lang: 'en' }), h('span', { class: 'fc-sub', text: `${plural(c.folders, 'folder')} · ${plural(c.books, 'book')}` })),
              h('button', { type: 'button', class: 'fc-more', 'aria-label': 'Actions for ' + f.name, onClick: () => folderActions(f) }, icon('more', 20)));
          })));
      }

      if (books.length || (!folders.length)) {
        const label = st.letter ? `Starting with ${st.letter}` : place.kind === 'topic' ? place.title : place.kind === 'folder' ? 'Books' : place.kind === 'recent' ? 'Recently read' : 'All books A–Z';
        const secRight = [];
        if (st.letter || st.q.trim()) secRight.push(h('button', { type: 'button', class: 'm-link', text: 'Show all', onClick: () => { st.letter = ''; st.q = ''; searchInput.value = ''; drawBody(); } }));
        if (place.kind === 'topic' && isAdmin()) secRight.push(h('button', { type: 'button', class: 'm-link', text: 'Edit topic', onClick: async () => (await admin()).editTopic(place.topic.id) }));
        if (books.length) add(content, h('div', { class: 'm-sec' }, h('h2', { text: label }), h('span', { class: 'm-count', text: String(books.length) }), h('span', { class: 'grow' }), secRight));
        if (place.kind === 'recent') books.forEach((b) => add(content, bookRow(b)));
        else store.groupByLetter(books).forEach(({ letter, books: group }) => add(content, h('h3', { class: 'letter-head', id: 'l-' + letter, text: letter }), group.map(bookRow)));
      }
      if (!folders.length && !books.length) add(content, emptyState(place));
      drawStrip(have);
    }

    function bookRow(b) {
      return h('div', { class: 'book-row' },
        h('button', { type: 'button', class: 'br-main', onClick: () => goBook(b.id) },
          cover(b.color, 32, 42),
          h('span', { class: 'br-text' }, h('span', { class: 'br-title', text: b.title }), b.titleLocal ? gu(b.titleLocal, 'br-gu') : null,
            h('span', { class: 'br-sub', text: [b.author, b.language, b.pages ? b.pages + ' pp' : ''].filter(Boolean).join(' · ') })),
          isAdmin() ? null : icon('chevR', 18)),
        isAdmin() ? h('button', { type: 'button', class: 'fc-more', 'aria-label': 'Actions for ' + b.title, onClick: () => bookActions(b) }, icon('more', 20)) : null);
    }

    function emptyState(place) {
      if (st.q.trim() || st.letter) return h('div', { class: 'empty' }, icon('search', 48), h('h3', { text: st.q.trim() ? `Nothing matches “${st.q.trim()}”.` : `No books start with ${st.letter}.` }), h('p', { text: 'Try fewer words, or search in English or ગુજરાતી.' }));
      if (!store.allBooks().length && place.kind === 'all') return h('div', { class: 'empty' }, icon('books', 56), h('h3', { text: 'Your library is empty.' }), h('p', { text: isAdmin() ? 'Add your first PDF to get started.' : 'Books will appear here soon.' }),
        isAdmin() ? h('button', { type: 'button', class: 'btn primary big', text: 'Add your first PDF', onClick: async () => (await admin()).addBook({ folderId: null }) }) : null);
      if (place.kind === 'folder') return h('div', { class: 'empty' }, icon('folder', 48), h('h3', { text: 'This folder is empty.' }), h('p', { text: isAdmin() ? 'Add a PDF or a new folder from the buttons above.' : 'Books will appear here soon.' }),
        isAdmin() ? h('button', { type: 'button', class: 'btn primary big', text: 'Add a PDF here', onClick: async () => (await admin()).addBook({ folderId: st.f || null }) }) : null);
      if (place.kind === 'topic') return h('div', { class: 'empty' }, icon('tag', 48), h('h3', { text: 'No books in this topic yet.' }), h('p', { text: 'Books tagged with this topic will be listed here.' }));
      if (place.kind === 'recent') return h('div', { class: 'empty' }, icon('clock', 48), h('h3', { text: 'Nothing read yet.' }), h('p', { text: 'Books you open appear here so you can pick up where you left off.' }));
      return h('div', { class: 'empty' }, icon('books', 48), h('h3', { text: 'Nothing here yet.' }));
    }

    function drawStrip(have) {
      clear(strip);
      if (!have.size) return;
      [...LETTERS, ...(have.has('#') ? ['#'] : [])].forEach((l) => add(strip, h('button', { type: 'button', class: 'az-l' + (st.letter === l ? ' active' : ''), text: l, disabled: !have.has(l), 'aria-label': 'Books starting with ' + l, 'aria-pressed': String(st.letter === l),
        onClick: () => { st.letter = st.letter === l ? '' : l; drawBody(); content.scrollTop = 0; } })));
    }

    return { el, destroy() {} };
  }

  // ---------- Topics ----------
  function topicsScreen() {
    const topics = store.allTopics();
    const el = h('div', { class: 'm-screen m-plain' },
      h('header', { class: 'm-header' }, h('div', { class: 'm-toprow' }, h('span'), h('span', { class: 'grow' }), isAdmin() ? h('button', { type: 'button', class: 'm-iconbtn accent', 'aria-label': 'New topic', onClick: async () => (await admin()).newTopic() }, icon('plus', 22)) : null), h('h1', { class: 'm-title', text: 'Topics' })),
      h('div', { class: 'm-content' }, topics.length ? h('div', { class: 'm-card' }, topics.map((t) => h('button', { type: 'button', class: 'topic-row-item', onClick: () => router.go('library', '', { t: t.id }) },
        h('i', { class: 'dot-color', style: { '--c': t.color } }), h('span', { class: 'tr-name' }, h('span', { text: t.name }), t.nameLocal ? gu(t.nameLocal) : null), h('span', { class: 'm-count', text: String(store.booksInTopic(t.id).length) }), icon('chevR', 18))))
        : h('div', { class: 'empty' }, icon('lotus', 48), h('h3', { text: 'No topics yet.' }), h('p', { text: 'Topics such as Bhakti or Dharma will group books here.' }))));
    return { el, destroy() {} };
  }

  // ---------- Search ----------
  function searchScreen(initial) {
    const FILTERS = [['all', 'All'], ['books', 'Books'], ['folders', 'Folders'], ['inside', 'Inside books'], ['notes', 'Notes']];
    const st = { q: initial, filter: 'all', inside: search.insideFromIndex(initial), run: 0, indexing: null };
    const input = h('input', { type: 'search', class: 'ms-input', placeholder: 'Search in English or ગુજરાતી', 'aria-label': 'Search', value: initial, autocomplete: 'off',
      onInput: () => { st.q = input.value; st.run++; st.inside = search.insideFromIndex(st.q); st.indexing = null; draw(); if (st.filter === 'inside') runInside(); push(); } });
    const push = debounce(() => router.setQuiet('search', '', { q: st.q }), 300);
    const chips = h('div', { class: 'ms-chips', role: 'tablist' });
    const results = h('div', { class: 'ms-results' });
    const el = h('div', { class: 'm-screen m-search-screen' },
      h('header', { class: 'ms-head' }, input, h('button', { type: 'button', class: 'ms-cancel', text: 'Cancel', onClick: () => router.go('home') })), chips, results);
    draw();

    async function runInside() {
      const id = st.run;
      if (!search.words(st.q).length || !store.allBooks().length) return;
      st.indexing = { done: 0, total: store.allBooks().length }; draw();
      await search.searchInside(st.q, (done, total, res) => { if (id !== st.run) return; st.indexing = { done, total }; st.inside = res; draw(); }, () => id !== st.run);
      if (id === st.run) { st.indexing = null; draw(); }
    }

    function open(it) {
      if (it.kind === 'book') goBook(it.book.id, it.page);
      else if (it.kind === 'inside') goBook(it.book.id, it.page, st.q);
      else if (it.kind === 'note') { if (it.book) goBook(it.book.id, it.note.page); }
      else if (it.kind === 'folder') router.go('library', '', { f: it.folder.id });
      else if (it.kind === 'topic') router.go('library', '', { t: it.topic.id });
    }

    function swatch(it) {
      if (it.kind === 'book') return h('span', { class: 'ms-sw', style: { '--c': it.book.color } });
      if (it.kind === 'folder') return h('span', { class: 'ms-sw plain' }, folderIcon(it.folder.color, 34));
      if (it.kind === 'topic') return h('span', { class: 'ms-sw dot', style: { '--c': it.topic.color } });
      return h('span', { class: 'ms-sw text', text: it.kind === 'note' ? '✎' : 'Aa' });
    }

    function draw() {
      const ws = search.words(st.q);
      const m = ws.length ? search.groupedResults(st.q, st.filter, st.inside) : null;
      clear(chips);
      FILTERS.forEach(([k, label]) => add(chips, h('button', { type: 'button', role: 'tab', class: 'ms-chip', 'aria-selected': String(st.filter === k), text: label + (m ? ` · ${m.counts[k]}` : ''),
        onClick: () => { st.filter = k; st.run++; draw(); if (k === 'inside') runInside(); } })));
      clear(results);
      if (!ws.length) {
        const rec = local.recentIds().map(store.getBook).filter(Boolean).slice(0, 5);
        if (rec.length) add(results, h('div', { class: 'ms-label', text: 'Recently read' }), h('div', { class: 'ms-card' }, rec.map((b) => row({ kind: 'book', book: b, title: b.title, local: b.titleLocal, sub: 'Recently read', page: local.getProgress(b.id).page }))));
        else add(results, h('div', { class: 'empty' }, icon('search', 48), h('p', { text: 'Type a title, an author, a folder or a word. English or ગુજરાતી.' })));
      } else {
        if (st.indexing) add(results, h('p', { class: 'ms-note', role: 'status', text: `Reading inside books… ${st.indexing.done} of ${st.indexing.total}` }));
        m.groups.forEach((g) => add(results, h('div', { class: 'ms-label', text: g.label }), h('div', { class: 'ms-card' }, g.items.map(row))));
        if (!m.groups.length && !st.indexing) add(results, h('div', { class: 'empty' }, icon('search', 48), h('h3', { text: st.filter === 'inside' ? 'No book has those words inside.' : 'Nothing found.' }), h('p', { text: 'Try fewer or different words.' })));
        if (st.filter === 'inside' && !st.indexing) { const sc = search.unsearchableBooks(); if (sc.length) add(results, h('p', { class: 'ms-note', text: `${plural(sc.length, 'book')} ${sc.length === 1 ? 'has' : 'have'} no searchable text (scanned pages).` })); }
        else if (st.filter === 'all' && !st.inside.length) add(results, h('p', { class: 'ms-note', text: 'To search the words inside PDFs, choose “Inside books”.' }));
      }
      add(results, h('p', { class: 'ms-foot', text: 'Searches titles, authors, folders, topics, words inside PDFs and your notes' }));
    }

    function row(it) {
      return h('button', { type: 'button', class: 'ms-row', onClick: () => open(it) }, swatch(it),
        h('span', { class: 'ms-text' }, h('span', { class: 'ms-title' }, h('span', { text: it.title }), it.local ? [' ', gu(it.local, 'ms-gu')] : null), h('span', { class: 'ms-sub', text: it.sub })),
        it.page ? h('span', { class: 'ms-page', text: 'p. ' + it.page }) : null);
    }

    return { el, destroy() { st.run++; }, afterMount: () => input.focus({ preventScroll: true }) };
  }

  // ---------- Notebook ----------
  function notebookScreen() {
    const app = createNotebookApp({ phone: true });
    const el = h('div', { class: 'm-screen m-plain' }, h('header', { class: 'm-header' }, h('div', { class: 'm-toprow' }), h('h1', { class: 'm-title', text: 'Notebook' })), app.el);
    return { el, destroy: app.destroy };
  }

  const unsubs = [store.subscribe(() => { if (current.name !== 'reader' && current.name !== 'search' && current.name !== 'home') handleRoute(current); else if (current.name === 'home') handleRoute(current); }), auth.subscribe(() => handleRoute(current))];
  showLock(false);

  return {
    handleRoute, showLock,
    destroy() { stopClock(); root.classList.remove('is-locked'); unsubs.forEach((u) => u()); if (screen) screen.destroy(); root.replaceChildren(); },
  };
}
