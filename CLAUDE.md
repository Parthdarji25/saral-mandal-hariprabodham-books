# CLAUDE.md — Saral Mandal HariPrabodham

Instructions for Claude working in this repository. Read this whole file before doing anything, at the start of every session.

## 1. What we are building

**Saral Mandal HariPrabodham** is a spiritual PDF library website, focused on Swaminarayan scriptures and other spiritual books. Books are browsed by **folder**, by **topic** and **A to Z**, and read in the browser with a **notebook** beside them.

- Hosted free on **GitHub Pages**: a static site with no server and no database.
- Plain **HTML, CSS and JavaScript** (ES modules). No frameworks, no build step, no npm packages at runtime.
- The look is a **desktop computer**: lock screen → desktop with wallpaper, menu bar and dock → app windows. On phones the same app becomes a **phone home screen** with a tab bar.
- **All library data lives in this repo** as JSON files plus PDFs. An **admin** signs in on the site with a GitHub token. Every add, edit and delete is saved as **one git commit through the GitHub API**, and GitHub Pages redeploys automatically.
- Visitors' personal data (notes, quotes, bookmarks, reading position) stays in their own browser (`localStorage`). It is never sent anywhere.
- **English and Gujarati** are both first-class: Gujarati titles display, sort and search correctly.
- The site starts **EMPTY**. Do not add sample books, folders, topics, verses or placeholder PDFs, and never commit test data. Every screen has a friendly **empty state**.

## 2. Working rules (always follow)

### Build mode: ALL PHASES IN ONE GO, ONE APPROVAL AT THE END

1. **Build Phases 1 → 10 in order, in one continuous run**, without stopping to ask between phases. Only stop early for a real blocker, such as a decision only the user can make. Then ask one clear question and continue once answered.
2. **Start of the run:** read this file, run `git status` and `git log --oneline -5`, and confirm the remote is set and the branch is `main`. There are **no screenshots**: the design is fully specified in words in sections 7 and 7A. Follow them exactly and don't ask for images.
3. **NO COMMITS AND NO PUSHES DURING THE BUILD.** Don't run `git commit`, `git push`, `git tag`, or any GitHub API call that writes. Work only in the local files. `git add` is fine.
4. **Keep `BUILD-LOG.md` updated** in the repo root. After each phase, add the phase number, what was built, the files touched, the self-test result and any open issues. If the session is interrupted, resume from the first phase not marked done in the log.
5. **Self-test after every phase** before moving on, including the section 11 items that phase touches: start `python -m http.server 8000`, then check for JS errors (`node --check` on every module) and, if a headless browser is available, load the pages and confirm the console is clean. Fix problems before starting the next phase.
6. **At the very end** (after Phase 10), STOP and give the user:
   - a short summary of every phase, from BUILD-LOG.md,
   - the full list of files,
   - a step-by-step local test checklist for desktop and phone (section 9),
   - a pre-commit safety check: no tokens or secrets, no test PDFs, no test data in `data/*.json`, `js/demo.js` removed, no file over 95 MB,
   - then ask exactly: **"Everything is built and tested locally. Ready to commit and push to GitHub?"**
7. **Wait for the user's approval.** If they ask for changes, make them, re-test and ask again. Only after an explicit **yes**:
   ```
   git add -A
   git commit -m "Build Saral Mandal HariPrabodham v1 (phases 1–10)"
   git push origin main
   ```
   Then say the live site updates in about 1–2 minutes at `https://<user>.github.io/saral-mandal-hariprabodham/`, and ask separately before creating the `v1.0` tag.
8. **After the first push**, any later fix follows the same rule: change, test, summarise, then ask **"Ready to commit this fix to GitHub?"**, and commit only after yes.

### General rules

9. **Never force-push, never rewrite history, never delete branches or tags.** To undo a pushed commit use `git revert <sha>`, then ask before pushing.
10. Keep it simple: small files, clear names, comments only where the logic isn't obvious. No dead code, no unused files.
11. Don't change the data formats (section 5) without asking. If a change is approved, update this file too.
12. Ask before deleting or renaming files that existed before the build started.

## 3. Tech stack and constraints

- HTML5, modern CSS (custom properties, grid, flex, `backdrop-filter`), vanilla JS ES modules (`<script type="module">`).
- **PDF.js:** vendor a pinned release of `pdfjs-dist` into `vendor/pdfjs/` (`pdf.min.mjs`, `pdf.worker.min.mjs`, `LICENSE`). Load it with `import()` and call `getDocument({ url })`. Never load it from a CDN at runtime.
- **Fonts** from Google Fonts: **Manrope** (UI), **Lora** (verses, page titles), **Kalam** (handwritten notes), **Hind Vadodara** (Gujarati).
- **Hash routing** (`#/library`, `#/library?f=<folderId>`, `#/reader/<bookId>?p=12`, `#/search?q=`) so every URL works on GitHub Pages without server rewrites.
- Must work in current Chrome, Edge, Safari and Firefox, desktop and mobile. Breakpoint: **≤ 768px = phone layout**.
- **File limits:** GitHub refuses files over 100 MB. The admin panel warns above 25 MB per PDF and refuses above 95 MB; bigger files are added with git or GitHub Desktop.
- Wrap every `localStorage` / `sessionStorage` call in try/catch. The app must still work, without saving, when storage is blocked.
- Text handling: normalise to NFC, set `lang="gu"` on Gujarati text, and sort with `Intl.Collator` (`en` and `gu`).

## 4. Folder structure

```
/
├─ index.html              App shell (lock screen, desktop, phone home all live here)
├─ 404.html                Redirects to index.html
├─ .nojekyll               Tells GitHub Pages to serve files as-is
├─ README.md               For humans: what it is, how to run, deploy, add books
├─ CLAUDE.md               This file
├─ css/
│  ├─ tokens.css           Colours, fonts, spacing (section 7)
│  ├─ base.css             Reset, typography, buttons, inputs, toasts, empty states
│  ├─ desktop.css          Lock, menu bar, desktop, dock, windows
│  ├─ mobile.css           Phone lock, home, tab bar, sheets
│  └─ reader.css           PDF reader + notebook
├─ js/
│  ├─ main.js              Boot: load data, pick desktop/phone layout, start router
│  ├─ router.js            Hash routes
│  ├─ store.js             Loads /data/*.json; library state; lookups; folder tree
│  ├─ local.js             Visitor data in localStorage (notes, progress, bookmarks, prefs)
│  ├─ search.js            Search books/folders/topics/notes; inside-PDF text index
│  ├─ ui/
│  │  ├─ icons.js          Inline SVG icons (folder, PDF tile, app icons) — original artwork only
│  │  ├─ lock.js
│  │  ├─ desktop.js        Menu bar, wallpaper, the single Library icon, widgets, dock
│  │  ├─ windows.js        Window manager (open, focus, drag, minimise, maximise, close)
│  │  ├─ library.js        Library window (desktop)
│  │  ├─ spotlight.js      Search everything (desktop)
│  │  ├─ reader.js         PDF reader + notebook (both layouts)
│  │  └─ mobile.js         Phone screens: lock, home, library, search, tab bar, sheets
│  └─ admin/
│     ├─ github.js         GitHub API client (read files, atomic commits, PDF upload)
│     ├─ auth.js           Token sign-in / sign-out
│     └─ admin.js          Admin actions + forms (books, folders, topics, settings)
├─ data/
│  ├─ books.json
│  ├─ folders.json
│  ├─ topics.json
│  └─ settings.json
├─ books/                  PDF files (starts empty; keep a .gitkeep)
└─ vendor/pdfjs/           PDF.js (pinned)
```

## 5. Data (stored in the repo)

All four files start empty, exactly like this:

`data/books.json`
```json
{ "version": 1, "books": [] }
```
`data/folders.json`
```json
{ "version": 1, "folders": [] }
```
`data/topics.json`
```json
{ "version": 1, "topics": [] }
```
`data/settings.json`
```json
{
  "version": 1,
  "siteName": "Saral Mandal HariPrabodham",
  "tagline": "",
  "showLockScreen": true,
  "verses": [],
  "github": { "owner": "", "repo": "saral-mandal-hariprabodham", "branch": "main" }
}
```

### Record shapes

**Book**
```json
{
  "id": "vachanamrut-k3f9",
  "title": "Vachanamrut",
  "titleLocal": "વચનામૃત",
  "author": "",
  "tradition": "Swaminarayan",
  "language": "Gujarati",
  "description": "",
  "file": "books/vachanamrut-k3f9.pdf",
  "pages": 0,
  "sizeBytes": 0,
  "color": "#B4520F",
  "folders": ["folder-id"],
  "topics": ["topic-id"],
  "addedAt": "2026-10-23T10:00:00Z",
  "updatedAt": "2026-10-23T10:00:00Z"
}
```
**Folder**: `{ "id", "name", "nameLocal": "", "parentId": null | "folder-id", "color": "amber" | "saffron" | "blue", "order": 0 }`. Folders nest, up to 4 levels deep.

**Topic**: `{ "id", "name", "nameLocal": "", "color": "#C8371D", "order": 0 }`

**Verse**: `{ "text", "source", "bookId": null | "book-id" }`

### Data rules

- **IDs** are an ASCII slug of the English name plus a 4-character random suffix (`gita-study-a1b2`). They never change, even on rename. Never use Gujarati characters in ids or file names.
- A book can be in **many folders** and have **many topics**. Folders and topics never contain book data; books point to them.
- **Deleting a folder** deletes its sub-folders, removes those folder ids from every book, and keeps all books.
- **Deleting a topic** removes its id from every book and keeps the books.
- **Deleting a book** removes its JSON entry and its PDF in the same commit.
- **Sorting A–Z:** sort by the English title, ignoring a leading "The", "A" or "An". The A–Z bar and letter groups use the English title's first letter. Folders sort by `order`, then by name.
- **Searching:** normalise text (NFC, lowercase) and match title, titleLocal, author, tradition, language, description, and folder and topic names (English and Gujarati). Every word typed must match.
- **Never write test data into `data/*.json` on disk.** For UI testing during development, `js/demo.js` may inject in-memory fixtures, but only when the URL has `?demo=1`. It never writes to disk or GitHub, and it is deleted in Phase 10, so the live site never shows demo data.

### Visitor data (localStorage, keys prefixed `smh:`)

- `smh:notes` — `[{ id, bookId, page, kind: "note" | "quote", text, createdAt, updatedAt }]`
- `smh:progress` — `{ [bookId]: { page, pages, at } }`
- `smh:bookmarks` — `{ [bookId]: [page, …] }`
- `smh:prefs` — `{ night, zoom, notebookOpen, view: "icons" | "list", lockSeenAt }`
- The Notebook exports notes as `.txt` and backs up / restores everything as `.json`. Remind visitors that notes live only on their device.

## 6. Content plan (guidance only — DO NOT seed)

The admin will add these later through the Admin panel. Use them only as example text in placeholders and help copy, never as data.

- Likely top-level folders: **Swaminarayan** (with sub-folders such as Shastras, Lila & Charitra, Kirtan & Kavya, Daily Path), Gita Study, other traditions, To Read.
- Likely topics: Bhakti & Upasana, Dharma & Niyam, Gnan, Vairagya, Lila & Charitra, Kirtan, Satsang & Seva, Meditation.
- Many books are in **Gujarati** or **Sanskrit**, so the UI must show `titleLocal` beside the English title everywhere a book appears.
- The search box placeholder is "Search in English or ગુજરાતી".

## 7. Design spec (match the approved UI mocks)

The approved mocks are described exactly in **section 7A** (no screenshots). Use **original** icons and artwork only: no Apple logos, icons or wallpapers. Generic window controls (three coloured dots) are fine.

### Colour tokens (`css/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1F1B2D` | Main text |
| `--muted` | `#6B6578` | Secondary text |
| `--accent` | `#B4520F` | Primary buttons, selection, links |
| `--accent-dark` | `#8A3D06` | Gujarati titles, text on light accent backgrounds |
| `--danger` | `#A3261A` | Delete actions |
| `--window` | `#FFFFFF` | Window content |
| `--chrome` | `#F7F5FA` | Window toolbar, status bar |
| `--sidebar` | `#F1EEF5` | Window sidebar |
| `--line` | `#E4E0EA` | Borders |
| `--select` | `#FBE7D3` | Selected tile/row background |
| `--sidebar-active` | `#E3DCEC` | Active sidebar row |
| `--app-bg` | `#F7F5FA` | Phone app screens |
| `--pdf-tag` | `#C8371D` | "PDF" label on file icons |
| `--paper` | `#FFFDF6` | Notebook paper |
| `--paper-line` | `#DCE3EC` | Ruled lines (every 32px desktop, 30px phone) |
| `--paper-margin` | `#EBC2B8` | Notebook margin line |
| `--note-ink` | `#24324F` | Handwritten note text |

- **Folder colours** (front / back): amber `#F5B04A / #D98A22`, saffron `#F08A3C / #C9601A`, blue `#9FB8F0 / #6F8FD6`.
- **Topic palette:** `#C8371D #D9772B #D9A520 #2F7A5B #1F5F7A #4867C9 #7A4FB0 #BE123C #6B6F7E`.
- **Wallpaper** (inline SVG, original): a dawn sky gradient `#1F2358 → #6E3F7E (45%) → #E07A5F (70%) → #F6BD7A`, sun `#FFD9A0`, hills `#5A3B6E` and `#3B2955`, water `#251B40`, a small lotus `#F4A9A0`.
- **Glass:** the menu bar is `rgba(18,14,40,0.45)` with blur 20px and white text. The dock and widgets are white at 24–88% opacity with blur and a 1px white border at 35%.
- **Type:** Manrope 400–800. Window titles are 17px/800, body text 14–15px, labels 11–12px uppercase with letter-spacing 0.1em. Verses use Lora italic. Notes use Kalam 18px on a 32px line height. Gujarati uses Hind Vadodara in `--accent-dark`.
- **Shapes:** windows have a 14px radius and a soft large shadow, buttons 9–10px, phone sheets 24px top corners, tiles 10px. Touch targets are at least 44px.
- **Contrast:** text must be at least 4.5:1 everywhere. Respect `prefers-reduced-motion`.

### Desktop layout (> 768px)

1. **Lock screen** (when `settings.showLockScreen` is on, once per browser session): wallpaper, date, big clock (Manrope 200, about 150px), the verse of the day card (random from `settings.verses`, hidden if empty), the site name **Saral Mandal HariPrabodham**, an **"Open my library"** button, and "Press Enter to continue". Enter, a click or a swipe opens the desktop.
2. **Desktop**: wallpaper and **menu bar** (lotus logo, site name, working File / Edit / View / Go / Help menus, Search, Admin, Lock, clock).
   - **Keep the desktop clean.** Show only **ONE desktop icon, "Library"**, and no other folder or book icons on the desktop.
   - Two glass widgets on the left: **Continue reading** (hidden if no progress) and **Recently added** (latest 3 books, hidden if none).
   - A **dock** at the bottom: Library, Search, Reader, Notebook, Lock and, only when the admin is signed in, Admin.
3. **Windows**: focus, drag by the toolbar, minimise to the dock, maximise and close. Escape closes the top dialog.
4. **Library window**:
   - Toolbar: dots, Back, title, icon/list toggle, search box. When the admin is signed in, also New Folder, Rename, Delete and Add PDF.
   - An **A–Z bar**, with letters greyed out when they have no items.
   - **Sidebar**: All Books, Recently Read, the **folder tree** (indented, with counts) and **Topics** (coloured dots, with counts). When the admin is signed in: **+** beside Topics and a **pencil** on each topic.
   - **Main area**: folders first, then books grouped under big A–Z letters. A PDF tile shows a band in the book's colour, its initial and the Gujarati title under the name. List view shows Name (+ Gujarati), Author, Kind · Language, Pages and Size.
   - **Info panel** for a book: title, Gujarati title, author, tradition, language, pages, size, topics and folders, with Open and Download. When the admin is signed in, folder and topic tick boxes plus Edit and Delete.
   - A status bar shows the item count. **Double-click** opens a folder or book.
5. **Search everything** (`/` or Ctrl/⌘+K): a centred glass panel with filters (Everything, Books, Folders, Topics, Inside books, My notes), grouped results, a preview on the right, and ↑ ↓ Enter Esc.
6. **Reader window**:
   - Toolbar: back to Library, file name and folder, page box "N of M", Previous/Next, Zoom −/+ with a percentage, Fit width, Find in this book, Night, Notebook toggle, Download and Full screen. A progress line runs under the toolbar.
   - Thumbnails on the left; the page centred on grey.
   - **Notebook panel**: tabs for Notes, Quotes and Bookmarks on ruled paper with a margin line; a page chip on each entry jumps to its page, with edit and delete; a "Note on page N" form where Ctrl+Enter saves.
   - Keys: ← → turn pages, + − zoom.

### Phone layout (≤ 768px)

1. **Lock screen**: date, clock, verse card, Continue card, the site name, and an "Open my library" button.
2. **Home screen**: wallpaper and a search pill, the Continue reading widget, and a small grid of **app tiles only**: Library, Search, Topics, Recent, Notebook, Lock, plus Admin when signed in. No per-book or per-folder icons. A dock with Library, Search, Reader and Notebook.
3. **App screens** use a light background, a large title, and a **tab bar** with Home, Library, Search and Notebook.
4. **Library**:
   - Back shows the parent folder's name, and a **"…"** button opens folder actions.
   - A search box and a horizontal row of **topic buttons**.
   - "My folders" or "Folders inside" as 2-column cards, then books under A–Z headings, each showing Title + Gujarati title and Author · Language · pages.
   - A vertical **A–Z index strip** on the right edge.
   - When the admin is signed in: + folder, + New topic, and Edit topic.
5. **Bottom sheets** for actions (Open, Rename, Delete), name forms, topic forms with colour circles, and delete confirmations.
6. **Reader**: top bar (back, title, page and percentage, Find, Night, Bookmark), the page at full width, a floating "‹ N / M ›" pill, and a **notebook bottom sheet**. Swipe to turn pages.

### Empty states (required)

- **Library with no books:** "Your library is empty." Admins also see an "Add your first PDF" button; visitors see "Books will appear here soon."
- **Empty folder**, **no search results** and **no notes** each get a short helpful line.
- **No verses:** hide the verse card. **No progress:** hide Continue reading.

## 7A. Screen-by-screen spec (the approved mocks, in words)

No screenshots are provided; this section **is** the design. Build every screen to match it closely. Sizes are measured on a 1440×900 desktop and a 390×844 phone. Keep the proportions on other screen sizes and stay fully responsive. "Glass" means a translucent background plus `backdrop-filter: blur()` (and the `-webkit-` prefix).

### Shared pieces

- **Wallpaper** (desktop and phone, inline SVG, `preserveAspectRatio="xMidYMid slice"`):
  - a vertical sky gradient from `#1F2358` (top) to `#6E3F7E` (45%) to `#E07A5F` (70%) to `#F6BD7A` (bottom);
  - a sun circle `#FFD9A0` at 85% opacity, centred horizontally at about 70% of the height;
  - a back hill `#5A3B6E` and a front hill `#3B2955`, both soft wave curves across the full width;
  - a water band `#251B40` across the bottom 13%, with two faint sun reflections (`#FFD9A0` at 35–50% opacity);
  - a small three-petal lotus `#F4A9A0` on the water at the centre.
- **Lotus logo** (stroke icon, 24-unit grid): a centre petal, two side petals and a base line. Use it in the menu bar, the lock screen avatar and the favicon.
- **Folder icon** (64×52 grid): a back tab in the darker shade (`M4 9a4 4 0 0 1 4-4h15l6 6h27a4 4 0 0 1 4 4v5H4z`), a front body as a 56×33 rounded rect (r 4) at y 15 in the lighter shade, and a 3px white highlight at 40% along the top edge. Colour pairs come from section 7.
- **PDF file icon** (48×58 grid):
  - a white page with a folded top-right corner (fold fill `#ECE8F1`) and a `#D9D3E2` outline;
  - a band 18 units tall at y 16 in the book's colour, with the title's first letter centred in white Georgia/serif;
  - a small red `#C8371D` "PDF" tag (22×9, r 2, white 6.5 bold text) near the bottom-left.
- **App icon tiles**: rounded squares with a coloured background and a white 1.7-stroke line glyph, and a soft shadow `0 6px 14px rgba(0,0,0,.25)`.
  - Library `#D9772B` (books on a shelf), Search `#4867C9` (magnifier), Reader `#2F7A5B` (open book), Notebook `#D9A520` (notepad), Topics `#7A4FB0` (lotus), Recent `#2F7A5B` (clock), Lock `#3A3550` (padlock), Admin `#6B6F7E` (gear).
- **Window frame** (desktop):
  - white, radius 14, `overflow: hidden`, shadow `0 30px 80px rgba(8,4,24,.55), 0 0 0 1px rgba(0,0,0,.12)`.
  - Default size 1328×820 at left 56, top 54 on 1440×900. Scale with the viewport, keeping at least 24px margin and staying clear of the menu bar.
  - Toolbar 60px tall, `#F7F5FA` background, 1px `#E4E0EA` bottom border, 10px gap, 14px side padding.
  - Starts with three 13px dots, 8px apart: `#FF5F57`, `#FEBC2E`, `#28C840` (close, minimise, maximise).
- **Toolbar buttons**: 38px tall, radius 9, 1px `#D9D3E2` border, white, 14px text weight 600, with a 16–17px icon.
  - Primary: `--accent` background, white text weight 700, no border.
  - Danger: white background with `--danger` text.
  - Disabled: 45% opacity.
- **Dialogs** (desktop):
  - overlay `rgba(20,14,40,.35)`; the dialog is 400–430px wide, white, radius 16, padding 22, shadow `0 24px 60px rgba(0,0,0,.35)`, placed 90px from the top of its window;
  - title 18px/800, body 14px `#4E4860` on a 1.5 line height;
  - buttons right-aligned, 44px tall, radius 10: Cancel is white with a border; the destructive button is `--danger` with white text weight 800.
- **Toast**: bottom centre, dark `#1F1B2D` pill, white 14px text, a link to the commit, and it disappears after 6 seconds.

### Desktop 1 — Lock screen

- Full-screen wallpaper.
- Date "Friday, 23 October" (live) at 26px/500, centred, 92px from the top. Under it the time "12:41" (live, 24-hour, or 12-hour with no AM/PM) at 150px, weight 200, line height 1, letter-spacing −0.02em.
- **Verse card**, centred 360px from the top: 560px wide, padding 20px 26px, radius 22, glass `rgba(20,16,48,.42)` with blur 24 and a 1px `rgba(255,255,255,.22)` border, text centred.
  - Label "VERSE OF THE DAY": 12px/700, tracking .16em, `#FFD9A0`.
  - Verse in Lora italic 21px on a 1.45 line height.
  - Source line 13px `#E8E2F2`.
  - Hidden when there are no verses.
- **Bottom group**, centred, 120px from the bottom, 14px gap:
  - a 76px glass circle (white 22% fill, 1px white 40% border) with the 40px lotus logo in white;
  - the site name "Saral Mandal HariPrabodham" at 18px/600;
  - an "Open my library →" pill button: 48px tall, padding 0 26px, white at 92% opacity, text `#2A1E44` 15px/700;
  - a hint, "Press Enter or click to continue", at 13px `#F3E9F6`.

### Desktop 2 — Desktop

- **Menu bar**, full width, 36px tall: glass `rgba(18,14,40,.45)` with blur 20, white 14px text, padding 0 14px.
  - Left: the lotus logo (20px, `#FFD9A0`), the site name (700, padding 0 10px), then the menus File, Edit, View, Go and Help. Each is a 30px-tall button with radius 6 and padding 0 10px, a hover tint of white at 12%, and a real dropdown menu.
  - Right: "Search" (16px magnifier + text), an Admin item (shown as a badge when signed in), a padlock button (locks the screen) and a live clock like "Fri 23 Oct 12:41" at weight 600.
- **Widgets column**: left 28px, top 60px, 340px wide, 16px gap. Each widget is glass `rgba(255,255,255,.86)` with blur 24, radius 22, padding 18 and shadow `0 12px 32px rgba(10,6,30,.28)`, with a label at 12px/700 uppercase, tracking .12em, `--muted`.
  - **Continue reading**: a 52×70 cover (book colour, radius 4 7 7 4, a small shadow); the title at 17px/700; "Page N of M · <folder>" at 13px muted; a 6px progress bar (track `#E7E3EE`, fill `--accent`); and a full-width "Resume at page N" button (44px, radius 12, `--accent`, white 14px/700). Hidden when there is no progress.
  - **Recently added**: up to 3 rows, each 48px tall, with a 28×36 cover, the title at 15px/600 and "Tradition · N pages" at 12px muted. Hidden when there are no books.
- **The only desktop icon** is "Library", top-right (right 24px, top 56px): a 72×58 folder icon (amber) over the label "Library" in white 13px/600 with text-shadow `0 1px 3px rgba(0,0,0,.7)`. A single click selects it (tint behind it, radius 10); a double click opens the Library window.
- **Search hint pill**: top centre, 66px from the top. Glass `rgba(18,14,40,.5)`, white 14px text, padding 10px 18px, fully rounded. It reads: magnifier, then "Press [/] to search any book, folder or word". The `/` sits in a chip with a white 20% background and radius 5. It hides after the first search.
- **Dock**: bottom 14px, centred. Glass white at 24% with blur 26, a 1px white 35% border, radius 26 and padding 10px 14px.
  - Items: Library, Search, Reader, Notebook, a separator (1×52, white at 45%), Lock, and Admin (only when signed in).
  - Each is a 60×60 app tile with radius 15 and a tooltip. Open apps show a small white dot under the tile.

### Desktop 3 — Library window

- **Toolbar**, left to right:
  - the dots, a Back button (38px, chevron; faded when at the top level), and the title of the current place (17px/800, e.g. "All Books", "Swaminarayan", "Bhakti & Upasana");
  - a view toggle: a segmented control on `#ECE8F1` (padding 3, radius 10) with two 38×32 buttons (grid / list); the active one is white;
  - admin only: **New Folder** (folder-plus icon in `--accent`), **Rename** (pencil), **Delete** (bin, danger) and **Add PDF** (primary);
  - pushed to the right, a search box: 270px wide, 38px tall, radius 10, 1px `#D9D3E2` border, placeholder "Search in English or ગુજરાતી".
- **A–Z bar** under the toolbar: padding 6px 14px, white, 1px `#ECE8F1` bottom border.
  - An "All" pill, then A–Z buttons at 30×30, radius 7, 13px/700.
  - Active: `#1F1B2D` background with white text. Letters with no items are `#B7B1C2` and disabled.
- **Body** is three columns:
  - **Sidebar**, 236px, `#F1EEF5` background, right border, padding 12px 10px, scrolls on its own. Section labels are 11px/800 uppercase with .1em tracking in `--muted`.
    - **LIBRARY**: All Books (books icon) and Recently Read (clock icon), with counts on the right at 12px muted.
    - **MY FOLDERS**: a "+" button on the label row (admin only), then the folder tree. Each row has a small 18×15 folder icon in the folder's colours and the name with an ellipsis. Indent 20px per level. Counts include books in sub-folders.
    - **TOPICS**: a "+" button (admin only), then rows with an 11px colour dot, the name and the count, plus a 30×30 pencil button (admin only).
    - Rows are 36px tall with radius 8 and 14px text. The active row has a `#E3DCEC` background and weight 800.
  - **Main area**: white, padding 16px 22px 28px, scrolls.
    - Sections: "Folders" first, then one section per letter.
    - Section header: the letter (or "Folders") at 20px/800 in `--accent`, then the count ("3 books") at 12px muted, then a 1px `#ECE8F1` line filling the rest of the row.
    - Grid: `repeat(auto-fill, minmax(118px, 1fr))`, gap 6.
    - A tile is padded 8px 4px with radius 10, holding the icon (folder 76×62 or PDF 52×62), then a label (max 108px wide, 2 lines, 13px/600, centred), then a sub-line (11–12px muted). The sub-line shows the **Gujarati title** for books (Hind Vadodara) or the author; for folders, "N folders · M books".
    - A selected tile has a `#FBE7D3` background, and its label gets an `--accent` background with white text and radius 5.
    - **List view**: a table with columns Name (a 16×20 colour swatch + title + Gujarati title), Author, Kind ("Folder" / "PDF · Gujarati"), Pages and Size. Headers 12px uppercase muted; rows 40px with a 1px `#F3F0F6` divider. The selected row is `#FBE7D3`.
    - **Inline rename** (admin): the label becomes a 112×30 input with a 2px `--accent` border, radius 6, centred, plus "Enter to save" at 11px muted. Enter saves; Escape cancels.
  - **Info panel**, 280px, `#FAF9FC` background, left border, padding 20px 18px, scrolls.
    - **Nothing selected**: label "INFO", the place name at 18px/800, a summary (counts) at 14px `#4E4860`, and 3 short tips. Inside a topic, admins also get an "Edit or delete this topic" button.
    - **Folder**: a large 110×90 folder icon, the name at 19px/800 centred, "Folder · N folders · M books" at 13px muted, then buttons: Open folder (primary), plus Rename and Delete folder for admins.
    - **Book**: a 78×94 PDF icon, the title at 19px/800, the Gujarati title in Hind Vadodara 17px/600 `#8A3D06`, and the author at 13px muted.
      - Details as a 2-column list (84px label column, 13px): Tradition, Language, Pages, Size.
      - "TOPICS": coloured chips for visitors; tick boxes with colour dots for admins.
      - "IN MY FOLDERS" (admin): tick boxes for every folder, indented for sub-folders.
      - Buttons (44px, radius 10): Open book (primary), Download, plus Edit details and Delete (or "Remove" inside a folder) for admins.
- **Status bar**: 30px, `#F7F5FA`, top border, 12px muted. "N items · matching “x” · starting with B" on the left; "Sorted by name, A to Z" on the right.
- **Behaviour**:
  - A single click selects an item; a double click opens it (a folder navigates, a book opens the Reader).
  - Back goes to the parent folder, or to All Books.
  - Searching and letters filter the current place only.
  - New Folder creates the folder inside the current folder and immediately opens inline rename.
  - Delete always asks in a dialog with the exact counts.

### Desktop 4 — Search everything

- The wallpaper dimmed by a `#0A061E` overlay at 38%, with the menu bar still visible.
- The panel is 820px wide, centred, 110px from the top. Radius 20, glass white at 94% with blur 30, shadow `0 30px 80px rgba(8,4,24,.6)`.
- **Input row** (70px, 1px bottom border): a 26px magnifier in `--accent`, the input at 26px/500, and the result count at 13px muted on the right.
- **Filter chips row** (padding 12px 22px): Everything, Books · N, Folders · N, Topics · N, Inside books · N, My notes · N. Chips are 34px tall, fully rounded; the active one is `#1F1B2D` with white text.
- **Body** (470px tall):
  - **Results list** on the left, grouped under 11px/800 uppercase labels: Top hit, Books, Folders, Topics, Inside books, My notes.
    - Rows are 48px with radius 10: a 30×36 swatch (book colour, folder colour, or "Aa" for text matches and "✎" for notes), a title at 15px/700, a sub-line at 13px, and on the right "p. N" at 12px/700 when it applies.
    - The selected row has an `--accent` background with white text and a `#FBE7D3` sub-line.
    - Inside-book results say "The word “x” appears on N pages", with the sub-line "Inside <Book> — first on page N".
  - **Preview pane** on the right (300px, `#FAF9FC`, left border): a 124×170 cover (book colour, title in Lora), the title at 18px/800, "Author · Tradition · N pages · size" at 13px, "In: <folders>. You stopped on page N." at 13px, and buttons "Open at page N" (primary) and "Show in Library".
- **Footer**: keyboard hints (↑ ↓ move · Enter open · Esc close) and "Searches titles, authors, folders, topics, words inside PDFs and your notes", at 12px muted.

### Desktop 5 — Reader window

- **Toolbar**, left to right:
  - the dots; "‹ Library"; then the file name at 16px/800 with "<folder> · N pages" at 12px muted under it;
  - the page group: Previous (38px) · a "Page" input (58px wide, centred, weight 700) · "of M" · Next;
  - the zoom group: − · "110%" · + · Fit width;
  - pushed right: a "Find in this book" box (210px), Night, Notebook (`#1F1B2D` with white text when open), Download (38px icon) and Full screen.
- **Progress line**: 3px tall, `--accent` fill on `#ECE8F1`.
- **Body**:
  - **Thumbnails**: 128px wide, `#F1EEF5`. Each thumbnail is 74×100 with a 2px shadow and the page number under it. The current page has a 3px `--accent` outline and its number in `#8A3D06` at 800 weight.
  - **Page area**: `#DCD8E3` background, the page centred with padding 26px 20px, and the page shadow `0 12px 30px rgba(20,10,40,.22)`.
  - **Night mode**: the page area turns `#0F1613` and the canvas gets `filter: invert(.9) hue-rotate(180deg)`.
  - **Notebook panel**: 330px wide, `#FAF9FC`, left border.
    - Header: "Notebook" at 18px/800, "<Book> · N notes · M quotes" at 12px muted, and a segmented tab control (Notes / Quotes / Bookmarks, 34px tall, active white).
    - The **paper** area is `#FFFDF6` with horizontal lines every 32px (`#DCE3EC`), a 2px vertical margin line `#EBC2B8` at 38px from the left, and content padded 52px from the left.
    - Each entry has a top row (32px) with a "p. N" chip (26px tall, fully rounded, 1px `--accent` border, white background, `#8A3D06` 12px/700 text; clicking it jumps to the page), the date at 12px muted, and edit and delete icon buttons (28px) on the right. Under it, the text in Kalam 18px on a 32px line height in `#24324F`. Quotes are shown in Lora italic inside “ ”.
    - **Form** at the bottom: the label "Note on page N" at 13px/700, a Kalam 17px textarea on `#FFFDF6` with radius 10, and "Save note" (40px, primary). Ctrl/⌘+Enter also saves.

### Phone 1 — Lock screen (390×844)

- Wallpaper; the date at 19px/600, 86px from the top; the time at 96px, weight 200.
- A **verse card** 300px from the top with 20px side margins, radius 22 and padding 16px 18px (verse in Lora italic 18px). Hidden when there are no verses.
- A **Continue card** under it (radius 18, a 34×46 cover, "Continue: <Book>" at 14px/700 and "Page N of M" at 12px). Hidden when there is no progress.
- At the bottom (46px up): the site name at 17px/700, an "Open my library" pill (50px tall, white at 92%, `#2A1E44` 16px/700) and "or swipe up" at 13px. Tap or swipe up to open.

### Phone 2 — Home screen

- Wallpaper.
- A **search pill**: 20px side margins, 52px from the top, 48px tall, radius 16, white at 88%, with an `--accent` magnifier and "Search books, folders, words…". It opens Search.
- A **Continue reading widget** 116px from the top: radius 22, padding 14, white at 88%. It has a 46×62 cover, the "CONTINUE READING" label at 11px/800, the title at 16px/800, "Page N of M" at 12px and a 5px progress bar. Hidden when there's no progress.
- An **app grid** 252px from the top (14px side margins): 4 columns with 20px between rows. Tiles are 64×64 with radius 17, and labels at 12px/600 in white with a text-shadow. The tiles are Library, Search, Topics, Recent, Notebook, Lock, plus Admin when signed in. **No book or folder icons.**
- A **dock** 26px from the bottom (14px side margins): 88px tall, radius 30, glass white at 24%, holding 4 tiles at 62×62 with radius 17: Library, Search, Reader, Notebook.

### Phone 3 — Library

- `#F7F5FA` background.
- **Header** (padding 50px 16px 8px):
  - a 44px top row: Back on the left (`--accent` 16px/700 with a chevron, labelled with the parent folder's name or "Library"; shown only inside a folder); on the right, "…" (44×44, radius 12, `#ECE8F1`, inside a folder; opens the folder actions) and, for admins, + folder (44×44, `--accent`);
  - the large title (30px/800, ellipsis);
  - a search box (46px tall, radius 14, `#ECE8F1`, "Search in English or ગુજરાતી");
  - a sideways-scrolling row of **topic chips** (34px tall, fully rounded, white with a `#D9D3E2` border and an 8px colour dot; active `#1F1B2D` with white text and a white dot). Admins get "+ New topic" first, as a dashed `--accent` chip.
- **Content** (padding 4px 34px 24px 16px, scrolls):
  - "My folders" (or "Folders inside" when in a folder) at 19px/800 plus a count, then **2-column folder cards**: white, radius 16, 1px `#E8E3EE` border, padding 14px 14px 12px, with a 46×38 folder icon, the name at 15px/700 and "N folders · M books" at 12px muted, and a "…" button (44×44) in the top-right.
  - Then the books ("All books A–Z" / "Books" / "<Topic>" / "Starting with B") with "Show all" (and "Edit topic" for admins when a topic is active).
  - Letter headings at 15px/800 in `--accent`.
  - Book rows are 64px with a 1px `#ECE8F1` divider: a 32×42 cover, the title at 16px/700 plus the Gujarati title (Hind Vadodara 600, `#8A3D06`), "Author · Language · N pp" at 13px muted, and a chevron.
- **A–Z index strip** fixed on the right edge (26px wide, vertically centred): letters 17px tall, 11px/800, `--accent`; letters with no books are `#C9C3D3`; the active letter has an `--accent` background with white text. Tapping filters to that letter.
- **Tab bar** (84px, white at 94%, 1px top border): Home · Library · Search · Notebook, with 24px icons and 11px/700 labels. Active `--accent`; the others `--muted`.
- **Bottom sheets**: overlay `rgba(20,14,40,.4)` (tap it to close); the sheet is white with a 24px radius on the top corners and padding 10px 18px 34px, a 40×5 grabber in `#D9D3E2`, the title at 18px/800 centred and a sub-line at 14px muted.
  - Action buttons are 52px tall with radius 14 on `#F3F0F6`; the danger button is `#FBEAE8` with `#A3261A` text.
  - Inputs are 52px tall with a 2px `--accent` border, radius 14 and 17px text.
  - Colour pickers are 34px circles, with a selected ring `0 0 0 3px #fff, 0 0 0 5px <colour>`.
  - The sheets are: folder actions (Open folder / Rename / Delete folder / Cancel), name form (New folder / Rename folder), topic form (name, colour, Save, and Delete topic for edits), and delete confirmations with exact counts.

### Phone 4 — Search

- Header (padding 54px 16px 10px): an input (48px, radius 14, white, 2px `--accent` border, 17px/600) and "Cancel" in `--accent` 15px/700.
- Filter chips in a sideways-scrolling row (36px tall): All · N, Books · N, Folders · N, Inside books · N, Notes · N.
- Results are grouped under 12px/800 uppercase labels in white cards (radius 16, 1px `#E8E3EE` border). Rows are 62px: a 34×44 swatch, the title at 15px/700, a sub-line at 13px muted, and "p. N" at 12px/800 `#8A3D06` on the right.
- A footer note at 13px muted, centred.
- The tab bar, with Search active.

### Phone 5 — Reader

- **Top bar** (padding 48px 8px 8px, `#F7F5FA`, bottom border): Back (44px, `--accent` chevron), the title at 16px/800 with "Page N of M · X%" at 12px muted, then 44px icon buttons for Find, Night and Bookmark (filled `--accent` when the page is bookmarked). A 3px progress line under it.
- **Page area** `#DCD8E3`: the page fills the width minus 14px on each side, as a white page with a shadow. Swipe left or right to turn pages; pinch zooms.
- A **floating pill** just above the notebook sheet: `rgba(31,27,45,.88)`, white, fully rounded, with ‹ (40px) · "48 / 212" at 14px/700 · › (40px).
- A **notebook bottom sheet**: 236px tall when collapsed and draggable to full height. White, radius 24 on the top corners, shadow `0 -10px 30px rgba(20,10,40,.2)`.
  - A grabber, then "Notebook · N notes" at 17px/800 and a small segmented control (Notes / Quotes, 30px tall).
  - Lined paper (lines every 30px, margin line at 34px, content 46px from the left) with the same entry style as desktop, at Kalam 16px on a 30px line height.
  - An input row at the bottom: a 44px input ("Note on page N…", Kalam 16px, `#FFFDF6`) and "Save" (44px, `--accent`, 800).

## 8. Admin: saving to GitHub

- **Sign in:** menu bar or app tile → Admin → Sign in. The admin pastes a **fine-grained personal access token** for **this repository only**, with permission **Contents: Read and write** (nothing else) and an expiry of 90 days or less.
  - The token is kept in `sessionStorage` by default; "Remember on this device" uses `localStorage`. "Sign out" clears it.
  - The token is never logged, never put in a URL and never committed.
- **Repo detection:** the owner and repo come from `settings.github`. If they're missing, guess from the address (`<owner>.github.io/<repo>`) and confirm on the sign-in form. The branch defaults to `main`.
- **Test connection:** `GET /repos/{owner}/{repo}` must show push permission. If it doesn't, show a clear error.
- **Reads while signed in** come from the API (`GET /repos/{o}/{r}/contents/{path}?ref={branch}`), so the admin sees the latest version. Decode base64 as UTF-8 so Gujarati survives. Visitors read `/data/*.json` with `cache: "no-store"`.
- **Every admin action is ONE atomic commit** using the Git Data API:
  1. `GET /git/ref/heads/{branch}` for the head sha.
  2. `GET /git/commits/{sha}` for the base tree.
  3. `POST /git/blobs` for each changed file: JSON as utf-8, pretty-printed with 2 spaces; PDFs as base64.
  4. `POST /git/trees` with `base_tree` and the changed paths. A deleted file is its path with `"sha": null`.
  5. `POST /git/commits` with the message and the parent.
  6. `PATCH /git/refs/heads/{branch}` with `force: false` (never `true`).
- **Conflict** (the ref update fails because someone else committed): re-fetch the data, re-apply the change, and retry once. If it fails again, tell the admin to reload.
- **Commit messages:** `admin: add book "Vachanamrut"`, `admin: rename folder "Shastras" → "Scriptures"`, `admin: delete topic "Seva"`, `admin: update settings`. Show the message in the confirm dialog as an editable field.
- **After saving:** show a toast, "Saved to GitHub ✓ — live in about 1–2 minutes", with a link to the commit, and update the UI right away.
- **Add PDF form:** file (PDF only; warn above 25 MB, refuse above 95 MB), title, Gujarati title, author, tradition, language, description, colour, folders (tree tick boxes) and topics (tick boxes). The page count is read with PDF.js, upload progress is shown, and one commit writes the PDF and `books.json` together.
- **Edit book:** the same form, with optional "Replace PDF".
- **Folders:** create inside the current folder, rename (English and Gujarati), change colour, move, and delete with cascade, warning how many sub-folders and books are affected.
- **Topics:** create, rename, change colour, reorder and delete, warning how many books use the topic.
- **Settings:** site name, tagline, show lock screen, verses (add, edit, delete) and GitHub owner/repo/branch.
- Admin controls are invisible to visitors; without a valid token nothing can change.
- **Dry-run mode** (`?dryrun=1`, or the switch on the sign-in form) shows the exact planned commit instead of writing. It's used for all testing during the build and is available to the admin any time.

### Keeping data safe (tell the user in Phase 8)

- Every admin change is a commit, so history keeps every old version and mistakes are undone with `git revert` or restored from GitHub's History page.
- The user should add a branch rule on `main` (repo Settings → Rules or Branches): **Block force pushes** and **Restrict deletions**.
- The user should keep a backup with `git pull` on their computer or **Code → Download ZIP** now and then.
- If a token leaks, delete it on GitHub (Settings → Developer settings → Fine-grained tokens) and make a new one.

## 9. Testing locally

PDF.js and `fetch` need a web server, so from the repo folder run:
```
python -m http.server 8000
```
Then open http://localhost:8000. Use `http://localhost:8000/?demo=1#/library` to see in-memory demo data (never saved).
- Test the desktop at full width and the phone layout in the browser's device toolbar at 390×844.
- The console must be clean, with no errors.
- **Admin during the build:** test only in **dry-run mode** (`?dryrun=1`, section 8). Every save then shows the commit it *would* make (message, files, sizes) and writes nothing. Never make a real write to GitHub before the user's final approval.
- **Admin after launch:** real saves make real commits, so the user tests with clearly named items and deletes them afterwards.

## 10. Build phases

All phases run in **one go** with **no commits** in between (section 2). Build the UI from sections 7 and 7A. After each phase, self-test and update `BUILD-LOG.md`, then go straight on to the next phase.

| Phase | What | Design spec to follow |
|---|---|---|
| 1 | Skeleton | 7 (tokens), 7A Shared pieces (wallpaper, logo) |
| 2 | Data layer | 5 |
| 3 | Lock screen + desktop + windows | 7A Desktop 1–2, Window frame |
| 4 | Library window | 7A Desktop 3 |
| 5 | Search everything | 7A Desktop 4 |
| 6 | Reader + notebook | 7A Desktop 5 |
| 7 | Phone layout | 7A Phone 1–5 |
| 8 | Admin sign-in + GitHub client | 8, 11 |
| 9 | Admin editing | 8, 7A admin-only parts (Desktop 3, Phone 3), Dialogs, Toast |
| 10 | Polish + launch | 11 (audit) |

**Phase 1 — Skeleton.** Create the folder structure, `.nojekyll`, `404.html`, `books/.gitkeep`, the four empty data files, `css/tokens.css` with all tokens, `base.css`, an `index.html` that loads fonts, CSS and `js/main.js`, and a README (what it is, local testing, deploying to Pages, adding books through Admin, keeping data safe). Done when the page shows the wallpaper and "Saral Mandal HariPrabodham" and the console is clean.

**Phase 2 — Data layer.** Build `store.js` (load and validate the JSON; lookups for books by folder including sub-folders, by topic and by letter; folder tree; counts), `local.js` (safe storage, notes, progress, bookmarks, prefs, export/import), the basic `search.js` (English + Gujarati), and `demo.js` behind `?demo=1`. Done when the empty data loads, `?demo=1` fills memory only, and everything works from the console.

**Phase 3 — Lock screen and desktop.** Build `lock.js`, `desktop.js` (menu bar with working menus, the clock, the single Library icon, widgets that hide when empty, the dock) and `windows.js`. Done when lock → desktop → open and close an empty Library window all work.

**Phase 4 — Library window.** Build `library.js`: folder tree, topics, A–Z bar, icon and list views, folders first then letter groups, Gujarati titles, search, info panel, Back, status bar, double-click, and empty states. Read-only. Done when it works empty and with `?demo=1`.

**Phase 5 — Search everything.** Build `spotlight.js` and finish `search.js`: the shortcuts, the filters, grouped results, the preview, the keyboard, "Inside books" (lazy PDF text extraction cached in memory) and "My notes".

**Phase 6 — Reader and notebook.** Vendor PDF.js. Build `reader.js`: crisp rendering (devicePixelRatio), page box, Previous/Next, zoom, fit width, lazy thumbnails, Night mode, Find in book, full screen, download, the progress line, saving the position, keyboard and swipe. Add the notebook: Notes, Quotes, Bookmarks, page chips, edit and delete, Ctrl+Enter, export and backup. Done when a local test PDF (not committed) opens and notes survive a reload.

**Phase 7 — Phone layout.** Build `mobile.js` and `mobile.css` for ≤ 768px: lock, home, the Library (folder cards, topic buttons, A–Z strip, sheets), search, the reader with the notebook sheet, and the tab bar. Same data and logic as desktop; only the views differ. Done at 390×844 with no sideways scrolling.

**Phase 8 — Admin sign-in and GitHub client.** Build `auth.js` (sign-in form, explaining step by step how to create the fine-grained token; storage choice; test connection; sign out; admin badge) and `github.js` (read with sha, atomic multi-file commit, PDF blob upload with progress, conflict retry). Build **dry-run mode**: with `?dryrun=1`, or a "Dry run" switch on the sign-in form, every write function returns and displays the planned commit (message, paths, byte sizes, deletions) instead of calling the API; read calls still work. Add a "Test commit" button the **user** can press after launch (it writes and then removes `data/.admin-test` in two commits). Don't press it yourself. Put the data-safety steps (section 8) in the README. Done when the commit flow is fully exercised in dry-run with no real writes.

**Phase 9 — Admin editing.** Build `admin.js` with every action in section 8 (books, folders, topics, settings, verses), on desktop and phone, with the editable commit message, toasts and commit links. Done when every action, tested in dry-run, produces exactly one planned commit with the right files and message, and the UI updates as if saved.

**Phase 10 — Polish and launch.** The **security and edge-case audit of section 11** (every item checked and logged in BUILD-LOG.md), accessibility (labels, focus order, visible focus, contrast, reduced motion), performance (lazy rendering, no jank), meta tags and an original lotus favicon, a full desktop + phone test, deleting `js/demo.js` and every reference to it, and a final README. Then do the **end-of-build handover** from section 2, rule 6: summary, file list, test checklist, safety check, and the approval question. Commit and push only after the user says yes, then ask before creating the tag `v1.0` (`git tag v1.0 && git push origin v1.0`). Include a live-site checklist for after the push, covering signing in with a real token and trying one real admin save.

## 11. Security and edge cases (must handle — check every item in Phase 10)

### Security

1. **No HTML injection (XSS).** Every piece of text from data, the user or imported files (titles, Gujarati titles, descriptions, verses, folder and topic names, notes, search terms) is inserted with `textContent` or escaped. Never use `innerHTML` with data. A note containing `<img src=x onerror=alert(1)>` must show as plain text.
2. **Content Security Policy.** Add a `<meta http-equiv="Content-Security-Policy">` to every HTML page: scripts only from `'self'`; styles from `'self'` and `fonts.googleapis.com`; fonts from `fonts.gstatic.com`; `connect-src 'self' https://api.github.com`; `worker-src 'self' blob:`; `img-src 'self' data: blob:`; `object-src 'none'`; `base-uri 'self'`. No inline scripts and no `eval`. No third-party scripts, analytics or trackers.
3. **PDF.js safety.** Pin a version of **4.2.67 or newer** (older versions have a known bug, CVE-2024-4367, that lets a crafted PDF run code), and always pass `isEvalSupported: false` to `getDocument`. Note the version in `vendor/pdfjs/VERSION`.
4. **Token handling.**
   - Fine-grained token, this repo only, Contents read/write, with an expiry.
   - Kept in `sessionStorage` unless "Remember on this device" is ticked.
   - Never logged, never in URLs or error messages, never sent anywhere except `https://api.github.com`.
   - On **401/403**, clear the token, explain the cause (expired, revoked or missing permission) and keep the admin's unsaved form data.
   - Show the token's expiry date from the `github-authentication-token-expiration` response header and warn 7 days before it expires.
5. **Uploads.** Accept only real PDFs: check the file starts with `%PDF-`, not just the extension. Generate file names from the ASCII slug only (`books/<id>.pdf`) and never use the original file name in a path. Reject paths containing `..` or leading `/`. Warn above 25 MB and refuse above 95 MB.
6. **Imported note backups.** Validate the JSON shape and size (max 5 MB) before importing, ignore unknown fields, and escape all text. Never execute anything from the file.
7. **Links.** External links get `rel="noopener noreferrer"` and `target="_blank"`. Only `http:` and `https:` URLs are allowed in descriptions.
8. **Public by nature.** The repo and every PDF are public. There is no visitor password protection on GitHub Pages. Tell the user plainly in the README: upload only books you have the right to share.
9. **Never write to GitHub during the build**, and never set `force: true` on a ref update.

### Data and GitHub edge cases

10. **Big data files.** The Contents API returns file content only up to 1 MB. Read `data/*.json` with the `Accept: application/vnd.github.raw+json` header (works up to 100 MB) or the Git Blobs API, so a large `books.json` never breaks the admin panel.
11. **Site size limits.** A GitHub Pages site may be at most 1 GB, and the repo should stay under about 1 GB. The admin panel shows the total size of `books/` and warns at 800 MB. The README explains the options when it fills up: compress PDFs, or ask for a different PDF host. Don't build an alternative host.
12. **Pages delay.** After a save, the live site can take 1–10 minutes to show the change because of deploy and cache time. The admin view reads from the API so it is always current. The toast says "live in a few minutes", and visitors' fetches use `cache: "no-store"`.
13. **Two admins at once.** A failed ref update means re-fetch, re-apply and retry once; then ask to reload. When the admin returns to a stale tab, refresh the data before editing.
14. **Interrupted uploads.** Commits are atomic, so a failed or cancelled upload leaves the site unchanged. Leftover blobs are harmless. Keep the form filled in so the admin can retry.
15. **Corrupt or missing data files.** If a JSON file fails to load or parse, show a clear error screen with a retry button, never a blank page. Validate records and skip broken ones with a console warning.
16. **Folder rules.** Prevent moving a folder into itself or its own sub-folder. Enforce a maximum depth of 4. Warn on duplicate names in the same parent, but allow them.
17. **Orphans.** If a book is deleted, visitors' notes, progress and bookmarks for it show "This book was removed" with an option to delete them. Deep links to a missing book, folder or topic show a friendly "not found" screen with a link to the Library. Ids in books pointing to deleted folders or topics are ignored when displayed and cleaned on the next admin save.
18. **Duplicate titles.** These are allowed. The slug suffix keeps ids unique.

### PDF and reader edge cases

19. **Bad PDFs:** password-protected, corrupt or zero-page files show a clear message with Download as a fallback, never a crash.
20. **Scanned PDFs** (no text layer): Find in book and inside-book search say "This book has no searchable text".
21. **Huge PDFs:** render only the current page, render thumbnails lazily, and cancel renders when turning pages fast. Cap canvas size on phones (iOS has canvas memory limits). Free pages you no longer need.
22. **Saved page out of range** (the PDF was replaced with a shorter one): clamp to the last page.

### Browser and device edge cases

23. **Storage blocked or full:** wrap every storage call in try/catch. On a quota error, tell the reader to export a backup. The app keeps working without saving.
24. **Offline or slow network:** show loading states and a retry. Never leave an endless spinner; give up after 20 seconds with a message.
25. **Back/forward and deep links:** every screen has a hash route, browser Back works, and opening a shared link lands on the right book and page.
26. **Phones:** use `100dvh` instead of `100vh`, add the `-webkit-backdrop-filter` prefix, respect safe-area insets (notch), make tap targets at least 44px, and prevent the page zooming when inputs get focus (inputs at least 16px).
27. **Keyboard and screen readers:** dialogs and sheets trap focus and return it when closed, Escape closes them, every icon button has an `aria-label`, and `prefers-reduced-motion` turns off animations.
28. **Gujarati:** NFC-normalise everything, sort with `Intl.Collator`, never break Gujarati words in labels (no letter-spacing on Gujarati), and make sure Hind Vadodara has loaded before measuring text.

**Phase 10 must include a written audit:** go through items 1–28, mark each as done in `BUILD-LOG.md` with where it's handled, and fix anything missing before the final approval question.