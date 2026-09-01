const STERILE_CONFIG = {
  // ผู้ใช้จะต้องนำ ID ของ Spreadsheet มาใส่เอง
  spreadsheetId: '1eXmizPr0yA4xszS5UFpOMWB77SdzB5zDyA7a6qS8z5A', 
  appVersion: '2026.09.01.01',
  timeZone: 'Asia/Bangkok',
  sheets: {
    master: 'SterileMaster',
    header: 'SterileRequestHeader',
    line: 'SterileRequestLine',
    carryForward: 'SterileCarryForward'
  }
};

const STERILE_HEADERS = {
  SterileMaster: [
    'Item Name',
    'Main Category',
    'Unit'
  ],
  SterileRequestHeader: [
    'Request ID',
    'Request No',
    'Request Date',
    'Ward',
    'Shift',
    'Status',
    'Requester Name',
    'Submitted At',
    'Admin Receiver Name',
    'Admin Received At',
    'Admin Counted At',
    'Admin Issuer Name',
    'Admin Issued At',
    'Ward Receiver Name',
    'Ward Received At',
    'Last Updated At',
    'Last Updated By'
  ],
  SterileRequestLine: [
    'Request ID',
    'Line No',
    'Item Name',
    'Main Category',
    'Unit',
    'Carried Qty',
    'Exchanged Qty',
    'Requested Qty',
    'Ward Note',
    'Counted Qty',
    'Issued Qty',
    'Outstanding Qty',
    'Admin Note'
  ],
  SterileCarryForward: [
    'Ward',
    'Item Name',
    'Main Category',
    'Unit',
    'Outstanding Qty',
    'Last Updated'
  ]
};

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    let payload = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (method === 'GET' && e.parameter) {
      payload = e.parameter;
    }
    
    if (payload.action === 'ping') return successResponse_({ message: 'pong', version: STERILE_CONFIG.appVersion });

    const result = routeAction_(payload.action, payload);
    return successResponse_(result);
  } catch (err) {
    return errorResponse_(err);
  }
}

function routeAction_(action, payload) {
  switch (action) {
    case 'setupDatabase':
      return setupDatabase_();
    case 'getAppMeta':
      return { checkedAt: formatDateTime_(new Date()) };
    case 'getWards':
      return getWards_();
    case 'getSterileMaster':
      return getSterileMaster_(payload.ward);
    case 'getWardRequests':
      return getWardRequests_(payload.ward);
    case 'getAdminRequests':
      return getAdminRequests_(payload.status);
    case 'getRequestDetail':
      return getRequestDetail_(payload.requestId);
    case 'submitRequest':
      return submitRequest_(payload);
    case 'adminReceiveRequest':
      return adminReceiveRequest_(payload);
    case 'adminRecordCount':
      return adminRecordCount_(payload);
    case 'adminIssueRequest':
      return adminIssueRequest_(payload);
    case 'confirmWardReceipt':
      return confirmWardReceipt_(payload);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function getSpreadsheet_() {
  if (!STERILE_CONFIG.spreadsheetId) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return SpreadsheetApp.openById(STERILE_CONFIG.spreadsheetId);
}

function getSheet_(sheetName) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบ Sheet: ${sheetName} กรุณารัน setupDatabase ก่อน`);
  return sheet;
}

// Public entry point so Apps Script shows database setup in the Run menu.
function setupDatabase() {
  return setupDatabase_();
}

function setupDatabase_() {
  const ss = getSpreadsheet_();
  if (!ss) throw new Error('ไม่พบ Spreadsheet');
  
  const results = [];
  for (const [key, sheetName] of Object.entries(STERILE_CONFIG.sheets)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      results.push(`Created sheet: ${sheetName}`);
    } else {
      results.push(`Sheet exists: ${sheetName}`);
    }
    
    const headers = STERILE_HEADERS[sheetName];
    if (headers && headers.length > 0) {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
      if (sheetName === STERILE_CONFIG.sheets.master && currentHeaders.indexOf('Ward') > -1) {
        const oldData = sheet.getLastRow() > 1
          ? sheet.getRange(2, 1, sheet.getLastRow() - 1, currentHeaders.length).getValues()
          : [];
        const itemIdx = currentHeaders.indexOf('Item Name');
        const categoryIdx = currentHeaders.indexOf('Main Category');
        const unitIdx = currentHeaders.indexOf('Unit');
        const migrated = oldData
          .filter(row => row[itemIdx])
          .map(row => [row[itemIdx], row[categoryIdx], row[unitIdx]]);
        sheet.clearContents();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        if (migrated.length) sheet.getRange(2, 1, migrated.length, headers.length).setValues(migrated);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
        sheet.setFrozenRows(1);
        results.push(`Migrated ${sheetName} to central item list`);
      } else if (currentHeaders.length !== headers.length || headers.some((header, index) => currentHeaders[index] !== header)) {
        sheet.getRange(1, 1, 1, Math.max(currentHeaders.length, headers.length)).clearContent();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
        sheet.setFrozenRows(1);
        results.push(`Set headers for ${sheetName}`);
      }
    }
  }
  return { message: 'Setup completed', details: results };
}

function num_(val, fallback = 0) {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, STERILE_CONFIG.timeZone, "dd/MM/yyyy HH:mm:ss");
}

function getWards_() {
  const sheet = getSheet_(STERILE_CONFIG.sheets.master);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const wards = [...new Set(data.slice(1).map(r => r[0]).filter(Boolean))];
  return wards.sort();
}

function getSterileMaster_(ward) {
  const cfSheet = getSheet_(STERILE_CONFIG.sheets.carryForward);
  const cfData = cfSheet.getDataRange().getValues();
  const carryMap = {}; 
  if (cfData.length > 1) {
    const cfHeaders = cfData[0];
    const wIdx = cfHeaders.indexOf('Ward');
    const iIdx = cfHeaders.indexOf('Item Name');
    const qIdx = cfHeaders.indexOf('Outstanding Qty');
    
    cfData.slice(1).forEach(row => {
      if (row[wIdx] === ward && num_(row[qIdx]) > 0) {
        carryMap[row[iIdx]] = num_(row[qIdx]);
      }
    });
  }

  const sheet = getSheet_(STERILE_CONFIG.sheets.master);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  
  const iIdx = headers.indexOf('Item Name');
  const mIdx = headers.indexOf('Main Category');
  const uIdx = headers.indexOf('Unit');
  const aIdx = headers.indexOf('Active');
  
  const items = [];
  data.slice(1).forEach(row => {
    if (row[iIdx] && (aIdx === -1 || row[aIdx] === true || String(row[aIdx]).toUpperCase() === 'TRUE' || row[aIdx] === '')) {
      const itemName = row[iIdx];
      items.push({
        itemName: itemName,
        mainCategory: row[mIdx],
        unit: row[uIdx],
        carriedQty: carryMap[itemName] || 0
      });
    }
  });
  return items;
}

function generateRequestNo_() {
  const sheet = getSheet_(STERILE_CONFIG.sheets.header);
  const data = sheet.getDataRange().getValues();
  
  const dateStr = Utilities.formatDate(new Date(), STERILE_CONFIG.timeZone, "yyyyMMdd");
  let seq = 1;
  
  if (data.length > 1) {
    const noIdx = data[0].indexOf('Request No');
    const todayReqs = data.slice(1).map(r => String(r[noIdx])).filter(no => no.includes(`ST-REQ-${dateStr}`));
    if (todayReqs.length > 0) {
      const lastSeq = Math.max(...todayReqs.map(no => parseInt(no.split('-').pop(), 10)));
      seq = lastSeq + 1;
    }
  }
  
  return `ST-REQ-${dateStr}-${String(seq).padStart(3, '0')}`;
}

function getWardRequests_(ward) {
  return getSummarizedRequests_(r => r.header.ward === ward);
}

function getAdminRequests_(status) {
  return getSummarizedRequests_(r => !status || r.header.status === status);
}

function getSummarizedRequests_(filterFn) {
  const allReqs = getAllRequests_();
  const summarized = [];
  for (const r of allReqs) {
    if (filterFn(r)) {
      summarized.push({
        requestId: r.header.requestId,
        requestNo: r.header.requestNo,
        requestDate: r.header.requestDate,
        ward: r.header.ward,
        shift: r.header.shift,
        status: r.header.status,
        requesterName: r.header.requesterName,
        submittedAt: r.header.submittedAt,
        updatedAt: r.header.lastUpdatedAt,
        totalRequested: r.lines.reduce((sum, l) => sum + num_(l.requestedQty), 0),
        totalCounted: r.lines.reduce((sum, l) => sum + num_(l.countedQty), 0),
        totalIssued: r.lines.reduce((sum, l) => sum + num_(l.issuedQty), 0),
        totalOutstanding: r.lines.reduce((sum, l) => sum + num_(l.outstandingQty), 0)
      });
    }
  }
  return summarized.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function getRequestDetail_(requestId) {
  const allReqs = getAllRequests_();
  const req = allReqs.find(r => r.header.requestId === requestId);
  if (!req) throw new Error('ไม่พบใบเบิก');
  return req;
}

function getAllRequests_() {
  const hSheet = getSheet_(STERILE_CONFIG.sheets.header);
  const lSheet = getSheet_(STERILE_CONFIG.sheets.line);
  
  const hData = hSheet.getDataRange().getValues();
  const lData = lSheet.getDataRange().getValues();
  
  if (hData.length <= 1) return [];
  
  const hHeaders = hData[0];
  const lHeaders = lData.length > 0 ? lData[0] : [];
  
  const requests = [];
  const linesByReq = {};
  
  if (lData.length > 1) {
    lData.slice(1).forEach(row => {
      const reqId = row[lHeaders.indexOf('Request ID')];
      if (!linesByReq[reqId]) linesByReq[reqId] = [];
      linesByReq[reqId].push({
        lineNo: row[lHeaders.indexOf('Line No')],
        itemName: row[lHeaders.indexOf('Item Name')],
        mainCategory: row[lHeaders.indexOf('Main Category')],
        unit: row[lHeaders.indexOf('Unit')],
        carriedQty: row[lHeaders.indexOf('Carried Qty')],
        exchangedQty: row[lHeaders.indexOf('Exchanged Qty')],
        requestedQty: row[lHeaders.indexOf('Requested Qty')],
        wardNote: row[lHeaders.indexOf('Ward Note')],
        countedQty: row[lHeaders.indexOf('Counted Qty')],
        issuedQty: row[lHeaders.indexOf('Issued Qty')],
        outstandingQty: row[lHeaders.indexOf('Outstanding Qty')],
        adminNote: row[lHeaders.indexOf('Admin Note')]
      });
    });
  }
  
  hData.slice(1).forEach(row => {
    const reqId = row[hHeaders.indexOf('Request ID')];
    requests.push({
      header: {
        requestId: reqId,
        requestNo: row[hHeaders.indexOf('Request No')],
        requestDate: row[hHeaders.indexOf('Request Date')],
        ward: row[hHeaders.indexOf('Ward')],
        shift: row[hHeaders.indexOf('Shift')],
        status: row[hHeaders.indexOf('Status')],
        requesterName: row[hHeaders.indexOf('Requester Name')],
        submittedAt: row[hHeaders.indexOf('Submitted At')],
        adminReceiverName: row[hHeaders.indexOf('Admin Receiver Name')],
        adminReceivedAt: row[hHeaders.indexOf('Admin Received At')],
        adminCountedAt: row[hHeaders.indexOf('Admin Counted At')],
        adminIssuerName: row[hHeaders.indexOf('Admin Issuer Name')],
        adminIssuedAt: row[hHeaders.indexOf('Admin Issued At')],
        wardReceiverName: row[hHeaders.indexOf('Ward Receiver Name')],
        wardReceivedAt: row[hHeaders.indexOf('Ward Received At')],
        lastUpdatedAt: row[hHeaders.indexOf('Last Updated At')],
        lastUpdatedBy: row[hHeaders.indexOf('Last Updated By')]
      },
      lines: (linesByReq[reqId] || []).sort((a, b) => num_(a.lineNo) - num_(b.lineNo))
    });
  });
  
  return requests;
}

function submitRequest_(payload) {
  const hSheet = getSheet_(STERILE_CONFIG.sheets.header);
  const lSheet = getSheet_(STERILE_CONFIG.sheets.line);
  const masterItems = getSterileMaster_('');
  const masterKeys = new Set(masterItems.map(item => `${item.itemName}|${item.mainCategory}|${item.unit}`));
  (payload.lines || []).forEach(line => {
    const key = `${line.itemName}|${line.mainCategory || ''}|${line.unit || ''}`;
    if (!masterKeys.has(key)) throw new Error(`ไม่พบรายการในฐานข้อมูลกลาง: ${line.itemName}`);
  });
  
  const requestId = 'r_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 7);
  const requestNo = generateRequestNo_();
  const now = formatDateTime_(new Date());
  
  hSheet.appendRow([
    requestId,
    requestNo,
    payload.requestDate,
    payload.ward,
    payload.shift,
    'submitted',
    payload.requesterName,
    now,
    '', '', '', '', '', '', '',
    now,
    payload.requesterName
  ]);
  
  if (payload.lines && payload.lines.length > 0) {
    const lineRows = payload.lines.map((l, i) => [
      requestId,
      i + 1,
      l.itemName,
      l.mainCategory || '',
      l.unit || '',
      num_(l.carriedQty),
      num_(l.exchangedQty),
      num_(l.requestedQty),
      l.wardNote || '',
      '', '', '', ''
    ]);
    lSheet.getRange(lSheet.getLastRow() + 1, 1, lineRows.length, lineRows[0].length).setValues(lineRows);
    
    clearCarryForward_(payload.ward, payload.lines);
  }
  
  return { message: 'สร้างใบเบิกเรียบร้อยแล้ว', requestId, requestNo };
}

function clearCarryForward_(ward, lines) {
  const cfSheet = getSheet_(STERILE_CONFIG.sheets.carryForward);
  const data = cfSheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  const h = data[0];
  const wIdx = h.indexOf('Ward');
  const iIdx = h.indexOf('Item Name');
  const qIdx = h.indexOf('Outstanding Qty');
  
  const itemNames = lines.map(l => l.itemName);
  
  const updates = [];
  for (let r = 1; r < data.length; r++) {
    if (data[r][wIdx] === ward && itemNames.includes(data[r][iIdx])) {
      updates.push({ row: r + 1, col: qIdx + 1, val: 0 });
    }
  }
  
  updates.forEach(u => cfSheet.getRange(u.row, u.col).setValue(u.val));
}

function updateHeaderStatus_(requestId, updates) {
  const hSheet = getSheet_(STERILE_CONFIG.sheets.header);
  const data = hSheet.getDataRange().getValues();
  const h = data[0];
  const idIdx = h.indexOf('Request ID');
  
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === requestId) {
      for (const [key, val] of Object.entries(updates)) {
        const colIdx = h.indexOf(key);
        if (colIdx > -1) hSheet.getRange(r + 1, colIdx + 1).setValue(val);
      }
      return data[r]; 
    }
  }
  throw new Error('ไม่พบใบเบิก');
}

function updateLines_(requestId, lineUpdates) {
  const lSheet = getSheet_(STERILE_CONFIG.sheets.line);
  const data = lSheet.getDataRange().getValues();
  const h = data[0];
  const idIdx = h.indexOf('Request ID');
  const noIdx = h.indexOf('Line No');
  
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === requestId) {
      const lineNo = data[r][noIdx];
      const update = lineUpdates.find(u => u.lineNo === lineNo);
      if (update) {
        for (const [key, val] of Object.entries(update.data)) {
          const colIdx = h.indexOf(key);
          if (colIdx > -1) lSheet.getRange(r + 1, colIdx + 1).setValue(val);
        }
      }
    }
  }
}

function adminReceiveRequest_(payload) {
  const now = formatDateTime_(new Date());
  updateHeaderStatus_(payload.requestId, {
    'Status': 'received',
    'Admin Receiver Name': payload.receiverName,
    'Admin Received At': now,
    'Last Updated At': now,
    'Last Updated By': payload.receiverName
  });
  return { status: 'received' };
}

function adminRecordCount_(payload) {
  const now = formatDateTime_(new Date());
  
  const lineUpdates = (payload.lines || []).map(l => ({
    lineNo: l.lineNo,
    data: {
      'Counted Qty': num_(l.countedQty),
      'Admin Note': l.adminNote || ''
    }
  }));
  updateLines_(payload.requestId, lineUpdates);
  
  updateHeaderStatus_(payload.requestId, {
    'Status': 'processing',
    'Admin Counted At': now,
    'Last Updated At': now,
    'Last Updated By': payload.actorName || 'Admin'
  });
  return { status: 'processing' };
}

function adminIssueRequest_(payload) {
  const now = formatDateTime_(new Date());
  
  const reqDetail = getRequestDetail_(payload.requestId);
  
  const lineUpdates = (payload.lines || []).map(l => {
    const target = reqDetail.lines.find(rl => rl.lineNo === l.lineNo);
    const requested = target ? num_(target.requestedQty) : 0;
    const issued = num_(l.issuedQty);
    const outstanding = Math.max(requested - issued, 0);
    
    return {
      lineNo: l.lineNo,
      data: {
        'Issued Qty': issued,
        'Outstanding Qty': outstanding,
        'Admin Note': l.adminNote !== undefined ? l.adminNote : (target ? target.adminNote : '')
      }
    };
  });
  updateLines_(payload.requestId, lineUpdates);
  
  updateHeaderStatus_(payload.requestId, {
    'Status': 'issued_waiting_receipt',
    'Admin Issuer Name': payload.issuerName,
    'Admin Issued At': now,
    'Last Updated At': now,
    'Last Updated By': payload.issuerName
  });
  return { status: 'issued_waiting_receipt' };
}

function confirmWardReceipt_(payload) {
  const now = formatDateTime_(new Date());
  const reqDetail = getRequestDetail_(payload.requestId);
  const ward = reqDetail.header.ward;
  
  const cfSheet = getSheet_(STERILE_CONFIG.sheets.carryForward);
  const cfData = cfSheet.getDataRange().getValues();
  const cfH = cfData[0];
  const wIdx = cfH.indexOf('Ward');
  const iIdx = cfH.indexOf('Item Name');
  const qIdx = cfH.indexOf('Outstanding Qty');
  const dIdx = cfH.indexOf('Last Updated');
  
  reqDetail.lines.forEach(l => {
    const outstanding = num_(l.outstandingQty);
    if (outstanding <= 0) return;
    
    let found = false;
    for (let r = 1; r < cfData.length; r++) {
      if (cfData[r][wIdx] === ward && cfData[r][iIdx] === l.itemName) {
        cfSheet.getRange(r + 1, qIdx + 1).setValue(num_(cfData[r][qIdx]) + outstanding);
        cfSheet.getRange(r + 1, dIdx + 1).setValue(now);
        found = true;
        break;
      }
    }
    
    if (!found) {
      cfSheet.appendRow([
        ward, l.itemName, l.mainCategory, l.unit, outstanding, now
      ]);
    }
  });
  
  updateHeaderStatus_(payload.requestId, {
    'Status': 'completed',
    'Ward Receiver Name': payload.receiverName,
    'Ward Received At': now,
    'Last Updated At': now,
    'Last Updated By': payload.receiverName
  });
  return { status: 'completed' };
}

function successResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: data, message: data.message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(err) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
    .setMimeType(ContentService.MimeType.JSON);
}
