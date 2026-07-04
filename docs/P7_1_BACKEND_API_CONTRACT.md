# P7.1 Backend API Contract

## Standard response

```javascript
function cmsOk_(data, message) {
  return { ok: true, status: 'success', message: message || '', data: data || {}, error: '' };
}

function cmsFail_(err, message) {
  return {
    ok: false,
    status: 'error',
    message: message || (err && err.message) || String(err || 'Unknown error'),
    data: null,
    error: err && err.stack ? err.stack : String(err || '')
  };
}
```

## Frontend rule

Every `google.script.run` success handler must handle both:

```javascript
if (!res || res.ok === false || res.status === 'error') showError(res.message || 'Action failed');
```

## Canonical UI-facing functions

```javascript
getCmsTrackingData(fy, statusFilter)
getCmsFastWorkspaceData(complaintNo)
executeCmsLifecycleAction(payload)
raiseCmsInfoRequest(payload)
respondCmsInfoRequest(payload)
reviewCmsInfoRequest(payload)
uploadCmsCapaDocumentSimple(payload)
verifyCmsCapaDocumentSimple(payload)
requestCmsCapaRevision(payload)
getCmsAccessUsers()
saveCmsAccessUser(payload)
getPublicTrackingData(complaintNo)
```

## Dashboard/List response

```javascript
{
  ok: true,
  status: 'success',
  data: {
    rows: [],
    cards: { total: 0, open: 0, closed: 0, overdue: 0 },
    fyOptions: ['ALL', 'FY 2026-27'],
    stageSummary: [],
    severitySummary: []
  }
}
```

## Workspace response

```javascript
{
  ok: true,
  status: 'success',
  data: {
    complaint: {},
    stages: [],
    info: { requests: [], activeRequest: null, canRaise: true },
    capa: { latest: null, versions: [] },
    actions: [],
    quickLinks: {},
    timeline: []
  }
}
```
