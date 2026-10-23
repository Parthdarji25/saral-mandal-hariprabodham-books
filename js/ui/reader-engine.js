// PDF page rendering for the reader (desktop and phone): one page at a time, crisp on high-density screens,
// cancels work when pages turn quickly, keeps canvases within phone memory limits, and finds text in the book.
import { h, clear, norm } from '../dom.js';
import { openPdf, loadPdfJs, PdfError } from '../pdf.js';
import * as search from '../search.js';

const ZOOM_STEPS = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const LOAD_STALL_MS = 20000;

export class ReaderEngine {
  /**
   * host: the scrolling page area. onChange(): called when page, zoom or status changes.
   */
  constructor({ host, phone = false, padding = 40, onChange = () => {} }) {
    this.host = host; this.phone = phone; this.padding = padding; this.onChange = onChange;
    this.doc = null; this.book = null; this.page = 1; this.pages = 0;
    this.zoom = null;        // null = fit width, else a scale
    this.scale = 1;          // the scale actually used
    this.status = 'idle';    // idle | loading | ready | error
    this.error = null;
    this.rid = 0;
    this.renderTask = null;
    this.thumbs = null;
    this.matches = []; this.matchIndex = -1; this.findQuery = '';
    this.wrap = h('div', { class: 'page-wrap' });
    host.append(this.wrap);
    this.resizer = new ResizeObserver(() => { if (this.zoom === null && this.doc) this.schedule(); });
    this.resizer.observe(host);
    this.pdfjs = null;
  }

  // ----- loading -----
  async open(book, startPage = 1, zoom = null) {
    this.book = book; this.zoom = zoom; this.status = 'loading'; this.error = null; this.onChange();
    let stall;
    try {
      const doc = await new Promise((resolve, reject) => {
        const reset = () => { clearTimeout(stall); stall = setTimeout(() => reject(new PdfError('network', 'This book is taking too long to load. Check your connection and try again.')), LOAD_STALL_MS); };
        reset();
        openPdf(book.file, { onProgress: reset }).then(resolve, reject);
      });
      clearTimeout(stall);
      if (this.destroyed) { doc.destroy(); return; }
      this.pdfjs = await loadPdfJs();
      this.doc = doc; this.pages = doc.numPages;
      this.page = clamp(Math.round(startPage) || 1, 1, this.pages); // a saved page past the end is clamped
      this.status = 'ready';
      this.onChange();
      await this.render();
    } catch (e) {
      clearTimeout(stall);
      this.status = 'error';
      this.error = e instanceof PdfError ? e : new PdfError('network', 'The PDF could not be shown.');
      this.onChange();
    }
  }

  destroy() {
    this.destroyed = true; this.rid++;
    this.resizer.disconnect();
    if (this.renderTask) this.renderTask.cancel();
    if (this.thumbs) this.thumbs.destroy();
    if (this.doc) { this.doc.destroy(); this.doc = null; }
    this.wrap.remove();
  }

  // ----- navigation -----
  goTo(n) {
    if (!this.doc) return;
    const next = clamp(Math.round(n) || 1, 1, this.pages);
    if (next === this.page) return;
    this.page = next;
    this.onChange();
    this.schedule();
  }
  next() { this.goTo(this.page + 1); }
  prev() { this.goTo(this.page - 1); }

  setZoom(z) { this.zoom = z === null ? null : clamp(z, 0.25, 5); this.onChange(); this.schedule(); }
  fitWidth() { this.setZoom(null); }
  zoomBy(dir) {
    const cur = this.scale;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > cur + 0.01) : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.01);
    this.setZoom(next || cur);
  }

  // ----- rendering -----
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), 30);
  }

  async render() {
    if (!this.doc || this.destroyed) return;
    const id = ++this.rid;
    if (this.renderTask) { this.renderTask.cancel(); this.renderTask = null; }
    let page;
    try {
      page = await this.doc.getPage(this.page);
      if (id !== this.rid) return;
      const base = page.getViewport({ scale: 1 });
      const avail = Math.max(160, this.host.clientWidth - this.padding);
      this.scale = this.zoom === null ? clamp(avail / base.width, 0.25, 4) : this.zoom;
      const viewport = page.getViewport({ scale: this.scale });

      // Crisp output, but never exceed canvas memory limits (iOS is the strictest).
      let out = Math.min(window.devicePixelRatio || 1, this.phone ? 2 : 3);
      const maxPixels = this.phone ? 6e6 : 3.2e7;
      if (viewport.width * viewport.height * out * out > maxPixels) out = Math.sqrt(maxPixels / (viewport.width * viewport.height));

      const canvas = h('canvas', { class: 'page-canvas', role: 'img', 'aria-label': `Page ${this.page} of ${this.pages}` });
      canvas.width = Math.max(1, Math.floor(viewport.width * out));
      canvas.height = Math.max(1, Math.floor(viewport.height * out));
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null });
      this.renderTask = task;
      await task.promise;
      if (id !== this.rid) return;

      const textDiv = h('div', { class: 'textLayer' });
      textDiv.style.setProperty('--scale-factor', String(viewport.scale));
      textDiv.style.width = Math.floor(viewport.width) + 'px';
      textDiv.style.height = Math.floor(viewport.height) + 'px';
      this.wrap.style.width = Math.floor(viewport.width) + 'px';
      this.wrap.style.height = Math.floor(viewport.height) + 'px';
      clear(this.wrap).append(canvas, textDiv);
      this.onChange();
      try {
        const layer = new this.pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
        await layer.render();
        if (id === this.rid) this.highlight(textDiv);
      } catch (e) { if (!(e && e.name === 'AbortException')) console.warn('Text layer skipped', e && e.message); }
    } catch (e) {
      if (e && (e.name === 'RenderingCancelledException' || e.name === 'AbortException')) return;
      if (id !== this.rid) return;
      console.warn('Page render failed', e && e.message);
      this.status = 'error';
      this.error = new PdfError('invalid', 'This page could not be drawn. The PDF may be damaged.');
      this.onChange();
    } finally {
      if (page && id === this.rid) page.cleanup(); // free page resources we no longer need
    }
  }

  highlight(textDiv) {
    const ws = search.words(this.findQuery);
    if (!ws.length) return;
    textDiv.querySelectorAll('span').forEach((s) => { if (ws.some((w) => norm(s.textContent).includes(w))) s.classList.add('hl'); });
  }

  // ----- thumbnails (rendered lazily as they scroll into view) -----
  buildThumbs(container, onPick) {
    if (this.thumbs) this.thumbs.destroy();
    const doc = this.doc;
    const items = [];
    const queue = [];
    let busy = false;
    let dead = false;
    const draw = async () => {
      if (busy || dead) return;
      busy = true;
      while (queue.length && !dead) {
        const n = queue.shift();
        const box = items[n - 1];
        try {
          const page = await doc.getPage(n);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = (74 * Math.min(window.devicePixelRatio || 1, 2)) / vp1.width;
          const vp = page.getViewport({ scale });
          const c = h('canvas', { 'aria-hidden': 'true' });
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          if (!dead) box.canvasHost.replaceChildren(c);
          page.cleanup();
        } catch { /* thumbnail is optional */ }
      }
      busy = false;
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); queue.push(+en.target.dataset.n); } });
      draw();
    }, { root: container, rootMargin: '300px' });
    clear(container);
    for (let n = 1; n <= this.pages; n++) {
      const canvasHost = h('span', { class: 'thumb-canvas' });
      const btn = h('button', { type: 'button', class: 'thumb', 'data-n': n, 'aria-label': `Go to page ${n}`, onClick: () => onPick(n) }, canvasHost, h('span', { class: 'thumb-n', text: String(n) }));
      items.push({ btn, canvasHost });
      container.append(btn);
      io.observe(btn);
    }
    this.thumbs = {
      mark: (page) => { items.forEach((it, i) => it.btn.classList.toggle('current', i + 1 === page)); const cur = items[page - 1]; if (cur) cur.btn.scrollIntoView({ block: 'nearest' }); },
      destroy: () => { dead = true; io.disconnect(); },
    };
    this.thumbs.mark(this.page);
  }

  // ----- find in this book -----
  /** Returns 'ok' | 'none' | 'noText'. */
  async find(query) {
    this.findQuery = query;
    this.matches = []; this.matchIndex = -1;
    if (!search.words(query).length) { this.onChange(); this.rerenderHighlights(); return 'ok'; }
    const entry = await search.indexBook(this.book);
    if (query !== this.findQuery) return 'ok';
    if (!entry.searchable) { this.onChange(); return 'noText'; }
    this.matches = search.findInIndex(this.book.id, query);
    if (this.matches.length) { this.matchIndex = Math.max(0, this.matches.findIndex((m) => m.page >= this.page)); this.goTo(this.matches[this.matchIndex].page); this.rerenderHighlights(); }
    this.onChange();
    return this.matches.length ? 'ok' : 'none';
  }
  findStep(dir) {
    if (!this.matches.length) return;
    this.matchIndex = (this.matchIndex + dir + this.matches.length) % this.matches.length;
    this.goTo(this.matches[this.matchIndex].page);
    this.onChange();
  }
  rerenderHighlights() { const t = this.wrap.querySelector('.textLayer'); if (t) { t.querySelectorAll('.hl').forEach((s) => s.classList.remove('hl')); this.highlight(t); } }
}
