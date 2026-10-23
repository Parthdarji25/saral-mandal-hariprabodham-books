# BUILD-LOG — Saral Mandal HariPrabodham

Build mode: all phases in one run, no commits until the user approves at the end.
Local test server: `python -m http.server 8000`. Headless browser: Edge via puppeteer-core (kept outside the repo).

## Phase 1 — Skeleton — DONE
- Built: folder structure, `.nojekyll`, `404.html` (+ `js/redirect.js`), `books/.gitkeep`, four empty data files, `css/tokens.css` (all tokens + self-hosted `@font-face`), `css/base.css`, `index.html` (CSP meta, inline wallpaper SVG), `favicon.svg` (original lotus), `fonts/` (Manrope, Lora, Kalam, Hind Vadodara as woff2, OFL licence), `vendor/pdfjs/` (PDF.js 4.10.38, pinned; `VERSION` file).
- Self-test: page loads, wallpaper renders, console clean, no outside requests.
- Open issues: none.

## Phase 2 — Data layer — DONE
- Built: `js/dom.js` (helpers: `h()` builds DOM with textContent only, NFC/collators, slugs, focus trap, safe links), `js/store.js` (load + validate + lookups, folder tree, place(), depth rules), `js/local.js` (safe localStorage, notes, progress, bookmarks, prefs, .txt export, validated 5 MB backup import), `js/search.js` (English+Gujarati, every-word match, lazy in-memory PDF text index), `js/pdf.js` (vendored PDF.js loader, `isEvalSupported:false`), `js/router.js`, `js/demo.js` (`?demo=1`, in-memory only), `js/ui/icons.js`.
- Self-test: Node test of store/search/local against the real empty data files and demo fixtures: empty loads; demo fills memory; Gujarati search finds Vachanamrut; multi-word AND search works; notes with HTML stay plain text; bad backup rejected; `__proto__` import key ignored.
- Open issues: none.

## Phase 3 — Lock screen, desktop, windows — DONE
- Built: `js/main.js` (boot, error screen with retry, layout switch at 768px, fonts awaited), `js/ui/lock.js`, `js/ui/desktop.js` (menu bar, the single Library icon, Continue reading + Recently added widgets that hide when empty, search hint pill, dock with open-dots, shortcuts `/` and Ctrl/⌘+K), `js/ui/menubar.js` (real File/Edit/View/Go/Help dropdowns with keyboard control), `js/ui/windows.js` (focus, drag by toolbar, minimise, maximise, close), `js/ui/dialogs.js` (dialogs/sheets with focus trap, toasts), `css/desktop.css`. `js/ui/library.js` is a placeholder until Phase 4.
- Self-test (Edge headless, `?demo=1`): lock shows, Enter opens desktop, exactly one desktop icon, double-click opens Library window, menu lists correct, close dot removes window, console clean. Screenshot checked against section 7A.
- Open issues: none.

## Phase 4 — Library window — DONE
- Built: `js/ui/library.js` (toolbar with Back/title/icon-list toggle/search; A–Z bar with greyed empty letters; sidebar: Library, folder tree with recursive counts, Topics with colour dots; folders-first then A–Z letter groups; icon + list views; info panel for place/folder/book; status bar; click selects, double-click/Enter opens; inline rename + draft folder; admin buttons, tick boxes and flows are wired to `js/admin/admin.js` and only render when signed in; all empty states), `css/library.css`.
- Self-test (`?demo=1`): folder route, All Books letter sections, selecting a book fills the info panel, list view, Gujarati search filter ("વચન" → 1 item), console clean. Screenshot compared with section 7A.
- Open issues: none. (Admin-only controls are exercised in Phase 9 dry-run.)


> DEVIATION (needs user's OK at the end): vendored PDF.js files are named `pdf.min.js` / `pdf.worker.min.js` instead of `.mjs`. Reason: `python -m http.server` on Windows serves `.mjs` as `text/plain`, which browsers refuse for module scripts and workers, so PDFs would not open in the local test. They are the unchanged ES-module builds of pdfjs-dist 4.10.38. GitHub Pages is fine with either name.

## Phase 5 — Search everything — DONE
- Built: `js/ui/spotlight.js` (centred glass panel, filter chips with counts, grouped results incl. Top hit, preview pane, ↑ ↓ Enter Esc, URL `#/search?q=`, "Inside books" lazy PDF text extraction cached in memory with progress, "My notes", scanned-book note, empty and recent states), `search.js` additions (`insideFromIndex`), spotlight styles in `css/library.css`.
- Self-test (Edge, `?demo=1` + generated test PDF): `/` opens, "bhakti" finds books/topic in English and Gujarati-titled rows, Inside-books search read the PDF through the vendored PDF.js (CSP on) and found "devotion" on 2 pages, Esc closes and restores the route, console clean.
- Open issues: none.

## Phase 6 — Reader and notebook — DONE
- Built: `js/ui/reader-engine.js` (one page at a time, devicePixelRatio-crisp canvas, cancels stale renders, phone canvas-size cap, free page resources, clamped saved page, 20-second stall timeout with retry/download, lazy thumbnails, find-in-book with highlight, text layer for selecting quotes), `js/ui/reader.js` (desktop window: toolbar, progress line, thumbnails, page area, night mode, notebook toggle, download, full screen, keyboard ← → + − Home End Ctrl+F, quiet `#/reader/<id>?p=N` link updates, saves position, friendly missing/bad-PDF messages with Download fallback), `js/ui/notebook.js` (notebook panel: Notes/Quotes/Bookmarks on ruled paper, page chips, edit/delete, Ctrl+Enter, "Use selected text"; Notebook app window; .txt export, .json backup, validated restore), `css/reader.css`, `js/pdf.js` (vendored PDF.js, `isEvalSupported:false`).
- Self-test (Edge, generated test PDF, `?demo=1`): opens at `?p=2`, 6 thumbnails, → key turns page and updates the link, note with `<img onerror>` shows as plain text (no element injected), find highlights the match and jumps to the page, zoom works, notes and page survive a reload, console clean. Fixed a progress-save loop and a form-text-loss bug found while testing; replaced null-unsafe native `append` with the `add()` helper.
- Open issues: none.

## Phase 7 — Phone layout — DONE
- Built: `js/ui/mobile.js` (phone lock with Continue card, home with search pill / Continue widget / app tiles only / dock, Library with back-to-parent, "…" actions, search box, topic chips, 2-column folder cards, A–Z headings and a vertical A–Z index strip, Topics list, Search with filters + grouped cards + lazy inside-PDF search, Notebook tab, tab bar), `js/ui/reader-mobile.js` (top bar with Find/Night/Bookmark, full-width page, swipe to turn, pinch and double-tap zoom, floating "‹ N / M ›" pill, draggable notebook bottom sheet), `css/mobile.css` (also turns every dialog into a bottom sheet ≤768px; safe-area insets, 100dvh, -webkit-backdrop-filter, 44px targets, 16px+ inputs), `actionSheet()` in dialogs, `search.groupedResults()` shared with desktop Search.
- Self-test (Edge, 390×844 touch emulation, `?demo=1`): lock → home → library → folder → search → reader → notebook → topics all render; no sideways scrolling on home/library/search/reader (scrollWidth 390); console clean. Fixed a CSS class collision (`.phone`) found in testing.
- Open issues: none.

## Phase 8 — Admin sign-in and GitHub client — DONE
- Built: `js/admin/auth.js` (fine-grained-token sign-in form with step-by-step token instructions, repo detection from settings or the `<owner>.github.io/<repo>` address, session/remember storage choice, connection test needing push permission, token expiry from the `github-authentication-token-expiration` header with a 7-day warning, 401/403 → signed out with a plain-English reason while form data is kept, sign out, dry-run switch / `?dryrun=1`), `js/admin/github.js` (REST client: raw-media reads that work past 1 MB, `booksSize`, ONE atomic commit via the Git Data API — ref → commit → blobs → tree (deleted file = `sha:null`) → commit → ref PATCH with `force:false`; PDF blob upload with real progress via XHR; unsafe-path guard; 30 s timeouts; dry-run returns the plan and sends no write), `js/admin/commit.js` (read newest data → apply change → editable commit message + file list → commit; conflict = re-fetch, re-apply, retry once; success toast with commit link; dry-run plan dialog), `js/admin/admin.js` panel (status, mode, token expiry, books/ size with 800 MB warning, Test commit button that writes then removes `data/.admin-test` in two commits — NOT pressed by me, data-safety tips), README (setup, Pages, adding books, keeping data safe, public-by-nature notice).
- Self-test (Edge, `?demo=1&dryrun=1`): sign-in dialog works, dry-only session created, Admin badge shows "dry run", Test commit shows both plans, **zero requests to github.com**; console clean.
- Open issues: none.

## Phase 9 — Admin editing — DONE
- Built: `js/admin/book-form.js` (Add PDF with `%PDF-` check, 25 MB warn / 95 MB refuse, PDF.js page count, password/corrupt refusal, ASCII-slug file name `books/<id>.pdf`, all fields + folder/topic tick boxes; Edit with optional Replace PDF; Delete book + its PDF in one commit), folder actions (create inline/dialog, rename English + Gujarati, colour, move with no-self/sub-folder and depth ≤4 rules, delete with cascade counts, duplicate-name warning), topic actions (create, rename, colour, reorder, delete with usage count), book folder/topic tick boxes saved as one commit, site settings (name, tagline, lock screen, verses, GitHub owner/repo/branch), `css/admin.css`. Orphaned folder/topic ids are cleaned from books on every admin save.
- Self-test (dry-run only, desktop and phone, `?demo=1`): every action produced exactly ONE planned commit with the right files and message — add/rename/delete folder (`data/folders.json`, delete also `data/books.json`), add/edit/delete topic, add book (`data/books.json` + `books/<slug>.pdf`), edit book, membership ticks, delete book (JSON + PDF deletion), settings; fake PDF refused; UI updated as if saved; no network calls to GitHub; phone sheets (folder "…", rename, + New topic) work with no sideways scroll.
- Open issues: none.

## Phase 10 — Polish and launch — DONE
- Done: section 11 audit (below), unused code/icons/exports removed, NFC normalisation of everything the admin writes, library re-render coalesced, contrast fixes, public-upload notice in Add PDF, `js/demo.js` and the temporary test PDF **deleted** (no references left), README final, favicon/meta tags in place.
- Edge-case tests (Edge headless; fixtures injected in memory, PDFs served by request interception, nothing written to the repo): damaged data file → error screen with Try again that recovers; missing PDF / corrupt PDF → clear message + Download instead; scanned PDF → "This book has no searchable text"; saved page 99 of 6 → clamped to 6; stalled PDF → message after 20 s; hostile `<img onerror>`/`<script>` strings in titles, names, descriptions, verses, notes → no elements injected, no scripts run, no dialogs; missing folder/topic/book links → friendly not-found; notes for a removed book → "This book was removed" + delete; storage blocked → notes still work; dialog focus trapped, Esc closes; lock shows once per session; 768px = phone, 769px = desktop. Final empty-site run: one desktop icon, no widgets/verse, empty states on desktop and phone, no sideways scroll, console clean.
- Deviation to confirm: vendored PDF.js files are `pdf.min.js` / `pdf.worker.min.js` (not `.mjs`) because `python -m http.server` serves `.mjs` as text/plain on Windows. CLAUDE.md section 3 still names `.mjs`.

### Section 11 audit
1 XSS: `h()` uses textContent; no innerHTML/eval anywhere (grep clean); icons are static SVG via DOMParser — `js/dom.js`, all `js/ui/*`. Tested with hostile data.
2 CSP: meta tag in `index.html` and `404.html`; scripts/styles/fonts `'self'`, `connect-src 'self' https://api.github.com`, `worker-src 'self' blob:`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'self'`; no inline scripts or style attributes; fonts self-hosted so no Google hosts (per your instruction). No third-party scripts.
3 PDF.js 4.10.38 (≥4.2.67), `vendor/pdfjs/VERSION`, `isEvalSupported:false` in `js/pdf.js`.
4 Token: fine-grained, session storage unless Remember; never logged/URL/error text (`js/admin/auth.js`, `github.js`); 401/403 → sign-out + reason + form kept; expiry header + 7-day warning.
5 Uploads: `%PDF-` check, ASCII slug paths `books/<id>.pdf`, `assertSafePath` rejects `..`/leading `/`, warn 25 MB / refuse 95 MB (`book-form.js`, `github.js`).
6 Backup import: shape + 5 MB check, unknown fields dropped, `__proto__` ids ignored, text escaped (`local.js`).
7 Links: external links `target=_blank rel="noopener noreferrer"`, only http/https (`dom.js` richText/safeHref).
8 Public notice: README top, Add PDF dialog.
9 No GitHub writes during the build; `force:false` only (`github.js`); every test was dry-run with zero api.github.com requests.
10 Big files: contents API + raw media fallback (`github.readFile`).
11 Size: books/ size + 800 MB warning in Admin panel; README explains options.
12 Pages delay: toast "live in a few minutes (usually 1–2)"; visitor fetch `cache:"no-store"`; admin reads via API.
13 Two admins: conflict → re-fetch, re-apply, retry once (`commit.js`); stale tab refresh after 60 s (`main.js`).
14 Interrupted upload: atomic commit; the form dialog stays open under the confirm dialog.
15 Corrupt data: error screen + retry; broken records skipped with console warning (`store.js`, `main.js`).
16 Folder rules: no move into self/descendants, depth ≤4, duplicate-name warning (`admin.js`).
17 Orphans: removed-book notes message + delete; not-found screens; deleted ids ignored and cleaned on admin save.
18 Duplicate titles allowed; slug suffix keeps ids unique.
19 Bad PDFs: password/corrupt/missing/zero pages → message + Download (`pdf.js`, reader views).
20 Scanned PDFs: "This book has no searchable text" in find and inside-search.
21 Huge PDFs: one page at a time, cancelled renders, lazy thumbnails, phone canvas cap, `page.cleanup()`.
22 Saved page clamped to last page.
23 Storage: every call in try/catch; quota toast; works without storage (tested).
24 Timeouts: data 20 s, PDF stall 20 s, GitHub 30 s; spinners always end in a message with retry.
25 Hash routes for every screen; Back works; `#/reader/<id>?p=N` kept current.
26 Phones: `100dvh`, `-webkit-backdrop-filter`, safe-area insets, 44px targets, inputs ≥16px, no zoom lock.
27 Dialogs/sheets trap focus, return it, Esc closes; icon buttons have aria-labels; reduced-motion honoured.
28 NFC everywhere (load, notes, admin writes), `Intl.Collator` en/gu, `lang="gu"`, no letter-spacing on Gujarati, fonts awaited before first render.

## Post-build change — desktop wallpaper photo
- `img/wallpaper.jpg` (your photo, 335 KB) is now the lock-screen and desktop wallpaper on the desktop layout only; its edges fade into purple and the clock sits above it. The phone keeps the painted dawn scene. Style: end of `css/desktop.css`.
- Phone wallpaper: `img/wallpaper-phone.jpg` (78 KB) is the lock-screen and home-screen background on phones only (styles at the end of `css/mobile.css`), with dark scrims top and bottom so text stays readable. The home app tiles now sit low, above the dock, so the photo's face stays visible; the phone lock clock is 84px and sits higher.
- Phone top bar: a slim bar (lotus, site name, clock, "…" menu) now shows on every phone screen except the lock screen, like the desktop menu bar. The "…" menu is the phone version of File / Edit / View / Go / Help (go to Library, Recent, Search, Notebook; night mode; lock; export, back up, restore notes; notes help). Headers moved up to make room. Code: `js/ui/mobile.js`, `css/mobile.css`.
- Phone home: removed the app tiles that repeated the dock (Library, Search, Notebook). Tiles are now Topics, Recent, Lock (+ Admin when signed in); the dock keeps Library, Search, Reader, Notebook.
- Admin entry: the Admin button is no longer shown to visitors. The admin panel opens only at `#/parth-admin-0369` (old `#/admin` does nothing); opening it reveals the Admin button for that browser session, and signed-in admins always see it. Note: this hides the entry point only; the real protection is still the GitHub token. Code: `ADMIN_ROUTE` in `js/router.js`, `reveal()` in `js/admin/auth.js`.
- Final check: all edge-case tests pass; desktop 1440 / phone 375 have no horizontal scroll or console errors; fixed a search panel that stayed open after navigating away, and gave small phone chips/buttons a 44px touch area.
- Removed the Test commit button from the Admin panel (and its README paragraph) as it is not needed.
