// The only place that reads project files (JSON, text) or imports project JS by path.
//
// Normal mode: fetch / dynamic import, resolved against the document base, so it works
// from a server root, a subpath (GitHub Pages) or any static host.
// Bundle mode (dist/studyblock.html): `window.__SB_BUNDLE__ = { files: { "<path>": "<text>" } }`
// holds every non-JS file, and JS is reached through the import map as `sb:/<path>`.
//
// Paths are relative to the app root, e.g. "modules/arithmetic/module.json".

const SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function bundle() {
  const b = typeof window !== 'undefined' ? window.__SB_BUNDLE__ : undefined;
  return b && typeof b === 'object' && b.files && typeof b.files === 'object' ? b : null;
}

export function isBundle() {
  return bundle() !== null;
}

// Relative, slash-separated, no scheme, no leading "/", no "." / ".." segments.
export function checkPath(path) {
  if (typeof path !== 'string' || !path || path.length > 300) throw new Error('Invalid file path.');
  const parts = path.split('/');
  if (!parts.every(p => SEGMENT_RE.test(p) && p !== '.' && p !== '..' && !p.includes('..'))) {
    throw new Error(`Invalid file path: ${path}`);
  }
  return path;
}

function notFound(path) {
  const err = new Error(`File not found: ${path}`);
  err.status = 404;
  return err;
}

const cache = new Map(); // "<kind>:<path>" -> Promise

function cached(key, make) {
  if (!cache.has(key)) {
    const p = make();
    p.catch(() => cache.delete(key)); // allow a retry after a failure
    cache.set(key, p);
  }
  return cache.get(key);
}

async function readText(path) {
  const b = bundle();
  if (b) {
    if (!Object.prototype.hasOwnProperty.call(b.files, path) || typeof b.files[path] !== 'string') throw notFound(path);
    return b.files[path];
  }
  const res = await fetch(new URL(path, document.baseURI).href);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} loading ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

export function loadText(path) {
  checkPath(path);
  return cached(`text:${path}`, () => readText(path));
}

export function loadJSON(path) {
  checkPath(path);
  return cached(`json:${path}`, async () => {
    const text = await readText(path);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON in ${path}`);
    }
  });
}

// Dynamic import of a project JS file. The specifier is built at runtime on purpose,
// so the bundler never rewrites it.
export function loadModule(path) {
  checkPath(path);
  if (!path.endsWith('.js')) return Promise.reject(new Error(`Not a JS module: ${path}`));
  return cached(`module:${path}`, () => {
    const spec = bundle() ? 'sb:/' + path : new URL(path, document.baseURI).href;
    return import(spec);
  });
}
