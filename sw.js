const CACHE_NAME = 'aide-swd-v2026.09.11.02';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cache => cache !== CACHE_NAME ? caches.delete(cache) : undefined)
    )).then(() => self.clients.claim())
  );
});

function repairEquipmentHtml(html) {
  let repaired = html;

  repaired = repaired.replace(
    /const EQUIPMENT_API = (["']).*?\1\s*;/,
    "const EQUIPMENT_API = 'https://aqhrfwqbroezrrcenyyb.supabase.co/functions/v1/equipment-api';"
  );
  repaired = repaired.replace(
    /https:\/\/aqhrfwqbroezrrcenyyb\.supabase\.co\/functions\/v1\/cloth-exchange/g,
    'https://aqhrfwqbroezrrcenyyb.supabase.co/functions/v1/ward-directory'
  );

  return repaired;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) return;

  event.respondWith(
    fetch(event.request).then(async response => {
      if (!response.ok) return response;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return response;

      const url = new URL(event.request.url);
      if (!url.pathname.endsWith('/equipment.html')) return response;

      const html = await response.text();
      const repaired = repairEquipmentHtml(html);
      return new Response(repaired, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }).catch(() => new Response(
      'ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่อีกครั้ง',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    ))
  );
});