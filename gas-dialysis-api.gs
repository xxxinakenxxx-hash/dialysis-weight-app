const SHEET_DIALYSIS = '透析記録';
const SHEET_FLUID = '飲水記録';
const DIALYSIS_HEADERS = ['記録ID', '日付', 'ドライウェイトkg', '除水上限kg', '透析前kg', '透析後kg', 'メモ', '更新日時'];
const FLUID_HEADERS = ['記録ID', '日付', '時刻', '飲水量mL', 'メモ', '更新日時'];

function doPost(e) {
  try {
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!canWrite_(request.token)) return json_({ ok: false, error: 'write_denied' });

    if (request.action === 'syncAll') {
      syncDialysis_(request.dialysisRecords || []);
      syncFluid_(request.fluidRecords || []);
      return json_({
        ok: true,
        dialysisCount: request.dialysisRecords.length,
        fluidCount: request.fluidRecords.length,
        updatedAt: new Date().toISOString(),
      });
    }

    if (request.action === 'syncFluid') {
      syncFluid_(request.records || []);
      return json_({ ok: true, fluidCount: request.records.length });
    }

    if (request.action === 'syncDialysis') {
      syncDialysis_(request.records || []);
      return json_({ ok: true, dialysisCount: request.records.length });
    }

    return json_({ ok: false, error: 'unknown_action' });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet(e) {
  const params = e.parameter || {};
  if (!canRead_(params.token)) return output_(params.callback, { ok: false, error: 'read_denied' });

  const date = params.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const type = params.type || 'fluidTotal';

  if (type === 'fluidTotal') {
    return output_(params.callback, {
      date: date,
      totalMl: getFluidTotal_(date),
    });
  }

  if (type === 'latestDialysis') {
    return output_(params.callback, getLatestDialysis_());
  }

  if (type === 'summary') {
    return output_(params.callback, {
      date: date,
      fluidTotalMl: getFluidTotal_(date),
      latestDialysis: getLatestDialysis_(),
    });
  }

  return output_(params.callback, { ok: false, error: 'unknown_type' });
}

function syncDialysis_(records) {
  const rows = records.map(function(record) {
    return [
      text_(record.recordId),
      text_(record.date),
      number_(record.dryWeightKg),
      number_(record.maxRemovalKg),
      number_(record.preWeightKg),
      number_(record.postWeightKg),
      text_(record.note),
      text_(record.updatedAt),
    ];
  });
  replaceSheet_(SHEET_DIALYSIS, DIALYSIS_HEADERS, rows);
}

function syncFluid_(records) {
  const rows = records.map(function(record) {
    return [
      text_(record.recordId),
      text_(record.date),
      text_(record.time),
      number_(record.amountMl),
      text_(record.note),
      text_(record.updatedAt),
    ];
  });
  replaceSheet_(SHEET_FLUID, FLUID_HEADERS, rows);
}

function getFluidTotal_(date) {
  const sheet = getOrCreateSheet_(SHEET_FLUID, FLUID_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, FLUID_HEADERS.length).getValues();
  return values.reduce(function(sum, row) {
    return String(row[1]) === date ? sum + number_(row[3]) : sum;
  }, 0);
}

function getLatestDialysis_() {
  const sheet = getOrCreateSheet_(SHEET_DIALYSIS, DIALYSIS_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, DIALYSIS_HEADERS.length).getValues();
  values.sort(function(a, b) {
    return String(b[1]).localeCompare(String(a[1]));
  });

  const row = values[0];
  return {
    recordId: row[0],
    date: row[1],
    dryWeightKg: number_(row[2]),
    maxRemovalKg: number_(row[3]),
    preWeightKg: number_(row[4]),
    postWeightKg: number_(row[5]),
    updatedAt: row[7],
  };
}

function replaceSheet_(sheetName, headers, rows) {
  const sheet = getOrCreateSheet_(sheetName, headers);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function getOrCreateSheet_(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function canWrite_(token) {
  const saved = PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN') || '';
  return !saved || saved === String(token || '');
}

function canRead_(token) {
  const saved = PropertiesService.getScriptProperties().getProperty('READ_TOKEN') || '';
  return !saved || saved === String(token || '');
}

function output_(callback, data) {
  if (callback) {
    return ContentService
      .createTextOutput(String(callback) + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(data);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function number_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
