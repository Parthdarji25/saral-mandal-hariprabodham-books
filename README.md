# Saral Mandal HariPrabodham

A free library of Swaminarayan scriptures and other spiritual books, for reading in the browser. Visitors browse by **folder**, by **topic** and **A to Z**, search in **English or ગુજરાતી**, and read PDFs with a **notebook** beside the page. On a computer it looks like a desktop (lock screen, menu bar, dock, windows); on a phone it becomes a home screen with a tab bar.

It is a plain static site (HTML, CSS and JavaScript, no build step, no framework) hosted free on **GitHub Pages**. All library data lives in this repository as JSON files plus PDFs. The site starts **empty**; you fill it from the Admin panel.

- Visitors' notes, quotes, bookmarks and reading position stay in their own browser. Nothing about visitors is sent anywhere.
- The site makes **no outside connections**: fonts (Manrope, Lora, Kalam, Hind Vadodara) and the PDF reader (PDF.js 4.10.38) are included in the repository. The only address it may talk to is `api.github.com`, and only when the admin is signed in.

> **Everything here is public.** The repository and every PDF can be read by anyone, and GitHub Pages has no password protection for visitors. **Upload only books you have the right to share.**

## Try it on your computer

PDF.js and `fetch` need a web server. From this folder:

```
python -m http.server 8000
```

Open <http://localhost:8000>.

- Test the desktop at full width, and the phone layout in the browser's device toolbar at 390×844.
- The browser console should show no errors.

## Put it online (GitHub Pages)

1. Push this repository to GitHub (branch `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save**.
3. After a minute or two the site is live at `https://<your-name>.github.io/<repository-name>/`.

The `.nojekyll` file tells Pages to serve the files exactly as they are.

## Adding books (Admin)

You add and edit books on the live site itself; no git commands are needed.

1. Make a **fine-grained personal access token**: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Expiration: **90 days or less**.
   - Repository access: **Only select repositories** → this repository only.
   - Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
2. Open the secret admin address `<your site>/#/parth-admin-0369` (there is no public Admin link; the Admin button only appears after you open that address) → **Sign in**, paste the token and check the owner / repository / branch names.
   - The token stays in the browser tab. Tick "Remember on this device" only on your own computer.
3. Use **Add PDF**, **New folder**, **New topic** and **Site settings**. Each action shows the commit message (you can edit it) and then saves **one commit** to GitHub. A toast links to the commit. The live site updates in about 1–2 minutes (sometimes up to 10).

Limits: PDFs over 25 MB give a warning; over 95 MB are refused (GitHub's limit is 100 MB). For bigger files use git or GitHub Desktop. The Admin panel shows how big the `books/` folder is and warns at 800 MB (GitHub Pages sites can be at most 1 GB). If it fills up, compress the PDFs.


## Keeping your data safe

- Every change is a commit, so GitHub keeps every old version. Undo a change with `git revert <commit>` or restore a file from the repository's **History** page.
- Protect `main`: repository **Settings → Rules** (or **Branches**) → add a rule for `main` with **Block force pushes** and **Restrict deletions**.
- Keep a backup now and then: `git pull` on your computer, or **Code → Download ZIP**.
- If a token leaks: delete it at GitHub → Settings → Developer settings → Fine-grained tokens, then make a new one.
- The Admin panel warns 7 days before a token expires. If GitHub rejects the token, you are signed out and your unsaved form entries are kept.

## What is where

```
index.html        the app shell          css/    styles (tokens, base, desktop, library, mobile, reader, admin)
404.html          sends bad links home   js/     the app (ES modules, no build)
data/             books, folders, topics, settings (JSON; start empty)
books/            the PDFs (start empty)
fonts/            self-hosted fonts      vendor/pdfjs/   PDF.js 4.10.38 (see VERSION)
img/              wallpaper photos (desktop and phone)
```

Library data formats and the full design notes are in `CLAUDE.md`.

## Browser support

Current Chrome, Edge, Safari and Firefox on desktop and mobile. Phone layout is used at 768px wide and below.
