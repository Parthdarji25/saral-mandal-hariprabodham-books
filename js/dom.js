// Small helpers shared by every screen. Text is always inserted with textContent; never innerHTML with data.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined || val === null || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'text') el.textContent = val;
      else if (key === 'style') {
        for (const [k, v] of Object.entries(val)) {
          if (k.startsWith('--')) el.style.setProperty(k, v);
          else el.style[k] = v;
        }
      } else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') el[key] = val;
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** append() with the children as arguments: skips null/false and flattens arrays. */
export const add = (el, ...children) => append(el, children);

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Gujarati (or any local-script) text with the right lang and font. */
export function gu(text, cls = '') {
  return h('span', { class: ('gu ' + cls).trim(), lang: 'gu', text: text });
}

export const isPhone = () => window.matchMedia('(max-width: 768px)').matches;

// ---------- text ----------
export const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : '');
export const norm = (s) => nfc(String(s ?? '')).toLowerCase();

const collEn = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const collGu = new Intl.Collator('gu', { sensitivity: 'base', numeric: true });
export const compareEn = (a, b) => collEn.compare(a, b);
export const compareGu = (a, b) => collGu.compare(a, b);

/** Sort key for A–Z: English title without a leading The / A / An. */
export function sortKey(title) {
  return nfc(title).trim().replace(/^(the|an|a)\s+/i, '');
}
export function letterOf(title) {
  const c = sortKey(title).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function slugify(name) {
  const s = nfc(name).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'item';
}
export function uid4() {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return [...a].map((n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');
}
export function makeId(name, taken) {
  for (let i = 0; i < 20; i++) {
    const id = slugify(name) + '-' + uid4();
    if (!taken || !taken.has(id)) return id;
  }
  return slugify(name) + '-' + uid4() + uid4();
}

export function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const safeColor = (c, fallback = '#B4520F') => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);

/** True only for http: or https: URLs. */
export function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/** Fill an element with plain text, turning http(s) URLs into safe links. */
export function richText(el, text) {
  clear(el);
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    const href = safeHref(m[0].replace(/[.,;)]+$/, ''));
    el.append(s.slice(last, m.index));
    if (href) el.append(h('a', { href, target: '_blank', rel: 'noopener noreferrer', text: m[0] }));
    else el.append(m[0]);
    last = m.index + m[0].length;
  }
  el.append(s.slice(last));
  return el;
}

// ---------- timing ----------
export const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
export function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(message || 'Timed out')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ---------- focus ----------
const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Keep Tab inside `container`, call onEscape on Esc, and return focus on release. */
export function trapFocus(container, onEscape) {
  const previous = document.activeElement;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onEscape && onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  const first = container.querySelector('[autofocus]') || container.querySelector(FOCUSABLE);
  if (first) first.focus();
  return () => {
    container.removeEventListener('keydown', onKey);
    if (previous && document.contains(previous) && previous.focus) previous.focus();
  };
}

// ---------- download ----------
export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
