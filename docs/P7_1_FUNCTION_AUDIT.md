# P7.1 Function Audit — Romsons CMS/CAPA

## Scope audited

Audited the current uploaded CMS files and recent patch files in the working folder.

| Metric | Count |
|---|---:|
| Files scanned | 16 |
| Unique function/window handlers | 463 |
| Duplicate function/window handler names | 46 |

## Files scanned

| File | Lines | Size bytes |
|---|---:|---:|
| `Code.gs` | 3060 | 136,460 |
| `Code_P6_1_FirestoreFastIntegration.gs` | 359 | 11,686 |
| `Code_P6_2_FirestoreStageCapaActions.gs` | 620 | 25,599 |
| `Code_P6_FirestoreBridge.gs.txt` | 474 | 18,227 |
| `Testing.gs` | 72 | 1,858 |
| `WA.gs` | 316 | 8,435 |
| `index.html` | 865 | 49,404 |
| `p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html` | 265 | 16,759 |
| `p63_patch/Code_P6_3_WorkspaceChatAccess.gs` | 262 | 10,121 |
| `p63_patch/index_P6_3.html` | 866 | 49,460 |
| `p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html` | 71 | 21,884 |
| `p64_patch/ZZZ_Code_P6_4_DashboardChatDataFix.gs` | 388 | 16,242 |
| `p65_patch/CMS_Bootstrap_P6_5_UserAccessManagement.html` | 101 | 12,526 |
| `p65_patch/ZZZ_Code_P6_5_UserAccessManagement.gs` | 460 | 14,877 |
| `p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html` | 420 | 26,423 |
| `p70_patch/ZZZ_Code_P7_0_CmsStabilizationRefactor.gs` | 832 | 32,163 |

## Critical conflict areas

These are the conflicts most likely causing blank modals, action mismatch, dashboard/list gaps, and slow/unstable behavior.

### `getCmsFastWorkspaceData` — 4 occurrence(s)
  - `Code.gs:2906`
  - `Code_P6_1_FirestoreFastIntegration.gs:10`
  - `Code_P6_1_FirestoreFastIntegration.gs:41`
  - `Code_P6_2_FirestoreStageCapaActions.gs:129`
### `getCmsTrackingData` — 3 occurrence(s)
  - `Code.gs:2941`
  - `Code_P6_2_FirestoreStageCapaActions.gs:43`
  - `p64_patch/ZZZ_Code_P6_4_DashboardChatDataFix.gs:31`
### `executeCmsLifecycleAction` — 3 occurrence(s)
  - `Code.gs:1742`
  - `Code_P6_2_FirestoreStageCapaActions.gs:196`
  - `Code_P6_2_FirestoreStageCapaActions.gs:583`
### `raiseCmsInfoRequest` — 2 occurrence(s)
  - `Code.gs:2170`
  - `Code_P6_2_FirestoreStageCapaActions.gs:340`
### `respondCmsInfoRequest` — 2 occurrence(s)
  - `Code.gs:2195`
  - `Code_P6_2_FirestoreStageCapaActions.gs:374`
### `reviewCmsInfoRequest` — 2 occurrence(s)
  - `Code.gs:2209`
  - `Code_P6_2_FirestoreStageCapaActions.gs:395`
### `uploadCmsCapaDocumentSimple` — 2 occurrence(s)
  - `Code.gs:2591`
  - `Code_P6_2_FirestoreStageCapaActions.gs:242`
### `verifyCmsCapaDocumentSimple` — 2 occurrence(s)
  - `Code.gs:2601`
  - `Code_P6_2_FirestoreStageCapaActions.gs:263`
### `requestCmsCapaRevision` — 2 occurrence(s)
  - `Code.gs:2368`
  - `Code_P6_2_FirestoreStageCapaActions.gs:297`
### `cmsP6GetComplaintSheet_` — 2 occurrence(s)
  - `Code_P6_FirestoreBridge.gs.txt:239`
  - `Code_P6_1_FirestoreFastIntegration.gs:328`
### `syncCmsComplaintToFirestore` — 2 occurrence(s)
  - `Code_P6_FirestoreBridge.gs.txt:80`
  - `Code_P6_1_FirestoreFastIntegration.gs:281`

## Duplicate function map

| Function | Count | Locations |
|---|---:|---|
| `getCmsFastWorkspaceData` | 4 | Code.gs:2906, Code_P6_1_FirestoreFastIntegration.gs:10, Code_P6_1_FirestoreFastIntegration.gs:41, Code_P6_2_FirestoreStageCapaActions.gs:129 |
| `esc` | 3 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:28, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:13, p65_patch/CMS_Bootstrap_P6_5_UserAccessManagement.html:13 |
| `executeCmsLifecycleAction` | 3 | Code.gs:1742, Code_P6_2_FirestoreStageCapaActions.gs:196, Code_P6_2_FirestoreStageCapaActions.gs:583 |
| `getCmsTrackingData` | 3 | Code.gs:2941, Code_P6_2_FirestoreStageCapaActions.gs:43, p64_patch/ZZZ_Code_P6_4_DashboardChatDataFix.gs:31 |
| `loader` | 3 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:33, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:17, p65_patch/CMS_Bootstrap_P6_5_UserAccessManagement.html:17 |
| `val` | 3 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:29, p65_patch/CMS_Bootstrap_P6_5_UserAccessManagement.html:14, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:16 |
| `window.openCmsDetail` | 3 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:38, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:48, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:192 |
| `window.runFastStageAction` | 3 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:56, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:56, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:273 |
| `add` | 2 | Code.gs:1004, p63_patch/Code_P6_3_WorkspaceChatAccess.gs:84 |
| `approveCmsCapaAndCloseP6` | 2 | Code_P6_1_FirestoreFastIntegration.gs:196, Code_P6_2_FirestoreStageCapaActions.gs:267 |
| `clearP6FirestoreTokenCache` | 2 | Code_P6_FirestoreBridge.gs.txt:471, Code_P6_1_FirestoreFastIntegration.gs:270 |
| `cmsP6GetComplaintSheet_` | 2 | Code_P6_FirestoreBridge.gs.txt:239, Code_P6_1_FirestoreFastIntegration.gs:328 |
| `debugP6FirestoreConfig` | 2 | Code_P6_FirestoreBridge.gs.txt:459, Code_P6_1_FirestoreFastIntegration.gs:256 |
| `getCmsComplaintTracking` | 2 | Code.gs:1900, Code_P6_2_FirestoreStageCapaActions.gs:449 |
| `getCmsCurrentAccessP6_3` | 2 | p63_patch/Code_P6_3_WorkspaceChatAccess.gs:48, p65_patch/ZZZ_Code_P6_5_UserAccessManagement.gs:207 |
| `getCmsInvestigationCapaWorkspace` | 2 | Code.gs:2307, Code.gs:2524 |
| `getCmsTrackingDataLegacy` | 2 | Code.gs:1824, Code.gs:2398 |
| `getMyCmsAccess` | 2 | Code.gs:172, p65_patch/ZZZ_Code_P6_5_UserAccessManagement.gs:211 |
| `linkBtn` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:120, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:242 |
| `markCmsInvestigationCompleteSimple` | 2 | Code.gs:2579, Code_P6_2_FirestoreStageCapaActions.gs:235 |
| `onOpen` | 2 | Testing.gs:25, WA.gs:40 |
| `q` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:12, p65_patch/CMS_Bootstrap_P6_5_UserAccessManagement.html:12 |
| `raiseCmsInfoRequest` | 2 | Code.gs:2170, Code_P6_2_FirestoreStageCapaActions.gs:340 |
| `renderActions` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:131, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:55 |
| `renderCapa` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:192, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:63 |
| `renderCase` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:96, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:53 |
| `renderChat` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:234, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:62 |
| `renderInfo` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:138, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:58 |
| `renderStages` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:122, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:54 |
| `renderTimeline` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:244, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:67 |
| `requestCmsCapaRevision` | 2 | Code.gs:2368, Code_P6_2_FirestoreStageCapaActions.gs:297 |
| `requestCmsCapaRevisionP6` | 2 | Code_P6_1_FirestoreFastIntegration.gs:223, Code_P6_2_FirestoreStageCapaActions.gs:301 |
| `respondCmsInfoRequest` | 2 | Code.gs:2195, Code_P6_2_FirestoreStageCapaActions.gs:374 |
| `reviewCmsInfoRequest` | 2 | Code.gs:2209, Code_P6_2_FirestoreStageCapaActions.gs:395 |
| `set` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:31, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:15 |
| `setupCmsFyDashboardP5` | 2 | Code.gs:2391, Code.gs:2461 |
| `syncCmsComplaintToFirestore` | 2 | Code_P6_FirestoreBridge.gs.txt:80, Code_P6_1_FirestoreFastIntegration.gs:281 |
| `text` | 2 | p63_patch/CMS_Bootstrap_P6_3_WorkspaceChatFix.html:32, p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:16 |
| `uploadCmsCapaDocumentSimple` | 2 | Code.gs:2591, Code_P6_2_FirestoreStageCapaActions.gs:242 |
| `verifyCmsCapaDocumentSimple` | 2 | Code.gs:2601, Code_P6_2_FirestoreStageCapaActions.gs:263 |
| `window.changeFinancialYear` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:45, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:96 |
| `window.filterCmsRows` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:46, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:180 |
| `window.loadCmsTrackingV2` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:44, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:108 |
| `window.showError` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:32, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:69 |
| `window.showInfo` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:33, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:70 |
| `window.showSuccess` | 2 | p64_patch/CMS_Bootstrap_P6_4_DashboardChatDataFix.html:31, p70_patch/CMS_Bootstrap_P7_0_StabilizationRefactor.html:68 |

## High-risk observations

1. `getCmsFastWorkspaceData` exists in multiple backend files. This creates uncertainty about whether the UI is loading from legacy Sheet scans, P6.1 Firestore wrapper, or P6.2 workspace payload.
2. `getCmsTrackingData` exists in legacy and P6/P6.4 layers. Dashboard/list cards can receive different response shapes depending on active function order.
3. `executeCmsLifecycleAction` exists in legacy and Firestore action layers. Status marking can silently call the wrong function.
4. Frontend handlers such as `openCmsDetail`, `runFastStageAction`, and `loadCmsTrackingV2` are overwritten by multiple bootstrap patches. The last included file wins, which explains why some actions work in one build and break after another patch.
5. Notification helpers are duplicated and inconsistent. This is the likely source of blank success modals.
6. Current system is patch-layered. Adding more overlays will keep fixing one issue and creating another. The next safe step is modular cleanup.

## Recommended decision

Freeze the latest working code and create a clean branch/refactor folder. Do not continue adding overlay patch files. Use this audit to consolidate one canonical function per feature.
