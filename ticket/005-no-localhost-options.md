# 005 — Ways to run StudyBlock without localhost

**Status:** resolved
**Raised:** 2026-11-24

## Tested
In Chromium, an inline `<script type="importmap">` that maps specifiers to `data:` URLs loads ES modules with no server. That's the mechanism option A relies on.

The in-app browser couldn't open a real `file://` page (it renders local files as `data:` URLs), so the `file://` storage rows below are expected browser behaviour, still to be confirmed by double-clicking `dist/studyblock.html` in Chrome or Edge.

## Options

| | How it runs | Storage | Folder sync | Offline | Effort |
|---|---|---|---|---|---|
| **A. Single-file bundle** (in progress) | Double-click `dist/studyblock.html` | localStorage, IndexedDB (no cookies on file://) | Chromium: expected yes | Yes, except Lucide icons unless vendored | Medium |
| **B. GitHub Pages + PWA** | Visit once at `https://<user>.github.io/studyblock/`, then "Install app". It opens in its own window, even offline. | localStorage, IndexedDB, cookies; `navigator.storage.persist()` stops eviction | Chromium: yes, with "Allow on every visit" | Yes, via a service worker cache | Small: `manifest.webmanifest`, `sw.js`, icons drawn as inline SVG |
| C. Classic scripts, no modules | Double-click the unbundled `index.html` | Same as A | Same as A | Yes | Large rewrite; modules would have to become `.js` data instead of CSV/markdown |
| D. Launcher (`start.bat`) | Double-click; starts `py -m http.server`, then opens the browser | Full | Yes | Yes | Tiny, but it's still localhost underneath |
| E. Desktop wrapper (Electron/Tauri) | Native app | Full | Native file access | Yes | Large; needs Node or Rust toolchains (not installed) |

## Recommendation
- **A** for "just a file I can open", for example from a USB stick or a shared drive.
- **B** for daily use. It's the most automatic: installs like an app, works offline, updates when you push to GitHub, and needs no local server or Python. It also fixes cookies and the IndexedDB quirks of `file://`.
- Skip C and E. D is optional as a convenience for developing.

## Question
Should B (a PWA on GitHub Pages) be added after A lands?

## Resolution
The user chose both:
- A, the single-file bundle.
- B, an installable web app (PWA) on GitHub Pages or localhost.

See "Installable web app (PWA)" in CLAUDE.md.
