# P7.1 Clean Refactor Plan — CMS/CAPA

## Goal

Convert the current patch-layered CMS into a stable modular Apps Script + Firestore system.

## Golden rules

1. Firestore is the fast primary read/write layer for UI.
2. Google Sheet stays as backup/register/fallback.
3. Do not create another overlay unless it is only a temporary compatibility shim.
4. Every backend UI-facing function must return the same response contract.
5. Every frontend action must use one notification modal system.
6. One function name = one owner file.

## Backend file structure

Create these files and move functions gradually:

```text
01_Config.gs
02_Auth_Access.gs
03_Firestore_Core.gs
04_Complaint_Service.gs
05_Dashboard_List_Service.gs
06_Workspace_Service.gs
07_InfoRequest_Service.gs
08_CAPA_Service.gs
09_PublicTracking_Service.gs
10_WhatsApp_Service.gs
11_Setup_Migration.gs
12_Debug_Tests.gs
```

## Frontend file structure

Use include files:

```text
index.html
UI_Styles.html
UI_Core.html
UI_Dashboard.html
UI_List.html
UI_Workspace.html
UI_InfoChat.html
UI_CAPA.html
UI_UserAccess.html
```

## Canonical backend function ownership

| Function | Owner file | Purpose |
|---|---|---|
| `authenticateUser` / `authenticateCmsLoginV2` | `02_Auth_Access.gs` | Login |
| `getMyCmsAccess` | `02_Auth_Access.gs` | Current user permission |
| `p6FsPatchDoc_`, `p6FsGetDoc_`, `p6FsListCollection_` | `03_Firestore_Core.gs` | Firestore REST core |
| `submitComplaint` | `04_Complaint_Service.gs` | New complaint creation |
| `getCmsTrackingData` | `05_Dashboard_List_Service.gs` | Dashboard/list Firestore rows/cards/FY |
| `getCmsFastWorkspaceData` | `06_Workspace_Service.gs` | One complaint workspace payload |
| `executeCmsLifecycleAction` | `06_Workspace_Service.gs` | Stage transition wrapper |
| `raiseCmsInfoRequest` | `07_InfoRequest_Service.gs` | QA request |
| `respondCmsInfoRequest` | `07_InfoRequest_Service.gs` | Sales response + attachment |
| `reviewCmsInfoRequest` | `07_InfoRequest_Service.gs` | QA close/reopen |
| `uploadCmsCapaDocumentSimple` | `08_CAPA_Service.gs` | CAPA upload/version |
| `verifyCmsCapaDocumentSimple` | `08_CAPA_Service.gs` | CAPA verify + close |
| `requestCmsCapaRevision` | `08_CAPA_Service.gs` | Sales revision |
| `getPublicTrackingData` | `09_PublicTracking_Service.gs` | Public tracking page |
| `sendComplaintWhatsappAlert_` | `10_WhatsApp_Service.gs` | WhatsApp send |
| `setupCmsSystemUpgradeAll` | `11_Setup_Migration.gs` | One central setup |

## Canonical frontend ownership

| Handler | Owner UI file |
|---|---|
| `cmsNotify`, `showSuccess`, `showError`, `showInfo`, `showLoader` | `UI_Core.html` |
| `loadDashboard`, `changeFinancialYear` | `UI_Dashboard.html` |
| `loadCmsTrackingV2`, `filterCmsRows` | `UI_List.html` |
| `openCmsDetail`, `renderWorkspace`, `runFastStageAction` | `UI_Workspace.html` |
| `renderMoreInfoChat`, `raiseInfoRequest`, `respondInfoRequest` | `UI_InfoChat.html` |
| `uploadCapa`, `verifyCapa`, `requestCapaRevision` | `UI_CAPA.html` |

## Response contract

All UI functions should return:

```javascript
{
  ok: true,
  status: 'success',
  message: 'Done',
  data: {},
  error: ''
}
```

On error:

```javascript
{
  ok: false,
  status: 'error',
  message: 'Human readable message',
  data: null,
  error: 'Technical detail'
}
```

## Refactor sequence

### Step 1 — Create clean files
Create the new file structure and copy helpers into the correct owner files.

### Step 2 — Rename legacy duplicates
Rename all old duplicate functions using `Legacy` suffix. Example:

```javascript
getCmsFastWorkspaceDataLegacy
getCmsTrackingDataLegacy
executeCmsLifecycleActionLegacy
```

### Step 3 — Keep one canonical UI API
Only one active `getCmsTrackingData`, one active `getCmsFastWorkspaceData`, one active `executeCmsLifecycleAction`.

### Step 4 — Clean frontend includes
Remove old overlay includes. Keep only clean modular includes.

### Step 5 — Test in this order

```text
1. Login
2. Dashboard cards + FY dropdown
3. Complaint list customer/product/stage
4. Open workspace
5. Stage update
6. More Info request + Sales attachment response
7. CAPA upload + verify + close
8. Admin override
9. Public tracking
10. WhatsApp link/button
```
