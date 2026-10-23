// The Library window (desktop): sidebar tree + topics, A–Z bar, icon/list views, info panel, status bar.
import { h, clear, gu, plural, fmtBytes, richText, LETTERS, debounce, add } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import * as router from '../router.js';
import * as auth from '../admin/auth.js';
import * as search from '../search.js';
import { icon, folderIcon, pdfIcon, FOLDER_COLORS } from './icons.js';

const admin = () => import('../admin/admin.js');
let win = null;
let view = null;

export function open(wm, params = {}) {
  if (!win || !win.isOpen) {
    win = wm.open('library', {
      title: 'Library',
      build: (w) => { view = createLibraryView(w); return view.el; },
      onClose: () => {
        win = null; view.destroy(); view = null;
        if (['library', 'topics', 'recent'].includes(router.current().name)) router.go('home', '', {}, { replace: true });
      },
    });
  } else { win.restore(); win.focus(); }
  view.setRoute(params);
}

function createLibraryView(w) {
  const st = { f: '', t: '', recent: false, letter: '', q: '', selected: null, draft: null, wantDraft: false, renaming: null, pending: null };
  const prefs = () => local.prefs();

  // ---------- toolbar (built once; the search box keeps focus across renders) ----------
  const backBtn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Back', title: 'Back', onClick: goBack }, icon('chevL', 18));
  const titleEl = h('h2', { class: 'wtitle' });
  const viewToggle = h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' });
  const adminBar = h('div', { class: 'admin-bar' });
  const searchInput = h('input', { type: 'search', class: 'input lib-search', placeholder: 'Search in English or ગુજરાતી', 'aria-label': 'Search this place', lang: 'en',
    onInput: debounce((e) => { st.q = e.target.value; render(); }, 120),
    onKeydown: (e) => { if (e.key === 'Escape' && searchInput.value) { e.stopPropagation(); searchInput.value = ''; st.q = ''; render(); } } });
  const toolbar = h('div', { class: 'wtoolbar', 'data-drag': '' }, w.dots(), backBtn, titleEl, viewToggle, adminBar, h('span', { class: 'grow' }), searchInput);

  const azbar = h('div', { class: 'azbar', role: 'toolbar', 'aria-label': 'Jump to letter' });
  const sidebar = h('nav', { class: 'lib-sidebar', 'aria-label': 'Library navigation' });
  const main = h('div', { class: 'lib-main', tabindex: '-1' });
  const info = h('aside', { class: 'lib-info', 'aria-label': 'Details' });
  const status = h('div', { class: 'lib-status' });
  const el = h('div', { class: 'wcol library' }, toolbar, azbar, h('div', { class: 'lib-body' }, sidebar, main, info), status);

  let frame = 0;
  const queueRender = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };
  const unsubs = [store.subscribe(queueRender), local.subscribe(() => { if (!st.renaming && !st.draft) queueRender(); }), auth.subscribe(queueRender)];
  const isAdmin = () => auth.isAdmin();

  // ---------- state helpers ----------
  const place = () => store.place({ f: st.f, t: st.t, recent: st.recent }, local.recentIds());
  const goTo = (p) => router.go('library', '', p);

  function setRoute(p) {
    st.f = p.f || ''; st.t = p.t || ''; st.recent = !!p.recent;
    st.letter = ''; st.q = ''; searchInput.value = ''; st.renaming = null; st.pending = null;
    st.draft = st.wantDraft ? { parentId: st.f || null } : null; st.wantDraft = false;
    const sel = p.sel && store.getBook(p.sel);
    st.selected = sel ? { type: 'book', id: sel.id } : null;
    render();
    if (sel) main.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function goBack() {
    const pl = place();
    if (pl.kind === 'folder' && pl.folder) goTo(pl.folder.parentId ? { f: pl.folder.parentId } : {});
    else if (pl.kind !== 'all') goTo({});
  }

  function visible() {
    const pl = place();
    const ws = search.words(st.q);
    const folders = pl.folders.filter((f) => !ws.length || search.matchFolder(f, ws));
    const byQuery = search.filterBooks(pl.books, { q: st.q });
    const books = st.letter ? search.filterBooks(byQuery, { letter: st.letter }) : byQuery;
    return { pl, folders: st.letter ? [] : folders, books, byQuery };
  }

  const selectedFolder = () => (st.selected && st.selected.type === 'folder' ? store.getFolder(st.selected.id) : null);
  const selectedBook = () => (st.selected && st.selected.type === 'book' ? store.getBook(st.selected.id) : null);

  function select(type, id) {
    st.selected = { type, id };
    main.querySelectorAll('[data-key]').forEach((n) => { const on = n.dataset.key === type + ':' + id; n.classList.toggle('selected', on); n.setAttribute('aria-pressed', String(on)); });
    renderInfo(); renderAdminBar();
  }
  const openItem = (type, id) => { if (type === 'folder') goTo({ f: id }); else router.go('reader', id); };

  // ---------- render ----------
  function render() {
    const v = visible();
    const pl = v.pl;
    titleEl.textContent = pl.title;
    titleEl.lang = 'en';
    backBtn.disabled = pl.kind === 'all';
    add(clear(viewToggle), 
      h('button', { type: 'button', 'aria-label': 'View as icons', title: 'as Icons', 'aria-pressed': String(prefs().view === 'icons'), onClick: () => local.setPref('view', 'icons') }, icon('grid', 17)),
      h('button', { type: 'button', 'aria-label': 'View as list', title: 'as List', 'aria-pressed': String(prefs().view === 'list'), onClick: () => local.setPref('view', 'list') }, icon('list', 17)));
    renderAdminBar();
    renderAz(v);
    renderSidebar();
    renderMain(v);
    renderInfo(v);
    const bits = [plural(v.folders.length + v.books.length, 'item')];
    if (st.q.trim()) bits.push(`matching “${st.q.trim()}”`);
    if (st.letter) bits.push(`starting with ${st.letter}`);
    add(clear(status), h('span', { text: bits.join(' · ') }), h('span', { text: pl.kind === 'recent' ? 'Sorted by last read' : 'Sorted by name, A to Z' }));
  }

  function renderAdminBar() {
    clear(adminBar);
    if (!isAdmin()) return;
    const pl = place();
    const f = selectedFolder() || (st.selected ? null : pl.folder);
    const b = selectedBook();
    const canNew = pl.kind === 'all' || pl.kind === 'folder';
    add(adminBar, 
      h('button', { type: 'button', class: 'btn', disabled: !canNew, onClick: startDraft }, icon('folderPlus', 17), ' New Folder'),
      h('button', { type: 'button', class: 'btn', disabled: !f, onClick: () => f && startRename(f.id) }, icon('pencil', 16), ' Rename'),
      h('button', { type: 'button', class: 'btn danger', disabled: !f && !b, onClick: deleteSelected }, icon('trash', 16), ' Delete'),
      h('button', { type: 'button', class: 'btn primary', onClick: async () => (await admin()).addBook({ folderId: st.f || null }) }, icon('plus', 16), ' Add PDF'));
  }

  function renderAz(v) {
    clear(azbar);
    const have = store.lettersIn(v.byQuery);
    add(azbar, h('button', { type: 'button', class: 'az az-all' + (!st.letter ? ' active' : ''), text: 'All', onClick: () => { st.letter = ''; render(); } }));
    [...LETTERS, ...(have.has('#') ? ['#'] : [])].forEach((l) => {
      add(azbar, h('button', { type: 'button', class: 'az' + (st.letter === l ? ' active' : ''), text: l, disabled: !have.has(l), 'aria-pressed': String(st.letter === l),
        onClick: () => { st.letter = st.letter === l ? '' : l; render(); } }));
    });
  }

  function navRow({ label, labelLocal, count, active, onClick, lead, depth = 0, extra }) {
    return h('div', { class: 'nav-row-wrap' },
      h('button', { type: 'button', class: 'nav-row' + (active ? ' active' : ''), 'aria-current': active ? 'page' : null, style: { '--indent': depth * 20 + 'px' }, onClick },
        lead, h('span', { class: 'nav-label', text: label, title: labelLocal ? `${label} · ${labelLocal}` : label }), count !== undefined ? h('span', { class: 'nav-count', text: String(count) }) : null),
      extra);
  }

  function renderSidebar() {
    clear(sidebar);
    const books = store.allBooks();
    const recent = local.recentIds().filter((id) => store.getBook(id));
    add(sidebar, 
      h('div', { class: 'label-caps' }, 'Library'),
      navRow({ label: 'All Books', count: books.length, active: !st.f && !st.t && !st.recent, onClick: () => goTo({}), lead: icon('books', 18) }),
      navRow({ label: 'Recently Read', count: recent.length, active: st.recent, onClick: () => goTo({ recent: 1 }), lead: icon('clock', 18) }),
      h('div', { class: 'label-caps row' }, h('span', { text: 'My folders' }),
        isAdmin() ? h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'New folder', title: 'New folder', onClick: startDraft }, icon('plus', 15)) : null));
    store.folderTree().forEach(({ folder, depth, count }) => {
      const [front] = FOLDER_COLORS[folder.color];
      add(sidebar, navRow({ label: folder.name, labelLocal: folder.nameLocal, count, depth, active: st.f === folder.id, onClick: () => goTo({ f: folder.id }),
        lead: h('span', { class: 'mini-folder', style: { '--c': front } }) }));
    });
    add(sidebar, h('div', { class: 'label-caps row' }, h('span', { text: 'Topics' }),
      isAdmin() ? h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'New topic', title: 'New topic', onClick: async () => (await admin()).newTopic() }, icon('plus', 15)) : null));
    store.allTopics().forEach((t) => {
      add(sidebar, navRow({ label: t.name, labelLocal: t.nameLocal, count: store.booksInTopic(t.id).length, active: st.t === t.id, onClick: () => goTo({ t: t.id }),
        lead: h('span', { class: 'dot-color', style: { '--c': t.color } }),
        extra: isAdmin() ? h('button', { type: 'button', class: 'mini-btn pencil', 'aria-label': 'Edit topic ' + t.name, title: 'Edit topic', onClick: async () => (await admin()).editTopic(t.id) }, icon('pencil', 15)) : null }));
    });
    if (!store.allFolders().length) add(sidebar, h('p', { class: 'side-empty', text: 'No folders yet.' }));
  }

  // ----- main area -----
  function folderSub(f) { const c = store.folderCounts(f.id); return `${plural(c.folders, 'folder')} · ${plural(c.books, 'book')}`; }

  function folderTile(f) {
    const key = 'folder:' + f.id;
    const label = st.renaming === f.id ? renameInput(f.name, (name) => finishRename(f.id, name)) : h('span', { class: 'tile-label', text: f.name, lang: 'en' });
    return h('button', { type: 'button', class: 'tile' + (isSel(key) ? ' selected' : ''), 'data-key': key, 'aria-pressed': String(isSel(key)), 'aria-label': `Folder ${f.name}`,
      onClick: () => select('folder', f.id), onDblclick: () => openItem('folder', f.id),
      onKeydown: (e) => { if (e.key === 'Enter' && st.renaming !== f.id) openItem('folder', f.id); } },
    folderIcon(f.color, 76), label,
    st.renaming === f.id ? h('span', { class: 'tile-sub', text: 'Enter to save' }) : h('span', { class: 'tile-sub', text: folderSub(f) }));
  }

  function bookTile(b) {
    const key = 'book:' + b.id;
    return h('button', { type: 'button', class: 'tile' + (isSel(key) ? ' selected' : ''), 'data-key': key, 'aria-pressed': String(isSel(key)), 'aria-label': `Book ${b.title}`,
      onClick: () => select('book', b.id), onDblclick: () => openItem('book', b.id), onKeydown: (e) => { if (e.key === 'Enter') openItem('book', b.id); } },
    pdfIcon(b.color, b.title, 52), h('span', { class: 'tile-label', text: b.title }),
    b.titleLocal ? gu(b.titleLocal, 'tile-sub') : h('span', { class: 'tile-sub', text: b.author }));
  }

  function draftTile() {
    return h('div', { class: 'tile selected', 'data-draft': '' }, folderIcon('amber', 76),
      renameInput('', (name) => finishDraft(name)), h('span', { class: 'tile-sub', text: 'Enter to save' }));
  }

  function renameInput(value, onDone) {
    const input = h('input', { type: 'text', class: 'rename-input', value, 'aria-label': 'Folder name', maxlength: '80',
      onKeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); onDone(input.value.trim()); }
        if (e.key === 'Escape') { st.renaming = null; st.draft = null; render(); }
      },
      onBlur: () => setTimeout(() => { if (st.renaming || st.draft) { st.renaming = null; st.draft = null; render(); } }, 150) });
    requestAnimationFrame(() => { input.focus(); input.select(); });
    return input;
  }

  const isSel = (key) => st.selected && st.selected.type + ':' + st.selected.id === key;

  function section(label, count, nodes, grid = true) {
    return h('section', { class: 'lib-section' },
      h('header', { class: 'sec-head' }, h('h3', { text: label }), count !== null ? h('span', { class: 'sec-count', text: count }) : null, h('span', { class: 'sec-line' })),
      grid ? h('div', { class: 'tile-grid' }, nodes) : nodes);
  }

  function renderMain(v) {
    const { pl, folders, books } = v;
    clear(main);
    if (pl.missing) {
      add(main, h('div', { class: 'empty' }, icon('folder', 56), h('h3', { text: `That ${pl.missing} was not found.` }), h('p', { text: 'It may have been renamed or removed.' }),
        h('button', { type: 'button', class: 'btn primary big', text: 'Go to the Library', onClick: () => goTo({}) })));
      return;
    }
    const nothing = !folders.length && !books.length && !st.draft;
    if (nothing) { add(main, emptyState(pl)); return; }
    if (st.draft || folders.length) add(main, section('Folders', folders.length ? plural(folders.length, 'folder') : null, [...folders.map(folderTile), st.draft ? draftTile() : null]));
    if (prefs().view === 'list') { add(main, listTable(folders, books, pl)); return; }
    if (pl.kind === 'recent') add(main, section('Recently read', plural(books.length, 'book'), books.map(bookTile)));
    else store.groupByLetter(books).forEach(({ letter, books: group }) => add(main, section(letter, plural(group.length, 'book'), group.map(bookTile))));
  }

  function emptyState(pl) {
    const searching = st.q.trim() || st.letter;
    if (searching) return h('div', { class: 'empty' }, icon('search', 56), h('h3', { text: st.q.trim() ? `Nothing matches “${st.q.trim()}”.` : `No books start with ${st.letter}.` }), h('p', { text: 'Try fewer words, or search in English or ગુજરાતી.' }));
    if (!store.allBooks().length && pl.kind === 'all') {
      return h('div', { class: 'empty' }, icon('books', 56), h('h3', { text: 'Your library is empty.' }),
        isAdmin() ? h('p', { text: 'Add your first PDF to get started.' }) : h('p', { text: 'Books will appear here soon.' }),
        isAdmin() ? h('button', { type: 'button', class: 'btn primary big', text: 'Add your first PDF', onClick: async () => (await admin()).addBook({ folderId: null }) }) : null);
    }
    if (pl.kind === 'folder') return h('div', { class: 'empty' }, icon('folder', 56), h('h3', { text: 'This folder is empty.' }), h('p', { text: isAdmin() ? 'Use Add PDF or New Folder to fill it.' : 'Books will appear here soon.' }));
    if (pl.kind === 'topic') return h('div', { class: 'empty' }, icon('tag', 56), h('h3', { text: 'No books in this topic yet.' }), h('p', { text: 'Books tagged with this topic will be listed here.' }));
    if (pl.kind === 'recent') return h('div', { class: 'empty' }, icon('clock', 56), h('h3', { text: 'Nothing read yet.' }), h('p', { text: 'Books you open will appear here so you can pick up where you left off.' }));
    return h('div', { class: 'empty' }, icon('books', 56), h('h3', { text: 'Nothing here yet.' }));
  }

  function listTable(folders, books, pl) {
    const rows = [...folders.map((f) => ({ type: 'folder', item: f })), ...books.map((b) => ({ type: 'book', item: b }))];
    const body = rows.map(({ type, item }) => {
      const key = type + ':' + item.id;
      const name = type === 'folder'
        ? h('span', { class: 'nm' }, folderIcon(item.color, 20), h('span', { class: 'nm-text' }, h('span', { text: item.name }), item.nameLocal ? gu(item.nameLocal, 'nm-gu') : null))
        : h('span', { class: 'nm' }, h('span', { class: 'swatch', style: { '--c': item.color } }), h('span', { class: 'nm-text' }, h('span', { text: item.title }), item.titleLocal ? gu(item.titleLocal, 'nm-gu') : null));
      return h('tr', { class: isSel(key) ? 'selected' : '', 'data-key': key, tabindex: '0', onClick: () => select(type, item.id), onDblclick: () => openItem(type, item.id), onKeydown: (e) => { if (e.key === 'Enter') openItem(type, item.id); } },
        h('td', {}, name), h('td', { text: type === 'folder' ? '' : item.author }),
        h('td', { text: type === 'folder' ? 'Folder' : 'PDF' + (item.language ? ' · ' + item.language : '') }),
        h('td', { class: 'num', text: type === 'folder' ? '' : item.pages || '—' }), h('td', { class: 'num', text: type === 'folder' ? '' : fmtBytes(item.sizeBytes) }));
    });
    return h('table', { class: 'lib-table' }, h('thead', {}, h('tr', {}, ['Name', 'Author', 'Kind', 'Pages', 'Size'].map((c, i) => h('th', { class: i > 2 ? 'num' : '', text: c })))), h('tbody', {}, body));
  }

  // ----- info panel -----
  function renderInfo(v = visible()) {
    clear(info);
    const folder = selectedFolder();
    const book = selectedBook();
    if (st.selected && !folder && !book) st.selected = null;
    if (folder) return infoFolder(folder);
    if (book) return infoBook(book, v.pl);
    const pl = v.pl;
    const counts = pl.kind === 'folder' ? `${plural(pl.folders.length, 'folder')} and ${plural(pl.books.length, 'book')} in here.` : `${plural(pl.books.length, 'book')}${pl.folders.length ? ' and ' + plural(pl.folders.length, 'folder') : ''}.`;
    add(info, 
      h('div', { class: 'label-caps', text: 'Info' }),
      h('h3', { class: 'info-place', text: pl.title }), pl.titleLocal ? gu(pl.titleLocal, 'info-gu') : null,
      h('p', { class: 'info-text', text: pl.missing ? '' : counts }),
      h('ul', { class: 'tips' }, h('li', { text: 'Click once to select, double-click to open.' }), h('li', { text: 'Use the A–Z bar to jump to a letter.' }), h('li', { text: 'Press / to search every book, folder and word.' })),
      st.t && isAdmin() ? h('button', { type: 'button', class: 'btn big', onClick: async () => (await admin()).editTopic(st.t) }, icon('pencil', 16), ' Edit or delete this topic') : null);
  }

  function infoFolder(f) {
    const c = store.folderCounts(f.id);
    add(info, 
      h('div', { class: 'info-hero' }, folderIcon(f.color, 110)),
      h('h3', { class: 'info-title', text: f.name }), f.nameLocal ? gu(f.nameLocal, 'info-gu center') : null,
      h('p', { class: 'info-meta', text: `Folder · ${plural(c.folders, 'folder')} · ${plural(c.books, 'book')}` }),
      h('div', { class: 'info-actions' },
        h('button', { type: 'button', class: 'btn primary big', text: 'Open folder', onClick: () => openItem('folder', f.id) }),
        isAdmin() ? h('button', { type: 'button', class: 'btn big', onClick: () => startRename(f.id) }, icon('pencil', 16), ' Rename') : null,
        isAdmin() ? h('button', { type: 'button', class: 'btn big', onClick: async () => (await admin()).editFolder(f.id) }, icon('folder', 16), ' Colour and move…') : null,
        isAdmin() ? h('button', { type: 'button', class: 'btn big danger', onClick: async () => (await admin()).deleteFolder(f.id) }, icon('trash', 16), ' Delete folder') : null));
  }

  function infoBook(b, pl) {
    const topics = store.topicsOf(b);
    const dl = h('a', { class: 'btn big', href: b.file, download: b.id + '.pdf' }, icon('download', 16), ' Download');
    const desc = b.description ? richText(h('p', { class: 'info-desc' }), b.description) : null;
    add(info, 
      h('div', { class: 'info-hero' }, pdfIcon(b.color, b.title, 78)),
      h('h3', { class: 'info-title', text: b.title }), b.titleLocal ? gu(b.titleLocal, 'info-gu center big') : null,
      b.author ? h('p', { class: 'info-meta', text: b.author }) : null,
      h('dl', { class: 'info-details' },
        ...[['Tradition', b.tradition], ['Language', b.language], ['Pages', b.pages || '—'], ['Size', fmtBytes(b.sizeBytes)]].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: String(v || '—') })])),
      desc);
    if (!isAdmin()) {
      if (topics.length) add(info, h('div', { class: 'label-caps', text: 'Topics' }), h('div', { class: 'chips' }, topics.map((t) => h('span', { class: 'chip', style: { '--dot': t.color } }, h('i'), t.name))));
      const folders = store.foldersOf(b);
      if (folders.length) add(info, h('div', { class: 'label-caps', text: 'In my folders' }), h('div', { class: 'chips' }, folders.map((f) => h('span', { class: 'chip', text: f.name }))));
    } else adminMembership(b);
    add(info, h('div', { class: 'info-actions' },
      h('button', { type: 'button', class: 'btn primary big', text: 'Open book', onClick: () => openItem('book', b.id) }), dl,
      isAdmin() ? h('button', { type: 'button', class: 'btn big', onClick: async () => (await admin()).editBook(b.id) }, icon('pencil', 16), ' Edit details') : null,
      isAdmin() ? h('button', { type: 'button', class: 'btn big danger', onClick: async () => (await admin()).deleteBook(b.id) }, icon('trash', 16), ' Delete') : null,
      isAdmin() && pl.kind === 'folder' ? h('button', { type: 'button', class: 'btn big', onClick: async () => (await admin()).removeFromFolder(b.id, pl.folder.id) }, 'Remove from this folder') : null));
  }

  // Admin: tick boxes collect changes, then one commit saves them together.
  function adminMembership(b) {
    if (!st.pending || st.pending.id !== b.id) st.pending = { id: b.id, folders: new Set(b.folders.filter(store.getFolder)), topics: new Set(b.topics.filter(store.getTopic)) };
    const p = st.pending;
    const dirty = () => p.folders.size !== b.folders.filter(store.getFolder).length || p.topics.size !== b.topics.filter(store.getTopic).length
      || [...p.folders].some((id) => !b.folders.includes(id)) || [...p.topics].some((id) => !b.topics.includes(id));
    const save = h('button', { type: 'button', class: 'btn primary big', text: 'Save folder and topic changes', hidden: true, onClick: async () => { await (await admin()).saveMembership(b.id, [...p.folders], [...p.topics]); st.pending = null; } });
    const check = (set, id, label, dot, depth = 0) => h('label', { class: 'check', style: { paddingLeft: depth * 16 + 'px' } },
      h('input', { type: 'checkbox', checked: set.has(id), onChange: (e) => { if (e.target.checked) set.add(id); else set.delete(id); save.hidden = !dirty(); } }),
      dot ? h('span', { class: 'dot-color', style: { '--c': dot } }) : null, h('span', { text: label }));
    add(info, h('div', { class: 'label-caps', text: 'Topics' }), store.allTopics().length ? store.allTopics().map((t) => check(p.topics, t.id, t.name, t.color)) : h('p', { class: 'info-text', text: 'No topics yet.' }),
      h('div', { class: 'label-caps', text: 'In my folders' }), store.allFolders().length ? store.folderTree().map(({ folder, depth }) => check(p.folders, folder.id, folder.name, null, depth)) : h('p', { class: 'info-text', text: 'No folders yet.' }), save);
    save.hidden = !dirty();
  }

  // ----- admin flows on this window -----
  function startDraft() {
    const pl = place();
    st.renaming = null;
    if (pl.kind === 'all' || pl.kind === 'folder') { st.draft = { parentId: st.f || null }; render(); }
    else { st.wantDraft = true; goTo({}); }
  }
  function startRename(id) { st.renaming = id; st.draft = null; render(); }
  async function finishDraft(name) {
    const parentId = st.draft && st.draft.parentId;
    st.draft = null; render();
    if (!name) return;
    try { await (await admin()).createFolder({ parentId, name }); } catch (e) { console.warn(e); }
  }
  async function finishRename(id, name) {
    st.renaming = null; render();
    const f = store.getFolder(id);
    if (!name || !f || name === f.name) return;
    try { await (await admin()).renameFolder(id, name); } catch (e) { console.warn(e); }
  }
  async function deleteSelected() {
    const f = selectedFolder() || (st.selected ? null : place().folder);
    const b = selectedBook();
    if (f) (await admin()).deleteFolder(f.id); else if (b) (await admin()).deleteBook(b.id);
  }

  return { el, setRoute, destroy() { unsubs.forEach((u) => u()); } };
}
