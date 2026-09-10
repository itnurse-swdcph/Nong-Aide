const CACHE_NAME = 'aide-swd-v2026.09.10.6';

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
  let repaired = html;

  if (start >= 0 && end >= 0) {
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
      "",
      ""
    ].join('\n');
    repaired = repaired.slice(0, start) + replacement + repaired.slice(end);
  }

  const marker = '<!-- SWD_REPORT_FIX_2026_09_10_6 -->';
  if (!repaired.includes(marker)) {
    const reportFix = [
      marker,
      '<script>',
      '(function () {',
      "  const SUPABASE_EQUIPMENT_REPORT_API = 'https://aqhrfwqbroezrrcenyyb.supabase.co/functions/v1/equipment-api';",
      '',
      '  async function fetchSupabaseReport(fiscalYear) {',
      "    const url = new URL(SUPABASE_EQUIPMENT_REPORT_API);",
      "    url.searchParams.set('action', 'getDepartmentSummaryReport');",
      "    url.searchParams.set('fiscalYear', String(fiscalYear));",
      "    url.searchParams.set('_ts', String(Date.now()));",
      "    const response = await fetch(url.toString(), { cache: 'no-store' });",
      "    const data = await response.json();",
      "    if (!response.ok || data.status !== 'success') throw new Error(data.message || ('HTTP ' + response.status));",
      '    return data;',
      '  }',
      '',
      '  loadDepartmentSummaryReport = async function () {',
      "    if (!isAdminLoggedIn) return;",
      "    if (typeof initializeDepartmentReportYears === 'function') initializeDepartmentReportYears();",
      "    const select = document.getElementById('departmentReportFiscalYear');",
      "    const body = document.getElementById('departmentSummaryTableBody');",
      "    if (!select || !body) return;",
      "    body.innerHTML = '<tr><td colspan=\"14\">กำลังโหลดรายงาน...</td></tr>';",
      '    try {',
      '      const selectedThaiYear = Number(select.value);',
      '      const result = await fetchSupabaseReport(selectedThaiYear);',
      '      result.data.fiscalYear = selectedThaiYear;',
      '      lastDepartmentSummaryReport = result.data;',
      "      body.innerHTML = (result.data.rows || []).map(row => {",
      "        const cells = (row.months || []).map(month => '<td>' + escapeHtml(month.display || '-') + '</td>').join('');",
      "        return '<tr><td>' + escapeHtml(row.department) + '</td>' + cells + '<td><strong>' + row.inspected + '/' + row.total + '</strong><br><small>' + Number(row.percentage || 0).toFixed(2) + '%</small></td></tr>';",
      "      }).join('') || '<tr><td colspan=\"14\">ไม่พบข้อมูลในปีงบประมาณนี้</td></tr>';",
      "      const meta = document.getElementById('departmentReportMeta');",
      "      if (meta) meta.textContent = 'ปีงบประมาณ พ.ศ. ' + result.data.fiscalYear + ' | โหลดจาก Supabase | ' + new Date().toLocaleString('th-TH');",
      '    } catch (error) {',
      "      body.innerHTML = '<tr><td colspan=\"14\">ไม่สามารถโหลดรายงานได้: ' + escapeHtml(error.message || error) + '</td></tr>';",
      '    }',
      '  };',
      '',
      '  loadMouScoreReport = async function () {',
      "    if (!isAdminLoggedIn) return;",
      "    if (typeof initializeMouReportControls === 'function') initializeMouReportControls();",
      "    const yearSelect = document.getElementById('mouReportFiscalYear');",
      "    const body = document.getElementById('mouScoreTableBody');",
      "    if (!yearSelect || !body) return;",
      "    body.innerHTML = '<tr><td colspan=\"5\">กำลังโหลดรายงาน...</td></tr>';",
      '    try {',
      '      const selectedThaiYear = Number(yearSelect.value);',
      '      const result = await fetchSupabaseReport(selectedThaiYear);',
      '      result.data.fiscalYear = selectedThaiYear;',
      '      lastMouSourceReport = result.data;',
      '      renderMouScoreReport();',
      '    } catch (error) {',
      "      body.innerHTML = '<tr><td colspan=\"5\">ไม่สามารถโหลดรายงานได้: ' + escapeHtml(error.message || error) + '</td></tr>';",
      '    }',
      '  };',
      '',
      '  computeEquipmentMouScores = function (sourceReport, fromMonthKey, toMonthKey) {',
      '    const from = Number(fromMonthKey);',
      '    const to = Number(toMonthKey);',
      '    return (sourceReport.rows || []).map(row => {',
      '      let requiredMonths = 0;',
      '      let completedMonths = 0;',
      '      (row.months || []).forEach((month, idx) => {',
      '        if (idx < from || idx > to) return;',
      '        const due = Number(month.due != null ? month.due : month.total || row.total || 0);',
      '        const inspected = Number(month.inspected || 0);',
      '        if (due > 0) {',
      '          requiredMonths += 1;',
      '          if (inspected >= due) completedMonths += 1;',
      '        }',
      '      });',
      "      let score = null;",
      "      let statusLabel = 'ไม่มีรายการต้องตรวจในช่วงที่เลือก';",
      '      if (requiredMonths > 0) {',
      "        if (completedMonths === 0) { score = 1; statusLabel = 'ไม่ทำ'; }",
      "        else if (completedMonths === requiredMonths) { score = 5; statusLabel = 'ทำครบทุกเดือน'; }",
      "        else { score = 3; statusLabel = 'ทำไม่ครบทุกเดือน'; }",
      '      }',
      '      return { department: row.department, requiredMonths, completedMonths, score, statusLabel };',
      '    });',
      '  };',
      '',
      '})();',
      '</script>'
    ].join('\n');
    const bodyClose = repaired.toLowerCase().lastIndexOf('</body>');
    if (bodyClose >= 0) repaired = repaired.slice(0, bodyClose) + reportFix + '\n' + repaired.slice(bodyClose);
  }

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
