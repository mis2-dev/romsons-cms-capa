/**
 * P6.5 User Access Management UI + Admin Override Stabilizer
 * Install after P6.0/P6.1/P6.2/P6.3/P6.4 files.
 *
 * What this file does:
 * - Uses the existing UserDetails sheet as source of truth.
 * - Adds stable server APIs for an admin access-management panel.
 * - Mirrors access users to Firestore for fast lookup/audit if Firestore bridge is available.
 * - Overrides getCmsCurrentAccessP6_3() so P6.3/P6.4 stage/CAPA rules use latest access rights.
 */

const CMS_P6_5_ACCESS = {
  VERSION: 'P6.5_USER_ACCESS_MANAGEMENT',
  USER_SHEET: 'UserDetails',
  FIRESTORE_COLLECTION: 'cmsAccessUsers',
  ACCESS_LEVELS: ['NONE', 'VIEW', 'EDIT'],
  ROLES: ['Admin', 'QA Team', 'Sales Team', 'Viewer'],
  MODULES: [
    'Dashboard',
    'Complaint Create',
    'Complaint View',
    'Complaint Edit',
    'QA Review',
    'Info Request',
    'Investigation',
    'CAPA Upload',
    'CAPA Verify',
    'Reports',
    'User Management',
    'Audit Log'
  ],
  HEADERS: [
    'Email','Name','Password','Role','Active',
    'Dashboard','Complaint Create','Complaint View','Complaint Edit',
    'QA Review','Info Request','Investigation','CAPA Upload','CAPA Verify',
    'Reports','User Management','Audit Log'
  ]
};

function setupCmsP6_5UserAccessManagement() {
  p65EnsureAccessSheet_();
  p65SeedAdminIfEmpty_();
  const synced = p65SyncUsersToFirestore_();

  try {
    if (typeof p6FsPatchDoc_ === 'function') {
      p6FsPatchDoc_('meta/p6_5_userAccessManagement', {
        version: CMS_P6_5_ACCESS.VERSION,
        enabled: true,
        syncedUsers: synced.synced || 0,
        updatedAt: new Date().toISOString(),
        note: 'UserDetails-based module access UI enabled. Admin override flows use this access source.'
      });
    }
  } catch (err) {
    Logger.log('P6.5 Firestore meta skipped: ' + err.message);
  }

  return {
    status: 'success',
    version: CMS_P6_5_ACCESS.VERSION,
    message: 'P6.5 user access management installed',
    syncedUsers: synced.synced || 0
  };
}

function getCmsAccessPanelDataP6_5() {
  const current = p65RequireUserManagement_('VIEW');
  const users = p65ReadAccessUsers_();

  return {
    status: 'success',
    version: CMS_P6_5_ACCESS.VERSION,
    currentUser: current,
    modules: CMS_P6_5_ACCESS.MODULES,
    accessLevels: CMS_P6_5_ACCESS.ACCESS_LEVELS,
    roles: CMS_P6_5_ACCESS.ROLES,
    users: users,
    defaults: {
      Admin: p65DefaultPermissionsForRole_('Admin'),
      'QA Team': p65DefaultPermissionsForRole_('QA Team'),
      'Sales Team': p65DefaultPermissionsForRole_('Sales Team'),
      Viewer: p65DefaultPermissionsForRole_('Viewer')
    }
  };
}

function saveCmsAccessUserP6_5(payload) {
  p65RequireUserManagement_('EDIT');
  payload = payload || {};
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('User email is required');

  const role = String(payload.role || 'Viewer').trim() || 'Viewer';
  const permissions = payload.permissions || {};
  const rowNo = p65SaveAccessUserToSheet_({
    email: email,
    name: String(payload.name || '').trim(),
    password: String(payload.password || '').trim(),
    role: role,
    active: payload.active !== false,
    permissions: permissions,
    applyRoleDefaults: payload.applyRoleDefaults === true
  });

  const user = p65GetUserByEmail_(email) || { email: email, role: role };
  p65MirrorUserToFirestore_(user);
  p65AuditAccessChange_('SAVE_USER', email, user);

  return {
    status: 'success',
    message: 'User rights saved',
    rowNo: rowNo,
    user: user,
    users: p65ReadAccessUsers_()
  };
}

function setCmsUserActiveP6_5(email, active) {
  p65RequireUserManagement_('EDIT');
  const target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('User email is required');

  const sh = p65EnsureAccessSheet_();
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const ix = p65Index_(headers);
  let rowNo = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][ix.Email] || '').trim().toLowerCase() === target) {
      rowNo = r + 1;
      break;
    }
  }
  if (!rowNo) throw new Error('User not found: ' + target);
  sh.getRange(rowNo, ix.Active + 1).setValue(active ? 'Yes' : 'No');

  const user = p65GetUserByEmail_(target);
  p65MirrorUserToFirestore_(user);
  p65AuditAccessChange_(active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', target, user);

  return { status: 'success', message: active ? 'User activated' : 'User deactivated', user: user, users: p65ReadAccessUsers_() };
}

function resetCmsUserDefaultsP6_5(email, role) {
  p65RequireUserManagement_('EDIT');
  const target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('User email is required');

  const user = p65GetUserByEmail_(target);
  if (!user) throw new Error('User not found: ' + target);
  const nextRole = String(role || user.role || 'Viewer').trim() || 'Viewer';
  const defaults = p65DefaultPermissionsForRole_(nextRole);
  return saveCmsAccessUserP6_5({
    email: target,
    name: user.name || '',
    role: nextRole,
    active: user.active !== false,
    permissions: defaults
  });
}

function getCmsCurrentAccessP6_5() {
  const email = p65CurrentEmail_();
  if (!email) {
    return {
      status: 'success', email: '', name: 'System', role: 'Admin', active: true,
      isAdmin: true, permissions: p65DefaultPermissionsForRole_('Admin')
    };
  }

  p65EnsureAccessSheet_();
  let user = p65GetUserByEmail_(email);
  if (!user) {
    const users = p65ReadAccessUsers_();
    // First real user safeguard: if this is a fresh system, seed current session as Admin.
    if (!users.length) {
      p65SaveAccessUserToSheet_({
        email: email,
        name: email.split('@')[0],
        role: 'Admin',
        active: true,
        permissions: p65DefaultPermissionsForRole_('Admin')
      });
      user = p65GetUserByEmail_(email);
    } else {
      user = {
        email: email,
        name: email.split('@')[0],
        role: 'Viewer',
        active: true,
        permissions: p65DefaultPermissionsForRole_('Viewer'),
        inferred: true
      };
    }
  }

  user.isAdmin = p65IsAdmin_(user);
  user.status = 'success';
  return user;
}

/**
 * Override used by P6.3/P6.4 actions.
 * Admin role here can pass stages and upload CAPA directly.
 */
function getCmsCurrentAccessP6_3() {
  return getCmsCurrentAccessP6_5();
}

function getMyCmsAccess() {
  const u = getCmsCurrentAccessP6_5();
  return { status: 'success', email: u.email, name: u.name, role: u.role, active: u.active, isAdmin: u.isAdmin, permissions: u.permissions };
}

function debugCmsP6_5Access() {
  return getCmsAccessPanelDataP6_5();
}

/* ---------------- Internal helpers ---------------- */
function p65EnsureAccessSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CMS_P6_5_ACCESS.USER_SHEET);
  if (!sh) sh = ss.insertSheet(CMS_P6_5_ACCESS.USER_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CMS_P6_5_ACCESS.HEADERS.length).setValues([CMS_P6_5_ACCESS.HEADERS]);
  }

  const lastCol = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h || '').trim(); });
  CMS_P6_5_ACCESS.HEADERS.forEach(function(h) {
    if (current.indexOf(h) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
      current.push(h);
    }
  });

  sh.setFrozenRows(1);
  return sh;
}

function p65SeedAdminIfEmpty_() {
  const sh = p65EnsureAccessSheet_();
  const users = p65ReadAccessUsers_();
  if (users.length) return;

  const email = p65CurrentEmail_();
  if (!email) return;

  p65SaveAccessUserToSheet_({
    email: email,
    name: email.split('@')[0],
    role: 'Admin',
    active: true,
    permissions: p65DefaultPermissionsForRole_('Admin')
  });
}

function p65CurrentEmail_() {
  let email = '';
  try { email = PropertiesService.getUserProperties().getProperty('email') || ''; } catch (err) {}
  if (!email) {
    try { email = Session.getActiveUser().getEmail() || ''; } catch (err) {}
  }
  return String(email || '').trim().toLowerCase();
}

function p65ReadAccessUsers_() {
  const sh = p65EnsureAccessSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(String);
  const ix = p65Index_(headers);

  return data.slice(1).map(function(r, n) {
    const email = String(r[ix.Email] || '').trim().toLowerCase();
    if (!email) return null;
    const role = String(r[ix.Role] || 'Viewer').trim() || 'Viewer';
    const defaults = p65DefaultPermissionsForRole_(role);
    const permissions = {};
    CMS_P6_5_ACCESS.MODULES.forEach(function(m) {
      permissions[m] = p65NormalizeLevel_(r[ix[m]]) || defaults[m] || 'NONE';
    });
    const user = {
      rowNo: n + 2,
      email: email,
      name: String(r[ix.Name] || '').trim(),
      role: role,
      active: String(r[ix.Active] || 'Yes').trim().toLowerCase() !== 'no',
      permissions: permissions
    };
    user.isAdmin = p65IsAdmin_(user);
    return user;
  }).filter(Boolean);
}

function p65GetUserByEmail_(email) {
  const target = String(email || '').trim().toLowerCase();
  return p65ReadAccessUsers_().filter(function(u) { return u.email === target; })[0] || null;
}

function p65SaveAccessUserToSheet_(payload) {
  const sh = p65EnsureAccessSheet_();
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const ix = p65Index_(headers);
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('User email is required');

  let rowNo = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][ix.Email] || '').trim().toLowerCase() === email) {
      rowNo = r + 1;
      break;
    }
  }
  if (!rowNo) rowNo = sh.getLastRow() + 1;

  const role = String(payload.role || 'Viewer').trim() || 'Viewer';
  const defaults = p65DefaultPermissionsForRole_(role);
  const permissions = payload.applyRoleDefaults ? defaults : Object.assign({}, defaults, payload.permissions || {});

  sh.getRange(rowNo, ix.Email + 1).setValue(email);
  sh.getRange(rowNo, ix.Name + 1).setValue(payload.name || '');
  if (payload.password) sh.getRange(rowNo, ix.Password + 1).setValue(payload.password);
  sh.getRange(rowNo, ix.Role + 1).setValue(role);
  sh.getRange(rowNo, ix.Active + 1).setValue(payload.active === false ? 'No' : 'Yes');

  CMS_P6_5_ACCESS.MODULES.forEach(function(m) {
    if (ix[m] == null) return;
    sh.getRange(rowNo, ix[m] + 1).setValue(p65NormalizeLevel_(permissions[m]) || 'NONE');
  });

  return rowNo;
}

function p65RequireUserManagement_(level) {
  const current = getCmsCurrentAccessP6_5();
  if (p65IsAdmin_(current)) return current;
  const permission = p65NormalizeLevel_(current.permissions && current.permissions['User Management']) || 'NONE';
  if (level === 'VIEW' && (permission === 'VIEW' || permission === 'EDIT')) return current;
  if (level === 'EDIT' && permission === 'EDIT') return current;
  throw new Error('Access denied: User Management ' + level + ' permission required');
}

function p65DefaultPermissionsForRole_(role) {
  if (typeof defaultPermissionsForRole_ === 'function') {
    try { return defaultPermissionsForRole_(role); } catch (err) {}
  }

  const r = String(role || '').trim().toLowerCase();
  const perms = {};
  CMS_P6_5_ACCESS.MODULES.forEach(function(m) { perms[m] = 'NONE'; });

  if (r === 'admin' || r === 'administrator' || r === 'super admin') {
    CMS_P6_5_ACCESS.MODULES.forEach(function(m) { perms[m] = 'EDIT'; });
    return perms;
  }
  if (r.indexOf('qa') >= 0 || r.indexOf('quality') >= 0) {
    perms['Dashboard'] = 'VIEW';
    perms['Complaint Create'] = 'EDIT';
    perms['Complaint View'] = 'VIEW';
    perms['Complaint Edit'] = 'EDIT';
    perms['QA Review'] = 'EDIT';
    perms['Info Request'] = 'EDIT';
    perms['Investigation'] = 'EDIT';
    perms['CAPA Upload'] = 'EDIT';
    perms['CAPA Verify'] = 'VIEW';
    perms['Reports'] = 'VIEW';
    perms['Audit Log'] = 'VIEW';
    return perms;
  }
  if (r.indexOf('sales') >= 0) {
    perms['Dashboard'] = 'VIEW';
    perms['Complaint Create'] = 'EDIT';
    perms['Complaint View'] = 'VIEW';
    perms['Complaint Edit'] = 'EDIT';
    perms['Info Request'] = 'EDIT';
    perms['CAPA Verify'] = 'EDIT';
    perms['Reports'] = 'VIEW';
    return perms;
  }
  perms['Dashboard'] = 'VIEW';
  perms['Complaint View'] = 'VIEW';
  return perms;
}

function p65NormalizeLevel_(value) {
  if (typeof normalizeAccessLevel_ === 'function') {
    try { return normalizeAccessLevel_(value); } catch (err) {}
  }
  const v = String(value || '').trim().toUpperCase();
  if (['EDIT', 'VIEW', 'NONE'].indexOf(v) >= 0) return v;
  if (['YES', 'TRUE', '1', 'ALLOW', 'ALLOWED'].indexOf(v) >= 0) return 'EDIT';
  if (['NO', 'FALSE', '0', 'DENY', 'DENIED'].indexOf(v) >= 0) return 'NONE';
  return '';
}

function p65IsAdmin_(user) {
  const r = String(user && user.role || '').trim().toLowerCase();
  return ['admin', 'administrator', 'super admin'].indexOf(r) >= 0;
}

function p65Index_(headers) {
  const ix = {};
  headers.forEach(function(h, i) { ix[String(h || '').trim()] = i; });
  CMS_P6_5_ACCESS.HEADERS.forEach(function(h) {
    if (ix[h] == null) throw new Error('Missing UserDetails column: ' + h + '. Run setupCmsP6_5UserAccessManagement().');
  });
  return ix;
}

function p65SafeDocId_(email) {
  return Utilities.base64EncodeWebSafe(String(email || '').trim().toLowerCase()).replace(/=+$/, '');
}

function p65MirrorUserToFirestore_(user) {
  if (!user || !user.email || typeof p6FsPatchDoc_ !== 'function') return;
  try {
    p6FsPatchDoc_(CMS_P6_5_ACCESS.FIRESTORE_COLLECTION + '/' + p65SafeDocId_(user.email), {
      email: user.email,
      name: user.name || '',
      role: user.role || 'Viewer',
      active: user.active !== false,
      isAdmin: p65IsAdmin_(user),
      permissions: user.permissions || {},
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    Logger.log('P6.5 user Firestore mirror failed for ' + user.email + ': ' + err.message);
  }
}

function p65SyncUsersToFirestore_() {
  const users = p65ReadAccessUsers_();
  let synced = 0;
  users.forEach(function(u) {
    p65MirrorUserToFirestore_(u);
    synced++;
  });
  return { status: 'success', synced: synced };
}

function p65AuditAccessChange_(action, email, user) {
  try {
    if (typeof p6FsPatchDoc_ !== 'function') return;
    const id = 'AC' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmssSSS');
    p6FsPatchDoc_('cmsAccessAudit/' + id, {
      action: action,
      targetEmail: email,
      by: p65CurrentEmail_() || 'System',
      targetRole: user && user.role || '',
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    Logger.log('P6.5 audit skipped: ' + err.message);
  }
}
