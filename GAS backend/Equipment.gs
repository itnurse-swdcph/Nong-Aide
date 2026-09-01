function doGet(e) {
  var action = e.parameter.action;
  
  // 1. ดึงข้อมูลเฉพาะหน่วยงาน (สำหรับ Staff)
  if (action == 'getItemsByWard') {
    return getItemsByWard(e.parameter.ward);
  }
  
  // 2. ดึงข้อมูลทั้งหมด (สำหรับ Admin)
  if (action == 'getAllItems') {
    return getAllItems();
  }

  if (action == 'getInspectionWindowStatus') {
    return getInspectionWindowStatus();
  }

  if (action == 'getDepartmentSummaryReport') {
    return getDepartmentSummaryReport(e.parameter.fiscalYear);
  }

  if (action == 'getLatestInspectionRecord') {
    return getLatestInspectionRecord(e.parameter);
  }

  if (action == 'getApiInfo') {
    return getApiInfo();
  }
  
  return ContentService.createTextOutput("API is running...").setMimeType(ContentService.MimeType.TEXT);
}

var MASTER_HEADER_ALIASES_ = {
  rmcNo: ['RMC No'],
  itemId: ['เลขครุภัณฑ์'],
  name: ['ชื่อครุภัณฑ์'],
  brand: ['ยี่ห้อ'],
  model: ['ชื่อรุ่น', 'รุ่น'],
  type: ['ประเภทครุภัณฑ์', 'ประเภท'],
  toolType: ['ประเภทเครื่องมือ'],
  ownerWard: ['หน่วยงาน', 'หน่วยงานเจ้าของ'],
  usageWard: ['ใช้งานที่', 'หน่วยงานที่ใช้งาน'],
  subLocation: ['ตำแหน่งย่อย (Sub-location)', 'ตำแหน่งย่อย', 'Sub-location'],
  riskLevel: ['RISK LEVEL', 'Risk Level', 'ระดับความเสี่ยง'],
  inspectionFrequency: ['ความถี่การตรวจนับ (เดือน)', 'ความถี่การตรวจนับ'],
  status: ['สถานะ'],
  imageUrl: ['URL รูปภาพปก', 'รูปภาพปก'],
  lastInspectionDate: ['วันที่ตรวจล่าสุด'],
  detailLink: ['รายละเอียดครุภัณฑ์', 'Link รายละเอียดครุภัณฑ์']
};

var HISTORY_HEADER_ALIASES_ = {
  timestamp: ['Timestamp'],
  itemId: ['เลขครุภัณฑ์'],
  inspectorName: ['ชื่อผู้ตรวจนับ'],
  ward: ['หน่วยงานที่ตรวจ'],
  status: ['สถานะที่อัปเดต'],
  note: ['หมายเหตุ'],
  imageUrl: ['ภาพถ่ายตอนชำรุด']
};

var EQUIPMENT_API_VERSION_ = '2026-08-13-historylog-layout-repair';

function getApiInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOutput_({
    status: 'success',
    data: {
      version: EQUIPMENT_API_VERSION_,
      spreadsheetId: ss ? ss.getId() : '',
      spreadsheetName: ss ? ss.getName() : ''
    }
  });
}

function normalizeStatusText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toMasterStatus_(status) {
  var text = normalizeStatusText_(status);
  if (text === 'ปกติ' || text === 'ปกติ/พร้อมใช้งาน' || text === 'พร้อมใช้งาน' || text === 'พร้อมใช้') return 'ปกติ';
  if (text === 'ถูกยืม' || text === 'ถูกยืมใช้งาน' || text === 'ถูกยืมภายใน') return 'ถูกยืม';
  if (text === 'ย้ายหน่วยงาน') return 'ปกติ';
  if (text === 'ชำรุดส่งซ่อม' || text === 'อยู่ระหว่างซ่อม') return 'ชำรุดส่งซ่อม';
  if (text === 'รอจำหน่าย') return 'รอจำหน่าย';
  if (text === 'แทงจำหน่าย' || text === 'จำหน่าย') return 'แทงจำหน่าย';
  return text || 'ปกติ';
}

function toHistoryStatus_(status) {
  var text = normalizeStatusText_(status);
  if (text === 'ย้ายหน่วยงาน') return 'ย้ายหน่วยงาน';
  return toMasterStatus_(text);
}

function normalizeHeaderName_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasMeaningfulValue_(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function parseFlexibleDate_(value) {
  if (!hasMeaningfulValue_(value)) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  // Google Sheets ที่นำเข้าจาก Excel อาจคืนค่า Date เป็น Excel serial number
  // เช่น 46119.59 แทนวันที่จริง ต้องแปลงจาก epoch 1899-12-30 ก่อน
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    var serial = Number(value);
    if (isFinite(serial) && serial > 20000 && serial < 100000) {
      var serialDate = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return isNaN(serialDate.getTime()) ? null : serialDate;
    }
  }
  // CSV จาก Google Sheets ใช้รูปแบบไทย d/m/yyyy, hh:mm:ss
  // ห้ามปล่อยให้ JavaScript ตีความเป็น m/d/yyyy แบบอเมริกัน
  var thaiDateMatch = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (thaiDateMatch) {
    var day = Number(thaiDateMatch[1]);
    var month = Number(thaiDateMatch[2]);
    var year = Number(thaiDateMatch[3]);
    if (year > 2400) year -= 543;
    var hours = Number(thaiDateMatch[4] || 0);
    var minutes = Number(thaiDateMatch[5] || 0);
    var seconds = Number(thaiDateMatch[6] || 0);
    var thaiDate = new Date(year, month - 1, day, hours, minutes, seconds, 0);
    return isNaN(thaiDate.getTime()) ? null : thaiDate;
  }
  var parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    if (parsed.getFullYear() > 2400) {
      parsed.setFullYear(parsed.getFullYear() - 543);
    }
    return parsed;
  }
  return null;
}

function buildHeaderIndexMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = normalizeHeaderName_(headers[i]);
    if (key && map[key] === undefined) {
      map[key] = i;
    }
  }
  return map;
}

function findHeaderIndex_(headerMap, candidates, fallbackIndex) {
  for (var i = 0; i < candidates.length; i++) {
    var key = normalizeHeaderName_(candidates[i]);
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return fallbackIndex;
}

function getFieldIndex_(headerMap, fieldName, fallbackIndex) {
  var candidates = MASTER_HEADER_ALIASES_[fieldName] || [];
  return findHeaderIndex_(headerMap, candidates, fallbackIndex);
}

function getRowValue_(row, headerMap, fieldName, fallbackIndex) {
  var index = getFieldIndex_(headerMap, fieldName, fallbackIndex);
  return index >= 0 ? row[index] : '';
}

function normalizeItemKey_(value) {
  return String(value || '').trim();
}

function buildObjectFromRow_(headers, row) {
  var item = {};
  for (var i = 0; i < headers.length; i++) {
    item[headers[i]] = row[i];
  }
  return item;
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function setSheetValue_(sheet, rowNumber, headerMap, fieldName, value, fallbackIndex) {
  var index = getFieldIndex_(headerMap, fieldName, fallbackIndex);
  if (index >= 0) {
    sheet.getRange(rowNumber, index + 1).setValue(value);
  }
}

function findMasterRowIndex_(masterData, headerMap, itemId) {
  var targetItemId = normalizeItemKey_(itemId);
  if (!targetItemId) return -1;
  for (var i = 1; i < masterData.length; i++) {
    var rowItemId = normalizeItemKey_(getRowValue_(masterData[i], headerMap, 'itemId', 1));
    var rowRmcNo = normalizeItemKey_(getRowValue_(masterData[i], headerMap, 'rmcNo', 0));
    if (rowItemId === targetItemId || rowRmcNo === targetItemId) {
      return i;
    }
  }
  return -1;
}

function findUniqueMasterRowByItemId_(masterData, headerMap, itemId) {
  var targetItemId = normalizeItemKey_(itemId);
  if (!targetItemId) return -1;
  var matchedIndex = -1;
  var matchCount = 0;
  for (var i = 1; i < masterData.length; i++) {
    var rowItemId = normalizeItemKey_(getRowValue_(masterData[i], headerMap, 'itemId', 1));
    if (rowItemId === targetItemId) {
      matchedIndex = i;
      matchCount++;
    }
  }
  if (matchCount > 1) return -2;
  return matchedIndex;
}

function findMasterRowIndexForUpdate_(masterData, headerMap, keys) {
  var rmcNo = normalizeItemKey_(keys && keys.rmcNo);
  var itemId = normalizeItemKey_(keys && keys.itemId);

  if (rmcNo) {
    for (var i = 1; i < masterData.length; i++) {
      var rowRmcNo = normalizeItemKey_(getRowValue_(masterData[i], headerMap, 'rmcNo', 0));
      if (rowRmcNo === rmcNo) return i;
    }
    return -1;
  }

  return findUniqueMasterRowByItemId_(masterData, headerMap, itemId);
}

function buildMasterRowFromItem_(headers, headerMap, item) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push('');
  }

  var valuesByField = {
    rmcNo: item.rmcNo || '',
    itemId: item.itemId || '',
    name: item.name || '',
    brand: item.brand || '',
    model: item.model || '',
    type: item.type || '',
    toolType: item.toolType || '',
    ownerWard: item.ownerWard || '',
    usageWard: item.ownerWard || '',
    subLocation: item.subLoc || '',
    riskLevel: item.riskLevel || 'Low',
    inspectionFrequency: item.freq || 1,
    status: 'ปกติ'
  };

  for (var fieldName in valuesByField) {
    if (!valuesByField.hasOwnProperty(fieldName)) continue;
    var index = getFieldIndex_(headerMap, fieldName, -1);
    if (index >= 0 && index < row.length) {
      row[index] = valuesByField[fieldName];
    }
  }

  return row;
}

function getHistoryFieldIndex_(headerMap, fieldName, fallbackIndex) {
  var candidates = HISTORY_HEADER_ALIASES_[fieldName] || [];
  return findHeaderIndex_(headerMap, candidates, fallbackIndex);
}

function buildHistoryRow_(headers, headerMap, entry) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push('');
  }

  var valuesByField = {
    timestamp: entry.timestamp || new Date(),
    itemId: entry.itemId || '',
    inspectorName: entry.inspectorName || '',
    ward: entry.ward || '',
    status: entry.status || '',
    note: entry.note || '',
    imageUrl: entry.imageUrl || ''
  };

  for (var fieldName in valuesByField) {
    if (!valuesByField.hasOwnProperty(fieldName)) continue;
    var index = getHistoryFieldIndex_(headerMap, fieldName, -1);
    if (index >= 0 && index < row.length) {
      row[index] = valuesByField[fieldName];
    }
  }

  return row;
}

function ensureHistorySheetHeaders_(sheet) {
  var defaultHeaders = ['Timestamp', 'เลขครุภัณฑ์', 'ชื่อผู้ตรวจนับ', 'หน่วยงานที่ตรวจ', 'สถานะที่อัปเดต', 'หมายเหตุ', 'ภาพถ่ายตอนชำรุด'];
  var values = sheet.getDataRange().getValues();
  if (!values.length || values[0].join('') === '') {
    sheet.clear();
    sheet.appendRow(defaultHeaders);
    return defaultHeaders;
  }
  var headers = values[0];
  var headerMap = buildHeaderIndexMap_(headers);
  var hasCanonicalLayout = getHistoryFieldIndex_(headerMap, 'timestamp', -1) === 0 &&
    getHistoryFieldIndex_(headerMap, 'itemId', -1) === 1 &&
    getHistoryFieldIndex_(headerMap, 'inspectorName', -1) === 2 &&
    getHistoryFieldIndex_(headerMap, 'ward', -1) === 3 &&
    getHistoryFieldIndex_(headerMap, 'status', -1) === 4;

  // ข้อมูลเดิมบางชุดมีหัวคอลัมน์ 7 ช่อง แต่แถวข้อมูลมีการตัดคอลัมน์
  // "ชื่อผู้ตรวจนับ" ออก ทำให้หน่วยงาน/สถานะเลื่อนมาอยู่ผิดตำแหน่ง
  // ซ่อมกลับเป็น [Timestamp, เลขครุภัณฑ์, ชื่อผู้ตรวจนับ, หน่วยงานที่ตรวจ, ...]
  if (hasCanonicalLayout && values.length > 1) {
    var repairedRows = [];
    var repairedCount = 0;
    for (var i = 1; i < values.length; i++) {
      var row = values[i].slice();
      while (row.length < defaultHeaders.length) row.push('');
      if (historyRowLooksShifted_(row)) {
        row = [row[0], row[1], '', row[2], row[3], row[4], row[5]];
        repairedCount++;
      } else {
        row = row.slice(0, defaultHeaders.length);
      }
      repairedRows.push(row);
    }
    if (repairedCount > 0) {
      sheet.getRange(2, 1, repairedRows.length, defaultHeaders.length).setValues(repairedRows);
      SpreadsheetApp.flush();
    }
  }
  return headers;
}

function historyStatusValues_() {
  return {
    'ปกติ': true,
    'พร้อมใช้': true,
    'พร้อมใช้งาน': true,
    'ถูกยืม': true,
    'ถูกยืมภายใน': true,
    'ชำรุดส่งซ่อม': true,
    'อยู่ระหว่างซ่อม': true,
    'รอจำหน่าย': true,
    'จำหน่าย': true,
    'แทงจำหน่าย': true,
    'ย้ายหน่วยงาน': true
  };
}

function historyRowLooksShifted_(row) {
  if (!row || row.length < 4) return false;
  var statusValues = historyStatusValues_();
  var columnC = normalizeStatusText_(row[2]);
  var columnD = normalizeStatusText_(row[3]);
  // รูปแบบผิด: C=หน่วยงาน, D=สถานะ และช่องผู้ตรวจนับหายไป
  return !!columnC && !!statusValues[columnD] && !statusValues[columnC];
}

function ensureMasterSheetHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var headerMap = buildHeaderIndexMap_(headers);
  var requiredHeaders = [
    { field: 'status', label: 'สถานะ' },
    { field: 'lastInspectionDate', label: 'วันที่ตรวจล่าสุด' }
  ];
  var changed = false;

  for (var i = 0; i < requiredHeaders.length; i++) {
    var required = requiredHeaders[i];
    if (getFieldIndex_(headerMap, required.field, -1) < 0) {
      headers.push(required.label);
      sheet.getRange(1, headers.length).setValue(required.label);
      headerMap = buildHeaderIndexMap_(headers);
      changed = true;
    }
  }

  if (changed) SpreadsheetApp.flush();
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function buildInspectionRecordFromHistoryRow_(historyRow, historyHeaderMap, historyRowNumber) {
  return {
    rowNumber: historyRowNumber || 0,
    timestamp: getHistoryFieldIndex_(historyHeaderMap, 'timestamp', 0) >= 0 ? historyRow[getHistoryFieldIndex_(historyHeaderMap, 'timestamp', 0)] : '',
    itemId: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'itemId', 1)] || '').trim(),
    inspectorName: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'inspectorName', 2)] || '').trim(),
    ward: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'ward', 3)] || '').trim(),
    status: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'status', 4)] || '').trim(),
    note: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'note', 5)] || '').trim(),
    imageUrl: String(historyRow[getHistoryFieldIndex_(historyHeaderMap, 'imageUrl', 6)] || '').trim()
  };
}

function findLatestHistoryRowInfoByItemId_(historyData, historyHeaderMap, itemId) {
  var targetItemId = normalizeItemKey_(itemId);
  if (!targetItemId) return null;
  var itemIdIndex = getHistoryFieldIndex_(historyHeaderMap, 'itemId', 1);
  for (var i = historyData.length - 1; i >= 1; i--) {
    if (normalizeItemKey_(historyData[i][itemIdIndex]) === targetItemId) {
      return {
        rowIndex: i,
        rowNumber: i + 1,
        row: historyData[i],
        record: buildInspectionRecordFromHistoryRow_(historyData[i], historyHeaderMap, i + 1)
      };
    }
  }
  return null;
}

function getLatestInspectionRecord(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSheet = ss.getSheetByName('MasterData');
  var historySheet = ss.getSheetByName('HistoryLog');
  var masterHeaders = ensureMasterSheetHeaders_(masterSheet);
  var masterData = masterSheet.getDataRange().getValues();
  var masterHeaderMap = buildHeaderIndexMap_(masterHeaders);
  var historyHeaders = ensureHistorySheetHeaders_(historySheet);
  var historyHeaderMap = buildHeaderIndexMap_(historyHeaders);

  var itemId = normalizeItemKey_(params.itemId);
  var rmcNo = normalizeItemKey_(params.rmcNo);
  var originalItemId = normalizeItemKey_(params.originalItemId);
  var rowIndex = findMasterRowIndexForUpdate_(masterData, masterHeaderMap, {
    rmcNo: rmcNo,
    itemId: originalItemId || itemId
  });

  if (rowIndex === -2) {
    return jsonOutput_({ status: 'error', message: 'พบเลขครุภัณฑ์ซ้ำมากกว่า 1 แถว กรุณาใช้ RMC No เพื่อระบุรายการให้ชัดเจน' });
  }
  if (rowIndex < 0) {
    return jsonOutput_({ status: 'error', message: 'ไม่พบครุภัณฑ์ที่ต้องการ' });
  }

  var masterRow = masterData[rowIndex];
  var masterItem = buildObjectFromRow_(masterHeaders, masterRow);
  var actualItemId = normalizeItemKey_(getRowValue_(masterRow, masterHeaderMap, 'itemId', 1));
  var historyData = historySheet.getDataRange().getValues();
  var latestHistory = findLatestHistoryRowInfoByItemId_(historyData, historyHeaderMap, actualItemId);
  if (!latestHistory) {
    return jsonOutput_({ status: 'error', message: 'ไม่พบบันทึกการตรวจล่าสุดของครุภัณฑ์นี้' });
  }

  return jsonOutput_({
    status: 'success',
    data: {
      item: masterItem,
      inspectionRecord: latestHistory.record,
      spreadsheetId: ss.getId(),
      version: EQUIPMENT_API_VERSION_
    }
  });
}

function wasMasterUpdateVerified_(row, headerMap, expected) {
  var status = String(getRowValue_(row, headerMap, 'status', 13) || '').trim();
  var lastInspectionValue = getRowValue_(row, headerMap, 'lastInspectionDate', 15);
  var lastInspectionDate = lastInspectionValue instanceof Date ? lastInspectionValue : new Date(lastInspectionValue);
  if (status !== expected.status) return false;
  if (isNaN(lastInspectionDate.getTime())) return false;
  if (lastInspectionDate.getTime() + 60000 < expected.inspectedAt.getTime()) return false;
  if (expected.status === 'ถูกยืม' && expected.borrowWard) {
    var usageWard = String(getRowValue_(row, headerMap, 'usageWard', 8) || '').trim();
    if (usageWard !== String(expected.borrowWard || '').trim()) return false;
  }
  return true;
}

function wasHistoryUpdateVerified_(row, headerMap, expected) {
  var itemId = String(row[getHistoryFieldIndex_(headerMap, 'itemId', 1)] || '').trim();
  var status = String(row[getHistoryFieldIndex_(headerMap, 'status', 4)] || '').trim();
  var timestampValue = row[getHistoryFieldIndex_(headerMap, 'timestamp', 0)];
  var timestamp = timestampValue instanceof Date ? timestampValue : new Date(timestampValue);
  if (itemId !== String(expected.itemId || '').trim()) return false;
  if (status !== expected.status) return false;
  if (isNaN(timestamp.getTime())) return false;
  if (timestamp.getTime() + 60000 < expected.inspectedAt.getTime()) return false;
  return true;
}

// ฟังก์ชันดึงรายการครุภัณฑ์ "ทั้งหมด" ในระบบ (สำหรับแอดมิน)
function getAllItems() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MasterData');
  ensureMasterSheetHeaders_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    result.push(buildObjectFromRow_(headers, data[i]));
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: result
  })).setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันดึงรายการครุภัณฑ์ตามหน่วยงานที่เลือก
function getItemsByWard(ward) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MasterData');
  ensureMasterSheetHeaders_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var headerMap = buildHeaderIndexMap_(headers);
  var result = [];
  
  // ลบช่องว่างหน้า-หลัง ของคำที่ค้นหา เพื่อป้องกัน Error จากการพิมพ์เว้นวรรคเกิน
  var searchWard = String(ward).trim(); 
  
  for (var i = 1; i < data.length; i++) {
    var ownerWard = String(getRowValue_(data[i], headerMap, 'ownerWard', 7) || "").trim();
    var currentWard = String(getRowValue_(data[i], headerMap, 'usageWard', 8) || "").trim();
    
    // ถ้าคอลัมน์ "ใช้งานที่" ว่างเปล่า ให้ใช้ชื่อจากคอลัมน์ "หน่วยงานเจ้าของ" แทน
    var targetWard = (currentWard !== "") ? currentWard : ownerWard;
    
    if (targetWard === searchWard) {
      var item = {};
      for (var j = 0; j < headers.length; j++) {
        item[headers[j]] = data[i][j];
      }
      result.push(item);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: result
  })).setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันสำหรับรับข้อมูลที่ส่งมาจากหน้าเว็บเพื่อบันทึก
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var masterSheet = ss.getSheetByName('MasterData');
    var historySheet = ss.getSheetByName('HistoryLog');
    var masterHeaders = ensureMasterSheetHeaders_(masterSheet);
    var masterData = masterSheet.getDataRange().getValues();
    var masterHeaderMap = buildHeaderIndexMap_(masterHeaders);
    var historyHeaders = ensureHistorySheetHeaders_(historySheet);
    var historyHeaderMap = buildHeaderIndexMap_(historyHeaders);

    // ==========================================
    // 1. ระบบ Staff: อัปเดตสถานะการตรวจ
    // ==========================================
    if (action === "updateStatus") {
      var lock = LockService.getDocumentLock();
      lock.waitLock(30000);
      try {
        var submittedKey = normalizeItemKey_(data.itemId);
        var rmcNo = normalizeItemKey_(data.rmcNo);
        var originalItemId = normalizeItemKey_(data.originalItemId);
        var itemIdForLog = originalItemId || submittedKey;
        if (!submittedKey && !rmcNo && !originalItemId) {
          return jsonOutput_({status: "error", message: "ไม่พบเลขครุภัณฑ์หรือ RMC No สำหรับระบุแถวที่จะบันทึก"});
        }
        var requestedStatus = String(data.status || '').trim();
        var status = toMasterStatus_(requestedStatus);
        var historyStatus = toHistoryStatus_(requestedStatus);
        var subLoc = data.subLocation || '';
        var borrowWard = String(data.borrowedWard || '').trim();
        var note = data.note || '';
        var ward = data.ward || '';
        var inspectorName = data.inspectorName || '';
        var imageBase64 = data.imageBase64;
        var mimeType = data.mimeType;
        var imageName = data.imageName;
        var inspectedAt = new Date();
        var isTransferAction = requestedStatus === "ย้ายหน่วยงาน";
        
        var imageUrl = "";
        if (imageBase64 && imageBase64 !== "") {
          // 🔴 อย่าลืมใส่ ID โฟลเดอร์ Google Drive ของคุณตรงนี้นะครับ
          var folderId = "1_lvRrEMDdgHO0JCPS08jGwKBQR8TZ5VK"; 
          var folder = DriveApp.getFolderById(folderId);
          var decoded = Utilities.base64Decode(imageBase64);
          var blob = Utilities.newBlob(decoded, mimeType, imageName);
          var file = folder.createFile(blob);
          imageUrl = file.getUrl();
        }

        masterData = masterSheet.getDataRange().getValues();
        var lookupRmcNo = rmcNo || (submittedKey && originalItemId && submittedKey !== originalItemId ? submittedKey : '');
        var rowIndex = findMasterRowIndexForUpdate_(masterData, masterHeaderMap, {
          rmcNo: lookupRmcNo,
          itemId: originalItemId || submittedKey
        });
        if (rowIndex === -2) {
          return jsonOutput_({
            status: "error",
            message: "เลขครุภัณฑ์นี้มีมากกว่า 1 แถวใน MasterData กรุณาใช้ RMC No ในการบันทึกเพื่อระบุรายการให้ถูกต้อง"
          });
        }
        if (rowIndex === -1) {
          return ContentService.createTextOutput(JSON.stringify({status: "error", message: "ไม่พบครุภัณฑ์ที่ต้องการอัปเดตจาก RMC No/เลขครุภัณฑ์ที่ส่งมา"})).setMimeType(ContentService.MimeType.JSON);
        }

        var rowNumber = rowIndex + 1;
        var subLocationIndex = getFieldIndex_(masterHeaderMap, 'subLocation', 9);
        var statusIndex = getFieldIndex_(masterHeaderMap, 'status', 13);
        var lastInspectionIndex = getFieldIndex_(masterHeaderMap, 'lastInspectionDate', 15);
        var usageWardIndex = getFieldIndex_(masterHeaderMap, 'usageWard', 8);

        if (statusIndex < 0 || (!isTransferAction && lastInspectionIndex < 0)) {
          return jsonOutput_({
            status: "error",
            message: "โครงสร้าง MasterData ไม่ครบ: ไม่พบคอลัมน์สถานะหรือวันที่ตรวจล่าสุด"
          });
        }

        if (!isTransferAction && lastInspectionIndex >= 0) masterSheet.getRange(rowNumber, lastInspectionIndex + 1).setValue(inspectedAt);
        if (statusIndex >= 0) masterSheet.getRange(rowNumber, statusIndex + 1).setValue(status);
        if (subLocationIndex >= 0) masterSheet.getRange(rowNumber, subLocationIndex + 1).setValue(subLoc);
        
        var shouldUpdateUsageWard = borrowWard !== "" && (status === "ถูกยืม" || requestedStatus === "ย้ายหน่วยงาน");
        if (shouldUpdateUsageWard) {
          if (usageWardIndex >= 0) masterSheet.getRange(rowNumber, usageWardIndex + 1).setValue(borrowWard);
        }

        SpreadsheetApp.flush();
        var verifiedMasterRow = masterSheet.getRange(rowNumber, 1, 1, masterHeaders.length).getValues()[0];
        var masterVerified = wasMasterUpdateVerifiedSafe_(verifiedMasterRow, masterHeaderMap, {
          status: status,
          borrowWard: borrowWard,
          inspectedAt: inspectedAt,
          skipInspectionDateCheck: isTransferAction
        });

        if (!masterVerified) {
          return jsonOutput_({
            status: "error",
            message: "บันทึกไม่สมบูรณ์: ระบบไม่พบข้อมูลที่เขียนจริงใน MasterData",
            data: {
              masterVerified: false,
              historyVerified: false,
              requestedStatus: requestedStatus,
              masterStatus: status,
              historyStatus: historyStatus,
              rmcNo: rmcNo,
              itemId: itemIdForLog,
              rowNumber: rowNumber,
              statusColumn: statusIndex + 1,
              lastInspectionColumn: lastInspectionIndex + 1,
              statusValue: getRowValue_(verifiedMasterRow, masterHeaderMap, 'status', 13),
              lastInspectionValue: String(getRowValue_(verifiedMasterRow, masterHeaderMap, 'lastInspectionDate', 15) || ''),
              spreadsheetId: ss.getId(),
              version: EQUIPMENT_API_VERSION_
            }
          });
        }

        var historyRow = buildHistoryRow_(historyHeaders, historyHeaderMap, {
          timestamp: inspectedAt,
          itemId: itemIdForLog,
          inspectorName: inspectorName,
          ward: ward,
          status: historyStatus,
          note: note,
          imageUrl: imageUrl
        });
        historySheet.appendRow(historyRow);
        var historyRowNumber = historySheet.getLastRow();

        SpreadsheetApp.flush();
        var verifiedHistoryRow = historySheet.getRange(historyRowNumber, 1, 1, historyHeaders.length).getValues()[0];
        var historyVerified = wasHistoryUpdateVerifiedSafe_(verifiedHistoryRow, historyHeaderMap, {
          itemId: itemIdForLog,
          status: historyStatus,
          inspectedAt: inspectedAt
        });

        if (!historyVerified) {
          return jsonOutput_({
            status: "error",
            message: "บันทึกไม่สมบูรณ์: ระบบไม่พบข้อมูลที่เขียนจริงใน HistoryLog",
            data: {
              masterVerified: true,
              historyVerified: false,
              requestedStatus: requestedStatus,
              masterStatus: status,
              historyStatus: historyStatus,
              rmcNo: rmcNo,
              itemId: itemIdForLog,
              rowNumber: rowNumber,
              historyRowNumber: historyRowNumber,
              spreadsheetId: ss.getId(),
              version: EQUIPMENT_API_VERSION_
            }
          });
        }

        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          data: {
            updatedItem: buildObjectFromRow_(masterHeaders, verifiedMasterRow),
            inspectedAt: inspectedAt.toISOString(),
            masterVerified: true,
            historyVerified: true,
            requestedStatus: requestedStatus,
            masterStatus: status,
            historyStatus: historyStatus,
            rmcNo: rmcNo,
            itemId: itemIdForLog,
            rowNumber: rowNumber,
            historyRowNumber: historyRowNumber,
            spreadsheetId: ss.getId(),
            version: EQUIPMENT_API_VERSION_
          }
        })).setMimeType(ContentService.MimeType.JSON);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "editInspectionRecord") {
      var editLock = LockService.getDocumentLock();
      editLock.waitLock(30000);
      try {
        var submittedEditKey = normalizeItemKey_(data.itemId);
        var submittedEditRmcNo = normalizeItemKey_(data.rmcNo);
        var submittedEditOriginalItemId = normalizeItemKey_(data.originalItemId);
        var submittedHistoryRowNumber = Number(data.historyRowNumber || 0);
        if (!submittedEditKey && !submittedEditRmcNo && !submittedEditOriginalItemId) {
          return jsonOutput_({status: "error", message: "ไม่พบเลขครุภัณฑ์หรือ RMC No สำหรับระบุรายการที่จะแก้ไข"});
        }
        if (submittedHistoryRowNumber < 2) {
          return jsonOutput_({status: "error", message: "ไม่พบแถวบันทึกการตรวจที่ต้องการแก้ไข"});
        }

        var requestedEditStatus = String(data.status || '').trim();
        var editStatus = toMasterStatus_(requestedEditStatus);
        var editHistoryStatus = toHistoryStatus_(requestedEditStatus);
        var editSubLoc = data.subLocation || '';
        var editBorrowWard = String(data.borrowedWard || '').trim();
        var editNote = data.note || '';
        var editWard = data.ward || '';
        var editInspectorName = data.inspectorName || '';
        var editImageBase64 = data.imageBase64;
        var editMimeType = data.mimeType;
        var editImageName = data.imageName;
        var existingImageUrl = String(data.existingImageUrl || '').trim();
        var isEditTransferAction = requestedEditStatus === "ย้ายหน่วยงาน";

        masterData = masterSheet.getDataRange().getValues();
        var editLookupRmcNo = submittedEditRmcNo || (submittedEditKey && submittedEditOriginalItemId && submittedEditKey !== submittedEditOriginalItemId ? submittedEditKey : '');
        var editMasterRowIndex = findMasterRowIndexForUpdate_(masterData, masterHeaderMap, {
          rmcNo: editLookupRmcNo,
          itemId: submittedEditOriginalItemId || submittedEditKey
        });
        if (editMasterRowIndex === -2) {
          return jsonOutput_({
            status: "error",
            message: "เลขครุภัณฑ์นี้มีมากกว่า 1 แถวใน MasterData กรุณาใช้ RMC No ในการแก้ไขเพื่อระบุรายการให้ถูกต้อง"
          });
        }
        if (editMasterRowIndex === -1) {
          return jsonOutput_({status: "error", message: "ไม่พบครุภัณฑ์ที่ต้องการแก้ไข"});
        }

        var editRowNumber = editMasterRowIndex + 1;
        var currentMasterRow = masterData[editMasterRowIndex].slice();
        var actualEditItemId = normalizeItemKey_(getRowValue_(currentMasterRow, masterHeaderMap, 'itemId', 1));

        var historyDataForEdit = historySheet.getDataRange().getValues();
        var latestHistoryInfo = findLatestHistoryRowInfoByItemId_(historyDataForEdit, historyHeaderMap, actualEditItemId);
        if (!latestHistoryInfo) {
          return jsonOutput_({status: "error", message: "ไม่พบบันทึกการตรวจล่าสุดสำหรับแก้ไข"});
        }
        if (latestHistoryInfo.rowNumber !== submittedHistoryRowNumber) {
          return jsonOutput_({status: "error", message: "สามารถแก้ไขได้เฉพาะบันทึกการตรวจล่าสุดของรายการนี้เท่านั้น"});
        }

        var originalHistoryRow = latestHistoryInfo.row;
        var originalInspectedAt = parseFlexibleDate_(originalHistoryRow[getHistoryFieldIndex_(historyHeaderMap, 'timestamp', 0)]) || parseFlexibleDate_(getRowValue_(currentMasterRow, masterHeaderMap, 'lastInspectionDate', 15)) || new Date();
        var editImageUrl = existingImageUrl || String(originalHistoryRow[getHistoryFieldIndex_(historyHeaderMap, 'imageUrl', 6)] || '').trim();

        if (editImageBase64 && editImageBase64 !== "") {
          var editFolderId = "1_lvRrEMDdgHO0JCPS08jGwKBQR8TZ5VK";
          var editFolder = DriveApp.getFolderById(editFolderId);
          var editDecoded = Utilities.base64Decode(editImageBase64);
          var editBlob = Utilities.newBlob(editDecoded, editMimeType, editImageName);
          var editFile = editFolder.createFile(editBlob);
          editImageUrl = editFile.getUrl();
        }

        var editSubLocationIndex = getFieldIndex_(masterHeaderMap, 'subLocation', 9);
        var editStatusIndex = getFieldIndex_(masterHeaderMap, 'status', 13);
        var editLastInspectionIndex = getFieldIndex_(masterHeaderMap, 'lastInspectionDate', 15);
        var editUsageWardIndex = getFieldIndex_(masterHeaderMap, 'usageWard', 8);

        if (editStatusIndex < 0 || (!isEditTransferAction && editLastInspectionIndex < 0)) {
          return jsonOutput_({
            status: "error",
            message: "โครงสร้าง MasterData ไม่ครบ: ไม่พบคอลัมน์สถานะหรือวันที่ตรวจล่าสุด"
          });
        }

        if (!isEditTransferAction && editLastInspectionIndex >= 0) masterSheet.getRange(editRowNumber, editLastInspectionIndex + 1).setValue(originalInspectedAt);
        if (editStatusIndex >= 0) masterSheet.getRange(editRowNumber, editStatusIndex + 1).setValue(editStatus);
        if (editSubLocationIndex >= 0) masterSheet.getRange(editRowNumber, editSubLocationIndex + 1).setValue(editSubLoc);

        var shouldEditUsageWard = editBorrowWard !== "" && (editStatus === "ถูกยืม" || requestedEditStatus === "ย้ายหน่วยงาน");
        if (shouldEditUsageWard && editUsageWardIndex >= 0) {
          masterSheet.getRange(editRowNumber, editUsageWardIndex + 1).setValue(editBorrowWard);
        }

        SpreadsheetApp.flush();
        var verifiedEditedMasterRow = masterSheet.getRange(editRowNumber, 1, 1, masterHeaders.length).getValues()[0];
        var editMasterVerified = wasMasterUpdateVerifiedSafe_(verifiedEditedMasterRow, masterHeaderMap, {
          status: editStatus,
          borrowWard: editBorrowWard,
          inspectedAt: originalInspectedAt,
          skipInspectionDateCheck: isEditTransferAction
        });

        if (!editMasterVerified) {
          return jsonOutput_({
            status: "error",
            message: "แก้ไขไม่สมบูรณ์: ระบบไม่พบข้อมูลที่เขียนจริงใน MasterData",
            data: {
              masterVerified: false,
              historyVerified: false,
              requestedStatus: requestedEditStatus,
              masterStatus: editStatus,
              historyStatus: editHistoryStatus,
              rmcNo: submittedEditRmcNo,
              itemId: actualEditItemId,
              rowNumber: editRowNumber,
              historyRowNumber: submittedHistoryRowNumber,
              statusColumn: editStatusIndex + 1,
              lastInspectionColumn: editLastInspectionIndex + 1,
              statusValue: getRowValue_(verifiedEditedMasterRow, masterHeaderMap, 'status', 13),
              lastInspectionValue: String(getRowValue_(verifiedEditedMasterRow, masterHeaderMap, 'lastInspectionDate', 15) || ''),
              spreadsheetId: ss.getId(),
              version: EQUIPMENT_API_VERSION_
            }
          });
        }

        var updatedHistoryRow = buildHistoryRow_(historyHeaders, historyHeaderMap, {
          timestamp: originalInspectedAt,
          itemId: actualEditItemId,
          inspectorName: editInspectorName || latestHistoryInfo.record.inspectorName,
          ward: editWard || latestHistoryInfo.record.ward,
          status: editHistoryStatus,
          note: editNote,
          imageUrl: editImageUrl
        });
        historySheet.getRange(submittedHistoryRowNumber, 1, 1, historyHeaders.length).setValues([updatedHistoryRow]);

        SpreadsheetApp.flush();
        var verifiedEditedHistoryRow = historySheet.getRange(submittedHistoryRowNumber, 1, 1, historyHeaders.length).getValues()[0];
        var editHistoryVerified = wasHistoryUpdateVerifiedSafe_(verifiedEditedHistoryRow, historyHeaderMap, {
          itemId: actualEditItemId,
          status: editHistoryStatus,
          inspectedAt: originalInspectedAt
        });

        if (!editHistoryVerified) {
          return jsonOutput_({
            status: "error",
            message: "แก้ไขไม่สมบูรณ์: ระบบไม่พบข้อมูลที่เขียนจริงใน HistoryLog",
            data: {
              masterVerified: true,
              historyVerified: false,
              requestedStatus: requestedEditStatus,
              masterStatus: editStatus,
              historyStatus: editHistoryStatus,
              rmcNo: submittedEditRmcNo,
              itemId: actualEditItemId,
              rowNumber: editRowNumber,
              historyRowNumber: submittedHistoryRowNumber,
              spreadsheetId: ss.getId(),
              version: EQUIPMENT_API_VERSION_
            }
          });
        }

        return jsonOutput_({
          status: "success",
          data: {
            updatedItem: buildObjectFromRow_(masterHeaders, verifiedEditedMasterRow),
            inspectionRecord: buildInspectionRecordFromHistoryRow_(verifiedEditedHistoryRow, historyHeaderMap, submittedHistoryRowNumber),
            inspectedAt: originalInspectedAt.toISOString(),
            masterVerified: true,
            historyVerified: true,
            requestedStatus: requestedEditStatus,
            masterStatus: editStatus,
            historyStatus: editHistoryStatus,
            rmcNo: submittedEditRmcNo,
            itemId: actualEditItemId,
            rowNumber: editRowNumber,
            historyRowNumber: submittedHistoryRowNumber,
            spreadsheetId: ss.getId(),
            version: EQUIPMENT_API_VERSION_
          }
        });
      } finally {
        editLock.releaseLock();
      }
    }

    // ==========================================
    // 2. ระบบ Admin: เพิ่มครุภัณฑ์ใหม่
    // ==========================================
    if (action === "addEquipment") {
      var item = data.itemData;
      var newRow = buildMasterRowFromItem_(masterHeaders, masterHeaderMap, item);
      masterSheet.appendRow(newRow);
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 3. ระบบ Admin: แก้ไขข้อมูลครุภัณฑ์
    // ==========================================
    if (action === "editEquipment") {
      var oldId = data.oldItemId;
      var item = data.itemData;
      var editRowIndex = findMasterRowIndex_(masterData, masterHeaderMap, oldId);
      if (editRowIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: "ไม่พบครุภัณฑ์ที่ต้องการแก้ไข"})).setMimeType(ContentService.MimeType.JSON);
      }
      var r = editRowIndex + 1;
      setSheetValue_(masterSheet, r, masterHeaderMap, 'rmcNo', item.rmcNo, 0);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'itemId', item.itemId, 1);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'name', item.name, 2);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'brand', item.brand, 3);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'model', item.model, 4);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'type', item.type, 5);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'toolType', item.toolType, 6);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'ownerWard', item.ownerWard, 7);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'subLocation', item.subLoc, 9);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'riskLevel', item.riskLevel, 10);
      setSheetValue_(masterSheet, r, masterHeaderMap, 'inspectionFrequency', item.freq, 12);
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 4. ระบบ Admin: ลบข้อมูลครุภัณฑ์
    // ==========================================
    if (action === "pullEquipment") {
      var lockPull = LockService.getDocumentLock();
      lockPull.waitLock(30000);
      try {
        var submittedPullKey = normalizeItemKey_(data.itemId);
        var submittedPullRmcNo = normalizeItemKey_(data.rmcNo);
        var submittedOriginalItemId = normalizeItemKey_(data.originalItemId);
        var newWard = String(data.newWard || '').trim();
        if (!newWard) {
          return jsonOutput_({status: "error", message: "ไม่พบหน่วยงานปลายทางสำหรับการดึงครุภัณฑ์"});
        }

        masterData = masterSheet.getDataRange().getValues();
        var lookupPullRmcNo = submittedPullRmcNo || (submittedPullKey && submittedOriginalItemId && submittedPullKey !== submittedOriginalItemId ? submittedPullKey : '');
        var pullRowIndex = findMasterRowIndexForUpdate_(masterData, masterHeaderMap, {
          rmcNo: lookupPullRmcNo,
          itemId: submittedOriginalItemId || submittedPullKey
        });
        if (pullRowIndex === -2) {
          return jsonOutput_({
            status: "error",
            message: "พบเลขครุภัณฑ์ซ้ำมากกว่า 1 แถว กรุณาระบุ RMC No ให้ชัดเจนก่อนดึงรายการมาใช้งาน"
          });
        }
        if (pullRowIndex === -1) {
          return jsonOutput_({status: "error", message: "ไม่พบครุภัณฑ์ที่ต้องการดึงมาใช้งาน"});
        }

        var pullRowNumber = pullRowIndex + 1;
        var updatedPullRow = masterData[pullRowIndex].slice();
        var pullUsageWardIndex = getFieldIndex_(masterHeaderMap, 'usageWard', 8);
        var pullStatusIndex = getFieldIndex_(masterHeaderMap, 'status', 13);

        if (pullUsageWardIndex >= 0) updatedPullRow[pullUsageWardIndex] = newWard;
        if (pullStatusIndex >= 0) updatedPullRow[pullStatusIndex] = "ถูกยืม";

        masterSheet.getRange(pullRowNumber, 1, 1, masterHeaders.length).setValues([updatedPullRow]);
        SpreadsheetApp.flush();

        var verifiedPullRow = masterSheet.getRange(pullRowNumber, 1, 1, masterHeaders.length).getValues()[0];
        var verifiedUsageWard = String(getRowValue_(verifiedPullRow, masterHeaderMap, 'usageWard', 8) || '').trim();
        var verifiedStatus = toMasterStatus_(getRowValue_(verifiedPullRow, masterHeaderMap, 'status', 13));
        if (verifiedUsageWard !== newWard || verifiedStatus !== "ถูกยืม") {
          return jsonOutput_({
            status: "error",
            message: "ดึงครุภัณฑ์มาใช้งานไม่สำเร็จ ระบบไม่พบข้อมูลที่อัปเดตจริงใน MasterData",
            data: {
              itemId: submittedOriginalItemId || submittedPullKey,
              rmcNo: submittedPullRmcNo,
              usageWard: verifiedUsageWard,
              statusValue: verifiedStatus,
              rowNumber: pullRowNumber,
              spreadsheetId: ss.getId(),
              version: EQUIPMENT_API_VERSION_
            }
          });
        }

        return jsonOutput_({
          status: "success",
          data: {
            updatedItem: buildObjectFromRow_(masterHeaders, verifiedPullRow),
            itemId: submittedOriginalItemId || submittedPullKey,
            rmcNo: submittedPullRmcNo,
            rowNumber: pullRowNumber,
            spreadsheetId: ss.getId(),
            version: EQUIPMENT_API_VERSION_
          }
        });
      } finally {
        lockPull.releaseLock();
      }
    }

    if (action === "saveInspectionWindow") {
      return saveInspectionWindow(data);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function wasMasterUpdateVerifiedSafe_(row, headerMap, expected) {
  var status = toMasterStatus_(getRowValue_(row, headerMap, 'status', 13));
  var lastInspectionValue = getRowValue_(row, headerMap, 'lastInspectionDate', 15);
  var lastInspectionDate = parseFlexibleDate_(lastInspectionValue);
  if (status !== toMasterStatus_(expected.status)) return false;
  if (!expected.skipInspectionDateCheck && !hasMeaningfulValue_(lastInspectionValue)) return false;
  if (!expected.skipInspectionDateCheck && lastInspectionDate && expected.inspectedAt) {
    var deltaMs = Math.abs(lastInspectionDate.getTime() - expected.inspectedAt.getTime());
    if (deltaMs > 86400000) return false;
  }
  if (expected.borrowWard) {
    var usageWard = String(getRowValue_(row, headerMap, 'usageWard', 8) || '').trim();
    if (usageWard !== String(expected.borrowWard || '').trim()) return false;
  }
  return true;
}

function wasHistoryUpdateVerifiedSafe_(row, headerMap, expected) {
  var itemId = String(row[getHistoryFieldIndex_(headerMap, 'itemId', 1)] || '').trim();
  var status = toHistoryStatus_(row[getHistoryFieldIndex_(headerMap, 'status', 4)]);
  var timestampValue = row[getHistoryFieldIndex_(headerMap, 'timestamp', 0)];
  var timestamp = parseFlexibleDate_(timestampValue);
  if (itemId !== String(expected.itemId || '').trim()) return false;
  if (status !== toHistoryStatus_(expected.status)) return false;
  if (!hasMeaningfulValue_(timestampValue)) return false;
  if (timestamp && expected.inspectedAt) {
    var historyDeltaMs = Math.abs(timestamp.getTime() - expected.inspectedAt.getTime());
    if (historyDeltaMs > 86400000) return false;
  }
  return true;
}

function getInspectionWindowSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('InspectionWindows');
  if (!sheet) {
    sheet = ss.insertSheet('InspectionWindows');
    sheet.appendRow(['periodKey', 'targetYear', 'targetMonth', 'openDate', 'closeDate', 'updatedAt']);
  }
  return sheet;
}

function buildInspectionWindowPeriodKey_(targetYear, targetMonth) {
  return targetYear + '-' + ('0' + targetMonth).slice(-2);
}

function padInspectionWindowNumber_(value) {
  return ('0' + value).slice(-2);
}

function formatInspectionWindowDateTimeParts_(date) {
  return (
    date.getFullYear() +
    '-' + padInspectionWindowNumber_(date.getMonth() + 1) +
    '-' + padInspectionWindowNumber_(date.getDate()) +
    'T' + padInspectionWindowNumber_(date.getHours()) +
    ':' + padInspectionWindowNumber_(date.getMinutes())
  );
}

function parseInspectionWindowDateTime_(value, boundary) {
  if (!value && value !== 0) return null;

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    var dateValue = new Date(value.getTime());
    if (
      boundary === 'end' &&
      dateValue.getHours() === 0 &&
      dateValue.getMinutes() === 0 &&
      dateValue.getSeconds() === 0 &&
      dateValue.getMilliseconds() === 0
    ) {
      dateValue.setHours(23, 59, 0, 0);
    }
    return dateValue;
  }

  // รองรับค่า openDate/closeDate ที่ถูกเก็บเป็น Excel serial number
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    var serial = Number(value);
    if (isFinite(serial) && serial > 20000 && serial < 100000) {
      var serialDate = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (boundary === 'end' && serial % 1 === 0) serialDate.setUTCHours(23, 59, 0, 0);
      return isNaN(serialDate.getTime()) ? null : serialDate;
    }
  }

  var text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(text + 'T' + (boundary === 'end' ? '23:59:00' : '00:00:00'));
  }

  var normalized = text.replace(' ', 'T').replace(/Z$/, '');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    normalized += ':00';
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    var parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  var fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function getInspectionWindowPeriodKeyFromRow_(row) {
  if (!row) return '';
  var explicitPeriodKey = String(row[0] || '').trim();
  if (/^\d{4}-\d{2}$/.test(explicitPeriodKey)) return explicitPeriodKey;
  if (/^\d{4}-\d{1,2}$/.test(explicitPeriodKey)) {
    var explicitParts = explicitPeriodKey.split('-');
    return buildInspectionWindowPeriodKey_(Number(explicitParts[0]), Number(explicitParts[1]));
  }

  var targetYear = Number(row[1]);
  var targetMonth = Number(row[2]);
  if (!targetYear || !targetMonth) return '';
  return buildInspectionWindowPeriodKey_(targetYear, targetMonth);
}

function formatInspectionWindowDate_(value, boundary) {
  var date = parseInspectionWindowDateTime_(value, boundary || 'start');
  if (!date || isNaN(date.getTime())) return '';
  return formatInspectionWindowDateTimeParts_(date);
}

function mapInspectionWindowRow_(row) {
  var targetYear = Number(row[1]);
  var targetMonth = Number(row[2]);
  var openDate = formatInspectionWindowDate_(row[3], 'start');
  var closeDate = formatInspectionWindowDate_(row[4], 'end');
  if (!targetYear || !targetMonth || !openDate || !closeDate) return null;

  return {
    periodKey: getInspectionWindowPeriodKeyFromRow_(row),
    targetYear: targetYear,
    targetMonth: targetMonth,
    openDate: openDate,
    closeDate: closeDate,
    updatedAt: row[5] ? new Date(row[5]).toISOString() : ''
  };
}

function chooseLatestInspectionWindowRecord_(currentRecord, nextRecord) {
  if (!currentRecord) return nextRecord;
  if (!nextRecord) return currentRecord;

  var currentUpdatedAt = currentRecord.updatedAt ? new Date(currentRecord.updatedAt).getTime() : 0;
  var nextUpdatedAt = nextRecord.updatedAt ? new Date(nextRecord.updatedAt).getTime() : 0;
  if (nextUpdatedAt !== currentUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt ? nextRecord : currentRecord;
  }

  var currentCloseAt = parseInspectionWindowDateTime_(currentRecord.closeDate, 'end').getTime();
  var nextCloseAt = parseInspectionWindowDateTime_(nextRecord.closeDate, 'end').getTime();
  if (nextCloseAt !== currentCloseAt) {
    return nextCloseAt > currentCloseAt ? nextRecord : currentRecord;
  }

  return nextRecord;
}

function dedupeInspectionWindowRecords_(records) {
  var latestByPeriod = {};
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (!record || !record.periodKey) continue;
    latestByPeriod[record.periodKey] = chooseLatestInspectionWindowRecord_(latestByPeriod[record.periodKey], record);
  }

  var deduped = Object.keys(latestByPeriod).map(function(periodKey) {
    return latestByPeriod[periodKey];
  });

  deduped.sort(function(a, b) {
    var aDate = parseInspectionWindowDateTime_(a.openDate, 'start');
    var bDate = parseInspectionWindowDateTime_(b.openDate, 'start');
    if (aDate.getTime() !== bDate.getTime()) return aDate - bDate;
    return String(a.periodKey || '').localeCompare(String(b.periodKey || ''));
  });

  return deduped;
}

function getInspectionWindowRecords_() {
  var sheet = getInspectionWindowSheet_();
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var record = mapInspectionWindowRow_(data[i]);
    if (record) result.push(record);
  }
  result.sort(function(a, b) {
    var aDate = parseInspectionWindowDateTime_(a.openDate, 'start');
    var bDate = parseInspectionWindowDateTime_(b.openDate, 'start');
    return aDate - bDate;
  });
  result = dedupeInspectionWindowRecords_(result);

  // ค่าเริ่มต้นของระบบ: เปิดรอบตรวจวันที่ 1-10 ของทุกเดือน
  // ถ้าเดือนปัจจุบันยังไม่มีการตั้งค่าเฉพาะ ให้เติมค่า default เพื่อให้ Staff ใช้งานได้ทันที
  var now = new Date();
  var currentPeriodKey = buildInspectionWindowPeriodKey_(now.getFullYear(), now.getMonth() + 1);
  var hasCurrentPeriod = result.some(function(record) { return record.periodKey === currentPeriodKey; });
  if (!hasCurrentPeriod) {
    var defaultOpen = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    var defaultClose = new Date(now.getFullYear(), now.getMonth(), 10, 23, 59, 0, 0);
    result.push({
      periodKey: currentPeriodKey,
      targetYear: now.getFullYear(),
      targetMonth: now.getMonth() + 1,
      openDate: formatInspectionWindowDateTimeParts_(defaultOpen),
      closeDate: formatInspectionWindowDateTimeParts_(defaultClose),
      updatedAt: ''
    });
    result.sort(function(a, b) {
      return parseInspectionWindowDateTime_(a.openDate, 'start') - parseInspectionWindowDateTime_(b.openDate, 'start');
    });
  }
  return result;
}

function evaluateInspectionWindowStatus_(records) {
  if (!records || records.length === 0) {
    return {
      hasConfiguredWindow: false,
      isActive: false,
      activeWindow: null,
      upcomingWindow: null,
      latestWindow: null,
      windows: []
    };
  }

  var now = new Date();
  var activeWindow = null;
  var upcomingWindow = null;
  var latestWindow = records[records.length - 1];

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var openDate = parseInspectionWindowDateTime_(record.openDate, 'start');
    var closeDate = parseInspectionWindowDateTime_(record.closeDate, 'end');

    if (!activeWindow && openDate <= now && now <= closeDate) {
      activeWindow = record;
    }
    if (!upcomingWindow && openDate > now) {
      upcomingWindow = record;
    }
  }

  return {
    hasConfiguredWindow: true,
    isActive: !!activeWindow,
    activeWindow: activeWindow,
    upcomingWindow: upcomingWindow,
    latestWindow: latestWindow,
    windows: records
  };
}

function getInspectionWindowStatus() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: evaluateInspectionWindowStatus_(getInspectionWindowRecords_())
  })).setMimeType(ContentService.MimeType.JSON);
}

function saveInspectionWindow(data) {
  var targetYear = Number(data.targetYear);
  var targetMonth = Number(data.targetMonth);
  var openDate = formatInspectionWindowDate_(data.openDate, 'start');
  var closeDate = formatInspectionWindowDate_(data.closeDate, 'end');

  if (!targetYear || !targetMonth || !openDate || !closeDate) {
    throw new Error('Missing inspection window fields');
  }

  if (parseInspectionWindowDateTime_(openDate, 'start') > parseInspectionWindowDateTime_(closeDate, 'end')) {
    throw new Error('Open date must be before or equal to close date');
  }

  var periodKey = buildInspectionWindowPeriodKey_(targetYear, targetMonth);
  var sheet = getInspectionWindowSheet_();
  var values = sheet.getDataRange().getValues();
  var matchingRows = [];

  for (var i = 1; i < values.length; i++) {
    if (getInspectionWindowPeriodKeyFromRow_(values[i]) === periodKey) {
      matchingRows.push(i + 1);
    }
  }

  var rowValues = [periodKey, targetYear, targetMonth, openDate, closeDate, new Date()];
  if (matchingRows.length > 0) {
    sheet.getRange(matchingRows[0], 1, 1, rowValues.length).setValues([rowValues]);
    for (var j = matchingRows.length - 1; j >= 1; j--) {
      sheet.deleteRow(matchingRows[j]);
    }
  } else {
    sheet.appendRow(rowValues);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: {
      periodKey: periodKey,
      targetYear: targetYear,
      targetMonth: targetMonth,
      openDate: openDate,
      closeDate: closeDate
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// รายงานสรุปตามหน่วยงานในรอบปีงบประมาณไทย (ต.ค. - ก.ย.)
function getDepartmentSummaryReport(fiscalYearParam) {
  var fiscalYear = Number(fiscalYearParam);
  var currentThaiYear = new Date().getFullYear() + 543;
  if (!fiscalYear || fiscalYear < 2400 || fiscalYear > currentThaiYear + 1) fiscalYear = currentThaiYear;
  // ปีงบประมาณไทย พ.ศ. 2569 = 1 ต.ค. 2568 ถึง 30 ก.ย. 2569
  // ดังนั้นปีปฏิทินของเดือนเริ่มต้น (ต.ค.) ต้องเป็น พ.ศ. - 544
  var startYear = fiscalYear - 544;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSheet = ss.getSheetByName('MasterData');
  var historySheet = ss.getSheetByName('HistoryLog');
  var masterHeaders = ensureMasterSheetHeaders_(masterSheet);
  var masterHeaderMap = buildHeaderIndexMap_(masterHeaders);
  var masterData = masterSheet.getDataRange().getValues();
  var historyHeaders = ensureHistorySheetHeaders_(historySheet);
  var historyHeaderMap = buildHeaderIndexMap_(historyHeaders);
  var rowsByWard = {};
  var itemsByKey = {};
  var skipStatuses = { 'ชำรุดส่งซ่อม': true, 'อยู่ระหว่างซ่อม': true, 'รอจำหน่าย': true, 'จำหน่าย': true, 'แทงจำหน่าย': true };

  for (var i = 1; i < masterData.length; i++) {
    var masterRow = masterData[i];
    var itemKey = normalizeItemKey_(getRowValue_(masterRow, masterHeaderMap, 'itemId', 1)) || normalizeItemKey_(getRowValue_(masterRow, masterHeaderMap, 'rmcNo', 0));
    if (!itemKey) continue;
    var ward = normalizeStatusText_(getRowValue_(masterRow, masterHeaderMap, 'usageWard', 8)) || normalizeStatusText_(getRowValue_(masterRow, masterHeaderMap, 'ownerWard', 7)) || 'ไม่ระบุหน่วยงาน';
    var status = normalizeStatusText_(getRowValue_(masterRow, masterHeaderMap, 'status', 13));
    if (skipStatuses[status]) continue;
    var frequency = Number(getRowValue_(masterRow, masterHeaderMap, 'inspectionFrequency', 12));
    if (!frequency || frequency < 1) frequency = 1;
    if (!rowsByWard[ward]) rowsByWard[ward] = [];
    var item = { key: itemKey, frequency: Math.floor(frequency) };
    rowsByWard[ward].push(item);
    itemsByKey[itemKey] = { ward: ward, frequency: item.frequency };
  }

  var inspectionsByMonth = {};
  var historyData = historySheet.getDataRange().getValues();
  for (var h = 1; h < historyData.length; h++) {
    var timestampValue = historyData[h][getHistoryFieldIndex_(historyHeaderMap, 'timestamp', 0)];
    var inspectedAt = parseFlexibleDate_(timestampValue);
    if (!inspectedAt) continue;
    var itemId = normalizeItemKey_(historyData[h][getHistoryFieldIndex_(historyHeaderMap, 'itemId', 1)]);
    var itemInfo = itemsByKey[itemId];
    if (!itemInfo) continue;
    var monthOffset = (inspectedAt.getFullYear() - startYear) * 12 + (inspectedAt.getMonth() - 9);
    if (monthOffset < 0 || monthOffset > 11) continue;
    var monthKey = String(monthOffset);
    if (!inspectionsByMonth[monthKey]) inspectionsByMonth[monthKey] = {};
    inspectionsByMonth[monthKey][itemInfo.ward + '|' + itemId] = true;
  }

  var months = [];
  for (var m = 0; m < 12; m++) {
    var monthDate = new Date(startYear, 9 + m, 1);
    months.push({ key: m, calendarYear: monthDate.getFullYear(), calendarMonth: monthDate.getMonth() + 1, label: ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'][m] });
  }
  var rows = Object.keys(rowsByWard).sort().map(function(wardName) {
    var items = rowsByWard[wardName];
    var totalDue = 0, totalInspected = 0;
    var monthly = months.map(function(month) {
      var dueItems = items.filter(function(item) { return month.key % item.frequency === 0; });
      var inspectedSet = inspectionsByMonth[String(month.key)] || {};
      var inspected = dueItems.filter(function(item) { return inspectedSet[wardName + '|' + item.key]; }).length;
      totalDue += dueItems.length; totalInspected += inspected;
      return { due: dueItems.length, inspected: inspected, display: dueItems.length ? (inspected + '/' + dueItems.length) : '-' };
    });
    return { department: wardName, months: monthly, total: totalDue, inspected: totalInspected, percentage: totalDue ? Math.round(totalInspected * 10000 / totalDue) / 100 : 0 };
  });
  return jsonOutput_({ status: 'success', data: { fiscalYear: fiscalYear, startYear: startYear, months: months, rows: rows, generatedAt: new Date().toISOString() } });
}
