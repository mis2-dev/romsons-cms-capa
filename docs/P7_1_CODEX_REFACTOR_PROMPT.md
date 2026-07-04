# Codex Prompt — P7.1 CMS Refactor

You are refactoring a Google Apps Script based Romsons Complaint Management System / CAPA system.

## Stack

- Apps Script Web App frontend and backend
- Firestore as primary fast database
- Google Sheets as backup/register
- Google Drive for complaint/CAPA/evidence files
- WhatsApp API integration
- User roles: Admin, QA Team, Sales Team, Viewer

## Current problem

The system was built through many patches. There are duplicate functions and multiple frontend bootstraps overwriting each other. This causes dashboard cards to be 0, FY dropdown mismatch, blank notification modals, stage actions not marking properly, and customer details not showing consistently.

## Your task

First audit the files and create a function map. Do not change code before reporting conflicts. Then refactor into clean modules.

## Must preserve

1. Firestore bridge and service account working.
2. Google Sheet as backup/register.
3. Complaint lifecycle:
   - Complaint Booked
   - Under Review
   - More Info Requested
   - Under Investigation
   - Investigation Complete
   - CAPA Uploaded
   - CAPA Verified
   - Case Closed
4. More Info Request:
   - max 3 request cycles
   - one active request at a time
   - WhatsApp-style chat UI
   - Sales response must support attachment
5. CAPA:
   - upload/view/version
   - Sales verify or request revision
   - verify auto closes case
   - Admin can upload direct CAPA and pass stages
6. Public tracking without login
7. WhatsApp body folder link remains separate from tracking button/link
8. All notifications use modal, no alert()

## Refactor target files

Backend:

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

Frontend:

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

## Output required

1. Function conflict report.
2. Proposed final function ownership map.
3. Refactored files.
4. Migration notes.
5. Test checklist.

## Important

Avoid patch layering. Remove duplicate active functions. Use one backend response contract:

```javascript
{ ok: true, status: 'success', message: '', data: {}, error: '' }
```
