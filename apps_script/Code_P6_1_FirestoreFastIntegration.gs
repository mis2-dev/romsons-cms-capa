/**
 * P6.1 Firestore Fast Workspace Integration for Romsons CMS
 * ----------------------------------------------------------
 * PURPOSE
 * 1) Firestore becomes the primary fast read layer for complaint workspace.
 * 2) Google Sheet remains backup/register.
 * 3) If a complaint is not found in Firestore, system syncs that one complaint from Sheet, then reads Firestore.
 *
 * IMPORTANT INSTALL NOTE
 * If your existing Code.gs already has function getCmsFastWorkspaceData(complaintNo), rename that old function to:
 *   getCmsFastWorkspaceDataLegacy(complaintNo)
 * Then add this file. This wrapper will use Firestore first and legacy Sheet read only as fallback.
 */

const CMS_P6_1 = {
  VERSION: 'P6.1_FIRESTORE_FAST_WORKSPACE',
  CACHE_PREFIX: 'P6_WS_',
  CACHE_TTL_SECONDS: 60
};

function setupCmsP6_1FastWorkspaceIntegration() {
  const result = setupCmsP6FirestoreHybrid();
  p6FsPatchDoc_('meta/p6_1_fastWorkspace', {
    version: CMS_P6_1.VERSION,
    enabled: true,
    updatedAt: new Date().toISOString(),
    note: 'Workspace reads Firestore first; Sheets remain backup/register.'
  });
  return {
    status: 'success',
    message: 'P6.1 Fast Workspace Integration setup complete',
    p6Setup: result
  };
}

/**
 * MAIN OVERRIDE WRAPPER
 * Rename old sheet-heavy getCmsFastWorkspaceData() to getCmsFastWorkspaceDataLegacy()
 * before adding this wrapper.
 */
function getCmsFastWorkspaceData(complaintNo) {
  return getCmsFastWorkspaceDataP6_1(complaintNo);
}

function getCmsFastWorkspaceDataP6_1(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  const cache = CacheService.getScriptCache();
  const cacheKey = CMS_P6_1.CACHE_PREFIX + no;
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      parsed.cacheHit = true;
      return parsed;
    } catch (err) {}
  }

  let data;
  try {
    data = getCmsFastWorkspaceDataP6(no);
  } catch (err) {
    // If Firestore does not have the complaint yet, sync one complaint from Sheet and retry.
    try {
      syncCmsComplaintToFirestore(no);
      data = getCmsFastWorkspaceDataP6(no);
    } catch (syncErr) {
      // Last fallback to renamed legacy heavy function if available.
      if (typeof getCmsFastWorkspaceDataLegacy === 'function') {
        data = getCmsFastWorkspaceDataLegacy(no);
        data.source = data.source || 'LEGACY_SHEET_FALLBACK';
      } else {
        throw syncErr;
      }
    }
  }

  const simplified = p6_1NormalizeWorkspacePayload_(data);
  cache.put(cacheKey, JSON.stringify(simplified), CMS_P6_1.CACHE_TTL_SECONDS);
  return simplified;
}

function p6_1NormalizeWorkspacePayload_(data) {
  data = data || {};
  const c = data.complaint || data.case || {};
  const currentStage = data.currentStage || c.currentStage || c.status || 'Complaint Booked';

  return {
    status: 'success',
    source: data.source || 'FIRESTORE',
    p6Version: CMS_P6_1.VERSION,
    complaint: c,
    complaintNo: c.complaintNo || data.complaintNo || '',
    currentStage: currentStage,
    stageOwner: c.stageOwner || cmsP6StageOwner_(currentStage),
    capaStatus: c.capaStatus || 'Not started',
    latestCapaUrl: c.latestCapaUrl || '',
    capaVersion: c.capaVersion || 0,
    stages: data.stages || cmsP6BuildStages_(currentStage),
    nextAction: data.nextAction || cmsP6NextAction_(currentStage, c),
    infoRequests: data.infoRequests || [],
    capaVersions: data.capaVersions || [],
    timeline: data.timeline || [],
    quickLinks: {
      pdfUrl: c.pdfUrl || '',
      folderUrl: c.folderUrl || '',
      publicTrackingUrl: p6_1BuildPublicTrackingUrl_(c.complaintNo || data.complaintNo || '')
    }
  };
}

function p6_1BuildPublicTrackingUrl_(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) return '';
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) return url + '?track=' + encodeURIComponent(no);
  } catch (err) {}
  return '?track=' + encodeURIComponent(no);
}

/**
 * Fast role-based stage update: Firestore first, optional Sheet sync fallback.
 */
function updateCmsStageFastP6(complaintNo, actionCode, remark) {
  const no = String(complaintNo || '').trim();
  const action = String(actionCode || '').trim();
  if (!no || !action) throw new Error('Complaint No and action code required');

  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  const oldStage = doc.currentStage || doc.status || 'Complaint Booked';
  const newStage = p6_1ResolveStageAction_(oldStage, action);

  const res = p6StageUpdate(no, newStage, remark || action);
  p6_1ClearWorkspaceCache_(no);

  // Optional legacy sheet update: if your current code has a function for updating sheet status,
  // map it here. This block is intentionally safe/no-op if function does not exist.
  try {
    if (typeof updateCmsLifecycleStageLegacy === 'function') {
      updateCmsLifecycleStageLegacy(no, newStage, remark || action);
    }
  } catch (err) {
    Logger.log('Legacy sheet stage update failed but Firestore update succeeded: ' + err.message);
  }

  return {
    status: 'success',
    complaintNo: no,
    oldStage: oldStage,
    newStage: newStage,
    actionCode: action,
    firestore: res
  };
}

function p6_1ResolveStageAction_(oldStage, actionCode) {
  const map = {
    START_REVIEW: 'Under Review',
    REQUEST_MORE_INFO: 'More Info Requested',
    START_INVESTIGATION: 'Under Investigation',
    MARK_INVESTIGATION_COMPLETE: 'Investigation Complete',
    UPLOAD_CAPA: 'CAPA Uploaded',
    VERIFY_CAPA: 'CAPA Verified',
    CLOSE_CASE: 'Case Closed',
    REOPEN_REVIEW: 'Under Review'
  };
  if (!map[actionCode]) throw new Error('Unknown action code: ' + actionCode);
  return map[actionCode];
}

function p6_1ClearWorkspaceCache_(complaintNo) {
  if (!complaintNo) return;
  CacheService.getScriptCache().remove(CMS_P6_1.CACHE_PREFIX + String(complaintNo).trim());
}

/**
 * CAPA document reference save. File upload can stay in current Drive flow.
 * After Drive upload returns document URL, call this function to update Firestore fast layer.
 */
function saveCmsCapaReferenceP6(complaintNo, documentUrl, remark) {
  const no = String(complaintNo || '').trim();
  const url = String(documentUrl || '').trim();
  if (!no || !url) throw new Error('Complaint No and CAPA document URL required');

  const res = p6SaveCapaVersion(no, {
    documentUrl: url,
    remark: remark || '',
    status: 'Awaiting Sales Verification'
  });
  p6_1ClearWorkspaceCache_(no);
  return res;
}

function approveCmsCapaAndCloseP6(complaintNo, remark) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  const doc = p6FsGetDoc_('complaints/' + encodeURIComponent(no)) || { complaintNo: no };
  doc.capaStatus = 'Verified';
  doc.status = 'Case Closed';
  doc.currentStage = 'Case Closed';
  doc.stageOwner = 'Auto';
  doc.salesVerificationRemark = remark || '';
  doc.updatedAt = new Date().toISOString();
  p6UpsertComplaintDoc_(doc);

  p6FsPatchDoc_('complaints/' + encodeURIComponent(no) + '/timeline/' + cmsP6Id_('TL'), {
    complaintNo: no,
    oldStage: 'CAPA Uploaded',
    newStage: 'Case Closed',
    remark: remark || 'CAPA approved and case closed',
    user: Session.getActiveUser().getEmail() || 'System',
    createdAt: new Date().toISOString(),
    type: 'CAPA_APPROVED_CLOSE'
  });

  p6_1ClearWorkspaceCache_(no);
  return { status: 'success', complaintNo: no, newStage: 'Case Closed' };
}

function requestCmsCapaRevisionP6(complaintNo, reason) {
  const no = String(complaintNo || '').trim();
  const r = String(reason || '').trim();
  if (!no || !r) throw new Error('Complaint No and revision reason required');

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

  p6_1ClearWorkspaceCache_(no);
  return { status: 'success', complaintNo: no, capaStatus: 'Revision Requested' };
}

function debugCmsP6_1Workspace(complaintNo) {
  const data = getCmsFastWorkspaceDataP6_1(complaintNo);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}

// function debugP6FirestoreConfig() {
//   const p = PropertiesService.getScriptProperties();
//   const config = {
//     projectId: p.getProperty('GCP_PROJECT_ID'),
//     databaseId: p.getProperty('FIRESTORE_DATABASE_ID'),
//     serviceAccountEmail: p.getProperty('GCP_SERVICE_ACCOUNT_EMAIL'),
//     hasPrivateKey: !!p.getProperty('GCP_PRIVATE_KEY'),
//     complaintSheet: !!p.getProperty('CMS_COMPLAINT_SHEET')
//   };
//   Logger.log(JSON.stringify(config, null, 2));
//   return config;
// }


// function clearP6FirestoreTokenCache() {
//   CacheService.getScriptCache().remove('P6_FIRESTORE_ACCESS_TOKEN');
//   return 'P6 Firestore token cache cleared';
// }


/**
 * Compatibility wrapper for P6.1.
 * Some P6.1 functions call syncCmsComplaintToFirestore().
 * If the original bridge function is missing/renamed, this fallback syncs one complaint from Sheet to Firestore.
 */
function syncCmsComplaintToFirestore(complaintNo) {
  const no = String(complaintNo || '').trim();
  if (!no) throw new Error('Complaint No required');

  const sh = cmsP6GetComplaintSheet_();
  const values = sh.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error('Complaint sheet is empty');
  }

  const headers = values[0].map(function(h) {
    return String(h || '').trim();
  });

  const complaintIdx = cmsP6FindHeader_(headers, [
    'Complaint No',
    'Complaint Number',
    'CAPA Ref No',
    'Ref No',
    'Document No'
  ]);

  if (complaintIdx < 0) {
    throw new Error('Complaint number column not found in complaint sheet');
  }

  for (let i = 1; i < values.length; i++) {
    const rowComplaintNo = String(values[i][complaintIdx] || '').trim();

    if (rowComplaintNo === no) {
      const doc = cmsP6MapComplaintRow_(headers, values[i], i + 1);
      p6UpsertComplaintDoc_(doc);

      return {
        status: 'success',
        source: 'SHEET_TO_FIRESTORE',
        complaintNo: doc.complaintNo,
        rowNo: i + 1,
        message: 'Complaint synced to Firestore'
      };
    }
  }

  throw new Error('Complaint not found in sheet: ' + no);
}

function cmsP6GetComplaintSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  const propSheetName = String(props.getProperty('CMS_COMPLAINT_SHEET') || '').trim();

  if (propSheetName) {
    const sh = ss.getSheetByName(propSheetName);
    if (sh) return sh;
    throw new Error('CMS_COMPLAINT_SHEET set hai, but sheet nahi mili: ' + propSheetName);
  }

  const candidates = [
    'Complaints',
    'Complaint',
    'Complaint Register',
    'CMS_Complaints',
    'CAPA',
    'Form Responses 1',
    'Data'
  ];

  for (let i = 0; i < candidates.length; i++) {
    const sh = ss.getSheetByName(candidates[i]);
    if (sh) return sh;
  }

  const allSheets = ss.getSheets().map(s => s.getName()).join(', ');
  throw new Error(
    'Complaint sheet not found. Script Property CMS_COMPLAINT_SHEET set karo. Available sheets: ' + allSheets
  );
}