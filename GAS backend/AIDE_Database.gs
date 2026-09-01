var WARD_SOURCE_SPREADSHEET_ID_ = '1pI8Wnd6wyoxOcV_5uhMNMlgJKrGr3f0oWtPKx4f_Tbw';
var WARD_SOURCE_SHEET_NAME_ = 'Wards';

function doGet(e) {
  try {
    var wards = getWardList_();
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: wards
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error && error.message ? error.message : String(error)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getWardList_() {
  var spreadsheet = SpreadsheetApp.openById(WARD_SOURCE_SPREADSHEET_ID_);
  var sheet = spreadsheet.getSheetByName(WARD_SOURCE_SHEET_NAME_);
  if (!sheet) {
    throw new Error('ไม่พบชีต Wards ในไฟล์ต้นทาง');
  }

  var values = sheet.getDataRange().getDisplayValues();
  var seen = {};
  var wards = [];

  for (var i = 0; i < values.length; i++) {
    var wardName = String(values[i][0] || '').trim();
    if (!wardName) continue;
    if (/^wards?$/i.test(wardName) || /^หน่วยงาน$/.test(wardName)) continue;
    if (seen[wardName]) continue;
    seen[wardName] = true;
    wards.push(wardName);
  }

  wards.sort(function(a, b) {
    return a.localeCompare(b, 'th');
  });

  return wards;
}
