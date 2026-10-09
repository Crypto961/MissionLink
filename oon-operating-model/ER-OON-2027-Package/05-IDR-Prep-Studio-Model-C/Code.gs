/**
 * IDR Initiation Prep Studio (internal).
 *
 * Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the
 * federal IDR portal page by page. The US desk then copies every field into the portal.
 * Nothing in this app connects to, or sends anything to, the CMS portal.
 *
 * Deploy: create a Google Sheet, Extensions > Apps Script, add Code.gs, Index.html and
 * Pdf.html, add the Google Sheets API under Services (identifier: Sheets), run setup(),
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within
 * your organization). setup() is safe to run again after every code update.
 */

const APP_NAME = 'IDR Initiation Prep Studio';
const LOGO_URL = 'https://drive.google.com/thumbnail?id=18bqSCdjITeFAI8RmT6EAngDvhOV5cXmX&sz=w1000';
const SHEET_ID = ''; // leave empty when the script is bound to the Sheet

const TABS = { disputes: 'Disputes', lines: 'LineItems', files: 'Files', options: 'Options', log: 'Log' };

const STATUS = { draft: 'Draft', ready: 'Ready for US desk', filed: 'Filed', returned: 'Returned' };

// ------------------------------------------------------------------ portal schema
// Labels and order follow the portal's saved pages. Change a label here and both the
// entry screens and the US copy desk follow.

const YES_NO = ['Yes', 'No'];
const ACTING_AS = ['Group Health Plan', 'Individual health insurance issuer', 'Federal Employees Health Benefits (FEHB) carrier',
  'Health care provider', 'Health care facility', 'Provider of air ambulance services'];
const PLAN_ROLE = ['Group Health Plan', 'Individual health insurance issuer', 'Federal Employees Health Benefits (FEHB) carrier'];
const DESIGNATION = ['Health care provider', 'Health care facility', 'Provider of air ambulance services'];
const ITEM_TYPES = ['Emergency item(s)/service(s)', 'Post-stabilization service(s)', 'Professional service(s)',
  'Hospital-based service(s)', 'Item(s)/service(s) furnished by a nonparticipating provider at a participating health care facility',
  'Out-of-network air ambulance service(s)', 'Other: Provide description'];

function contactFields_(prefix, required) {
  return [
    { key: prefix + 'name', label: 'Name:', type: 'text', required: false, skipForMain: true },
    { key: prefix + 'addr1', label: 'Mailing Address:', type: 'text', required: required, placeholder: 'Street Address' },
    { key: prefix + 'addr2', label: 'Mailing Address Line 2:', type: 'text', placeholder: 'Apartment, suite, unit, building, floor etc.' },
    { key: prefix + 'city', label: 'City:', type: 'text', required: required, placeholder: 'City Name', width: 'third' },
    { key: prefix + 'state', label: 'State:', type: 'select', options: 'State', required: required, width: 'third' },
    { key: prefix + 'zip', label: 'Zip Code:', type: 'zip', required: required, placeholder: '#####-####', width: 'third' },
    { key: prefix + 'email', label: 'Email:', type: 'email', required: required, width: 'half' },
    { key: prefix + 'phone', label: 'Phone:', type: 'phone', required: required, placeholder: '###-###-####', width: 'half' }
  ];
}

function pocSection_(prefix, title) {
  return { title: title, fields: contactFields_(prefix, false) };
}

function schema_() {
  const planMain = [
    { key: 'plan_role', label: "I'm a(n):", type: 'radio', options: PLAN_ROLE, required: true },
    { key: 'plan_name', label: 'Health Insurance Plan or Company:', type: 'text', required: true }
  ].concat(contactFields_('plan_', true).filter(function (f) { return !f.skipForMain; }))
    .concat([{ key: 'plan_fax', label: 'Fax:', type: 'phone', placeholder: '###-###-####', width: 'half' }]);

  return {
    pages: [
      {
        id: 'q1', title: 'Qualification Questions', step: 'Qualification Questions · page 1',
        sections: [{ title: '', fields: [
          { key: 'q_prior_2022', label: 'Was the service in question provided prior to 1/1/2022?', type: 'radio', options: YES_NO, required: true },
          { key: 'q_acting_as', label: 'I am (or I am acting on behalf of) a:', type: 'radio', options: ACTING_AS, required: true },
          { key: 'q_plan_type', label: 'Health Plan Type:', type: 'select', options: 'HealthPlanType', required: true }
        ] }]
      },
      {
        id: 'q2', title: 'Qualification Questions', step: 'Qualification Questions · page 2',
        sections: [{ title: '', fields: [
          { key: 'on_start_date', label: 'Start Date of the Open Negotiation Period:', type: 'date', required: true, max: 'today' },
          { key: 'on_evidence', label: 'Upload evidence of the open negotiation period start date. For example, a copy of the notice or notices of open negotiation for the claim or claims in this dispute that was sent to the non-initiating party.', type: 'file', category: 'on_evidence', required: true },
          { key: 'consent_waiver', label: 'Did the health care provider or health care facility get consent from the participant, beneficiary, or enrollee to waive surprise billing protections for these items or services?', type: 'radio', options: YES_NO, required: true }
        ] }]
      },
      {
        id: 'parties', title: 'Notice of IDR Initiation', step: 'Notice of IDR Initiation · parties',
        sections: [
          { title: 'Group Health Plan / Health Insurance Issuer / FEHB Carrier Information or TPA', fields: planMain },
          pocSection_('plan_p1_', 'Primary point-of-contact if different from above:'),
          pocSection_('plan_p2_', 'Secondary point-of-contact: (optional)'),
          { title: 'Health Care Provider, Health Care Facility, or Provider of Air Ambulance Services Information or TPA', fields: [
            { key: 'prov_designation', label: 'Select one of the Health Care Designations:', type: 'radio', options: DESIGNATION, required: true }
          ] },
          pocSection_('prov_p1_', 'Primary point-of-contact if different from above:'),
          pocSection_('prov_p2_', 'Secondary point-of-contact: (optional)')
        ]
      }
    ],
    line: {
      title: 'Notice of IDR Initiation', step: 'Notice of IDR Initiation · line items',
      sections: [
        { title: 'Line Item', fields: [
          { key: 'claim_number', label: 'Claim Number:', type: 'text', required: true, width: 'half' },
          { key: 'service_date', label: 'Date of the qualified IDR item or service:', type: 'date', required: true, min: '2022-01-01', width: 'half' }
        ] },
        { title: 'Payment Information', fields: [
          { key: 'description', label: 'Enter the description of the item or service.', type: 'textarea', required: true },
          { key: 'qpa', label: 'Qualifying Payment Amount (QPA):', type: 'money', required: true, width: 'half' },
          { key: 'qpa_docs', label: 'Upload documentation of the claim and QPA. Examples of acceptable documentation include the initial payment or notice of denial of payment, remittance form and explanation of benefits, explanation of payments.', type: 'file', category: 'qpa', required: true },
          { key: 'cost_sharing', label: 'Cost sharing amount allowed:', type: 'money', required: true, width: 'half' },
          { key: 'initial_payment', label: 'Initial payment amount for the item(s) and/or service(s) (if applicable):', type: 'money', width: 'half' }
        ] },
        { title: 'Type of Qualified Item(s) or Service(s)', fields: [
          { key: 'item_types', label: 'Select the item(s) or service(s) under dispute and provide the service code.', type: 'checkboxes', options: ITEM_TYPES, required: true },
          { key: 'other_desc', label: 'Other: Provide description', type: 'text', requiredIf: { key: 'item_types', includes: 'Other: Provide description' } },
          { key: 'service_code', label: 'Service Code:', type: 'text', required: true, width: 'quarter' },
          { key: 'modifiers', label: 'Service Code Modifier(s):', type: 'text', required: true, width: 'quarter' },
          { key: 'pos_code', label: 'Place of Service Code:', type: 'text', required: true, width: 'quarter' },
          { key: 'location', label: 'Location of Service:', type: 'select', options: 'State', required: true, width: 'quarter' }
        ] }
      ]
    },
    final: {
      title: 'Notice of IDR Initiation', step: 'Notice of IDR Initiation · summary',
      columns: [
        { key: 'description', label: 'Description of item(s) or service(s)' },
        { key: 'claim_number', label: 'Claim Number' },
        { key: 'service_date', label: 'Date of item or service', type: 'date' },
        { key: 'qpa', label: 'Qualifying Payment Amount (QPA)', type: 'money' },
        { key: 'location', label: 'Location of service (include state)' },
        { key: 'service_code', label: 'Service Code' },
        { key: 'modifiers', label: 'Service Code Modifier(s)' },
        { key: 'pos_code', label: 'Place of service code(s)' }
      ],
      additional: { key: 'additional_docs', label: 'Additional Supporting Documentation', type: 'file', category: 'additional' }
    }
  };
}

function headerKeys_() {
  const keys = [];
  schema_().pages.forEach(function (p) {
    p.sections.forEach(function (s) {
      s.fields.forEach(function (f) { if (f.type !== 'file') keys.push(f.key); });
    });
  });
  return keys;
}

function lineKeys_() {
  const keys = [];
  schema_().line.sections.forEach(function (s) {
    s.fields.forEach(function (f) { if (f.type !== 'file') keys.push(f.key); });
  });
  return keys;
}

const DISPUTE_META = ['DisputeID', 'Status', 'Team', 'Owner', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt',
  'FolderUrl', 'ConfirmationPdfUrl', 'ReadyAt', 'FiledBy', 'FiledAt', 'PortalDisputeNumber', 'PortalPdfUrl', 'ReturnReason'];
const LINE_META = ['DisputeID', 'LineNo'];

// ------------------------------------------------------------------ web app

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.LOGO_URL = LOGO_URL;
  t.APP_NAME = APP_NAME;
  // The first screen's data goes into the page itself, so it opens without a second server call.
  let boot;
  try { boot = getBootstrap(true); } catch (e) { boot = { error: e.message }; }
  t.BOOT_JSON = JSON.stringify(boot).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function getBootstrap(withList) {
  const email = currentUser_();
  const desk = isUsDesk_(email);
  const boot = {
    user: email,
    isUsDesk: desk,
    schema: schema_(),
    options: options_(),
    status: STATUS
  };
  if (withList) {
    boot.listFilter = desk ? STATUS.ready : STATUS.draft;
    boot.list = listDisputes(boot.listFilter);
  }
  return boot;
}

// ------------------------------------------------------------------ disputes

function listDisputes(filter) {
  const t = readTables_([TABS.disputes, TABS.lines]);
  const count = {};
  rows_(t[1]).forEach(function (l) { count[l.DisputeID] = (count[l.DisputeID] || 0) + 1; });
  return rows_(t[0])
    .filter(function (r) { return !filter || filter === 'All' || r.Status === filter; })
    .map(function (r) {
      return {
        id: r.DisputeID, status: r.Status, team: r.Team, owner: r.Owner, plan: r.plan_name,
        lines: count[r.DisputeID] || 0, updatedAt: r.UpdatedAt, updatedBy: r.UpdatedBy,
        returnReason: r.ReturnReason, pdf: r.ConfirmationPdfUrl
      };
    })
    .reverse();
}

/** Everything the editor and the copy desk need for one dispute, read in a single Sheets request. */
function getDispute(id) {
  const t = readTables_([TABS.disputes, TABS.lines, TABS.files]);
  const d = rows_(t[0]).filter(function (r) { return r.DisputeID === id; })[0];
  if (!d) throw new Error('Dispute not found: ' + id);
  const lines = rows_(t[1])
    .filter(function (l) { return l.DisputeID === id; })
    .sort(function (a, b) { return Number(a.LineNo) - Number(b.LineNo); });
  return { dispute: d, lines: lines, files: filesOf_(id) };
}

/** Creates or updates the dispute header (pages 1-3). Returns { id, bundle }. */
function saveDispute(payload) {
  const id = withLock_(function () {
    const user = currentUser_();
    const now = nowStr_();
    let id = payload.id;
    let rowNum = id ? findRow_(TABS.disputes, 'DisputeID', id) : -1;
    let rec;

    if (rowNum === -1) {
      id = newId_();
      rec = { DisputeID: id, Status: STATUS.draft, CreatedBy: user, CreatedAt: now, FolderUrl: disputeFolder_(id).getUrl() };
    } else {
      rec = rowAt_(TABS.disputes, rowNum);
      if (rec.Status === STATUS.filed) throw new Error('This dispute is already filed and can no longer be edited.');
    }

    const values = payload.values || {};
    headerKeys_().concat(['Team', 'Owner']).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(values, k)) rec[k] = safe_(values[k]);
    });
    rec.UpdatedBy = user;
    rec.UpdatedAt = now;
    if (rowNum === -1) appendRecords_(TABS.disputes, [rec]); else writeRecord_(TABS.disputes, rowNum, rec);
    log_(id, 'save', payload.page || '');
    return id;
  });
  return { id: id, bundle: getDispute(id) };
}

/** Adds or replaces a line item (page 4). Returns { lineNo, bundle }. */
function saveLine(id, lineNo, values) {
  lineNo = withLock_(function () {
    assertEditable_(id);
    const keys = lineKeys_();
    const all = table_(TABS.lines).rows;
    const existing = all.filter(function (r) { return r.DisputeID === id; });
    if (!lineNo) {
      if (existing.length >= 50) throw new Error('This dispute already has 50 line items, the maximum for one batched dispute.');
      lineNo = existing.reduce(function (m, r) { return Math.max(m, Number(r.LineNo) || 0); }, 0) + 1;
    }
    const rec = { DisputeID: id, LineNo: Number(lineNo) };
    keys.forEach(function (k) { rec[k] = safe_(values[k]); });
    let rowNum = -1;
    all.forEach(function (r, i) { if (r.DisputeID === id && Number(r.LineNo) === Number(lineNo)) rowNum = i + 2; });
    if (rowNum === -1) appendRecords_(TABS.lines, [rec]); else writeRecord_(TABS.lines, rowNum, rec);
    touch_(id);
    log_(id, 'line:' + lineNo, 'saved');
    return lineNo;
  });
  return { lineNo: lineNo, bundle: getDispute(id) };
}

function deleteLine(id, lineNo) {
  withLock_(function () {
    assertEditable_(id);
    deleteWhere_(TABS.lines, function (r) { return r.DisputeID === id && Number(r.LineNo) === Number(lineNo); });
    // Remove that line's QPA documentation records too; the Drive files stay in the folder.
    deleteWhere_(TABS.files, function (r) { return r.DisputeID === id && r.Category === 'qpa' && Number(r.LineNo) === Number(lineNo); });
    touch_(id);
    log_(id, 'line:' + lineNo, 'deleted');
  });
  return getDispute(id);
}

/** Stores one uploaded file in the dispute's Drive folder. data is base64 without the data: prefix. Returns the dispute's file list. */
function uploadFile(id, category, lineNo, name, mimeType, data) {
  if (!id) throw new Error('Save the page before uploading files.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > 45 * 1024 * 1024) throw new Error('Files must be under 45 MB each.');
  const file = disputeFolder_(id).createFile(Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name));
  return withLock_(function () {
    appendRecords_(TABS.files, [fileRecord_(id, category, lineNo, name, file)]);
    log_(id, 'upload', category + ' ' + name);
    return { name: name, url: file.getUrl(), id: file.getId(), files: filesOf_(id) };
  });
}

function removeFile(id, fileId) {
  return withLock_(function () {
    assertEditable_(id);
    deleteWhere_(TABS.files, function (r) { return r.DisputeID === id && r.FileId === fileId; });
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    log_(id, 'file-removed', fileId);
    return filesOf_(id);
  });
}

/** Checks the dispute, saves the summary page as a PDF in Drive and hands it to the US desk. */
function finalizeDispute(id) {
  const problems = validate_(id);
  if (problems.length) return { ok: false, problems: problems };
  const pdfUrl = buildConfirmationPdf_(id);
  withLock_(function () {
    setCells_(id, { Status: STATUS.ready, ConfirmationPdfUrl: pdfUrl, ReadyAt: nowStr_(), ReturnReason: '' });
    log_(id, 'status', STATUS.ready);
  });
  return { ok: true, pdfUrl: pdfUrl, bundle: getDispute(id) };
}

// ------------------------------------------------------------------ US desk

function markFiled(id, portalNumber, portalPdf) {
  requireUsDesk_();
  if (!portalNumber) throw new Error('Enter the dispute number the portal gave you.');
  let pdfUrl = '';
  if (portalPdf && portalPdf.data) {
    pdfUrl = uploadFile(id, 'portal_confirmation', '', portalPdf.name, portalPdf.mimeType, portalPdf.data).url;
  }
  withLock_(function () {
    setCells_(id, { Status: STATUS.filed, FiledBy: currentUser_(), FiledAt: nowStr_(),
      PortalDisputeNumber: safe_(portalNumber), PortalPdfUrl: pdfUrl });
    log_(id, 'status', STATUS.filed + ' ' + portalNumber);
  });
  return getDispute(id);
}

function returnDispute(id, reason) {
  requireUsDesk_();
  if (!reason) throw new Error('Say what needs fixing.');
  return withLock_(function () {
    setCells_(id, { Status: STATUS.returned, ReturnReason: safe_(reason) });
    log_(id, 'status', STATUS.returned + ': ' + reason);
    return true;
  });
}

// ------------------------------------------------------------------ validation

function validate_(id) {
  const full = getDispute(id);
  const d = full.dispute;
  const s = schema_();
  const problems = [];
  const files = full.files;
  const hasFile = function (cat, line) {
    return files.some(function (f) { return f.Category === cat && (!line || Number(f.LineNo) === Number(line)); });
  };

  s.pages.forEach(function (p) {
    p.sections.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'file') {
          if (f.required && !hasFile(f.category)) problems.push(p.step + ': ' + shortLabel_(f.label) + ' is missing');
          return;
        }
        const msg = checkField_(f, d[f.key], d);
        if (msg) problems.push(p.step + ': ' + shortLabel_(f.label) + ' ' + msg);
      });
    });
  });

  if (!full.lines.length) problems.push('Add at least one line item.');
  if (full.lines.length > 50) problems.push('A batched dispute can have at most 50 line items.');
  full.lines.forEach(function (l) {
    s.line.sections.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'file') {
          if (f.required && !hasFile('qpa', l.LineNo)) problems.push('Line ' + l.LineNo + ': QPA documentation is missing');
          return;
        }
        const msg = checkField_(f, l[f.key], l);
        if (msg) problems.push('Line ' + l.LineNo + ': ' + shortLabel_(f.label) + ' ' + msg);
      });
    });
  });
  return problems;
}

function checkField_(f, value, record) {
  const v = value == null ? '' : String(value).trim();
  const required = f.required || (f.requiredIf && String(record[f.requiredIf.key] || '').indexOf(f.requiredIf.includes) !== -1);
  if (!v) return required ? 'is required' : '';
  if (f.type === 'zip' && !/^\d{5}(-\d{4})?$/.test(v)) return 'must look like 12345 or 12345-6789';
  if (f.type === 'phone' && !/^\d{3}-\d{3}-\d{4}$/.test(v)) return 'must look like 214-555-0100';
  if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'is not a valid email';
  if (f.type === 'money' && !/^\d+(\.\d{1,2})?$/.test(v)) return 'must be an amount like 154.00';
  if (f.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'must be a date';
    if (f.min && v < f.min) return 'must be on or after ' + f.min;
    if (f.max === 'today' && v > Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) return 'cannot be in the future';
  }
  return '';
}

function shortLabel_(label) {
  const s = String(label).replace(/:$/, '');
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

// ------------------------------------------------------------------ confirmation PDF

function buildConfirmationPdf_(id) {
  const full = getDispute(id);
  const t = HtmlService.createTemplateFromFile('Pdf');
  t.data = {
    id: id,
    appName: APP_NAME,
    logoUrl: LOGO_URL,
    dispute: full.dispute,
    lines: full.lines,
    files: full.files,
    columns: schema_().final.columns,
    generatedBy: currentUser_(),
    generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a z')
  };
  const blob = t.evaluate().getBlob().getAs(MimeType.PDF)
    .setName(id + ' - Summary of Qualified Items - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm') + '.pdf');
  const file = disputeFolder_(id).createFile(blob);
  appendRecords_(TABS.files, [fileRecord_(id, 'confirmation_pdf', '', blob.getName(), file)]);
  return file.getUrl();
}

/** Used by Pdf.html: formats a value the way the portal shows it. */
function fmt_(value, type) {
  if (value === '' || value == null) return '';
  if (type === 'money') return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === 'date') {
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[2] + '/' + m[3] + '/' + m[1] : String(value);
  }
  return String(value);
}

// ------------------------------------------------------------------ storage
// With the Sheets advanced service enabled (Services > Google Sheets API), one request reads
// several tabs and each row is written in one call. Values are written RAW, so text such as
// 2026-07-26 or 02134 is stored exactly as typed and never turned into a date or a number.
// Without the advanced service the same functions fall back to SpreadsheetApp.

let SS_ = null;
let TABLES_ = {}; // tabs read during this server call: name -> { header, rows }

function ss_() {
  if (!SS_) SS_ = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return SS_;
}

function useApi_() {
  return typeof Sheets !== 'undefined' && !!(Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values);
}

function tab_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

/** Reads the tabs not already read during this call, in one Sheets API request. */
function readTables_(names) {
  const missing = names.filter(function (n) { return !TABLES_[n]; });
  if (missing.length) {
    let grids;
    if (useApi_()) {
      try {
        const res = Sheets.Spreadsheets.Values.batchGet(ss_().getId(), {
          ranges: missing.map(function (n) { return "'" + n + "'"; }),
          valueRenderOption: 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER'
        });
        grids = (res.valueRanges || []).map(function (vr) { return vr.values || []; });
      } catch (e) {
        missing.forEach(tab_); // a clearer message when a tab is missing
        throw e;
      }
    } else {
      grids = missing.map(function (n) {
        const sh = tab_(n);
        return sh.getLastRow() ? sh.getDataRange().getValues() : [];
      });
    }
    missing.forEach(function (n, i) { TABLES_[n] = toTable_(grids[i] || []); });
  }
  return names.map(function (n) { return TABLES_[n]; });
}

function table_(name) { return readTables_([name])[0]; }

// Row i of table.rows is sheet row i + 2. Blank rows are kept so the numbering holds.
function toTable_(grid) {
  const header = (grid[0] || []).map(String);
  const rows = grid.slice(1).map(function (r) {
    const o = {};
    header.forEach(function (h, i) { o[h] = normCell_(h, r[i]); });
    return o;
  });
  return { header: header, rows: rows };
}

/** Rows that hold data, for tabs whose first column is the record key. */
function rows_(table) {
  const key = table.header[0];
  return table.rows.filter(function (r) { return r[key] !== ''; });
}

function readTab_(name) { return rows_(table_(name)); }

function rowAt_(name, rowNum) { return Object.assign({}, table_(name).rows[rowNum - 2]); }

function findRow_(name, column, value) {
  const rows = table_(name).rows;
  for (let i = 0; i < rows.length; i++) if (rows[i][column] === value) return i + 2;
  return -1;
}

function filesOf_(id) {
  return rows_(table_(TABS.files)).filter(function (f) { return f.DisputeID === id; });
}

const STAMP_COLS = ['CreatedAt', 'UpdatedAt', 'ReadyAt', 'FiledAt', 'UploadedAt', 'Timestamp'];
let FIELD_TYPES_ = null;

function fieldTypes_() {
  if (FIELD_TYPES_) return FIELD_TYPES_;
  const out = {};
  const s = schema_();
  s.pages.concat([s.line]).forEach(function (p) {
    p.sections.forEach(function (sec) { sec.fields.forEach(function (f) { out[f.key] = f.type; }); });
  });
  FIELD_TYPES_ = out;
  return out;
}

/**
 * Turns whatever is in a cell back into the text the app works with. Cells that Sheets
 * converted on its own (a date typed as 2026-07-26, an amount, a zip code) come back as
 * YYYY-MM-DD, 154.00 and 02134 again.
 */
function normCell_(key, v) {
  if (v === '' || v == null) return '';
  const type = fieldTypes_()[key];
  const tz = Session.getScriptTimeZone();
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz, type === 'date' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  }
  if (typeof v === 'number') {
    if (type === 'date') return serialToText_(v, 'yyyy-MM-dd');
    if (STAMP_COLS.indexOf(key) !== -1) return serialToText_(v, 'yyyy-MM-dd HH:mm:ss');
    if (key === 'LineNo') return v;
    if (type === 'money') return v.toFixed(2);
    if (type === 'zip') return ('00000' + v).slice(-5);
    return String(v);
  }
  let s = String(v);
  if (type === 'date') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }
  if (type === 'money') s = s.replace(/[$,\s]/g, '');
  return s;
}

// Sheets date serial (days since 1899-12-30, in the sheet's own time) to text.
function serialToText_(serial, format) {
  return Utilities.formatDate(new Date(Math.round((serial - 25569) * 86400000)), 'UTC', format);
}

function recordToRow_(header, rec) {
  return header.map(function (h) { return rec[h] === undefined || rec[h] === null ? '' : rec[h]; });
}

function writeRecord_(name, rowNum, rec) {
  writeBlock_(name, rowNum, [recordToRow_(table_(name).header, rec)]);
}

/** Writes rows starting at sheet row startRow, in one call. */
function writeBlock_(name, startRow, rows) {
  if (useApi_()) {
    Sheets.Spreadsheets.Values.update({ values: rows }, ss_().getId(), "'" + name + "'!A" + startRow, { valueInputOption: 'RAW' });
  } else {
    tab_(name).getRange(startRow, 1, rows.length, rows[0].length)
      .setValues(rows.map(function (r) { return r.map(guard_); }));
  }
  delete TABLES_[name];
}

function appendRecords_(name, recs) {
  if (!recs.length) return;
  const header = table_(name).header;
  const rows = recs.map(function (r) { return recordToRow_(header, r); });
  if (useApi_()) {
    Sheets.Spreadsheets.Values.append({ values: rows }, ss_().getId(), "'" + name + "'!A1",
      { valueInputOption: 'RAW', insertDataOption: 'OVERWRITE' });
  } else {
    const sh = tab_(name);
    rows.forEach(function (r) { sh.appendRow(r.map(guard_)); });
  }
  delete TABLES_[name];
}

/** Deletes every row matching test, in one request. Returns how many were deleted. */
function deleteWhere_(name, test) {
  const t = table_(name);
  const nums = [];
  t.rows.forEach(function (r, i) { if (r[t.header[0]] !== '' && test(r)) nums.push(i + 2); });
  if (!nums.length) return 0;
  nums.sort(function (a, b) { return b - a; });
  if (useApi_()) {
    const sheetId = tab_(name).getSheetId();
    const requests = nums.map(function (n) {
      return { deleteDimension: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n } } };
    });
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, ss_().getId());
  } else {
    const sh = tab_(name);
    nums.forEach(function (n) { sh.deleteRow(n); });
  }
  delete TABLES_[name];
  return nums.length;
}

/** Updates some columns of one dispute's row in a single write. */
function setCells_(id, values) {
  const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
  if (rowNum === -1) throw new Error('Dispute not found: ' + id);
  writeRecord_(TABS.disputes, rowNum, Object.assign(rowAt_(TABS.disputes, rowNum), values));
}

function touch_(id) {
  setCells_(id, { UpdatedBy: currentUser_(), UpdatedAt: nowStr_() });
}

function assertEditable_(id) {
  const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
  if (rowNum === -1) throw new Error('Dispute not found: ' + id);
  if (rowAt_(TABS.disputes, rowNum).Status === STATUS.filed) {
    throw new Error('This dispute is already filed and can no longer be edited.');
  }
}

// Inside the lock, read the Sheet fresh so another user's save is never overwritten.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  TABLES_ = {};
  try { return fn(); } finally { lock.releaseLock(); }
}

function safe_(v) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.join('; ');
  return String(v);
}

// SpreadsheetApp only: stops a typed value from being read as a formula. (RAW API writes never are.)
function guard_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function fileRecord_(id, category, lineNo, name, file) {
  return { DisputeID: id, Category: category, LineNo: lineNo || '', Name: safe_(name), Url: file.getUrl(),
    FileId: file.getId(), UploadedBy: currentUser_(), UploadedAt: nowStr_() };
}

function newId_() {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  return 'IDR-' + stamp + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
}

function nowStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

// ------------------------------------------------------------------ Drive folders

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('ROOT_FOLDER_ID');
  let root;
  try { root = rootId ? DriveApp.getFolderById(rootId) : null; } catch (e) { root = null; }
  if (!root) {
    root = DriveApp.createFolder('IDR Prep Studio - Disputes');
    props.setProperty('ROOT_FOLDER_ID', root.getId());
  }
  return root;
}

// The folder id is cached, so uploads skip the search through the root folder.
function disputeFolder_(id) {
  const cache = CacheService.getScriptCache();
  const key = 'folder:' + id;
  const known = cache.get(key);
  if (known) {
    try {
      const f = DriveApp.getFolderById(known);
      if (!f.isTrashed()) return f;
    } catch (e) { /* look it up again below */ }
  }
  const root = rootFolder_();
  const it = root.getFoldersByName(id);
  const folder = it.hasNext() ? it.next() : root.createFolder(id);
  cache.put(key, folder.getId(), 21600);
  return folder;
}

// ------------------------------------------------------------------ users and options

function currentUser_() {
  return Session.getActiveUser().getEmail() || 'unknown user';
}

function isUsDesk_(email) {
  const list = options_().UsDeskUser || [];
  return list.map(function (e) { return String(e).toLowerCase(); }).indexOf(String(email).toLowerCase()) !== -1;
}

function requireUsDesk_() {
  if (!isUsDesk_(currentUser_())) throw new Error('Only US desk users listed in the Options tab can do this.');
}

// The Options lists are cached for 10 minutes. Editing the Options tab clears the cache (see onEdit).
let OPTIONS_ = null;

function options_() {
  if (OPTIONS_) return OPTIONS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('options');
  if (hit) return (OPTIONS_ = JSON.parse(hit));
  const out = {};
  readTab_(TABS.options).forEach(function (r) {
    if (!r.List || r.Value === '') return;
    (out[r.List] = out[r.List] || []).push(String(r.Value));
  });
  try { cache.put('options', JSON.stringify(out), 600); } catch (e) { /* too large to cache: read each time */ }
  return (OPTIONS_ = out);
}

function clearOptionsCache_() {
  OPTIONS_ = null;
  CacheService.getScriptCache().remove('options');
}

/** Simple trigger: an edit to the Options tab takes effect right away. */
function onEdit(e) {
  try {
    if (e && e.range && e.range.getSheet().getName() === TABS.options) CacheService.getScriptCache().remove('options');
  } catch (err) { /* the cache expires on its own within 10 minutes */ }
}

function log_(id, event, details) {
  appendRecords_(TABS.log, [{ Timestamp: nowStr_(), User: currentUser_(), DisputeID: id, Event: event, Details: safe_(details) }]);
}

// ------------------------------------------------------------------ one-time setup

/** Run once from the editor. Creates the tabs, the Options lists and the Drive folder. */
function setup() {
  const ss = ss_();
  const ensure = function (name, header) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(header);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#003B5C').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
    // Plain text keeps dates as YYYY-MM-DD and amounts as typed. This runs every time, and any
    // cells Sheets already turned into dates or numbers are written back as the original text.
    TABLES_ = {};
    const width = Math.max(sh.getLastColumn(), header.length);
    const existing = sh.getLastRow() > 1 ? table_(name) : null;
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), width).setNumberFormat('@');
    if (existing && existing.rows.length) {
      writeBlock_(name, 2, existing.rows.map(function (r) {
        const row = recordToRow_(existing.header, r);
        while (row.length < width) row.push('');
        return row;
      }));
    }
    return sh;
  };

  ensure(TABS.disputes, DISPUTE_META.concat(headerKeys_()));
  ensure(TABS.lines, LINE_META.concat(lineKeys_()));
  ensure(TABS.files, ['DisputeID', 'Category', 'LineNo', 'Name', 'Url', 'FileId', 'UploadedBy', 'UploadedAt']);
  ensure(TABS.log, ['Timestamp', 'User', 'DisputeID', 'Event', 'Details']);
  const opts = ensure(TABS.options, ['List', 'Value', 'Note']);

  if (opts.getLastRow() === 1) {
    const rows = [];
    US_STATES.forEach(function (s) { rows.push(['State', s, '']); });
    // Copy the exact wording from the portal's Health Plan Type list; these are starting values.
    ['Self-insured group health plan (ERISA)', 'Fully insured group health plan', 'Individual market plan',
      'Federal Employees Health Benefits (FEHB) plan', 'Non-federal governmental plan', 'Church plan', 'Student health plan']
      .forEach(function (s) { rows.push(['HealthPlanType', s, 'Check against the portal list']); });
    rows.push(['UsDeskUser', Session.getActiveUser().getEmail(), 'Add each US desk user email on its own row']);
    opts.getRange(2, 1, rows.length, 3).setValues(rows);
  }

  // Send queued SpreadsheetApp changes before anything reads the tabs through the Sheets API.
  SpreadsheetApp.flush();
  clearOptionsCache_();
  rootFolder_();
  Logger.log(useApi_() ? 'Using the Google Sheets API advanced service.' : 'Google Sheets API advanced service is off: using SpreadsheetApp (slower).');
  Logger.log('Setup complete. Deploy as a web app: Execute as Me, access Anyone within your organization.');
}

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'];
