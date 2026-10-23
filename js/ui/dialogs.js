// Dialogs (desktop) / bottom sheets (phone), confirmations and toasts. Focus is trapped and returned; Esc closes.
import { h, isPhone, trapFocus, safeHref } from '../dom.js';

const host = () => document.getElementById('layer-dialogs');

/**
 * actions: [{ label, kind: 'primary' | 'danger' | 'cancel' | undefined, onClick? }]
 * onClick may be async; throw an Error to show it inside the dialog, return false to keep it open.
 * Returns { el, body, close, setError }.
 */
export function openDialog({ title, body, subtitle, actions = [], wide = false, onClose } = {}) {
  const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const bodyEl = h('div', { class: 'body' }, body);
  const buttons = [];
  let closed = false;
  let release = () => {};

  const close = (result) => {
    if (closed) return;
    closed = true;
    release();
    overlay.remove();
    onClose && onClose(result);
  };
  const setError = (msg) => { error.textContent = msg || ''; error.hidden = !msg; };

  const actionBar = h('div', { class: 'actions' }, actions.map((a) => {
    const btn = h('button', {
      type: 'button',
      class: 'btn' + (a.kind === 'primary' ? ' primary' : '') + (a.kind === 'danger' ? ' danger-solid' : ''),
      text: a.label,
      onClick: async () => {
        if (!a.onClick) { close(a.kind === 'cancel' ? false : true); return; }
        setError('');
        buttons.forEach((b) => { b.disabled = true; });
        try {
          const keep = await a.onClick(dialog);
          if (keep !== false) close(true);
        } catch (e) { setError(e && e.message ? e.message : 'Something went wrong.'); }
        finally { buttons.forEach((b) => { b.disabled = false; }); }
      },
    });
    buttons.push(btn);
    return btn;
  }));

  const dialog = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('h2', { id: titleId, text: title }),
    subtitle ? h('p', { class: 'sub', text: subtitle }) : null,
    bodyEl, error, actions.length ? actionBar : null);

  const overlay = h('div', { class: 'overlay' }, dialog);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay && isPhone()) close(false); });
  host().append(overlay);
  release = trapFocus(dialog, () => close(false));
  dialog.close = close;
  dialog.setError = setError;
  dialog.bodyEl = bodyEl;
  return dialog;
}

/** Resolves true if the person confirms. */
export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let answered = false;
    const dlg = openDialog({
      title,
      body: typeof message === 'string' ? h('p', { text: message }) : message,
      actions: [
        { label: cancelLabel, kind: 'cancel', onClick: () => { answered = true; resolve(false); } },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
    return dlg;
  });
}

/** A bottom sheet of full-width choices (phone folder/book actions). Each action: { label, kind?: 'danger', run }. */
export function actionSheet({ title, subtitle, actions }) {
  const sheet = openDialog({
    title, subtitle,
    body: h('div', { class: 'sheet-actions' }, actions.map((a) => h('button', { type: 'button', class: 'sheet-btn' + (a.kind === 'danger' ? ' danger' : ''), text: a.label, onClick: () => { sheet.close(); if (a.run) a.run(); } }))),
    actions: [{ label: 'Cancel', kind: 'cancel' }],
  });
  return sheet;
}

/** Shows a pill at the bottom; disappears after 6 seconds. `href` must be http(s). */
export function toast(message, { href, linkText = 'View commit', error = false, ms = 6000 } = {}) {
  const layer = document.getElementById('layer-toasts');
  const safe = href ? safeHref(href) : null;
  const el = h('div', { class: 'toast' + (error ? ' error' : '') },
    h('span', { text: message }),
    safe ? h('a', { href: safe, target: '_blank', rel: 'noopener noreferrer', text: linkText }) : null);
  layer.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

