# 023 — Audio previews for notes and chords

**Status:** resolved (2026-11-26): Play after answering (to build)
**Raised:** 2026-11-26

## Today
Music Theory and Role Music Theorist are written notation only: no audio anywhere in the app (no Web Audio, no `<audio>`, no sound files).

## Idea
A small "Play" button on music questions to hear a note, interval, chord or scale, e.g. as a chord preview.

## Suggested approach
- Web Audio API (`AudioContext` + oscillators), synthesised in the browser: no sound files, no third-party assets, works offline and in the bundle.
- Pitch from `js/lib/music.js`: `pc(note)` gives the pitch class; add an octave and convert to Hz (A4 = 440, equal temperament). Spelling doesn't matter for sound (C♯ = D♭).
- Chord: notes together (block) or rising (broken); scale/interval: one after another.
- Short soft envelope, volume control, and a Settings toggle (off by default or muted until first tap, since browsers block autoplay anyway).
- **Where to show it:** in feedback and review only, after the answer is checked, so the sound doesn't give the answer away (an interval or chord quality can be heard). An optional "hear the question" mode could be a separate ear-training subtopic later.
- Never relies on sound alone: everything stays readable as text.

## Open choices
1. Feedback/review only (suggested) vs also before answering.
2. Pure tones (sine/triangle) vs a simple piano-like timbre (a few harmonics).
3. Ear-training subtopics (identify an interval/chord by sound) as a later step.

## Decision (user, 2026-11-26)
Option 1: a **Play** button in feedback and review only (after the answer is checked), synthesised with Web Audio (no files, works offline), plus a Settings toggle for sound. No ear-training topics for now.
