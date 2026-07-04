/**
 * P6.0 Firestore Hybrid Bridge for Romsons CMS
 * Add this file to Apps Script as a separate .gs file.
 * It keeps Google Sheet as backup/register, while Firestore becomes the fast read layer.
 *
 * Required Script Properties:
 * - GCP_PROJECT_ID
 * - GCP_SERVICE_ACCOUNT_EMAIL
 * - GCP_PRIVATE_KEY  (paste with \n escaped or actual line breaks)
 * Optional:
 * - FIRESTORE_DATABASE_ID = (default)
 * - CMS_COMPLAINT_SHEET = your complaint sheet name
 */

const CMS_P6 = {
  VERSION: 'P6.0_FIRESTORE_HYBRID',
  DEFAULT_DB: '(default)',
  TOKEN_CACHE_KEY: 'P6_FIRESTORE_ACCESS_TOKEN',
  TOKEN_TTL_SECONDS: 3300,
  STAGES: [
    'Complaint Booked',
    'Under Review',
    'More Info Requested',
    'Under Investigation',
    'Investigation Complete',
    'CAPA Uploaded',
    'CAPA Verified',
    'Case Closed'
  ]
};

function setupCmsP6FirestoreHybrid() {
  const props = PropertiesService.getScriptProperties();
  const required = ['GCP_PROJECT_ID', 'GCP_SERVICE_ACCOUNT_EMAIL', 'GCP_PRIVATE_KEY'];
  const missing = required.filter(k => !props.getProperty(k));
  if (missing.length) {
    throw new Error('Missing Script Properties: ' + missing.join(', '));
  }

  const now = new Date().toISOString();
  p6FsPatchDoc_('meta/cmsConfig', {
    app: 'ROMSONS_CMS',
    version: CMS_P6.VERSION,
    updatedAt: now,
    stages: CMS_P6.STAGES,
    note: 'Firestore hybrid layer active. Google Sheet remains backup/register.'
  });
  p6FsPatchDoc_('meta/setupLog', {
    lastSetupAt: now,
    setupBy: Session.getActiveUser().getEmail() || 'Apps Script',
    version: CMS_P6.VERSION
  });
  return { status: 'success', message: 'P6 Firestore Hybrid setup complete', version: CMS_P6.VERSION };
}

function syncCmsExistingComplaintsToFirestore(limit) {
  limit = Number(limit || 200);
  const sh = cmsP6GetComplaintSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { status: 'success', synced: 0, message: 'No complaint rows found' };

  const headers = values[0].map(h => String(h || '').trim());
  let synced = 0;
  const errors = [];

  for (let i = 1; i < values.length && synced < limit; i++) {
    try {
      const doc = cmsP6MapComplaintRow_(headers, values[i], i + 1);
      if (!doc.complaintNo) continue;
      p6UpsertComplaintDoc_(doc);
      synced++;
    } catch (err) {
      errors.push('Row ' + (i + 1) + ': ' + err.message);
    }
  }

  return { status: 'success', synced, errors, message: 'Synced ' + synced + ' complaints to Firestore' };
}

function syncCmsComplaintToFirestore(complaintNo) {
  const sh = cmsP6GetComplaintSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) throw new Error('Complaint sheet is empty');
  const headers = values[0].map(h => String(h || '').trim());
  const idx = cmsP6FindHeader_(headers, ['Complaint No', 'Complaint Number', 'CAPA Ref No', 'Ref No', 'Document No']);
  if (idx < 0) throw new Error('Complaint number column not found');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx] || '').trim() === String(complaintNo || '').trim()) {
      const doc = cmsP6MapComplaintRow_(headers, values[i], i + 1);
      p6UpsertComplaintDoc_(doc);
      return { status: 'success', complaintNo: doc.complaintNo, message: 'Complaint synced to Firestore' };
    }
  }
  throw new Error('Complaint not found in sheet: ' + complaintNo);
}

function getCmsFastWorkspaceDataP6(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  let doc = null;
  try { doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)); } catch (err) {}

  if (!doc || !doc.complaintNo) {
    try {
      syncCmsComplaintToFirestore(no);
      doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no));
    } catch (err) {
      // Last fallback to existing Apps Script function if present.
      if (typeof getCmsFastWorkspaceData === 'function') return getCmsFastWorkspaceData(no);
      throw err;
    }
  }

  const infoRequests = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/infoRequests', 3);
  const capaVersions = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/capaVersions', 10);
  const timeline = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/timeline', 20);

  return {
    status: 'success',
    source: 'FIRESTORE',
    complaint: doc,
    currentStage: doc.currentStage || doc.status || 'Complaint Booked',
    infoRequests: infoRequests,
    capaVersions: capaVersions,
    timeline: timeline,
    stages: cmsP6BuildStages_(doc.currentStage || doc.status || 'Complaint Booked'),
    nextAction: cmsP6NextAction_(doc.currentStage || doc.status || 'Complaint Booked', doc)
  };
}

function p6UpsertComplaintDoc_(doc) {
  const no = String(doc.complaintNo || '').trim();
  if (!no) throw new Error('Complaint No missing');
  doc.updatedAt = new Date().toISOString();
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no), doc);
  p6FsPatchDoc_('publicTracking/' + encodeURIComponent(no), cmsP6PublicDoc_(doc));
}

function p6StageUpdate(complaintNo, newStage, remark) {
  const no = String(complaintNo || '').trim();
  const stage = String(newStage || '').trim();
  if (!no || !stage) throw new Error('Complaint No and stage required');

  const oldDoc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  const oldStage = oldDoc.currentStage || oldDoc.status || '';
  const user = Session.getActiveUser().getEmail() || 'System';
  const now = new Date().toISOString();

  const update = Object.assign({}, oldDoc, {
    complaintNo: no,
    currentStage: stage,
    status: stage,
    stageOwner: cmsP6StageOwner_(stage),
    stageUpdatedAt: now,
    stageUpdatedBy: user,
    updatedAt: now
  });
  p6UpsertComplaintDoc_(update);

  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/timeline/' + cmsP6Id_('TL'), {
    complaintNo: no,
    oldStage: oldStage,
    newStage: stage,
    remark: remark || '',
    user: user,
    createdAt: now,
    type: 'STAGE_UPDATE'
  });
  return { status: 'success', complaintNo: no, oldStage, newStage: stage };
}

function p6SaveInfoRequest(complaintNo, payload) {
  const no = String(complaintNo || '').trim();
  payload = payload || {};
  const id = payload.requestId || cmsP6Id_('REQ');
  const now = new Date().toISOString();
  const doc = {
    requestId: id,
    complaintNo: no,
    sequence: Number(payload.sequence || 1),
    status: payload.status || 'Open',
    question: payload.question || '',
    salesResponse: payload.salesResponse || '',
    attachmentUrl: payload.attachmentUrl || '',
    updatedAt: now,
    updatedBy: Session.getActiveUser().getEmail() || 'System',
    createdAt: payload.createdAt || now
  };
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/infoRequests/' + id, doc);
  if (doc.status === 'Open') p6StageUpdate(no, 'More Info Requested', 'Information requested');
  return { status: 'success', requestId: id };
}

function p6SaveCapaVersion(complaintNo, payload) {
  const no = String(complaintNo || '').trim();
  payload = payload || {};
  if (!payload.documentUrl) throw new Error('CAPA document URL required');
  const versions = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/capaVersions', 50);
  const version = Number(payload.version || (versions.length + 1));
  const id = 'V' + version;
  const now = new Date().toISOString();
  const doc = {
    complaintNo: no,
    version: version,
    documentUrl: payload.documentUrl,
    remark: payload.remark || '',
    status: payload.status || 'Awaiting Sales Verification',
    uploadedBy: Session.getActiveUser().getEmail() || 'System',
    uploadedAt: now,
    updatedAt: now
  };
  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/capaVersions/' + id, doc);

  const complaint = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  complaint.latestCapaUrl = payload.documentUrl;
  complaint.capaStatus = doc.status;
  complaint.capaVersion = version;
  complaint.currentStage = 'CAPA Uploaded';
  complaint.status = 'CAPA Uploaded';
  p6UpsertComplaintDoc_(complaint);
  return { status: 'success', complaintNo: no, version };
}

function cmsP6PublicDoc_(doc) {
  return {
    complaintNo: doc.complaintNo || '',
    customer: doc.customer || '',
    product: doc.product || '',
    batch: doc.batch || '',
    severity: doc.severity || '',
    currentStage: doc.currentStage || doc.status || 'Complaint Booked',
    capaStatus: doc.capaStatus || 'Not started',
    updatedAt: doc.updatedAt || new Date().toISOString()
  };
}

function cmsP6GetComplaintSheet_() {
  if (typeof getComplaintSheet_ === 'function') return getComplaintSheet_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const propName = PropertiesService.getScriptProperties().getProperty('CMS_COMPLAINT_SHEET');
  if (propName && ss.getSheetByName(propName)) return ss.getSheetByName(propName);
  const candidates = ['Complaints', 'Complaint', 'Complaint Register', 'CMS_Complaints', 'CAPA'];
  for (let i = 0; i < candidates.length; i++) {
    const sh = ss.getSheetByName(candidates[i]);
    if (sh) return sh;
  }
  throw new Error('Complaint sheet not found. Set Script Property CMS_COMPLAINT_SHEET.');
}

function cmsP6MapComplaintRow_(headers, row, rowNo) {
  const get = names => {
    const i = cmsP6FindHeader_(headers, names);
    return i >= 0 ? row[i] : '';
  };
  const dateVal = get(['Complaint Date', 'Date', 'Complaint Dt', 'Created Date']);
  const status = String(get(['Current Stage', 'Stage', 'Status', 'Complaint Status']) || 'Complaint Booked').trim() || 'Complaint Booked';
  return {
    rowNo: rowNo,
    complaintNo: String(get(['Complaint No', 'Complaint Number', 'CAPA Ref No', 'Ref No', 'Document No']) || '').trim(),
    complaintDate: cmsP6DateIso_(dateVal),
    customer: String(get(['Customer Name', 'Customer', 'Hospital', 'Location']) || '').trim(),
    city: String(get(['City']) || '').trim(),
    state: String(get(['State']) || '').trim(),
    pincode: String(get(['Pincode', 'PIN']) || '').trim(),
    product: String(get(['Item Name', 'Product', 'Product Name']) || '').trim(),
    batch: String(get(['Batch No', 'Batch', 'Batch Number']) || '').trim(),
    severity: String(get(['Severity', 'Complaint Type', 'Finding Severity']) || '').trim(),
    currentStage: status,
    status: status,
    stageOwner: String(get(['Stage Owner']) || cmsP6StageOwner_(status)).trim(),
    capaStatus: String(get(['CAPA Status', 'CAPA Sub Status']) || 'Not started').trim(),
    capaVersion: Number(get(['CAPA Version']) || 0),
    pdfUrl: String(get(['PDF URL', 'PDF', 'Pdf Url']) || '').trim(),
    folderUrl: String(get(['Folder URL', 'Folder', 'Drive Folder']) || '').trim(),
    syncedAt: new Date().toISOString()
  };
}

function cmsP6FindHeader_(headers, names) {
  const norm = x => String(x || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerNorms = headers.map(norm);
  for (let n = 0; n < names.length; n++) {
    const needle = norm(names[n]);
    const idx = headerNorms.indexOf(needle);
    if (idx >= 0) return idx;
  }
  return -1;
}

function cmsP6BuildStages_(current) {
  const idx = CMS_P6.STAGES.indexOf(current);
  return CMS_P6.STAGES.map((s, i) => ({
    stage: s,
    status: i < idx ? 'Done' : (i === idx ? 'Active' : 'Pending')
  }));
}

function cmsP6NextAction_(stage, doc) {
  if (stage === 'Complaint Booked') return { code: 'START_REVIEW', label: 'Start Review' };
  if (stage === 'Under Review') return { code: 'START_INVESTIGATION', label: 'Start Investigation / Request Info' };
  if (stage === 'More Info Requested') return { code: 'RESPOND_OR_CLOSE_INFO', label: 'Complete info request' };
  if (stage === 'Under Investigation') return { code: 'MARK_INVESTIGATION_COMPLETE', label: 'Mark Investigation Complete' };
  if (stage === 'Investigation Complete') return { code: 'UPLOAD_CAPA', label: 'Upload CAPA Document' };
  if (stage === 'CAPA Uploaded') return { code: 'VERIFY_CAPA', label: 'Verify CAPA / Request Revision' };
  return { code: 'NONE', label: 'No pending action' };
}

function cmsP6StageOwner_(stage) {
  if (stage === 'Complaint Booked') return 'Sales Team';
  if (['Under Review', 'More Info Requested', 'Under Investigation', 'Investigation Complete', 'CAPA Uploaded'].indexOf(stage) >= 0) return 'QA Team';
  if (stage === 'CAPA Verified') return 'Sales Team';
  if (stage === 'Case Closed') return 'Auto';
  return '';
}

function cmsP6DateIso_(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function cmsP6Id_(prefix) {
  return prefix + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmssSSS');
}

/* ================= FIRESTORE REST CORE ================= */
function p6FsBase_() {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('GCP_PROJECT_ID');
  const db = encodeURIComponent(props.getProperty('FIRESTORE_DATABASE_ID') || CMS_P6.DEFAULT_DB);
  if (!projectId) throw new Error('GCP_PROJECT_ID missing');
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + db + '/documents';
}

function p6FsPatchDoc_(docPath, obj) {
  const url = p6FsBase_() + '/' + docPath;
  return p6FsFetch_(url, 'patch', { fields: p6ToFsFields_(obj) });
}

function p6FsGetDoc_(docPath) {
  const url = p6FsBase_() + '/' + docPath;
  const res = p6FsFetch_(url, 'get');
  return res && res.fields ? p6FromFsFields_(res.fields) : null;
}

function p6FsListCollection_(collectionPath, pageSize) {
  const url = p6FsBase_() + '/' + collectionPath + '?pageSize=' + encodeURIComponent(pageSize || 20);
  const res = p6FsFetch_(url, 'get');
  const docs = res.documents || [];
  return docs.map(d => p6FromFsFields_(d.fields || {}));
}

function p6FsFetch_(url, method, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + p6FirestoreToken_() }
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const resp = UrlFetchApp.fetch(url, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  throw new Error('Firestore ' + code + ': ' + text);
}

function p6FirestoreToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CMS_P6.TOKEN_CACHE_KEY);
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty('GCP_SERVICE_ACCOUNT_EMAIL');
  let privateKey = props.getProperty('GCP_PRIVATE_KEY');
  if (!clientEmail || !privateKey) throw new Error('Service account properties missing');
  privateKey = privateKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const enc = obj => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  const unsigned = enc(header) + '.' + enc(claim);
  const sig = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error('OAuth token error ' + code + ': ' + text);
  const token = JSON.parse(text).access_token;
  cache.put(CMS_P6.TOKEN_CACHE_KEY, token, CMS_P6.TOKEN_TTL_SECONDS);
  return token;
}

function p6ToFsFields_(obj) {
  const fields = {};
  Object.keys(obj || {}).forEach(k => fields[k] = p6ToFsValue_(obj[k]));
  return fields;
}
function p6ToFsValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(p6ToFsValue_) } };
  if (typeof v === 'object') return { mapValue: { fields: p6ToFsFields_(v) } };
  return { stringValue: String(v) };
}
function p6FromFsFields_(fields) {
  const obj = {};
  Object.keys(fields || {}).forEach(k => obj[k] = p6FromFsValue_(fields[k]));
  return obj;
}
function p6FromFsValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(p6FromFsValue_);
  if ('mapValue' in v) return p6FromFsFields_(v.mapValue.fields || {});
  return '';
}

function testP6FirestorePermissionOnly() {
  const testDoc = {
    ok: true,
    message: 'Firestore permission test successful',
    testedAt: new Date().toISOString()
  };

  p6FsPatchDoc_('cmsSystem/permissionTest', testDoc);

  const result = p6FsGetDoc_('cmsSystem/permissionTest');

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugP6FirestoreConfig() {
  const p = PropertiesService.getScriptProperties();
  const config = {
    projectId: p.getProperty('GCP_PROJECT_ID'),
    databaseId: p.getProperty('FIRESTORE_DATABASE_ID'),
    serviceAccountEmail: p.getProperty('GCP_SERVICE_ACCOUNT_EMAIL'),
    hasPrivateKey: !!p.getProperty('GCP_PRIVATE_KEY')
  };
  Logger.log(JSON.stringify(config, null, 2));
  return config;
}

function clearP6FirestoreTokenCache() {
  CacheService.getScriptCache().remove('P6_FIRESTORE_ACCESS_TOKEN');
  return 'P6 Firestore token cache cleared';
}