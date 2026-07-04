/**
 * P6.2 Firestore Stage Actions + CAPA + More Info Integration
 * -----------------------------------------------------------
 * PURPOSE
 * - Make workspace actions Firestore-first.
 * - Keep Google Sheet as backup/register.
 * - Keep existing Drive upload flow usable.
 * - Return frontend-compatible shape for P5.6 fast workspace.
 *
 * INSTALL NOTE
 * 1) Keep Code_P6_FirestoreBridge.gs installed and working.
 * 2) Keep Code_P6_1_FirestoreFastIntegration.gs installed OR replace its main wrappers.
 * 3) If duplicate functions exist, rename old versions:
 *    - getCmsFastWorkspaceData  -> getCmsFastWorkspaceDataLegacy
 *    - getCmsTrackingData       -> getCmsTrackingDataLegacy
 *    - executeCmsLifecycleAction -> executeCmsLifecycleActionLegacy
 */

const CMS_P6_2 = {
  VERSION: 'P6.2_FIRESTORE_STAGE_CAPA_ACTIONS',
  MAX_INFO_REQUESTS: 3,
  WORKSPACE_CACHE_PREFIX: 'P6_WS_',
  LIST_CACHE_KEY: 'P6_TRACKING_LIST_ALL',
  CACHE_TTL_SECONDS: 30,
  CAPA_FOLDER_NAME: 'CMS_CAPA_UPLOADS'
};

function setupCmsP6_2StageCapaActions() {
  if (typeof setupCmsP6FirestoreHybrid === 'function') setupCmsP6FirestoreHybrid();
  p6FsPatchDoc_('meta/p6_2_stageCapaActions', {
    version: CMS_P6_2.VERSION,
    enabled: true,
    updatedAt: new Date().toISOString(),
    note: 'Firestore-first stage updates, More Info, CAPA upload/reference/approval integration.'
  });
  return { status: 'success', version: CMS_P6_2.VERSION, message: 'P6.2 Firestore action integration ready' };
}

/* =========================================================
   LIST / TRACKING DATA - FIRESTORE FIRST
   Rename old getCmsTrackingData to getCmsTrackingDataLegacy if needed.
========================================================= */
function getCmsTrackingData(fy, statusFilter) {
  try {
    return getCmsTrackingDataP6_2(fy, statusFilter);
  } catch (err) {
    Logger.log('P6.2 Firestore tracking list failed: ' + err.message);
    if (typeof getCmsTrackingDataLegacy === 'function') return getCmsTrackingDataLegacy(fy, statusFilter);
    return { status: 'error', message: err.message || 'Tracking data load failed', rows: [], data: [], complaints: [] };
  }
}

function getCmsTrackingDataP6_2(fy, statusFilter) {
  const docs = p6FsListCollection_('complaints', 1000) || [];
  let rows = docs.map(p6_2NormalizeComplaintListRow_).filter(r => !!r.complaintNo);

  if (fy && fy !== 'ALL' && fy !== 'All FY') {
    rows = rows.filter(r => p6_2DateInFy_(r.complaintDate, fy));
  }
  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'All Status') {
    rows = rows.filter(r => String(r.status || '').toLowerCase() === String(statusFilter || '').toLowerCase());
  }

  rows.sort(function(a, b) {
    return new Date(b.complaintDate || b.updatedAt || 0) - new Date(a.complaintDate || a.updatedAt || 0);
  });

  const stageCounts = {};
  const severityCounts = {};
  rows.forEach(function(r) {
    stageCounts[r.status || 'Complaint Booked'] = (stageCounts[r.status || 'Complaint Booked'] || 0) + 1;
    severityCounts[r.severity || 'NA'] = (severityCounts[r.severity || 'NA'] || 0) + 1;
  });

  return {
    status: 'success',
    source: 'FIRESTORE_LIST',
    rows: rows,
    data: rows,
    complaints: rows,
    total: rows.length,
    stageCounts: stageCounts,
    severityCounts: severityCounts,
    byStage: Object.keys(stageCounts).map(k => ({ label: k, count: stageCounts[k] })),
    bySeverity: Object.keys(severityCounts).map(k => ({ label: k, count: severityCounts[k] }))
  };
}

function p6_2NormalizeComplaintListRow_(d) {
  const complaintNo = String(d.complaintNo || d.documentNo || d.refNo || '').trim();
  const complaintDate = d.complaintDate || d.date || d.createdAt || d.syncedAt || '';
  const stage = d.currentStage || d.status || d.stage || 'Complaint Booked';
  const product = d.product || d.itemName || d.productName || '';
  const batch = d.batch || d.batchNo || d.batchNumber || '';
  return {
    complaintNo: complaintNo,
    documentNo: complaintNo,
    refNo: complaintNo,
    complaintDate: complaintDate,
    date: complaintDate,
    customer: d.customer || d.customerName || '',
    customerName: d.customer || d.customerName || '',
    product: product,
    itemName: product,
    batch: batch,
    batchNo: batch,
    severity: d.severity || '',
    status: stage,
    currentStage: stage,
    stage: stage,
    stageOwner: d.stageOwner || cmsP6StageOwner_(stage),
    capaStatus: d.capaStatus || d.capaSubStatus || 'Not started',
    capaSubStatus: d.capaStatus || d.capaSubStatus || 'Not started',
    capaVersion: Number(d.capaVersion || 0),
    pdfUrl: d.pdfUrl || '',
    folderUrl: d.folderUrl || '',
    latestCapaUrl: d.latestCapaUrl || '',
    age: p6_2AgeDays_(complaintDate),
    ageDays: p6_2AgeDays_(complaintDate),
    updatedAt: d.updatedAt || '',
    source: 'FIRESTORE'
  };
}

/* =========================================================
   WORKSPACE - FRONTEND COMPATIBLE P5.6 SHAPE
   Rename old getCmsFastWorkspaceData to getCmsFastWorkspaceDataLegacy if needed.
========================================================= */
function getCmsFastWorkspaceData(complaintNo) {
  return getCmsFastWorkspaceDataP6_2(complaintNo);
}

function getCmsFastWorkspaceDataP6_2(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  let doc = null;
  try { doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)); } catch (err) {}

  if (!doc || !doc.complaintNo) {
    if (typeof syncCmsComplaintToFirestore === 'function') syncCmsComplaintToFirestore(no);
    doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no));
  }
  if (!doc || !doc.complaintNo) throw new Error('Complaint not found in Firestore: ' + no);

  const stage = doc.currentStage || doc.status || 'Complaint Booked';
  const info = p6_2GetInfoState_(no, stage);
  const capa = p6_2GetCapaState_(no, stage, doc);
  const timeline = p6_2GetTimeline_(no);

  return {
    status: 'success',
    source: 'FIRESTORE_P6_2',
    p6Version: CMS_P6_2.VERSION,
    complaint: p6_2NormalizeComplaintListRow_(doc),
    complaintNo: no,
    currentStage: stage,
    stageOwner: doc.stageOwner || cmsP6StageOwner_(stage),
    capaStatus: doc.capaStatus || doc.capaSubStatus || 'Not started',
    capaSubStatus: doc.capaStatus || doc.capaSubStatus || 'Not started',
    capaVersion: Number(doc.capaVersion || 0),
    latestCapaUrl: doc.latestCapaUrl || '',
    tracking: {
      stages: cmsP6BuildStages_(stage),
      logs: timeline.map(p6_2TimelineToLog_)
    },
    info: info,
    stageActions: p6_2GetStageActions_(stage, doc, info, capa),
    capa: capa,
    quickLinks: {
      pdfUrl: doc.pdfUrl || '',
      folderUrl: doc.folderUrl || '',
      publicTrackingUrl: p6_2BuildPublicTrackingUrl_(no)
    }
  };
}

function p6_2GetStageActions_(stage, doc, info, capa) {
  // Minimal low-interaction flow: no investigation write-up, just one-click stage movement.
  const actions = [];
  if (stage === 'Complaint Booked') actions.push({ code: 'START_REVIEW', label: 'Start Review', remarkRequired: false });
  if (stage === 'Under Review') {
    if (!info.activeRequest) {
      actions.push({ code: 'START_INVESTIGATION', label: 'Start Investigation', remarkRequired: false });
      if ((info.requests || []).length < CMS_P6_2.MAX_INFO_REQUESTS) actions.push({ code: 'REQUEST_MORE_INFO', label: 'Request More Info', remarkRequired: true });
    }
  }
  if (stage === 'More Info Requested' && !info.activeRequest) actions.push({ code: 'START_INVESTIGATION', label: 'Start Investigation', remarkRequired: false });
  if (stage === 'Under Investigation') actions.push({ code: 'MARK_INV_COMPLETE_SIMPLE', label: 'Mark Investigation Complete', remarkRequired: false });
  return actions;
}

/* =========================================================
   STAGE ACTIONS
========================================================= */
function executeCmsLifecycleAction(complaintNo, actionCode, remark) {
  const no = String(complaintNo || '').trim();
  const code = String(actionCode || '').trim();
  if (!no || !code) throw new Error('Complaint No and action code required');

  if (code === 'REQUEST_MORE_INFO') {
    const q = String(remark || '').trim() || 'More information required by QA.';
    return raiseCmsInfoRequest(no, q, null);
  }

  const stageMap = {
    START_REVIEW: 'Under Review',
    START_INVESTIGATION: 'Under Investigation',
    MARK_INVESTIGATION_COMPLETE: 'Investigation Complete',
    MARK_INV_COMPLETE_SIMPLE: 'Investigation Complete',
    UPLOAD_CAPA: 'CAPA Uploaded',
    VERIFY_CAPA: 'CAPA Verified',
    CLOSE_CASE: 'Case Closed',
    REOPEN_REVIEW: 'Under Review'
  };
  const newStage = stageMap[code];
  if (!newStage) throw new Error('Unknown lifecycle action: ' + code);

  const oldDoc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  const oldStage = oldDoc.currentStage || oldDoc.status || '';
  const res = p6StageUpdate(no, newStage, remark || code);

  p6_2SafeSheetStageBackup_(no, newStage, remark || code);
  p6_2ClearCaches_(no);
  return {
    status: 'success',
    message: oldStage + ' → ' + newStage,
    complaintNo: no,
    oldStage: oldStage,
    newStage: newStage,
    firestore: res
  };
}

function markCmsInvestigationCompleteSimple(complaintNo, remark) {
  return executeCmsLifecycleAction(complaintNo, 'MARK_INV_COMPLETE_SIMPLE', remark || 'Investigation completed as per offline hard-copy process');
}

/* =========================================================
   CAPA UPLOAD / VIEW / APPROVE / REVISION
========================================================= */
function uploadCmsCapaDocumentSimple(complaintNo, payload) {
  const no = String(complaintNo || '').trim();
  payload = payload || {};
  if (!no) throw new Error('Complaint No required');
  if (!payload.documentDataUrl && !payload.documentUrl) throw new Error('CAPA document required');

  let documentUrl = String(payload.documentUrl || '').trim();
  if (!documentUrl && payload.documentDataUrl) {
    documentUrl = p6_2SaveDataUrlToDrive_(payload.documentDataUrl, no, 'CAPA');
  }

  const res = p6SaveCapaVersion(no, {
    documentUrl: documentUrl,
    remark: payload.qaRemark || payload.remark || '',
    status: 'Awaiting Sales Verification'
  });
  p6_2SafeSheetStageBackup_(no, 'CAPA Uploaded', payload.qaRemark || 'CAPA uploaded');
  p6_2ClearCaches_(no);
  return { status: 'success', message: 'CAPA uploaded successfully', complaintNo: no, documentUrl: documentUrl, capa: res };
}

function verifyCmsCapaDocumentSimple(complaintNo, remark) {
  return approveCmsCapaAndCloseP6(complaintNo, remark || 'CAPA verified by Sales');
}

function approveCmsCapaAndCloseP6(complaintNo, remark) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');
  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  const oldStage = doc.currentStage || doc.status || 'CAPA Uploaded';
  doc.capaStatus = 'Verified';
  doc.status = 'Case Closed';
  doc.currentStage = 'Case Closed';
  doc.stageOwner = 'Auto';
  doc.salesVerificationRemark = remark || '';
  doc.stageUpdatedAt = new Date().toISOString();
  doc.stageUpdatedBy = Session.getActiveUser().getEmail() || 'System';
  doc.updatedAt = new Date().toISOString();
  p6UpsertComplaintDoc_(doc);

  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/timeline/' + cmsP6Id_('TL'), {
    complaintNo: no,
    oldStage: oldStage,
    newStage: 'Case Closed',
    remark: remark || 'CAPA approved and case closed',
    user: Session.getActiveUser().getEmail() || 'System',
    createdAt: new Date().toISOString(),
    type: 'CAPA_APPROVED_CLOSE'
  });

  p6_2SafeSheetStageBackup_(no, 'Case Closed', remark || 'CAPA approved and case closed');
  p6_2ClearCaches_(no);
  return { status: 'success', message: 'CAPA approved and case closed', complaintNo: no, newStage: 'Case Closed' };
}

function requestCmsCapaRevision(complaintNo, reason) {
  return requestCmsCapaRevisionP6(complaintNo, reason);
}

function requestCmsCapaRevisionP6(complaintNo, reason) {
  const no = String(complaintNo || '').trim();
  const r = String(reason || '').trim();
  if (!no || !r) throw new Error('Revision reason required');
  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  doc.capaStatus = 'Revision Requested';
  doc.status = 'CAPA Uploaded';
  doc.currentStage = 'CAPA Uploaded';
  doc.capaRevisionReason = r;
  doc.updatedAt = new Date().toISOString();
  p6UpsertComplaintDoc_(doc);
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/timeline/' + cmsP6Id_('TL'), {
    complaintNo: no,
    oldStage: 'CAPA Uploaded',
    newStage: 'CAPA Uploaded',
    remark: r,
    user: Session.getActiveUser().getEmail() || 'System',
    createdAt: new Date().toISOString(),
    type: 'CAPA_REVISION_REQUEST'
  });
  p6_2ClearCaches_(no);
  return { status: 'success', message: 'CAPA revision requested', complaintNo: no, capaStatus: 'Revision Requested' };
}

function p6_2GetCapaState_(complaintNo, stage, doc) {
  const versions = p6FsListCollection_('complaints/' + encodeURIComponent(complaintNo) + '/capaVersions', 50) || [];
  versions.sort(function(a, b) { return Number(b.version || 0) - Number(a.version || 0); });
  const latest = versions[0] || null;
  return {
    latest: latest,
    history: versions,
    canUpload: stage === 'Investigation Complete' || doc.capaStatus === 'Revision Requested',
    canSalesAction: stage === 'CAPA Uploaded' && !!latest
  };
}

/* =========================================================
   MORE INFO REQUESTS
========================================================= */
function raiseCmsInfoRequest(complaintNo, question, fileDataUrl) {
  const no = String(complaintNo || '').trim();
  const q = String(question || '').trim();
  if (!no || !q) throw new Error('Complaint No and request question required');

  const existing = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/infoRequests', 20) || [];
  const active = existing.find(r => ['Open', 'Reopened', 'Sales Responded'].indexOf(String(r.status || '')) >= 0);
  if (active && String(active.status || '') !== 'Closed') throw new Error('One active request already exists. Close it before raising another.');
  if (existing.length >= CMS_P6_2.MAX_INFO_REQUESTS) throw new Error('Maximum 3 More Info requests already used.');

  let attachmentUrl = '';
  if (fileDataUrl) attachmentUrl = p6_2SaveDataUrlToDrive_(fileDataUrl, no, 'INFO_REQUEST');

  const reqId = cmsP6Id_('REQ');
  const now = new Date().toISOString();
  const req = {
    requestId: reqId,
    complaintNo: no,
    sequence: existing.length + 1,
    status: 'Open',
    question: q,
    attachmentUrl: attachmentUrl,
    messages: [{ by: Session.getActiveUser().getEmail() || 'QA', message: q, attachmentUrl: attachmentUrl, at: now, type: 'QUESTION' }],
    createdAt: now,
    updatedAt: now,
    updatedBy: Session.getActiveUser().getEmail() || 'System'
  };
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/infoRequests/' + reqId, req);
  p6FsPatchDoc_('infoRequests/' + reqId, req);
  p6StageUpdate(no, 'More Info Requested', 'More information requested');
  p6_2ClearCaches_(no);
  return { status: 'success', message: 'More Info request raised', requestId: reqId, complaintNo: no };
}

function respondCmsInfoRequest(requestId, response, fileDataUrl) {
  const req = p6_2GetInfoRequestById_(requestId);
  const no = req.complaintNo;
  const txt = String(response || '').trim();
  if (!txt) throw new Error('Sales response required');
  let attachmentUrl = '';
  if (fileDataUrl) attachmentUrl = p6_2SaveDataUrlToDrive_(fileDataUrl, no, 'INFO_RESPONSE');
  const now = new Date().toISOString();
  req.status = 'Sales Responded';
  req.salesResponse = txt;
  req.salesAttachmentUrl = attachmentUrl;
  req.updatedAt = now;
  req.updatedBy = Session.getActiveUser().getEmail() || 'Sales';
  req.messages = req.messages || [];
  req.messages.push({ by: req.updatedBy, message: txt, attachmentUrl: attachmentUrl, at: now, type: 'SALES_RESPONSE' });
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/infoRequests/' + requestId, req);
  p6FsPatchDoc_('infoRequests/' + requestId, req);
  p6_2ClearCaches_(no);
  return { status: 'success', message: 'Sales response submitted', requestId: requestId, complaintNo: no };
}

function reviewCmsInfoRequest(requestId, decision, comment) {
  const req = p6_2GetInfoRequestById_(requestId);
  const no = req.complaintNo;
  const d = String(decision || '').toUpperCase();
  const c = String(comment || '').trim();
  if (d === 'REOPEN' && !c) throw new Error('Reopen reason required');
  const now = new Date().toISOString();
  req.status = d === 'REOPEN' ? 'Reopened' : 'Closed';
  req.qaReviewComment = c;
  req.updatedAt = now;
  req.updatedBy = Session.getActiveUser().getEmail() || 'QA';
  req.messages = req.messages || [];
  req.messages.push({ by: req.updatedBy, message: c || (d === 'REOPEN' ? 'Reopened' : 'Accepted and closed'), at: now, type: d === 'REOPEN' ? 'QA_REOPEN' : 'QA_ACCEPT' });
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/infoRequests/' + requestId, req);
  p6FsPatchDoc_('infoRequests/' + requestId, req);
  if (req.status === 'Closed') p6StageUpdate(no, 'Under Review', 'More info request closed');
  p6_2ClearCaches_(no);
  return { status: 'success', message: req.status === 'Closed' ? 'Request accepted and closed' : 'Request reopened for Sales', requestId: requestId, complaintNo: no };
}

function p6_2GetInfoState_(complaintNo, stage) {
  const requests = p6FsListCollection_('complaints/' + encodeURIComponent(complaintNo) + '/infoRequests', 20) || [];
  requests.sort(function(a, b) { return Number(a.sequence || 0) - Number(b.sequence || 0); });
  const active = requests.find(r => ['Open', 'Reopened', 'Sales Responded'].indexOf(String(r.status || '')) >= 0) || null;
  const permissions = {
    canRaise: (stage === 'Under Review' || stage === 'Complaint Booked') && !active && requests.length < CMS_P6_2.MAX_INFO_REQUESTS,
    canRespond: !!active && (active.status === 'Open' || active.status === 'Reopened'),
    canReview: !!active && active.status === 'Sales Responded'
  };
  const chat = active ? (active.messages || []) : [];
  return {
    status: 'success',
    requests: requests.map(function(r) { r.permissions = permissions; return r; }),
    activeRequest: active,
    permissions: permissions,
    cyclesUsed: requests.length,
    maxCycles: CMS_P6_2.MAX_INFO_REQUESTS,
    chat: chat,
    messages: chat
  };
}

function p6_2GetInfoRequestById_(requestId) {
  const id = String(requestId || '').trim();
  if (!id) throw new Error('Request ID required');
  let req = null;
  try { req = p6FsGetDoc_('infoRequests/' + id); } catch (err) {}
  if (req && req.complaintNo) return req;
  throw new Error('Info request not found: ' + id);
}

/* =========================================================
   TRACKING / HISTORY HELPERS
========================================================= */
function getCmsComplaintTracking(complaintNo) {
  const no = String(complaintNo || '').trim();
  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no, currentStage: 'Complaint Booked' };
  const stage = doc.currentStage || doc.status || 'Complaint Booked';
  return { status: 'success', complaintNo: no, stages: cmsP6BuildStages_(stage), logs: p6_2GetTimeline_(no).map(p6_2TimelineToLog_) };
}

function p6_2GetTimeline_(complaintNo) {
  const rows = p6FsListCollection_('complaints/' + encodeURIComponent(complaintNo) + '/timeline', 50) || [];
  rows.sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  return rows;
}

function p6_2TimelineToLog_(t) {
  return {
    time: p6_2FormatDateTime_(t.createdAt),
    oldStatus: t.oldStage || '',
    newStatus: t.newStage || t.stage || t.type || '',
    stage: t.newStage || t.stage || '',
    remark: t.remark || '',
    user: t.user || t.updatedBy || 'System'
  };
}

/* =========================================================
   DRIVE FILE SAVE
========================================================= */
function p6_2SaveDataUrlToDrive_(dataUrl, complaintNo, prefix) {
  const data = String(dataUrl || '');
  const match = data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid file payload');
  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const ext = p6_2ExtFromMime_(mimeType);
  const fileName = [prefix || 'FILE', complaintNo, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')].join('_') + ext;
  const folder = p6_2GetUploadFolder_();
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
  return file.getUrl();
}

function p6_2GetUploadFolder_() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('CMS_CAPA_UPLOAD_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (err) {}
  }
  const existing = DriveApp.getFoldersByName(CMS_P6_2.CAPA_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(CMS_P6_2.CAPA_FOLDER_NAME);
}

function p6_2ExtFromMime_(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.indexOf('pdf') >= 0) return '.pdf';
  if (m.indexOf('png') >= 0) return '.png';
  if (m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0) return '.jpg';
  if (m.indexOf('word') >= 0 || m.indexOf('document') >= 0) return '.docx';
  if (m.indexOf('spreadsheet') >= 0 || m.indexOf('excel') >= 0) return '.xlsx';
  return '.bin';
}

/* =========================================================
   SHEET BACKUP - SAFE NO-OP IF LEGACY FUNCTIONS ARE ABSENT
========================================================= */
function p6_2SafeSheetStageBackup_(complaintNo, newStage, remark) {
  try {
    if (typeof updateCmsLifecycleStageLegacy === 'function') return updateCmsLifecycleStageLegacy(complaintNo, newStage, remark);
    if (typeof updateComplaintStageInSheet_ === 'function') return updateComplaintStageInSheet_(complaintNo, newStage, remark);
  } catch (err) {
    Logger.log('Sheet backup stage update failed: ' + err.message);
  }
  return { status: 'skipped', message: 'No sheet backup stage function found' };
}

/* =========================================================
   UTILITIES
========================================================= */
function p6_2ClearCaches_(complaintNo) {
  const cache = CacheService.getScriptCache();
  if (complaintNo) cache.remove(CMS_P6_2.WORKSPACE_CACHE_PREFIX + String(complaintNo).trim());
  cache.remove(CMS_P6_2.LIST_CACHE_KEY);
}

function p6_2BuildPublicTrackingUrl_(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) return '';
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) return url + '?track=' + encodeURIComponent(no);
  } catch (err) {}
  return '?track=' + encodeURIComponent(no);
}

function p6_2AgeDays_(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function p6_2DateInFy_(dateValue, fyLabel) {
  if (!dateValue || !fyLabel) return true;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return true;
  const m = String(fyLabel).match(/(\d{4})\D+(\d{2,4})/);
  if (!m) return true;
  const startYear = Number(m[1]);
  const start = new Date(startYear, 3, 1);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
  return d >= start && d <= end;
}

function p6_2FormatDateTime_(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm:ss');
}

function debugCmsP6_2Workspace(complaintNo) {
  const data = getCmsFastWorkspaceDataP6_2(complaintNo);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}

function debugCmsP6_2List() {
  const data = getCmsTrackingDataP6_2('ALL', 'ALL');
  Logger.log(JSON.stringify({ total: data.total, source: data.source, first: data.rows[0] || null }, null, 2));
  return data;
}

function executeCmsLifecycleAction(payload) {
  payload = payload || {};

  const complaintNo = String(payload.complaintNo || payload.refNo || payload.documentNo || '').trim();
  const actionCode = String(payload.actionCode || payload.action || '').trim();
  const remark = String(payload.remark || payload.note || '').trim();

  if (!complaintNo) throw new Error('Complaint No required.');
  if (!actionCode) throw new Error('Action code required.');

  const actionStageMap = {
    START_REVIEW: 'Under Review',
    START_INVESTIGATION: 'Under Investigation',
    MARK_INVESTIGATION_COMPLETE: 'Investigation Complete',
    MOVE_TO_CAPA_UPLOAD: 'Investigation Complete',
    CAPA_UPLOADED: 'CAPA Uploaded',
    VERIFY_CAPA: 'CAPA Verified',
    CLOSE_CASE: 'Case Closed'
  };

  const newStage = actionStageMap[actionCode];

  if (!newStage) {
    throw new Error('Unknown lifecycle action: ' + actionCode);
  }

  const result = p6StageUpdate(complaintNo, newStage, remark || actionCode);

  return {
    status: 'success',
    source: 'FIRESTORE_STAGE_ACTION',
    complaintNo: complaintNo,
    actionCode: actionCode,
    newStage: newStage,
    result: result
  };
}
