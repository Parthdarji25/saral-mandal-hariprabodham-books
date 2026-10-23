// Original line icons, folder, PDF and app-tile artwork. Every string here is static; only validated colours and
// textContent are ever mixed in.
import { h, safeColor, nfc } from '../dom.js';

const NS = 'http://www.w3.org/2000/svg';

function parse(markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

const G = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  chevL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  chevUp: '<path d="M6 14.5l6-6 6 6"/>',
  chevDown: '<path d="M6 9.5l6 6 6-6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r=".6"/><circle cx="4.6" cy="12" r=".6"/><circle cx="4.6" cy="18" r=".6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19h14"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  notebook: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2.5v3M15 2.5v3M8.5 10h7M8.5 14h7"/>',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  books: '<rect x="3.5" y="5" width="4" height="14" rx="1"/><rect x="9" y="5" width="4" height="14" rx="1"/><path d="M15.2 18.6l3.2-12.9 3 .8-3.2 12.9z"/><path d="M2.5 21h19"/>',
  openBook: '<path d="M12 6.5C9.5 5 6.5 4.7 3.5 5.5v12c3-.8 6-.5 8.5 1 2.5-1.5 5.5-1.8 8.5-1v-12c-3-.8-6-.5-8.5 1zM12 6.5v12"/>',
  lotus: '<path d="M12 4c-2.2 2.4-2.8 5.2 0 8 2.8-2.8 2.2-5.6 0-8z"/><path d="M12 12C9 12 6.2 10.4 5 8c3.2-.2 5.6 1.2 7 4z"/><path d="M12 12c3 0 5.8-1.6 7-4-3.2-.2-5.6 1.2-7 4z"/><path d="M5 17h14"/>',
  home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  fitWidth: '<path d="M4 12h16M7 8.5L4 12l3 3.5M17 8.5l3 3.5-3 3.5"/>',
  tag: '<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1"/>',
  refresh: '<path d="M19 8A8 8 0 0 0 5 9M5 5v4h4M5 16a8 8 0 0 0 14-1M19 19v-4h-4"/>',
};

export function icon(name, size = 18) {
  const el = parse(`<svg xmlns="${NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${G[name] || ''}</svg>`);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.classList.add('ic');
  return el;
}

export const FOLDER_COLORS = {
  amber: ['#F5B04A', '#D98A22'],
  saffron: ['#F08A3C', '#C9601A'],
  blue: ['#9FB8F0', '#6F8FD6'],
};

export function folderIcon(color = 'amber', width = 64) {
  const [front, back] = FOLDER_COLORS[color] || FOLDER_COLORS.amber;
  const el = parse(`<svg xmlns="${NS}" viewBox="0 0 64 52" aria-hidden="true" focusable="false"><path d="M4 9a4 4 0 0 1 4-4h15l6 6h27a4 4 0 0 1 4 4v5H4z" fill="${back}"/><rect x="4" y="15" width="56" height="33" rx="4" fill="${front}"/><rect x="8" y="15" width="48" height="3" rx="1.5" fill="#fff" opacity=".4"/></svg>`);
  el.setAttribute('width', width);
  el.setAttribute('height', Math.round((width * 52) / 64));
  return el;
}

export function pdfIcon(color, title = '', width = 48) {
  const c = safeColor(color);
  const el = parse(`<svg xmlns="${NS}" viewBox="0 0 48 58" aria-hidden="true" focusable="false"><path d="M6 1h26l12 12v42a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z" fill="#fff" stroke="#D9D3E2" stroke-width="1.2"/><path d="M32 1v9a3 3 0 0 0 3 3h9z" fill="#ECE8F1"/><rect x="3" y="16" width="42" height="18" fill="${c}"/><rect x="7" y="44" width="22" height="9" rx="2" fill="#C8371D"/></svg>`);
  const letter = document.createElementNS(NS, 'text');
  letter.setAttribute('x', 24); letter.setAttribute('y', 30);
  letter.setAttribute('text-anchor', 'middle');
  letter.setAttribute('font-family', 'Georgia, serif');
  letter.setAttribute('font-size', 14); letter.setAttribute('font-weight', 700);
  letter.setAttribute('fill', '#fff');
  letter.textContent = (nfc(title).replace(/^(the|an|a)\s+/i, '').charAt(0) || '·').toUpperCase();
  const tag = document.createElementNS(NS, 'text');
  tag.setAttribute('x', 18); tag.setAttribute('y', 50.6);
  tag.setAttribute('text-anchor', 'middle');
  tag.setAttribute('font-family', 'Arial, sans-serif');
  tag.setAttribute('font-size', 6.5); tag.setAttribute('font-weight', 700);
  tag.setAttribute('fill', '#fff');
  tag.textContent = 'PDF';
  el.append(letter, tag);
  el.setAttribute('width', width);
  el.setAttribute('height', Math.round((width * 58) / 48));
  return el;
}

export const APPS = {
  library: { color: '#D9772B', glyph: 'books', label: 'Library' },
  search: { color: '#4867C9', glyph: 'search', label: 'Search' },
  reader: { color: '#2F7A5B', glyph: 'openBook', label: 'Reader' },
  notebook: { color: '#D9A520', glyph: 'notebook', label: 'Notebook' },
  topics: { color: '#7A4FB0', glyph: 'lotus', label: 'Topics' },
  recent: { color: '#2F7A5B', glyph: 'clock', label: 'Recent' },
  lock: { color: '#3A3550', glyph: 'lock', label: 'Lock' },
  admin: { color: '#6B6F7E', glyph: 'gear', label: 'Admin' },
};

/** A rounded-square app icon. `size` in px; the corner radius scales with it. */
export function appTile(name, size = 60) {
  const a = APPS[name];
  const tile = h('span', { class: 'app-tile', style: { '--c': a.color, '--s': size + 'px' } });
  tile.append(icon(a.glyph, Math.round(size * 0.52)));
  return tile;
}

/** A coloured cover swatch for a book (list rows, widgets, previews). */
export function cover(color, w, hgt) {
  return h('span', { class: 'cover', style: { '--c': safeColor(color), '--w': w + 'px', '--h': hgt + 'px' } });
}
