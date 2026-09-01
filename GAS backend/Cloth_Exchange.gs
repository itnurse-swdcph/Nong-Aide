const EXCHANGE_CONFIG = {
  exchangeSpreadsheetId: '1AE2Z71ctY0ojld0u0X2l3JGiz_OLof-rpRVQ-rAKkZM',
  stockReferenceSpreadsheetId: '1g8Pw7t70KTNtx7pvfYZpAQ4bB0OlnFVLx91TvnD_HAs',
  appVersion: '2026.04.27.02',
  timeZone: 'Asia/Bangkok',
  sheets: {
    clothMaster: 'ClothMaster',
    wardBedSettings: 'WardBedSettings',
    header: 'ExchangeRequestHeader',
    line: 'ExchangeRequestLine',
    statusLog: 'ExchangeStatusLog'
  }
};

const EXCHANGE_HEADERS = {
  ExchangeRequestHeader: [
    'Request ID',
    'Request No',
    'Request Date',
    'Ward',
    'Shift',
    'Status',
    'Requester Name',
    'Requester Signature',
    'Submitted At',
    'Laundry Receiver Name',
    'Laundry Received At',
    'Laundry Issuer Name',
    'Laundry Issued At',
    'Ward Receiver Name',
    'Ward Received At',
    'Last Updated At',
    'Last Updated By'
  ],
  ExchangeRequestLine: [
    'Request ID',
    'Line No',
    'Cloth Item',
    'Main Category',
    'Par Level',
    'Stock Balance',
    'Sent Laundry Qty',
    'Suggested Qty',
    'Requested Qty',
    'Ward Note',
    'Laundry Received Qty',
    'Issued Qty',
    'Outstanding Qty',
    'Laundry Note'
  ],
  ExchangeStatusLog: [
    'Timestamp',
    'Request ID',
    'Request No',
    'From Status',
    'To Status',
    'Actor Ward',
    'Actor Name',
    'Action',
    'Note'
  ],
  StockRequests: [
    'Request ID',
    'Requested At',
    'Ward',
    'Item Name',
    'Main Category',
    'Requested Par',
    'Reason',
    'Status',
    'Approved By',
    'Updated At',
    'Current Par',
    'Request Type',
    'Approved At'
  ],
  WardBedSettings: [
    'หน่วยงาน',
    'จำนวนเตียง',
    'เปิดใช้งาน',
    'หมายเหตุ'
  ]
};

const EXCHANGE_STATUSES = {
  draft: 'draft',
  submitted: 'submitted',
  received: 'received',
  processing: 'processing',
  partial_issued: 'partial_issued',
  issued_waiting_receipt: 'issued_waiting_receipt',
  completed: 'completed',
  cancelled: 'cancelled'
};

function doGet(e) {
  return handleExchangeRequest_(e, 'GET');
}

function doPost(e) {
  return handleExchangeRequest_(e, 'POST');
}

function handleExchangeRequest_(e, method) {
  try {
    const payload = getExchangePayload_(e, method);
    const action = String(payload.action || 'getWards').trim();

    switch (action) {
      case 'getWards':
        return jsonExchange_(getExchangeWards_());
      case 'getAppMeta':
        return jsonExchange_(getExchangeAppMeta_());
      case 'getExchangeMaster':
        return jsonExchange_(getExchangeMaster_(payload));
      case 'getGlobalClothMaster':
        return jsonExchange_(getGlobalClothItems_());
      case 'getWardExchangeRequests':
        return jsonExchange_(getWardExchangeRequests_(payload));
      case 'getLaundryExchangeRequests':
        return jsonExchange_(getLaundryExchangeRequests_(payload));
      case 'getExchangeRequestDetail':
        return jsonExchange_(getExchangeRequestDetail_(payload));
      case 'submitExchangeRequest':
        return jsonExchange_(submitExchangeRequest_(payload));
      case 'updateExchangeRequest':
        return jsonExchange_(updateExchangeRequest_(payload));
      case 'receiveExchangeRequest':
        return jsonExchange_(receiveExchangeRequest_(payload));
      case 'issueExchangeRequest':
        return jsonExchange_(issueExchangeRequest_(payload));
      case 'confirmExchangeReceipt':
        return jsonExchange_(confirmExchangeReceipt_(payload));
      case 'submitStockRequest':
        return jsonExchange_(submitStockRequest(payload));
      case 'getStockRequests':
        return jsonExchange_(getStockRequests(payload));
      case 'processStockRequest':
        return jsonExchange_(processStockRequest(payload));
      case 'getWardStockReport':
        return jsonExchange_(getWardStockReport_(payload));
      case 'updateWardStockLevels':
        return jsonExchange_(updateWardStockLevels_(payload));
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    return jsonExchange_({
      status: 'error',
      message: error.message || String(error)
    });
  }
}

function getExchangeWards_() {
  const masterRows = readExchangeRows_(getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster));
  const wards = uniqueExchange_(masterRows
    .map(row => normalizeExchangeText_(row['หน่วยงาน']))
    .filter(Boolean));
  return { status: 'success', data: wards };
}

function getExchangeAppMeta_() {
  return {
    status: 'success',
    data: {
      version: EXCHANGE_CONFIG.appVersion,
      checkedAt: formatExchangeDate_(new Date())
    }
  };
}

function getExchangeMaster_(payload) {
  const ward = normalizeExchangeText_(payload.ward);
  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');

  const masterRows = readExchangeRows_(getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster));
  const items = masterRows
    .filter(row => normalizeExchangeText_(row['หน่วยงาน']) === ward && isActiveMasterRow_(row))
    .map(row => ({
      itemName: normalizeExchangeText_(row['ชื่อรายการผ้า']),
      mainCategory: normalizeExchangeText_(row['หมวดหมู่หลัก']) || normalizeExchangeText_(row['ชื่อรายการผ้า']),
      parLevel: toExchangeNumber_(row['ยอดมาตรฐาน (Par)'])
    }))
    .sort((a, b) => a.mainCategory.localeCompare(b.mainCategory, 'th') || a.itemName.localeCompare(b.itemName, 'th'));

  return {
    status: 'success',
    data: items
  };
}

function getGlobalClothItems_() {
  const masterRows = readExchangeRows_(getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster));
  const itemsByName = {};

  masterRows
    .filter(isActiveMasterRow_)
    .forEach(row => {
      const itemName = normalizeExchangeText_(row['ชื่อรายการผ้า']);
      if (!itemName) return;

      const key = normalizeExchangeStatus_(itemName);
      const mainCategory = normalizeExchangeText_(row['หมวดหมู่หลัก']) || itemName;
      if (!itemsByName[key]) {
        itemsByName[key] = {
          itemName,
          mainCategory
        };
      }
    });

  return {
    status: 'success',
    data: Object.keys(itemsByName)
      .map(key => itemsByName[key])
      .sort((a, b) => a.mainCategory.localeCompare(b.mainCategory, 'th') || a.itemName.localeCompare(b.itemName, 'th'))
  };
}

function getWardExchangeRequests_(payload) {
  const ward = normalizeExchangeText_(payload.ward);
  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  const requests = getExchangeRequests_()
    .filter(request => request.header.ward === ward)
    .map(mapExchangeRequestSummary_)
    .sort((a, b) => parseExchangeDate_(b.updatedAt || b.submittedAt || b.requestDate) - parseExchangeDate_(a.updatedAt || a.submittedAt || a.requestDate));

  return { status: 'success', data: requests };
}

function getLaundryExchangeRequests_(payload) {
  const filterStatus = normalizeExchangeText_(payload.status);
  const requests = getExchangeRequests_()
    .map(mapExchangeRequestSummary_)
    .filter(request => !filterStatus || request.status === filterStatus)
    .sort((a, b) => parseExchangeDate_(b.updatedAt || b.submittedAt || b.requestDate) - parseExchangeDate_(a.updatedAt || a.submittedAt || a.requestDate));

  return { status: 'success', data: requests };
}

function getExchangeRequestDetail_(payload) {
  const requestId = normalizeExchangeText_(payload.requestId);
  if (!requestId) throw new Error('กรุณาระบุ Request ID');
  const request = getExchangeRequestById_(requestId);
  return {
    status: 'success',
    data: mapExchangeRequestDetail_(request)
  };
}

function submitExchangeRequest_(payload) {
  const ward = normalizeExchangeText_(payload.ward);
  const requestDate = normalizeExchangeText_(payload.requestDate);
  const shift = normalizeExchangeText_(payload.shift);
  const requesterName = normalizeExchangeText_(payload.requesterName);
  const requesterSignature = normalizeExchangeText_(payload.requesterSignature || requesterName);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  if (!requestDate) throw new Error('กรุณาระบุวันที่เบิก');
  if (!shift) throw new Error('กรุณาระบุเวร');
  if (!requesterName) throw new Error('กรุณาระบุผู้ส่งใบเบิก');
  if (!lines.length) throw new Error('ไม่พบรายการผ้า');

  const normalizedLines = lines
    .map((line, index) => normalizeSubmittedLine_(line, index + 1))
    .filter(line => line.requestedQty > 0 || line.stockBalance > 0 || line.sentLaundryQty > 0 || line.wardNote);

  if (!normalizedLines.length) throw new Error('กรุณากรอกอย่างน้อย 1 รายการ');

  const requestId = Utilities.getUuid();
  const requestNo = buildExchangeRequestNo_();
  const submittedAt = formatExchangeDate_(new Date());
  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const lineSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.line, EXCHANGE_HEADERS.ExchangeRequestLine);

  appendExchangeRow_(headerSheet, EXCHANGE_HEADERS.ExchangeRequestHeader, {
    'Request ID': requestId,
    'Request No': requestNo,
    'Request Date': requestDate,
    'Ward': ward,
    'Shift': shift,
    'Status': EXCHANGE_STATUSES.submitted,
    'Requester Name': requesterName,
    'Requester Signature': requesterSignature,
    'Submitted At': submittedAt,
    'Laundry Receiver Name': '',
    'Laundry Received At': '',
    'Laundry Issuer Name': '',
    'Laundry Issued At': '',
    'Ward Receiver Name': '',
    'Ward Received At': '',
    'Last Updated At': submittedAt,
    'Last Updated By': requesterName
  });

  normalizedLines.forEach((line, index) => {
    appendExchangeRow_(lineSheet, EXCHANGE_HEADERS.ExchangeRequestLine, {
      'Request ID': requestId,
      'Line No': index + 1,
      'Cloth Item': line.itemName,
      'Main Category': line.mainCategory,
      'Par Level': line.parLevel,
      'Stock Balance': line.stockBalance,
      'Sent Laundry Qty': line.sentLaundryQty,
      'Suggested Qty': line.suggestedQty,
      'Requested Qty': line.requestedQty,
      'Ward Note': line.wardNote,
      'Laundry Received Qty': '',
      'Issued Qty': '',
      'Outstanding Qty': line.requestedQty,
      'Laundry Note': ''
    });
  });

  appendExchangeStatusLog_(requestId, requestNo, '', EXCHANGE_STATUSES.submitted, ward, requesterName, 'submit_request', '');

  return {
    status: 'success',
    message: 'สร้างใบเบิกเรียบร้อยแล้ว',
    data: {
      requestId,
      requestNo
    }
  };
}

function updateExchangeRequest_(payload) {
  const requestId = normalizeExchangeText_(payload.requestId);
  const ward = normalizeExchangeText_(payload.ward);
  const requestDate = normalizeExchangeText_(payload.requestDate);
  const shift = normalizeExchangeText_(payload.shift);
  const requesterName = normalizeExchangeText_(payload.requesterName);
  const requesterSignature = normalizeExchangeText_(payload.requesterSignature || requesterName);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!requestId) throw new Error('กรุณาระบุ Request ID');
  if (!requestDate) throw new Error('กรุณาระบุวันที่ใบเบิก');
  if (!shift) throw new Error('กรุณาระบุเวร');
  if (!requesterName) throw new Error('กรุณาระบุผู้ส่งใบเบิก');
  if (!lines.length) throw new Error('ไม่พบรายการผ้า');

  const request = getExchangeRequestById_(requestId);
  if (ward && request.header.ward !== ward) {
    throw new Error('ไม่สามารถแก้ไขใบเบิกของหน่วยงานอื่นได้');
  }
  if (request.header.status !== EXCHANGE_STATUSES.submitted || request.header.laundryReceivedAt) {
    throw new Error('ซักฟอกรับใบเบิกแล้ว ไม่สามารถแก้ไขข้อมูลได้');
  }

  const normalizedLines = lines.map((line, index) => {
    const lineNo = toExchangeNumber_(line.lineNo, index + 1);
    return normalizeSubmittedLine_(line, lineNo);
  });

  const hasAtLeastOneLine = normalizedLines.some(line =>
    line.requestedQty > 0 ||
    line.stockBalance > 0 ||
    line.sentLaundryQty > 0 ||
    line.wardNote
  );
  if (!hasAtLeastOneLine) {
    throw new Error('กรุณากรอกอย่างน้อย 1 รายการ');
  }

  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const headerIndex = indexExchangeHeaders_(ensureExchangeHeaders_(headerSheet, EXCHANGE_HEADERS.ExchangeRequestHeader));
  if ([EXCHANGE_STATUSES.submitted, EXCHANGE_STATUSES.received, EXCHANGE_STATUSES.processing].indexOf(request.header.status) === -1) {
    throw new Error('ใบเบิกนี้ยังไม่ได้อยู่ในคิวรอจ่ายผ้า');
  }

  const lineSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.line, EXCHANGE_HEADERS.ExchangeRequestLine);
  const lineHeaderIndex = indexExchangeHeaders_(ensureExchangeHeaders_(lineSheet, EXCHANGE_HEADERS.ExchangeRequestLine));
  const now = formatExchangeDate_(new Date());

  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Request Date', requestDate);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Shift', shift);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Requester Name', requesterName);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Requester Signature', requesterSignature);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated At', now);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated By', requesterName);

  const existingLinesByNo = {};
  request.lines.forEach(line => {
    existingLinesByNo[String(line.lineNo)] = line;
  });

  normalizedLines.forEach(line => {
    const target = existingLinesByNo[String(line.lineNo)];
    const rowObject = {
      'Request ID': requestId,
      'Line No': line.lineNo,
      'Cloth Item': line.itemName,
      'Main Category': line.mainCategory,
      'Par Level': line.parLevel,
      'Stock Balance': line.stockBalance,
      'Sent Laundry Qty': line.sentLaundryQty,
      'Suggested Qty': line.suggestedQty,
      'Requested Qty': line.requestedQty,
      'Ward Note': line.wardNote,
      'Laundry Received Qty': '',
      'Issued Qty': '',
      'Outstanding Qty': line.requestedQty,
      'Laundry Note': ''
    };

    if (!target) {
      appendExchangeRow_(lineSheet, EXCHANGE_HEADERS.ExchangeRequestLine, rowObject);
      return;
    }

    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Cloth Item', rowObject['Cloth Item']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Main Category', rowObject['Main Category']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Par Level', rowObject['Par Level']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Stock Balance', rowObject['Stock Balance']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Sent Laundry Qty', rowObject['Sent Laundry Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Suggested Qty', rowObject['Suggested Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Requested Qty', rowObject['Requested Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Ward Note', rowObject['Ward Note']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Laundry Received Qty', rowObject['Laundry Received Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Issued Qty', rowObject['Issued Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Outstanding Qty', rowObject['Outstanding Qty']);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Laundry Note', rowObject['Laundry Note']);
  });

  appendExchangeStatusLog_(
    requestId,
    request.header.requestNo,
    request.header.status,
    request.header.status,
    request.header.ward,
    requesterName,
    'update_request',
    'แก้ไขข้อมูลใบเบิกก่อนซักฟอกรับใบ'
  );

  return {
    status: 'success',
    message: 'บันทึกการแก้ไขใบเบิกเรียบร้อยแล้ว',
    data: {
      requestId,
      requestNo: request.header.requestNo
    }
  };
}

function receiveExchangeRequest_(payload) {
  const requestId = normalizeExchangeText_(payload.requestId);
  const receiverName = normalizeExchangeText_(payload.receiverName);
  const note = normalizeExchangeText_(payload.note);

  if (!requestId) throw new Error('กรุณาระบุ Request ID');
  if (!receiverName) throw new Error('กรุณาระบุผู้รับใบเบิก');

  const request = getExchangeRequestById_(requestId);
  const currentStatus = request.header.status;
  if ([EXCHANGE_STATUSES.completed, EXCHANGE_STATUSES.cancelled].indexOf(currentStatus) !== -1) {
    throw new Error('ใบเบิกนี้ปิดงานแล้ว');
  }

  const nextStatus = currentStatus === EXCHANGE_STATUSES.submitted ? EXCHANGE_STATUSES.received : currentStatus;
  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const headerIndex = indexExchangeHeaders_(ensureExchangeHeaders_(headerSheet, EXCHANGE_HEADERS.ExchangeRequestHeader));
  const now = formatExchangeDate_(new Date());

  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Laundry Receiver Name', receiverName);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Laundry Received At', now);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Status', nextStatus);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated At', now);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated By', receiverName);

  appendExchangeStatusLog_(requestId, request.header.requestNo, currentStatus, nextStatus, 'ซักฟอก', receiverName, 'receive_request', note);

  return {
    status: 'success',
    message: 'รับใบเบิกเรียบร้อยแล้ว',
    data: { requestId, status: nextStatus }
  };
}

function issueExchangeRequest_(payload) {
  const requestId = normalizeExchangeText_(payload.requestId);
  const issuerName = normalizeExchangeText_(payload.issuerName);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const note = normalizeExchangeText_(payload.note);

  if (!requestId) throw new Error('กรุณาระบุ Request ID');
  if (!issuerName) throw new Error('กรุณาระบุผู้จ่ายผ้า');
  if (!lines.length) throw new Error('ไม่พบรายการที่จะจ่าย');

  const request = getExchangeRequestById_(requestId);
  if ([EXCHANGE_STATUSES.completed, EXCHANGE_STATUSES.cancelled].indexOf(request.header.status) !== -1) {
    throw new Error('ใบเบิกนี้ปิดงานแล้ว');
  }

  const lineSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.line, EXCHANGE_HEADERS.ExchangeRequestLine);
  const lineHeaderIndex = indexExchangeHeaders_(ensureExchangeHeaders_(lineSheet, EXCHANGE_HEADERS.ExchangeRequestLine));
  const lineMap = {};
  request.lines.forEach(line => {
    lineMap[String(line.lineNo)] = line;
  });

  lines.forEach(line => {
    const lineNo = String(line.lineNo);
    const target = lineMap[lineNo];
    if (!target) return;

    const receivedQty = Object.prototype.hasOwnProperty.call(line, 'receivedQty')
      ? toExchangeNumber_(line.receivedQty)
      : (target.laundryReceivedQty || target.requestedQty);
    const issuedQty = toExchangeNumber_(line.issuedQty);
    const outstandingQty = Math.max(toExchangeNumber_(line.requestedQty, target.requestedQty) - issuedQty, 0);
    const laundryNote = normalizeExchangeText_(line.laundryNote);

    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Laundry Received Qty', receivedQty);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Issued Qty', issuedQty);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Outstanding Qty', outstandingQty);
    setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Laundry Note', laundryNote);
  });

  const refreshedRequest = getExchangeRequestById_(requestId);
  const totalOutstanding = refreshedRequest.lines.reduce(function(sum, line) {
    return sum + toExchangeNumber_(line.outstandingQty);
  }, 0);
  const nextStatus = totalOutstanding > 0
    ? EXCHANGE_STATUSES.partial_issued
    : EXCHANGE_STATUSES.issued_waiting_receipt;
  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const headerIndex = indexExchangeHeaders_(ensureExchangeHeaders_(headerSheet, EXCHANGE_HEADERS.ExchangeRequestHeader));
  const now = formatExchangeDate_(new Date());

  setExchangeCell_(headerSheet, refreshedRequest.header.rowIndex, headerIndex, 'Laundry Issuer Name', issuerName);
  setExchangeCell_(headerSheet, refreshedRequest.header.rowIndex, headerIndex, 'Laundry Issued At', now);
  setExchangeCell_(headerSheet, refreshedRequest.header.rowIndex, headerIndex, 'Status', nextStatus);
  setExchangeCell_(headerSheet, refreshedRequest.header.rowIndex, headerIndex, 'Last Updated At', now);
  setExchangeCell_(headerSheet, refreshedRequest.header.rowIndex, headerIndex, 'Last Updated By', issuerName);

  appendExchangeStatusLog_(requestId, refreshedRequest.header.requestNo, refreshedRequest.header.status, nextStatus, 'ซักฟอก', issuerName, 'issue_clean_linen', note);

  return {
    status: 'success',
    message: 'บันทึกการจ่ายผ้าเรียบร้อยแล้ว',
    data: { requestId, status: nextStatus }
  };
}

function confirmExchangeReceipt_(payload) {
  const requestId = normalizeExchangeText_(payload.requestId);
  const receiverName = normalizeExchangeText_(payload.receiverName);
  const note = normalizeExchangeText_(payload.note);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!requestId) throw new Error('กรุณาระบุ Request ID');
  if (!receiverName) throw new Error('กรุณาระบุผู้รับผ้า');

  const request = getExchangeRequestById_(requestId);
  if ([EXCHANGE_STATUSES.issued_waiting_receipt, EXCHANGE_STATUSES.partial_issued].indexOf(request.header.status) === -1) {
    throw new Error('ใบเบิกนี้ยังไม่อยู่ในสถานะรอรับผ้า');
  }

  if (lines.length) {
    const lineSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.line, EXCHANGE_HEADERS.ExchangeRequestLine);
    const lineHeaderIndex = indexExchangeHeaders_(ensureExchangeHeaders_(lineSheet, EXCHANGE_HEADERS.ExchangeRequestLine));
    const lineMap = {};
    request.lines.forEach(function(line) {
      lineMap[String(line.lineNo)] = line;
    });

    lines.forEach(function(line) {
      const target = lineMap[String(line.lineNo)];
      if (!target) return;
      const requestedQty = toExchangeNumber_(line.requestedQty, target.requestedQty);
      const actualReceivedQty = toExchangeNumber_(line.issuedQty, target.issuedQty);
      if (actualReceivedQty < 0 || actualReceivedQty > requestedQty) {
        throw new Error('จำนวนรับจริงต้องอยู่ระหว่าง 0 ถึงจำนวนที่ขอเบิก');
      }
      const outstandingQty = Math.max(requestedQty - actualReceivedQty, 0);
      setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Issued Qty', actualReceivedQty);
      setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Outstanding Qty', outstandingQty);
      if (Object.prototype.hasOwnProperty.call(line, 'receivedQty')) {
        setExchangeCell_(lineSheet, target.rowIndex, lineHeaderIndex, 'Laundry Received Qty', toExchangeNumber_(line.receivedQty, target.laundryReceivedQty));
      }
    });
  }

  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const headerIndex = indexExchangeHeaders_(ensureExchangeHeaders_(headerSheet, EXCHANGE_HEADERS.ExchangeRequestHeader));
  const now = formatExchangeDate_(new Date());

  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Ward Receiver Name', receiverName);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Ward Received At', now);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Status', EXCHANGE_STATUSES.completed);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated At', now);
  setExchangeCell_(headerSheet, request.header.rowIndex, headerIndex, 'Last Updated By', receiverName);

  appendExchangeStatusLog_(requestId, request.header.requestNo, request.header.status, EXCHANGE_STATUSES.completed, request.header.ward, receiverName, 'confirm_receipt', note);

  return {
    status: 'success',
    message: 'หน่วยงานลงรับผ้าเรียบร้อยแล้ว',
    data: { requestId, status: EXCHANGE_STATUSES.completed }
  };
}

function getExchangeRequests_() {
  const headerSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.header, EXCHANGE_HEADERS.ExchangeRequestHeader);
  const lineSheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.line, EXCHANGE_HEADERS.ExchangeRequestLine);
  const headers = readExchangeRows_(headerSheet);
  const lines = readExchangeRows_(lineSheet);
  const groupedLines = {};

  lines.forEach(line => {
    const requestId = normalizeExchangeText_(line['Request ID']);
    if (!groupedLines[requestId]) groupedLines[requestId] = [];
    groupedLines[requestId].push(mapExchangeLineRow_(line));
  });

  return headers.map(header => ({
    header: mapExchangeHeaderRow_(header),
    lines: groupedLines[normalizeExchangeText_(header['Request ID'])] || []
  }));
}

function getExchangeRequestById_(requestId) {
  const request = getExchangeRequests_().find(entry => entry.header.requestId === requestId);
  if (!request) throw new Error('ไม่พบใบเบิก');
  return request;
}

function mapExchangeRequestSummary_(request) {
  const totalRequested = request.lines.reduce((sum, line) => sum + line.requestedQty, 0);
  const totalIssued = request.lines.reduce((sum, line) => sum + line.issuedQty, 0);
  const totalOutstanding = request.lines.reduce((sum, line) => sum + line.outstandingQty, 0);
  return {
    requestId: request.header.requestId,
    requestNo: request.header.requestNo,
    requestDate: request.header.requestDate,
    ward: request.header.ward,
    shift: request.header.shift,
    status: request.header.status,
    requesterName: request.header.requesterName,
    submittedAt: request.header.submittedAt,
    updatedAt: request.header.lastUpdatedAt,
    totalRequested,
    totalIssued,
    totalOutstanding
  };
}

function mapExchangeRequestDetail_(request) {
  return {
    header: {
      requestId: request.header.requestId,
      requestNo: request.header.requestNo,
      requestDate: request.header.requestDate,
      ward: request.header.ward,
      shift: request.header.shift,
      status: request.header.status,
      requesterName: request.header.requesterName,
      requesterSignature: request.header.requesterSignature,
      submittedAt: request.header.submittedAt,
      laundryReceiverName: request.header.laundryReceiverName,
      laundryReceivedAt: request.header.laundryReceivedAt,
      laundryIssuerName: request.header.laundryIssuerName,
      laundryIssuedAt: request.header.laundryIssuedAt,
      wardReceiverName: request.header.wardReceiverName,
      wardReceivedAt: request.header.wardReceivedAt,
      lastUpdatedAt: request.header.lastUpdatedAt,
      lastUpdatedBy: request.header.lastUpdatedBy
    },
    lines: request.lines.map(line => ({
      lineNo: line.lineNo,
      itemName: line.itemName,
      mainCategory: line.mainCategory,
      parLevel: line.parLevel,
      stockBalance: line.stockBalance,
      sentLaundryQty: line.sentLaundryQty,
      suggestedQty: line.suggestedQty,
      requestedQty: line.requestedQty,
      wardNote: line.wardNote,
      laundryReceivedQty: line.laundryReceivedQty,
      issuedQty: line.issuedQty,
      outstandingQty: line.outstandingQty,
      laundryNote: line.laundryNote
    }))
  };
}

function mapExchangeHeaderRow_(row) {
  return {
    rowIndex: row._rowIndex,
    requestId: normalizeExchangeText_(row['Request ID']),
    requestNo: normalizeExchangeText_(row['Request No']),
    requestDate: normalizeExchangeText_(row['Request Date']),
    ward: normalizeExchangeText_(row['Ward']),
    shift: normalizeExchangeText_(row['Shift']),
    status: normalizeExchangeText_(row['Status']),
    requesterName: normalizeExchangeText_(row['Requester Name']),
    requesterSignature: normalizeExchangeText_(row['Requester Signature']),
    submittedAt: normalizeExchangeText_(row['Submitted At']),
    laundryReceiverName: normalizeExchangeText_(row['Laundry Receiver Name']),
    laundryReceivedAt: normalizeExchangeText_(row['Laundry Received At']),
    laundryIssuerName: normalizeExchangeText_(row['Laundry Issuer Name']),
    laundryIssuedAt: normalizeExchangeText_(row['Laundry Issued At']),
    wardReceiverName: normalizeExchangeText_(row['Ward Receiver Name']),
    wardReceivedAt: normalizeExchangeText_(row['Ward Received At']),
    lastUpdatedAt: normalizeExchangeText_(row['Last Updated At']),
    lastUpdatedBy: normalizeExchangeText_(row['Last Updated By'])
  };
}

function mapExchangeLineRow_(row) {
  return {
    rowIndex: row._rowIndex,
    requestId: normalizeExchangeText_(row['Request ID']),
    lineNo: toExchangeNumber_(row['Line No']),
    itemName: normalizeExchangeText_(row['Cloth Item']),
    mainCategory: normalizeExchangeText_(row['Main Category']),
    parLevel: toExchangeNumber_(row['Par Level']),
    stockBalance: toExchangeNumber_(row['Stock Balance']),
    sentLaundryQty: toExchangeNumber_(row['Sent Laundry Qty']),
    suggestedQty: toExchangeNumber_(row['Suggested Qty']),
    requestedQty: toExchangeNumber_(row['Requested Qty']),
    wardNote: normalizeExchangeText_(row['Ward Note']),
    laundryReceivedQty: toExchangeNumber_(row['Laundry Received Qty']),
    issuedQty: toExchangeNumber_(row['Issued Qty']),
    outstandingQty: toExchangeNumber_(row['Outstanding Qty']),
    laundryNote: normalizeExchangeText_(row['Laundry Note'])
  };
}

function normalizeSubmittedLine_(line, lineNo) {
  const parLevel = toExchangeNumber_(line.parLevel);
  const stockBalance = toExchangeNumber_(line.stockBalance);
  const sentLaundryQty = toExchangeNumber_(line.sentLaundryQty);
  const suggestedQty = Math.max(parLevel - stockBalance, 0);
  const requestedQty = toExchangeNumber_(line.requestedQty);

  return {
    lineNo,
    itemName: normalizeExchangeText_(line.itemName),
    mainCategory: normalizeExchangeText_(line.mainCategory),
    parLevel,
    stockBalance,
    sentLaundryQty,
    suggestedQty,
    requestedQty,
    wardNote: normalizeExchangeText_(line.wardNote)
  };
}

function buildExchangeRequestNo_() {
  const today = Utilities.formatDate(new Date(), EXCHANGE_CONFIG.timeZone, 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const key = `EXCHANGE_REQ_SEQ_${today}`;
  const next = Number(props.getProperty(key) || '0') + 1;
  props.setProperty(key, String(next));
  return `CL-REQ-${today}-${('000' + next).slice(-3)}`;
}

function appendExchangeStatusLog_(requestId, requestNo, fromStatus, toStatus, actorWard, actorName, action, note) {
  const sheet = getExchangeSheet_(EXCHANGE_CONFIG.sheets.statusLog, EXCHANGE_HEADERS.ExchangeStatusLog);
  appendExchangeRow_(sheet, EXCHANGE_HEADERS.ExchangeStatusLog, {
    'Timestamp': formatExchangeDate_(new Date()),
    'Request ID': requestId,
    'Request No': requestNo,
    'From Status': fromStatus,
    'To Status': toStatus,
    'Actor Ward': actorWard,
    'Actor Name': actorName,
    'Action': action,
    'Note': note
  });
}

function getExchangeSpreadsheet_() {
  if (EXCHANGE_CONFIG.exchangeSpreadsheetId) {
    return SpreadsheetApp.openById(EXCHANGE_CONFIG.exchangeSpreadsheetId);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบ Spreadsheet ปลายทางของระบบแลกผ้า');
  return ss;
}

function getStockReferenceSpreadsheet_() {
  if (EXCHANGE_CONFIG.stockReferenceSpreadsheetId) {
    return SpreadsheetApp.openById(EXCHANGE_CONFIG.stockReferenceSpreadsheetId);
  }
  return getExchangeSpreadsheet_();
}

function getExchangeSheet_(sheetName, headers) {
  const ss = getExchangeSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  ensureExchangeHeaders_(sheet, headers);
  return sheet;
}

function getStockReferenceSheet_(sheetName) {
  const ss = getStockReferenceSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบชีต ${sheetName} ในแหล่งข้อมูลอ้างอิง`);
  return sheet;
}

function ensureExchangeHeaders_(sheet, expectedHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const row = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existing = row.filter(Boolean);

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

function readExchangeRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map((row, index) => {
      const item = { _rowIndex: index + 2 };
      headers.forEach((header, colIndex) => {
        item[header] = row[colIndex];
      });
      return item;
    });
}

function appendExchangeRow_(sheet, headers, rowObject) {
  const finalHeaders = ensureExchangeHeaders_(sheet, headers);
  const row = finalHeaders.map(header => Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '');
  sheet.appendRow(row);
}

function setExchangeCell_(sheet, rowIndex, headerIndex, headerName, value) {
  const colIndex = headerIndex[headerName];
  if (!colIndex) return;
  sheet.getRange(rowIndex, colIndex).setValue(value);
}

function indexExchangeHeaders_(headers) {
  return headers.reduce((acc, header, index) => {
    if (header) acc[header] = index + 1;
    return acc;
  }, {});
}

function getExchangePayload_(e, method) {
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return (e && e.parameter) ? e.parameter : {};
}

function jsonExchange_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isActiveMasterRow_(row) {
  const value = normalizeExchangeText_(row['เปิดใช้งาน']).toLowerCase();
  return value === '' || ['true', '1', 'yes', 'y', 'ใช่'].indexOf(value) !== -1;
}

function parseExchangeDate_(value) {
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

function formatExchangeDate_(date) {
  return Utilities.formatDate(date, EXCHANGE_CONFIG.timeZone, 'dd/MM/yyyy HH:mm:ss');
}

function normalizeExchangeText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function toExchangeNumber_(value, fallback) {
  if (typeof fallback === 'undefined') fallback = 0;
  if (typeof value === 'number') return isNaN(value) ? fallback : value;
  const text = normalizeExchangeText_(value).replace(/,/g, '');
  if (!text) return fallback;
  const num = Number(text);
  return isNaN(num) ? fallback : num;
}

function normalizeExchangeStatus_(value) {
  return normalizeExchangeText_(value).toLowerCase();
}

function uniqueExchange_(items) {
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

// ==========================================
// ส่วนรายงาน STOCK เครื่องผ้าหน่วยงาน
// ==========================================

function getWardStockReport_(payload) {
  const selectedWard = normalizeExchangeText_(payload && payload.ward);
  const reportSheet = getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster);
  const masterRows = readExchangeRows_(reportSheet).filter(isActiveMasterRow_);
  const wards = getReportableWardList_(masterRows);
  const isAllWards = !selectedWard || normalizeExchangeStatus_(selectedWard) === 'all';

  if (!isAllWards && wards.indexOf(selectedWard) === -1) {
    throw new Error('ไม่พบหน่วยงานที่เลือกใน ClothMaster');
  }

  const targetWards = (isAllWards ? wards.filter(ward => ward !== 'สงฆ์อาพาธ') : [selectedWard]);
  const selectedRows = masterRows.filter(row => {
    const ward = normalizeExchangeText_(row['หน่วยงาน']);
    if (targetWards.indexOf(ward) === -1) return false;
    if (!isAllWards) return true;

    const mainCategory = normalizeExchangeText_(row['หมวดหมู่หลัก']);
    return mainCategory !== 'พระ';
  });
  const bedSetting = getWardBedSettingsMap_(true);
  const itemMap = {};
  const wardMap = {};

  selectedRows.forEach(row => {
    const ward = normalizeExchangeText_(row['หน่วยงาน']);
    const itemName = normalizeExchangeText_(row['ชื่อรายการผ้า']);
    if (!ward || !itemName) return;

    const itemKey = normalizeExchangeStatus_(itemName);
    const mainCategory = normalizeExchangeText_(row['หมวดหมู่หลัก']) || itemName;
    const qty = toExchangeNumber_(row['ยอดมาตรฐาน (Par)'], 0);

    if (!itemMap[itemKey]) {
      itemMap[itemKey] = {
        key: itemKey,
        itemName,
        mainCategory
      };
    }

    if (!wardMap[ward]) {
      const configuredBedCount = Object.prototype.hasOwnProperty.call(bedSetting.map, ward)
        ? toExchangeNumber_(bedSetting.map[ward], 0)
        : 0;
      wardMap[ward] = {
        ward,
        bedCount: configuredBedCount,
        items: {},
        totalStock: 0
      };
    }

    wardMap[ward].items[itemKey] = (wardMap[ward].items[itemKey] || 0) + qty;
    wardMap[ward].totalStock += qty;
  });

  const items = Object.keys(itemMap)
    .map(key => itemMap[key])
    .sort((a, b) => a.mainCategory.localeCompare(b.mainCategory, 'th') || a.itemName.localeCompare(b.itemName, 'th'));

  const summaryByItem = items.map(item => ({
    key: item.key,
    itemName: item.itemName,
    mainCategory: item.mainCategory,
    totalStock: targetWards.reduce((sum, ward) => {
      const wardEntry = wardMap[ward];
      return sum + (wardEntry && wardEntry.items[item.key] ? wardEntry.items[item.key] : 0);
    }, 0)
  }));

  const rows = targetWards.map(ward => {
    const wardEntry = wardMap[ward] || {
      ward,
      bedCount: Object.prototype.hasOwnProperty.call(bedSetting.map, ward) ? toExchangeNumber_(bedSetting.map[ward], 0) : 0,
      items: {},
      totalStock: 0
    };
    return {
      ward: wardEntry.ward,
      bedCount: wardEntry.bedCount,
      totalStock: wardEntry.totalStock,
      items: items.reduce((acc, item) => {
        acc[item.key] = wardEntry.items[item.key] || 0;
        return acc;
      }, {}),
      itemRates: items.reduce((acc, item) => {
        const stockQty = wardEntry.items[item.key] || 0;
        acc[item.key] = wardEntry.bedCount > 0 ? stockQty / wardEntry.bedCount : null;
        return acc;
      }, {})
    };
  });

  const totalBeds = rows.reduce((sum, row) => sum + toExchangeNumber_(row.bedCount, 0), 0);
  const totalStock = rows.reduce((sum, row) => sum + toExchangeNumber_(row.totalStock, 0), 0);
  const wardsMissingBedCount = targetWards.filter(ward => !toExchangeNumber_(bedSetting.map[ward], 0));

  return {
    status: 'success',
    data: {
      selectedWard: isAllWards ? 'all' : selectedWard,
      generatedAt: formatExchangeDate_(new Date()),
      wardOptions: wards,
      usageRateLabel: 'Stock/เตียง',
      items: items,
      rows: rows,
      summary: {
        totalWards: rows.length,
        totalBeds: totalBeds,
        totalStock: totalStock,
        byItem: summaryByItem.map(item => ({
          key: item.key,
          itemName: item.itemName,
          mainCategory: item.mainCategory,
          totalStock: item.totalStock,
          usageRate: totalBeds > 0 ? item.totalStock / totalBeds : null
        }))
      },
      bedConfig: {
        sheetName: EXCHANGE_CONFIG.sheets.wardBedSettings,
        headers: EXCHANGE_HEADERS.WardBedSettings.slice(),
        configuredWards: Object.keys(bedSetting.map).sort((a, b) => a.localeCompare(b, 'th')),
        missingWards: wardsMissingBedCount,
        note: 'กรอกจำนวนเตียง 1 แถวต่อ 1 หน่วยงานในชีต WardBedSettings เพื่อให้ระบบคำนวณอัตราเบิกใช้เป็น Stock/เตียง'
      }
    }
  };
}

function updateWardStockLevels_(payload) {
  const ward = normalizeExchangeText_(payload && payload.ward);
  const itemsInput = Array.isArray(payload && payload.items) ? payload.items : [];

  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  if (!itemsInput.length) throw new Error('ไม่พบรายการที่ต้องการบันทึก');

  const sheet = getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster);
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const wardHeader = findSheetHeaderName_(headers, ['หน่วยงาน', 'Ward']);
  const itemHeader = findSheetHeaderName_(headers, ['ชื่อรายการผ้า', 'Cloth Item']);
  const categoryHeader = findSheetHeaderName_(headers, ['หมวดหมู่หลัก', 'Category', 'Main Category']);
  const parHeader = findSheetHeaderName_(headers, ['ยอดมาตรฐาน (Par)', 'Par Level', 'Par']);

  if (!wardHeader || !itemHeader || !parHeader) {
    throw new Error('ไม่พบคอลัมน์หลักในชีต ClothMaster');
  }

  const normalizedItems = itemsInput.map((item, index) => ({
    itemName: normalizeExchangeText_(item.itemName),
    mainCategory: normalizeExchangeText_(item.mainCategory) || normalizeExchangeText_(item.itemName),
    parLevel: toExchangeNumber_(item.parLevel, -1),
    lineNo: index + 1
  }));

  normalizedItems.forEach(item => {
    if (!item.itemName) throw new Error(`ไม่พบชื่อรายการลำดับที่ ${item.lineNo}`);
    if (item.parLevel < 0) throw new Error(`จำนวน STOCK ของ ${item.itemName} ต้องไม่ติดลบ`);
  });

  const headerIndex = indexExchangeHeaders_(headers);
  const existingRows = readExchangeRows_(sheet)
    .filter(row => normalizeExchangeText_(row[wardHeader]) === ward);
  const itemRowMap = {};

  existingRows.forEach(row => {
    const itemKey = normalizeExchangeStatus_(row[itemHeader]);
    if (itemKey && !itemRowMap[itemKey]) {
      itemRowMap[itemKey] = row;
    }
  });

  normalizedItems.forEach(item => {
    const itemKey = normalizeExchangeStatus_(item.itemName);
    const existingRow = itemRowMap[itemKey];
    if (existingRow) {
      setExchangeCell_(sheet, existingRow._rowIndex, headerIndex, parHeader, item.parLevel);
      if (categoryHeader && item.mainCategory) {
        setExchangeCell_(sheet, existingRow._rowIndex, headerIndex, categoryHeader, item.mainCategory);
      }
      return;
    }

    const newRow = new Array(headers.length).fill('');
    newRow[headerIndex[wardHeader] - 1] = ward;
    newRow[headerIndex[itemHeader] - 1] = item.itemName;
    if (categoryHeader) newRow[headerIndex[categoryHeader] - 1] = item.mainCategory || item.itemName;
    newRow[headerIndex[parHeader] - 1] = item.parLevel;
    sheet.appendRow(newRow);
  });

  return {
    status: 'success',
    message: 'บันทึก STOCK ของหน่วยงานเรียบร้อยแล้ว'
  };
}

function getReportableWardList_(masterRows) {
  return uniqueExchange_(masterRows
    .map(row => normalizeExchangeText_(row['หน่วยงาน']))
    .filter(ward => ward && ward !== 'ซักฟอก'));
}

function getWardBedSettingsMap_(createIfMissing) {
  const sheet = getWardBedSettingsSheet_(createIfMissing);
  if (!sheet) return { map: {} };

  ensureWardBedSettingsSheet_(sheet);
  const rows = readExchangeRows_(sheet);
  const result = {};

  rows.forEach(row => {
    const ward = normalizeExchangeText_(row['หน่วยงาน']);
    if (!ward) return;

    const activeValue = normalizeExchangeStatus_(row['เปิดใช้งาน']);
    if (activeValue && ['false', '0', 'no', 'n', 'ไม่'].indexOf(activeValue) !== -1) return;

    result[ward] = toExchangeNumber_(row['จำนวนเตียง'], 0);
  });

  return { map: result };
}

function getWardBedSettingsSheet_(createIfMissing) {
  const ss = getStockReferenceSpreadsheet_();
  let sheet = ss.getSheetByName(EXCHANGE_CONFIG.sheets.wardBedSettings);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(EXCHANGE_CONFIG.sheets.wardBedSettings);
  }
  return sheet;
}

function ensureWardBedSettingsSheet_(sheet) {
  if (!sheet) return EXCHANGE_HEADERS.WardBedSettings.slice();
  return ensureExchangeHeaders_(sheet, EXCHANGE_HEADERS.WardBedSettings);
}
// ==========================================
// ส่วนที่ 1: การจัดการคำขอเพิ่ม Stock
// ==========================================

// 1. ส่งคำขอเพิ่ม Stock (จากหน่วยงาน)
function submitStockRequest(payload) {
  const ward = normalizeExchangeText_(payload.ward);
  const reason = normalizeExchangeText_(payload.reason);
  const itemsInput = Array.isArray(payload.items) && payload.items.length ? payload.items : [payload];

  if (!ward) throw new Error('กรุณาระบุหน่วยงาน');
  if (!reason) throw new Error('กรุณาระบุเหตุผลการขอปรับปรุง');

  const items = itemsInput.map((item, index) => normalizeStockRequestItem_(item, index + 1));
  if (!items.length) throw new Error('กรุณาเลือกรายการอย่างน้อย 1 รายการ');

  const sheet = getStockRequestSheet_(true);
  ensureStockRequestSheet_(sheet);

  const timestamp = formatExchangeDate_(new Date());
  const requestIds = [];

  items.forEach((item, index) => {
    const requestId = buildStockRequestId_(index + 1);
    appendExchangeRow_(sheet, EXCHANGE_HEADERS.StockRequests, {
      'Request ID': requestId,
      'Requested At': timestamp,
      'Ward': ward,
      'Item Name': item.itemName,
      'Main Category': item.mainCategory,
      'Requested Par': item.requestedPar,
      'Reason': reason,
      'Status': 'pending',
      'Approved By': '',
      'Updated At': timestamp,
      'Current Par': item.currentPar,
      'Request Type': item.requestType,
      'Approved At': ''
    });
    requestIds.push(requestId);
  });

  return {
    status: 'success',
    message: 'ส่งคำขอปรับปรุง Stock เรียบร้อยแล้ว',
    data: {
      count: requestIds.length,
      requestIds
    }
  };
}

// 2. ดึงรายการคำขอ (สำหรับซักฟอก และ หน่วยงาน)
function getStockRequests(payload) {
  const ward = normalizeExchangeText_(payload && payload.ward);
  const sheet = getStockRequestSheet_(false);
  if (!sheet) return { status: 'success', data: [] };

  ensureStockRequestSheet_(sheet);
  let requests = readExchangeRows_(sheet)
    .map(mapStockRequestRow_)
    .filter(row => row.requestId);

  if (ward) {
    requests = requests.filter(row => row.ward === ward);
  } else {
    requests = requests.filter(row => row.status === 'pending');
  }

  requests.sort((a, b) => parseExchangeDate_(b.updatedAt || b.requestedAt) - parseExchangeDate_(a.updatedAt || a.requestedAt));
  return { status: 'success', data: requests };
}

// 3. อนุมัติ/ปฏิเสธ คำขอ (จากซักฟอก)
function processStockRequest(payload) {
  const requestId = normalizeExchangeText_(payload.reqId || payload.requestId);
  const action = normalizeExchangeStatus_(payload.action || payload.decision);
  const adminName = normalizeExchangeText_(payload.adminName) || 'Laundry';

  if (!requestId) throw new Error('กรุณาระบุรหัสคำขอ');
  if (['approve', 'reject', 'rejected'].indexOf(action) === -1) throw new Error('รูปแบบการอนุมัติไม่ถูกต้อง');

  const sheet = getStockRequestSheet_(false);
  if (!sheet) throw new Error('ไม่พบชีต StockRequests');

  const headerIndex = indexExchangeHeaders_(ensureStockRequestSheet_(sheet));
  const request = readExchangeRows_(sheet)
    .map(mapStockRequestRow_)
    .find(row => row.requestId === requestId);

  if (!request) throw new Error('ไม่พบข้อมูลคำขอ');
  if (request.status !== 'pending') throw new Error('คำขอนี้ถูกดำเนินการแล้ว');

  if (action === 'approve') {
    applyApprovedStockRequestToClothMaster_(request);
  }

  const now = formatExchangeDate_(new Date());
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  setExchangeCell_(sheet, request.rowIndex, headerIndex, 'Status', nextStatus);
  setExchangeCell_(sheet, request.rowIndex, headerIndex, 'Approved By', adminName);
  setExchangeCell_(sheet, request.rowIndex, headerIndex, 'Approved At', now);
  setExchangeCell_(sheet, request.rowIndex, headerIndex, 'Updated At', now);

  return {
    status: 'success',
    message: action === 'approve'
      ? 'อนุมัติคำขอและอัปเดต ClothMaster เรียบร้อยแล้ว'
      : 'ปฏิเสธคำขอเรียบร้อยแล้ว'
  };
}

function getStockRequestSheet_(createIfMissing) {
  const ss = SpreadsheetApp.openById(EXCHANGE_CONFIG.exchangeSpreadsheetId);
  let sheet = ss.getSheetByName('StockRequests');
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet('StockRequests');
  }
  return sheet;
}

function ensureStockRequestSheet_(sheet) {
  if (!sheet) return EXCHANGE_HEADERS.StockRequests.slice();

  const lastRow = sheet.getLastRow();
  if (!lastRow) {
    sheet.getRange(1, 1, 1, EXCHANGE_HEADERS.StockRequests.length).setValues([EXCHANGE_HEADERS.StockRequests]);
    sheet.setFrozenRows(1);
    return EXCHANGE_HEADERS.StockRequests.slice();
  }

  const lastColumn = Math.max(sheet.getLastColumn(), EXCHANGE_HEADERS.StockRequests.length, 1);
  const firstRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalizeExchangeText_);
  if (firstRow.indexOf('Request ID') === -1) {
    sheet.insertRows(1, 1);
    sheet.getRange(1, 1, 1, EXCHANGE_HEADERS.StockRequests.length).setValues([EXCHANGE_HEADERS.StockRequests]);
    sheet.setFrozenRows(1);
    return EXCHANGE_HEADERS.StockRequests.slice();
  }

  return ensureExchangeHeaders_(sheet, EXCHANGE_HEADERS.StockRequests);
}

function normalizeStockRequestItem_(item, lineNo) {
  const itemName = normalizeExchangeText_(item.itemName || item.name);
  const mainCategory = normalizeExchangeText_(item.mainCategory || item.category) || itemName;
  const currentPar = toExchangeNumber_(item.currentPar, 0);
  const requestedPar = toExchangeNumber_(item.requestedPar, currentPar);
  const requestType = normalizeExchangeStatus_(item.requestType || (currentPar > 0 ? 'update' : 'new')) || 'update';

  if (!itemName) throw new Error(`ไม่พบชื่อรายการผ้าลำดับที่ ${lineNo}`);
  if (requestedPar < 0) throw new Error(`จำนวนที่ขอปรับปรุงของรายการ ${itemName} ต้องไม่ติดลบ`);
  if (requestType === 'new' && requestedPar <= 0) {
    throw new Error(`รายการใหม่ ${itemName} ต้องระบุจำนวนมากกว่า 0`);
  }

  return {
    itemName,
    mainCategory,
    currentPar,
    requestedPar,
    requestType
  };
}

function mapStockRequestRow_(row) {
  return {
    rowIndex: row._rowIndex,
    requestId: normalizeExchangeText_(row['Request ID']),
    requestedAt: normalizeExchangeText_(row['Requested At']),
    ward: normalizeExchangeText_(row['Ward']),
    itemName: normalizeExchangeText_(row['Item Name']),
    mainCategory: normalizeExchangeText_(row['Main Category']),
    requestedPar: toExchangeNumber_(row['Requested Par']),
    reason: normalizeExchangeText_(row['Reason']),
    status: normalizeExchangeStatus_(row['Status']) || 'pending',
    approvedBy: normalizeExchangeText_(row['Approved By']),
    approvedAt: normalizeExchangeText_(row['Approved At']),
    updatedAt: normalizeExchangeText_(row['Updated At']),
    currentPar: toExchangeNumber_(row['Current Par']),
    requestType: normalizeExchangeStatus_(row['Request Type']) || (toExchangeNumber_(row['Current Par']) > 0 ? 'update' : 'new')
  };
}

function buildStockRequestId_(offset) {
  return `STK-${new Date().getTime()}-${offset}`;
}

function applyApprovedStockRequestToClothMaster_(request) {
  const sheet = getStockReferenceSheet_(EXCHANGE_CONFIG.sheets.clothMaster);
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const wardHeader = findSheetHeaderName_(headers, ['หน่วยงาน', 'Ward']);
  const itemHeader = findSheetHeaderName_(headers, ['ชื่อรายการผ้า', 'Cloth Item']);
  const categoryHeader = findSheetHeaderName_(headers, ['หมวดหมู่หลัก', 'Category', 'Main Category']);
  const parHeader = findSheetHeaderName_(headers, ['ยอดมาตรฐาน (Par)', 'Par Level', 'Par']);

  if (!wardHeader || !itemHeader || !parHeader) {
    throw new Error('ไม่พบคอลัมน์หลักในชีต ClothMaster');
  }

  const headerIndex = indexExchangeHeaders_(headers);
  const rows = readExchangeRows_(sheet);
  const existingRow = rows.find(row =>
    normalizeExchangeText_(row[wardHeader]) === request.ward &&
    normalizeExchangeText_(row[itemHeader]) === request.itemName
  );

  if (existingRow) {
    setExchangeCell_(sheet, existingRow._rowIndex, headerIndex, parHeader, request.requestedPar);
    if (categoryHeader && request.mainCategory) {
      setExchangeCell_(sheet, existingRow._rowIndex, headerIndex, categoryHeader, request.mainCategory);
    }
    return;
  }

  const newRow = new Array(headers.length).fill('');
  newRow[headerIndex[wardHeader] - 1] = request.ward;
  newRow[headerIndex[itemHeader] - 1] = request.itemName;
  if (categoryHeader) newRow[headerIndex[categoryHeader] - 1] = request.mainCategory || request.itemName;
  newRow[headerIndex[parHeader] - 1] = request.requestedPar;
  sheet.appendRow(newRow);
}

function findSheetHeaderName_(headers, candidates) {
  for (let i = 0; i < candidates.length; i += 1) {
    if (headers.indexOf(candidates[i]) !== -1) return candidates[i];
  }
  return '';
}
