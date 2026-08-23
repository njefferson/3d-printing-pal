// print-tracker service worker — cache-first, versioned, and it WAITS.
//
// THE VERSION IS INLINE, DELIBERATELY. A browser replaces a service worker by
// re-fetching this script and comparing bytes. Take the version from the
// registration URL instead and this file is byte-identical between releases, so
// the browser never sees an update — and the only code that could register a new
// URL is the app module the old worker is serving from its own cache. That loop
// left a device on one release through two successful deploys of later ones.
//
// THE ESCAPE HATCH, known before it is needed: the page registers this file with
// `updateViaCache: 'none'`, so this script is always fetched from the network
// rather than the HTTP cache. It is the one request that never comes from a
// cache, and it is therefore the way a broken release can be replaced.
//
// NO `skipWaiting` IN INSTALL. A worker that takes over immediately leaves the
// open page running the previous release's HTML with the new release's modules —
// old markup, new modules, no reload, nothing said. An old app that works is a
// smaller problem than a mixed one that does not. The reader is offered the swap
// and decides; `SKIP_WAITING` below is the only thing that triggers it.
//
// NO `clients.claim()` ON ACTIVATE, either. It hands a first-ever visitor its
// first controller and fires `controllerchange` exactly like a genuine swap,
// which is how a brand-new visitor gets told a new version is ready thirty
// seconds into their first visit.

const CACHE = 'print-tracker-0.7.0';

// Files that ship with the app and must never be cached by it. They are not in
// SHELL either — being absent from the precache is not enough on its own, because
// the fetch handler caches anything it successfully fetches.
const LIVE = ['/status.html', '/status.css'];

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './app/main.js',
  './app/version.js',
  './app/db.js',
  './app/derive.js',
  './app/store.js',
  './app/backup.js',
  './app/image.js',
  './app/fromurl.js',
  './app/dom.js',
  './app/errlog.js',
  './app/releases.js',
  './app/ui/panels.js',
  './app/ui/board.js',
  './app/ui/inventory.js',
  './app/ui/models.js',
  './app/ui/forms.js',
  './app/ui/backup-ui.js',
  './app/ui/info.js',
  './app/ui/diagnostic.js',
  './app/ui/update.js',
  './app/ui/picture.js',
  './app/ui/thumb.js',
  './app/ui/undo.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // One failed file must not fail the whole install and leave the app with no
      // worker at all; whatever is missing is fetched on demand later.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
    ),
  );
});

// The ONLY route to taking over. Sent by the page when the reader presses the
// button in the update strip, and by nothing else.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The status page is deliberately NOT the app: one address that is always
  // current. Everything below caches whatever it fetches, so leaving this to the
  // handler would freeze that page at whichever copy happened to be read first
  // and keep serving it until a release rotated the cache name — which is the one
  // behaviour it exists to not have. Returning without responding lets the
  // browser fetch it normally.
  if (LIVE.some((name) => url.pathname.endsWith(name))) return;

  event.respondWith(
    // Scoped to THIS worker's own cache rather than every cache on the origin, so
    // a fresh index.html can never arrive mixed with another release's modules.
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;

      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Offline and not cached. A navigation still gets the shell, so the app
        // opens rather than showing the browser's error page.
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw error;
      }
    }),
  );
});
