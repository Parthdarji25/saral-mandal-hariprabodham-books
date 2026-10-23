// Hash routes: #/library?f=<folderId>, #/reader/<bookId>?p=12, #/search?q=, #/notebook, #/topics, #/admin
const listeners = new Set();

export function parse(hash = location.hash) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...rest] = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const params = {};
  new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
  return { name: name || 'home', id: rest[0] || '', params };
}

export function href(name, id = '', params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false)).toString();
  return '#/' + (name === 'home' ? '' : name) + (id ? '/' + encodeURIComponent(id) : '') + (q ? '?' + q : '');
}

export function go(name, id = '', params = {}, { replace = false } = {}) {
  const target = href(name, id, params);
  if (location.hash === target || (target === '#/' && !location.hash)) { notify(); return; }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) notify();
}

export const current = () => parse();
export const onRoute = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function notify() { const r = parse(); listeners.forEach((fn) => fn(r)); }

/** Start listening for address changes; the caller handles the first route itself. */
export function start() {
  window.addEventListener('hashchange', notify);
}

/** Update the address bar without triggering route handling (used to keep the page number in the link). */
export function setQuiet(name, id = '', params = {}) {
  history.replaceState(null, '', href(name, id, params));
}

/** The admin lives at #/parth-admin-0369; there is no public Admin link. */
export const ADMIN_ROUTE = 'parth-admin-0369';
