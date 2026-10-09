/**
 * IDR Initiation Prep Studio (internal).
 *
 * Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the
 * federal IDR portal page by page. The US desk then copies every field into the portal.
 * Nothing in this app connects to, or sends anything to, the CMS portal.
 *
 * Deploy: create a Google Sheet, Extensions > Apps Script, add Code.gs, Index.html and
 * Pdf.html, run setup() once, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone within your organization).
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
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function getBootstrap() {
  const email = currentUser_();
  return {
    user: email,
    isUsDesk: isUsDesk_(email),
    schema: schema_(),
    options: options_(),
    status: STATUS
  };
}

// ------------------------------------------------------------------ disputes

function listDisputes(filter) {
  const rows = readTab_(TABS.disputes);
  const lines = readTab_(TABS.lines);
  const count = {};
  lines.forEach(function (l) { count[l.DisputeID] = (count[l.DisputeID] || 0) + 1; });
  return rows
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

function getDispute(id) {
  const d = readTab_(TABS.disputes).filter(function (r) { return r.DisputeID === id; })[0];
  if (!d) throw new Error('Dispute not found: ' + id);
  const lines = readTab_(TABS.lines)
    .filter(function (l) { return l.DisputeID === id; })
    .sort(function (a, b) { return Number(a.LineNo) - Number(b.LineNo); });
  const files = readTab_(TABS.files).filter(function (f) { return f.DisputeID === id; });
  return { dispute: d, lines: lines, files: files };
}

/** Creates or updates the dispute header (pages 1-3). Returns the dispute id. */
function saveDispute(payload) {
  return withLock_(function () {
    const user = currentUser_();
    const now = nowStr_();
    const sh = tab_(TABS.disputes);
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    let id = payload.id;
    let rowIndex = id ? findRow_(sh, 'DisputeID', id) : -1;

    if (rowIndex === -1) {
      id = newId_();
      const folder = disputeFolder_(id);
      const blank = header.map(function () { return ''; });
      blank[header.indexOf('DisputeID')] = id;
      blank[header.indexOf('Status')] = STATUS.draft;
      blank[header.indexOf('CreatedBy')] = user;
      blank[header.indexOf('CreatedAt')] = now;
      blank[header.indexOf('FolderUrl')] = folder.getUrl();
      sh.appendRow(blank);
      rowIndex = sh.getLastRow();
    } else {
      const status = sh.getRange(rowIndex, header.indexOf('Status') + 1).getValue();
      if (status === STATUS.filed) throw new Error('This dispute is already filed and can no longer be edited.');
    }

    const values = payload.values || {};
    const editable = headerKeys_().concat(['Team', 'Owner']);
    editable.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(values, k)) {
        sh.getRange(rowIndex, header.indexOf(k) + 1).setValue(safe_(values[k]));
      }
    });
    sh.getRange(rowIndex, header.indexOf('UpdatedBy') + 1).setValue(user);
    sh.getRange(rowIndex, header.indexOf('UpdatedAt') + 1).setValue(now);
    log_(id, 'save', payload.page || '');
    return id;
  });
}

/** Adds or replaces a line item (page 4). Returns the line number. */
function saveLine(id, lineNo, values) {
  return withLock_(function () {
    assertEditable_(id);
    const sh = tab_(TABS.lines);
    const data = sh.getDataRange().getValues();
    const header = data[0];
    const keys = lineKeys_();
    const existing = data.filter(function (r, i) { return i > 0 && r[0] === id; });
    if (!lineNo) {
      if (existing.length >= 50) throw new Error('This dispute already has 50 line items, the maximum for one batched dispute.');
      lineNo = existing.reduce(function (m, r) { return Math.max(m, Number(r[1]) || 0); }, 0) + 1;
    }
    const row = header.map(function (h) {
      if (h === 'DisputeID') return id;
      if (h === 'LineNo') return lineNo;
      return keys.indexOf(h) !== -1 ? safe_(values[h]) : '';
    });
    let target = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id && Number(data[i][1]) === Number(lineNo)) { target = i + 1; break; }
    }
    if (target === -1) sh.appendRow(row); else sh.getRange(target, 1, 1, row.length).setValues([row]);
    touch_(id);
    log_(id, 'line:' + lineNo, 'saved');
    return lineNo;
  });
}

function deleteLine(id, lineNo) {
  return withLock_(function () {
    assertEditable_(id);
    const sh = tab_(TABS.lines);
    const data = sh.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === id && Number(data[i][1]) === Number(lineNo)) sh.deleteRow(i + 1);
    }
    // Remove that line's QPA documentation records too; the Drive files stay in the folder.
    const fsh = tab_(TABS.files);
    const fdata = fsh.getDataRange().getValues();
    for (let j = fdata.length - 1; j >= 1; j--) {
      if (fdata[j][0] === id && fdata[j][1] === 'qpa' && Number(fdata[j][2]) === Number(lineNo)) fsh.deleteRow(j + 1);
    }
    touch_(id);
    log_(id, 'line:' + lineNo, 'deleted');
    return true;
  });
}

/** Stores one uploaded file in the dispute's Drive folder. data is base64 without the data: prefix. */
function uploadFile(id, category, lineNo, name, mimeType, data) {
  if (!id) throw new Error('Save the page before uploading files.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > 45 * 1024 * 1024) throw new Error('Files must be under 45 MB each.');
  const folder = disputeFolder_(id);
  const file = folder.createFile(Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name));
  return withLock_(function () {
    tab_(TABS.files).appendRow([id, category, lineNo || '', safe_(name), file.getUrl(), file.getId(), currentUser_(), nowStr_()]);
    log_(id, 'upload', category + ' ' + name);
    return { name: name, url: file.getUrl(), id: file.getId() };
  });
}

function removeFile(id, fileId) {
  return withLock_(function () {
    assertEditable_(id);
    const sh = tab_(TABS.files);
    const data = sh.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === id && data[i][5] === fileId) sh.deleteRow(i + 1);
    }
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    log_(id, 'file-removed', fileId);
    return true;
  });
}

/** Checks the dispute, saves the summary page as a PDF in Drive and hands it to the US desk. */
function finalizeDispute(id) {
  const problems = validate_(id);
  if (problems.length) return { ok: false, problems: problems };
  const pdfUrl = buildConfirmationPdf_(id);
  withLock_(function () {
    const sh = tab_(TABS.disputes);
    const row = findRow_(sh, 'DisputeID', id);
    setCells_(sh, row, { Status: STATUS.ready, ConfirmationPdfUrl: pdfUrl, ReadyAt: nowStr_(), ReturnReason: '' });
    log_(id, 'status', STATUS.ready);
  });
  return { ok: true, pdfUrl: pdfUrl };
}

// ------------------------------------------------------------------ US desk

function markFiled(id, portalNumber, portalPdf) {
  requireUsDesk_();
  if (!portalNumber) throw new Error('Enter the dispute number the portal gave you.');
  let pdfUrl = '';
  if (portalPdf && portalPdf.data) {
    pdfUrl = uploadFile(id, 'portal_confirmation', '', portalPdf.name, portalPdf.mimeType, portalPdf.data).url;
  }
  return withLock_(function () {
    const sh = tab_(TABS.disputes);
    const row = findRow_(sh, 'DisputeID', id);
    if (row === -1) throw new Error('Dispute not found: ' + id);
    setCells_(sh, row, { Status: STATUS.filed, FiledBy: currentUser_(), FiledAt: nowStr_(),
      PortalDisputeNumber: safe_(portalNumber), PortalPdfUrl: pdfUrl });
    log_(id, 'status', STATUS.filed + ' ' + portalNumber);
    return true;
  });
}

function returnDispute(id, reason) {
  requireUsDesk_();
  if (!reason) throw new Error('Say what needs fixing.');
  return withLock_(function () {
    const sh = tab_(TABS.disputes);
    const row = findRow_(sh, 'DisputeID', id);
    if (row === -1) throw new Error('Dispute not found: ' + id);
    setCells_(sh, row, { Status: STATUS.returned, ReturnReason: safe_(reason) });
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
  tab_(TABS.files).appendRow([id, 'confirmation_pdf', '', blob.getName(), file.getUrl(), file.getId(), currentUser_(), nowStr_()]);
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

// ------------------------------------------------------------------ helpers

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

function tab_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

function readTab_(name) {
  const sh = tab_(name);
  if (sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const header = values.shift();
  const tz = Session.getScriptTimeZone();
  return values.map(function (r) {
    const o = {};
    header.forEach(function (h, i) {
      const v = r[i];
      o[h] = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : v;
    });
    return o;
  });
}

function findRow_(sh, column, value) {
  const data = sh.getDataRange().getValues();
  const c = data[0].indexOf(column);
  for (let i = 1; i < data.length; i++) if (data[i][c] === value) return i + 1;
  return -1;
}

function setCells_(sh, row, values) {
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(values).forEach(function (k) {
    const c = header.indexOf(k);
    if (c !== -1) sh.getRange(row, c + 1).setValue(values[k]);
  });
}

function touch_(id) {
  const sh = tab_(TABS.disputes);
  const row = findRow_(sh, 'DisputeID', id);
  if (row !== -1) setCells_(sh, row, { UpdatedBy: currentUser_(), UpdatedAt: nowStr_() });
}

function assertEditable_(id) {
  const sh = tab_(TABS.disputes);
  const row = findRow_(sh, 'DisputeID', id);
  if (row === -1) throw new Error('Dispute not found: ' + id);
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (sh.getRange(row, header.indexOf('Status') + 1).getValue() === STATUS.filed) {
    throw new Error('This dispute is already filed and can no longer be edited.');
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Stops a typed value from being read as a spreadsheet formula.
function safe_(v) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.join('; ');
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function newId_() {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  return 'IDR-' + stamp + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
}

function nowStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

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

function disputeFolder_(id) {
  const root = rootFolder_();
  const it = root.getFoldersByName(id);
  return it.hasNext() ? it.next() : root.createFolder(id);
}

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

function options_() {
  const out = {};
  readTab_(TABS.options).forEach(function (r) {
    if (!r.List || r.Value === '') return;
    (out[r.List] = out[r.List] || []).push(String(r.Value));
  });
  return out;
}

function log_(id, event, details) {
  tab_(TABS.log).appendRow([nowStr_(), currentUser_(), id, event, safe_(details)]);
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
      // Plain text keeps dates as YYYY-MM-DD and amounts as typed.
      sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), header.length).setNumberFormat('@');
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

  rootFolder_();
  Logger.log('Setup complete. Deploy as a web app: Execute as Me, access Anyone within your organization.');
}

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'];
