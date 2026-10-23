// The desktop menu bar with real dropdown menus (File, Edit, View, Go, Help).
import { h } from '../dom.js';
import { icon } from './icons.js';

/**
 * getMenus() returns { File: [item…], … } fresh each time a menu opens, so check marks and disabled states are current.
 * item: { label, run, shortcut?, checked?, disabled? } or the string '-' for a separator.
 */
export function createMenubar({ siteName, getMenus, right }) {
  const bar = h('header', { class: 'menubar on-dark', role: 'menubar', 'aria-label': 'Menu bar' });
  const buttons = [];
  let openIndex = -1;
  let dropdown = null;

  const closeMenu = () => {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    if (openIndex >= 0) buttons[openIndex].setAttribute('aria-expanded', 'false');
    openIndex = -1;
  };

  function openMenu(i, focusFirst = false) {
    closeMenu();
    const name = Object.keys(getMenus())[i];
    const items = getMenus()[name];
    openIndex = i;
    const btn = buttons[i];
    btn.setAttribute('aria-expanded', 'true');
    dropdown = h('div', { class: 'menu-dropdown', role: 'menu', 'aria-label': name });
    items.forEach((it) => {
      if (it === '-') { dropdown.append(h('div', { class: 'menu-sep', role: 'separator' })); return; }
      dropdown.append(h('button', {
        type: 'button', role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem', class: 'menu-item', disabled: !!it.disabled,
        'aria-checked': it.checked === undefined ? null : String(!!it.checked),
        onClick: () => { closeMenu(); it.run && it.run(); },
      }, h('span', { class: 'menu-check', text: it.checked ? '✓' : '' }), h('span', { class: 'menu-label', text: it.label }), it.shortcut ? h('span', { class: 'menu-shortcut', text: it.shortcut }) : null));
    });
    const r = btn.getBoundingClientRect();
    dropdown.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 270)) + 'px';
    document.body.append(dropdown);
    if (focusFirst) dropdown.querySelector('.menu-item:not(:disabled)')?.focus();
  }

  Object.keys(getMenus()).forEach((name, i) => {
    const btn = h('button', { type: 'button', class: 'menu-btn', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', text: name,
      onClick: () => (openIndex === i ? closeMenu() : openMenu(i)),
      onMouseenter: () => { if (openIndex >= 0 && openIndex !== i) openMenu(i); },
      onKeydown: (e) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(i, true); }
        if (e.key === 'ArrowRight') buttons[(i + 1) % buttons.length].focus();
        if (e.key === 'ArrowLeft') buttons[(i + buttons.length - 1) % buttons.length].focus();
      } });
    buttons.push(btn);
  });

  document.addEventListener('keydown', onDocKey);
  document.addEventListener('pointerdown', onDocPointer, true);
  function onDocKey(e) {
    if (!dropdown) return;
    const items = [...dropdown.querySelectorAll('.menu-item:not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { const i = openIndex; closeMenu(); buttons[i] && buttons[i].focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at + items.length - 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); openMenu((openIndex + 1) % buttons.length, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); openMenu((openIndex + buttons.length - 1) % buttons.length, true); }
  }
  function onDocPointer(e) { if (dropdown && !dropdown.contains(e.target) && !bar.contains(e.target)) closeMenu(); }

  bar.append(
    h('span', { class: 'menu-logo', 'aria-hidden': 'true' }, icon('lotus', 20)),
    h('span', { class: 'menu-site', text: siteName }),
    ...buttons,
    h('span', { class: 'menu-spacer' }),
    right);
  return { el: bar, closeMenu, destroy() { closeMenu(); document.removeEventListener('keydown', onDocKey); document.removeEventListener('pointerdown', onDocPointer, true); } };
}
