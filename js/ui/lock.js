// Lock screen (desktop and phone). Shown once per browser session when settings.showLockScreen is on.
import { h } from '../dom.js';
import * as store from '../store.js';
import * as local from '../local.js';
import { icon, cover } from './icons.js';

const pad = (n) => String(n).padStart(2, '0');
export const clockTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const longDate = (d = new Date()) => `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })}`;
export const menuClock = (d = new Date()) => `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })} ${clockTime(d)}`;

/** Calls fn now and then every few seconds; returns a stop function. */
export function liveClock(fn) {
  fn();
  const timer = setInterval(fn, 5000);
  return () => clearInterval(timer);
}

const SESSION_KEY = 'smh:unlocked';
export function wasUnlocked() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } }
function markUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage blocked: lock shows again next load */ }
  local.setPref('lockSeenAt', Date.now());
}
export const shouldShowLock = () => store.settings().showLockScreen && !wasUnlocked();

/**
 * Builds the lock screen. `onOpen` runs when the visitor continues.
 * Returns { el, destroy }.
 */
export function createLock({ phone, onOpen, onContinueBook }) {
  const settings = store.settings();
  const verse = store.verseOfTheDay();
  const timeEl = h('div', { class: 'lock-time' });
  const dateEl = h('div', { class: 'lock-date' });
  const stopClock = liveClock(() => { const d = new Date(); timeEl.textContent = clockTime(d); dateEl.textContent = longDate(d); });

  const verseCard = verse ? h('div', { class: 'lock-verse' },
    h('div', { class: 'lock-verse-label', text: 'VERSE OF THE DAY' }),
    h('p', { class: 'lock-verse-text', text: verse.text }),
    verse.source ? h('p', { class: 'lock-verse-source', text: verse.source }) : null) : null;

  let continueCard = null;
  if (phone) {
    const last = local.recentIds().map(store.getBook).find(Boolean);
    const prog = last && local.getProgress(last.id);
    if (last && prog) {
      continueCard = h('button', { type: 'button', class: 'lock-continue', onClick: (e) => { e.stopPropagation(); open(); onContinueBook(last.id, prog.page); } },
        cover(last.color, 34, 46),
        h('span', { class: 'lock-continue-text' },
          h('strong', { text: 'Continue: ' + last.title }),
          h('span', { text: prog.pages ? `Page ${prog.page} of ${prog.pages}` : `Page ${prog.page}` })));
    }
  }

  const openBtn = h('button', { type: 'button', class: 'lock-open', onClick: (e) => { e.stopPropagation(); open(); } },
    phone ? 'Open my library' : ['Open my library ', icon('arrowR', 18)]);

  const bottom = h('div', { class: 'lock-bottom' },
    phone ? null : h('div', { class: 'lock-avatar' }, icon('lotus', 40)),
    h('div', { class: 'lock-site', text: settings.siteName }),
    settings.tagline ? h('div', { class: 'lock-tagline', text: settings.tagline }) : null,
    openBtn,
    h('div', { class: 'lock-hint', text: phone ? 'or swipe up' : 'Press Enter or click to continue' }));

  const el = h('div', { class: 'lock on-dark ' + (phone ? 'lock-phone' : 'lock-desktop') + (verse ? '' : ' no-verse'), role: 'dialog', 'aria-label': 'Lock screen', tabindex: '-1' },
    h('div', { class: 'lock-top' }, dateEl, timeEl), verseCard, continueCard, bottom);

  let done = false;
  function open() {
    if (done) return;
    done = true;
    markUnlocked();
    stopClock();
    document.removeEventListener('keydown', onKey);
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); onOpen && onOpen(); }, 220);
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.target.closest('input, textarea')) { e.preventDefault(); open(); } };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', open);

  // swipe up (phone) or any upward drag
  let startY = null;
  el.addEventListener('pointerdown', (e) => { startY = e.clientY; });
  el.addEventListener('pointerup', (e) => { if (startY !== null && startY - e.clientY > 60) open(); startY = null; });

  setTimeout(() => openBtn.focus({ preventScroll: true }), 50);
  return { el, destroy() { done = true; stopClock(); document.removeEventListener('keydown', onKey); el.remove(); } };
}
