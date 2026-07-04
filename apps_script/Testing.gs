function testBatchLookupDirect() {
  var batch = "K21052677";
  var result = findBatchDetailsFastV3(batch);
  Logger.log(JSON.stringify(result));
}

function testCMSBatchBridge() {
  var batch = "G23I010601";
  var result = getBatchLookupData(batch);
  Logger.log(JSON.stringify(result));
}

function testPincode() {
  var result = getPincodeDetails("110001");
  Logger.log(JSON.stringify(result));
}

function test() {
  var batch = "G23I010601";
  var result = getItemNamesForBatch(batch);
  Logger.log(JSON.stringify(result));
}


// function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('🌐 Open')
//     .addItem('🚀 Open Live App', 'openLive')
//     .addItem('🧪 Open Dev App', 'openDev')
//     .addToUi();
// }

function openLive() {
  const url = 'https://script.google.com/macros/s/AKfycbzAoGOVEVBhl765m--XCIwGXuxWe7YW-FQRnZ0ka2Yp3yMmrAlKvGrMABrCfjyMm6Vf/exec';

  const html = HtmlService.createHtmlOutput(`
    <script>
      window.open('${url}','_blank');
      google.script.host.close();
    </script>
  `);

  SpreadsheetApp.getUi().showModalDialog(html, 'Opening...');
}

function openDev() {
  const url = 'https://script.google.com/macros/s/AKfycbwb06lYA4jk6L-A71O-At_RoE6-MFC7hJWjjkFiyUI/dev';

  const html = HtmlService.createHtmlOutput(`
    <script>
      window.open('${url}','_blank');
      google.script.host.close();
    </script>
  `);

  SpreadsheetApp.getUi().showModalDialog(html, 'Opening...');
}

function check1(){
  var complaintNo ='CAPA-20260103-33';
  // var log = getCmsFastWorkspaceDataP6(complaintNo);
  // var log = debugCmsP6_1Workspace(complaintNo);
  // var log = syncCmsComplaintToFirestore("CAPA-20260103-33");
  var log1 = debugCmsP6_2Workspace("CAPA-20260103-33");
  // var log2 = syncCmsExistingComplaintsToFirestore(800)
  // console.log(log);
  // console.log(log1);
  console.log(log1);

}

