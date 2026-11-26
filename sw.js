// StudyBlock service worker. Registered from js/lib/pwa.js with scope './'.
// Every URL is resolved against self.registration.scope, so this works under
// a subpath such as https://<user>.github.io/studyblock/.

// Bump on every release: activating a new version deletes all older caches.
const CACHE_VERSION = 'v39';
const CACHE_PREFIX = 'studyblock-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// App shell, relative to the scope. js/** is listed explicitly (globbed by hand).
// When adding/removing a JS file, update this list and bump CACHE_VERSION.
// (Automatic regeneration, tools/bundle.py-style, may be added later.)
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/lib/audio.js',
  'js/lib/calc.js',
  'js/lib/chem.js',
  'js/lib/ciphers.js',
  'js/lib/codelang.js',
  'js/lib/csv.js',
  'js/lib/dates.js',
  'js/lib/engine.js',
  'js/lib/folder.js',
  'js/lib/gamify.js',
  'js/lib/graph.js',
  'js/lib/journal.js',
  'js/lib/languages.js',
  'js/lib/markdown.js',
  'js/lib/mathutil.js',
  'js/lib/net.js',
  'js/lib/music.js',
  'js/lib/pwa.js',
  'js/lib/rng.js',
  'js/lib/source.js',
  'js/lib/sql.js',
  'js/lib/storage.js',
  'js/lib/theme.js',
  'js/lib/visual.js',
  'js/views/badges.js',
  'js/views/calcpage.js',
  'js/views/calculator.js',
  'js/views/domain.js',
  'js/views/game.js',
  'js/views/graph.js',
  'js/views/guided.js',
  'js/views/home.js',
  'js/views/journal.js',
  'js/views/mix.js',
  'js/views/module.js',
  'js/views/playbtn.js',
  'js/views/quiz.js',
  'js/views/results.js',
  'js/views/domains.js',
  'js/views/roles.js',
  'js/views/settings.js',
  'js/views/staticgraph.js',
  'js/views/ui.js',
  'js/views/visual.js',
  'vendor/lucide.min.js',
  'modules/index.json',
  'presets/index.json',
  'roles/index.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

const scopeURL = (path) => new URL(path, self.registration.scope).href;

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const urls = PRECACHE.map(scopeURL);
  try {
    await cache.addAll(urls);
  } catch (err) {
    // Tolerant fallback: add one by one, skipping anything missing (404) or failing.
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* ignore */ }
    }));
  }
}

self.addEventListener('install', (event) => {
  // Do not skipWaiting here: a new version waits until the app posts SKIP_WAITING.
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// Navigations: network first, fall back to the cached page, then the cached index.html.
async function handleNavigation(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res.ok && new URL(req.url).origin === self.location.origin) {
      event.waitUntil(cache.put(req, res.clone()));
    }
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match(scopeURL('index.html')))
      || (await cache.match(scopeURL('./')))
      || Response.error();
  }
}

// Same-origin GETs: serve from cache immediately, refresh the cache in the background.
async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  // Everything else (other origins, out-of-scope paths): passthrough, never cached.
});
