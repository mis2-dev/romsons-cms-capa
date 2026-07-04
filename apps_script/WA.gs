/****************************************************
 * CMS - Selected Rows WhatsApp Sender
 * Checked rows se WhatsApp msg send karega
 ****************************************************/

const CMS_WA_CONFIG = {
  spreadsheetId: '1a9g3PFVpoJpaw40Gv8ncRw06j8P6pmGNtQczNv36Dp0',
  sheetName: 'Complaint',
  headerRow: 1,

  // Fixed WhatsApp number / group id
  defaultRecipientNumber: '918909322722',
  // defaultRecipientNumber: PropertiesService.getScriptProperties().getProperties("CMS_ALERT_WHATSAPP_NO"),

  headers: {
    checkbox: 'Send WA',
    complaintNo: 'ComplaintNo',
    date: 'ComplaintDate',
    customerName: 'NameofCustomer',
    cityState: 'Address',
    productName: 'ItemName',
    batchNo: 'BatchNo',
    complaintSummary: 'ShortExplain',
    qty: 'Qty Affected',
    sample: 'Complaint Sample Available',
    reportedBy: 'ComplaintReceivedthrough',
    link: 'Complaint Folder URL',

    waStatus: 'WhatsApp Status',
    waError: 'WhatsApp Error',
    waSentTime: 'WA Sent Time'
  }
};


/**
 * Menu create karega
 * Agar standalone context me run ho to error ignore karega
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();

    ui.createMenu('CMS WhatsApp')
      .addItem('Send WhatsApp for Checked Rows', 'sendWhatsAppForCheckedCMSRows')
      .addItem('Add Checkbox Column', 'setupCMSWhatsAppCheckboxes')
      .addToUi();

    ui.createMenu('🌐 Open')
      .addItem('🚀 Open Live App', 'openLive')
      .addItem('🧪 Open Dev App', 'openDev')
      .addToUi();

  } catch (err) {
    Logger.log('Menu not created: ' + err.message);
  }
}


/**
 * Checked rows ka WhatsApp send karega
 */
function sendWhatsAppForCheckedCMSRows() {
  const ss = SpreadsheetApp.openById(CMS_WA_CONFIG.spreadsheetId);
  const sh = ss.getSheetByName(CMS_WA_CONFIG.sheetName);

  if (!sh) {
    throw new Error('Sheet not found: ' + CMS_WA_CONFIG.sheetName);
  }

  const headerRow = CMS_WA_CONFIG.headerRow;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow <= headerRow) {
    Logger.log('No data found.');
    return 'No data found.';
  }

  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const col = getCmsHeaderMap_(headers);

  const dataRange = sh.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol);
  const values = dataRange.getValues();

  const recipientNo = cleanPhoneNumber_(CMS_WA_CONFIG.defaultRecipientNumber);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  values.forEach((row, i) => {
    const sheetRow = headerRow + 1 + i;
    const isChecked = row[col.checkbox - 1] === true;

    if (!isChecked) return;

    const existingStatus = String(row[col.waStatus - 1] || '').trim();

    if (existingStatus.toLowerCase() === 'sent') {
      skippedCount++;
      sh.getRange(sheetRow, col.checkbox).setValue(false);
      return;
    }

    const payload = {
      // Multiple aliases for compatibility with existing WhatsApp sender
      recipient_number: recipientNo,
      recipientNumber: recipientNo,
      recipient: recipientNo,
      mobile: recipientNo,
      phone: recipientNo,
      to: recipientNo,

      complaint_no: cleanWhatsAppParam_(getCell_(row, col.complaintNo)),
      date: cleanWhatsAppParam_(formatCmsDate_(getCell_(row, col.date))),
      customer_name: cleanWhatsAppParam_(getCell_(row, col.customerName)),
      city_state: cleanWhatsAppParam_(getCell_(row, col.cityState)),
      product_name: cleanWhatsAppParam_(getCell_(row, col.productName)),
      batch_no: cleanWhatsAppParam_(getCell_(row, col.batchNo)),
      complaint_summary: cleanWhatsAppParam_(getCell_(row, col.complaintSummary)),
      qty: cleanWhatsAppParam_(getCell_(row, col.qty)),
      sample: cleanWhatsAppParam_(normalizeYesNo_(getCell_(row, col.sample))),
      user_name: cleanWhatsAppParam_(getCell_(row, col.reportedBy)),
      link: cleanWhatsAppParam_(getCell_(row, col.link))
    };

    try {
      validateCmsWhatsappPayload_(payload);

      sendComplaintWhatsappAlert_(payload);

      sh.getRange(sheetRow, col.waStatus).setValue('Sent');
      sh.getRange(sheetRow, col.waError).setValue('');
      sh.getRange(sheetRow, col.waSentTime).setValue(new Date());
      sh.getRange(sheetRow, col.checkbox).setValue(false);

      sentCount++;

    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);

      sh.getRange(sheetRow, col.waStatus).setValue('Failed');
      sh.getRange(sheetRow, col.waError).setValue(errMsg);
      sh.getRange(sheetRow, col.waSentTime).setValue(new Date());

      failedCount++;
      Logger.log('CMS WhatsApp failed at row ' + sheetRow + ': ' + errMsg);
    }
  });

  const msg =
    'CMS WhatsApp Process Completed\n\n' +
    'Sent: ' + sentCount + '\n' +
    'Failed: ' + failedCount + '\n' +
    'Skipped Already Sent: ' + skippedCount;

  Logger.log(msg);
  return msg;
}


/**
 * Send WA column me checkbox lagane ke liye setup function
 */
function setupCMSWhatsAppCheckboxes() {
  const ss = SpreadsheetApp.openById(CMS_WA_CONFIG.spreadsheetId);
  const sh = ss.getSheetByName(CMS_WA_CONFIG.sheetName);

  if (!sh) {
    throw new Error('Sheet not found: ' + CMS_WA_CONFIG.sheetName);
  }

  const headerRow = CMS_WA_CONFIG.headerRow;
  const lastRow = Math.max(sh.getLastRow(), headerRow + 1);
  const lastCol = sh.getLastColumn();

  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const col = getCmsHeaderMap_(headers);

  const checkboxRange = sh.getRange(headerRow + 1, col.checkbox, lastRow - headerRow, 1);
  checkboxRange.insertCheckboxes();

  const msg = 'Checkboxes added in "' + CMS_WA_CONFIG.headers.checkbox + '" column.';
  Logger.log(msg);
  return msg;
}


/**
 * Header names se column number find karega
 */
function getCmsHeaderMap_(headers) {
  const required = CMS_WA_CONFIG.headers;
  const map = {};

  Object.keys(required).forEach(key => {
    const headerName = required[key];

    const index = headers.findIndex(h =>
      String(h || '').trim().toLowerCase() === String(headerName).trim().toLowerCase()
    );

    if (index === -1) {
      throw new Error('Missing required header: ' + headerName);
    }

    map[key] = index + 1;
  });

  return map;
}


/**
 * Row se safe value get karega
 */
function getCell_(row, colNo) {
  if (!colNo) return '';
  return row[colNo - 1] || '';
}


/**
 * WhatsApp template parameter safe banata hai
 */
function cleanWhatsAppParam_(value) {
  return String(value || '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


/**
 * Phone number clean karega
 */
function cleanPhoneNumber_(value) {
  let phone = String(value || '').replace(/\D/g, '').trim();

  if (!phone) return '';

  // Indian 10 digit number hai to 91 add karega
  if (phone.length === 10) {
    phone = '91' + phone;
  }

  return phone;
}


/**
 * Date ko readable format me convert karega
 */
function formatCmsDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm');
  }

  return cleanWhatsAppParam_(value);
}


/**
 * Sample field normalize
 */
function normalizeYesNo_(value) {
  const v = String(value || '').trim().toLowerCase();

  if (v === 'true' || v === 'yes' || v === 'y' || v === 'available') return 'Yes';
  if (v === 'false' || v === 'no' || v === 'n' || v === 'not available') return 'No';

  return cleanWhatsAppParam_(value);
}


/**
 * Required payload validation
 */
function validateCmsWhatsappPayload_(payload) {
  const recipient =
    payload.recipient_number ||
    payload.recipientNumber ||
    payload.recipient ||
    payload.mobile ||
    payload.phone ||
    payload.to;

  if (!cleanPhoneNumber_(recipient)) {
    throw new Error('WhatsApp recipient number is missing.');
  }

  if (!cleanWhatsAppParam_(payload.complaint_no)) {
    throw new Error('Complaint No is blank.');
  }

  if (!cleanWhatsAppParam_(payload.customer_name)) {
    throw new Error('Customer Name is blank.');
  }

  if (!cleanWhatsAppParam_(payload.link)) {
    throw new Error('Complaint Folder URL is blank.');
  }
}


/**
 * Debug function - recipient number check karne ke liye
 */
function testCMSWhatsAppRecipientNo() {
  const no = cleanPhoneNumber_(CMS_WA_CONFIG.defaultRecipientNumber);
  Logger.log('CMS recipient number = ' + no);
  return no;
}