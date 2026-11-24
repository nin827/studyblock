# StudyBlock

A quiz app that generates its questions procedurally. It is plain HTML, CSS and JavaScript using native ES modules, with no build step and no dependencies other than Lucide icons. It runs entirely in the browser, and your progress stays in this browser's `localStorage`. From the Settings page you can export your progress to a file and import it again.

## Run

ES modules and `fetch` don't work over `file://`, so you need to serve the folder over HTTP:

```
py -m http.server 8000 --bind 127.0.0.1
```

Then open http://127.0.0.1:8000/.

## Add a module

1. Create `modules/<id>/` containing a `module.json` and one of these two files:
   - `generator.js`, which exports `generate` and `verify`.
   - `questions.csv`.
2. Optionally, add an `intro.md`.
3. Append `<id>` to `modules/index.json`. The id must match `^[a-z0-9-]+$`.

`CLAUDE.md` is the full spec. It covers the module contract, answer checking and the storage schema.
