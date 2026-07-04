/**
 * P6.4 Dashboard + Chat + Data Fill Hotfix
 * Install after P6.0/P6.1/P6.2/P6.3 files.
 * Purpose:
 * - Dashboard cards + FY options from Firestore rows.
 * - Customer/address/city fallbacks from Google Sheet when Firestore docs are thin.
 * - Workspace data normalized for clean header + WhatsApp-like More Info chat UI.
 * - Stable action wrappers used by P6.4 frontend.
 */

const CMS_P6_4 = {
  VERSION: 'P6.4_DASHBOARD_CHAT_DATA_FIX',
  MAX_ROWS: 1500,
  OVERDUE_DAYS: 30
};

function setupCmsP6_4DashboardChatDataFix() {
  p6FsPatchDoc_('meta/p6_4_dashboardChatDataFix', {
    version: CMS_P6_4.VERSION,
    enabled: true,
    updatedAt: new Date().toISOString(),
    note: 'Dashboard cards, FY options, customer fallback fields, and chat UX compatibility enabled.'
  });
  return { status: 'success', version: CMS_P6_4.VERSION, message: 'P6.4 Dashboard/Chat/Data Fix installed' };
}

/**
 * Override-compatible tracking/list response.
 * Returns cards + fyOptions + analytics in the shape expected by existing index.html bootstrap.
 */
function getCmsTrackingData(fy, statusFilter) {
  return getCmsTrackingDataP6_4(fy, statusFilter);
}

function getCmsTrackingDataP6_4(fy, statusFilter) {
  const selectedFY = String(fy || 'ALL').trim() || 'ALL';
  const selectedStatus = String(statusFilter || '').trim();
  const sheetMap = p64BuildSheetComplaintMap_();
  const docs = p6FsListCollection_('complaints', CMS_P6_4.MAX_ROWS) || [];

  let rows = docs.map(function(d) {
    const no = String(d.complaintNo || d.documentNo || d.refNo || '').trim();
    const sheet = sheetMap[no] || {};
    return p64NormalizeComplaintRow_(d, sheet);
  }).filter(function(r) { return !!r.complaintNo; });

  // Include records present in Sheet but not yet in Firestore so dashboard/list do not look incomplete.
  Object.keys(sheetMap).forEach(function(no) {
    if (!rows.some(function(r) { return String(r.complaintNo) === no; })) {
      rows.push(p64NormalizeComplaintRow_({}, sheetMap[no]));
    }
  });

  rows.forEach(function(r) { r.fy = p64FyKey_(r.complaintDate || r.date); });

  if (selectedFY !== 'ALL' && selectedFY !== 'All FY') {
    rows = rows.filter(function(r) { return r.fy === selectedFY; });
  }
  if (selectedStatus && selectedStatus !== 'ALL' && selectedStatus !== 'All Status') {
    rows = rows.filter(function(r) { return String(r.status || '').toLowerCase() === selectedStatus.toLowerCase(); });
  }

  rows.sort(function(a, b) {
    return new Date(b.complaintDate || b.updatedAt || 0) - new Date(a.complaintDate || a.updatedAt || 0);
  });

  const allRowsForOptions = Object.keys(sheetMap).map(function(no) { return p64NormalizeComplaintRow_({}, sheetMap[no]); })
    .concat(docs.map(function(d) { return p64NormalizeComplaintRow_(d, sheetMap[String(d.complaintNo || '').trim()] || {}); }))
    .filter(function(r) { return !!r.complaintNo; });

  const fyOptions = p64BuildFyOptions_(allRowsForOptions);
  const cards = p64BuildCards_(rows);
  const analytics = p64BuildAnalytics_(rows);

  return {
    status: 'success',
    source: 'FIRESTORE_P6_4_LIST',
    selectedFY: selectedFY,
    fyOptions: fyOptions,
    cards: cards,
    rows: rows,
    data: rows,
    complaints: rows,
    total: rows.length,
    analytics: analytics,
    stageCounts: p64CountsObject_(analytics.byStage),
    severityCounts: p64CountsObject_(analytics.bySeverity)
  };
}

function getCmsFastWorkspaceDataP6_4(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  let res;
  if (typeof getCmsFastWorkspaceDataP6_3 === 'function') {
    res = getCmsFastWorkspaceDataP6_3(no);
  } else if (typeof getCmsFastWorkspaceDataP6_2 === 'function') {
    res = getCmsFastWorkspaceDataP6_2(no);
  } else {
    res = getCmsFastWorkspaceDataP6(no);
  }

  const sheetMap = p64BuildSheetComplaintMap_();
  const sheet = sheetMap[no] || {};
  const base = res.complaint || {};
  res.complaint = p64NormalizeComplaintRow_(base, sheet);
  res.complaintNo = no;
  res.currentStage = res.currentStage || res.complaint.currentStage || res.complaint.status || 'Complaint Booked';
  res.stageOwner = res.stageOwner || res.complaint.stageOwner || cmsP6StageOwner_(res.currentStage);
  res.capaStatus = res.capaStatus || res.complaint.capaStatus || 'Not started';
  res.capaSubStatus = res.capaSubStatus || res.capaStatus;
  res.info = p64NormalizeInfoState_(res.info || {}, no);
  res.chat = p64BuildChatFromInfo_(res.info);
  res.quickLinks = res.quickLinks || {};
  res.quickLinks.pdfUrl = res.quickLinks.pdfUrl || res.complaint.pdfUrl || '';
  res.quickLinks.folderUrl = res.quickLinks.folderUrl || res.complaint.folderUrl || '';
  res.quickLinks.publicTrackingUrl = res.quickLinks.publicTrackingUrl || p64PublicTrackingUrl_(no);
  res.stageActions = res.stageActions || [];
  res.source = 'FIRESTORE_P6_4_WORKSPACE';
  res.p6Version = CMS_P6_4.VERSION;
  return res;
}

function runCmsStageActionP6_4(payload) {
  payload = payload || {};
  if (typeof runCmsStageActionP6_3 === 'function') return runCmsStageActionP6_3(payload);
  if (typeof executeCmsLifecycleAction === 'function') return executeCmsLifecycleAction(payload);
  throw new Error('Stage action engine is not installed');
}

function raiseCmsInfoRequestP6_4(payload) {
  payload = payload || {};
  const no = String(payload.complaintNo || '').trim();
  const question = String(payload.question || payload.message || payload.remark || '').trim();
  if (!no || !question) throw new Error('Complaint No and request detail required');
  return raiseCmsInfoRequest(no, question, payload.fileDataUrl || payload.attachmentDataUrl || '');
}

function respondCmsInfoRequestP6_4(payload) {
  payload = payload || {};
  const requestId = String(payload.requestId || '').trim();
  const response = String(payload.response || payload.message || payload.remark || '').trim();
  if (!requestId || !response) throw new Error('Request ID and sales response required');
  return respondCmsInfoRequest(requestId, response, payload.fileDataUrl || payload.attachmentDataUrl || '');
}

function reviewCmsInfoRequestP6_4(payload) {
  payload = payload || {};
  return reviewCmsInfoRequest(payload.requestId, payload.decision || 'ACCEPT', payload.comment || payload.remark || 'Accepted');
}

function uploadCmsCapaDocumentP6_4(payload) {
  payload = payload || {};
  if (typeof uploadCmsCapaDocumentP6_3 === 'function') return uploadCmsCapaDocumentP6_3(payload);
  return uploadCmsCapaDocumentSimple(payload.complaintNo, payload);
}

function verifyCmsCapaDocumentP6_4(payload) {
  payload = payload || {};
  if (typeof verifyCmsCapaDocumentP6_3 === 'function') return verifyCmsCapaDocumentP6_3(payload);
  return verifyCmsCapaDocumentSimple(payload.complaintNo, payload.remark || 'CAPA verified');
}

function requestCmsCapaRevisionP6_4(payload) {
  payload = payload || {};
  if (typeof requestCmsCapaRevisionP6_3 === 'function') return requestCmsCapaRevisionP6_3(payload);
  return requestCmsCapaRevision(payload.complaintNo, payload.remark || payload.reason || 'CAPA revision requested');
}

function p64NormalizeComplaintRow_(d, sheet) {
  d = d || {}; sheet = sheet || {};
  const no = p64First_(d.complaintNo, d.documentNo, d.refNo, sheet.complaintNo);
  const complaintDate = p64First_(d.complaintDate, d.date, d.createdAt, sheet.complaintDate, sheet.date);
  const stage = p64First_(d.currentStage, d.status, d.stage, sheet.currentStage, sheet.status, 'Complaint Booked');
  const customer = p64First_(d.customer, d.customerName, d.location, d.hospital, d.hospitalName, d.partyName, sheet.customer, sheet.customerName, sheet.location);
  const address = p64First_(d.address, d.customerAddress, d.customer_address, sheet.address);
  const city = p64First_(d.city, sheet.city);
  const state = p64First_(d.state, sheet.state);
  const pincode = p64First_(d.pincode, d.pin, sheet.pincode);
  const product = p64First_(d.product, d.itemName, d.productName, sheet.product, sheet.itemName);
  const batch = p64First_(d.batch, d.batchNo, d.batchNumber, sheet.batch, sheet.batchNo);
  const severity = p64First_(d.severity, d.complaintSeverity, d.complaintType, sheet.severity);

  return {
    rowNo: p64First_(d.rowNo, sheet.rowNo),
    complaintNo: String(no || '').trim(),
    documentNo: String(no || '').trim(),
    refNo: String(no || '').trim(),
    complaintDate: complaintDate || '',
    date: p64FormatDate_(complaintDate),
    fy: p64FyKey_(complaintDate),
    customer: customer || '',
    customerName: customer || '',
    location: customer || '',
    address: address || '',
    city: city || '',
    state: state || '',
    pincode: pincode || '',
    product: product || '',
    itemName: product || '',
    batch: batch || '',
    batchNo: batch || '',
    severity: severity || '',
    issue: p64First_(d.issue, d.issues, sheet.issue) || '',
    qty: p64First_(d.qty, d.qtyAffected, sheet.qty) || '',
    sample: p64First_(d.sample, d.sampleAvailable, sheet.sample) || '',
    status: stage,
    currentStage: stage,
    stage: stage,
    stageOwner: p64First_(d.stageOwner, sheet.stageOwner, cmsP6StageOwner_(stage)),
    capaStatus: p64First_(d.capaStatus, d.capaSubStatus, sheet.capaStatus, 'Not started'),
    capaSubStatus: p64First_(d.capaSubStatus, d.capaStatus, sheet.capaStatus, 'Not started'),
    capaVersion: Number(p64First_(d.capaVersion, sheet.capaVersion, 0) || 0),
    pdfUrl: p64First_(d.pdfUrl, sheet.pdfUrl) || '',
    folderUrl: p64First_(d.folderUrl, sheet.folderUrl) || '',
    latestCapaUrl: p64First_(d.latestCapaUrl, sheet.latestCapaUrl) || '',
    updatedAt: p64First_(d.updatedAt, sheet.updatedAt) || '',
    age: p64AgeDays_(complaintDate),
    ageDays: p64AgeDays_(complaintDate),
    source: d.complaintNo ? 'FIRESTORE+SHEET_FALLBACK' : 'SHEET_FALLBACK'
  };
}

function p64BuildSheetComplaintMap_() {
  const map = {};
  try {
    const sh = cmsP6GetComplaintSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return map;
    const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    values.forEach(function(r, i) {
      const no = String(r[COMPLAINT_COL.COMPLAINT_NO - 1] || '').trim();
      if (!no) return;
      const complaintDate = r[COMPLAINT_COL.COMPLAINT_DATE - 1];
      const status = (typeof CMS_STATUS_COL !== 'undefined') ? r[CMS_STATUS_COL - 1] : '';
      map[no] = {
        rowNo: i + 2,
        complaintNo: no,
        complaintDate: complaintDate,
        date: complaintDate,
        customer: r[COMPLAINT_COL.LOCATION - 1] || '',
        address: r[COMPLAINT_COL.ADDRESS - 1] || '',
        city: r[COMPLAINT_COL.CITY - 1] || '',
        state: r[COMPLAINT_COL.STATE - 1] || '',
        pincode: r[COMPLAINT_COL.PINCODE - 1] || '',
        product: r[COMPLAINT_COL.ITEM_NAME - 1] || '',
        batch: r[COMPLAINT_COL.BATCH_NO - 1] || '',
        severity: r[COMPLAINT_COL.SEVERITY - 1] || '',
        issue: r[COMPLAINT_COL.ISSUES - 1] || '',
        qty: r[COMPLAINT_COL.QTY_AFFECTED - 1] || '',
        sample: r[COMPLAINT_COL.SAMPLE_AVAILABLE - 1] || '',
        pdfUrl: r[COMPLAINT_COL.PDF_URL - 1] || '',
        folderUrl: r[COMPLAINT_COL.FOLDER_URL - 1] || '',
        status: status || 'Complaint Booked'
      };
    });
  } catch (err) {
    Logger.log('P6.4 sheet fallback skipped: ' + err.message);
  }
  return map;
}

function p64NormalizeInfoState_(info, complaintNo) {
  info = info || {};
  let requests = info.requests || [];
  requests = requests.map(function(r, idx) {
    r.sequence = Number(r.sequence || r.requestNo || (idx + 1));
    r.status = r.status || 'Open';
    r.question = p64First_(r.question, r.qaQuestion, r.message, '');
    r.messages = r.messages || [];
    if (!r.messages.length && r.question) {
      r.messages.push({ by: r.raisedBy || r.updatedBy || 'QA Team', message: r.question, attachmentUrl: r.attachmentUrl || '', at: r.createdAt || r.updatedAt || '', type: 'QUESTION', side: 'qa' });
    }
    if (r.salesResponse && !r.messages.some(function(m){ return m.type === 'SALES_RESPONSE'; })) {
      r.messages.push({ by: r.salesUpdatedBy || r.updatedBy || 'Sales Team', message: r.salesResponse, attachmentUrl: r.salesAttachmentUrl || '', at: r.salesRespondedAt || r.updatedAt || '', type: 'SALES_RESPONSE', side: 'sales' });
    }
    return r;
  });
  const active = info.activeRequest || requests.filter(function(r){ return ['Open','Reopened','Sales Responded'].indexOf(String(r.status || '')) >= 0; })[0] || null;
  info.requests = requests;
  info.activeRequest = active;
  info.active = active;
  info.cyclesUsed = Number(info.cyclesUsed || requests.length || 0);
  info.maxCycles = Number(info.maxCycles || 3);
  info.permissions = info.permissions || {};
  info.chat = p64BuildChatFromInfo_(info);
  info.messages = info.chat;
  return info;
}

function p64BuildChatFromInfo_(info) {
  const requests = (info && info.requests) || [];
  const msgs = [];
  requests.forEach(function(r) {
    (r.messages || []).forEach(function(m) {
      msgs.push({
        requestId: r.requestId,
        sequence: r.sequence,
        status: r.status,
        by: m.by || m.senderName || m.updatedBy || '',
        message: m.message || '',
        attachmentUrl: m.attachmentUrl || '',
        at: m.at || m.time || r.updatedAt || '',
        type: m.type || '',
        side: /sales/i.test(String(m.side || m.by || m.type || '')) ? 'sales' : 'qa'
      });
    });
  });
  msgs.sort(function(a,b){ return new Date(a.at || 0) - new Date(b.at || 0); });
  return msgs;
}

function p64BuildCards_(rows) {
  const total = rows.length;
  const closed = rows.filter(function(r){ return String(r.status || '').toLowerCase().indexOf('closed') >= 0; }).length;
  const open = total - closed;
  const overdue = rows.filter(function(r){ return String(r.status || '').toLowerCase().indexOf('closed') < 0 && Number(r.ageDays || 0) > CMS_P6_4.OVERDUE_DAYS; }).length;
  return { total: total, open: open, closed: closed, overdue: overdue };
}

function p64BuildAnalytics_(rows) {
  const stage = {}, sev = {};
  rows.forEach(function(r) {
    const s = r.status || 'Complaint Booked';
    const v = r.severity || 'NA';
    stage[s] = (stage[s] || 0) + 1;
    sev[v] = (sev[v] || 0) + 1;
  });
  return { byStage: p64ToItems_(stage), bySeverity: p64ToItems_(sev), monthlyTrend: [] };
}

function p64ToItems_(obj) { return Object.keys(obj || {}).map(function(k){ return { label: k, count: obj[k] }; }); }
function p64CountsObject_(items) { const o = {}; (items || []).forEach(function(x){ o[x.label] = x.count; }); return o; }

function p64BuildFyOptions_(rows) {
  const keys = {};
  rows.forEach(function(r){ const k = p64FyKey_(r.complaintDate || r.date); if (k) keys[k] = true; });
  return Object.keys(keys).sort().reverse().map(function(k){ return { key: k, label: 'FY ' + k }; });
}

function p64FyKey_(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const start = (d.getMonth() + 1) >= 4 ? y : y - 1;
  return start + '-' + String(start + 1).slice(-2);
}

function p64AgeDays_(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((new Date().getTime() - d.getTime()) / 86400000));
}

function p64FormatDate_(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function p64First_() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function p64PublicTrackingUrl_(complaintNo) {
  try { return ScriptApp.getService().getUrl() + '?track=' + encodeURIComponent(complaintNo); }
  catch (err) { return '?track=' + encodeURIComponent(complaintNo); }
}

function debugCmsP6_4List() {
  const data = getCmsTrackingDataP6_4('ALL', 'ALL');
  Logger.log(JSON.stringify({ cards: data.cards, fyOptions: data.fyOptions, first: data.rows[0] }, null, 2));
  return data;
}

function debugCmsP6_4Workspace(complaintNo) {
  const data = getCmsFastWorkspaceDataP6_4(complaintNo);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}
