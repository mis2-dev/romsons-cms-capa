# P7.1 Test Checklist

## Firestore / setup

- [ ] `debugP6FirestoreConfig()` returns correct project/service account.
- [ ] `testP6FirestorePermissionOnly()` creates `cmsSystem/permissionTest`.
- [ ] `syncCmsExistingComplaintsToFirestore(10)` works.

## Dashboard

- [ ] Total/Open/Closed/Overdue cards show non-zero counts where data exists.
- [ ] FY dropdown shows ALL + detected FY values.
- [ ] Stage summary shows all stages with counts.
- [ ] Severity summary shows High/Medium/Low counts.

## Complaint list

- [ ] Customer name visible.
- [ ] City/state visible where sheet/Firestore has data.
- [ ] Product/batch visible.
- [ ] Search works.
- [ ] Status filter works.
- [ ] FY filter works.

## Workspace

- [ ] Header shows complaint no, stage, customer, address/city/state/pincode.
- [ ] Quick links show PDF/folder/public tracking if available.
- [ ] Stage tracking renders correctly.
- [ ] More Info tracking renders request 1/2/3.
- [ ] Stage update works with modal success message.
- [ ] No blank modal.

## More Info Chat

- [ ] QA can raise request.
- [ ] Sales can respond with attachment.
- [ ] Chat bubbles render with timestamp/user.
- [ ] QA can close request.
- [ ] Max 3 request cycles enforced.

## CAPA

- [ ] QA/Admin can upload CAPA.
- [ ] Latest CAPA view button works.
- [ ] Sales/Admin can verify and close.
- [ ] Sales/Admin can request revision with reason.
- [ ] CAPA version history persists.

## Access

- [ ] Admin sees User Access.
- [ ] QA sees QA actions only.
- [ ] Sales sees Sales actions only.
- [ ] Viewer cannot edit.
- [ ] Admin can override all stages.

## Public tracking / WhatsApp

- [ ] Public tracking opens without login.
- [ ] WhatsApp folder link remains separate.
- [ ] Tracking button/ref link opens current public status.
