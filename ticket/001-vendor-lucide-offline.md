# 001 — Vendor Lucide for offline use?

**Status:** open
**Raised:** 2026-11-24

## Question
Lucide is loaded from a pinned CDN URL (`unpkg.com/lucide@0.460.0`). The app is "locally stored", but icons need internet on first load.

Should we download `lucide.min.js` into the repo (e.g. `vendor/lucide.min.js`) so the app works fully offline?

## Options
- **Keep CDN** (current) — no binary/vendored file in repo, needs internet for icons.
- **Vendor it** — fully offline; requires downloading the file (needs your OK), ~350KB.
- **Vendor only used icons** as inline SVG sprites — smallest, but manual upkeep when adding icons.
