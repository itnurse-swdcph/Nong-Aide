const CONFIG = {
  spreadsheetId: '1g8Pw7t70KTNtx7pvfYZpAQ4bB0OlnFVLx91TvnD_HAs',
  timeZone: 'Asia/Bangkok',
  sheets: {
    master: 'ClothMaster',
    log: 'ClothLog',
    tracking: 'ClothTracking'
  }
};

const SHEET_HEADERS = {
  ClothMaster: [
    'หน่วยงาน',
    'ชื่อรายการผ้า',
    'หมวดหมู่หลัก',
    'ยอดมาตรฐาน (Par)',
    'เปิดใช้งาน'
  ],
  ClothLog: [
    'Timestamp',
    'หน่วยงาน',
    'รอบการตรวจ',
    'ชื่อรายการผ้า',
    'หมวดหมู่ภาพรวม',
    'ผ้าพร้อมใช้',
    'กำลังใช้งาน',
    'ส่งซัก',
    'ติดผู้ป่วยรอติดตาม',
    'ยอดนับได้จริง',
    'ยอดมาตรฐาน',
    'ส่วนต่าง (+/-)',
    'ผู้บันทึก',
    'หมายเหตุ',
    'โมเดลการนับ'
  ],
  ClothTracking: [
    'ID',
    'Timestamp',
    'วันที่แจ้ง',
    'หน่วยงาน',
    'ชื่อรายการผ้า',
    'หมวดหมู่หลัก',
    'จำนวน',
    'สาเหตุ',
    'หมายเหตุ',
    'ผู้แจ้ง',
    'สถานะ',
    'ผลติดตาม',
    'ผู้ดำเนินการ',
    'อัปเดตล่าสุด'
  ]
};

const TRACKING_STATUSES = ['open', 'in_progress', 'returned', 'lost', 'cancelled'];

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const payload = getPayload_(e, method);
    const action = String(payload.action || 'getWards').trim();

    switch (action) {
      case 'getWards':
        return jsonOutput_(getWards_());
      case 'getClothMaster':
        return jsonOutput_(getClothMaster_(payload));
      case 'getAllClothLogs':
        return jsonOutput_(getAllClothLogs_());
      case 'submitClothLog':
        return jsonOutput_(submitClothLog_(payload));
      case 'getClothTracking':
        return jsonOutput_(getClothTracking_(payload));
      case 'submitClothTracking':
        return jsonOutput_(submitClothTracking_(payload));
      case 'updateClothTrackingStatus':
        return jsonOutput_(updateClothTrackingStatus_(payload));
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    return jsonOutput_({
      status: 'error',
      message: error.message || String(error)
    });
  }
}

function getWards_() {
  const rows = readRows_(CONFIG.sheets.master, SHEET_HEADERS.ClothMaster);
  const wards = unique_(rows
    .filter(isMasterRowActive_)
    .map(row => normalizeText_(row['หน่วยงาน']))
    .filter(Boolean));

  return { status: 'success', data: wards };
}

function getClothMaster_(payload) {
  const ward = normalizeText_(payload.ward);
  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');

  const masterRows = readRows_(CONFIG.sheets.master, SHEET_HEADERS.ClothMaster);
  const logRows = readRows_(CONFIG.sheets.log, SHEET_HEADERS.ClothLog);
  const currentQuarter = getCurrentQuarterLabel_(new Date());

  const quarterLogs = logRows
    .filter(row => normalizeText_(row['หน่วยงาน']) === ward && normalizeText_(row['รอบการตรวจ']) === currentQuarter)
    .sort((a, b) => parseDateValue_(b.Timestamp) - parseDateValue_(a.Timestamp));

  // เก็บผลตรวจนับล่าสุดของแต่ละรายการผ้า (ชื่อรายการ -> ค่าที่ตรวจนับได้) เพื่อส่งให้หน้าเว็บแสดงในฟอร์มเมื่อรอบนี้ล็อกแล้ว
  const lastCountByItem = {};
  quarterLogs.forEach(row => {
    const itemName = normalizeText_(row['ชื่อรายการผ้า']);
    if (!itemName || lastCountByItem[itemName]) return;
    const readyStock = toNumber_(pickValue_(row, ['ผ้าพร้อมใช้', 'ยอดดี']));
    const inUse = toNumber_(row['กำลังใช้งาน']);
    const inLaundry = toNumber_(row['ส่งซัก']);
    const pendingTracking = toNumber_(row['ติดผู้ป่วยรอติดตาม']);
    const total = toNumber_(row['ยอดนับได้จริง'], readyStock + inUse + inLaundry + pendingTracking);
    const par = toNumber_(row['ยอดมาตรฐาน']);
    lastCountByItem[itemName] = {
      readyStock,
      inUse,
      inLaundry,
      pendingTracking,
      total,
      par,
      diff: toNumber_(row['ส่วนต่าง (+/-)'], total - par),
      recorder: normalizeText_(row['ผู้บันทึก']),
      note: normalizeText_(row['หมายเหตุ']),
      timestamp: normalizeTimestamp_(row['Timestamp'])
    };
  });

  const items = masterRows
    .filter(row => isMasterRowActive_(row) && normalizeText_(row['หน่วยงาน']) === ward)
    .map(row => {
      const itemName = normalizeText_(row['ชื่อรายการผ้า']);
      return {
        itemName,
        category: normalizeText_(row['หมวดหมู่หลัก']) || itemName,
        parLevel: toNumber_(row['ยอดมาตรฐาน (Par)']),
        lastCount: lastCountByItem[itemName] || null
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, 'th') || a.itemName.localeCompare(b.itemName, 'th'));

  return {
    status: 'success',
    data: items,
    currentQuarter,
    isAlreadyCounted: quarterLogs.length > 0,
    lastCountDate: quarterLogs.length ? normalizeTimestamp_(quarterLogs[0].Timestamp) : '',
    lastCountRecorder: quarterLogs.length ? normalizeText_(quarterLogs[0]['ผู้บันทึก']) : '',
    lastCountNote: quarterLogs.length ? normalizeText_(quarterLogs[0]['หมายเหตุ']) : ''
  };
}

function getAllClothLogs_() {
  const masterRows = readRows_(CONFIG.sheets.master, SHEET_HEADERS.ClothMaster);
  const logRows = readRows_(CONFIG.sheets.log, SHEET_HEADERS.ClothLog);
  const wardCriteria = {};

  masterRows.filter(isMasterRowActive_).forEach(row => {
    const ward = normalizeText_(row['หน่วยงาน']);
    if (!ward) return;
    wardCriteria[ward] = (wardCriteria[ward] || 0) + toNumber_(row['ยอดมาตรฐาน (Par)']);
  });

  const allWards = unique_(
    masterRows.map(row => normalizeText_(row['หน่วยงาน']))
      .concat(logRows.map(row => normalizeText_(row['หน่วยงาน'])))
      .filter(Boolean)
  );

  const data = logRows.map(row => {
    const readyStock = toNumber_(pickValue_(row, ['ผ้าพร้อมใช้', 'ยอดดี']));
    const inUse = toNumber_(row['กำลังใช้งาน']);
    const inLaundry = toNumber_(row['ส่งซัก']);
    const pendingTracking = toNumber_(row['ติดผู้ป่วยรอติดตาม']);
    const total = toNumber_(row['ยอดนับได้จริง'], readyStock + inUse + inLaundry + pendingTracking);
    const par = toNumber_(row['ยอดมาตรฐาน']);

    return {
      timestamp: normalizeTimestamp_(row['Timestamp']),
      quarter: normalizeText_(row['รอบการตรวจ']),
      ward: normalizeText_(row['หน่วยงาน']),
      itemName: normalizeText_(row['ชื่อรายการผ้า']),
      mainCategory: normalizeText_(row['หมวดหมู่ภาพรวม']),
      readyStock,
      inUse,
      inLaundry,
      pendingTracking,
      total,
      par,
      diff: toNumber_(row['ส่วนต่าง (+/-)'], total - par),
      recorder: normalizeText_(row['ผู้บันทึก']),
      note: normalizeText_(row['หมายเหตุ'])
    };
  }).sort((a, b) => parseDateValue_(b.timestamp) - parseDateValue_(a.timestamp));

  return {
    status: 'success',
    data,
    wardCriteria,
    allWards
  };
}

function submitClothLog_(payload) {
  const ward = normalizeText_(payload.ward);
  const recorder = normalizeText_(payload.recorder);
  const quarter = normalizeText_(payload.quarter) || getCurrentQuarterLabel_(new Date());
  const globalNote = normalizeText_(payload.note);
  const logs = Array.isArray(payload.logs) ? payload.logs : [];

  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  if (!recorder) throw new Error('กรุณาระบุผู้บันทึก');
  if (!logs.length) throw new Error('ไม่พบข้อมูลรายการตรวจนับ');

  // ล็อกการทำงานระดับสคริปต์ระหว่างตรวจสอบ+บันทึก เพื่อป้องกันการบันทึกซ้ำในไตรมาสเดียวกัน
  // กรณีมีการกดบันทึกพร้อมกันหลายครั้ง/หลายอุปกรณ์ (race condition)
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);
  if (!gotLock) {
    throw new Error('ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง');
  }

  try {
    const existingRows = readRows_(CONFIG.sheets.log, SHEET_HEADERS.ClothLog).filter(row =>
      normalizeText_(row['หน่วยงาน']) === ward &&
      normalizeText_(row['รอบการตรวจ']) === quarter
    );

    if (existingRows.length > 0) {
      throw new Error('หน่วยงานนี้บันทึกข้อมูลในรอบนี้แล้ว');
    }

    const timestamp = formatDateTime_(new Date());
    const sheet = getSheet_(CONFIG.sheets.log, SHEET_HEADERS.ClothLog);

    logs.forEach(log => {
      const readyStock = toNumber_(pickValue_(log, ['readyStock', 'good', 'totalGood']));
      const inUse = toNumber_(log.inUse);
      const inLaundry = toNumber_(log.inLaundry);
      const pendingTracking = toNumber_(log.pendingTracking);
      const total = toNumber_(pickValue_(log, ['totalCounted', 'total']), readyStock + inUse + inLaundry + pendingTracking);
      const par = toNumber_(pickValue_(log, ['parLevel', 'par']));
      const diff = toNumber_(pickValue_(log, ['difference', 'diff']), total - par);

      appendRow_(sheet, SHEET_HEADERS.ClothLog, {
        'Timestamp': timestamp,
        'หน่วยงาน': ward,
        'รอบการตรวจ': quarter,
        'ชื่อรายการผ้า': normalizeText_(pickValue_(log, ['itemName', 'clothName', 'mainType'])),
        'หมวดหมู่ภาพรวม': normalizeText_(pickValue_(log, ['mainCategory', 'category'])) || normalizeText_(pickValue_(log, ['itemName', 'clothName', 'mainType'])),
        'ผ้าพร้อมใช้': readyStock,
        'กำลังใช้งาน': inUse,
        'ส่งซัก': inLaundry,
        'ติดผู้ป่วยรอติดตาม': pendingTracking,
        'ยอดนับได้จริง': total,
        'ยอดมาตรฐาน': par,
        'ส่วนต่าง (+/-)': diff,
        'ผู้บันทึก': recorder,
        'หมายเหตุ': normalizeText_(pickValue_(log, ['note', 'notes'])) || globalNote,
        'โมเดลการนับ': normalizeText_(payload.countModel) || 'hospital_v2'
      });
    });

    return {
      status: 'success',
      message: 'บันทึกการตรวจนับเรียบร้อยแล้ว',
      count: logs.length,
      quarter
    };
  } finally {
    lock.releaseLock();
  }
}

function getClothTracking_(payload) {
  const ward = normalizeText_(payload.ward);
  const status = normalizeTrackingStatus_(payload.status);
  const rows = readRows_(CONFIG.sheets.tracking, SHEET_HEADERS.ClothTracking);

  const data = rows
    .filter(row => (!ward || normalizeText_(row['หน่วยงาน']) === ward) && (!status || normalizeTrackingStatus_(row['สถานะ']) === status))
    .map(row => ({
      id: normalizeText_(row['ID']),
      timestamp: normalizeTimestamp_(row['Timestamp']),
      reportDate: normalizeText_(row['วันที่แจ้ง']),
      ward: normalizeText_(row['หน่วยงาน']),
      itemName: normalizeText_(row['ชื่อรายการผ้า']),
      mainCategory: normalizeText_(row['หมวดหมู่หลัก']),
      qty: toNumber_(row['จำนวน']),
      reason: normalizeText_(row['สาเหตุ']),
      note: normalizeText_(row['หมายเหตุ']),
      reporter: normalizeText_(row['ผู้แจ้ง']),
      status: normalizeTrackingStatus_(row['สถานะ']) || 'open',
      followupNote: normalizeText_(row['ผลติดตาม']),
      updatedBy: normalizeText_(row['ผู้ดำเนินการ']),
      updatedAt: normalizeText_(row['อัปเดตล่าสุด'])
    }))
    .sort((a, b) => parseDateValue_(b.timestamp || b.reportDate) - parseDateValue_(a.timestamp || a.reportDate));

  return { status: 'success', data };
}

function submitClothTracking_(payload) {
  const ward = normalizeText_(payload.ward);
  const reportDate = normalizeText_(payload.reportDate);
  const reporter = normalizeText_(payload.reporter);
  const itemName = normalizeText_(payload.itemName);
  const qty = toNumber_(payload.qty);
  const reason = normalizeText_(payload.reason);
  const note = normalizeText_(payload.note);

  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  if (!reportDate) throw new Error('กรุณาระบุวันที่แจ้ง');
  if (!reporter) throw new Error('กรุณาระบุผู้แจ้ง');
  if (!itemName) throw new Error('กรุณาระบุรายการผ้า');
  if (!qty || qty < 1) throw new Error('จำนวนต้องมากกว่า 0');
  if (!reason) throw new Error('กรุณาระบุสาเหตุ');

  const category = findItemCategory_(ward, itemName);
  const timestamp = formatDateTime_(new Date());
  const id = Utilities.getUuid();
  const sheet = getSheet_(CONFIG.sheets.tracking, SHEET_HEADERS.ClothTracking);

  appendRow_(sheet, SHEET_HEADERS.ClothTracking, {
    'ID': id,
    'Timestamp': timestamp,
    'วันที่แจ้ง': reportDate,
    'หน่วยงาน': ward,
    'ชื่อรายการผ้า': itemName,
    'หมวดหมู่หลัก': category,
    'จำนวน': qty,
    'สาเหตุ': reason,
    'หมายเหตุ': note,
    'ผู้แจ้ง': reporter,
    'สถานะ': 'open',
    'ผลติดตาม': '',
    'ผู้ดำเนินการ': '',
    'อัปเดตล่าสุด': timestamp
  });

  return {
    status: 'success',
    message: 'ส่งรายการติดตามเรียบร้อยแล้ว',
    data: { id, timestamp }
  };
}

function updateClothTrackingStatus_(payload) {
  const id = normalizeText_(payload.id);
  const status = normalizeTrackingStatus_(payload.status);
  const updatedBy = normalizeText_(payload.updatedBy);
  const followupNote = normalizeText_(payload.followupNote);

  if (!id) throw new Error('กรุณาระบุ ID');
  if (!status || TRACKING_STATUSES.indexOf(status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  if (!updatedBy) throw new Error('กรุณาระบุผู้ดำเนินการ');

  const sheet = getSheet_(CONFIG.sheets.tracking, SHEET_HEADERS.ClothTracking);
  const rowIndex = findRowIndexById_(sheet, 'ID', id);
  if (rowIndex < 2) throw new Error('ไม่พบรายการติดตาม');

  const headers = ensureHeaders_(sheet, SHEET_HEADERS.ClothTracking);
  const headerIndex = indexHeaders_(headers);
  const updatedAt = formatDateTime_(new Date());

  setCellByHeader_(sheet, rowIndex, headerIndex, 'สถานะ', status);
  setCellByHeader_(sheet, rowIndex, headerIndex, 'ผลติดตาม', followupNote);
  setCellByHeader_(sheet, rowIndex, headerIndex, 'ผู้ดำเนินการ', updatedBy);
  setCellByHeader_(sheet, rowIndex, headerIndex, 'อัปเดตล่าสุด', updatedAt);

  return {
    status: 'success',
    message: 'อัปเดตสถานะเรียบร้อยแล้ว',
    data: { id, status, updatedAt }
  };
}

function getSpreadsheet_() {
  if (CONFIG.spreadsheetId) return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบ Spreadsheet ปลายทาง กรุณาตั้งค่า spreadsheetId ใน CONFIG');
  return ss;
}

function getSheet_(sheetName, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, expectedHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existing = current.filter(header => header !== '');

  if (!existing.length) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
    return expectedHeaders.slice();
  }

  const missing = expectedHeaders.filter(header => existing.indexOf(header) === -1);
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }

  sheet.setFrozenRows(1);
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function readRows_(sheetName, headers) {
  const sheet = getSheet_(sheetName, headers);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headerRow = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const item = {};
      headerRow.forEach((header, index) => {
        item[header] = row[index];
      });
      return item;
    });
}

function appendRow_(sheet, headers, rowObject) {
  const finalHeaders = ensureHeaders_(sheet, headers);
  const row = finalHeaders.map(header => Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '');
  sheet.appendRow(row);
}

function findRowIndexById_(sheet, idHeader, idValue) {
  const headers = ensureHeaders_(sheet, SHEET_HEADERS.ClothTracking);
  const headerIndex = indexHeaders_(headers);
  const col = headerIndex[idHeader];
  if (!col) return -1;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (normalizeText_(values[i][0]) === idValue) return i + 2;
  }
  return -1;
}

function setCellByHeader_(sheet, rowIndex, headerIndex, headerName, value) {
  const col = headerIndex[headerName];
  if (!col) return;
  sheet.getRange(rowIndex, col).setValue(value);
}

function indexHeaders_(headers) {
  return headers.reduce((acc, header, index) => {
    if (header) acc[header] = index + 1;
    return acc;
  }, {});
}

function getPayload_(e, method) {
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return (e && e.parameter) ? e.parameter : {};
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findItemCategory_(ward, itemName) {
  const rows = readRows_(CONFIG.sheets.master, SHEET_HEADERS.ClothMaster);
  const exact = rows.find(row => normalizeText_(row['หน่วยงาน']) === ward && normalizeText_(row['ชื่อรายการผ้า']) === itemName);
  if (exact) return normalizeText_(exact['หมวดหมู่หลัก']);
  const fallback = rows.find(row => normalizeText_(row['ชื่อรายการผ้า']) === itemName);
  return fallback ? normalizeText_(fallback['หมวดหมู่หลัก']) : '';
}

function isMasterRowActive_(row) {
  const value = String(pickValue_(row, ['เปิดใช้งาน'])).trim().toLowerCase();
  return value === '' || value === 'true' || value === '1' || value === 'yes' || value === 'y' || value === 'ใช่';
}

function getCurrentQuarterLabel_(date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const buddhistYear = date.getFullYear() + 543;
  const ranges = [
    ['มกราคม', 'มีนาคม'],
    ['เมษายน', 'มิถุนายน'],
    ['กรกฎาคม', 'กันยายน'],
    ['ตุลาคม', 'ธันวาคม']
  ];
  const range = ranges[quarter - 1];
  return `ไตรมาส ${quarter}/${buddhistYear} (${range[0]} - ${range[1]})`;
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, CONFIG.timeZone, 'dd/MM/yyyy HH:mm:ss');
}

function normalizeTimestamp_(value) {
  if (value instanceof Date) return formatDateTime_(value);
  return normalizeText_(value);
}

function parseDateValue_(value) {
  if (value instanceof Date) return value.getTime();
  if (!value) return 0;

  const text = String(value).replace(' น.', '').trim();
  const direct = new Date(text);
  if (!isNaN(direct.getTime())) return direct.getTime();

  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return 0;
  let year = Number(match[3]);
  if (year > 2400) year -= 543;
  return new Date(
    year,
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0)
  ).getTime();
}

function normalizeTrackingStatus_(value) {
  const text = normalizeText_(value).toLowerCase();
  if (!text) return '';
  if (['แจ้งใหม่', 'new', 'open'].indexOf(text) !== -1) return 'open';
  if (['กำลังติดตาม', 'in_progress', 'progress', 'tracking'].indexOf(text) !== -1) return 'in_progress';
  if (['คืนคลังแล้ว', 'returned'].indexOf(text) !== -1) return 'returned';
  if (['ติดตามไม่ได้', 'lost'].indexOf(text) !== -1) return 'lost';
  if (['ยกเลิก', 'cancelled', 'canceled'].indexOf(text) !== -1) return 'cancelled';
  return text;
}

function normalizeText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function toNumber_(value, fallback) {
  if (typeof fallback === 'undefined') fallback = 0;
  if (typeof value === 'number') return isNaN(value) ? fallback : value;
  const text = normalizeText_(value).replace(/,/g, '');
  if (!text) return fallback;
  const num = Number(text);
  return isNaN(num) ? fallback : num;
}

function pickValue_(obj, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== '' && obj[key] !== null && obj[key] !== undefined) {
      return obj[key];
    }
  }
  return '';
}

function unique_(items) {
  const seen = {};
  const result = [];
  items.forEach(item => {
    if (!seen[item]) {
      seen[item] = true;
      result.push(item);
    }
  });
  return result.sort((a, b) => a.localeCompare(b, 'th'));
}
