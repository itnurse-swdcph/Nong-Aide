// Service Worker แบบพื้นฐาน เพื่อรองรับ PWA
// ไม่มีการทำ Caching ขั้นสูง เพื่อป้องกันปัญหาข้อมูลไม่อัปเดต

const CACHE_NAME = 'aide-swd-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // ให้ดึงข้อมูลจาก Network ตามปกติ
  event.respondWith(fetch(event.request));
});
