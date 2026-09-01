// Service Worker แบบพื้นฐาน เพื่อรองรับ PWA
// ไม่มีการทำ Caching ขั้นสูง เพื่อป้องกันปัญหาข้อมูลไม่อัปเดต

const CACHE_NAME = 'aide-swd-v2026.09.01.3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // ปล่อยคำขอที่ไม่ใช่ GET ให้เว็บจัดการเอง โดยเฉพาะ API แบบ POST
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() => new Response(
      'ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่อีกครั้ง',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    ))
  );
});
