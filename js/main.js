// Boot: load the library data, choose the desktop or phone layout, start the router.
import { h, clear, isPhone, withTimeout } from './dom.js';
import * as store from './store.js';
import * as router from './router.js';
import * as auth from './admin/auth.js';
import * as local from './local.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/dialogs.js';

const root = document.getElementById('app');
let view = null;
let mountToken = 0;

function showLoading() {
  clear(root).append(h('div', { class: 'fatal' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading the library' })));
}

function showFatal(error) {
  clear(root).append(h('div', { class: 'fatal' }, h('div', { class: 'card', role: 'alert' },
    icon('lotus', 44),
    h('h2', { text: 'The library could not load' }),
    h('p', { text: error && error.message ? error.message : 'Something went wrong while loading.' }),
    h('p', { text: 'Check your internet connection, then try again.' }),
    h('button', { type: 'button', class: 'btn primary big', text: 'Try again', onClick: boot }))));
}

async function mount() {
  const token = ++mountToken;
  if (view) { view.destroy(); view = null; }
  const phone = isPhone();
  document.body.dataset.layout = phone ? 'phone' : 'desktop';
  const mod = await import(phone ? './ui/mobile.js' : './ui/desktop.js');
  if (token !== mountToken) return;
  clear(root);
  view = phone ? mod.mountPhone(root) : mod.mountDesktop(root);
  view.handleRoute(router.current());
}

/** Signed-in admins read the newest data through the GitHub API; everyone else reads the public files. */
async function loadLibrary() {
  if (auth.hasToken()) {
    try { await store.load(auth.apiReader()); return; } catch (e) { console.warn('Reading through GitHub failed; using the public files.'); }
  }
  await store.load();
}

async function boot() {
  showLoading();
  try {
    await loadLibrary();
    // Let the Gujarati and UI fonts load before anything measures text.
    await withTimeout(Promise.all([
      document.fonts.load('600 16px "Hind Vadodara"', 'વચનામૃત'),
      document.fonts.load('600 16px "Manrope"', 'Library'),
    ]), 2500, 'fonts').catch(() => {});
  } catch (e) {
    showFatal(e);
    return;
  }
  document.title = store.settings().siteName;
  await mount();
  router.onRoute((r) => view && view.handleRoute(r));
  router.start();
  window.matchMedia('(max-width: 768px)').addEventListener('change', mount);
}

// Admin only: pick up the newest data after signing in, and when returning to a tab that has been away.
let hadToken = auth.hasToken();
let hiddenAt = 0;
auth.subscribe(async () => {
  const has = auth.hasToken();
  if (has && !hadToken) { try { await store.load(auth.apiReader()); } catch { /* keep what is shown */ } }
  hadToken = has;
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (auth.hasToken() && hiddenAt && Date.now() - hiddenAt > 60000) { try { await store.load(auth.apiReader()); } catch { /* ignore */ } }
});

local.onQuotaError(() => toast('This browser has no room left to save notes. Please back up your notebook, then free some space.', { error: true }));

boot();
