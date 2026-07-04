/**
 * P6.3 CMS Workspace UX + User Access Bridge
 * Add as a new .gs file after P6.0/P6.1/P6.2 files.
 * Purpose:
 * - Provides stable frontend-compatible action wrappers.
 * - Adds user role/access response for UI.
 * - Allows Admin override for stage jumps and direct CAPA upload/close.
 * - Keeps Firestore first and Sheet as backup.
 */

const CMS_P6_3 = {
  VERSION: 'P6.3_WORKSPACE_CHAT_ACCESS',
  STAGES: [
    'Complaint Booked',
    'Under Review',
    'More Info Requested',
    'Under Investigation',
    'Investigation Complete',
    'CAPA Uploaded',
    'CAPA Verified',
    'Case Closed'
  ],
  MODULES: {
    DASHBOARD: 'Dashboard',
    COMPLAINT_VIEW: 'Complaint View',
    QA_REVIEW: 'QA Review',
    INFO_REQUEST: 'Info Request',
    INVESTIGATION: 'Investigation',
    CAPA_UPLOAD: 'CAPA Upload',
    CAPA_VERIFY: 'CAPA Verify',
    USER_MANAGEMENT: 'User Management'
  }
};

function setupCmsP6_3WorkspaceChatAccess() {
  if (typeof setupCmsAccessControl === 'function') {
    try { setupCmsAccessControl(); } catch (err) { Logger.log('Access setup skipped: ' + err.message); }
  }
  p6FsPatchDoc_('meta/p6_3Config', {
    app: 'ROMSONS_CMS',
    version: CMS_P6_3.VERSION,
    updatedAt: new Date().toISOString(),
    note: 'Workspace chat UI, stage action wrappers and admin override enabled.'
  });
  return { status: 'success', version: CMS_P6_3.VERSION, message: 'P6.3 workspace/chat/access patch ready' };
}

function getCmsCurrentAccessP6_3() {
  try {
    if (typeof getCurrentUserAccess_ === 'function') {
      const u = getCurrentUserAccess_();
      return {
        status: 'success',
        email: u.email || '',
        name: u.name || '',
        role: u.role || '',
        isAdmin: p6_3IsAdmin_(u),
        permissions: u.permissions || {}
      };
    }
  } catch (err) {
    Logger.log('P6.3 access fallback: ' + err.message);
  }
  return { status: 'success', email: '', name: 'System', role: 'Admin', isAdmin: true, permissions: {} };
}

function getCmsFastWorkspaceDataP6_3(complaintNo) {
  const res = (typeof getCmsFastWorkspaceDataP6_2 === 'function')
    ? getCmsFastWorkspaceDataP6_2(complaintNo)
    : getCmsFastWorkspaceDataP6(complaintNo);

  const access = getCmsCurrentAccessP6_3();
  res.access = access;
  res.stageActions = p6_3BuildRoleActions_(res.currentStage, res.complaint || {}, res.info || {}, res.capa || {}, access);
  res.chat = p6_3BuildInfoChat_(String(complaintNo || res.complaintNo || '').trim(), res.info);
  return res;
}

function p6_3BuildRoleActions_(stage, doc, info, capa, access) {
  const isAdmin = !!(access && access.isAdmin);
  const role = String(access && access.role || '').toLowerCase();
  const actions = [];

  function add(code, label, type, needsRemark) {
    actions.push({ code: code, label: label, type: type || 'primary', remarkRequired: !!needsRemark });
  }

  if (isAdmin) {
    const all = CMS_P6_3.STAGES;
    const idx = all.indexOf(stage);
    if (idx < 0 || stage === 'Complaint Booked') add('START_REVIEW', 'Start Review', 'primary');
    if (stage !== 'Under Investigation') add('START_INVESTIGATION', 'Start Investigation', 'primary');
    if (stage !== 'Investigation Complete') add('MARK_INVESTIGATION_COMPLETE', 'Mark Investigation Complete', 'primary');
    add('REQUEST_MORE_INFO', 'Request More Info', 'warning', true);
    if (stage !== 'Case Closed') add('CLOSE_CASE', 'Admin Close Case', 'danger', true);
    if (stage === 'Case Closed') add('REOPEN_REVIEW', 'Reopen Case', 'warning', true);
    return actions;
  }

  if (stage === 'Complaint Booked' && (role.indexOf('qa') >= 0 || role.indexOf('quality') >= 0 || role.indexOf('admin') >= 0)) {
    add('START_REVIEW', 'Start Review', 'primary');
  }
  if (stage === 'Under Review') {
    if (role.indexOf('qa') >= 0 || role.indexOf('quality') >= 0) {
      add('START_INVESTIGATION', 'Start Investigation', 'primary');
      if (info && info.permissions && info.permissions.canRaise) add('REQUEST_MORE_INFO', 'Request More Info', 'warning', true);
    }
  }
  if (stage === 'Under Investigation' && (role.indexOf('qa') >= 0 || role.indexOf('quality') >= 0)) {
    add('MARK_INVESTIGATION_COMPLETE', 'Mark Investigation Complete', 'primary');
  }
  return actions;
}

/**
 * Frontend stable wrapper. Accepts either:
 *  - runCmsStageActionP6_3({complaintNo, actionCode, remark})
 *  - runCmsStageActionP6_3(complaintNo, actionCode, remark)
 */
function runCmsStageActionP6_3(arg1, arg2, arg3) {
  const payload = (typeof arg1 === 'object' && arg1 !== null)
    ? arg1
    : { complaintNo: arg1, actionCode: arg2, remark: arg3 };

  const no = String(payload.complaintNo || payload.refNo || payload.documentNo || '').trim();
  const code = String(payload.actionCode || payload.action || '').trim();
  const remark = String(payload.remark || payload.note || '').trim();

  if (!no) throw new Error('Complaint No required');
  if (!code) throw new Error('Action code required');

  const access = getCmsCurrentAccessP6_3();
  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no, currentStage: 'Complaint Booked' };
  const currentStage = doc.currentStage || doc.status || 'Complaint Booked';
  const allowed = p6_3BuildRoleActions_(currentStage, doc, {}, {}, access).map(a => a.code);

  if (!access.isAdmin && allowed.indexOf(code) < 0) {
    throw new Error('This action is not allowed for your current role/stage: ' + code);
  }

  if (code === 'REQUEST_MORE_INFO') {
    return raiseCmsInfoRequestP6_3({ complaintNo: no, question: remark || 'More information required by QA.' });
  }

  const stageMap = {
    START_REVIEW: 'Under Review',
    START_INVESTIGATION: 'Under Investigation',
    MARK_INVESTIGATION_COMPLETE: 'Investigation Complete',
    MARK_INV_COMPLETE_SIMPLE: 'Investigation Complete',
    CAPA_UPLOADED: 'CAPA Uploaded',
    VERIFY_CAPA: 'CAPA Verified',
    CLOSE_CASE: 'Case Closed',
    REOPEN_REVIEW: 'Under Review'
  };

  const newStage = stageMap[code];
  if (!newStage) throw new Error('Unknown lifecycle action: ' + code);

  const result = p6StageUpdate(no, newStage, remark || code);
  try { if (typeof p6_2SafeSheetStageBackup_ === 'function') p6_2SafeSheetStageBackup_(no, newStage, remark || code); } catch (err) {}
  try { if (typeof p6_2ClearCaches_ === 'function') p6_2ClearCaches_(no); } catch (err) {}

  return {
    status: 'success',
    source: 'P6_3_STAGE_ACTION',
    complaintNo: no,
    actionCode: code,
    newStage: newStage,
    access: access,
    result: result
  };
}

function raiseCmsInfoRequestP6_3(payload) {
  payload = payload || {};
  return raiseCmsInfoRequest(payload.complaintNo, payload.question || payload.message || payload.remark, payload.fileDataUrl || '');
}

function respondCmsInfoRequestP6_3(payload) {
  payload = payload || {};
  return respondCmsInfoRequest(payload.requestId, payload.response || payload.message || payload.remark, payload.fileDataUrl || '');
}

function reviewCmsInfoRequestP6_3(payload) {
  payload = payload || {};
  return reviewCmsInfoRequest(payload.requestId, payload.decision || 'ACCEPT', payload.comment || payload.remark || '');
}

function uploadCmsCapaDocumentP6_3(payload) {
  payload = payload || {};
  const no = String(payload.complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  const access = getCmsCurrentAccessP6_3();
  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || {};
  const stage = doc.currentStage || doc.status || 'Complaint Booked';
  const role = String(access.role || '').toLowerCase();

  if (!access.isAdmin && stage !== 'Investigation Complete' && String(doc.capaStatus || '') !== 'Revision Requested') {
    throw new Error('CAPA can be uploaded only after Investigation Complete. Admin can override.');
  }
  if (!access.isAdmin && role.indexOf('qa') < 0 && role.indexOf('quality') < 0) {
    throw new Error('Only QA/Admin can upload CAPA.');
  }

  return uploadCmsCapaDocumentSimple(no, {
    documentDataUrl: payload.documentDataUrl || '',
    documentUrl: payload.documentUrl || '',
    qaRemark: payload.remark || payload.qaRemark || ''
  });
}

function verifyCmsCapaDocumentP6_3(payload) {
  payload = payload || {};
  const no = String(payload.complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');
  const access = getCmsCurrentAccessP6_3();
  const role = String(access.role || '').toLowerCase();
  if (!access.isAdmin && role.indexOf('sales') < 0) throw new Error('Only Sales/Admin can verify CAPA.');
  return verifyCmsCapaDocumentSimple(no, payload.remark || 'CAPA verified');
}

function requestCmsCapaRevisionP6_3(payload) {
  payload = payload || {};
  return requestCmsCapaRevision(payload.complaintNo, payload.remark || payload.reason || 'CAPA revision requested');
}

function getCmsWorkspaceChatP6_3(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');
  const requests = p6FsListCollection_('complaints/' + encodeURIComponent(no) + '/infoRequests', 20) || [];
  requests.sort(function(a,b){ return Number(a.sequence || 0) - Number(b.sequence || 0); });
  return { status: 'success', complaintNo: no, requests: requests, chat: p6_3BuildInfoChat_(no, { requests: requests }) };
}

function p6_3BuildInfoChat_(complaintNo, info) {
  const requests = (info && info.requests) || [];
  const messages = [];
  requests.forEach(function(req) {
    (req.messages || []).forEach(function(m) {
      messages.push({
        requestId: req.requestId,
        sequence: req.sequence,
        status: req.status,
        by: m.by || '',
        message: m.message || '',
        attachmentUrl: m.attachmentUrl || '',
        at: m.at || req.updatedAt || '',
        type: m.type || '',
        side: /sales/i.test(String(m.by || m.type || '')) ? 'sales' : 'qa'
      });
    });
  });
  messages.sort(function(a,b){ return new Date(a.at || 0) - new Date(b.at || 0); });
  return messages;
}

function p6_3IsAdmin_(u) {
  const r = String(u && u.role || '').trim().toLowerCase();
  return ['admin', 'administrator', 'super admin'].indexOf(r) >= 0;
}
