const CACHE_NAME = 'aide-swd-v2026.09.02.1'; // อัปเดตเวอร์ชัน

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // ลบแคชเวอร์ชันเก่าออกทั้งหมด
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // ปล่อยคำขอที่ไม่ใช่ GET หรือคำขอที่ไป Google Script ให้ข้าม Service Worker
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) return;

  event.respondWith(
    fetch(event.request).catch(() => new Response(
      'ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่อีกครั้ง',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    ))
  );
});
