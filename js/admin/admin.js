// Admin: the panel (sign-in status, library size, quick actions, data-safety tips) and the folder, topic,
// membership and settings actions. Every action ends in runCommit(), which makes ONE commit.
import { h, clear, add, fmtBytes, plural, makeId } from '../dom.js';
import * as store from '../store.js';
import * as auth from './auth.js';
import { runCommit, ensureSignedIn } from './commit.js';
import { GitHubError, WARN_REPO_BYTES } from './github.js';
import { openDialog, toast } from '../ui/dialogs.js';
import { icon, FOLDER_COLORS } from '../ui/icons.js';
export { addBook, editBook, deleteBook } from './book-form.js';

/** Runs an action and shows any refusal as a toast instead of an unhandled error. */
const guard = (fn) => async (...args) => {
  try { return await fn(...args); } catch (e) { toast(e && e.message ? e.message : 'Something went wrong.', { error: true }); return null; }
};

const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }, input), hint ? h('div', { class: 'hint', text: hint }) : null);
const textInput = (value, label, extra = {}) => h('input', { type: 'text', class: 'input', value: value || '', 'aria-label': label, maxlength: '120', autocomplete: 'off', ...extra });

function swatches(options, selected, label) {
  let current = selected;
  const row = h('div', { class: 'swatch-row', role: 'group', 'aria-label': label });
  const draw = () => { clear(row); options.forEach(({ value, color, name }) => add(row, h('button', { type: 'button', class: 'swatch-pick', 'aria-label': name, 'aria-pressed': String(value === current), style: { '--c': color }, onClick: () => { current = value; draw(); } }))); };
  draw();
  return { el: row, get: () => current };
}
const folderSwatches = (selected) => swatches(Object.entries(FOLDER_COLORS).map(([k, [front]]) => ({ value: k, color: front, name: k + ' folder' })), selected, 'Folder colour');
const topicSwatches = (selected) => swatches(store.TOPIC_PALETTE.map((c) => ({ value: c, color: c, name: 'Colour ' + c })), selected, 'Topic colour');

// ---------- folders ----------
const depthIn = (list, id) => { let d = 0, cur = list.find((f) => f.id === id); while (cur && d < 10) { d++; cur = cur.parentId ? list.find((f) => f.id === cur.parentId) : null; } return d; };
const heightIn = (list, id) => 1 + Math.max(0, ...list.filter((f) => f.parentId === id).map((c) => heightIn(list, c.id)));
const nextOrder = (list, parentId) => 1 + Math.max(-1, ...list.filter((f) => (f.parentId || null) === (parentId || null)).map((f) => f.order || 0));

export const createFolder = guard(async ({ parentId = null, name, nameLocal = '', color = 'amber' }) => {
  name = (name || '').trim();
  if (!name) throw new Error('Please type a folder name.');
  return runCommit({ message: `admin: add folder "${name}"`, apply: (w) => {
    const list = w.folders.folders;
    if (parentId && !list.some((f) => f.id === parentId)) throw new Error('The folder you are adding to no longer exists. Please reload.');
    if (parentId && depthIn(list, parentId) >= store.MAX_DEPTH) throw new Error(`Folders can only go ${store.MAX_DEPTH} levels deep.`);
    const notes = list.some((f) => (f.parentId || null) === (parentId || null) && f.name.toLowerCase() === name.toLowerCase()) ? [`A folder called “${name}” already exists here. You can still save.`] : [];
    list.push({ id: makeId(name, new Set(list.map((f) => f.id))), name, nameLocal: nameLocal.trim(), parentId: parentId || null, color, order: nextOrder(list, parentId) });
    return { notes };
  } });
});

export const newFolder = guard(async (parentId = null) => {
  if (!(await ensureSignedIn())) return;
  const name = textInput('', 'Folder name', { placeholder: 'e.g. Shastras' });
  const local = textInput('', 'Gujarati name', { lang: 'gu', placeholder: 'ગુજરાતી નામ (optional)' });
  const color = folderSwatches('amber');
  const where = parentId ? store.getFolder(parentId) : null;
  openDialog({ title: 'New folder', subtitle: where ? 'Inside “' + where.name + '”' : 'In My folders', body: h('div', {}, field('Name', name), field('Gujarati name', local), h('div', { class: 'field' }, h('span', { class: 'label', text: 'Colour' }), color.el)),
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Create', kind: 'primary', onClick: async () => { const r = await createFolder({ parentId, name: name.value, nameLocal: local.value, color: color.get() }); return r ? true : false; } }] });
});

export const renameFolder = guard(async (id, name) => {
  const f = store.getFolder(id);
  if (!f) throw new Error('That folder no longer exists.');
  const commit = (newName, nameLocal) => runCommit({ message: `admin: rename folder "${f.name}" → "${newName}"`, apply: (w) => {
    const target = w.folders.folders.find((x) => x.id === id);
    if (!target) throw new Error('That folder no longer exists. Please reload.');
    target.name = newName; if (nameLocal !== undefined) target.nameLocal = nameLocal;
  } });
  if (name !== undefined) { if (!name.trim()) throw new Error('Please type a folder name.'); return commit(name.trim()); }
  const en = textInput(f.name, 'Folder name');
  const gj = textInput(f.nameLocal, 'Gujarati name', { lang: 'gu' });
  openDialog({ title: 'Rename folder', body: h('div', {}, field('Name', en), field('Gujarati name', gj)),
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { if (!en.value.trim()) throw new Error('Please type a folder name.'); return (await commit(en.value.trim(), gj.value.trim())) ? true : false; } }] });
});

export const editFolder = guard(async (id) => {
  const f = store.getFolder(id);
  if (!f) throw new Error('That folder no longer exists.');
  const en = textInput(f.name, 'Folder name');
  const gj = textInput(f.nameLocal, 'Gujarati name', { lang: 'gu' });
  const color = folderSwatches(f.color);
  const blocked = new Set(store.descendantIds(id)); // cannot move a folder into itself or its own sub-folders
  const height = store.subtreeHeight(id);
  const parent = h('select', { class: 'select', 'aria-label': 'Move to' }, h('option', { value: '', text: 'Top level (My folders)' }),
    store.folderTree().filter(({ folder, depth }) => !blocked.has(folder.id) && depth + 1 + height <= store.MAX_DEPTH).map(({ folder, depth }) => h('option', { value: folder.id, selected: folder.id === f.parentId, text: '  '.repeat(depth) + folder.name })));
  openDialog({ title: 'Folder details', subtitle: f.name, body: h('div', {}, field('Name', en), field('Gujarati name', gj), h('div', { class: 'field' }, h('span', { class: 'label', text: 'Colour' }), color.el), field('Move to', parent, 'Folders can nest up to ' + store.MAX_DEPTH + ' levels.')),
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      if (!en.value.trim()) throw new Error('Please type a folder name.');
      const newParent = parent.value || null;
      const moved = newParent !== (f.parentId || null);
      const r = await runCommit({ message: moved ? `admin: move folder "${f.name}"` : `admin: update folder "${en.value.trim()}"`, apply: (w) => {
        const list = w.folders.folders;
        const t = list.find((x) => x.id === id);
        if (!t) throw new Error('That folder no longer exists. Please reload.');
        if (moved) {
          if (newParent && (store.descendantIds(id).includes(newParent) || !list.some((x) => x.id === newParent))) throw new Error('A folder cannot be moved into itself or one of its own folders.');
          if ((newParent ? depthIn(list, newParent) : 0) + heightIn(list, id) > store.MAX_DEPTH) throw new Error(`That would make folders more than ${store.MAX_DEPTH} levels deep.`);
          t.parentId = newParent; t.order = nextOrder(list, newParent);
        }
        t.name = en.value.trim(); t.nameLocal = gj.value.trim(); t.color = color.get();
      } });
      return r ? true : false;
    } }] });
});

export const deleteFolder = guard(async (id) => {
  const f = store.getFolder(id);
  if (!f) throw new Error('That folder no longer exists.');
  const ids = store.descendantIds(id);
  const subs = ids.length - 1;
  const books = store.booksInFolder(id, true).length;
  return runCommit({
    title: 'Delete folder', danger: true, message: `admin: delete folder "${f.name}"`,
    intro: `Delete “${f.name}”? ${subs ? plural(subs, 'sub-folder') + ' inside it will also be deleted. ' : ''}${plural(books, 'book')} ${books === 1 ? 'is' : 'are'} in ${subs ? 'these folders' : 'this folder'}. Books are never deleted: they just leave ${subs ? 'these folders' : 'this folder'}.`,
    apply: (w) => { const gone = new Set(store.descendantIds(id)); w.folders.folders = w.folders.folders.filter((x) => !gone.has(x.id)); },
  });
});

// ---------- topics ----------
export const newTopic = guard(async () => topicDialog(null));
export const editTopic = guard(async (id) => { if (!store.getTopic(id)) throw new Error('That topic no longer exists.'); return topicDialog(id); });

async function topicDialog(id) {
  if (!(await ensureSignedIn())) return;
  const t = id ? store.getTopic(id) : null;
  const name = textInput(t ? t.name : '', 'Topic name', { placeholder: 'e.g. Bhakti & Upasana' });
  const gj = textInput(t ? t.nameLocal : '', 'Gujarati name', { lang: 'gu' });
  const color = topicSwatches(t ? t.color : store.TOPIC_PALETTE[0]);
  const all = store.allTopics();
  const pos = id ? h('select', { class: 'select', 'aria-label': 'Position' }, all.map((x, i) => h('option', { value: String(i), selected: x.id === id, text: `${i + 1} of ${all.length}` }))) : null;
  const actions = [{ label: 'Cancel', kind: 'cancel' }];
  if (t) actions.push({ label: 'Delete topic', kind: 'danger', onClick: async (d) => { const r = await deleteTopicNow(t.id); if (r) { d.close(); } return false; } });
  actions.push({ label: t ? 'Save' : 'Create', kind: 'primary', onClick: async () => {
    const n = name.value.trim();
    if (!n) throw new Error('Please type a topic name.');
    const r = await runCommit({ message: t ? `admin: update topic "${n}"` : `admin: add topic "${n}"`, apply: (w) => {
      const list = w.topics.topics;
      if (!t) { list.push({ id: makeId(n, new Set(list.map((x) => x.id))), name: n, nameLocal: gj.value.trim(), color: color.get(), order: 1 + Math.max(-1, ...list.map((x) => x.order || 0)) }); return; }
      const target = list.find((x) => x.id === t.id);
      if (!target) throw new Error('That topic no longer exists. Please reload.');
      target.name = n; target.nameLocal = gj.value.trim(); target.color = color.get();
      const ordered = [...list].sort((a, b) => (a.order || 0) - (b.order || 0)).filter((x) => x.id !== t.id);
      ordered.splice(Math.min(+pos.value, ordered.length), 0, target);
      ordered.forEach((x, i) => { x.order = i; });
    } });
    return r ? true : false;
  } });
  openDialog({ title: t ? 'Edit topic' : 'New topic', body: h('div', {}, field('Name', name), field('Gujarati name', gj), h('div', { class: 'field' }, h('span', { class: 'label', text: 'Colour' }), color.el), pos ? field('Position in the list', pos) : null), actions });
}

const deleteTopicNow = guard(async (id) => {
  const t = store.getTopic(id);
  if (!t) throw new Error('That topic no longer exists.');
  const n = store.booksInTopic(id).length;
  return runCommit({ title: 'Delete topic', danger: true, message: `admin: delete topic "${t.name}"`,
    intro: `Delete the topic “${t.name}”? ${n ? plural(n, 'book') + (n === 1 ? ' uses' : ' use') + ' it. The books stay in the library; they just lose this topic.' : 'No books use it.'}`,
    apply: (w) => { w.topics.topics = w.topics.topics.filter((x) => x.id !== id); } });
});

// ---------- book membership (tick boxes in the info panel) ----------
export const saveMembership = guard(async (bookId, folders, topics) => {
  const b = store.getBook(bookId);
  if (!b) throw new Error('That book no longer exists.');
  return runCommit({ message: `admin: update folders and topics of "${b.title}"`, apply: (w) => {
    const t = w.books.books.find((x) => x.id === bookId);
    if (!t) throw new Error('That book no longer exists. Please reload.');
    t.folders = folders.filter((id) => w.folders.folders.some((f) => f.id === id));
    t.topics = topics.filter((id) => w.topics.topics.some((x) => x.id === id));
    t.updatedAt = new Date().toISOString();
  } });
});

export const removeFromFolder = guard(async (bookId, folderId) => {
  const b = store.getBook(bookId), f = store.getFolder(folderId);
  if (!b || !f) throw new Error('That book or folder no longer exists.');
  return runCommit({ message: `admin: remove "${b.title}" from folder "${f.name}"`, apply: (w) => {
    const t = w.books.books.find((x) => x.id === bookId);
    if (t) { t.folders = (t.folders || []).filter((id) => id !== folderId); t.updatedAt = new Date().toISOString(); }
  } });
});

// ---------- settings ----------
export const editSettings = guard(async () => {
  if (!(await ensureSignedIn())) return;
  const s = store.settings();
  const siteName = textInput(s.siteName, 'Site name');
  const tagline = textInput(s.tagline, 'Tagline');
  const lock = h('input', { type: 'checkbox', checked: s.showLockScreen });
  const owner = textInput(s.github.owner, 'GitHub owner'), repo = textInput(s.github.repo, 'Repository'), branch = textInput(s.github.branch, 'Branch');
  const verses = s.verses.map((v) => ({ ...v }));
  const list = h('div', { class: 'verse-list' });
  const draw = () => {
    clear(list);
    verses.forEach((v, i) => {
      const text = h('textarea', { class: 'textarea', rows: '2', maxlength: '400', 'aria-label': 'Verse ' + (i + 1), value: v.text, onInput: (e) => { v.text = e.target.value; } });
      const source = textInput(v.source, 'Source of verse ' + (i + 1), { onInput: (e) => { v.source = e.target.value; } });
      const book = h('select', { class: 'select', 'aria-label': 'Book for verse ' + (i + 1), onChange: (e) => { v.bookId = e.target.value || null; } }, h('option', { value: '', text: 'No book' }), store.allBooks().map((b) => h('option', { value: b.id, selected: b.id === v.bookId, text: b.title })));
      add(list, h('div', { class: 'verse-card' }, text, h('div', { class: 'field-row' }, source, book), h('button', { type: 'button', class: 'btn danger', onClick: () => { verses.splice(i, 1); draw(); } }, icon('trash', 15), ' Remove verse')));
    });
    add(list, h('button', { type: 'button', class: 'btn', onClick: () => { verses.push({ text: '', source: '', bookId: null }); draw(); } }, icon('plus', 15), ' Add a verse'));
  };
  draw();
  openDialog({ title: 'Site settings', wide: true,
    body: h('div', {}, field('Site name', siteName), field('Tagline (optional)', tagline), h('label', { class: 'check' }, lock, h('span', { text: 'Show the lock screen once per visit' })),
      h('div', { class: 'label-caps', text: 'Verses for the lock screen' }), list,
      h('div', { class: 'label-caps', text: 'GitHub (where changes are saved)' }), h('div', { class: 'field-row' }, field('Owner', owner), field('Repository', repo), field('Branch', branch))),
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Save settings', kind: 'primary', onClick: async () => {
      if (!siteName.value.trim()) throw new Error('The site name cannot be empty.');
      const ok = /^[A-Za-z0-9_.-]{0,100}$/;
      if (![owner.value, repo.value].every((x) => ok.test(x.trim())) || !/^[A-Za-z0-9_./-]{1,100}$/.test(branch.value.trim()) || branch.value.includes('..')) throw new Error('Check the GitHub owner, repository and branch names.');
      const r = await runCommit({ message: 'admin: update settings', apply: (w) => {
        Object.assign(w.settings, { siteName: siteName.value.trim(), tagline: tagline.value.trim(), showLockScreen: lock.checked,
          verses: verses.filter((v) => v.text.trim()).map((v) => ({ text: v.text.trim(), source: (v.source || '').trim(), bookId: v.bookId || null })),
          github: { owner: owner.value.trim(), repo: repo.value.trim() || 'saral-mandal-hariprabodham', branch: branch.value.trim() } });
      } });
      return r ? true : false;
    } }] });
});

// ---------- the panel ----------
function buildPanel({ phone }) {
  const root = h('div', { class: 'admin-panel' + (phone ? ' phone-admin' : '') });
  let sizeToken = 0;
  const unsub = auth.subscribe(draw);
  draw();

  function draw() {
    clear(root);
    const me = auth.info();
    if (!me) {
      add(root, h('div', { class: 'admin-card center' }, icon('gear', 44), h('h3', { text: 'Admin' }),
        h('p', { text: 'Sign in with a GitHub token to add books, folders and topics. Visitors never see these controls.' }),
        h('button', { type: 'button', class: 'btn primary big', text: 'Sign in', onClick: () => auth.openSignIn() })));
      return;
    }
    const sizeBox = h('p', { class: 'hint', text: 'Checking the size of your books…' });
    add(root,
      h('div', { class: 'admin-card' },
        h('div', { class: 'admin-row' }, h('strong', { text: 'Connected to' }), h('span', { class: 'mono', text: `${me.owner}/${me.repo} (${me.branch})` })),
        h('div', { class: 'admin-row' }, h('strong', { text: 'Token' }), h('span', { text: auth.expiryText() })),
        sizeBox),
      h('div', { class: 'admin-actions' },
        h('button', { type: 'button', class: 'btn primary big', onClick: () => import('./book-form.js').then((m) => m.addBook({ folderId: null })) }, icon('plus', 16), ' Add PDF'),
        h('button', { type: 'button', class: 'btn big', onClick: () => newFolder(null) }, icon('folderPlus', 16), ' New folder'),
        h('button', { type: 'button', class: 'btn big', onClick: () => newTopic() }, icon('tag', 16), ' New topic'),
        h('button', { type: 'button', class: 'btn big', onClick: () => editSettings() }, icon('gear', 16), ' Site settings'),
        h('button', { type: 'button', class: 'btn big danger', onClick: () => { auth.signOut(); toast('Signed out.'); } }, ' Sign out')),
      h('div', { class: 'admin-card' }, h('h3', { text: 'Keeping your data safe' }),
        h('ul', { class: 'tips' },
          h('li', { text: 'Every change is a commit, so GitHub keeps every old version. Undo with “git revert”, or restore a file from the History page.' }),
          h('li', { text: 'In the repository: Settings → Rules (or Branches) → protect main with “Block force pushes” and “Restrict deletions”.' }),
          h('li', { text: 'Keep a backup now and then: “git pull” on your computer, or Code → Download ZIP.' }),
          h('li', { text: 'If a token leaks, delete it at GitHub → Settings → Developer settings → Fine-grained tokens, then make a new one.' }),
          h('li', { text: 'Everything here is public. Upload only books you have the right to share.' }))));
    {
      const token = ++sizeToken;
      auth.getClient().booksSize().then(({ bytes, truncated }) => {
        if (token !== sizeToken || !sizeBox.isConnected) return;
        sizeBox.textContent = `Books folder: ${fmtBytes(bytes)}${truncated ? '+' : ''} of about 1 GB allowed on GitHub Pages.`;
        if (bytes >= WARN_REPO_BYTES) { sizeBox.classList.add('note-warn'); sizeBox.textContent += ' It is getting full. Compress large PDFs, or ask about hosting PDFs elsewhere.'; }
      }).catch((e) => { if (token === sizeToken && sizeBox.isConnected) sizeBox.textContent = e instanceof GitHubError ? e.message : 'Could not check the size.'; });
    }
  }
  return { el: root, destroy() { sizeToken++; unsub(); } };
}

let panelWin = null;
export function openPanel(wm) {
  if (!panelWin || !panelWin.isOpen) {
    let panel;
    panelWin = wm.open('admin', {
      title: 'Admin', width: 720, height: 680,
      build: (w) => { panel = buildPanel({ phone: false }); return h('div', { class: 'wcol' }, h('div', { class: 'wtoolbar', 'data-drag': '' }, w.dots(), h('h2', { class: 'wtitle', text: 'Admin' })), panel.el); },
      onClose: () => { panel.destroy(); panelWin = null; import('../router.js').then((r) => { if (r.current().name === r.ADMIN_ROUTE) r.go('home', '', {}, { replace: true }); }); },
    });
  } else { panelWin.restore(); panelWin.focus(); }
}

export function phonePanel() {
  const panel = buildPanel({ phone: true });
  const el = h('div', { class: 'm-screen m-plain' }, h('header', { class: 'm-header' }, h('div', { class: 'm-toprow' }), h('h1', { class: 'm-title', text: 'Admin' })), h('div', { class: 'm-content' }, panel.el));
  return { el, destroy: panel.destroy };
}
