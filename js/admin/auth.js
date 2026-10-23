// Admin sign-in with a fine-grained GitHub token. The token lives in sessionStorage unless "Remember on this device"
// is ticked (then localStorage). It is never logged, never put in a URL, never committed, and only sent to api.github.com.
import { h } from '../dom.js';
import * as store from '../store.js';
import { createClient, GitHubError } from './github.js';
import { openDialog, toast } from '../ui/dialogs.js';

const KEY_TOKEN = 'smh:token';
const KEY_META = 'smh:admin';
const KEY_DRY = 'smh:dryonly';
const listeners = new Set();
let session = null; // { token | null, remember, owner, repo, branch, dryRun, expiresAt: Date | null }
let warned = false;

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

const urlDry = () => new URLSearchParams(location.search).get('dryrun') === '1';
export const isAdmin = () => !!session;
/** The Admin button only appears for someone who has opened the secret admin address (or is signed in). */
export const isRevealed = () => !!session || read('sessionStorage', 'smh:adminseen') === '1';
export function reveal() { if (!isRevealed()) { write('sessionStorage', 'smh:adminseen', '1'); emit(); } }
export const hasToken = () => !!(session && session.token);
export const isDryRun = () => urlDry() || !!(session && (session.dryRun || !session.token));
export const info = () => (session ? { owner: session.owner, repo: session.repo, branch: session.branch, remember: session.remember, dryRun: isDryRun(), expiresAt: session.expiresAt, signedInWithToken: !!session.token, forcedDry: urlDry() } : null);

// ---------- storage (every call guarded) ----------
const read = (area, key) => { try { return window[area].getItem(key); } catch { return null; } };
const write = (area, key, val) => { try { window[area].setItem(key, val); } catch { /* storage blocked: the session lasts until reload */ } };
const remove = (key) => { for (const a of ['sessionStorage', 'localStorage']) { try { window[a].removeItem(key); } catch { /* ignore */ } } };

function restore() {
  for (const area of ['sessionStorage', 'localStorage']) {
    const token = read(area, KEY_TOKEN);
    const meta = read(area, KEY_META);
    if (token && meta) {
      try {
        const m = JSON.parse(meta);
        if (validRepo(m.owner, m.repo, m.branch)) {
          session = { token, remember: area === 'localStorage', owner: m.owner, repo: m.repo, branch: m.branch, dryRun: !!m.dryRun, expiresAt: m.expiresAt ? new Date(m.expiresAt) : null };
          return;
        }
      } catch { /* damaged: ignore */ }
    }
  }
  const dry = read('sessionStorage', KEY_DRY);
  if (dry) { try { const m = JSON.parse(dry); if (validRepo(m.owner, m.repo, m.branch)) session = { token: null, remember: false, owner: m.owner, repo: m.repo, branch: m.branch, dryRun: true, expiresAt: null }; } catch { /* ignore */ } }
}

function persist() {
  remove(KEY_TOKEN); remove(KEY_META); remove(KEY_DRY);
  if (!session) return;
  const meta = JSON.stringify({ owner: session.owner, repo: session.repo, branch: session.branch, dryRun: session.dryRun, expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null });
  if (session.token) { const area = session.remember ? 'localStorage' : 'sessionStorage'; write(area, KEY_TOKEN, session.token); write(area, KEY_META, meta); }
  else write('sessionStorage', KEY_DRY, meta);
}

const validRepo = (o, r, b) => /^[A-Za-z0-9_.-]{1,100}$/.test(o || '') && /^[A-Za-z0-9_.-]{1,100}$/.test(r || '') && /^[A-Za-z0-9_./-]{1,100}$/.test(b || '') && !String(b).includes('..');

// ---------- token expiry ----------
function setExpiry(header) {
  if (!session) return;
  const d = new Date(String(header).replace(' UTC', 'Z').replace(' ', 'T'));
  if (isNaN(d)) return;
  session.expiresAt = d;
  persist();
  if (!warned && daysLeft() !== null && daysLeft() <= 7) { warned = true; toast(expiryText(), { error: true, ms: 9000 }); }
}
export const daysLeft = () => (session && session.expiresAt ? Math.ceil((session.expiresAt - Date.now()) / 86400000) : null);
export function expiryText() {
  const d = daysLeft();
  if (d === null) return 'No expiry date was reported for this token.';
  if (d <= 0) return 'This token has expired. Create a new one.';
  return `This token expires in ${d} day${d === 1 ? '' : 's'}` + (d <= 7 ? '. Create a new one soon.' : '.');
}

// ---------- session ----------
export function getClient() {
  if (!session) throw new GitHubError('auth', 'You are not signed in.');
  const s = session;
  return createClient({ getToken: () => s.token, owner: s.owner, repo: s.repo, branch: s.branch, dryRun: isDryRun(), onAuthError: handleAuthError, onExpiry: setExpiry });
}

/** Reader used while signed in so the admin always sees the newest data. Visitors never use it. */
export function apiReader() {
  const client = getClient();
  return (path) => client.readJson(path);
}

function handleAuthError(err) {
  if (!session || !session.token) return;
  session = null;
  persist();
  emit();
  toast(err.message + ' You have been signed out; your unsaved form entries are kept.', { error: true, ms: 10000 });
}

export function setDryRun(on) {
  if (session && session.token) { session.dryRun = !!on; persist(); emit(); }
}

export function signOut() { session = null; warned = false; persist(); emit(); }

function guessRepo() {
  const g = store.settings().github;
  const host = location.hostname;
  const fromHost = host.endsWith('.github.io') ? { owner: host.split('.')[0], repo: location.pathname.split('/').filter(Boolean)[0] || '' } : { owner: '', repo: '' };
  return { owner: g.owner || fromHost.owner, repo: fromHost.repo || g.repo, branch: g.branch || 'main' };
}

async function signIn({ token, remember, owner, repo, branch, dryRun }) {
  owner = owner.trim(); repo = repo.trim(); branch = (branch || 'main').trim(); token = token.trim();
  if (!token && dryRun) owner = owner || 'your-github-name'; // a dry run never contacts GitHub, so a placeholder is fine
  if (!validRepo(owner, repo, branch)) throw new Error('Check the owner, repository and branch names. Use only letters, numbers, dots, dashes and underscores.');
  if (!token) {
    if (!dryRun) throw new Error('Paste your GitHub token, or switch on "Dry run" to look around without saving.');
    session = { token: null, remember: false, owner, repo, branch, dryRun: true, expiresAt: null };
  } else {
    const probe = { token, remember, owner, repo, branch, dryRun: !!dryRun, expiresAt: null };
    session = probe;
    try { await getClient().checkAccess(); }
    catch (e) { session = null; throw new Error(e.kind === 'notfound' ? 'GitHub cannot see "' + owner + '/' + repo + '" with this token. Check the names, and that the token was given access to this repository.' : e.message); }
  }
  persist();
  emit();
}

// ---------- the sign-in form ----------
/** Resolves true when signed in. */
export function openSignIn() {
  return new Promise((resolve) => {
    const guess = guessRepo();
    const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }, input), hint ? h('div', { class: 'hint', text: hint }) : null);
    const token = h('input', { type: 'password', class: 'input', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'GitHub token', placeholder: 'github_pat_…' });
    const owner = h('input', { type: 'text', class: 'input', value: guess.owner, autocomplete: 'off', 'aria-label': 'GitHub owner', placeholder: 'your GitHub name' });
    const repo = h('input', { type: 'text', class: 'input', value: guess.repo, autocomplete: 'off', 'aria-label': 'Repository' });
    const branch = h('input', { type: 'text', class: 'input', value: guess.branch, autocomplete: 'off', 'aria-label': 'Branch' });
    const remember = h('input', { type: 'checkbox' });
    const dry = h('input', { type: 'checkbox', checked: urlDry(), disabled: urlDry() });
    const steps = h('details', { class: 'steps' }, h('summary', { text: 'How to make the token (one time, about 2 minutes)' }),
      h('ol', {},
        h('li', { text: 'On github.com open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.' }),
        h('li', { text: 'Give it any name. Set the expiration to 90 days or less.' }),
        h('li', { text: 'Under Repository access choose “Only select repositories” and pick this repository only.' }),
        h('li', { text: 'Under Permissions → Repository permissions set Contents to “Read and write”. Leave everything else off.' }),
        h('li', { text: 'Click Generate token, copy it, and paste it below. GitHub shows it only once.' })));
    const body = h('div', {}, h('p', { text: 'Sign in to add and edit books. Every change is saved to GitHub as one commit.' }), steps,
      field('Token', token, 'Stays in this browser tab (or on this device if you tick the box below). It is only ever sent to GitHub.'),
      h('div', { class: 'field-row' }, field('Owner', owner), field('Repository', repo), field('Branch', branch)),
      h('label', { class: 'check' }, remember, h('span', { text: 'Remember on this device' })),
      h('label', { class: 'check' }, dry, h('span', { text: 'Dry run: show each commit but save nothing' })));
    let signed = false;
    const dlg = openDialog({
      title: 'Admin sign-in', body, wide: true,
      actions: [
        { label: 'Cancel', kind: 'cancel' },
        { label: 'Test and sign in', kind: 'primary', onClick: async () => { await signIn({ token: token.value, remember: remember.checked, owner: owner.value, repo: repo.value, branch: branch.value, dryRun: dry.checked }); signed = true; toast(isDryRun() ? 'Signed in (dry run: nothing will be saved).' : 'Signed in. Changes now save to GitHub.'); } },
      ],
      onClose: () => resolve(signed),
    });
    return dlg;
  });
}
restore();
