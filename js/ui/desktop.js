// The desktop: wallpaper (from index.html), menu bar, the single Library icon, widgets, dock, windows.
import { h, clear, plural, add } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import * as auth from '../admin/auth.js';
import { icon, folderIcon, appTile, APPS, cover } from './icons.js';
import { createWindowManager } from './windows.js';
import { createMenubar } from './menubar.js';
import { createLock, shouldShowLock, liveClock, menuClock } from './lock.js';
import { openDialog, toast } from './dialogs.js';

const WINDOW_OF = { library: 'library', reader: 'reader', notebook: 'notebook', admin: 'admin' };

export function mountDesktop(root) {
  const layer = h('div', { class: 'windows-layer' });
  const wm = createWindowManager(layer);
  let searchOpen = false;
  let searched = false;
  let lockEl = null;
  let previous = { name: 'home', id: '', params: {} };

  const goBook = (id, page) => router.go('reader', id, page ? { p: page } : {});
  const lastRead = () => {
    const book = local.recentIds().map(store.getBook).find(Boolean);
    return book ? { book, progress: local.getProgress(book.id) } : null;
  };

  // ---------- launching apps ----------
  async function launch(name, route) {
    try {
      if (name === 'library') (await import('./library.js')).open(wm, route);
      else if (name === 'reader') (await import('./reader.js')).openDesktop(wm, route);
      else if (name === 'notebook') (await import('./notebook.js')).openDesktop(wm, route);
      else if (name === 'admin') (await import('../admin/admin.js')).openPanel(wm, route);
    } catch (e) {
      console.error(e);
      toast('Sorry, that window could not open. Please reload the page.', { error: true });
    }
  }

  async function openSearch(q = '') {
    if (searchOpen) { (await import('./spotlight.js')).setQuery(q); return; }
    searchOpen = true;
    searched = true;
    hint.hidden = true;
    (await import('./spotlight.js')).open({
      wm, q,
      onClose: () => {
        searchOpen = false;
        if (router.current().name === 'search') router.go(previous.name === 'search' ? 'home' : previous.name, previous.id, previous.params, { replace: true });
      },
    });
  }

  function handleRoute(route) {
    if (route.name !== 'search') { previous = route; if (searchOpen) import('./spotlight.js').then((m) => m.close()); }
    switch (route.name) {
      case 'library': launch('library', route.params); break;
      case 'topics': launch('library', {}); break;
      case 'recent': launch('library', { recent: '1' }); break;
      case 'reader': launch('reader', route); break;
      case 'notebook': launch('notebook', route); break;
      case router.ADMIN_ROUTE: auth.reveal(); launch('admin', route); break;
      case 'search': openSearch(route.params.q || ''); break;
      default: break;
    }
  }

  function openApp(name) {
    if (name === 'library') router.go('library');
    else if (name === 'search') openSearch();
    else if (name === 'notebook') router.go('notebook');
    else if (name === 'admin') router.go(router.ADMIN_ROUTE);
    else if (name === 'lock') showLock(true);
    else if (name === 'reader') {
      if (wm.isOpen('reader')) { wm.get('reader').restore(); wm.get('reader').focus(); return; }
      const last = lastRead();
      if (last) goBook(last.book.id, last.progress.page);
      else toast('Pick a book in the Library and it will open here.');
    }
  }

  function showLock(force) {
    if (lockEl || (!force && !shouldShowLock())) return;
    const lock = createLock({ phone: false, onOpen: () => { lockEl = null; root.classList.remove('is-locked'); icon_.focus(); } });
    lockEl = lock.el;
    root.classList.add('is-locked');
    root.append(lockEl);
  }

  // ---------- menu bar ----------
  const menus = () => {
    const prefs = local.prefs();
    const top = wm.topWindow();
    const readerOpen = wm.isVisible('reader');
    const last = lastRead();
    const cmd = (c) => () => document.dispatchEvent(new CustomEvent('smh:reader-cmd', { detail: c }));
    return {
      File: [
        { label: 'Open Library', run: () => openApp('library') },
        { label: 'Open last book', disabled: !last, run: () => last && goBook(last.book.id, last.progress.page) },
        ...adminFileItems(),
        '-',
        { label: 'Close window', disabled: !top, run: () => top && top.close() },
        { label: 'Lock screen', run: () => showLock(true) },
      ],
      Edit: [
        { label: 'Search everything…', shortcut: '/', run: () => openSearch() },
        { label: 'Find in this book', disabled: !readerOpen, shortcut: 'Ctrl+F', run: cmd('find') },
        '-',
        { label: 'Export my notes (.txt)', run: async () => (await import('./notebook.js')).exportNotes() },
        { label: 'Back up notebook (.json)', run: async () => (await import('./notebook.js')).backupNotes() },
        { label: 'Restore notebook…', run: async () => (await import('./notebook.js')).restoreNotes() },
      ],
      View: [
        { label: 'as Icons', checked: prefs.view === 'icons', run: () => local.setPref('view', 'icons') },
        { label: 'as List', checked: prefs.view === 'list', run: () => local.setPref('view', 'list') },
        '-',
        { label: 'Night mode (reader)', checked: prefs.night, run: () => local.setPref('night', !prefs.night) },
        { label: 'Zoom in', disabled: !readerOpen, shortcut: '+', run: cmd('zoomIn') },
        { label: 'Zoom out', disabled: !readerOpen, shortcut: '−', run: cmd('zoomOut') },
        { label: 'Fit width', disabled: !readerOpen, run: cmd('fit') },
        '-',
        { label: 'Enter full screen', run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {})) },
      ],
      Go: [
        { label: 'All Books', run: () => router.go('library') },
        { label: 'Recently Read', run: () => router.go('library', '', { recent: 1 }) },
        { label: 'Search…', run: () => openSearch() },
        { label: 'Notebook', run: () => router.go('notebook') },
        ...(store.childFolders(null).length ? ['-', ...store.childFolders(null).slice(0, 10).map((f) => ({ label: f.name, run: () => router.go('library', '', { f: f.id }) }))] : []),
        ...(store.allTopics().length ? ['-', ...store.allTopics().slice(0, 10).map((t) => ({ label: t.name, run: () => router.go('library', '', { t: t.id }) }))] : []),
      ],
      Help: [
        { label: 'Keyboard shortcuts', run: showShortcuts },
        { label: 'Where are my notes kept?', run: showNotesHelp },
        { label: 'About ' + store.settings().siteName, run: showAbout },
      ],
    };
  };

  function adminFileItems() {
    if (!auth.isAdmin()) return [];
    return ['-',
      { label: 'New Folder…', run: async () => (await import('../admin/admin.js')).newFolder(router.current().params.f || null) },
      { label: 'Add PDF…', run: async () => (await import('../admin/admin.js')).addBook({ folderId: router.current().params.f || null }) }];
  }

  function showShortcuts() {
    const rows = [['/  or  Ctrl+K', 'Search everything'], ['← →', 'Turn pages in the reader'], ['+  −', 'Zoom in and out'], ['Ctrl+Enter', 'Save a note'], ['Esc', 'Close a dialog or search'], ['Double-click', 'Open a folder or book']];
    openDialog({ title: 'Keyboard shortcuts', body: h('table', { class: 'kbd-table' }, rows.map(([k, v]) => h('tr', {}, h('th', { text: k }), h('td', { text: v })))), actions: [{ label: 'Done', kind: 'primary' }] });
  }
  function showNotesHelp() {
    openDialog({ title: 'Where are my notes kept?', body: h('p', { text: 'Your notes, quotes, bookmarks and reading position are saved only in this browser on this device. They are never sent anywhere. Use Edit → Back up notebook now and then, so you can restore them on another device.' }), actions: [{ label: 'Got it', kind: 'primary' }] });
  }
  function showAbout() {
    openDialog({ title: 'About ' + store.settings().siteName, body: h('p', { text: 'A free library of Swaminarayan scriptures and other spiritual books, for reading in your browser. Everything here is public. Notes and reading progress stay on your device.' }), actions: [{ label: 'Close', kind: 'primary' }] });
  }

  const clockEl = h('span', { class: 'menu-clock' });
  const searchBtn = h('button', { type: 'button', class: 'menu-btn', onClick: () => openSearch() }, icon('search', 16), ' Search');
  const adminSlot = h('span', { class: 'menu-admin-slot' });
  const lockBtn = h('button', { type: 'button', class: 'menu-btn icon-only', 'aria-label': 'Lock screen', title: 'Lock screen', onClick: () => showLock(true) }, icon('lock', 17));
  const menubar = createMenubar({ siteName: store.settings().siteName, getMenus: menus, right: h('span', { class: 'menu-right' }, searchBtn, adminSlot, lockBtn, clockEl) });
  const stopClock = liveClock(() => { clockEl.textContent = menuClock(); });

  function renderAdminSlot() {
    clear(adminSlot);
    if (!auth.isRevealed()) return; // visitors never see an Admin button
    add(adminSlot, auth.isAdmin()
      ? h('button', { type: 'button', class: 'menu-btn admin-badge', title: 'Admin panel', onClick: () => openApp('admin') }, icon('gear', 15), ' Admin ', auth.isDryRun() ? h('em', { text: 'dry run' }) : null)
      : h('button', { type: 'button', class: 'menu-btn', onClick: () => openApp('admin') }, 'Admin'));
  }

  // ---------- widgets ----------
  const widgets = h('aside', { class: 'widgets', 'aria-label': 'Widgets' });
  function renderWidgets() {
    clear(widgets);
    const last = lastRead();
    if (last && last.progress) {
      const { book, progress } = last;
      const pages = progress.pages || book.pages;
      const folder = store.foldersOf(book)[0];
      add(widgets, h('section', { class: 'widget' },
        h('div', { class: 'label-caps', text: 'Continue reading' }),
        h('div', { class: 'cw-row' },
          cover(book.color, 52, 70),
          h('div', { class: 'cw-text' },
            h('div', { class: 'cw-title', text: book.title }),
            h('div', { class: 'cw-sub', text: `Page ${progress.page}${pages ? ' of ' + pages : ''}${folder ? ' · ' + folder.name : ''}` }))),
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: { width: pages ? Math.min(100, (progress.page / pages) * 100) + '%' : '0%' } })),
        h('button', { type: 'button', class: 'widget-btn', text: 'Resume at page ' + progress.page, onClick: () => goBook(book.id, progress.page) })));
    }
    const recent = [...store.allBooks()].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 3);
    if (recent.length) {
      add(widgets, h('section', { class: 'widget' },
        h('div', { class: 'label-caps', text: 'Recently added' }),
        recent.map((b) => h('button', { type: 'button', class: 'recent-row', onClick: () => goBook(b.id) },
          cover(b.color, 28, 36),
          h('span', { class: 'recent-text' },
            h('span', { class: 'recent-title', text: b.title }),
            h('span', { class: 'recent-sub', text: [b.tradition, b.pages ? plural(b.pages, 'page') : ''].filter(Boolean).join(' · ') }))))));
    }
  }

  // ---------- the one desktop icon ----------
  const icon_ = h('button', { type: 'button', class: 'desk-icon', 'aria-label': 'Library. Double-click or press Enter to open.',
    onClick: () => icon_.classList.add('selected'), onDblclick: () => openApp('library'),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openApp('library'); } },
    onBlur: () => icon_.classList.remove('selected') },
  folderIcon('amber', 72), h('span', { class: 'desk-label', text: 'Library' }));
  desktopClickAway();
  function desktopClickAway() { root.addEventListener('pointerdown', (e) => { if (!icon_.contains(e.target)) icon_.classList.remove('selected'); }); }

  const hint = h('div', { class: 'search-hint', role: 'note' }, icon('search', 16), ' Press ', h('kbd', { text: '/' }), ' to search any book, folder or word');

  // ---------- dock ----------
  const dock = h('nav', { class: 'dock', 'aria-label': 'Dock' });
  function renderDock() {
    clear(dock);
    const item = (name, active) => h('button', { type: 'button', class: 'dock-item' + (active ? ' open' : ''), 'aria-label': APPS[name].label, 'data-tip': APPS[name].label, onClick: () => openApp(name) }, appTile(name, 60), h('span', { class: 'dock-dot' }));
    const open = (name) => wm.isOpen(WINDOW_OF[name]);
    add(dock, item('library', open('library')), item('search', searchOpen), item('reader', open('reader')), item('notebook', open('notebook')),
      h('span', { class: 'dock-sep', role: 'separator' }), item('lock', false));
    if (auth.isAdmin()) add(dock, item('admin', open('admin')));
  }

  const onKey = (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !lockEl) { e.preventDefault(); openSearch(); }
  };
  document.addEventListener('keydown', onKey);

  const unsubs = [store.subscribe(refresh), local.subscribe(refresh), auth.subscribe(() => { renderAdminSlot(); renderDock(); refresh(); }), wm.onChange(renderDock)];
  let queued = false;
  function refresh() { if (queued) return; queued = true; queueMicrotask(() => { queued = false; renderWidgets(); }); }

  root.append(h('div', { class: 'desktop' }, menubar.el, hint, widgets, icon_, layer, dock));
  renderAdminSlot(); renderWidgets(); renderDock();
  showLock(false);
  hint.hidden = searched;

  return {
    handleRoute, showLock, openSearch,
    destroy() { root.classList.remove('is-locked'); document.removeEventListener('keydown', onKey); stopClock(); menubar.destroy(); unsubs.forEach((u) => u()); root.replaceChildren(); },
  };
}
