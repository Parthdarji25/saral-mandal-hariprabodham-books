// GitHub API client for the admin: reads, atomic multi-file commits (Git Data API), PDF upload with progress,
// conflict retry, and dry-run mode (writes are planned and returned, never sent).
// The token is only ever sent to https://api.github.com and never appears in logs, URLs or error messages.

const API = 'https://api.github.com';
const BLOB_MODE = '100644';
export const MAX_PDF_BYTES = 95 * 1024 * 1024;
export const WARN_PDF_BYTES = 25 * 1024 * 1024;
export const WARN_REPO_BYTES = 800 * 1024 * 1024;

export class GitHubError extends Error {
  // kind: 'auth' | 'notfound' | 'conflict' | 'ratelimit' | 'network' | 'invalid' | 'api'
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}

const PATH_OK = /^(data|books)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
/** Only plain relative paths inside data/ or books/ may be written. */
export function assertSafePath(path) {
  if (typeof path !== 'string' || path.length > 200 || path.startsWith('/') || path.includes('..') || path.includes('\\') || !PATH_OK.test(path)) {
    throw new GitHubError('invalid', 'Refusing to write to an unsafe file path.');
  }
}

const utf8 = (s) => new TextEncoder().encode(s).length;
export const toJson = (obj) => JSON.stringify(obj, null, 2) + '\n';

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(new GitHubError('invalid', 'The file could not be read.'));
    r.readAsDataURL(blob);
  });
}

/**
 * config: { getToken(), owner, repo, branch, dryRun, onAuthError(err), onExpiry(dateString) }
 */
export function createClient(config) {
  const { owner, repo, branch } = config;
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  function headers(accept) {
    const token = config.getToken();
    if (!token) throw new GitHubError('auth', 'You are not signed in.');
    return { Authorization: 'Bearer ' + token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  async function request(method, url, { body, accept, text = false } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    let res;
    try {
      res = await fetch(url.startsWith('http') ? url : base + url, {
        method, headers: { ...headers(accept), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      throw new GitHubError('network', e.name === 'AbortError' ? 'GitHub took too long to answer. Check your connection and try again.' : 'Could not reach GitHub. Check your internet connection.');
    } finally { clearTimeout(timer); }

    const expiry = res.headers.get('github-authentication-token-expiration');
    if (expiry && config.onExpiry) config.onExpiry(expiry);
    if (res.ok) return text ? res.text() : res.status === 204 ? null : res.json();

    let message = '';
    try { message = (await res.json()).message || ''; } catch { /* no body */ }
    if (res.status === 401) fail('auth', 'GitHub did not accept the token. It may have expired, been revoked, or be mistyped.');
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') fail('ratelimit', 'GitHub says too many requests were made. Please wait a few minutes and try again.');
      fail('auth', 'GitHub refused this action. The token may have expired, been revoked, or lack the "Contents: Read and write" permission for this repository.');
    }
    if (res.status === 404) fail('notfound', 'GitHub could not find that. Check the owner and repository name, and that the token includes this repository.');
    if (res.status === 409 || (res.status === 422 && /fast forward|not a fast|reference/i.test(message))) fail('conflict', 'Someone else saved changes at the same moment.');
    fail('api', `GitHub returned an error (${res.status}). ${message.replace(/(ghp_|github_pat_)\S+/g, '[hidden]')}`.trim(), res.status);
    return null;

    function fail(kind, msg, status) {
      const err = new GitHubError(kind, msg, status || res.status);
      if (kind === 'auth' && config.onAuthError) config.onAuthError(err);
      throw err;
    }
  }

  const api = {
    dryRun: !!config.dryRun,

    /** Tests the connection: the repository must be visible and writable. */
    async checkAccess() {
      const info = await request('GET', '');
      if (!info.permissions || !info.permissions.push) throw new GitHubError('auth', 'This token can read the repository but not write to it. Create it with "Contents: Read and write".');
      return info;
    },

    /** Reads a text file. Works for files over 1 MB too (falls back to the raw media type). Returns { text, sha }. */
    async readFile(path) {
      const meta = await request('GET', `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      if (meta.encoding === 'base64' && meta.content) return { text: b64ToUtf8(meta.content), sha: meta.sha };
      const text = await request('GET', `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, { accept: 'application/vnd.github.raw+json', text: true });
      return { text, sha: meta.sha };
    },
    async readJson(path) {
      const { text } = await api.readFile(path);
      try { return JSON.parse(text); } catch { throw new GitHubError('invalid', `${path} in the repository is not valid JSON.`); }
    },

    /** Total bytes of books/ (for the 800 MB warning). */
    async booksSize() {
      const head = await request('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
      const commit = await request('GET', `/git/commits/${head.object.sha}`);
      const tree = await request('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
      const bytes = tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith('books/')).reduce((s, t) => s + (t.size || 0), 0);
      return { bytes, truncated: !!tree.truncated };
    },

    /**
     * ONE atomic commit. files: [{ path, text } | { path, blob: File|Blob } | { path, delete: true }].
     * In dry-run mode nothing is sent; the planned commit is returned instead.
     */
    async commit({ message, files, onProgress }) {
      if (!files.length) throw new GitHubError('invalid', 'There is nothing to save.');
      files.forEach((f) => assertSafePath(f.path));
      const plan = {
        dryRun: !!config.dryRun, message, branch,
        files: files.map((f) => ({ path: f.path, action: f.delete ? 'delete' : 'write', bytes: f.delete ? 0 : f.blob ? f.blob.size : utf8(f.text) })),
      };
      plan.totalBytes = plan.files.reduce((s, f) => s + f.bytes, 0);
      if (config.dryRun) return plan;

      const head = await request('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
      const parent = head.object.sha;
      const parentCommit = await request('GET', `/git/commits/${parent}`);
      const writes = files.filter((f) => !f.delete);
      const total = writes.reduce((s, f) => s + (f.blob ? f.blob.size : utf8(f.text)), 0) || 1;
      let done = 0;
      const tree = [];
      for (const f of files) {
        if (f.delete) { tree.push({ path: f.path, mode: BLOB_MODE, type: 'blob', sha: null }); continue; }
        const size = f.blob ? f.blob.size : utf8(f.text);
        const blob = f.blob
          ? await uploadBlob(await readAsBase64(f.blob), 'base64', (frac) => onProgress && onProgress((done + size * frac) / total))
          : await request('POST', '/git/blobs', { body: { content: f.text, encoding: 'utf-8' } });
        done += size;
        onProgress && onProgress(done / total);
        tree.push({ path: f.path, mode: BLOB_MODE, type: 'blob', sha: blob.sha });
      }
      const newTree = await request('POST', '/git/trees', { body: { base_tree: parentCommit.tree.sha, tree } });
      const commit = await request('POST', '/git/commits', { body: { message, tree: newTree.sha, parents: [parent] } });
      await request('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { body: { sha: commit.sha, force: false } });
      return { ...plan, sha: commit.sha, url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${commit.sha}` };
    },
  };

  // PDFs go through XMLHttpRequest so the upload shows real progress.
  function uploadBlob(content, encoding, onFrac) {
    return new Promise((resolve, reject) => {
      let h;
      try { h = headers(); } catch (e) { reject(e); return; }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/git/blobs`);
      Object.entries({ ...h, 'Content-Type': 'application/json' }).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.timeout = 10 * 60 * 1000;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onFrac(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new GitHubError('api', 'GitHub sent an unreadable answer.')); } return; }
        if (xhr.status === 401 || xhr.status === 403) { const err = new GitHubError('auth', 'GitHub refused the upload. The token may have expired, been revoked, or lack the "Contents: Read and write" permission.', xhr.status); config.onAuthError && config.onAuthError(err); reject(err); return; }
        reject(new GitHubError('api', `GitHub could not take the file (error ${xhr.status}). Nothing was changed.`, xhr.status));
      };
      xhr.onerror = () => reject(new GitHubError('network', 'The upload was interrupted. Nothing was changed; you can try again.'));
      xhr.ontimeout = () => reject(new GitHubError('network', 'The upload took too long. Nothing was changed; you can try again.'));
      xhr.send(JSON.stringify({ content, encoding }));
    });
  }

  return api;
}
