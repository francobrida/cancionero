// Service worker: offline + actualizaciones rápidas.
// - PDF y librerías (pesados, no cambian): primero caché.
// - El resto (app, índice, estilos): primero red, y caché si no hay conexión → siempre ves la última versión.
// Al cambiar el PDF o las librerías, subí VERSION.
const VERSION = 'cancionero-v8';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'index.json', 'cancionero.pdf',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  // cache:'reload' evita copiar versiones viejas de la caché HTTP del navegador
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const heavy = /cancionero\.pdf|\/vendor\//.test(req.url);
  e.respondWith(heavy ? cacheFirst(req) : networkFirst(req));
});

const cacheFirst = (req) => caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req));

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('index.html'));
  }
}
