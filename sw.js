const CACHE_NAME = 'aide-swd-v2026.09.10.3';

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
  const start = html.indexOf('function showAdminLogin() {');
  const end = html.indexOf('async function openInspectionScheduleModal()', start);
  if (start < 0 || end < 0) return html;

  const replacement = [
    "function showAdminLogin() {",
    "            Swal.fire({",
    "                title: '<i class=\"fas fa-user-shield\"></i> เข้าสู่ระบบแอดมิน',",
    "                html: '<input type=\"text\" id=\"adminUser\" class=\"swal2-input\" placeholder=\"ชื่อผู้ใช้\" autocomplete=\"username\">' +",
    "                    '<input type=\"password\" id=\"adminPass\" class=\"swal2-input\" placeholder=\"รหัสผ่าน\" autocomplete=\"current-password\">',",
    "                confirmButtonColor: '#003366',",
    "                confirmButtonText: 'เข้าสู่ระบบ',",
    "                showCancelButton: true,",
    "                cancelButtonText: 'ยกเลิก',",
    "                focusConfirm: false,",
    "                preConfirm: async () => {",
    "                    const user = document.getElementById('adminUser').value.trim();",
    "                    const pass = document.getElementById('adminPass').value.trim();",
    "                    if (!user || !pass) {",
    "                        Swal.showValidationMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');",
    "                        return false;",
    "                    }",
    "                    try {",
    "                        const response = await fetch('https://aqhrfwqbroezrrcenyyb.supabase.co/functions/v1/ward-directory', {",
    "                            method: 'POST',",
    "                            headers: { 'Content-Type': 'application/json' },",
    "                            body: JSON.stringify({ action: 'adminLogin', username: user, password: pass })",
    "                        });",
    "                        const result = await response.json();",
    "                        if (!response.ok || result.status !== 'success') {",
    "                            Swal.showValidationMessage(result.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');",
    "                            return false;",
    "                        }",
    "                        return true;",
    "                    } catch (error) {",
    "                        console.error('Admin login error:', error);",
    "                        Swal.showValidationMessage('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');",
    "                        return false;",
    "                    }",
    "                }",
    "            }).then((result) => {",
    "                if (result.isConfirmed) {",
    "                    isAdminLoggedIn = true;",
    "                    sessionStorage.setItem('aide_role', 'admin');",
    "                    document.getElementById('btnAdminLogin').style.display = 'none';",
    "                    document.getElementById('tab-admin').classList.remove('hidden-tab');",
    "                    updateWorkspaceMeta();",
    "                    updateInspectionWindowNotice();",
    "                    Swal.fire({",
    "                        icon: 'success',",
    "                        title: 'เข้าสู่ระบบสำเร็จ',",
    "                        text: 'กำลังดึงข้อมูลภาพรวมทั้งโรงพยาบาล...',",
    "                        timer: 1500,",
    "                        showConfirmButton: false",
    "                    }).then(() => { fetchAllEquipmentForAdmin(); });",
    "                }",
    "            });",
    "        }",
    "\n"
  ].join('\n');

  return html.slice(0, start) + replacement + html.slice(end);
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
