// ============================================================
// SEBITAM — Service Worker v5  (PWA - HTML/JS nunca do cache)
// ============================================================
const CACHE_NAME = 'sebitam-v6';

// NÃO pré-cachear index.html, main.js, style.css - sempre buscar da rede
const ASSETS = [
  '/manifest.json',
  '/logo.jpg',
  '/logo-sebitam.png',
  '/logo-escolas-ibma.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icons/icon-48x48.png',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-256x256.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
];

// ---- Instalação: pré-cacheia todos os assets ----
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS).catch((err) => {
        console.warn('[SW] Alguns assets não puderam ser cacheados:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ---- Ativação: limpa caches antigos ----
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch: HTML e JS SEMPRE da rede (evita tela preta após deploy) ----
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  const isExternal =
    url.includes('supabase.co') ||
    url.includes('cdn.jsdelivr') ||
    url.includes('unpkg.com') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic');

  if (!url.startsWith('http') || isExternal) return;

  // CRÍTICO: index.html, main.js, style.css, raiz - SEMPRE da rede (evita cache quebrado)
  const u = new URL(url);
  const isCritical = u.pathname === '/' || u.pathname === '/index.html' ||
    u.pathname.includes('main.js') || u.pathname.includes('style.css') || u.pathname.includes('supabase-config');

  if (isCritical) {
    e.respondWith(fetch(e.request)); // Sempre rede - sem cache
    return;
  }

  // Outros assets: network-first com cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
