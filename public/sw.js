// しおどきのオフライン対応。
// 潮見表は毎日更新されるため、オンライン時は必ずネットワークを優先する。
// 通信がない場合だけ、過去に成功して表示した同一オリジンのページを返す。
const CACHE = 'shiodoki-offline-v1';

self.addEventListener('fetch', event => {
  const request = event.request;
  const target = new URL(request.url);
  if (request.method !== 'GET' || target.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || Response.error()))
  );
});
