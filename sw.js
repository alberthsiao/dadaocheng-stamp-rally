/* ══════════════════════════════════════════════════════════
   Service Worker — 讓逛街地圖在街上沒訊號時也打得開
   策略：stale-while-revalidate（先給快取、背景更新）
   改版時把 CACHE 的版本號 +1，舊快取會在 activate 時清掉
   ══════════════════════════════════════════════════════════ */

const CACHE = 'yongle-shopping-v12';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './mapdata.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 單一資源抓失敗不該讓整包安裝失敗
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // 地圖等外部連結不攔

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // 離線且沒快取：導覽請求退回首頁，其餘讓它自然失敗
          if (request.mode === 'navigate') return caches.match('./index.html');
          return cached;
        });

      return cached || network;
    }),
  );
});
