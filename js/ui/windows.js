// Desktop window manager: open, focus, drag by the toolbar, minimise, maximise, close.
import { h } from '../dom.js';

const MENU_H = 36;
const MARGIN = 24;

export function createWindowManager(layer) {
  const wins = new Map();
  const listeners = new Set();
  let z = 10;
  let cascade = 0;

  const notify = () => listeners.forEach((fn) => fn());

  function defaultRect(offset) {
    const vw = layer.clientWidth, vh = layer.clientHeight;
    const width = Math.min(1328, Math.max(320, vw - 2 * MARGIN - 8));
    const height = Math.min(820, Math.max(300, vh - 54 - MARGIN));
    return { left: Math.round((vw - width) / 2 + offset), top: 54 + offset, width, height };
  }

  function applyRect(el, r) {
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
  }

  function open(id, { title, build, width, height, onClose } = {}) {
    if (wins.has(id)) { const w = wins.get(id); w.restore(); w.focus(); return w; }
    const rect = defaultRect((cascade++ % 4) * 26);
    if (width) rect.width = Math.min(width, layer.clientWidth - 16);
    if (height) rect.height = Math.min(height, layer.clientHeight - 60);
    const el = h('section', { class: 'window', role: 'dialog', 'aria-label': title, 'data-win': id });
    applyRect(el, rect);

    const win = {
      id, el, rect, maximized: false, minimized: false, isOpen: true,
      focus() { el.style.zIndex = ++z; wins.forEach((w) => w.el.classList.toggle('focused', w === win)); },
      restore() { if (win.minimized) { win.minimized = false; el.hidden = false; notify(); } },
      minimize() { win.minimized = true; el.hidden = true; notify(); },
      toggleMax() {
        win.maximized = !win.maximized;
        el.classList.toggle('maximized', win.maximized);
        if (win.maximized) { el.style.left = '0px'; el.style.top = MENU_H + 'px'; el.style.width = layer.clientWidth + 'px'; el.style.height = layer.clientHeight - MENU_H + 'px'; }
        else applyRect(el, win.rect);
      },
      close() {
        if (!win.isOpen) return;
        win.isOpen = false;
        el.remove();
        wins.delete(id);
        notify();
        onClose && onClose();
        const top = [...wins.values()].filter((w) => !w.minimized).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0];
        if (top) top.focus();
      },
      /** The three coloured dots that start every toolbar. */
      dots() {
        const dot = (cls, label, fn) => h('button', { type: 'button', class: 'dot ' + cls, 'aria-label': label, title: label, onClick: fn });
        return h('div', { class: 'dots' }, dot('red', 'Close window', () => win.close()), dot('yellow', 'Minimise window', () => win.minimize()), dot('green', 'Maximise window', () => win.toggleMax()));
      },
    };
    wins.set(id, win);
    el.append(build(win));
    layer.append(el);
    el.addEventListener('pointerdown', () => win.focus(), true);
    enableDrag(win);
    win.focus();
    notify();
    return win;
  }

  function enableDrag(win) {
    win.el.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-drag]');
      if (!handle || !win.el.contains(handle) || e.target.closest('button, input, select, textarea, a, label') || win.maximized || e.button !== 0) return;
      const startX = e.clientX, startY = e.clientY, left0 = win.el.offsetLeft, top0 = win.el.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const vw = layer.clientWidth, vh = layer.clientHeight;
        const left = Math.min(vw - 120, Math.max(120 - win.el.offsetWidth, left0 + ev.clientX - startX));
        const top = Math.min(vh - 60, Math.max(MENU_H, top0 + ev.clientY - startY));
        win.el.style.left = left + 'px'; win.el.style.top = top + 'px';
        win.rect = { ...win.rect, left, top };
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    win.el.addEventListener('dblclick', (e) => { if (e.target.closest('[data-drag]') && !e.target.closest('button, input, select, textarea, a, label')) win.toggleMax(); });
  }

  // keep windows reachable when the browser is resized
  window.addEventListener('resize', () => wins.forEach((w) => {
    if (w.maximized) { w.el.style.width = layer.clientWidth + 'px'; w.el.style.height = layer.clientHeight - MENU_H + 'px'; return; }
    const r = w.rect, vw = layer.clientWidth, vh = layer.clientHeight;
    r.width = Math.min(r.width, vw - 16); r.height = Math.min(r.height, vh - 60);
    r.left = Math.max(8, Math.min(r.left, vw - r.width - 8)); r.top = Math.max(MENU_H, Math.min(r.top, vh - r.height - 8));
    applyRect(w.el, r);
  }));

  return {
    open,
    get: (id) => wins.get(id) || null,
    isOpen: (id) => wins.has(id),
    isVisible: (id) => wins.has(id) && !wins.get(id).minimized,
    list: () => [...wins.values()],
    topWindow: () => [...wins.values()].filter((w) => !w.minimized).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0] || null,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
