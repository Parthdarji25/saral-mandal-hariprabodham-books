// The one path every admin change takes: read the newest data, apply the change, show the planned commit with an
// editable message, then write ONE atomic commit (or, in dry-run mode, show the plan and write nothing).
import { h, clear, add, fmtBytes, plural } from '../dom.js';
import * as store from '../store.js';
import * as auth from './auth.js';
import { toJson } from './github.js';
import { openDialog, toast } from '../ui/dialogs.js';

const DOC_KEYS = ['books', 'folders', 'topics', 'settings'];

export async function ensureSignedIn() {
  if (auth.isAdmin()) return true;
  return auth.openSignIn();
}

async function loadFresh() {
  if (auth.hasToken()) {
    try {
      const read = auth.apiReader();
      const docs = await Promise.all(DOC_KEYS.map((k) => read(store.DATA_FILES[k])));
      return Object.fromEntries(DOC_KEYS.map((k, i) => [k, docs[i]]));
    } catch (e) {
      if (!auth.isDryRun()) throw e;
    }
  }
  return store.getRaw();
}

/** Ids of deleted folders and topics are dropped from every book (cleaned on the next admin save). */
export function cleanOrphans(work) {
  const folderIds = new Set(work.folders.folders.map((f) => f.id));
  const topicIds = new Set(work.topics.topics.map((t) => t.id));
  work.books.books.forEach((b) => {
    if (Array.isArray(b.folders) && b.folders.some((id) => !folderIds.has(id))) b.folders = b.folders.filter((id) => folderIds.has(id));
    if (Array.isArray(b.topics) && b.topics.some((id) => !topicIds.has(id))) b.topics = b.topics.filter((id) => topicIds.has(id));
  });
}

/** Gujarati (and accented) text is stored in NFC form so it sorts, searches and compares the same everywhere. */
function normalizeText(node) {
  if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === 'string') node[i] = v.normalize('NFC'); else normalizeText(v); }); return; }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) { if (typeof node[k] === 'string') node[k] = node[k].normalize('NFC'); else normalizeText(node[k]); }
  }
}

async function prepare(apply) {
  const fresh = await loadFresh();
  const work = structuredClone(fresh);
  const result = (apply ? await apply(work) : null) || {};
  cleanOrphans(work);
  normalizeText(work);
  const files = [];
  DOC_KEYS.forEach((k) => { if (JSON.stringify(work[k]) !== JSON.stringify(fresh[k])) files.push({ path: store.DATA_FILES[k], text: toJson(work[k]) }); });
  files.push(...(result.files || []));
  return { work, files, notes: result.notes || [] };
}

const cleanMessage = (m) => String(m).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 200);
const sizeOf = (f) => (f.delete ? 0 : f.blob ? f.blob.size : new TextEncoder().encode(f.text).length);

function fileList(files) {
  return h('ul', { class: 'filelist' }, files.map((f) => h('li', { class: f.delete ? 'del' : '' }, f.delete ? `${f.path} — deleted` : `${f.path} (${fmtBytes(sizeOf(f))})`)));
}

/**
 * Options: message (default commit message), apply, and optionally title / intro (text or node shown first) / danger.
 * apply(work) edits a copy of { books, folders, topics, settings } and may return { files: [{ path, blob } | { path, delete: true }], notes: [text] }.
 * Throw an Error from apply to refuse the change (the caller's form shows the message).
 * Resolves with the commit result (or the dry-run plan), or null if cancelled.
 */
export async function runCommit({ message, apply, title, intro, danger = false }) {
  if (!(await ensureSignedIn())) return null;
  let prepared = await prepare(apply);
  if (!prepared.files.length) { toast('Nothing changed, so there is nothing to save.'); return null; }
  const dry = auth.isDryRun();

  return new Promise((resolve) => {
    let finished = false;
    const msgInput = h('input', { type: 'text', class: 'input', value: message, maxlength: '200', 'aria-label': 'Commit message' });
    const listHost = h('div', {});
    const notesHost = h('div', {});
    const fill = h('div', { class: 'progress-fill' });
    const bar = h('div', { class: 'progress-track', hidden: true }, fill);
    const barText = h('p', { class: 'hint', hidden: true });
    const drawList = () => { clear(listHost); add(listHost, fileList(prepared.files)); clear(notesHost); prepared.notes.forEach((n) => add(notesHost, h('p', { class: 'note-warn', text: n }))); };
    drawList();
    const body = h('div', {},
      intro ? (typeof intro === 'string' ? h('p', { class: 'intro', text: intro }) : intro) : null,
      dry ? h('p', { class: 'dry-banner', text: 'Dry run: nothing will be saved to GitHub. You will see exactly what would be committed.' }) : h('p', { text: 'This saves one commit to GitHub. The live site updates in about 1–2 minutes.' }),
      h('div', { class: 'field' }, h('label', { text: 'Commit message' }, msgInput)),
      h('div', { class: 'label-caps', text: plural(prepared.files.length, 'file') + ' in this commit' }), listHost, notesHost, bar, barText);

    const dlg = openDialog({
      title: title || (dry ? 'Preview commit (dry run)' : 'Save to GitHub'), body, wide: true,
      actions: [
        { label: 'Cancel', kind: 'cancel' },
        { label: dry ? 'Show planned commit' : danger ? 'Delete and save to GitHub' : 'Save to GitHub', kind: danger && !dry ? 'danger' : 'primary', onClick: async () => {
          const client = auth.getClient();
          const text = cleanMessage(msgInput.value) || cleanMessage(message);
          const attempt = async (retried) => {
            try {
              bar.hidden = barText.hidden = prepared.files.every((f) => !f.blob);
              return await client.commit({ message: text, files: prepared.files, onProgress: (p) => { fill.style.width = Math.round(p * 100) + '%'; barText.textContent = `Uploading… ${Math.round(p * 100)}%`; } });
            } catch (e) {
              if (e.kind !== 'conflict') throw e;
              if (retried) throw new Error('Someone else saved changes at the same time. Please reload the page, then try your change again.');
              prepared = await prepare(apply); // re-fetch the data and re-apply the change
              drawList();
              return attempt(true);
            }
          };
          const result = await attempt(false);
          store.setRaw(prepared.work); // the screen updates right away
          finished = true;
          if (result.dryRun) showPlan(result);
          else toast('Saved to GitHub ✓ — live in a few minutes (usually 1–2)', { href: result.url, linkText: 'View commit', ms: 8000 });
          resolve(result);
        } },
      ],
      onClose: () => { if (!finished) resolve(null); },
    });
    return dlg;
  });
}

export function showPlan(plan) {
  openDialog({
    title: 'Dry run: nothing was saved', wide: true,
    body: h('div', {},
      h('p', { class: 'dry-banner', text: 'This is exactly the commit that would be written to branch “' + plan.branch + '”. Nothing was sent to GitHub.' }),
      h('div', { class: 'label-caps', text: 'Commit message' }), h('p', { class: 'plan-message', text: plan.message }),
      h('div', { class: 'label-caps', text: 'Files' }),
      h('table', { class: 'plan-table' }, h('tbody', {}, plan.files.map((f) => h('tr', { class: f.action === 'delete' ? 'del' : '' }, h('td', { text: f.action === 'delete' ? 'delete' : 'write' }), h('td', { class: 'mono', text: f.path }), h('td', { class: 'num', text: f.action === 'delete' ? '' : fmtBytes(f.bytes) }))))),
      h('p', { class: 'hint', text: `${plural(plan.files.length, 'file')}, ${fmtBytes(plan.totalBytes)} in total. One commit.` })),
    actions: [{ label: 'Close', kind: 'primary' }],
  });
}
