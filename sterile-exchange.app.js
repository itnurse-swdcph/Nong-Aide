/* =====================================================================
   ระบบส่งแลกวัสดุปราศจากเชื้อ — Frontend logic
   ระบบใช้งานฐานข้อมูลจริงผ่าน Google Apps Script Web App เท่านั้น
   ===================================================================== */

const DEMO_MODE = false;
const DEMO_DB_KEY = 'sterileExchangeDemoDB_v1';

/* ------------------------- DEMO MODE MOCK BACKEND ------------------------- */
function demoLoadDB() {
  let db = JSON.parse(localStorage.getItem(DEMO_DB_KEY) || 'null');
  if (!db) {
    db = {
      master: [
        { itemName: 'ชุดเปิดแผลเล็ก (Set A)', mainCategory: 'ชุดทำแผล', unit: 'ชุด' },
        { itemName: 'ผ้าห่อเครื่องมือใหญ่', mainCategory: 'ผ้าห่อ', unit: 'ผืน' },
        { itemName: 'สำลีก้อนปราศจากเชื้อ', mainCategory: 'สำลี/ผ้าก๊อซ', unit: 'ห่อ' },
        { itemName: 'ชุดทำคลอด', mainCategory: 'ชุดทำคลอด', unit: 'ชุด' },
        { itemName: 'ผ้าก๊อซปราศจากเชื้อ 4x4', mainCategory: 'สำลี/ผ้าก๊อซ', unit: 'ห่อ' },
        { itemName: 'ชุดใส่สายสวนหลอดเลือดกลาง', mainCategory: 'ชุดหัตถการ', unit: 'ชุด' }
      ],
      headers: [],
      lines: [],
      carryForward: [],
      seq: 0
    };
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  }
  return db;
}
function demoSaveDB(db) { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); }
function demoNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function demoRequestNo(db) {
  db.seq += 1;
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `ST-REQ-${today}-${String(db.seq).padStart(3, '0')}`;
}
function demoNum(v, fb) { fb = fb || 0; const n = Number(v); return isNaN(n) ? fb : n; }

async function demoApi(action, payload) {
  const db = demoLoadDB();
  const now = demoNow();

  const getReq = (id) => {
    const header = db.headers.find(h => h.requestId === id);
    if (!header) throw new Error('ไม่พบใบเบิก');
    const lines = db.lines.filter(l => l.requestId === id).sort((a, b) => a.lineNo - b.lineNo);
    return { header, lines };
  };
  const summarize = (r) => ({
    requestId: r.header.requestId, requestNo: r.header.requestNo, requestDate: r.header.requestDate,
    ward: r.header.ward, shift: r.header.shift, status: r.header.status, requesterName: r.header.requesterName,
    submittedAt: r.header.submittedAt, updatedAt: r.header.lastUpdatedAt,
    totalRequested: r.lines.reduce((s, l) => s + demoNum(l.requestedQty), 0),
    totalCounted: r.lines.reduce((s, l) => s + demoNum(l.countedQty), 0),
    totalIssued: r.lines.reduce((s, l) => s + demoNum(l.issuedQty), 0),
    totalOutstanding: r.lines.reduce((s, l) => s + demoNum(l.outstandingQty), 0)
  });

  switch (action) {
    case 'getWards': {
      const wards = [];
      return { status: 'success', data: wards };
    }
    case 'getAppMeta':
      return { status: 'success', data: { checkedAt: now } };
    case 'getSterileMaster': {
      const carryMap = {};
      db.carryForward.forEach(c => { if (c.ward === payload.ward && demoNum(c.outstandingQty) > 0) carryMap[c.itemName] = demoNum(c.outstandingQty); });
      const items = db.master.map(m => ({
        itemName: m.itemName, mainCategory: m.mainCategory, unit: m.unit, carriedQty: carryMap[m.itemName] || 0
      }));
      return { status: 'success', data: items };
    }
    case 'getWardRequests': {
      const data = db.headers.filter(h => h.ward === payload.ward).map(h => summarize(getReq(h.requestId)))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return { status: 'success', data };
    }
    case 'getAdminRequests': {
      let data = db.headers.map(h => summarize(getReq(h.requestId)));
      if (payload.status) data = data.filter(d => d.status === payload.status);
      data = data.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return { status: 'success', data };
    }
    case 'getRequestDetail':
      return { status: 'success', data: getReq(payload.requestId) };

    case 'submitRequest': {
      const requestId = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const requestNo = demoRequestNo(db);
      const header = {
        requestId, requestNo, requestDate: payload.requestDate, ward: payload.ward, shift: payload.shift,
        status: 'submitted', requesterName: payload.requesterName, submittedAt: now,
        adminReceiverName: '', adminReceivedAt: '', adminCountedAt: '', adminIssuerName: '', adminIssuedAt: '',
        wardReceiverName: '', wardReceivedAt: '', lastUpdatedAt: now, lastUpdatedBy: payload.requesterName
      };
      db.headers.push(header);
      (payload.lines || []).forEach((l, idx) => {
        db.lines.push({
          requestId, lineNo: idx + 1, itemName: l.itemName, mainCategory: l.mainCategory, unit: l.unit,
          carriedQty: demoNum(l.carriedQty), exchangedQty: demoNum(l.exchangedQty), requestedQty: demoNum(l.requestedQty),
          wardNote: l.wardNote || '', countedQty: '', issuedQty: '', outstandingQty: '', adminNote: ''
        });
        const cf = db.carryForward.find(c => c.ward === payload.ward && c.itemName === l.itemName);
        if (cf) cf.outstandingQty = 0;
      });
      demoSaveDB(db);
      return { status: 'success', message: 'สร้างใบเบิกเรียบร้อยแล้ว', data: { requestId, requestNo } };
    }

    case 'adminReceiveRequest': {
      const r = getReq(payload.requestId);
      if (r.header.status !== 'submitted') throw new Error('ใบเบิกนี้ถูกรับไปแล้ว');
      r.header.status = 'received'; r.header.adminReceiverName = payload.receiverName; r.header.adminReceivedAt = now;
      r.header.lastUpdatedAt = now; r.header.lastUpdatedBy = payload.receiverName;
      demoSaveDB(db);
      return { status: 'success', message: 'รับใบเบิกเรียบร้อยแล้ว', data: { requestId: payload.requestId, status: 'received' } };
    }

    case 'adminRecordCount': {
      const r = getReq(payload.requestId);
      (payload.lines || []).forEach(pl => {
        const target = r.lines.find(l => l.lineNo === pl.lineNo);
        if (!target) return;
        target.countedQty = demoNum(pl.countedQty);
        target.adminNote = pl.adminNote || '';
      });
      r.header.status = 'processing'; r.header.adminCountedAt = now; r.header.lastUpdatedAt = now;
      r.header.lastUpdatedBy = payload.actorName || r.header.adminReceiverName;
      demoSaveDB(db);
      return { status: 'success', message: 'บันทึกรายการตอบรับเรียบร้อยแล้ว', data: { requestId: payload.requestId, status: 'processing' } };
    }

    case 'adminIssueRequest': {
      const r = getReq(payload.requestId);
      (payload.lines || []).forEach(pl => {
        const target = r.lines.find(l => l.lineNo === pl.lineNo);
        if (!target) return;
        const requestedQty = demoNum(pl.requestedQty, target.requestedQty);
        const issuedQty = demoNum(pl.issuedQty);
        target.issuedQty = issuedQty;
        target.outstandingQty = Math.max(requestedQty - issuedQty, 0);
        if (pl.adminNote !== undefined) target.adminNote = pl.adminNote;
      });
      r.header.status = 'issued_waiting_receipt'; r.header.adminIssuerName = payload.issuerName; r.header.adminIssuedAt = now;
      r.header.lastUpdatedAt = now; r.header.lastUpdatedBy = payload.issuerName;
      demoSaveDB(db);
      return { status: 'success', message: 'บันทึกการจ่ายของเรียบร้อยแล้ว', data: { requestId: payload.requestId, status: 'issued_waiting_receipt' } };
    }

    case 'confirmWardReceipt': {
      const r = getReq(payload.requestId);
      if (r.header.status !== 'issued_waiting_receipt') throw new Error('ใบเบิกนี้ยังไม่อยู่ในสถานะรอรับของ');
      r.header.status = 'completed'; r.header.wardReceiverName = payload.receiverName; r.header.wardReceivedAt = now;
      r.header.lastUpdatedAt = now; r.header.lastUpdatedBy = payload.receiverName;
      r.lines.forEach(l => {
        const outstanding = demoNum(l.outstandingQty);
        if (outstanding <= 0) return;
        let cf = db.carryForward.find(c => c.ward === r.header.ward && c.itemName === l.itemName);
        if (cf) cf.outstandingQty = demoNum(cf.outstandingQty) + outstanding;
        else db.carryForward.push({ ward: r.header.ward, itemName: l.itemName, mainCategory: l.mainCategory, unit: l.unit, outstandingQty: outstanding });
      });
      demoSaveDB(db);
      return { status: 'success', message: 'รับของและปิดงานเรียบร้อยแล้ว', data: { requestId: payload.requestId, status: 'completed' } };
    }

    default:
      throw new Error('Unknown demo action: ' + action);
  }
}

/* ------------------------------- API WRAPPER ------------------------------- */
async function callApi(action, payload) {
  payload = payload || {};
  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 180)); // จำลอง latency เล็กน้อย
    try {
      const res = await demoApi(action, payload);
      if (res.status === 'error') throw new Error(res.message);
      return res.data !== undefined ? res.data : res;
    } catch (err) {
      throw new Error(err.message || String(err));
    }
  }
  const res = await fetch(STERILE_API, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action }, payload))
  });
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.message || 'เกิดข้อผิดพลาด');
  return json.data;
}

/* --------------------------------- HELPERS --------------------------------- */
function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseThaiDateParts(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return { day: v.getDate(), month: v.getMonth() + 1, year: v.getFullYear(), hour: v.getHours(), minute: v.getMinutes(), second: v.getSeconds() };
  }
  const value = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const zonedDate = new Date(value);
    if (!isNaN(zonedDate.getTime())) {
      const zonedParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(zonedDate).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = Number(part.value);
        return result;
      }, {});
      return { day: zonedParts.day, month: zonedParts.month, year: zonedParts.year, hour: zonedParts.hour, minute: zonedParts.minute, second: zonedParts.second };
    }
  }
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0) };
  match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0) };
  return null;
}
function fmtDate(v) {
  const parts = parseThaiDateParts(v);
  return parts ? `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year < 2400 ? parts.year + 543 : parts.year}` : '-';
}
function fmtDateTime(v) {
  const parts = parseThaiDateParts(v);
  return parts ? `${fmtDate(v)} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second || 0).padStart(2, '0')} น.` : '-';
}
const STATUS_LABELS = {
  submitted: 'รอแอดมินรับใบเบิก',
  received: 'แอดมินรับแล้ว รอบันทึกตอบรับ',
  processing: 'กำลังดำเนินการ (นับ/เตรียมจ่าย)',
  issued_waiting_receipt: 'จ่ายแล้ว รอหน่วยงานรับของ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก'
};
function statusTag(status) {
  return `<span class="tag tag-${status}">${STATUS_LABELS[status] || status}</span>`;
}
function toast(icon, title) {
  Swal.fire({ icon, title, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
}
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function logoutSystem() {
  sessionStorage.clear();
  document.getElementById('appSidebar')?.classList.add('hidden');
  document.getElementById('appShellOverlay')?.classList.add('hidden');
  window.location.replace(window.location.pathname);
}

/* --------------------------------- BOOTSTRAP --------------------------------- */
async function bootstrap() {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.get('ward') && urlParams.get('role') !== 'admin') {
    window.location.replace('index.html');
    return;
  }

  if (urlParams.get('role') === 'admin') {
    currentRole = 'admin';
    currentWard = '';
    sessionStorage.setItem('sterile_role', 'admin');
    sessionStorage.removeItem('sterile_ward');
  } else if (urlParams.get('ward')) {
    currentRole = 'user';
    currentWard = urlParams.get('ward');
    sessionStorage.setItem('sterile_role', 'user');
    sessionStorage.setItem('sterile_ward', currentWard);
  }

  if (currentRole === 'user' && currentWard) { enterApp(); return; }
  if (currentRole === 'admin') { enterApp(); return; }
  window.location.replace('index.html');
}

async function enterApp() {
  document.getElementById('navbar').classList.remove('hidden');
  document.getElementById('page').classList.remove('hidden');
  document.getElementById('appSidebar')?.classList.remove('hidden');
  document.getElementById('appShellOverlay')?.classList.remove('hidden');
  document.getElementById('navRoleText').textContent = 'บทบาท: ' + (currentRole === 'admin' ? 'แอดมิน (หน่วยจ่ายกลาง)' : 'หน่วยงาน');
  document.getElementById('navWardText').textContent = currentRole === 'admin' ? 'หน่วยงาน: ทั้งหมด' : ('หน่วยงาน: ' + currentWard);
  
  if (currentRole === 'admin') {
    document.getElementById('navNotificationBtn').classList.remove('hidden');
  } else {
    document.getElementById('navNotificationBtn').classList.add('hidden');
  }
  
  await refreshWorkspace();
  startAutoRefresh();
}

let refreshTimer = null;
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    try {
      if (currentRole === 'admin') {
        const reqs = await callApi('getAdminRequests', { status: '' });
        adminRequests = reqs || [];
        updateAdminNotificationBadge();
        renderAdminQueue();
        renderAdminProcessing();
        renderAdminWaiting();
        renderAdminHistory();
      } else {
        const reqs = await callApi('getWardRequests', { ward: currentWard });
        userRequests = reqs || [];
        renderUserDashboard();
        renderUserList();
      }
    } catch (e) {
      console.warn("Auto-refresh error:", e);
    }
  }, 120000); // ทุก 2 นาที
}

function updateAdminNotificationBadge() {
  const queueCount = adminRequests.filter(r => r.status === 'submitted').length;
  const badge = document.getElementById('navNotificationBadge');
  if (queueCount > 0) {
    badge.textContent = queueCount > 99 ? '99+' : queueCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function toggleAdminNotifications() {
  if (currentRole !== 'admin') return;
  const btn = document.querySelector('#adminWorkspace .sidebar button[onclick*="adminQueue"]');
  if(btn) switchPanel('admin', 'adminQueue', btn);
}

async function refreshWorkspace() {
  document.getElementById('loaderSection').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  try {
    if (currentRole === 'admin') {
      document.getElementById('adminWorkspace').classList.remove('hidden');
      document.getElementById('userWorkspace').classList.add('hidden');
      await loadAdminWorkspace();
      updateAdminNotificationBadge();
    } else {
      document.getElementById('userWorkspace').classList.remove('hidden');
      document.getElementById('adminWorkspace').classList.add('hidden');
      await loadUserWorkspace();
    }
    document.getElementById('loaderSection').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  } catch (err) {
    document.getElementById('loaderSection').classList.add('hidden');
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

function switchPanel(scope, panelId, btn) {
  const root = scope === 'admin' ? document.getElementById('adminWorkspace') : document.getElementById('userWorkspace');
  root.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  root.querySelector('#' + panelId).classList.add('active');
  btn.parentElement.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* ==================================================================
   USER WORKSPACE
   ================================================================== */
async function loadUserWorkspace() {
  const [master, requests] = await Promise.all([
    callApi('getSterileMaster', { ward: currentWard }),
    callApi('getWardRequests', { ward: currentWard })
  ]);
  masterItems = master || [];
  userRequests = requests || [];
  masterSearchTerm = '';
  selectedMasterItemIndex = -1;
  draftLines = [];
  const search = document.getElementById('masterItemSearch');
  if (search) search.value = '';
  if (search && !search.dataset.bound) {
    search.addEventListener('input', event => {
      masterSearchTerm = event.target.value.trim().toLocaleLowerCase('th-TH');
      renderMasterSearchResults();
    });
    search.dataset.bound = 'true';
  }
  renderMasterSearchResults();
  renderDraftLines();
  renderUserDashboard();
  renderUserList();
}

function renderUserDashboard() {
  const open = userRequests.filter(r => ['submitted', 'received', 'processing'].includes(r.status)).length;
  const awaitReceipt = userRequests.filter(r => r.status === 'issued_waiting_receipt');
  document.getElementById('userOpenMetric').textContent = open;
  document.getElementById('userAwaitMetric').textContent = awaitReceipt.length;
  document.getElementById('dashSubmitted').textContent = userRequests.filter(r => r.status === 'submitted').length;
  document.getElementById('dashProcessing').textContent = userRequests.filter(r => ['received', 'processing'].includes(r.status)).length;
  document.getElementById('dashWaitingReceipt').textContent = awaitReceipt.length;
  document.getElementById('dashCompleted').textContent = userRequests.filter(r => r.status === 'completed').length;

  const awaitBody = document.getElementById('userDashAwaitBody');
  awaitBody.innerHTML = awaitReceipt.length
    ? awaitReceipt.map(rowHtmlUser).join('')
    : `<tr class="empty-row"><td colspan="8">ไม่มีรายการรอลงรับของ</td></tr>`;

  const completed = userRequests.filter(r => r.status === 'completed').slice(0, 5);
  const compBody = document.getElementById('userDashCompletedBody');
  compBody.innerHTML = completed.length
    ? completed.map(rowHtmlUser).join('')
    : `<tr class="empty-row"><td colspan="8">ยังไม่มีรายการที่เสร็จสิ้น</td></tr>`;
}

function rowHtmlUser(r) {
  let actionBtn = `<button class="table-btn secondary" onclick="viewRequest('${r.requestId}')"><i class="fas fa-eye"></i> ดู</button>`;
  if (r.status === 'issued_waiting_receipt') {
    actionBtn += `<button class="table-btn primary" onclick="openReceiveModal('${r.requestId}')"><i class="fas fa-hand-holding"></i> รับของ/ลงชื่อ</button>`;
  }
  if (r.status === 'submitted') {
    actionBtn += `<button class="table-btn secondary" onclick="printRequest('${r.requestId}','issue')"><i class="fas fa-print"></i> พิมพ์ใบเบิก</button>`;
  }
  if (r.status === 'completed') {
    actionBtn += `<button class="table-btn success" onclick="printRequest('${r.requestId}','summary')"><i class="fas fa-print"></i> พิมพ์ใบสรุป</button>`;
  }
  return `<tr>
<td>${escapeHtml(r.requestNo)}</td><td>${escapeHtml(fmtDateTime(r.updatedAt || r.requestDate))}</td><td>${escapeHtml(r.shift)}</td>
    <td>${statusTag(r.status)}</td><td>${r.totalRequested}</td><td>${r.totalIssued}</td><td>${r.totalOutstanding}</td>
    <td>${actionBtn}</td></tr>`;
}

function renderUserList() {
  const body = document.getElementById('userListBody');
  body.innerHTML = userRequests.length
    ? userRequests.map(rowHtmlUser).join('')
    : `<tr class="empty-row"><td colspan="8">ยังไม่มีใบเบิก</td></tr>`;
}

function renderMasterSearchResults() {
  const box = document.getElementById('masterSearchResults');
  if (!box) return;
  const query = masterSearchTerm;
  if (!query) {
    box.innerHTML = '';
    return;
  }
  const matches = masterItems.filter(item => `${item.itemName} ${item.mainCategory} ${item.unit}`.toLocaleLowerCase('th-TH').includes(query)).slice(0, 20);
  box.innerHTML = matches.length ? matches.map(item => {
    const idx = masterItems.indexOf(item);
    return `<button type="button" class="master-search-result" onclick="selectMasterItem(${idx})"><span>${escapeHtml(item.itemName)}</span><small>${escapeHtml(item.mainCategory)} / ${escapeHtml(item.unit)}</small></button>`;
  }).join('') : '<div class="master-picker-hint">ไม่พบรายการจากฐานข้อมูลกลาง</div>';
}

function selectMasterItem(idx) {
  const item = masterItems[idx];
  if (!item) return;
  selectedMasterItemIndex = idx;
  document.getElementById('selectedMasterItem').value = item.itemName;
  document.getElementById('selectedMasterUnit').value = item.unit || '-';
  document.getElementById('masterSearchResults').innerHTML = '';
  document.getElementById('masterItemSearch').value = item.itemName;
  masterSearchTerm = '';
  document.getElementById('builderExchangedQty').focus();
}

function saveDraftLine() {
  const item = masterItems[selectedMasterItemIndex];
  if (!item) return toast('warning', 'กรุณาค้นหาและเลือกรายการวัสดุก่อน');
  const exchangedQty = num(document.getElementById('builderExchangedQty').value);
  const requestedQty = num(document.getElementById('builderRequestedQty').value);
  const wardNote = document.getElementById('builderWardNote').value.trim();
  if (exchangedQty <= 0 && requestedQty <= 0 && !wardNote) return toast('warning', 'กรุณากรอกจำนวนส่งแลกหรือขอเบิก');
  const line = { itemName: item.itemName, mainCategory: item.mainCategory, unit: item.unit, carriedQty: item.carriedQty || 0, exchangedQty, requestedQty, wardNote };
  const existing = draftLines.findIndex(row => row.itemName === line.itemName && row.mainCategory === line.mainCategory && row.unit === line.unit);
  if (existing >= 0) draftLines[existing] = line; else draftLines.push(line);
  selectedMasterItemIndex = -1;
  document.getElementById('selectedMasterItem').value = '';
  document.getElementById('selectedMasterUnit').value = '';
  document.getElementById('masterItemSearch').value = '';
  document.getElementById('builderExchangedQty').value = 0;
  document.getElementById('builderRequestedQty').value = 0;
  document.getElementById('builderWardNote').value = '';
  renderDraftLines();
}

function renderDraftLines() {
  const body = document.getElementById('requestLineBody');
  if (!body) return;
  body.innerHTML = draftLines.length ? draftLines.map((line, idx) => `
    <tr><td>${escapeHtml(line.itemName)}<div style="color:var(--muted);font-size:.72rem;">${escapeHtml(line.mainCategory)}</div></td>
      <td>${escapeHtml(line.unit)}</td><td>${line.carriedQty || '-'}</td><td>${line.exchangedQty || 0}</td><td>${line.requestedQty || 0}</td>
      <td>${escapeHtml(line.wardNote || '-')}</td><td><button type="button" class="table-btn secondary" onclick="removeDraftLine(${idx})"><i class="fas fa-trash"></i></button></td></tr>`).join('')
    : '<tr><td colspan="7" class="draft-empty">ยังไม่ได้บันทึกรายการ กรอกค้นหาและบันทึกจากด้านบน</td></tr>';
}

function removeDraftLine(idx) { draftLines.splice(idx, 1); renderDraftLines(); }

function collectRequestLines() { return draftLines.slice(); }

async function submitRequest(event) {
  event.preventDefault();
  const requestDate = document.getElementById('reqDate').value;
  const shift = document.getElementById('reqShift').value;
  const requesterName = document.getElementById('reqRequesterName').value.trim();
  if (!requestDate || !shift || !requesterName) { toast('warning', 'กรุณากรอกข้อมูลให้ครบ'); return; }
  const lines = collectRequestLines();
  if (!lines.length) { toast('warning', 'กรุณากรอกจำนวนอย่างน้อย 1 รายการ'); return; }

  const btn = document.getElementById('submitReqBtn');
  btn.disabled = true;
  try {
    const data = await callApi('submitRequest', { ward: currentWard, requestDate, shift, requesterName, lines });
    toast('success', 'ส่งใบเบิกเรียบร้อยแล้ว: ' + data.requestNo);
    document.getElementById('requestForm').reset();
    await loadUserWorkspace();
    const result = await Swal.fire({
      icon: 'success', title: 'สร้างใบเบิกสำเร็จ', text: `เลขที่ใบเบิก ${data.requestNo}`,
      showCancelButton: true, confirmButtonText: 'พิมพ์ใบเบิก', cancelButtonText: 'ปิด'
    });
    if (result.isConfirmed) printRequest(data.requestId, 'issue');
    document.querySelector('#userWorkspace .tab-btn').click();
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function viewRequest(requestId) {
  const detail = await callApi('getRequestDetail', { requestId });
  const rowsHtml = detail.lines.map(l => `
    <tr><td>${escapeHtml(l.itemName)}</td><td>${l.carriedQty || 0}</td><td>${l.exchangedQty}</td>
    <td>${l.requestedQty}</td><td>${l.countedQty || '-'}</td><td>${l.issuedQty || '-'}</td>
    <td>${l.outstandingQty || '-'}</td><td>${escapeHtml(l.wardNote || l.adminNote || '')}</td></tr>`).join('');
openModal(`ใบเบิก ${detail.header.requestNo}`, `${detail.header.ward} • วันที่ใบเบิก ${fmtDate(detail.header.requestDate)} • ทำรายการ ${fmtDateTime(detail.header.submittedAt)} • เวร${detail.header.shift}`, `
    <p style="margin-bottom:12px;">สถานะ: ${statusTag(detail.header.status)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>รายการ</th><th>ยกมา</th><th>ส่งแลก</th><th>ขอเบิก</th><th>นับได้</th><th>จ่าย</th><th>คงค้าง</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  `);
}

function openReceiveModal(requestId) {
  callApi('getRequestDetail', { requestId }).then(detail => {
    const rowsHtml = detail.lines.map(l => `
      <tr><td>${escapeHtml(l.itemName)}</td><td>${l.requestedQty}</td><td>${l.countedQty || 0}</td>
      <td>${l.issuedQty || 0}</td><td>${l.outstandingQty || 0}</td><td>${escapeHtml(l.adminNote || '')}</td></tr>`).join('');
    openModal(`ตรวจสอบและรับของ — ${detail.header.requestNo}`, 'ตรวจสอบรายการให้ครบก่อนลงชื่อผู้รับ', `
      <div class="table-wrap"><table>
        <thead><tr><th>รายการ</th><th>ขอเบิก</th><th>นับได้</th><th>จ่าย</th><th>คงค้าง</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
      <div class="field" style="margin-top:16px;max-width:320px;">
        ชื่อผู้รับของ (ลงชื่อ)
        <input type="text" id="wardReceiverName" placeholder="ชื่อ-นามสกุล">
      </div>
    `, [
      { label: 'ยืนยันรับของ / ปิดงาน', cls: 'primary-btn', onClick: () => confirmReceipt(requestId) }
    ]);
  });
}

async function confirmReceipt(requestId) {
  const receiverName = document.getElementById('wardReceiverName').value.trim();
  if (!receiverName) { toast('warning', 'กรุณากรอกชื่อผู้รับของ'); return; }
  try {
    await callApi('confirmWardReceipt', { requestId, receiverName });
    closeModal();
    toast('success', 'รับของและปิดงานเรียบร้อยแล้ว');
    await loadUserWorkspace();
    const result = await Swal.fire({
      icon: 'success', title: 'ปิดงานเรียบร้อย', showCancelButton: true,
      confirmButtonText: 'พิมพ์ใบสรุป', cancelButtonText: 'ปิด'
    });
    if (result.isConfirmed) printRequest(requestId, 'summary');
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

/* ==================================================================
   ADMIN WORKSPACE
   ================================================================== */
async function loadAdminWorkspace() {
  adminRequests = await callApi('getAdminRequests', {});
  renderAdminAll();
}

function renderAdminAll() {
  const queue = adminRequests.filter(r => r.status === 'submitted');
  const processing = adminRequests.filter(r => ['received', 'processing'].includes(r.status));
  const waiting = adminRequests.filter(r => r.status === 'issued_waiting_receipt');

  document.getElementById('adminQueueMetric').textContent = queue.length;
  document.getElementById('adminProcMetric').textContent = processing.length;

  document.getElementById('adminQueueBody').innerHTML = queue.length ? queue.map(r => `
<tr><td>${escapeHtml(r.requestNo)}</td><td>${escapeHtml(r.ward)}</td><td>${fmtDateTime(r.updatedAt || r.requestDate)}</td>
    <td>${escapeHtml(r.shift)}</td><td>${escapeHtml(r.requesterName)}</td><td>${r.totalRequested}</td>
    <td><button class="table-btn primary" onclick="adminReceive('${r.requestId}')"><i class="fas fa-inbox"></i> รับใบเบิก</button></td></tr>`
  ).join('') : `<tr class="empty-row"><td colspan="7">ไม่มีใบเบิกรอรับ</td></tr>`;

  document.getElementById('adminProcessingBody').innerHTML = processing.length ? processing.map(r => `
<tr><td>${escapeHtml(r.requestNo)}</td><td>${escapeHtml(r.ward)}</td><td>${fmtDateTime(r.updatedAt || r.requestDate)}</td>
    <td>${escapeHtml(r.shift)}</td><td>${statusTag(r.status)}</td><td>${r.totalRequested}</td>
    <td><button class="table-btn primary" onclick="openAdminWorkModal('${r.requestId}')"><i class="fas fa-clipboard-check"></i> จัดการ</button></td></tr>`
  ).join('') : `<tr class="empty-row"><td colspan="7">ไม่มีงานที่กำลังดำเนินการ</td></tr>`;

  document.getElementById('adminWaitingBody').innerHTML = waiting.length ? waiting.map(r => `
<tr><td>${escapeHtml(r.requestNo)}</td><td>${escapeHtml(r.ward)}</td><td>${fmtDateTime(r.updatedAt || r.requestDate)}</td>
    <td>${escapeHtml(r.shift)}</td><td>${r.totalIssued}</td><td>${r.totalOutstanding}</td>
    <td><button class="table-btn secondary" onclick="viewRequest('${r.requestId}')"><i class="fas fa-eye"></i> ดู</button>
        <button class="table-btn primary" onclick="printRequest('${r.requestId}','issue-slip')"><i class="fas fa-print"></i> พิมพ์ใบนำจ่าย</button></td></tr>`
  ).join('') : `<tr class="empty-row"><td colspan="7">ไม่มีรายการรอหน่วยงานรับของ</td></tr>`;

  document.getElementById('adminHistoryBody').innerHTML = adminRequests.length ? adminRequests.map(r => `
<tr><td>${escapeHtml(r.requestNo)}</td><td>${escapeHtml(r.ward)}</td><td>${fmtDateTime(r.updatedAt || r.requestDate)}</td>
    <td>${escapeHtml(r.shift)}</td><td>${statusTag(r.status)}</td><td>${r.totalRequested}</td><td>${r.totalIssued}</td><td>${r.totalOutstanding}</td>
    <td><button class="table-btn secondary" onclick="viewRequest('${r.requestId}')"><i class="fas fa-eye"></i> ดู</button></td></tr>`
  ).join('') : `<tr class="empty-row"><td colspan="9">ยังไม่มีประวัติ</td></tr>`;
}

function adminReceive(requestId) {
  Swal.fire({
    title: 'รับใบเบิกเข้าคิว', html: `<input type="text" id="swalReceiverName" class="swal2-input" placeholder="ชื่อผู้รับใบเบิก">`,
    showCancelButton: true, confirmButtonText: 'ยืนยันรับ', cancelButtonText: 'ยกเลิก',
    preConfirm: () => {
      const v = document.getElementById('swalReceiverName').value.trim();
      if (!v) { Swal.showValidationMessage('กรุณากรอกชื่อผู้รับ'); return false; }
      return v;
    }
  }).then(async result => {
    if (!result.isConfirmed) return;
    try {
      await callApi('adminReceiveRequest', { requestId, receiverName: result.value });
      toast('success', 'รับใบเบิกเรียบร้อยแล้ว');
      await loadAdminWorkspace();
      openAdminWorkModal(requestId);
    } catch (err) {
      Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
  });
}

async function openAdminWorkModal(requestId) {
  const detail = await callApi('getRequestDetail', { requestId });
  const isCounting = detail.header.status === 'received';
  const rowsHtml = detail.lines.map(l => `
    <tr data-line="${l.lineNo}">
      <td>${escapeHtml(l.itemName)}<div style="color:var(--muted);font-size:.72rem;">${escapeHtml(l.unit)}</div></td>
      <td>${l.exchangedQty}</td>
      <td>${l.requestedQty}</td>
      <td><input type="number" min="0" class="qty-input" id="cnt_${l.lineNo}" value="${l.countedQty !== '' && l.countedQty !== undefined ? l.countedQty : l.requestedQty}" ${isCounting ? '' : 'disabled'}></td>
      <td><input type="number" min="0" class="qty-input" id="iss_${l.lineNo}" value="${l.issuedQty || (isCounting ? '' : l.countedQty || 0)}" ${isCounting ? 'disabled' : ''}></td>
      <td><input type="text" class="note-input" id="anote_${l.lineNo}" value="${escapeHtml(l.adminNote || '')}" placeholder="หมายเหตุ"></td>
    </tr>`).join('');

  const buttons = isCounting
    ? [{ label: 'บันทึกรายการตอบรับ', cls: 'primary-btn', onClick: () => adminSaveCount(requestId) }]
    : [{ label: 'กดจ่ายของ / ลงชื่อผู้จ่าย', cls: 'primary-btn', onClick: () => adminSaveIssue(requestId) }];

  openModal(`จัดการใบเบิก — ${detail.header.requestNo}`,
`${detail.header.ward} • วันที่ใบเบิก ${fmtDate(detail.header.requestDate)} • ทำรายการ ${fmtDateTime(detail.header.submittedAt)} • เวร${detail.header.shift} • ผู้เบิก: ${escapeHtml(detail.header.requesterName)}`,
    `<p style="margin-bottom:10px;">สถานะปัจจุบัน: ${statusTag(detail.header.status)}</p>
     <div class="table-wrap"><table>
       <thead><tr><th>รายการ</th><th>ส่งแลก</th><th>ขอเบิก</th><th>นับได้ ${isCounting ? '' : '(บันทึกแล้ว)'}</th><th>จ่าย ${isCounting ? '(รอบันทึกก่อน)' : ''}</th><th>หมายเหตุ</th></tr></thead>
       <tbody>${rowsHtml}</tbody>
     </table></div>
     ${isCounting ? '' : `<div class="field" style="margin-top:16px;max-width:320px;">ชื่อผู้จ่ายของ (ลงชื่อ)<input type="text" id="adminIssuerName" placeholder="ชื่อ-นามสกุล"></div>`}
    `, buttons);
}

async function adminSaveCount(requestId) {
  const rows = document.querySelectorAll('#modalRoot [data-line]');
  const lines = Array.from(rows).map(row => {
    const lineNo = Number(row.getAttribute('data-line'));
    return {
      lineNo,
      countedQty: num(document.getElementById('cnt_' + lineNo).value),
      adminNote: document.getElementById('anote_' + lineNo).value.trim()
    };
  });
  try {
    await callApi('adminRecordCount', { requestId, actorName: currentRole === 'admin' ? 'แอดมิน' : '', lines });
    toast('success', 'บันทึกรายการตอบรับแล้ว');
    closeModal();
    await loadAdminWorkspace();
    openAdminWorkModal(requestId);
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

async function adminSaveIssue(requestId) {
  const issuerName = document.getElementById('adminIssuerName').value.trim();
  if (!issuerName) { toast('warning', 'กรุณากรอกชื่อผู้จ่ายของ'); return; }
  const rows = document.querySelectorAll('#modalRoot [data-line]');
  const lines = Array.from(rows).map(row => {
    const lineNo = Number(row.getAttribute('data-line'));
    return {
      lineNo,
      requestedQty: undefined,
      issuedQty: num(document.getElementById('iss_' + lineNo).value),
      adminNote: document.getElementById('anote_' + lineNo).value.trim()
    };
  });
  let printWindow = null;
  try {
    // เปิดหน้าต่างไว้จากการคลิกโดยตรง ป้องกันเบราว์เซอร์บล็อกหน้าพิมพ์หลังรอ API
    printWindow = window.open('', '_blank');
    // ต้องแนบ requestedQty จริงเพื่อคำนวณคงค้างฝั่ง backend (ดึงจาก detail อีกครั้ง)
    const detail = await callApi('getRequestDetail', { requestId });
    lines.forEach(l => {
      const src = detail.lines.find(x => x.lineNo === l.lineNo);
      l.requestedQty = src ? src.requestedQty : 0;
    });
    await callApi('adminIssueRequest', { requestId, issuerName, lines });
    toast('success', 'บันทึกการจ่ายของแล้ว');
    closeModal();
    await loadAdminWorkspace();
    await printRequest(requestId, 'issue-slip', printWindow);
  } catch (err) {
    if (printWindow && !printWindow.closed) printWindow.close();
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

/* ==================================================================
   MODAL
   ================================================================== */
function openModal(title, subtitle, bodyHtml, buttons) {
  buttons = buttons || [];
  document.body.classList.add('modal-open');
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-head">
          <div><h3>${title}</h3><p>${subtitle || ''}</p></div>
          <button class="modal-close" onclick="closeModal()"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">
          <button class="ghost-btn" onclick="closeModal()">ปิด</button>
          ${buttons.map((b, i) => `<button class="${b.cls}" id="modalBtn${i}"><i class="fas fa-check"></i> ${b.label}</button>`).join('')}
        </div>
      </div>
    </div>`;
  buttons.forEach((b, i) => document.getElementById('modalBtn' + i).addEventListener('click', b.onClick));
}
function closeModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('modalRoot').innerHTML = '';
}

/* ==================================================================
   PRINT
   ================================================================== */
async function printRequest(requestId, mode, existingWindow) {
  const detail = await callApi('getRequestDetail', { requestId });
  const h = detail.header;
  const isIssueSlip = mode === 'issue-slip';
  const isIssue = mode === 'issue' || isIssueSlip;
  const rowsHtml = detail.lines.map((l, i) => `
    <tr>
      <td style="text-align:center;">${i + 1}</td>
      <td>${escapeHtml(l.itemName)}</td>
      ${isIssue ? `
        <td style="text-align:center;">${l.requestedQty || '-'}${Number(l.carriedQty || 0) > 0 ? `<div class="carry-note">ค้างรอบก่อน ${l.carriedQty}</div>` : ''}</td>
        <td class="write-cell">${isIssueSlip ? (l.countedQty || '-') : '&nbsp;'}</td>
        <td class="write-cell">${isIssueSlip ? (l.issuedQty || '-') : '&nbsp;'}</td>
        <td class="write-cell">${isIssueSlip ? (l.outstandingQty || '-') : '&nbsp;'}</td>
        <td>${escapeHtml(isIssueSlip ? (l.adminNote || l.wardNote || '') : (l.wardNote || ''))}</td>
      ` : `
        <td style="text-align:center;">${escapeHtml(l.unit)}</td>
        <td style="text-align:center;">${l.requestedQty || '-'}</td>
        <td style="text-align:center;">${l.countedQty || '-'}</td>
        <td style="text-align:center;">${l.issuedQty || '-'}</td>
        <td style="text-align:center;">${l.outstandingQty || '-'}</td>
        <td>${escapeHtml(l.adminNote || l.wardNote || '')}</td>
      `}
    </tr>`).join('');

  const headCols = isIssue
    ? `<th>ลำดับที่</th><th>รายการ</th><th>จำนวนขอเบิก</th><th>นับได้</th><th>จ่าย</th><th>ค้าง</th><th>หมายเหตุ</th>`
    : `<th>ลำดับ</th><th>รายการวัสดุ</th><th>หน่วย</th><th>ขอเบิก</th><th>นับได้</th><th>จ่าย</th><th>คงค้าง</th><th>หมายเหตุ</th>`;

  const w = existingWindow || window.open('', '_blank');
  if (!w) throw new Error('ไม่สามารถเปิดหน้าพิมพ์ได้ กรุณาอนุญาตป๊อปอัปของเว็บไซต์');
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>${isIssueSlip ? 'ใบนำจ่ายวัสดุปราศจากเชื้อ' : isIssue ? 'ใบเบิกวัสดุปราศจากเชื้อ' : 'ใบสรุปการรับวัสดุปราศจากเชื้อ'} ${escapeHtml(h.requestNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{font-family:'Sarabun',sans-serif;box-sizing:border-box;}
    body{padding:30px;color:#193047;}
    h1{font-size:1.3rem;text-align:center;margin-bottom:4px;}
    h1 .org-name{display:block;font-size:1rem;font-weight:500;margin-top:2px;}
    .sub{text-align:center;color:#667789;font-size:.85rem;margin-bottom:18px;}
    .meta{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:16px;flex-wrap:wrap;gap:6px;}
    .meta-times{text-align:right;margin-left:auto;line-height:1.55;}
    table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:24px;}
    th,td{border:1px solid #c7d6e6;padding:7px 8px;}
    th{background:#eef4fb;}
    .write-cell{min-width:72px;height:34px;text-align:center;}
    .carry-note{font-size:.7rem;color:#667789;font-weight:400;margin-top:2px;}
    .sign-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px;text-align:center;font-size:.82rem;}
    .sign-line{border-top:1px solid #444;margin-top:46px;padding-top:6px;}
    @media print{ body{padding:10px;} }
  </style></head><body>
    <h1>ใบเบิก-จ่ายเครื่องมือและวัสดุปราศจากเชื้อ<span class="org-name">โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</span></h1>
    <div class="sub">เลขที่ใบเบิก: ${escapeHtml(h.requestNo)}</div>
    <div class="meta">
      <div>
        <div>หน่วยงาน: <strong>${escapeHtml(h.ward)}</strong></div>
        <div>วันที่ใบเบิก: <strong>${fmtDate(h.requestDate)}</strong></div>
        <div>เวร: <strong>${escapeHtml(h.shift)}</strong></div>
        <div>สถานะ: <strong>${STATUS_LABELS[h.status] || h.status}</strong></div>
      </div>
      <div class="meta-times">
        <div>ส่งเบิก: <strong>${fmtDateTime(h.submittedAt)}</strong></div>
        <div>รับใบเบิก: <strong>${fmtDateTime(h.adminReceivedAt)}</strong></div>
        <div>นำจ่าย: <strong>${fmtDateTime(h.adminIssuedAt)}</strong></div>
      </div>
    </div>
    <table><thead><tr>${headCols}</tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="sign-grid">
      <div>${escapeHtml(h.requesterName || '.......................')}<div class="sign-line">ผู้เบิก</div></div>
      ${isIssue
        ? `<div>.......................<div class="sign-line">ผู้รับใบเบิก (แอดมิน)</div></div>
           <div>.......................<div class="sign-line">ผู้จ่ายของ (แอดมิน)</div></div>`
        : `<div>${escapeHtml(h.adminIssuerName || '.......................')}<div class="sign-line">ผู้จ่ายของ</div></div>
           <div>${escapeHtml(h.wardReceiverName || '.......................')}<div class="sign-line">ผู้รับของ</div></div>`}
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);}</script>
  </body></html>`);
  w.document.close();
}

/* --------------------------------- INIT --------------------------------- */
bootstrap();
