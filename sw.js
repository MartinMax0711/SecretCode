// 网络优先：每次都去拿最新的，拿不到（没网）才用缓存。
// 这样我更新功能后，你们打开就是新版，不用手动强制刷新。
const CACHE = 'hanhan-nest';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只管自己站内的东西；ntfy、字体这些不插手
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Promise.reject(new Error('offline')))),
  );
});
