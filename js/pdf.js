// Loads the vendored PDF.js (never from a CDN) and opens PDFs safely.
const BASE = new URL('../vendor/pdfjs/', import.meta.url);
let lib = null;

export class PdfError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; } // kind: 'password' | 'invalid' | 'missing' | 'network' | 'empty'
}

export async function loadPdfJs() {
  if (!lib) {
    lib = import(new URL('pdf.min.js', BASE).href).then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', BASE).href;
      return m;
    });
  }
  return lib;
}

/** Open a PDF from a same-origin path or raw bytes. isEvalSupported is always false (CVE-2024-4367 hardening). */
export async function openPdf(source, { onProgress } = {}) {
  const pdfjs = await loadPdfJs();
  const params = typeof source === 'string' ? { url: source } : { data: source };
  const task = pdfjs.getDocument({ ...params, isEvalSupported: false, enableXfa: false });
  if (onProgress) task.onProgress = onProgress;
  try {
    const doc = await task.promise;
    if (!doc.numPages) { doc.destroy(); throw new PdfError('empty', 'This PDF has no pages.'); }
    return doc;
  } catch (e) {
    if (e instanceof PdfError) throw e;
    if (e && e.name === 'PasswordException') throw new PdfError('password', 'This PDF is password-protected, so it cannot be shown here.');
    if (e && e.name === 'InvalidPDFException') throw new PdfError('invalid', 'This file is damaged or is not a real PDF.');
    if (e && e.name === 'MissingPDFException') throw new PdfError('missing', 'This PDF file could not be found.');
    throw new PdfError('network', 'The PDF could not be loaded. Check your connection and try again.');
  }
}
