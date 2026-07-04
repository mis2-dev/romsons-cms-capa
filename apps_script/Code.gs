/************** CONFIG *****************/
const COMPLAINT_PARENT_FOLDER_ID = "1WgBU0ECmWWvX4CVtuSPzUY1NGqZgpXtS"; // Main parent folder where complaint-wise folders will be created
const BatchSheet = "1VtXeE9bvo-rBfXAgLfyfGWla9wylAwN3Ewgwi-XoYdo"; // legacy batch sheet

const COMPLAINT_SHEET_NAME = "Complaint";
const USER_SHEET_NAME = "UserDetails";
const ISSUE_MAIL_MAP_SHEET = "IssueMailMap";
const WA_LOG_SHEET_NAME = "WA_LOG";



/************** HTML INCLUDE HELPER *****************/
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/************** P1 MODULE ACCESS CONTROL *****************/
const CMS_ACCESS_HEADERS = [
  'Email','Name','Password','Role','Active',
  'Dashboard','Complaint Create','Complaint View','Complaint Edit',
  'QA Review','Info Request','Investigation','CAPA Upload','CAPA Verify',
  'Reports','User Management','Audit Log'
];

const CMS_MODULES = {
  DASHBOARD: 'Dashboard',
  COMPLAINT_CREATE: 'Complaint Create',
  COMPLAINT_VIEW: 'Complaint View',
  COMPLAINT_EDIT: 'Complaint Edit',
  QA_REVIEW: 'QA Review',
  INFO_REQUEST: 'Info Request',
  INVESTIGATION: 'Investigation',
  CAPA_UPLOAD: 'CAPA Upload',
  CAPA_VERIFY: 'CAPA Verify',
  REPORTS: 'Reports',
  USER_MANAGEMENT: 'User Management',
  AUDIT_LOG: 'Audit Log'
};

function normalizeAccessLevel_(value) {
  const v = String(value || '').trim().toUpperCase();
  if (['EDIT','VIEW','NONE'].indexOf(v) > -1) return v;
  if (['YES','TRUE','1','ALLOW','ALLOWED'].indexOf(v) > -1) return 'EDIT';
  if (['NO','FALSE','0','DENY','DENIED'].indexOf(v) > -1) return 'NONE';
  return '';
}

function defaultPermissionsForRole_(role) {
  const r = String(role || '').trim().toLowerCase();
  const all = {};
  Object.keys(CMS_MODULES).forEach(function(k){ all[CMS_MODULES[k]] = 'NONE'; });

  if (r === 'admin' || r === 'administrator' || r === 'super admin') {
    Object.keys(all).forEach(function(k){ all[k] = 'EDIT'; });
    return all;
  }
  if (r.indexOf('qa') > -1 || r.indexOf('quality') > -1) {
    all[CMS_MODULES.DASHBOARD] = 'VIEW';
    all[CMS_MODULES.COMPLAINT_CREATE] = 'EDIT';
    all[CMS_MODULES.COMPLAINT_VIEW] = 'VIEW';
    all[CMS_MODULES.COMPLAINT_EDIT] = 'EDIT';
    all[CMS_MODULES.QA_REVIEW] = 'EDIT';
    all[CMS_MODULES.INFO_REQUEST] = 'EDIT';
    all[CMS_MODULES.INVESTIGATION] = 'EDIT';
    all[CMS_MODULES.CAPA_UPLOAD] = 'EDIT';
    all[CMS_MODULES.CAPA_VERIFY] = 'VIEW';
    all[CMS_MODULES.REPORTS] = 'VIEW';
    all[CMS_MODULES.AUDIT_LOG] = 'VIEW';
    return all;
  }
  if (r.indexOf('sales') > -1) {
    all[CMS_MODULES.DASHBOARD] = 'VIEW';
    all[CMS_MODULES.COMPLAINT_CREATE] = 'EDIT';
    all[CMS_MODULES.COMPLAINT_VIEW] = 'VIEW';
    all[CMS_MODULES.COMPLAINT_EDIT] = 'EDIT';
    all[CMS_MODULES.INFO_REQUEST] = 'EDIT';
    all[CMS_MODULES.CAPA_VERIFY] = 'EDIT';
    all[CMS_MODULES.REPORTS] = 'VIEW';
    return all;
  }
  all[CMS_MODULES.DASHBOARD] = 'VIEW';
  all[CMS_MODULES.COMPLAINT_VIEW] = 'VIEW';
  return all;
}

function setupCmsAccessControl() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(USER_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(USER_SHEET_NAME);

  if (sh.getLastRow() === 0) sh.appendRow(CMS_ACCESS_HEADERS);
  const existingHeaders = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),4)).getValues()[0].map(String);
  CMS_ACCESS_HEADERS.forEach(function(h){
    if (existingHeaders.indexOf(h) === -1) {
      sh.getRange(1, sh.getLastColumn()+1).setValue(h);
      existingHeaders.push(h);
    }
  });

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const idx = {}; headers.forEach(function(h,i){ idx[h]=i; });
  for (let r=1; r<data.length; r++) {
    const role = data[r][idx.Role] || '';
    const defaults = defaultPermissionsForRole_(role);
    if (!String(data[r][idx.Active] || '').trim()) sh.getRange(r+1, idx.Active+1).setValue('Yes');
    Object.keys(defaults).forEach(function(moduleName){
      const c = idx[moduleName];
      if (c == null) return;
      if (!normalizeAccessLevel_(data[r][c])) sh.getRange(r+1,c+1).setValue(defaults[moduleName]);
    });
  }
  sh.setFrozenRows(1);
  return {status:'success', message:'CMS access-control foundation is ready'};
}

function getUserAccessByEmail_(email) {
  setupCmsAccessControl();
  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET_NAME);
  const data = sh.getDataRange().getValues();
  if (!data.length) return null;
  const headers = data[0].map(String);
  const ix = {}; headers.forEach(function(h,i){ ix[h]=i; });
  const target = String(email || '').trim().toLowerCase();
  for (let r=1; r<data.length; r++) {
    if (String(data[r][ix.Email] || '').trim().toLowerCase() !== target) continue;
    const role = String(data[r][ix.Role] || '').trim();
    const defaults = defaultPermissionsForRole_(role);
    const permissions = {};
    Object.keys(CMS_MODULES).forEach(function(k){
      const moduleName = CMS_MODULES[k];
      permissions[moduleName] = normalizeAccessLevel_(data[r][ix[moduleName]]) || defaults[moduleName] || 'NONE';
    });
    return {
      rowNo:r+1,
      email:String(data[r][ix.Email] || '').trim(),
      name:String(data[r][ix.Name] || '').trim(),
      role:role,
      active:String(data[r][ix.Active] || 'Yes').trim().toLowerCase() !== 'no',
      permissions:permissions
    };
  }
  return null;
}

function getCurrentUserAccess_() {
  const props = PropertiesService.getUserProperties();
  const email = props.getProperty('email');
  if (!email) throw new Error('Session expired. Please login again.');
  const user = getUserAccessByEmail_(email);
  if (!user || !user.active) throw new Error('User is inactive or no longer authorized.');
  return user;
}

function hasPermission_(user, moduleName, requiredLevel) {
  if (!user || !user.active) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin' || role === 'administrator' || role === 'super admin') return true;
  const actual = normalizeAccessLevel_(user.permissions && user.permissions[moduleName]) || 'NONE';
  if (requiredLevel === 'VIEW') return actual === 'VIEW' || actual === 'EDIT';
  return actual === 'EDIT';
}

function requirePermission_(moduleName, requiredLevel) {
  const user = getCurrentUserAccess_();
  if (!hasPermission_(user, moduleName, requiredLevel || 'VIEW')) {
    throw new Error('Access denied for module: ' + moduleName);
  }
  return user;
}

function getMyCmsAccess() {
  const u = getCurrentUserAccess_();
  return {status:'success', email:u.email, name:u.name, role:u.role, permissions:u.permissions};
}

function getCmsAccessUsers() {
  requirePermission_(CMS_MODULES.USER_MANAGEMENT, 'VIEW');
  setupCmsAccessControl();
  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET_NAME);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String); const ix={}; headers.forEach(function(h,i){ix[h]=i;});
  return data.slice(1).filter(function(r){return String(r[ix.Email]||'').trim();}).map(function(r,n){
    const role=String(r[ix.Role]||''); const defs=defaultPermissionsForRole_(role); const permissions={};
    Object.keys(CMS_MODULES).forEach(function(k){const m=CMS_MODULES[k]; permissions[m]=normalizeAccessLevel_(r[ix[m]])||defs[m]||'NONE';});
    return {rowNo:n+2,email:r[ix.Email]||'',name:r[ix.Name]||'',role:role,active:String(r[ix.Active]||'Yes').toLowerCase()!=='no',permissions:permissions};
  });
}

function saveCmsAccessUser(payload) {
  requirePermission_(CMS_MODULES.USER_MANAGEMENT, 'EDIT');
  setupCmsAccessControl();
  payload = payload || {};
  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET_NAME);
  const data = sh.getDataRange().getValues(); const headers=data[0].map(String); const ix={}; headers.forEach(function(h,i){ix[h]=i;});
  const email=String(payload.email||'').trim().toLowerCase();
  if (!email) throw new Error('User email is required');
  let rowNo=0;
  for(let r=1;r<data.length;r++){if(String(data[r][ix.Email]||'').trim().toLowerCase()===email){rowNo=r+1;break;}}
  if(!rowNo){rowNo=sh.getLastRow()+1; sh.getRange(rowNo,ix.Email+1).setValue(email);}
  if(payload.name!=null) sh.getRange(rowNo,ix.Name+1).setValue(payload.name);
  if(payload.password) sh.getRange(rowNo,ix.Password+1).setValue(payload.password);
  sh.getRange(rowNo,ix.Role+1).setValue(payload.role||'Viewer');
  sh.getRange(rowNo,ix.Active+1).setValue(payload.active===false?'No':'Yes');
  const perms=payload.permissions||{};
  Object.keys(CMS_MODULES).forEach(function(k){const m=CMS_MODULES[k]; if(ix[m]!=null) sh.getRange(rowNo,ix[m]+1).setValue(normalizeAccessLevel_(perms[m])||'NONE');});
  return {status:'success',message:'User rights saved',email:email};
}


/**
 * Complaint Sheet Columns
 * A  = Timestamp
 * B  = Complaint Date
 * C  = Batch No
 * D  = Item Name
 * E  = Complaint Severity
 * F  = Issues
 * G  = Subcategories
 * H  = RCA Future
 * I  = Complaint Received Through / User Name
 * J  = Customer Type
 * K  = Complaint Mode
 * L  = Customer Name / Location
 * M  = Address
 * N  = City
 * O  = Pincode
 * P  = Complaint Details
 * Q  = Image URLs
 * R  = Video URLs
 * S  = Complaint No
 * T  = State
 * U  = Qty Affected
 * V  = Sample Available
 * W  = PDF URL
 * X  = WhatsApp Status
 * Y  = WhatsApp Error
 * Z  = WhatsApp Message IDs
 * AA = WhatsApp Sent To
 * AB = Complaint Folder URL
 */
const COMPLAINT_COL = {
  TIMESTAMP: 1,
  COMPLAINT_DATE: 2,
  BATCH_NO: 3,
  ITEM_NAME: 4,
  SEVERITY: 5,
  ISSUES: 6,
  SUBCATEGORIES: 7,
  RCA: 8,
  USER_NAME: 9,
  CUSTOMER_TYPE: 10,
  COMPLAINT_MODE: 11,
  LOCATION: 12,
  ADDRESS: 13,
  CITY: 14,
  PINCODE: 15,
  COMPLAINT: 16,
  IMAGE_URLS: 17,
  VIDEO_URLS: 18,
  COMPLAINT_NO: 19,
  STATE: 20,
  QTY_AFFECTED: 21,
  SAMPLE_AVAILABLE: 22,
  PDF_URL: 23,
  WA_STATUS: 24,
  WA_ERROR: 25,
  WA_MESSAGE_IDS: 26,
  WA_SENT_TO: 27,
  FOLDER_URL: 28
};

/************** FAST BATCH LOOKUP *****************/
const BATCH_LOOKUP_CONFIG = {
  OUTPUT_SPREADSHEET_ID: '19xh_oXw852jJ7a86Wspq0bDiHkyVR2EISObHB67umr0',
  BATCH_COLUMN_NAME: 'BatchNo',
  PRODUCT_NAME_HEADERS: ['Product Name', 'ProductName', 'Item Name', 'ItemName', 'Prod Short Name', 'ProdShortName'],
  CACHE_SECONDS: 21600 // 6 hours
};

/************** ENTRY *****************/
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  // Public tracking page: no login required
  if (params.track) {
    return renderPublicTrackingPage_(params.track);
  }

  const tpl = HtmlService.createTemplateFromFile("index");
  tpl.CMS_UPDATE_COMPLAINT_NO = params.update || '';
  tpl.CMS_GOOGLE_MAPS_API_KEY = PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY') || '';

  return tpl.evaluate()
    .setTitle("ROMSONS CMS")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/************** COMMON HELPERS *****************/
function getComplaintSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(COMPLAINT_SHEET_NAME);
  if (!sh) throw new Error('Complaint sheet not found: ' + COMPLAINT_SHEET_NAME);
  return sh;
}

function safeText_(v, fallback) {
  const s = String(v == null ? '' : v).trim();
  return s || (fallback || 'NA');
}

function cleanPhone_(v) {
  return String(v || '').replace(/\D/g, '').trim();
}

function splitPhones_(s) {
  return String(s || '')
    .split(/[;,]/g)
    .map(function(x) { return cleanPhone_(x); })
    .filter(Boolean);
}

function toDateObject_(v, isDateOnly) {
  if (!v) return null;

  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v)) {
    return v;
  }

  if (typeof v === "number") {
    const dNum = new Date(v);
    return isNaN(dNum) ? null : dNum;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    if (isDateOnly && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const dOnly = new Date(s + "T00:00:00");
      return isNaN(dOnly) ? null : dOnly;
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  return null;
}

function formatSafeDate(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy hh:mm:ss a");
}

function splitEmails(s) {
  return (s || "")
    .split(/[;,]/g)
    .map(function(x) { return x.trim(); })
    .filter(Boolean);
}

function uniqEmails(list) {
  const seen = {};
  const out = [];
  (list || []).forEach(function(e) {
    const k = String(e || '').trim().toLowerCase();
    if (k && !seen[k]) {
      seen[k] = true;
      out.push(String(e).trim());
    }
  });
  return out;
}

function uniqPhones_(list) {
  const seen = {};
  const out = [];
  (list || []).forEach(function(n) {
    const k = cleanPhone_(n);
    if (k && !seen[k]) {
      seen[k] = true;
      out.push(k);
    }
  });
  return out;
}

function getWebAppBaseUrl_() {
  const manualUrl = PropertiesService.getScriptProperties().getProperty('CMS_WEBAPP_URL');
  const serviceUrl = ScriptApp.getService().getUrl();
  return String(manualUrl || serviceUrl || '').trim();
}

function buildComplaintTrackerLink_(complaintNo) {
  const baseUrl = getWebAppBaseUrl_();
  if (!baseUrl) return '';
  return baseUrl + '?track=' + encodeURIComponent(String(complaintNo || '').trim());
}

function buildComplaintUpdateLink_(complaintNo) {
  const baseUrl = getWebAppBaseUrl_();
  if (!baseUrl) return '';
  return baseUrl + '?update=' + encodeURIComponent(String(complaintNo || '').trim());
}

function generateCmsComplaintNo_(dt) {
  const d = dt || new Date();
  const tz = Session.getScriptTimeZone();
  const yy = Utilities.formatDate(d, tz, 'yy');
  const monthIndex = Number(Utilities.formatDate(d, tz, 'M')) - 1;
  const monthCode = 'ABCDEFGHIJKL'.charAt(Math.max(0, Math.min(11, monthIndex)));
  const dd = Utilities.formatDate(d, tz, 'dd');
  const hms = Utilities.formatDate(d, tz, 'HHmmss');
  const baseNo = 'CMS' + yy + monthCode + dd + hms;

  const props = PropertiesService.getDocumentProperties();
  const propKey = 'CMS_COMPLAINT_NO_' + baseNo;
  const count = Number(props.getProperty(propKey) || 0) + 1;
  props.setProperty(propKey, String(count));

  if (count === 1) return baseNo;
  if (count <= 26) return baseNo + String.fromCharCode(64 + count);
  return baseNo + count;
}

function escapeHtml_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/************** BATCH HELPERS *****************/
function getHeaderIndex_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx > -1) return idx;
  }
  return -1;
}

function getBatchLookupData(batchNo) {
  batchNo = String(batchNo || '').trim().toUpperCase();
  if (!batchNo) {
    return {
      found: false,
      message: 'Batch number required',
      batchNo: '',
      itemNames: [],
      itemName: '',
      hasMultipleItems: false,
      totalRecords: 0,
      rowNos: [],
      data: null,
      records: []
    };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'batchLookupV4::' + batchNo;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const result = findBatchDetailsFastV3(batchNo);

  if (!result || !result.found) {
    const notFound = {
      found: false,
      message: (result && result.message) || 'Batch not found',
      batchNo: batchNo,
      itemNames: [],
      itemName: '',
      hasMultipleItems: false,
      totalRecords: 0,
      rowNos: [],
      data: null,
      records: []
    };
    cache.put(cacheKey, JSON.stringify(notFound), 300);
    return notFound;
  }

  const records = Array.isArray(result.records) ? result.records : [];
  const itemNames = extractDistinctProductNames_(records);

  const response = {
    found: true,
    message: '',
    batchNo: batchNo,
    sheetName: result.sheetName || '',
    totalRecords: Number(result.totalRecords || records.length || 0),
    rowNos: Array.isArray(result.rowNos) ? result.rowNos : [],
    parsed: result.parsed || null,
    records: records,
    data: records.length ? records[0] : null,
    itemNames: itemNames,
    itemName: itemNames[0] || '',
    hasMultipleItems: itemNames.length > 1
  };

  cache.put(cacheKey, JSON.stringify(response), BATCH_LOOKUP_CONFIG.CACHE_SECONDS);
  return response;
}

function getItemNamesForBatch(batchNo) {
  const result = getBatchLookupData(batchNo);
  return (result && result.itemNames) ? result.itemNames : [];
}

function extractDistinctProductNames_(records) {
  const uniq = {};
  const out = [];

  (records || []).forEach(function(row) {
    const name = pickProductNameFromRow_(row);
    if (!name) return;

    const key = name.toUpperCase();
    if (!uniq[key]) {
      uniq[key] = true;
      out.push(name);
    }
  });

  return out;
}

function pickProductNameFromRow_(row) {
  row = row || {};
  return [
    row['Product Name'],
    row['ProductName'],
    row['Item Name'],
    row['ItemName'],
    row['Prod Short Name'],
    row['ProdShortName']
  ]
    .map(function(v) { return String(v || '').trim(); })
    .filter(Boolean)[0] || '';
}

/************************************************************
 * SEARCH
 ************************************************************/
function findBatchDetailsFastV3(batchNo) {
  batchNo = String(batchNo || '').trim().toUpperCase();
  if (!batchNo) throw new Error('Batch number required');

  const parsed = parseBatchNoV3_(batchNo);
  if (!parsed.valid) {
    return {
      found: false,
      message: 'Invalid batch format'
    };
  }

  const ss = SpreadsheetApp.openById(BATCH_LOOKUP_CONFIG.OUTPUT_SPREADSHEET_ID);
  const sheetName = parsed.sheetName;
  const sh = ss.getSheetByName(sheetName);

  if (!sh) {
    return {
      found: false,
      message: 'Target sheet not found: ' + sheetName
    };
  }

  const data = sh.getDataRange().getValues();
  if (data.length < 2) {
    return {
      found: false,
      message: 'No data in target sheet'
    };
  }

  const headers = data[0].map(String);
  const batchColIndex = headers.indexOf(BATCH_LOOKUP_CONFIG.BATCH_COLUMN_NAME);

  if (batchColIndex === -1) {
    return {
      found: false,
      message: 'Batch column not found in target sheet'
    };
  }

  const matches = [];
  const matchedRows = [];

  for (let i = 1; i < data.length; i++) {
    const rowBatch = String(data[i][batchColIndex] || '').trim().toUpperCase();
    if (rowBatch === batchNo) {
      const obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      matches.push(obj);
      matchedRows.push(i + 1);
    }
  }

  if (!matches.length) {
    return {
      found: false,
      message: 'Batch not found'
    };
  }

  return {
    found: true,
    batchNo: batchNo,
    sheetName: sheetName,
    totalRecords: matches.length,
    rowNos: matchedRows,
    parsed: parsed,
    records: matches
  };
}

/************************************************************
 * PARSER V3
 ************************************************************/
function parseBatchNoV3_(batchNo) {
  batchNo = String(batchNo || '').trim().toUpperCase();

  const monthNameFromNumber = {
    '01': 'January', '02': 'February', '03': 'March', '04': 'April',
    '05': 'May', '06': 'June', '07': 'July', '08': 'August',
    '09': 'September', '10': 'October', '11': 'November', '12': 'December'
  };

  const monthAlphaMap = {
    'A': { no: '01', name: 'January' },
    'B': { no: '02', name: 'February' },
    'C': { no: '03', name: 'March' },
    'D': { no: '04', name: 'April' },
    'E': { no: '05', name: 'May' },
    'F': { no: '06', name: 'June' },
    'G': { no: '07', name: 'July' },
    'H': { no: '08', name: 'August' },
    'I': { no: '09', name: 'September' },
    'J': { no: '10', name: 'October' },
    'K': { no: '11', name: 'November' },
    'L': { no: '12', name: 'December' }
  };

  let m = batchNo.match(/^([GSKBH])(\d{2})([A-L])(\d{2})(\d{4})$/);
  if (m) {
    return {
      valid: true,
      format: 'FMT3_2023_SEP_ONWARD',
      batchNo: batchNo,
      type: m[1],
      year: m[2],
      monthRaw: m[3],
      monthNo: monthAlphaMap[m[3]].no,
      monthName: monthAlphaMap[m[3]].name,
      plantRaw: m[4],
      plant: m[4],
      sequence: m[5],
      sheetName: m[1] + m[2]
    };
  }

  m = batchNo.match(/^([GSKBH])(\d{2})(\d{2})(\d{1})(\d{4})$/);
  if (m) {
    if (!monthNameFromNumber[m[3]]) return { valid: false, batchNo: batchNo };
    return {
      valid: true,
      format: 'FMT2_2022_TO_2023_AUG',
      batchNo: batchNo,
      type: m[1],
      year: m[2],
      monthRaw: m[3],
      monthNo: m[3],
      monthName: monthNameFromNumber[m[3]],
      plantRaw: m[4],
      plant: ('0' + m[4]).slice(-2),
      sequence: m[5],
      sheetName: m[1] + m[2]
    };
  }

  m = batchNo.match(/^([GSKBH])(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    if (!monthNameFromNumber[m[3]]) return { valid: false, batchNo: batchNo };
    return {
      valid: true,
      format: 'FMT1_2021',
      batchNo: batchNo,
      type: m[1],
      year: m[2],
      monthRaw: m[3],
      monthNo: m[3],
      monthName: monthNameFromNumber[m[3]],
      plantRaw: '',
      plant: '',
      sequence: m[4],
      sheetName: m[1] + m[2]
    };
  }

  return { valid: false, batchNo: batchNo };
}

/************** AUTH *****************/
function authenticateUser(email, password) {
  setupCmsAccessControl();
  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET_NAME);
  if (!sh) return { status: "error", message: "UserDetails sheet not found" };
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String); const ix={}; headers.forEach(function(h,i){ix[h]=i;});
  for (let i=1;i<data.length;i++) {
    if (String(data[i][ix.Email]||'').toLowerCase()===String(email||'').toLowerCase() && String(data[i][ix.Password]||'')===String(password||'')) {
      const access=getUserAccessByEmail_(data[i][ix.Email]);
      if(!access || !access.active) return {status:'error',message:'User account is inactive'};
      PropertiesService.getUserProperties().setProperties({email:access.email,name:access.name,role:access.role});
      return {status:'success',name:access.name,email:access.email,role:access.role,permissions:access.permissions};
    }
  }
  return {status:'error',message:'Invalid email or password'};
}


/** P4 LOGIN HOTFIX: lightweight authentication endpoint used by the login screen. */
function authenticateCmsLoginV2(email, password) {
  try {
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email || !password) return {status:'error', message:'Enter email and password'};

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return {status:'error', message:'CMS spreadsheet is not available to this deployment'};
    const sh = ss.getSheetByName(USER_SHEET_NAME);
    if (!sh) return {status:'error', message:'UserDetails sheet not found'};
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 4) {
      return {status:'error', message:'No CMS users are configured in UserDetails'};
    }

    const data = sh.getDataRange().getDisplayValues();
    const headers = data[0].map(function(h){ return String(h || '').trim(); });
    const ix = {};
    headers.forEach(function(h,i){ ix[h] = i; });
    ['Email','Name','Password','Role'].forEach(function(h){
      if (ix[h] == null) throw new Error('Missing UserDetails column: ' + h);
    });

    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][ix.Email] || '').trim().toLowerCase();
      const rowPassword = String(data[i][ix.Password] || '');
      if (rowEmail !== email || rowPassword !== password) continue;

      const activeCol = ix.Active;
      const activeText = activeCol == null ? 'yes' : String(data[i][activeCol] || 'Yes').trim().toLowerCase();
      if (['no','false','0','inactive','disabled'].indexOf(activeText) >= 0) {
        return {status:'error', message:'User account is inactive'};
      }

      const role = String(data[i][ix.Role] || 'Viewer').trim();
      const defaults = defaultPermissionsForRole_(role);
      const permissions = {};
      Object.keys(CMS_MODULES).forEach(function(k){
        const moduleName = CMS_MODULES[k];
        const col = ix[moduleName];
        permissions[moduleName] = col == null
          ? (defaults[moduleName] || 'NONE')
          : (normalizeAccessLevel_(data[i][col]) || defaults[moduleName] || 'NONE');
      });

      const user = {
        email: rowEmail,
        name: String(data[i][ix.Name] || '').trim(),
        role: role,
        permissions: permissions
      };
      PropertiesService.getUserProperties().setProperties({
        email:user.email,
        name:user.name,
        role:user.role
      });
      return {status:'success', name:user.name, email:user.email, role:user.role, permissions:user.permissions};
    }
    return {status:'error', message:'Invalid email or password'};
  } catch (err) {
    console.error('authenticateCmsLoginV2:', err);
    return {status:'error', message:err && err.message ? err.message : String(err)};
  }
}

/************** SESSION *****************/
function getSession() {
  const u=PropertiesService.getUserProperties(); const email=u.getProperty('email');
  if(!email) return {status:'none'};
  const access=getUserAccessByEmail_(email);
  if(!access || !access.active){u.deleteAllProperties(); return {status:'none'};}
  return {status:'active',email:access.email,name:access.name,role:access.role,permissions:access.permissions};
}
function clearSession(){PropertiesService.getUserProperties().deleteAllProperties();return {status:'success'};}

/************** PINCODE LOOKUP *****************/
function getPincodeDetails(pincode) {
  pincode = String(pincode || '').replace(/\D/g, '').trim();

  if (!/^\d{6}$/.test(pincode)) {
    return {
      found: false,
      message: 'Invalid pincode',
      city: '',
      state: ''
    };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'pincode::' + pincode;
  const cached = cache.get(cacheKey);

  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  try {
    const url = 'https://api.postalpincode.in/pincode/' + encodeURIComponent(pincode);
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (res.getResponseCode() !== 200) {
      return {
        found: false,
        message: 'Pincode API error',
        city: '',
        state: ''
      };
    }

    const json = JSON.parse(res.getContentText() || '[]');
    const first = json && json[0] ? json[0] : null;

    if (!first || first.Status !== 'Success' || !first.PostOffice || !first.PostOffice.length) {
      return {
        found: false,
        message: 'Pincode not found',
        city: '',
        state: ''
      };
    }

    const po = first.PostOffice[0] || {};
    const out = {
      found: true,
      message: '',
      city: String(po.District || po.Block || po.Name || '').trim(),
      state: String(po.State || '').trim()
    };

    cache.put(cacheKey, JSON.stringify(out), 21600);
    return out;

  } catch (err) {
    return {
      found: false,
      message: err.message || 'Pincode lookup failed',
      city: '',
      state: ''
    };
  }
}

function getNextCapaSequence_(sheet) {
  const col = COMPLAINT_COL.COMPLAINT_NO;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues().flat();

  for (let i = values.length - 1; i >= 0; i--) {
    const v = String(values[i] || '');
    if (v.indexOf("CAPA-") === 0) {
      const parts = v.split("-");
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) return seq + 1;
    }
  }
  return 1;
}

/************** ISSUE → MAIL / WHATSAPP ROUTING *****************/
function getIssueRouting_(issueCategory) {
  const out = {
    emails: [],
    whatsappNumbers: []
  };

  const mapSheet = SpreadsheetApp.getActive().getSheetByName(ISSUE_MAIL_MAP_SHEET);
  if (!mapSheet) return out;

  const rows = mapSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const cat = String(rows[i][0] || "").trim();
    const ems = String(rows[i][1] || "").trim();
    const waNos = String(rows[i][2] || "").trim();

    if (!cat) continue;

    if (cat.toLowerCase() === String(issueCategory || "").toLowerCase()) {
      out.emails = splitEmails(ems);
      out.whatsappNumbers = splitPhones_(waNos);
      return out;
    }
  }

  return out;
}

function getRecipientsForIssue(issueCategory) {
  return getIssueRouting_(issueCategory).emails || [];
}

/************** DRIVE FOLDER *****************/
function getOrCreateComplaintFolder_(complaintNo) {
  const parentFolder = DriveApp.getFolderById(COMPLAINT_PARENT_FOLDER_ID);
  const folderName = String(complaintNo || '').trim();

  if (!folderName) throw new Error('Complaint folder name missing');

  const existing = parentFolder.getFoldersByName(folderName);
  if (existing.hasNext()) {
    return existing.next();
  }

  return parentFolder.createFolder(folderName);
}

/************** MEDIA *****************/
function saveMediaToDrive(base64, type, complaintFolder) {
  try {
    if (!base64) return null;
    if (!complaintFolder) throw new Error('Complaint folder is required');

    const match = String(base64).match(/data:(.*);base64,(.*)/);
    if (!match) return null;

    const mime = match[1];
    const data = match[2];

    let ext = '';
    if (mime.indexOf('jpeg') > -1) ext = '.jpg';
    else if (mime.indexOf('jpg') > -1) ext = '.jpg';
    else if (mime.indexOf('png') > -1) ext = '.png';
    else if (mime.indexOf('mp4') > -1) ext = '.mp4';
    else if (mime.indexOf('mov') > -1 || mime.indexOf('quicktime') > -1) ext = '.mov';
    else if (mime.indexOf('avi') > -1) ext = '.avi';
    else if (mime.indexOf('webm') > -1) ext = '.webm';

    const fileName = (type || 'file') + '_' + Date.now() + ext;

    const blob = Utilities.newBlob(
      Utilities.base64Decode(data),
      mime,
      fileName
    );

    const f = complaintFolder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();

  } catch (e) {
    Logger.log('saveMediaToDrive error: ' + e);
    return null;
  }
}

/************** PDF *****************/
function generateComplaintPDF(formData, row, complaintFolder) {
  const sh = getComplaintSheet_();
  const user = PropertiesService.getUserProperties();

  if (!complaintFolder) throw new Error('Complaint folder is required for PDF generation');

  const complaintNo = sh.getRange(row, COMPLAINT_COL.COMPLAINT_NO).getValue();
  const images = sh.getRange(row, COMPLAINT_COL.IMAGE_URLS).getValue();
  const videos = sh.getRange(row, COMPLAINT_COL.VIDEO_URLS).getValue();

  const doc = DocumentApp.create("CMS_" + complaintNo);
  const b = doc.getBody();

  b.appendParagraph("QUALITY ASSURANCE DEPARTMENT")
    .setBold(true)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  b.appendParagraph("Corrective / Preventive Action Request Form")
    .setBold(true)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  b.appendParagraph("");

  const t = b.appendTable();

  function add(label, value) {
    const r = t.appendTableRow();
    r.appendTableCell(label).setBold(true);
    r.appendTableCell(safeText_(value, "—"));
  }

  function addLink(label, text, url) {
    const r = t.appendTableRow();
    r.appendTableCell(label).setBold(true);
    const cell = r.appendTableCell(safeText_(text || url, "—"));
    if (url) cell.editAsText().setLinkUrl(url);
  }

  const fullAddress = [
    formData.address || "",
    formData.city || "",
    formData.state || "",
    formData.pincode || ""
  ].filter(Boolean).join(", ");

  add("CMS Ref No", complaintNo);
  add("Complaint Date", formData.complaintDate);
  add("Batch No", formData.batchNo);
  add("Item Name", formData.itemName);
  add("Submitted At", formatSafeDate(formData.timestamp || new Date()));
  add("Finding Severity", formData.complaintSeverity);
  add("Issue Category", (formData.issues || []).join(", "));
  add("Short Explain", formData.subcategories);
  add("Customer Type", formData.customerType);
  add("Complaint Mode", formData.complaintMode);
  add("Complaint Received Through", user.getProperty("name"));
  add("Login Email", user.getProperty("email"));
  add("Customer Name", formData.location);
  add("Address", fullAddress);
  add("Qty Affected", formData.qtyAffected);
  add("Complaint Sample Available", formData.sampleAvailable ? "Yes" : "No");
  add("Finding / Observation", formData.complaint);

  if (images) add("Image Attachments", images);
  if (videos) add("Video Attachments", videos);

  const publicTrackingLink = buildComplaintTrackerLink_(complaintNo);
  const internalUpdateLink = buildComplaintUpdateLink_(complaintNo);
  if (publicTrackingLink) addLink("Public Tracking Status", "Open public tracking status", publicTrackingLink);
  if (internalUpdateLink) addLink("Internal Status Update", "Open CMS status update panel", internalUpdateLink);

  doc.saveAndClose();

  const docFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = docFile.getAs(MimeType.PDF).setName("CMS_" + complaintNo + ".pdf");
  const pdfFile = complaintFolder.createFile(pdfBlob);

  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  docFile.setTrashed(true);

  return pdfFile.getUrl();
}

/************** MAIL *****************/
function sendEmailToUser(formData, img, vid, pdf, complaintNo, issueRecipients) {
  const user = PropertiesService.getUserProperties();
  const userEmail = String(user.getProperty("email") || "").trim();
  const toList = uniqEmails([userEmail].concat(issueRecipients || [])).join(",");

  if (!toList) {
    Logger.log("No email recipients found for complaint " + complaintNo);
    return;
  }

  let body = ''
    + '<p><b>CMS Ref No:</b> ' + safeText_(complaintNo, '—') + '</p>'
    + '<p><b>Complaint Date:</b> ' + safeText_(formData.complaintDate, '—') + '</p>'
    + '<p><b>Item:</b> ' + safeText_(formData.itemName, '—') + '</p>'
    + '<p><b>Batch:</b> ' + safeText_(formData.batchNo, '—') + '</p>'
    + '<p><b>Severity:</b> ' + safeText_(formData.complaintSeverity, '—') + '</p>'
    + '<p><b>Issue Category:</b> ' + safeText_((formData.issues || []).join(", "), '—') + '</p>'
    + '<p><b>Customer:</b> ' + safeText_(formData.location, '—') + '</p>'
    + '<p><b>Address:</b> ' + safeText_([
        formData.address || "",
        formData.city || "",
        formData.state || "",
        formData.pincode || ""
      ].filter(Boolean).join(", "), '—') + '</p>'
    + '<p><b>Qty Affected:</b> ' + safeText_(formData.qtyAffected, '—') + '</p>'
    + '<p><b>Complaint Sample Available:</b> ' + (formData.sampleAvailable ? "Yes" : "No") + '</p>'
    + '<p><b>Complaint:</b> ' + safeText_(formData.complaint, '—') + '</p>';

  if ((img || []).length) {
    body += "<p><b>Images:</b><br>" + img.join("<br>") + "</p>";
  }
  if ((vid || []).length) {
    body += "<p><b>Videos:</b><br>" + vid.join("<br>") + "</p>";
  }
  if (pdf) {
    body += '<p><b>PDF:</b> <a href="' + pdf + '">' + pdf + '</a></p>';
  }

  MailApp.sendEmail({
    to: toList,
    subject: "CAPA Registered – " + complaintNo,
    htmlBody: body
  });
}

/************** WHATSAPP *****************/
function ensureWhatsappLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(WA_LOG_SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(WA_LOG_SHEET_NAME);
    sh.appendRow([
      'Timestamp',
      'Complaint No',
      'Recipient',
      'Status',
      'Message ID',
      'Error',
      'Response JSON'
    ]);
  }

  return sh;
}

function appendWhatsappAttemptLog_(data) {
  const sh = ensureWhatsappLogSheet_();
  sh.appendRow([
    new Date(),
    data.complaintNo || '',
    data.recipient || '',
    data.status || '',
    data.messageId || '',
    data.error || '',
    data.responseJson || ''
  ]);
}

function getComplaintWhatsappRecipients_(formData, issueWhatsappNumbers) {
  const numbers = [];

  const fixedNumbers = PropertiesService.getScriptProperties()
    .getProperty('CMS_ALERT_WHATSAPP_NOS') || '';

  fixedNumbers.split(',')
    .map(function(s) { return String(s || '').trim(); })
    .filter(Boolean)
    .forEach(function(n) { numbers.push(n); });

  (issueWhatsappNumbers || []).forEach(function(n) { numbers.push(n); });

  if (formData.customerMobile) numbers.push(formData.customerMobile);
  if (formData.altMobile) numbers.push(formData.altMobile);

  return uniqPhones_(numbers);
}

function updateWhatsappLog_(rowNumber, status, errorText, messageIds, sentTo) {
  const sh = getComplaintSheet_();
  if (!rowNumber) return;

  sh.getRange(rowNumber, COMPLAINT_COL.WA_STATUS).setValue(status || '');
  sh.getRange(rowNumber, COMPLAINT_COL.WA_ERROR).setValue(errorText || '');
  sh.getRange(rowNumber, COMPLAINT_COL.WA_MESSAGE_IDS).setValue(messageIds || '');
  sh.getRange(rowNumber, COMPLAINT_COL.WA_SENT_TO).setValue(sentTo || '');
}

function buildComplaintWhatsappPayload_(basePayload) {
  return {
    to: cleanPhone_(basePayload.to),
    complaint_no: sanitizeWhatsappText_(basePayload.complaint_no, 'NA'),
    date: sanitizeWhatsappText_(basePayload.date, 'NA'),
    customer_name: sanitizeWhatsappText_(basePayload.customer_name, 'NA'),
    customer_address: sanitizeWhatsappText_(basePayload.customer_address, 'NA'),
    product_name: sanitizeWhatsappText_(basePayload.product_name, 'NA'),
    batch_no: sanitizeWhatsappText_(basePayload.batch_no, 'NA'),
    complaint_summary: sanitizeWhatsappText_(basePayload.complaint_summary, 'No remarks'),
    qty: sanitizeWhatsappText_(basePayload.qty, '0'),
    sample: sanitizeWhatsappText_(basePayload.sample, 'No'),
    user_name: sanitizeWhatsappText_(basePayload.user_name, 'System'),
    link: sanitizeWhatsappText_(basePayload.link, 'NA'),
    track_token: encodeURIComponent(String(basePayload.complaint_no || '').trim())
  };
}

function sendComplaintWhatsappAlert_(payload) {
  const API_KEY  = PropertiesService.getScriptProperties().getProperty('CHATBOX_API_KEY');
  const PHONE_ID = PropertiesService.getScriptProperties().getProperty('CHATBOX_PHONE_ID');
  const TEMPLATE_NAME = PropertiesService.getScriptProperties().getProperty('CHATBOX_TEMPLATE_NAME') || 'cms';
  const TEMPLATE_LANG = PropertiesService.getScriptProperties().getProperty('CHATBOX_TEMPLATE_LANG') || 'en_US';

  if (!API_KEY) throw new Error('Missing Script Property: CHATBOX_API_KEY');
  if (!PHONE_ID) throw new Error('Missing Script Property: CHATBOX_PHONE_ID');
  if (!payload || !payload.to) throw new Error('WhatsApp recipient number is missing.');

  const normalized = buildComplaintWhatsappPayload_(payload);

  const url = `https://api.chatbox.biz/v3/${PHONE_ID}/messages`;

  const reqBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: normalized.complaint_no },
            { type: "text", text: normalized.date },
            { type: "text", text: normalized.customer_name },
            { type: "text", text: normalized.customer_address },
            { type: "text", text: normalized.product_name },
            { type: "text", text: normalized.batch_no },
            { type: "text", text: normalized.complaint_summary },
            { type: "text", text: normalized.qty },
            { type: "text", text: normalized.sample },
            { type: "text", text: normalized.user_name },
            { type: "text", text: normalized.link }
          ]
        }
      ]
    }
  };

  // Dynamic URL button for public tracking.
  // Template URL example: https://script.google.com/macros/s/WEB_APP_ID/exec?track={{1}}
  const trackButtonIndex = PropertiesService.getScriptProperties().getProperty('CHATBOX_TRACK_BUTTON_INDEX') || '0';
  const enableTrackButton = String(PropertiesService.getScriptProperties().getProperty('CHATBOX_TRACK_BUTTON_ENABLED') || 'true').toLowerCase() !== 'false';
  if (enableTrackButton) {
    reqBody.template.components.push({
      type: "button",
      sub_type: "url",
      index: String(trackButtonIndex),
      parameters: [
        { type: "text", text: normalized.track_token || normalized.complaint_no }
      ]
    });
  }

  Logger.log('WhatsApp Request: ' + JSON.stringify(reqBody));

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: API_KEY
    },
    payload: JSON.stringify(reqBody),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  Logger.log('WhatsApp Response Code: ' + code);
  Logger.log('WhatsApp Response Body: ' + text);

  if (code !== 200 && code !== 201) {
    throw new Error('Chatbox Error: ' + code + ' | ' + text);
  }

  return JSON.parse(text);
}

function sendComplaintWhatsappToMultiple_(formData, complaintNo, waLink, rowNumber, userName, submittedAt, issueWhatsappNumbers) {
  let whatsappStatus = 'Not Sent';
  let whatsappError = '';
  let whatsappSentTo = '';
  let whatsappMessageIds = '';

  const recipients = getComplaintWhatsappRecipients_(formData, issueWhatsappNumbers);

  if (!recipients.length) {
    whatsappStatus = 'Skipped';
    whatsappError = 'No WhatsApp recipients found';
    updateWhatsappLog_(rowNumber, whatsappStatus, whatsappError, '', '');
    return {
      whatsappStatus: whatsappStatus,
      whatsappError: whatsappError,
      whatsappSentTo: whatsappSentTo,
      whatsappMessageIds: whatsappMessageIds
    };
  }

  const fullAddress = [
    formData.address || "",
    formData.city || "",
    formData.state || "",
    formData.pincode || ""
  ].filter(Boolean).join(", ");

  const complaintSummary = [
    formData.subcategories || "",
    formData.complaint || ""
  ].filter(Boolean).join(" | ");

  const sendResults = [];

  recipients.forEach(function(number) {
    try {
      const waRes = sendComplaintWhatsappAlert_({
        to: number,
        complaint_no: complaintNo,
        date: formatSafeDate(submittedAt),
        customer_name: formData.location || '',
        customer_address: fullAddress || '',
        product_name: formData.itemName || '',
        batch_no: formData.batchNo || '',
        complaint_summary: complaintSummary || 'No remarks',
        qty: formData.qtyAffected || '',
        sample: formData.sampleAvailable ? 'Yes' : 'No',
        user_name: userName || 'System',
        link: waLink || ''
      });

      const msgId = waRes && waRes.messages && waRes.messages[0] ? waRes.messages[0].id : '';

      sendResults.push({
        recipient: number,
        status: 'Sent',
        messageId: msgId,
        error: '',
        responseJson: JSON.stringify(waRes)
      });

      appendWhatsappAttemptLog_({
        complaintNo: complaintNo,
        recipient: number,
        status: 'Sent',
        messageId: msgId,
        error: '',
        responseJson: JSON.stringify(waRes)
      });

    } catch (err) {
      sendResults.push({
        recipient: number,
        status: 'Failed',
        messageId: '',
        error: String(err),
        responseJson: ''
      });

      appendWhatsappAttemptLog_({
        complaintNo: complaintNo,
        recipient: number,
        status: 'Failed',
        messageId: '',
        error: String(err),
        responseJson: ''
      });
    }
  });

  const successList = sendResults.filter(function(x) { return x.status === 'Sent'; });
  const failList = sendResults.filter(function(x) { return x.status === 'Failed'; });

  whatsappStatus =
    (successList.length && failList.length) ? 'Partial Success' :
    successList.length ? 'Sent' : 'Failed';

  whatsappSentTo = successList.map(function(x) { return x.recipient; }).join(', ');
  whatsappMessageIds = successList.map(function(x) { return x.messageId; }).filter(Boolean).join(', ');
  whatsappError = failList.map(function(x) {
    return x.recipient + ': ' + x.error;
  }).join(' | ');

  updateWhatsappLog_(rowNumber, whatsappStatus, whatsappError, whatsappMessageIds, whatsappSentTo);

  return {
    whatsappStatus: whatsappStatus,
    whatsappError: whatsappError,
    whatsappSentTo: whatsappSentTo,
    whatsappMessageIds: whatsappMessageIds
  };
}

/************** SUBMIT *****************/
function submitComplaint(formData) {
  try {
    requirePermission_(CMS_MODULES.COMPLAINT_CREATE, 'EDIT');
    const sh = getComplaintSheet_();
    const user = PropertiesService.getUserProperties();
    const timeZone = Session.getScriptTimeZone();

    const tsDate = toDateObject_(formData.timestamp, false) || new Date();
    const compDateObj = toDateObject_(formData.complaintDate, true);

    const submitLock = LockService.getDocumentLock();
    submitLock.waitLock(30000);

    const complaintNo = generateCmsComplaintNo_(tsDate);
    const complaintFolder = getOrCreateComplaintFolder_(complaintNo);

    sh.appendRow([
      tsDate,                                      // A
      compDateObj,                                 // B
      formData.batchNo || "",                      // C
      formData.itemName || "",                     // D
      formData.complaintSeverity || "",            // E
      (formData.issues || []).join(", "),          // F
      formData.subcategories || "",                // G
      "",                                          // H
      user.getProperty("name") || "",              // I
      formData.customerType || "",                 // J
      formData.complaintMode || "",                // K
      formData.location || "",                     // L
      formData.address || "",                      // M
      formData.city || "",                         // N
      formData.pincode || "",                      // O
      formData.complaint || "",                    // P
      "",                                          // Q
      "",                                          // R
      complaintNo,                                 // S
      formData.state || "",                        // T
      formData.qtyAffected || "",                  // U
      formData.sampleAvailable ? "Yes" : "No",     // V
      "",                                          // W
      "",                                          // X
      "",                                          // Y
      "",                                          // Z
      "",                                          // AA
      complaintFolder.getUrl()                     // AB
    ]);

    const row = sh.getLastRow();
    submitLock.releaseLock();

    setupCmsTrackingV2();
    const createdBy = user.getProperty("name") || user.getProperty("email") || "System";
    sh.getRange(row, CMS_STATUS_COL).setValue("Complaint Booked");
    sh.getRange(row, CMS_LAST_UPDATE_COL).setValue(new Date());
    const lifecycleMap = ensureLifecycleMetaColumns_(sh);
    sh.getRange(row, lifecycleMap["Stage Owner"]).setValue("Sales Team");
    sh.getRange(row, lifecycleMap["Stage Updated By"]).setValue(createdBy);
    sh.getRange(row, lifecycleMap["Stage Updated At"]).setValue(new Date());
    sh.getRange(row, lifecycleMap["Lifecycle Version"]).setValue(1);
    sh.getRange(row, lifecycleMap["Last Action Code"]).setValue("COMPLAINT_BOOKED");
    appendCmsHistory_(complaintNo, "", "Complaint Booked", "Complaint registered successfully", createdBy, row);
    appendLifecycleAudit_({complaintNo:complaintNo,rowNo:row,actionCode:"COMPLAINT_BOOKED",actionLabel:"Complaint Booked",oldStage:"",newStage:"Complaint Booked",remark:"Complaint form submitted",userName:createdBy,userEmail:user.getProperty("email")||"",userRole:user.getProperty("role")||""});

    const img = [];
    const vid = [];

    (formData.images || []).forEach(function(b64) {
      const url = saveMediaToDrive(b64, "image", complaintFolder);
      if (url) img.push(url);
    });

    (formData.videos || []).forEach(function(b64) {
      const url = saveMediaToDrive(b64, "video", complaintFolder);
      if (url) vid.push(url);
    });

    if (img.length) {
      sh.getRange(row, COMPLAINT_COL.IMAGE_URLS).setValue(img.join(", "));
    }
    if (vid.length) {
      sh.getRange(row, COMPLAINT_COL.VIDEO_URLS).setValue(vid.join(", "));
    }

    const pdfUrl = generateComplaintPDF(formData, row, complaintFolder);
    sh.getRange(row, COMPLAINT_COL.PDF_URL).setValue(pdfUrl);
    sh.getRange(row, COMPLAINT_COL.FOLDER_URL).setValue(complaintFolder.getUrl());

    const issue = (formData.issues && formData.issues[0]) ? formData.issues[0] : "";
    const routing = getIssueRouting_(issue);

    sendEmailToUser(formData, img, vid, pdfUrl, complaintNo, routing.emails || []);
    
    const waLink = complaintFolder.getUrl();

    const waResult = sendComplaintWhatsappToMultiple_(
      formData,
      complaintNo,
      waLink,
      row,
      user.getProperty("name") || formData.complainerName || 'System',
      tsDate,
      routing.whatsappNumbers || []
    );

    return {
      status: "success",
      complaintNo: complaintNo,
      whatsappStatus: waResult.whatsappStatus || 'Not Sent',
      pdfUrl: pdfUrl || '',
      folderUrl: complaintFolder.getUrl() || ''
    };

  } catch (e) {
    Logger.log('submitComplaint error: ' + e + '\n' + (e.stack || ''));
    return { status: "error", message: e.message || String(e) };
  }
}

/************** TEST HELPERS *****************/
function testComplaintWhatsappIntegration() {
  const result = sendComplaintWhatsappAlert_({
    to: '918909322722',
    complaint_no: 'CMS26E04122018',
    date: formatSafeDate(new Date()),
    customer_name: 'ABC Hospital',
    customer_address: 'Central Delhi, Delhi, 110001',
    product_name: 'IV Cannula',
    batch_no: 'K23I010501',
    complaint_summary: 'Demo complaint for CMS integration test',
    qty: '25',
    sample: 'Yes',
    user_name: 'Dipesh',
    link: 'https://example.com/cms/folder/CMS26E04122018'
  });

  Logger.log(JSON.stringify(result, null, 2));
}

function testCreateComplaintFolder_() {
  const folder = getOrCreateComplaintFolder_('CMS' + Date.now());
  Logger.log(folder.getName());
  Logger.log(folder.getUrl());
}

function testIssueRouting_() {
  Logger.log(JSON.stringify(getIssueRouting_('Packing'), null, 2));
}

function sanitizeWhatsappText_(value, fallback) {
  let s = String(value == null ? '' : value);
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/ {2,}/g, ' ');
  s = s.trim();
  return s || (fallback || 'NA');
}

function getAllComplaints() {
  const sh = getComplaintSheet_();
  const data = sh.getDataRange().getValues();

  const headers = data[0];

  return data.slice(1).map((r,i)=>({
    row: i+2,
    complaintNo: r[COMPLAINT_COL.COMPLAINT_NO-1],
    customer: r[COMPLAINT_COL.LOCATION-1],
    product: r[COMPLAINT_COL.ITEM_NAME-1],
    batch: r[COMPLAINT_COL.BATCH_NO-1],
    severity: r[COMPLAINT_COL.SEVERITY-1],
    status: normalizeCmsStatus_(r[28] || "Complaint Booked"), // AC column
    date: r[COMPLAINT_COL.COMPLAINT_DATE-1]
  }));
}

function updateComplaintStatus(row, newStatus, remark) {
  getCurrentUserAccess_();
  throw new Error("Manual status changes are disabled in P2. Use controlled lifecycle actions.");
}

function getComplaintHistory(complaintNo){
  const sh = SpreadsheetApp.getActive().getSheetByName("Complaint_History");
  const data = sh.getDataRange().getValues();

  return data.slice(1)
    .filter(r => r[0] == complaintNo)
    .map(r => ({
      from: r[1],
      to: r[2],
      remark: r[3],
      user: r[4],
      time: r[5]
    }));
}

/************** P2 CONTROLLED EIGHT-STAGE LIFECYCLE ENGINE *****************/
const CMS_STATUS_COL = 29;       // AC
const CMS_LAST_UPDATE_COL = 30;  // AD
const CMS_HISTORY_SHEET = 'Complaint_History';
const CMS_LIFECYCLE_AUDIT_SHEET = 'CMS_Lifecycle_Audit';

const CMS_TRACKING_STAGES = [
  {name:'Complaint Booked', owner:'Sales Team'},
  {name:'Under Review', owner:'QA Team'},
  {name:'More Info Requested', owner:'QA Team / Sales Team'},
  {name:'Under Investigation', owner:'QA Team'},
  {name:'Investigation Complete', owner:'QA Team / Management Review'},
  {name:'CAPA Uploaded', owner:'QA Team'},
  {name:'CAPA Verified', owner:'Sales Team'},
  {name:'Case Closed', owner:'Automatic'}
];

const CMS_STATUS_ALIASES = {
  'new':'Complaint Booked','registered':'Complaint Booked','complaint booked':'Complaint Booked',
  'under review':'Under Review','review':'Under Review',
  'more info requested':'More Info Requested','information requested':'More Info Requested',
  'investigation':'Under Investigation','under investigation':'Under Investigation','root cause':'Under Investigation','rca':'Under Investigation',
  'investigation complete':'Investigation Complete','capa required':'Investigation Complete',
  'capa in progress':'Investigation Complete','capa submitted':'CAPA Uploaded','submitted':'CAPA Uploaded','capa uploaded':'CAPA Uploaded',
  'capa verification':'CAPA Verified','approved':'CAPA Verified','verified':'CAPA Verified','capa verified':'CAPA Verified',
  'closed':'Case Closed','case closed':'Case Closed'
};

const CMS_LIFECYCLE_META_HEADERS = [
  'Stage Owner','Stage Updated By','Stage Updated At','Lifecycle Version',
  'CAPA Sub Status','CAPA Version','Reopened Count','Last Action Code'
];

const CMS_ACTIONS = {
  START_REVIEW: {label:'Start Review', from:['Complaint Booked'], to:'Under Review', module:CMS_MODULES.QA_REVIEW, level:'EDIT', owner:'QA Team', remarkRequired:false},
  REQUEST_MORE_INFO: {label:'Request More Information', from:['Under Review'], to:'More Info Requested', module:CMS_MODULES.INFO_REQUEST, level:'EDIT', owner:'QA Team', remarkRequired:true},
  START_INVESTIGATION: {label:'Start Investigation', from:['Under Review','More Info Requested'], to:'Under Investigation', module:CMS_MODULES.INVESTIGATION, level:'EDIT', owner:'QA Team', remarkRequired:false},
  COMPLETE_INVESTIGATION: {label:'Complete Investigation', from:['Under Investigation'], to:'Investigation Complete', module:CMS_MODULES.INVESTIGATION, level:'EDIT', owner:'QA Team', remarkRequired:true},
  MARK_CAPA_UPLOADED: {label:'Mark CAPA Uploaded', from:['Investigation Complete'], to:'CAPA Uploaded', module:CMS_MODULES.CAPA_UPLOAD, level:'EDIT', owner:'QA Team', remarkRequired:true},
  UPLOAD_REVISED_CAPA: {label:'Upload Revised CAPA', from:['CAPA Uploaded'], to:'CAPA Uploaded', module:CMS_MODULES.CAPA_UPLOAD, level:'EDIT', owner:'QA Team', remarkRequired:true, requiresRevision:true},
  VERIFY_CAPA: {label:'Verify CAPA', from:['CAPA Uploaded'], to:'CAPA Verified', module:CMS_MODULES.CAPA_VERIFY, level:'EDIT', owner:'Sales Team', remarkRequired:true},
  REQUEST_CAPA_REVISION: {label:'Request CAPA Revision', from:['CAPA Uploaded'], to:'CAPA Uploaded', module:CMS_MODULES.CAPA_VERIFY, level:'EDIT', owner:'Sales Team', remarkRequired:true},
  REOPEN_CASE: {label:'Reopen Case', from:['Case Closed'], to:'Under Review', module:CMS_MODULES.COMPLAINT_EDIT, level:'EDIT', owner:'Admin', remarkRequired:true, adminOnly:true}
};

function normalizeCmsStatus_(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Complaint Booked';
  const mapped = CMS_STATUS_ALIASES[raw.toLowerCase()];
  return mapped || raw;
}

function getCmsStageIndex_(status) {
  const normalized = normalizeCmsStatus_(status);
  for (let i=0;i<CMS_TRACKING_STAGES.length;i++) if (CMS_TRACKING_STAGES[i].name === normalized) return i;
  return -1;
}

function isAdminUser_(user) {
  return /^(admin|administrator|super admin)$/i.test(String(user && user.role || '').trim());
}

function getHeaderMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(),1);
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const map = {}; headers.forEach(function(h,i){ if(h) map[h]=i+1; });
  return map;
}

function ensureLifecycleMetaColumns_(sheet) {
  let map = getHeaderMap_(sheet);
  CMS_LIFECYCLE_META_HEADERS.forEach(function(h){
    if (!map[h]) { sheet.getRange(1,sheet.getLastColumn()+1).setValue(h); map = getHeaderMap_(sheet); }
  });
  return map;
}

function setupCmsTrackingV2() {
  const ss = SpreadsheetApp.getActive();
  const sh = getComplaintSheet_();
  if (sh.getRange(1,CMS_STATUS_COL).getValue() !== 'Status') sh.getRange(1,CMS_STATUS_COL).setValue('Status');
  if (sh.getRange(1,CMS_LAST_UPDATE_COL).getValue() !== 'Last Updated') sh.getRange(1,CMS_LAST_UPDATE_COL).setValue('Last Updated');
  ensureLifecycleMetaColumns_(sh);

  let hist = ss.getSheetByName(CMS_HISTORY_SHEET);
  if (!hist) { hist=ss.insertSheet(CMS_HISTORY_SHEET); hist.appendRow(['Timestamp','Complaint No','Old Status','New Status','Remark','Updated By','Row No']); }

  let audit = ss.getSheetByName(CMS_LIFECYCLE_AUDIT_SHEET);
  if (!audit) {
    audit=ss.insertSheet(CMS_LIFECYCLE_AUDIT_SHEET);
    audit.appendRow(['Timestamp','Event ID','Complaint No','Row No','Action Code','Action Label','Old Stage','New Stage','Remark','Performed By','Performed Email','Performed Role','CAPA Sub Status','CAPA Version']);
  }
  return {status:'success',message:'P2 lifecycle engine ready'};
}

function appendCmsHistory_(complaintNo, oldStatus, newStatus, remark, updatedBy, rowNo) {
  setupCmsTrackingV2();
  SpreadsheetApp.getActive().getSheetByName(CMS_HISTORY_SHEET).appendRow([
    new Date(),complaintNo||'',oldStatus||'',normalizeCmsStatus_(newStatus),remark||'',updatedBy||'System',rowNo||''
  ]);
}

function appendLifecycleAudit_(payload) {
  setupCmsTrackingV2();
  SpreadsheetApp.getActive().getSheetByName(CMS_LIFECYCLE_AUDIT_SHEET).appendRow([
    new Date(),Utilities.getUuid(),payload.complaintNo||'',payload.rowNo||'',payload.actionCode||'',payload.actionLabel||'',
    payload.oldStage||'',payload.newStage||'',payload.remark||'',payload.userName||'',payload.userEmail||'',payload.userRole||'',
    payload.capaSubStatus||'',payload.capaVersion||''
  ]);
}

function getComplaintLifecycleRecord_(complaintNoOrRow) {
  setupCmsTrackingV2();
  const sh=getComplaintSheet_(); const map=ensureLifecycleMetaColumns_(sh); const lastRow=sh.getLastRow();
  let rowNo = Number(complaintNoOrRow);
  if (!rowNo || rowNo<2) {
    rowNo=0;
    if(lastRow>=2){
      const vals=sh.getRange(2,COMPLAINT_COL.COMPLAINT_NO,lastRow-1,1).getValues();
      for(let i=0;i<vals.length;i++) if(String(vals[i][0]).trim()===String(complaintNoOrRow).trim()){rowNo=i+2;break;}
    }
  }
  if(!rowNo || rowNo>lastRow) throw new Error('Complaint not found');
  const complaintNo=String(sh.getRange(rowNo,COMPLAINT_COL.COMPLAINT_NO).getValue()||'').trim();
  if(!complaintNo) throw new Error('Complaint No not found');
  const stage=normalizeCmsStatus_(sh.getRange(rowNo,CMS_STATUS_COL).getValue()||'Complaint Booked');
  return {
    sh:sh,map:map,rowNo:rowNo,complaintNo:complaintNo,stage:stage,
    capaSubStatus:String(sh.getRange(rowNo,map['CAPA Sub Status']).getValue()||''),
    capaVersion:Number(sh.getRange(rowNo,map['CAPA Version']).getValue()||0),
    reopenedCount:Number(sh.getRange(rowNo,map['Reopened Count']).getValue()||0)
  };
}

function canUseLifecycleAction_(user, action, record) {
  if (!action) return false;
  if (action.adminOnly && !isAdminUser_(user)) return false;
  if (action.from.indexOf(record.stage) === -1) return false;
  if (!hasPermission_(user,action.module,action.level||'EDIT')) return false;
  if (action.requiresRevision && record.capaSubStatus !== 'Revision Requested') return false;
  if (action === CMS_ACTIONS.REQUEST_CAPA_REVISION && record.capaSubStatus === 'Revision Requested') return false;
  if (action === CMS_ACTIONS.VERIFY_CAPA && record.capaSubStatus === 'Revision Requested') return false;
  return true;
}

function getAllowedCmsLifecycleActions(complaintNo) {
  const user=requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  const record=getComplaintLifecycleRecord_(complaintNo);
  const actions=[];
  Object.keys(CMS_ACTIONS).forEach(function(code){
    const a=CMS_ACTIONS[code];
    if(['REQUEST_MORE_INFO','COMPLETE_INVESTIGATION','MARK_CAPA_UPLOADED','UPLOAD_REVISED_CAPA','VERIFY_CAPA','REQUEST_CAPA_REVISION'].indexOf(code)>=0) return;
    if(canUseLifecycleAction_(user,a,record)) actions.push({code:code,label:a.label,remarkRequired:!!a.remarkRequired,owner:a.owner,toStage:a.to});
  });
  return {status:'success',complaintNo:record.complaintNo,currentStage:record.stage,stageOwner:getCmsStageOwner_(record.stage),capaSubStatus:record.capaSubStatus,capaVersion:record.capaVersion,actions:actions};
}

function getCmsStageOwner_(stage) {
  const s=CMS_TRACKING_STAGES.find(function(x){return x.name===normalizeCmsStatus_(stage);});
  return s?s.owner:'';
}

function executeCmsLifecycleAction(complaintNo, actionCode, remark) {
  const user=getCurrentUserAccess_();
  const action=CMS_ACTIONS[String(actionCode||'').trim()];
  if(!action) throw new Error('Invalid lifecycle action');
  const cleanRemark=String(remark||'').trim();
  if(action.remarkRequired && !cleanRemark) throw new Error('Remark is required for this action');

  const lock=LockService.getDocumentLock(); lock.waitLock(30000);
  try {
    const record=getComplaintLifecycleRecord_(complaintNo);
    if(!canUseLifecycleAction_(user,action,record)) throw new Error('This action is not allowed at the current stage or for your role');
    if(actionCode==='REQUEST_MORE_INFO') throw new Error('Use the More Info Request module to raise requests');
    if(actionCode==='START_INVESTIGATION' && getActiveInfoRequest_(record.complaintNo)) throw new Error('Close the active information request before starting investigation');
    const sh=record.sh, map=record.map, oldStage=record.stage;
    let newStage=action.to, capaSubStatus=record.capaSubStatus, capaVersion=record.capaVersion;

    if(actionCode==='MARK_CAPA_UPLOADED') { capaVersion=Math.max(1,capaVersion+1); capaSubStatus='Awaiting Sales Verification'; }
    if(actionCode==='REQUEST_CAPA_REVISION') { capaSubStatus='Revision Requested'; }
    if(actionCode==='UPLOAD_REVISED_CAPA') { capaVersion=Math.max(1,capaVersion+1); capaSubStatus='Awaiting Sales Verification'; }
    if(actionCode==='VERIFY_CAPA') { capaSubStatus='Verified'; }
    if(actionCode==='REOPEN_CASE') { capaSubStatus=''; sh.getRange(record.rowNo,map['Reopened Count']).setValue(record.reopenedCount+1); }

    const now=new Date(); const actor=user.name||user.email||'System';
    sh.getRange(record.rowNo,CMS_STATUS_COL).setValue(newStage);
    sh.getRange(record.rowNo,CMS_LAST_UPDATE_COL).setValue(now);
    sh.getRange(record.rowNo,map['Stage Owner']).setValue(getCmsStageOwner_(newStage));
    sh.getRange(record.rowNo,map['Stage Updated By']).setValue(actor);
    sh.getRange(record.rowNo,map['Stage Updated At']).setValue(now);
    sh.getRange(record.rowNo,map['Lifecycle Version']).setValue(Number(sh.getRange(record.rowNo,map['Lifecycle Version']).getValue()||0)+1);
    sh.getRange(record.rowNo,map['CAPA Sub Status']).setValue(capaSubStatus);
    sh.getRange(record.rowNo,map['CAPA Version']).setValue(capaVersion||'');
    sh.getRange(record.rowNo,map['Last Action Code']).setValue(actionCode);

    appendCmsHistory_(record.complaintNo,oldStage,newStage,cleanRemark||action.label,actor,record.rowNo);
    appendLifecycleAudit_({complaintNo:record.complaintNo,rowNo:record.rowNo,actionCode:actionCode,actionLabel:action.label,oldStage:oldStage,newStage:newStage,remark:cleanRemark,userName:user.name,userEmail:user.email,userRole:user.role,capaSubStatus:capaSubStatus,capaVersion:capaVersion});

    // Verification is recorded as its own stage and then closes automatically.
    if(actionCode==='VERIFY_CAPA') {
      appendCmsHistory_(record.complaintNo,'CAPA Verified','Case Closed','Case closed automatically after CAPA verification',actor,record.rowNo);
      appendLifecycleAudit_({complaintNo:record.complaintNo,rowNo:record.rowNo,actionCode:'AUTO_CLOSE_CASE',actionLabel:'Automatic Case Closure',oldStage:'CAPA Verified',newStage:'Case Closed',remark:'Automatic after CAPA Verified',userName:'System',userEmail:'',userRole:'System',capaSubStatus:'Verified',capaVersion:capaVersion});
      sh.getRange(record.rowNo,CMS_STATUS_COL).setValue('Case Closed');
      sh.getRange(record.rowNo,CMS_LAST_UPDATE_COL).setValue(new Date());
      sh.getRange(record.rowNo,map['Stage Owner']).setValue('Automatic');
      sh.getRange(record.rowNo,map['Stage Updated By']).setValue('System');
      sh.getRange(record.rowNo,map['Stage Updated At']).setValue(new Date());
      newStage='Case Closed';
    }
    return {status:'success',message:action.label+' completed',complaintNo:record.complaintNo,newStatus:newStage,capaSubStatus:capaSubStatus,capaVersion:capaVersion};
  } finally { lock.releaseLock(); }
}

function setupCmsLifecycleP2() {
  setupCmsAccessControl();
  setupCmsTrackingV2();
  const sh = getComplaintSheet_();
  const map = ensureLifecycleMetaColumns_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {status:'success',message:'P2 lifecycle setup completed',migrated:0};

  let migrated = 0;
  for (let row=2; row<=lastRow; row++) {
    const complaintNo = String(sh.getRange(row,COMPLAINT_COL.COMPLAINT_NO).getValue()||'').trim();
    if (!complaintNo) continue;
    const raw = sh.getRange(row,CMS_STATUS_COL).getValue() || 'Complaint Booked';
    const normalized = normalizeCmsStatus_(raw);
    sh.getRange(row,CMS_STATUS_COL).setValue(normalized);
    if (!sh.getRange(row,CMS_LAST_UPDATE_COL).getValue()) sh.getRange(row,CMS_LAST_UPDATE_COL).setValue(new Date());
    if (!sh.getRange(row,map['Stage Owner']).getValue()) sh.getRange(row,map['Stage Owner']).setValue(getCmsStageOwner_(normalized));
    if (!sh.getRange(row,map['Lifecycle Version']).getValue()) sh.getRange(row,map['Lifecycle Version']).setValue(1);
    if (!sh.getRange(row,map['Last Action Code']).getValue()) sh.getRange(row,map['Last Action Code']).setValue('P2_MIGRATION');
    migrated++;
  }
  return {status:'success',message:'P2 lifecycle setup and migration completed',migrated:migrated};
}

// Legacy free-status function is deliberately locked down in P2.
function updateCmsComplaintStatus(rowNo,newStatus,remark) {
  const user=getCurrentUserAccess_();
  if(!isAdminUser_(user)) throw new Error('Manual status changes are disabled. Use the controlled lifecycle actions.');
  throw new Error('Manual status changes are disabled in P2. Use Reopen Case or the valid stage action buttons.');
}

function getCmsTrackingDataLegacy(fyKey) {
  requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW'); setupCmsTrackingV2();
  const sh=getComplaintSheet_(), map=ensureLifecycleMetaColumns_(sh), lastRow=sh.getLastRow();
  const fyOptions=getCmsFinancialYearOptions_();
  const selectedFY=fyKey || getCurrentIndianFYKey_();
  if(lastRow<2) return {status:'success',selectedFY:selectedFY,fyOptions:fyOptions,cards:{total:0,open:0,closed:0,overdue:0},rows:[],analytics:{byStage:[],bySeverity:[],monthlyTrend:[]}};
  const data=sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues(); const rows=[];
  data.forEach(function(r,i){
    const complaintNo=r[COMPLAINT_COL.COMPLAINT_NO-1]; if(!complaintNo)return;
    const status=normalizeCmsStatus_(r[CMS_STATUS_COL-1]||'Complaint Booked'); const complaintDate=r[COMPLAINT_COL.COMPLAINT_DATE-1];
    const fy=getIndianFYKeyFromDate_(complaintDate);
    if(selectedFY && fy !== selectedFY) return;
    rows.push({rowNo:i+2,complaintNo:complaintNo,date:formatSafeDate(complaintDate),fy:fy,customer:r[COMPLAINT_COL.LOCATION-1]||'',product:r[COMPLAINT_COL.ITEM_NAME-1]||'',batch:r[COMPLAINT_COL.BATCH_NO-1]||'',severity:r[COMPLAINT_COL.SEVERITY-1]||'',issue:r[COMPLAINT_COL.ISSUES-1]||'',city:r[COMPLAINT_COL.CITY-1]||'',state:r[COMPLAINT_COL.STATE-1]||'',qty:r[COMPLAINT_COL.QTY_AFFECTED-1]||'',sample:r[COMPLAINT_COL.SAMPLE_AVAILABLE-1]||'',pdfUrl:r[COMPLAINT_COL.PDF_URL-1]||'',folderUrl:r[COMPLAINT_COL.FOLDER_URL-1]||'',whatsappStatus:r[COMPLAINT_COL.WA_STATUS-1]||'',status:status,stageOwner:r[(map['Stage Owner']||1)-1]||getCmsStageOwner_(status),capaSubStatus:r[(map['CAPA Sub Status']||1)-1]||'',capaVersion:r[(map['CAPA Version']||1)-1]||'',lastUpdated:formatSafeDate(r[CMS_LAST_UPDATE_COL-1]),ageDays:getAgeDays_(complaintDate)});
  });
  const cards={total:rows.length,open:rows.filter(x=>x.status!=='Case Closed').length,closed:rows.filter(x=>x.status==='Case Closed').length,overdue:rows.filter(x=>x.status!=='Case Closed'&&Number(x.ageDays)>7).length};
  const analytics=buildCmsFyAnalytics_(rows);
  rows.sort((a,b)=>b.rowNo-a.rowNo); return {status:'success',selectedFY:selectedFY,fyOptions:fyOptions,cards:cards,rows:rows,analytics:analytics};
}

function getCurrentIndianFYKey_() {
  const d=new Date();
  const y=d.getFullYear();
  const m=d.getMonth()+1;
  const start=m>=4?y:y-1;
  return start+'-'+String(start+1).slice(-2);
}

function getIndianFYKeyFromDate_(value) {
  const d=toDateObject_(value,true) || toDateObject_(value,false);
  if(!d) return '';
  const y=d.getFullYear();
  const m=d.getMonth()+1;
  const start=m>=4?y:y-1;
  return start+'-'+String(start+1).slice(-2);
}

function getCmsFinancialYearOptions_() {
  const sh=getComplaintSheet_();
  const out={};
  const current=getCurrentIndianFYKey_();
  out[current]=true;
  const lastRow=sh.getLastRow();
  if(lastRow>=2){
    const vals=sh.getRange(2,COMPLAINT_COL.COMPLAINT_DATE,lastRow-1,1).getValues().flat();
    vals.forEach(function(v){const fy=getIndianFYKeyFromDate_(v); if(fy) out[fy]=true;});
  }
  return Object.keys(out).sort(function(a,b){return Number(b.slice(0,4))-Number(a.slice(0,4));}).map(function(k){return {key:k,label:'FY '+k};});
}

function buildCmsFyAnalytics_(rows) {
  const stageOrder=CMS_TRACKING_STAGES.map(function(x){return x.name;});
  const stageMap={}, severityMap={}, monthMap={};
  stageOrder.forEach(function(s){stageMap[s]=0;});
  const months=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  months.forEach(function(m){monthMap[m]=0;});
  rows.forEach(function(x){
    const st=x.status||'Complaint Booked'; stageMap[st]=(stageMap[st]||0)+1;
    const sev=String(x.severity||'Unspecified').trim()||'Unspecified'; severityMap[sev]=(severityMap[sev]||0)+1;
  });
  return {
    byStage:Object.keys(stageMap).map(function(k){return {label:k,count:stageMap[k]||0};}),
    bySeverity:Object.keys(severityMap).sort().map(function(k){return {label:k,count:severityMap[k]};}),
    monthlyTrend:months.map(function(k){return {label:k,count:monthMap[k]||0};})
  };
}

function getCmsComplaintHistory(complaintNo) {
  requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  return getCmsComplaintHistoryCore_(complaintNo);
}

function getCmsComplaintHistoryCore_(complaintNo) {
  setupCmsTrackingV2(); const sh=SpreadsheetApp.getActive().getSheetByName(CMS_HISTORY_SHEET); const data=sh.getDataRange().getValues();
  return data.slice(1).filter(r=>String(r[1])===String(complaintNo)).map(function(r){return {time:formatSafeDate(r[0]),complaintNo:r[1],oldStatus:r[2]?normalizeCmsStatus_(r[2]):'',newStatus:normalizeCmsStatus_(r[3]),remark:r[4],user:r[5]};}).reverse();
}

function getCmsComplaintTracking(complaintNo) {
  requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  return getCmsComplaintTrackingCore_(complaintNo);
}

function getCmsComplaintTrackingCore_(complaintNo) {
  setupCmsTrackingV2();
  let record; try{record=getComplaintLifecycleRecord_(complaintNo);}catch(e){return {status:'not_found',complaintNo:complaintNo,stages:[],logs:[]};}
  const logsNewest=getCmsComplaintHistoryCore_(record.complaintNo); const logsOldest=logsNewest.slice().reverse();
  if(!logsOldest.length) logsOldest.push({time:'',complaintNo:record.complaintNo,oldStatus:'',newStatus:record.stage,remark:'Complaint registered',user:'System'});
  const reached={}; logsOldest.forEach(function(l){reached[normalizeCmsStatus_(l.newStatus)]=l;});
  const currentIndex=getCmsStageIndex_(record.stage);
  const stages=CMS_TRACKING_STAGES.map(function(stage,index){
    let state='Pending';
    if(reached[stage.name] || index<currentIndex) state='Done';
    if(index===currentIndex && record.stage!=='Case Closed') state='Active';
    if(record.stage==='Case Closed') state='Done';
    const log=reached[stage.name]||null;
    return {stage:stage.name,owner:stage.owner,status:state,time:log?log.time:'',remarks:log?log.remark:'',updatedBy:log?log.user:''};
  });
  return {status:'success',complaintNo:record.complaintNo,rowNo:record.rowNo,currentStatus:record.stage,stageOwner:getCmsStageOwner_(record.stage),capaSubStatus:record.capaSubStatus,capaVersion:record.capaVersion,stages:stages,logs:logsNewest};
}

function getAgeDays_(dateValue) {
  const d = toDateObject_(dateValue, false);
  if (!d) return 0;
  return Math.max(0, Math.floor((new Date() - d) / (1000 * 60 * 60 * 24)));
}

/************** PUBLIC TRACKING PAGE *****************/
function getPublicComplaintTrackingData_(complaintNo) {
  complaintNo = String(complaintNo || '').trim();
  if (!complaintNo) throw new Error('Complaint number missing');

  setupCmsTrackingV2();

  const sh = getComplaintSheet_();
  const lastRow = sh.getLastRow();
  let found = null;

  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, Math.max(CMS_LAST_UPDATE_COL, sh.getLastColumn())).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][COMPLAINT_COL.COMPLAINT_NO - 1]).trim() === complaintNo) {
        const r = data[i];
        found = {
          rowNo: i + 2,
          complaintNo: complaintNo,
          date: formatSafeDate(r[COMPLAINT_COL.COMPLAINT_DATE - 1]),
          customer: r[COMPLAINT_COL.LOCATION - 1] || '',
          city: r[COMPLAINT_COL.CITY - 1] || '',
          state: r[COMPLAINT_COL.STATE - 1] || '',
          product: r[COMPLAINT_COL.ITEM_NAME - 1] || '',
          batch: r[COMPLAINT_COL.BATCH_NO - 1] || '',
          severity: r[COMPLAINT_COL.SEVERITY - 1] || '',
          issue: r[COMPLAINT_COL.ISSUES - 1] || '',
          currentStatus: normalizeCmsStatus_(r[CMS_STATUS_COL - 1] || 'Complaint Booked'),
          lastUpdated: formatSafeDate(r[CMS_LAST_UPDATE_COL - 1]),
          ageDays: getAgeDays_(r[COMPLAINT_COL.COMPLAINT_DATE - 1])
        };
        break;
      }
    }
  }

  if (!found) {
    return { status: 'not_found', complaintNo: complaintNo };
  }

  const tracking = getCmsComplaintTrackingCore_(complaintNo);
  found.stages = tracking.stages || [];
  found.logs = tracking.logs || [];
  return { status: 'success', data: found };
}

function renderPublicTrackingPage_(complaintNo) {
  const result = getPublicComplaintTrackingData_(complaintNo);
  const data = result.data || {};
  const stages = data.stages || [];
  const logs = data.logs || [];

  const stageHtml = stages.map(function(s) {
    const cls = String(s.status || 'Pending').toLowerCase();
    const icon = s.status === 'Done' ? '✓' : (s.status === 'Active' ? '•' : '');
    return '<div class="stage ' + cls + '"><div class="circle">' + icon + '</div><div class="sname">' + escapeHtml_(s.stage) + '</div></div>';
  }).join('');

  const logHtml = logs.length ? logs.map(function(l) {
    return '<div class="log"><div class="dot">✓</div><div><b>' + escapeHtml_(l.newStatus || '') + '</b><p>' + escapeHtml_(l.remark || '') + '</p><small>' + escapeHtml_(l.user || 'System') + ' • ' + escapeHtml_(l.time || '') + '</small></div></div>';
  }).join('') : '<div class="empty">No routing steps found.</div>';

  const notFound = result.status !== 'success';
  const bodyHtml = notFound
    ? '<div class="card"><h2>Complaint not found</h2><p>Please check the complaint reference number.</p><div class="ref">' + escapeHtml_(complaintNo) + '</div></div>'
    : '<div class="hero"><div><span>Public Tracking Status</span><h1>' + escapeHtml_(data.complaintNo) + '</h1><p>Current Status: <b>' + escapeHtml_(data.currentStatus) + '</b></p></div><div class="pill">' + escapeHtml_(data.currentStatus) + '</div></div>'
      + '<div class="grid"><div class="info"><b>Customer</b><span>' + escapeHtml_(data.customer || '—') + '</span></div><div class="info"><b>Product</b><span>' + escapeHtml_(data.product || '—') + '</span></div><div class="info"><b>Batch</b><span>' + escapeHtml_(data.batch || '—') + '</span></div><div class="info"><b>Complaint Date</b><span>' + escapeHtml_(data.date || '—') + '</span></div></div>'
      + '<div class="card"><h2>Status Journey</h2><div class="progressline">' + stageHtml + '</div></div>'
      + '<div class="card"><h2>Routing Steps</h2>' + logHtml + '</div>';

  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMS Tracking - ' + escapeHtml_(complaintNo) + '</title>'
    + '<style>body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(140deg,#eef7f6,#dcefeb);color:#17343a;padding:18px}.wrap{max-width:980px;margin:0 auto}.hero,.card{background:rgba(255,255,255,.94);border:1px solid #d6e9e6;border-radius:22px;box-shadow:0 16px 38px rgba(7,58,66,.10);padding:22px;margin-bottom:16px}.hero{display:flex;justify-content:space-between;gap:12px;align-items:center;background:linear-gradient(135deg,#063d3c,#0a8f84);color:#fff}.hero span{font-size:13px;opacity:.88;font-weight:700}.hero h1{margin:6px 0;font-size:30px}.hero p{margin:0}.pill{background:#fff;color:#0f766e;border-radius:999px;padding:10px 14px;font-weight:900}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.info{background:#fff;border:1px solid #d6e9e6;border-radius:16px;padding:14px}.info b{display:block;color:#64748b;font-size:12px;text-transform:uppercase}.info span{display:block;font-weight:800;margin-top:5px}.progressline{display:flex;justify-content:space-between;gap:10px;overflow-x:auto;padding:12px 0}.stage{text-align:center;min-width:115px}.circle{width:38px;height:38px;border-radius:50%;margin:0 auto 8px;border:2px solid #cbd5e1;background:#f8fafc;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-weight:900}.stage.done .circle{background:#16a34a;border-color:#16a34a;color:#fff}.stage.active .circle{background:#fff;border-color:#0f766e;color:#0f766e;box-shadow:0 0 0 6px rgba(15,118,110,.12)}.sname{font-size:12px;font-weight:800;color:#334155}.log{display:grid;grid-template-columns:32px 1fr;gap:10px;border-top:1px solid #e2e8f0;padding:13px 0}.dot{width:24px;height:24px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-weight:900}.log p{margin:3px 0;color:#475569}.log small{color:#64748b}.empty{color:#64748b;padding:12px}.ref{font-size:20px;font-weight:900;color:#0f766e}@media(max-width:720px){.hero{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.hero h1{font-size:23px}}</style>'
    + '</head><body><div class="wrap">' + bodyHtml + '<div style="text-align:center;color:#64748b;font-size:12px;margin-top:14px">ROMSONS Complaint Management System</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('CMS Tracking')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/************** P3 MORE INFO REQUEST MODULE *****************/
const CMS_INFO_REQUEST_SHEET = 'CMS_Info_Requests';
const CMS_INFO_MESSAGE_SHEET = 'CMS_Info_Request_Messages';
const CMS_INFO_MAX_REQUESTS = 3;
const CMS_INFO_ACTIVE_STATUSES = ['Open','Sales Responded','Reopened'];
const CMS_NOTIFICATION_SHEET = 'CMS_Notifications';

function setupCmsInfoRequestP3() {
  setupCmsLifecycleP2();
  const ss = SpreadsheetApp.getActive();
  let req = ss.getSheetByName(CMS_INFO_REQUEST_SHEET);
  if (!req) {
    req = ss.insertSheet(CMS_INFO_REQUEST_SHEET);
    req.appendRow(['Request ID','Complaint No','Request No','Status','Question','Raised By','Raised Email','Raised At','QA Attachment URL','Sales Response','Sales Attachment URL','Sales Responded By','Sales Responded Email','Sales Responded At','QA Review Comment','Closed By','Closed Email','Closed At','Last Updated At']);
    req.setFrozenRows(1);
  }
  let msg = ss.getSheetByName(CMS_INFO_MESSAGE_SHEET);
  if (!msg) {
    msg = ss.insertSheet(CMS_INFO_MESSAGE_SHEET);
    msg.appendRow(['Timestamp','Message ID','Request ID','Complaint No','Sender Name','Sender Email','Sender Role','Message Type','Message','Attachment URL']);
    msg.setFrozenRows(1);
  }
  let note = ss.getSheetByName(CMS_NOTIFICATION_SHEET);
  if (!note) {
    note = ss.insertSheet(CMS_NOTIFICATION_SHEET);
    note.appendRow(['Timestamp','Notification ID','Complaint No','Request ID','Type','Audience Role','Title','Message','Status','Created By','Created Email']);
    note.setFrozenRows(1);
  }
  return {status:'success',message:'P3 More Info Request module ready'};
}


function appendCmsNotification_(payload) {
  setupCmsInfoRequestP3();
  payload = payload || {};
  const sh = SpreadsheetApp.getActive().getSheetByName(CMS_NOTIFICATION_SHEET);
  sh.appendRow([
    new Date(), Utilities.getUuid(), payload.complaintNo || '', payload.requestId || '',
    payload.type || 'Info Request', payload.audienceRole || '', payload.title || '', payload.message || '',
    payload.status || 'Unread', payload.createdBy || '', payload.createdEmail || ''
  ]);
}

function getCmsNotificationRows_(complaintNo, limit) {
  setupCmsInfoRequestP3();
  const sh = SpreadsheetApp.getActive().getSheetByName(CMS_NOTIFICATION_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const max = Math.max(1, Number(limit || 10));
  return sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues()
    .filter(function(r){ return String(r[2] || '').trim() === String(complaintNo || '').trim(); })
    .map(function(r){ return {
      time: formatSafeDate(r[0]), id: r[1] || '', complaintNo: r[2] || '', requestId: r[3] || '',
      type: r[4] || '', audienceRole: r[5] || '', title: r[6] || '', message: r[7] || '',
      status: r[8] || '', createdBy: r[9] || '', createdEmail: r[10] || ''
    };})
    .reverse()
    .slice(0, max);
}

function getCmsComplaintAlerts(complaintNo) {
  const user = requirePermission_(CMS_MODULES.COMPLAINT_VIEW, 'VIEW');
  const record = getComplaintLifecycleRecord_(complaintNo);
  const requests = getInfoRequestRows_(record.complaintNo);
  const active = getActiveInfoRequest_(record.complaintNo);
  const alerts = [];
  const isQa = (/qa/i.test(user.role || '') || isAdminUser_(user));
  const isSales = (/sales/i.test(user.role || '') || isAdminUser_(user));

  if (active) {
    if ((active.status === 'Open' || active.status === 'Reopened') && isSales) {
      alerts.push({level:'warning', title:'Sales response pending', message:'Information Request ' + active.requestNo + ' is waiting for Sales response.', requestId:active.requestId});
    } else if ((active.status === 'Open' || active.status === 'Reopened') && isQa) {
      alerts.push({level:'info', title:'Waiting for Sales response', message:'Request ' + active.requestNo + ' is active. Investigation cannot start until the request is closed.', requestId:active.requestId});
    } else if (active.status === 'Sales Responded' && isQa) {
      alerts.push({level:'success', title:'Sales response received', message:'Review the Sales response and accept or reopen the request.', requestId:active.requestId});
    } else if (active.status === 'Sales Responded' && isSales) {
      alerts.push({level:'info', title:'Response submitted', message:'Waiting for QA review and closure.', requestId:active.requestId});
    }
  }

  if (!active && record.stage === 'More Info Requested') {
    alerts.push({level:'info', title:'Information request cycle clear', message:'No active information request is open. QA may raise another request or start investigation.'});
  }

  if (requests.length >= CMS_INFO_MAX_REQUESTS && !active && record.stage === 'More Info Requested') {
    alerts.push({level:'warning', title:'Maximum request cycles used', message:'All 3 information request cycles are used. Move to investigation or escalate internally.'});
  }

  const notifications = getCmsNotificationRows_(record.complaintNo, 8);
  return {status:'success', complaintNo:record.complaintNo, currentStage:record.stage, requestCount:requests.length, maxRequests:CMS_INFO_MAX_REQUESTS, activeRequest:active, alerts:alerts, notifications:notifications};
}

function getInfoRequestRows_(complaintNo) {
  setupCmsInfoRequestP3();
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_REQUEST_SHEET);
  const data=sh.getDataRange().getValues();
  if(data.length<2) return [];
  return data.slice(1).map(function(r,i){return {
    rowNo:i+2, requestId:String(r[0]||''), complaintNo:String(r[1]||''), requestNo:Number(r[2]||0), status:String(r[3]||''), question:String(r[4]||''),
    raisedBy:String(r[5]||''), raisedEmail:String(r[6]||''), raisedAt:r[7], qaAttachmentUrl:String(r[8]||''), salesResponse:String(r[9]||''),
    salesAttachmentUrl:String(r[10]||''), salesRespondedBy:String(r[11]||''), salesRespondedEmail:String(r[12]||''), salesRespondedAt:r[13],
    qaReviewComment:String(r[14]||''), closedBy:String(r[15]||''), closedEmail:String(r[16]||''), closedAt:r[17], lastUpdatedAt:r[18]
  };}).filter(function(x){return x.complaintNo===String(complaintNo||'').trim();}).sort(function(a,b){return a.requestNo-b.requestNo;});
}

function getActiveInfoRequest_(complaintNo) {
  const rows=getInfoRequestRows_(complaintNo);
  for(let i=rows.length-1;i>=0;i--) if(CMS_INFO_ACTIVE_STATUSES.indexOf(rows[i].status)>=0) return rows[i];
  return null;
}

function saveInfoAttachment_(dataUrl, complaintNo, prefix) {
  if(!dataUrl) return '';
  const folder=getOrCreateComplaintFolder_(complaintNo);
  const match=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if(!match) throw new Error('Invalid attachment data');
  const mime=match[1], bytes=Utilities.base64Decode(match[2]);
  const ext=(mime.split('/')[1]||'bin').replace('jpeg','jpg').replace(/[^a-z0-9]/gi,'');
  const name=(prefix||'attachment')+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss')+'.'+ext;
  const file=folder.createFile(Utilities.newBlob(bytes,mime,name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return file.getUrl();
}

function appendInfoMessage_(request, user, type, message, attachmentUrl) {
  SpreadsheetApp.getActive().getSheetByName(CMS_INFO_MESSAGE_SHEET).appendRow([
    new Date(),Utilities.getUuid(),request.requestId,request.complaintNo,user.name||'',user.email||'',user.role||'',type||'Comment',message||'',attachmentUrl||''
  ]);
}

function getInfoMessages_(requestId) {
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_MESSAGE_SHEET); if(!sh||sh.getLastRow()<2)return[];
  return sh.getRange(2,1,sh.getLastRow()-1,10).getValues().filter(function(r){return String(r[2])===String(requestId);}).map(function(r){return {
    time:formatSafeDate(r[0]), sender:r[4]||'System', email:r[5]||'', role:r[6]||'', type:r[7]||'', message:r[8]||'', attachmentUrl:r[9]||''
  };});
}

function getCmsInfoRequestModule(complaintNo) {
  const user=requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  const record=getComplaintLifecycleRecord_(complaintNo);
  const requests=getInfoRequestRows_(record.complaintNo);
  const active=getActiveInfoRequest_(record.complaintNo);
  const canQa=hasPermission_(user,CMS_MODULES.INFO_REQUEST,'EDIT') && (/qa/i.test(user.role||'')||isAdminUser_(user));
  const canSales=hasPermission_(user,CMS_MODULES.INFO_REQUEST,'EDIT') && (/sales/i.test(user.role||'')||isAdminUser_(user));
  const activeAction = active
    ? (active.status === 'Sales Responded' ? 'QA_REVIEW_PENDING' : 'SALES_RESPONSE_PENDING')
    : 'NO_ACTIVE_REQUEST';
  return {
    status:'success',complaintNo:record.complaintNo,currentStage:record.stage,
    maxRequests:CMS_INFO_MAX_REQUESTS,requestCount:requests.length,remainingRequests:Math.max(0, CMS_INFO_MAX_REQUESTS - requests.length),
    activeRequest:active,activeAction:activeAction,
    requests:requests.map(function(r){r.messages=getInfoMessages_(r.requestId);return r;}),
    notifications:getCmsNotificationRows_(record.complaintNo,5),
    permissions:{
      canQa:canQa,canSales:canSales,
      canRaise:canQa&&!active&&requests.length<CMS_INFO_MAX_REQUESTS&&['Under Review','More Info Requested'].indexOf(record.stage)>=0,
      canRespond:canSales&&active&&['Open','Reopened'].indexOf(active.status)>=0,
      canReview:canQa&&active&&active.status==='Sales Responded'
    }
  };
}

function raiseCmsInfoRequest(complaintNo, question, attachmentDataUrl) {
  const user=requirePermission_(CMS_MODULES.INFO_REQUEST,'EDIT');
  if(!(/qa/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only QA Team or Admin can raise an information request');
  const q=String(question||'').trim(); if(!q)throw new Error('Information request is required');
  const lock=LockService.getDocumentLock(); lock.waitLock(30000);
  try{
    const record=getComplaintLifecycleRecord_(complaintNo);
    if(['Under Review','More Info Requested'].indexOf(record.stage)<0) throw new Error('Information request can only be raised during review');
    if(getActiveInfoRequest_(record.complaintNo)) throw new Error('One information request is already active');
    const existing=getInfoRequestRows_(record.complaintNo); if(existing.length>=CMS_INFO_MAX_REQUESTS) throw new Error('Maximum 3 information requests are allowed for one complaint');
    const requestNo=existing.length+1, requestId=record.complaintNo+'R'+requestNo, url=saveInfoAttachment_(attachmentDataUrl,record.complaintNo,'QA_Request_'+requestNo), now=new Date();
    const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_REQUEST_SHEET);
    sh.appendRow([requestId,record.complaintNo,requestNo,'Open',q,user.name||'',user.email||'',now,url,'','','','','','','','','',now]);
    const req={requestId:requestId,complaintNo:record.complaintNo}; appendInfoMessage_(req,user,'QA Request',q,url);
    appendCmsNotification_({complaintNo:record.complaintNo,requestId:requestId,type:'Info Request Raised',audienceRole:'Sales Team',title:'More information requested',message:'QA raised Request '+requestNo+' for Sales response.',createdBy:user.name,createdEmail:user.email});
    if(record.stage!=='More Info Requested'){
      const actor=user.name||user.email||'QA Team'; record.sh.getRange(record.rowNo,CMS_STATUS_COL).setValue('More Info Requested'); record.sh.getRange(record.rowNo,CMS_LAST_UPDATE_COL).setValue(now);
      record.sh.getRange(record.rowNo,record.map['Stage Owner']).setValue(getCmsStageOwner_('More Info Requested')); record.sh.getRange(record.rowNo,record.map['Stage Updated By']).setValue(actor); record.sh.getRange(record.rowNo,record.map['Stage Updated At']).setValue(now); record.sh.getRange(record.rowNo,record.map['Last Action Code']).setValue('REQUEST_MORE_INFO_P3');
      appendCmsHistory_(record.complaintNo,record.stage,'More Info Requested','Information Request '+requestNo+': '+q,actor,record.rowNo);
      appendLifecycleAudit_({complaintNo:record.complaintNo,rowNo:record.rowNo,actionCode:'REQUEST_MORE_INFO_P3',actionLabel:'Request More Information',oldStage:record.stage,newStage:'More Info Requested',remark:q,userName:user.name,userEmail:user.email,userRole:user.role});
    }
    return {status:'success',message:'Information Request '+requestNo+' raised successfully',requestId:requestId};
  }finally{lock.releaseLock();}
}

function respondCmsInfoRequest(requestId, responseText, attachmentDataUrl) {
  const user=requirePermission_(CMS_MODULES.INFO_REQUEST,'EDIT');
  if(!(/sales/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only Sales Team or Admin can respond');
  const text=String(responseText||'').trim(); if(!text&&!attachmentDataUrl)throw new Error('Add a response or attachment');
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_REQUEST_SHEET), data=sh.getDataRange().getValues(); let row=0;
  for(let i=1;i<data.length;i++)if(String(data[i][0])===String(requestId)){row=i+1;break;} if(!row)throw new Error('Request not found');
  const status=String(sh.getRange(row,4).getValue()); if(['Open','Reopened'].indexOf(status)<0)throw new Error('This request is not awaiting Sales response');
  const complaintNo=String(sh.getRange(row,2).getValue()), url=saveInfoAttachment_(attachmentDataUrl,complaintNo,'Sales_Response'); const now=new Date();
  sh.getRange(row,4).setValue('Sales Responded'); sh.getRange(row,10).setValue(text); sh.getRange(row,11).setValue(url); sh.getRange(row,12).setValue(user.name||''); sh.getRange(row,13).setValue(user.email||''); sh.getRange(row,14).setValue(now); sh.getRange(row,19).setValue(now);
  appendInfoMessage_({requestId:requestId,complaintNo:complaintNo},user,'Sales Response',text,url);
  appendCmsNotification_({complaintNo:complaintNo,requestId:requestId,type:'Sales Response',audienceRole:'QA Team',title:'Sales response received',message:'Sales submitted response for '+requestId+'. QA review is pending.',createdBy:user.name,createdEmail:user.email});
  return {status:'success',message:'Response submitted to QA for review'};
}

function reviewCmsInfoRequest(requestId, decision, comment) {
  const user=requirePermission_(CMS_MODULES.INFO_REQUEST,'EDIT');
  if(!(/qa/i.test(user.role||'')||isAdminUser_(user)))throw new Error('Only QA Team or Admin can review the response');
  const d=String(decision||'').toUpperCase(), text=String(comment||'').trim(); if(['ACCEPT','REOPEN'].indexOf(d)<0)throw new Error('Invalid review decision'); if(d==='REOPEN'&&!text)throw new Error('Reopen reason is required');
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_REQUEST_SHEET), data=sh.getDataRange().getValues(); let row=0;
  for(let i=1;i<data.length;i++)if(String(data[i][0])===String(requestId)){row=i+1;break;} if(!row)throw new Error('Request not found');
  if(String(sh.getRange(row,4).getValue())!=='Sales Responded')throw new Error('Sales response is not ready for QA review');
  const complaintNo=String(sh.getRange(row,2).getValue()), now=new Date(), req={requestId:requestId,complaintNo:complaintNo};
  if(d==='ACCEPT'){
    sh.getRange(row,4).setValue('Closed'); sh.getRange(row,15).setValue(text||'Response accepted by QA'); sh.getRange(row,16).setValue(user.name||''); sh.getRange(row,17).setValue(user.email||''); sh.getRange(row,18).setValue(now);
    appendInfoMessage_(req,user,'QA Accepted',text||'Response accepted and request closed','');
    appendCmsNotification_({complaintNo:complaintNo,requestId:requestId,type:'Request Closed',audienceRole:'Sales Team',title:'Information request accepted',message:'QA accepted and closed '+requestId+'.',createdBy:user.name,createdEmail:user.email});
  }else{
    sh.getRange(row,4).setValue('Reopened'); sh.getRange(row,15).setValue(text); appendInfoMessage_(req,user,'QA Reopened',text,'');
    appendCmsNotification_({complaintNo:complaintNo,requestId:requestId,type:'Request Reopened',audienceRole:'Sales Team',title:'Information request reopened',message:'QA reopened '+requestId+'. Sales response is required again.',createdBy:user.name,createdEmail:user.email});
  }
  sh.getRange(row,19).setValue(now);
  return {status:'success',message:d==='ACCEPT'?'Request closed by QA':'Request reopened for Sales response'};
}

function addCmsInfoRequestComment(requestId, message, attachmentDataUrl) {
  const user=requirePermission_(CMS_MODULES.INFO_REQUEST,'EDIT'); const text=String(message||'').trim(); if(!text&&!attachmentDataUrl)throw new Error('Add a comment or attachment');
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INFO_REQUEST_SHEET), data=sh.getDataRange().getValues(); let complaintNo='';
  for(let i=1;i<data.length;i++)if(String(data[i][0])===String(requestId)){complaintNo=String(data[i][1]);break;} if(!complaintNo)throw new Error('Request not found');
  const url=saveInfoAttachment_(attachmentDataUrl,complaintNo,'Request_Comment'); appendInfoMessage_({requestId:requestId,complaintNo:complaintNo},user,'Comment',text,url);
  appendCmsNotification_({complaintNo:complaintNo,requestId:requestId,type:'Comment',audienceRole:'QA Team / Sales Team',title:'New request comment',message:'A new comment was added on '+requestId+'.',createdBy:user.name,createdEmail:user.email});
  return {status:'success',message:'Comment added'};
}


/* =====================================================================
   P4 - INVESTIGATION WORKSPACE + CAPA DOCUMENT WORKFLOW
   ===================================================================== */
const CMS_INVESTIGATION_SHEET = 'CMS_Investigations';
const CMS_CAPA_DOCUMENT_SHEET = 'CMS_CAPA_Documents';

function setupCmsInvestigationCapaP4() {
  setupCmsInfoRequestP3();
  const ss = SpreadsheetApp.getActive();
  let inv = ss.getSheetByName(CMS_INVESTIGATION_SHEET);
  if (!inv) {
    inv = ss.insertSheet(CMS_INVESTIGATION_SHEET);
    inv.appendRow([
      'Investigation ID','Complaint No','Status','Started At','Started By','Started Email',
      'Investigation Summary','Root Cause','Batch Findings','Sample / Testing Details',
      'Conclusion','Supporting Attachment URL','Last Saved At','Last Saved By',
      'Completed At','Completed By','Completed Email'
    ]);
    inv.setFrozenRows(1);
  }
  let capa = ss.getSheetByName(CMS_CAPA_DOCUMENT_SHEET);
  if (!capa) {
    capa = ss.insertSheet(CMS_CAPA_DOCUMENT_SHEET);
    capa.appendRow([
      'CAPA Record ID','Complaint No','Version','Document URL','File Name','Corrective Action',
      'Preventive Action','QA Remark','Uploaded At','Uploaded By','Uploaded Email','Status',
      'Revision Reason','Revision Requested At','Revision Requested By','Revision Requested Email',
      'Sales Verification Remark','Verified At','Verified By','Verified Email'
    ]);
    capa.setFrozenRows(1);
  }
  return {status:'success',message:'P4 Investigation and CAPA workspace ready'};
}

function findInvestigationRow_(complaintNo) {
  setupCmsInvestigationCapaP4();
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_INVESTIGATION_SHEET);
  if(sh.getLastRow()<2) return {sheet:sh,row:0,data:null};
  const data=sh.getRange(2,1,sh.getLastRow()-1,17).getValues();
  for(let i=0;i<data.length;i++) if(String(data[i][1]).trim()===String(complaintNo).trim()) return {sheet:sh,row:i+2,data:data[i]};
  return {sheet:sh,row:0,data:null};
}

function latestCapaRecord_(complaintNo) {
  setupCmsInvestigationCapaP4();
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_CAPA_DOCUMENT_SHEET);
  if(sh.getLastRow()<2) return null;
  const data=sh.getRange(2,1,sh.getLastRow()-1,20).getValues();
  let found=null;
  data.forEach(function(r,i){
    if(String(r[1]).trim()===String(complaintNo).trim()) found={row:i+2,recordId:r[0],complaintNo:r[1],version:Number(r[2]||0),documentUrl:r[3]||'',fileName:r[4]||'',correctiveAction:r[5]||'',preventiveAction:r[6]||'',qaRemark:r[7]||'',uploadedAt:formatSafeDate(r[8]),uploadedBy:r[9]||'',uploadedEmail:r[10]||'',status:r[11]||'',revisionReason:r[12]||'',revisionRequestedAt:formatSafeDate(r[13]),revisionRequestedBy:r[14]||'',revisionRequestedEmail:r[15]||'',salesVerificationRemark:r[16]||'',verifiedAt:formatSafeDate(r[17]),verifiedBy:r[18]||'',verifiedEmail:r[19]||''};
  });
  return found;
}

function saveP4Attachment_(dataUrl, complaintNo, prefix) {
  if(!dataUrl) return {url:'',name:''};
  const match=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if(!match) throw new Error('Invalid file data');
  const mime=match[1], bytes=Utilities.base64Decode(match[2]);
  const extMap={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx'};
  const ext=extMap[mime] || (mime.split('/')[1]||'bin').replace(/[^a-z0-9]/gi,'');
  const name=prefix+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss')+'.'+ext;
  const file=getOrCreateComplaintFolder_(complaintNo).createFile(Utilities.newBlob(bytes,mime,name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return {url:file.getUrl(),name:name};
}

function getCmsInvestigationCapaWorkspace(complaintNo) {
  const user=requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  const record=getComplaintLifecycleRecord_(complaintNo);
  const inv=findInvestigationRow_(record.complaintNo);
  const d=inv.data;
  const latest=latestCapaRecord_(record.complaintNo);
  const isQa=(/qa/i.test(user.role||'')||isAdminUser_(user));
  const isSales=(/sales/i.test(user.role||'')||isAdminUser_(user));
  const canInvEdit=isQa&&hasPermission_(user,CMS_MODULES.INVESTIGATION,'EDIT')&&record.stage==='Under Investigation';
  const canUpload=isQa&&hasPermission_(user,CMS_MODULES.CAPA_UPLOAD,'EDIT')&&(
    record.stage==='Investigation Complete' || (record.stage==='CAPA Uploaded'&&record.capaSubStatus==='Revision Requested')
  );
  const canSalesAction=isSales&&hasPermission_(user,CMS_MODULES.CAPA_VERIFY,'EDIT')&&record.stage==='CAPA Uploaded'&&record.capaSubStatus!=='Revision Requested'&&!!latest;
  return {
    status:'success', complaintNo:record.complaintNo, currentStage:record.stage,
    capaSubStatus:record.capaSubStatus, capaVersion:record.capaVersion,
    investigation:d?{status:d[2]||'',startedAt:formatSafeDate(d[3]),startedBy:d[4]||'',summary:d[6]||'',rootCause:d[7]||'',batchFindings:d[8]||'',testingDetails:d[9]||'',conclusion:d[10]||'',attachmentUrl:d[11]||'',lastSavedAt:formatSafeDate(d[12]),lastSavedBy:d[13]||'',completedAt:formatSafeDate(d[14]),completedBy:d[15]||''}:null,
    capa:latest,
    permissions:{canInvestigationEdit:canInvEdit,canCompleteInvestigation:canInvEdit,canUploadCapa:canUpload,canVerifyCapa:canSalesAction,canRequestRevision:canSalesAction}
  };
}

function saveCmsInvestigation(complaintNo, payload, completeNow) {
  const user=requirePermission_(CMS_MODULES.INVESTIGATION,'EDIT');
  if(!(/qa/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only QA Team or Admin can update investigation');
  const record=getComplaintLifecycleRecord_(complaintNo);
  if(record.stage!=='Under Investigation') throw new Error('Investigation can only be updated in Under Investigation stage');
  const p=payload||{}, summary=String(p.summary||'').trim(), root=String(p.rootCause||'').trim(), conclusion=String(p.conclusion||'').trim();
  if(completeNow && (!summary||!root||!conclusion)) throw new Error('Investigation Summary, Root Cause and Conclusion are required to complete investigation');
  const attachment=saveP4Attachment_(p.attachmentDataUrl,record.complaintNo,'Investigation_Evidence');
  const found=findInvestigationRow_(record.complaintNo), sh=found.sheet, now=new Date(), actor=user.name||user.email||'QA Team';
  if(!found.row){
    sh.appendRow([Utilities.getUuid(),record.complaintNo,completeNow?'Completed':'Draft',now,actor,user.email||'',summary,root,String(p.batchFindings||'').trim(),String(p.testingDetails||'').trim(),conclusion,attachment.url,now,actor,completeNow?now:'',completeNow?actor:'',completeNow?(user.email||''):'']);
  }else{
    const old=found.data;
    sh.getRange(found.row,3,1,15).setValues([[
      completeNow?'Completed':'Draft', old[3]||now, old[4]||actor, old[5]||user.email||'', summary, root,
      String(p.batchFindings||'').trim(),String(p.testingDetails||'').trim(),conclusion,attachment.url||old[11]||'',now,actor,
      completeNow?now:(old[14]||''),completeNow?actor:(old[15]||''),completeNow?(user.email||''):(old[16]||'')
    ]]);
  }
  if(completeNow) return executeCmsLifecycleAction(record.complaintNo,'COMPLETE_INVESTIGATION','Investigation completed. '+conclusion);
  return {status:'success',message:'Investigation draft saved',complaintNo:record.complaintNo};
}

function uploadCmsCapaDocument(complaintNo, payload) {
  const user=requirePermission_(CMS_MODULES.CAPA_UPLOAD,'EDIT');
  if(!(/qa/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only QA Team or Admin can upload CAPA');
  const record=getComplaintLifecycleRecord_(complaintNo), p=payload||{};
  const isRevision=record.stage==='CAPA Uploaded'&&record.capaSubStatus==='Revision Requested';
  if(!(record.stage==='Investigation Complete'||isRevision)) throw new Error('CAPA upload is not allowed at the current stage');
  if(!p.documentDataUrl) throw new Error('CAPA document is required');
  const corrective=String(p.correctiveAction||'').trim(), preventive=String(p.preventiveAction||'').trim();
  if(!corrective||!preventive) throw new Error('Corrective Action and Preventive Action are required');
  const nextVersion=Math.max(1,Number(record.capaVersion||0)+1), file=saveP4Attachment_(p.documentDataUrl,record.complaintNo,'CAPA_V'+nextVersion), now=new Date();
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_CAPA_DOCUMENT_SHEET);
  sh.appendRow([Utilities.getUuid(),record.complaintNo,nextVersion,file.url,file.name,corrective,preventive,String(p.qaRemark||'').trim(),now,user.name||'',user.email||'','Awaiting Sales Verification','','','','','','','','']);
  const action=isRevision?'UPLOAD_REVISED_CAPA':'MARK_CAPA_UPLOADED';
  return executeCmsLifecycleAction(record.complaintNo,action,'CAPA Version '+nextVersion+' uploaded: '+file.name);
}

function requestCmsCapaRevision(complaintNo, reason) {
  const user=requirePermission_(CMS_MODULES.CAPA_VERIFY,'EDIT');
  if(!(/sales/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only Sales Team or Admin can request CAPA revision');
  const text=String(reason||'').trim(); if(!text) throw new Error('Revision reason is required');
  const record=getComplaintLifecycleRecord_(complaintNo), latest=latestCapaRecord_(record.complaintNo);
  if(!latest) throw new Error('CAPA document not found');
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_CAPA_DOCUMENT_SHEET), now=new Date();
  sh.getRange(latest.row,12).setValue('Revision Requested'); sh.getRange(latest.row,13).setValue(text); sh.getRange(latest.row,14).setValue(now); sh.getRange(latest.row,15).setValue(user.name||''); sh.getRange(latest.row,16).setValue(user.email||'');
  return executeCmsLifecycleAction(record.complaintNo,'REQUEST_CAPA_REVISION',text);
}

function verifyCmsCapaDocument(complaintNo, remark) {
  const user=requirePermission_(CMS_MODULES.CAPA_VERIFY,'EDIT');
  if(!(/sales/i.test(user.role||'')||isAdminUser_(user))) throw new Error('Only Sales Team or Admin can verify CAPA');
  const text=String(remark||'').trim(); if(!text) throw new Error('Verification remark is required');
  const record=getComplaintLifecycleRecord_(complaintNo), latest=latestCapaRecord_(record.complaintNo);
  if(!latest) throw new Error('CAPA document not found');
  const sh=SpreadsheetApp.getActive().getSheetByName(CMS_CAPA_DOCUMENT_SHEET), now=new Date();
  sh.getRange(latest.row,12).setValue('Verified'); sh.getRange(latest.row,17).setValue(text); sh.getRange(latest.row,18).setValue(now); sh.getRange(latest.row,19).setValue(user.name||''); sh.getRange(latest.row,20).setValue(user.email||'');
  return executeCmsLifecycleAction(record.complaintNo,'VERIFY_CAPA',text);
}

/************** P5 FINANCIAL YEAR DASHBOARD SETUP *****************/
function setupCmsFyDashboardP5() {
  setupCmsInvestigationCapaP4();
  getCmsFinancialYearOptions_();
  return {status:'success', message:'P5 Financial Year dashboard is ready'};
}

/************** P5 STABLE CORE FIX - override FY/data function *****************/
function getCmsTrackingDataLegacy(fyKey) {
  requirePermission_(CMS_MODULES.COMPLAINT_VIEW,'VIEW');
  setupCmsTrackingV2();
  const sh = getComplaintSheet_();
  const map = ensureLifecycleMetaColumns_(sh);
  const lastRow = sh.getLastRow();
  const fyOptions = getCmsFinancialYearOptions_();
  const selectedFY = String(fyKey || 'ALL').trim() || 'ALL';

  if (lastRow < 2) {
    return {status:'success',selectedFY:selectedFY,fyOptions:fyOptions,cards:{total:0,open:0,closed:0,overdue:0},rows:[],analytics:{byStage:[],bySeverity:[],monthlyTrend:[]},stageCounts:{},severityCounts:{}};
  }

  const data = sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues();
  const rows = [];
  data.forEach(function(r,i){
    const complaintNo = r[COMPLAINT_COL.COMPLAINT_NO-1];
    if (!complaintNo) return;
    const status = normalizeCmsStatus_(r[CMS_STATUS_COL-1] || 'Complaint Booked');
    const complaintDate = r[COMPLAINT_COL.COMPLAINT_DATE-1];
    const fy = getIndianFYKeyFromDate_(complaintDate);
    if (selectedFY !== 'ALL' && selectedFY && fy !== selectedFY) return;
    rows.push({
      rowNo:i+2,
      complaintNo:complaintNo,
      date:formatSafeDate(complaintDate),
      fy:fy,
      customer:r[COMPLAINT_COL.LOCATION-1]||'',
      product:r[COMPLAINT_COL.ITEM_NAME-1]||'',
      batch:r[COMPLAINT_COL.BATCH_NO-1]||'',
      severity:r[COMPLAINT_COL.SEVERITY-1]||'',
      issue:r[COMPLAINT_COL.ISSUES-1]||'',
      city:r[COMPLAINT_COL.CITY-1]||'',
      state:r[COMPLAINT_COL.STATE-1]||'',
      qty:r[COMPLAINT_COL.QTY_AFFECTED-1]||'',
      sample:r[COMPLAINT_COL.SAMPLE_AVAILABLE-1]||'',
      pdfUrl:r[COMPLAINT_COL.PDF_URL-1]||'',
      folderUrl:r[COMPLAINT_COL.FOLDER_URL-1]||'',
      whatsappStatus:r[COMPLAINT_COL.WA_STATUS-1]||'',
      status:status,
      stageOwner:r[(map['Stage Owner']||1)-1]||getCmsStageOwner_(status),
      capaSubStatus:r[(map['CAPA Sub Status']||1)-1]||'',
      capaVersion:r[(map['CAPA Version']||1)-1]||'',
      lastUpdated:formatSafeDate(r[CMS_LAST_UPDATE_COL-1]),
      ageDays:getAgeDays_(complaintDate)
    });
  });

  const cards = {
    total: rows.length,
    open: rows.filter(function(x){return x.status !== 'Case Closed';}).length,
    closed: rows.filter(function(x){return x.status === 'Case Closed';}).length,
    overdue: rows.filter(function(x){return x.status !== 'Case Closed' && Number(x.ageDays)>7;}).length
  };
  const analytics = buildCmsFyAnalytics_(rows);
  const stageCounts = {};
  const severityCounts = {};
  (analytics.byStage || []).forEach(function(x){ stageCounts[x.label] = x.count; });
  (analytics.bySeverity || []).forEach(function(x){ severityCounts[x.label] = x.count; });
  rows.sort(function(a,b){return b.rowNo-a.rowNo;});
  return {status:'success',selectedFY:selectedFY,fyOptions:fyOptions,cards:cards,rows:rows,analytics:analytics,stageCounts:stageCounts,severityCounts:severityCounts};
}

function setupCmsFyDashboardP5() {
  setupCmsInvestigationCapaP4();
  return {status:'success', message:'P5 FY dashboard stable core ready'};
}

/************** P5.3 INVESTIGATION + CAPA UI FINAL POLISH HELPERS *****************/
function setupCmsInvestigationCapaP5_3() {
  setupCmsInvestigationCapaP4();
  if (typeof setupCmsInfoRequestAlertsP5_2 === 'function') setupCmsInfoRequestAlertsP5_2();
  return {status:'success', message:'P5.3 Investigation and CAPA UI polish is ready'};
}

function getCmsCapaVersionHistory_(complaintNo) {
  setupCmsInvestigationCapaP4();
  const sh = SpreadsheetApp.getActive().getSheetByName(CMS_CAPA_DOCUMENT_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  const rows = [];
  data.forEach(function(r, i) {
    if (String(r[1]).trim() !== String(complaintNo).trim()) return;
    rows.push({
      row: i + 2,
      recordId: r[0] || '',
      complaintNo: r[1] || '',
      version: Number(r[2] || 0),
      documentUrl: r[3] || '',
      fileName: r[4] || '',
      correctiveAction: r[5] || '',
      preventiveAction: r[6] || '',
      qaRemark: r[7] || '',
      uploadedAt: formatSafeDate(r[8]),
      uploadedBy: r[9] || '',
      uploadedEmail: r[10] || '',
      status: r[11] || '',
      revisionReason: r[12] || '',
      revisionRequestedAt: formatSafeDate(r[13]),
      revisionRequestedBy: r[14] || '',
      revisionRequestedEmail: r[15] || '',
      salesVerificationRemark: r[16] || '',
      verifiedAt: formatSafeDate(r[17]),
      verifiedBy: r[18] || '',
      verifiedEmail: r[19] || ''
    });
  });
  rows.sort(function(a,b){ return Number(b.version || 0) - Number(a.version || 0); });
  return rows;
}

function buildP53WorkspaceChecklist_(record, inv, latestCapa) {
  const invData = inv && inv.data ? inv.data : null;
  const checklist = [];
  checklist.push({label:'Investigation started', done: ['Under Investigation','Investigation Complete','CAPA Uploaded','CAPA Verified','Case Closed'].indexOf(record.stage) >= 0});
  checklist.push({label:'Investigation summary saved', done: !!(invData && invData[6])});
  checklist.push({label:'Root cause captured', done: !!(invData && invData[7])});
  checklist.push({label:'Conclusion captured', done: !!(invData && invData[10])});
  checklist.push({label:'Investigation completed', done: ['Investigation Complete','CAPA Uploaded','CAPA Verified','Case Closed'].indexOf(record.stage) >= 0});
  checklist.push({label:'CAPA document uploaded', done: !!(latestCapa && latestCapa.documentUrl)});
  checklist.push({label:'Awaiting/Completed Sales review', done: ['Awaiting Sales Verification','Verified','Revision Requested'].indexOf(record.capaSubStatus) >= 0 || record.stage === 'Case Closed'});
  checklist.push({label:'Case closed', done: record.stage === 'Case Closed'});
  return checklist;
}

// Override P4 workspace data with version history and checklist for P5.3 UI.
function getCmsInvestigationCapaWorkspace(complaintNo) {
  const user = requirePermission_(CMS_MODULES.COMPLAINT_VIEW, 'VIEW');
  const record = getComplaintLifecycleRecord_(complaintNo);
  const inv = findInvestigationRow_(record.complaintNo);
  const d = inv.data;
  const latest = latestCapaRecord_(record.complaintNo);
  const capaHistory = getCmsCapaVersionHistory_(record.complaintNo);
  const isQa = (/qa/i.test(user.role || '') || isAdminUser_(user));
  const isSales = (/sales/i.test(user.role || '') || isAdminUser_(user));
  const canInvEdit = isQa && hasPermission_(user, CMS_MODULES.INVESTIGATION, 'EDIT') && record.stage === 'Under Investigation';
  const canUpload = isQa && hasPermission_(user, CMS_MODULES.CAPA_UPLOAD, 'EDIT') && (
    record.stage === 'Investigation Complete' || (record.stage === 'CAPA Uploaded' && record.capaSubStatus === 'Revision Requested')
  );
  const canSalesAction = isSales && hasPermission_(user, CMS_MODULES.CAPA_VERIFY, 'EDIT') && record.stage === 'CAPA Uploaded' && record.capaSubStatus !== 'Revision Requested' && !!latest;
  return {
    status:'success',
    complaintNo:record.complaintNo,
    currentStage:record.stage,
    stageOwner:getCmsStageOwner_(record.stage),
    capaSubStatus:record.capaSubStatus,
    capaVersion:record.capaVersion,
    checklist:buildP53WorkspaceChecklist_(record, inv, latest),
    investigation:d ? {
      status:d[2] || '', startedAt:formatSafeDate(d[3]), startedBy:d[4] || '', startedEmail:d[5] || '',
      summary:d[6] || '', rootCause:d[7] || '', batchFindings:d[8] || '', testingDetails:d[9] || '', conclusion:d[10] || '',
      attachmentUrl:d[11] || '', lastSavedAt:formatSafeDate(d[12]), lastSavedBy:d[13] || '', completedAt:formatSafeDate(d[14]), completedBy:d[15] || ''
    } : null,
    capa:latest,
    capaHistory:capaHistory,
    permissions:{
      canInvestigationEdit:canInvEdit,
      canCompleteInvestigation:canInvEdit,
      canUploadCapa:canUpload,
      canVerifyCapa:canSalesAction,
      canRequestRevision:canSalesAction
    }
  };
}


function setupCmsWorkspaceP5_4() {
  setupCmsInvestigationCapaP5_3();
  return {status:'success', message:'P5.4 Full Screen Complaint Workspace setup ready'};
}

/* =====================================================================
   P5.4.2 - SIMPLE FAST WORKSPACE BACKEND WRAPPERS
   Purpose: offline hard-copy investigation remains source of detail;
   CMS only tracks stage, More Info requests, CAPA upload, approval/revision.
   ===================================================================== */
function setupCmsSimpleFastWorkspaceP5_4_2() {
  setupCmsWorkspaceP5_4();
  return {status:'success', message:'P5.4.2 Simple Fast Workspace setup ready'};
}

function markCmsInvestigationCompleteSimple(complaintNo, remark) {
  const text = String(remark || '').trim() || 'Investigation completed as per offline hard-copy process.';
  return saveCmsInvestigation(complaintNo, {
    summary: text,
    rootCause: 'As per offline investigation/CAPA hard-copy record.',
    batchFindings: '',
    testingDetails: '',
    conclusion: 'Investigation completed. CAPA document upload pending/next as applicable.',
    attachmentDataUrl: ''
  }, true);
}

function uploadCmsCapaDocumentSimple(complaintNo, payload) {
  payload = payload || {};
  return uploadCmsCapaDocument(complaintNo, {
    documentDataUrl: payload.documentDataUrl || '',
    correctiveAction: payload.correctiveAction || 'As per uploaded CAPA document.',
    preventiveAction: payload.preventiveAction || 'As per uploaded CAPA document.',
    qaRemark: payload.qaRemark || ''
  });
}

function verifyCmsCapaDocumentSimple(complaintNo, remark) {
  return verifyCmsCapaDocument(complaintNo, String(remark || '').trim() || 'CAPA document reviewed and approved.');
}


/* =====================================================================
   P5.5 - FORM UX + SESSION HARDENING HELPERS
   Optional Google Places activation uses Script Property: CMS_GOOGLE_MAPS_API_KEY
   ===================================================================== */
function setupCmsFormUxP5_5() {
  setupCmsSimpleFastWorkspaceP5_4_2();
  return {
    status: 'success',
    message: 'P5.5 Form UX, Google Places base and session hardening setup ready',
    googlePlacesConfigured: !!PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY')
  };
}

function getCmsClientConfigP5_5() {
  const user = getCurrentUserAccess_();
  return {
    status: 'success',
    user: {email:user.email, name:user.name, role:user.role, permissions:user.permissions},
    googlePlacesEnabled: !!PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY'),
    sessionCheckedAt: new Date().toISOString()
  };
}

function keepCmsSessionAliveP5_5() {
  const u = getCurrentUserAccess_();
  return {status:'active', email:u.email, name:u.name, role:u.role, checkedAt:new Date().toISOString()};
}


/* =====================================================================
   P5.5.1 - GOOGLE PLACES ACTIVE INTEGRATION + OLD BATCH FETCH RESTORE
   ===================================================================== */
function setupCmsFormUxP5_5_1() {
  return setupCmsFormUxP5_5();
}

function getCmsGoogleMapsApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY') || '';
}


/* =====================================================================
   P5.5.2 - PLACES SEARCH MODAL + HOSPITAL MASTER AUTO-APPEND
   - Master is primary search
   - Google is secondary search
   - Google selected hospital is saved/updated in Hospital_Master with unique ID
   - Central setup function for all CMS upgrades
   ===================================================================== */
const CMS_HOSPITAL_MASTER_DEFAULT_SHEET = 'Hospital_Master';
const CMS_HOSPITAL_MASTER_HEADERS = [
  'Hospital ID','Hospital Name','Address','City','State','Pincode','Phone Number','Google Place ID',
  'Source','Rating','Website','Latitude','Longitude','Active','Created At','Updated At','Last Selected At'
];

function setupCmsHospitalMasterP5_5_2() {
  const ss = SpreadsheetApp.getActive();
  const sheetName = PropertiesService.getScriptProperties().getProperty('CMS_HOSPITAL_MASTER_SHEET') || CMS_HOSPITAL_MASTER_DEFAULT_SHEET;
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) sh.appendRow(CMS_HOSPITAL_MASTER_HEADERS);

  const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  CMS_HOSPITAL_MASTER_HEADERS.forEach(function(h) {
    if (existing.indexOf(h) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
      existing.push(h);
    }
  });
  sh.setFrozenRows(1);
  return {status:'success', message:'Hospital master ready', sheetName:sheetName};
}

function setupCmsSystemUpgradeAll() {
  const results = [];
  function run_(name, fn) {
    try {
      if (typeof fn === 'function') results.push({step:name, result:fn()});
      else results.push({step:name, result:{status:'skipped', message:'Function not found'}});
    } catch (err) {
      results.push({step:name, result:{status:'error', message:err.message || String(err)}});
    }
  }

  run_('Access Control', typeof setupCmsAccessControl !== 'undefined' ? setupCmsAccessControl : null);
  run_('Lifecycle P2', typeof setupCmsLifecycleP2 !== 'undefined' ? setupCmsLifecycleP2 : null);
  run_('Info Request P3', typeof setupCmsInfoRequestP3 !== 'undefined' ? setupCmsInfoRequestP3 : null);
  run_('Investigation/CAPA P4', typeof setupCmsInvestigationCapaP4 !== 'undefined' ? setupCmsInvestigationCapaP4 : null);
  run_('FY Dashboard P5', typeof setupCmsFyDashboardP5 !== 'undefined' ? setupCmsFyDashboardP5 : null);
  run_('Simple Fast Workspace P5.4.2', typeof setupCmsSimpleFastWorkspaceP5_4_2 !== 'undefined' ? setupCmsSimpleFastWorkspaceP5_4_2 : null);
  run_('Form UX P5.5', typeof setupCmsFormUxP5_5 !== 'undefined' ? setupCmsFormUxP5_5 : null);
  run_('Hospital Master P5.5.2', setupCmsHospitalMasterP5_5_2);

  return {status:'success', message:'All CMS setup/update functions completed', results:results};
}

function setupCmsPlacesSearchP5_5_2() {
  setupCmsSystemUpgradeAll();
  return {
    status:'success',
    message:'P5.5.2 Places Search Modal + old batch fetch restore ready',
    hospitalMaster: setupCmsHospitalMasterP5_5_2(),
    googlePlacesConfigured: !!String(PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY') || '').trim()
  };
}

function getCmsGoogleMapsApiKeyStrict_() {
  const key = String(PropertiesService.getScriptProperties().getProperty('CMS_GOOGLE_MAPS_API_KEY') || '').trim();
  if (!key) throw new Error('CMS_GOOGLE_MAPS_API_KEY missing in Script Properties');
  return key;
}

function getCmsHospitalMasterSheet_() {
  setupCmsHospitalMasterP5_5_2();
  const sheetName = PropertiesService.getScriptProperties().getProperty('CMS_HOSPITAL_MASTER_SHEET') || CMS_HOSPITAL_MASTER_DEFAULT_SHEET;
  return SpreadsheetApp.getActive().getSheetByName(sheetName);
}

function getCmsHospitalHeaderMap_(sh) {
  const headers = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(String);
  const map = {};
  headers.forEach(function(h,i){ if (h) map[h] = i + 1; });
  return map;
}

function normalizeCmsSearchKey_(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function generateCmsHospitalId_() {
  const props = PropertiesService.getDocumentProperties();
  const key = 'CMS_HOSPITAL_MASTER_SEQ';
  const next = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(next));
  return 'HOSP' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + ('00000' + next).slice(-5);
}

function parseCmsGoogleAddressComponents_(components) {
  const out = { city:'', state:'', pincode:'' };
  (components || []).forEach(function(c) {
    const types = c.types || [];
    if (!out.pincode && types.indexOf('postal_code') > -1) out.pincode = c.long_name || c.short_name || '';
    if (!out.state && types.indexOf('administrative_area_level_1') > -1) out.state = c.long_name || c.short_name || '';
    if (!out.city && (types.indexOf('locality') > -1 || types.indexOf('administrative_area_level_3') > -1 || types.indexOf('postal_town') > -1 || types.indexOf('sublocality_level_1') > -1)) out.city = c.long_name || c.short_name || '';
  });
  return out;
}

function findHospitalMasterRow_(payload) {
  const sh = getCmsHospitalMasterSheet_();
  if (sh.getLastRow() < 2) return {sheet:sh, map:getCmsHospitalHeaderMap_(sh), row:0};
  const map = getCmsHospitalHeaderMap_(sh);
  const values = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  const placeId = String(payload.placeId || payload.googlePlaceId || '').trim();
  const nameKey = normalizeCmsSearchKey_(payload.hospitalName || payload.name || '');
  const pin = String(payload.pincode || '').replace(/\D/g,'');

  for (let i=0; i<values.length; i++) {
    const r = values[i];
    const rowPlace = String(r[(map['Google Place ID'] || 8)-1] || '').trim();
    if (placeId && rowPlace && rowPlace === placeId) return {sheet:sh, map:map, row:i+2};
  }
  for (let i=0; i<values.length; i++) {
    const r = values[i];
    const rowName = normalizeCmsSearchKey_(r[(map['Hospital Name'] || 2)-1] || '');
    const rowPin = String(r[(map['Pincode'] || 6)-1] || '').replace(/\D/g,'');
    if (nameKey && rowName === nameKey && (!pin || !rowPin || pin === rowPin)) return {sheet:sh, map:map, row:i+2};
  }
  return {sheet:sh, map:map, row:0};
}

function upsertCmsHospitalMaster_(payload) {
  payload = payload || {};
  const found = findHospitalMasterRow_(payload);
  const sh = found.sheet;
  const map = found.map;
  const now = new Date();
  const row = found.row || sh.getLastRow() + 1;

  function set_(header, value) {
    if (map[header]) sh.getRange(row, map[header]).setValue(value == null ? '' : value);
  }
  const existingId = found.row && map['Hospital ID'] ? sh.getRange(row, map['Hospital ID']).getValue() : '';
  const hospitalId = existingId || generateCmsHospitalId_();

  set_('Hospital ID', hospitalId);
  set_('Hospital Name', payload.hospitalName || payload.name || '');
  set_('Address', payload.address || '');
  set_('City', payload.city || '');
  set_('State', payload.state || '');
  set_('Pincode', payload.pincode || '');
  set_('Phone Number', payload.phoneNumber || payload.phone || '');
  set_('Google Place ID', payload.placeId || payload.googlePlaceId || '');
  set_('Source', payload.source || 'GOOGLE');
  set_('Rating', payload.rating || '');
  set_('Website', payload.website || '');
  set_('Latitude', payload.lat || '');
  set_('Longitude', payload.lng || '');
  set_('Active', 'Yes');
  if (!found.row) set_('Created At', now);
  set_('Updated At', now);
  set_('Last Selected At', now);

  return Object.assign({}, payload, {hospitalId:hospitalId, savedToMaster:true, masterRow:row});
}

function searchCmsHospitalMaster(query) {
  query = normalizeCmsSearchKey_(query);
  const sh = getCmsHospitalMasterSheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  const map = getCmsHospitalHeaderMap_(sh);
  const rows = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  const out = [];
  rows.forEach(function(r) {
    const active = String(r[(map['Active'] || 14)-1] || 'Yes').toLowerCase() !== 'no';
    if (!active) return;
    const name = String(r[(map['Hospital Name'] || 2)-1] || '');
    const address = String(r[(map['Address'] || 3)-1] || '');
    const city = String(r[(map['City'] || 4)-1] || '');
    const pincode = String(r[(map['Pincode'] || 6)-1] || '');
    const hay = normalizeCmsSearchKey_([name,address,city,pincode].join(' '));
    if (!query || hay.indexOf(query) > -1) {
      out.push({
        source:'MASTER',
        hospitalId:r[(map['Hospital ID'] || 1)-1] || '',
        hospitalName:name,
        address:address,
        city:city,
        state:r[(map['State'] || 5)-1] || '',
        pincode:pincode,
        phoneNumber:r[(map['Phone Number'] || 7)-1] || '',
        placeId:r[(map['Google Place ID'] || 8)-1] || '',
        rating:r[(map['Rating'] || 10)-1] || '',
        website:r[(map['Website'] || 11)-1] || ''
      });
    }
  });
  return out.slice(0, 25);
}

function searchCmsGoogleHospitals(query) {
  query = String(query || '').trim();
  if (!query) throw new Error('Please type hospital/customer name first');
  const key = getCmsGoogleMapsApiKeyStrict_();
  const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=' + encodeURIComponent(query + ' hospital India') + '&type=hospital&key=' + encodeURIComponent(key);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
  const data = JSON.parse(res.getContentText() || '{}');
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error('Google Places error: ' + data.status + ' | ' + (data.error_message || ''));
  return (data.results || []).slice(0, 10).map(function(p) {
    return {source:'GOOGLE', hospitalName:p.name || '', address:p.formatted_address || '', city:'', state:'', pincode:'', phoneNumber:'', placeId:p.place_id || '', rating:p.rating || '', userRatingsTotal:p.user_ratings_total || ''};
  });
}

function getCmsGoogleHospitalDetails(placeId) {
  placeId = String(placeId || '').trim();
  if (!placeId) throw new Error('Missing Google place id');
  const key = getCmsGoogleMapsApiKeyStrict_();
  const fields = ['name','formatted_address','formatted_phone_number','international_phone_number','place_id','address_components','geometry','website','rating'].join(',');
  const url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + encodeURIComponent(placeId) + '&fields=' + encodeURIComponent(fields) + '&key=' + encodeURIComponent(key);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
  const data = JSON.parse(res.getContentText() || '{}');
  if (data.status !== 'OK') throw new Error('Google Place Details error: ' + data.status + ' | ' + (data.error_message || ''));
  const p = data.result || {};
  const parsed = parseCmsGoogleAddressComponents_(p.address_components || []);
  const details = {
    source:'GOOGLE',
    hospitalName:p.name || '',
    address:p.formatted_address || '',
    city:parsed.city || '',
    state:parsed.state || '',
    pincode:parsed.pincode || '',
    phoneNumber:p.formatted_phone_number || p.international_phone_number || '',
    placeId:p.place_id || placeId,
    website:p.website || '',
    rating:p.rating || '',
    lat:p.geometry && p.geometry.location ? p.geometry.location.lat : '',
    lng:p.geometry && p.geometry.location ? p.geometry.location.lng : ''
  };
  return upsertCmsHospitalMaster_(details);
}

function saveCmsHospitalMasterSelection(hospitalPayload) {
  return upsertCmsHospitalMaster_(hospitalPayload || {});
}

/** P5.5.3 public wrapper: save/update selected hospital to Hospital_Master */
function saveCmsHospitalToMaster(hospitalPayload) {
  return upsertCmsHospitalMaster_(hospitalPayload || {});
}


/* =====================================================================
   P5.6 - FAST ROLE STAGE + CAPA WORKSPACE
   Purpose: single fast workspace call. CMS tracks stages, More Info,
   CAPA upload/read/approval. Offline hard-copy remains investigation detail.
   ===================================================================== */
function setupCmsFastStageCapaP5_6() {
  setupCmsSystemUpgradeAll();
  return {status:'success', message:'P5.6 Fast Role Stage + CAPA Workspace setup ready'};
}

function getCmsFastWorkspaceData(complaintNo) {
  const user = requirePermission_(CMS_MODULES.COMPLAINT_VIEW, 'VIEW');
  const record = getComplaintLifecycleRecord_(complaintNo);
  const tracking = getCmsComplaintTrackingCore_(record.complaintNo);
  const actionsRes = getAllowedCmsLifecycleActions(record.complaintNo);
  const infoRes = getCmsInfoRequestModule(record.complaintNo);
  const latest = latestCapaRecord_(record.complaintNo);
  const capaHistory = getCmsCapaVersionHistory_(record.complaintNo);
  const isQa = (/qa/i.test(user.role || '') || isAdminUser_(user));
  const isSales = (/sales/i.test(user.role || '') || isAdminUser_(user));
  const canUploadCapa = isQa && hasPermission_(user, CMS_MODULES.CAPA_UPLOAD, 'EDIT') && (
    record.stage === 'Investigation Complete' || (record.stage === 'CAPA Uploaded' && record.capaSubStatus === 'Revision Requested')
  );
  const canSalesCapa = isSales && hasPermission_(user, CMS_MODULES.CAPA_VERIFY, 'EDIT') && record.stage === 'CAPA Uploaded' && record.capaSubStatus !== 'Revision Requested' && !!latest;
  const stageActions = (actionsRes && actionsRes.actions ? actionsRes.actions : []).filter(function(a){
    return ['START_REVIEW','START_INVESTIGATION','REOPEN_CASE'].indexOf(a.code) >= 0;
  });
  if (record.stage === 'Under Investigation' && isQa && hasPermission_(user, CMS_MODULES.INVESTIGATION, 'EDIT')) {
    stageActions.push({code:'MARK_INV_COMPLETE_SIMPLE', label:'Mark Investigation Complete', remarkRequired:false});
  }
  return {
    status:'success',
    user:{email:user.email,name:user.name,role:user.role},
    complaintNo:record.complaintNo,
    currentStage:record.stage,
    stageOwner:getCmsStageOwner_(record.stage),
    capaSubStatus:record.capaSubStatus || 'Not started',
    capaVersion:record.capaVersion || '',
    tracking:tracking,
    stageActions:stageActions,
    info:infoRes,
    capa:{latest:latest || null, history:capaHistory || [], canUpload:canUploadCapa, canSalesAction:canSalesCapa}
  };
}

function getCmsTrackingData(fy, statusFilter) {
  try {
    const res = getCmsTrackingDataP6List_(fy, statusFilter);
    return res;
  } catch (err) {
    Logger.log('P6 Firestore list failed, fallback to legacy: ' + err.message);

    if (typeof getCmsTrackingDataLegacy === 'function') {
      return getCmsTrackingDataLegacy(fy, statusFilter);
    }

    return {
      status: 'error',
      message: err.message || 'Tracking data load failed',
      rows: [],
      data: [],
      complaints: []
    };
  }
}

function getCmsTrackingDataP6List_(fy, statusFilter) {
  const docs = p6FsListCollection_('complaints', 1000) || [];

  let rows = docs.map(function(d) {
    const complaintNo = String(d.complaintNo || d.documentNo || d.refNo || '').trim();
    const complaintDate = d.complaintDate || d.date || d.createdAt || '';
    const stage = d.currentStage || d.status || d.stage || 'Complaint Booked';

    return {
      complaintNo: complaintNo,
      documentNo: complaintNo,
      refNo: complaintNo,

      complaintDate: complaintDate,
      date: complaintDate,

      customer: d.customer || d.customerName || '',
      customerName: d.customer || d.customerName || '',

      product: d.product || d.itemName || d.productName || '',
      itemName: d.product || d.itemName || d.productName || '',

      batch: d.batch || d.batchNo || d.batchNumber || '',
      batchNo: d.batch || d.batchNo || d.batchNumber || '',

      severity: d.severity || '',
      status: stage,
      currentStage: stage,
      stage: stage,

      stageOwner: d.stageOwner || '',
      capaStatus: d.capaStatus || 'Not started',
      capaVersion: d.capaVersion || 0,

      pdfUrl: d.pdfUrl || '',
      folderUrl: d.folderUrl || '',

      age: cmsP6AgeDays_(complaintDate),
      ageDays: cmsP6AgeDays_(complaintDate),

      updatedAt: d.updatedAt || '',
      source: 'FIRESTORE'
    };
  }).filter(function(r) {
    return !!r.complaintNo;
  });

  if (fy && fy !== 'ALL' && fy !== 'All FY') {
    rows = rows.filter(function(r) {
      return cmsP6DateInFy_(r.complaintDate, fy);
    });
  }

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'All Status') {
    rows = rows.filter(function(r) {
      return String(r.status || '').toLowerCase() === String(statusFilter || '').toLowerCase();
    });
  }

  rows.sort(function(a, b) {
    return new Date(b.complaintDate || b.updatedAt || 0) - new Date(a.complaintDate || a.updatedAt || 0);
  });

  return {
    status: 'success',
    source: 'FIRESTORE_LIST',
    rows: rows,
    data: rows,
    complaints: rows,
    total: rows.length
  };
}

function cmsP6AgeDays_(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';

  const today = new Date();
  const diff = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function cmsP6DateInFy_(dateValue, fyLabel) {
  if (!dateValue || !fyLabel) return true;

  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return true;

  const m = String(fyLabel).match(/(\d{4})\D+(\d{2,4})/);
  if (!m) return true;

  const startYear = Number(m[1]);
  const start = new Date(startYear, 3, 1);      // 1 Apr
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59); // 31 Mar

  return d >= start && d <= end;
}
