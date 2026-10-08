/**
 * IDR Bundle Filler - Google Workspace backend (DEMO).
 *
 * Serves two things from one Apps Script web app:
 *   1. A small JSON API the Chrome extension reads bundles from and writes logs to.
 *   2. A practice IDR initiation form (?page=form) for demonstrations.
 *
 * Setup: open the Google Sheet, Extensions > Apps Script, paste this file and
 * DemoForm.html, run setup() once, then Deploy > New deployment > Web app.
 * Use synthetic data only until the production version (Workspace sign-in) is approved.
 */

// Leave empty when the script is bound to the Sheet (Extensions > Apps Script).
const SHEET_ID = '';

const SHEETS = {
  bundles: 'Bundles',
  mappings: 'Mappings',
  log: 'Log',
  demo: 'DemoSubmissions'
};

// Bundle columns that describe the bundle itself; every other column is a form field.
const META_COLUMNS = ['BundleID', 'Status', 'Action', 'Team', 'Owner', 'DueDate', 'Documents',
  'FiledAt', 'FiledBy', 'Confirmation', 'ReturnReason'];

const FIELD_COLUMNS = ['ip_name', 'ip_npi', 'ip_tin', 'ip_contact', 'ip_email', 'ip_phone',
  'nip_name', 'nip_email', 'plan_type', 'state', 'claim_number', 'dos', 'service_code', 'pos',
  'qpa', 'initial_payment', 'initial_payment_date', 'on_start', 'on_end', 'preferred_idre', 'attest'];

const ACTION_SINGLE = 'IDR Initiation - Single';

// ---------------------------------------------------------------- web entry points

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.page === 'form') {
    return HtmlService.createTemplateFromFile('DemoForm')
      .evaluate()
      .setTitle('IDR Practice Form (Demo)')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (p.api) return handleApi_(p.api, p);
  return HtmlService.createHtmlOutput(
    '<p style="font-family:Arial">IDR Bundle API is running. Open <b>?page=form</b> for the practice form.</p>');
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Request body is not valid JSON' });
  }
  return handleApi_(body.api, body);
}

function handleApi_(name, p) {
  try {
    checkToken_(p.token);
    switch (name) {
      case 'queue':
        return json_({ ok: true, bundles: listBundles_() });
      case 'bundle': {
        const bundle = getBundle_(p.id);
        return json_({ ok: true, bundle: bundle, mappings: getMappings_(bundle.action) });
      }
      case 'log':
        appendLog_(p.operator, p.bundleId, p.event, p.details);
        return json_({ ok: true });
      case 'status':
        setStatus_(p);
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'Unknown api: ' + name });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---------------------------------------------------------------- data access

function ss_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '". Run setup() first.');
  return sh;
}

function rows_(name) {
  const values = sheet_(name).getDataRange().getDisplayValues();
  const header = values.shift();
  return values
    .filter(function (r) { return r.join('') !== ''; })
    .map(function (r) {
      const o = {};
      header.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
}

function listBundles_() {
  return rows_(SHEETS.bundles)
    .filter(function (r) { return r.Status === 'Ready'; })
    .map(function (r) {
      return { id: r.BundleID, action: r.Action, team: r.Team, owner: r.Owner, due: r.DueDate, payer: r.nip_name };
    });
}

function getBundle_(id) {
  const r = rows_(SHEETS.bundles).filter(function (x) { return x.BundleID === id; })[0];
  if (!r) throw new Error('Bundle not found: ' + id);
  const fields = {};
  Object.keys(r).forEach(function (k) {
    if (META_COLUMNS.indexOf(k) === -1) fields[k] = r[k];
  });
  return {
    id: r.BundleID, status: r.Status, action: r.Action, team: r.Team, owner: r.Owner, due: r.DueDate,
    documents: String(r.Documents || '').split(/\n|;/).map(function (s) { return s.trim(); }).filter(String),
    fields: fields
  };
}

function getMappings_(action) {
  return rows_(SHEETS.mappings)
    .filter(function (m) { return m.Action === action; })
    .map(function (m) {
      return { field: m.Field, label: m.Label, selector: m.Selector, type: m.Type || 'text', format: m.Format || '', page: m.Page || '' };
    });
}

function appendLog_(operator, bundleId, event, details) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_(SHEETS.log).appendRow([new Date(), operator || '', bundleId || '', event || '',
      typeof details === 'string' ? details : JSON.stringify(details || {})]);
  } finally {
    lock.releaseLock();
  }
}

function setStatus_(p) {
  const allowed = ['Filed', 'Returned', 'Ready'];
  if (allowed.indexOf(p.status) === -1) throw new Error('Status must be one of ' + allowed.join(', '));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(SHEETS.bundles);
    const values = sh.getDataRange().getValues();
    const header = values[0];
    const col = function (name) { return header.indexOf(name) + 1; };
    for (let i = 1; i < values.length; i++) {
      if (values[i][col('BundleID') - 1] === p.bundleId) {
        sh.getRange(i + 1, col('Status')).setValue(p.status);
        if (p.status === 'Filed') {
          sh.getRange(i + 1, col('FiledAt')).setValue(new Date());
          sh.getRange(i + 1, col('FiledBy')).setValue(p.operator || '');
          sh.getRange(i + 1, col('Confirmation')).setValue(p.confirmation || '');
        }
        if (p.status === 'Returned') sh.getRange(i + 1, col('ReturnReason')).setValue(p.reason || '');
        appendLog_(p.operator, p.bundleId, 'status:' + p.status, { confirmation: p.confirmation || '', reason: p.reason || '' });
        return;
      }
    }
    throw new Error('Bundle not found: ' + p.bundleId);
  } finally {
    lock.releaseLock();
  }
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('API_TOKEN is not set. Run setup() first.');
  if (token !== expected) throw new Error('Invalid API token');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- practice form

/** Called by DemoForm.html when the operator clicks Submit. Stores the data; nothing leaves Google. */
function recordDemoSubmission(data) {
  const confirmation = 'DEMO-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet_(SHEETS.demo).appendRow([new Date(), confirmation, JSON.stringify(data || {})]);
  return confirmation;
}

// ---------------------------------------------------------------- one-time setup

/** Run once from the editor. Creates the tabs, sample synthetic bundles, mappings and an API token. */
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
    return sh;
  };

  const bundleHeader = ['BundleID', 'Status', 'Action', 'Team', 'Owner', 'DueDate', 'Documents']
    .concat(FIELD_COLUMNS).concat(['FiledAt', 'FiledBy', 'Confirmation', 'ReturnReason']);
  const bundles = ensure(SHEETS.bundles, bundleHeader);
  if (bundles.getLastRow() === 1) {
    // Plain text keeps dates as YYYY-MM-DD and amounts as typed (612.40, not 612.4).
    bundles.getRange(2, 1, 500, bundleHeader.length).setNumberFormat('@');
    sampleBundles_().forEach(function (b) {
      bundles.appendRow(bundleHeader.map(function (h) { return b[h] !== undefined ? b[h] : ''; }));
    });
  }

  const mappings = ensure(SHEETS.mappings, ['Action', 'Field', 'Label', 'Selector', 'Type', 'Format', 'Page']);
  if (mappings.getLastRow() === 1) {
    sampleMappings_().forEach(function (m) { mappings.appendRow(m); });
  }

  ensure(SHEETS.log, ['Timestamp', 'Operator', 'BundleID', 'Event', 'Details']);
  ensure(SHEETS.demo, ['Timestamp', 'Confirmation', 'Data']);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid());
  Logger.log('Setup complete. API token: ' + props.getProperty('API_TOKEN'));
}

function sampleBundles_() {
  // Synthetic demonstration data only. Not real patients, providers or plans.
  const base = {
    Status: 'Ready', Action: ACTION_SINGLE, Documents: 'Packet - demo.pdf; Remittance - demo.pdf',
    ip_name: 'Demo Emergency Center LLC', ip_npi: '1234567893', ip_tin: '12-3456789',
    ip_contact: 'Demo Negotiator', ip_email: 'idr.demo@example.com', ip_phone: '214-555-0100',
    state: 'TX', pos: '23', preferred_idre: 'Demo IDR Entity A', attest: 'Yes'
  };
  return [
    Object.assign({}, base, {
      BundleID: 'BND-1001', Team: 'Team 3', Owner: 'R. Haddad', DueDate: '2026-11-04',
      nip_name: 'Sample Health Plan A', nip_email: 'disputes@sampleplan-a.example', plan_type: 'self_insured',
      claim_number: 'CLM-55001', dos: '2026-08-12', service_code: '99285', qpa: '612.40',
      initial_payment: '410.00', initial_payment_date: '2026-09-02', on_start: '2026-09-15', on_end: '2026-10-27'
    }),
    Object.assign({}, base, {
      BundleID: 'BND-1002', Team: 'Team 7', Owner: 'M. Khoury', DueDate: '2026-11-05',
      nip_name: 'Sample Insurance Co B', nip_email: 'idr@sampleins-b.example', plan_type: 'fully_insured',
      claim_number: 'CLM-55017', dos: '2026-08-19', service_code: '99284', qpa: '388.10',
      initial_payment: '250.00', initial_payment_date: '2026-09-06', on_start: '2026-09-18', on_end: '2026-10-30'
    }),
    Object.assign({}, base, {
      BundleID: 'BND-1003', Team: 'Team 1', Owner: 'J. Saad', DueDate: '2026-11-06',
      nip_name: 'Sample Benefits Trust C', nip_email: 'claims@sampletrust-c.example', plan_type: 'individual',
      claim_number: 'CLM-55042', dos: '2026-08-25', service_code: '99291', qpa: '944.75',
      initial_payment: '700.00', initial_payment_date: '2026-09-10', on_start: '2026-09-22', on_end: '2026-11-03'
    })
  ];
}

function sampleMappings_() {
  const a = ACTION_SINGLE;
  return [
    [a, 'ip_name', 'Initiating party name', '#ip_name', 'text', '', '1'],
    [a, 'ip_npi', 'NPI', '#ip_npi', 'text', '', '1'],
    [a, 'ip_tin', 'TIN', '#ip_tin', 'text', '', '1'],
    [a, 'ip_contact', 'Contact name', '#ip_contact', 'text', '', '1'],
    [a, 'ip_email', 'Contact email', '#ip_email', 'text', '', '1'],
    [a, 'ip_phone', 'Contact phone', '#ip_phone', 'text', '', '1'],
    [a, 'nip_name', 'Non-initiating party name', '#nip_name', 'text', '', '1'],
    [a, 'nip_email', 'Non-initiating party email', '#nip_email', 'text', '', '1'],
    [a, 'plan_type', 'Plan type', 'input[name="plan_type"]', 'radio', '', '1'],
    [a, 'state', 'State where the service was provided', '#state', 'select', '', '1'],
    [a, 'claim_number', 'Claim number', '#claim_number', 'text', '', '2'],
    [a, 'dos', 'Date of service', '#dos', 'date', '', '2'],
    [a, 'service_code', 'Service code (CPT/HCPCS)', '#service_code', 'text', '', '2'],
    [a, 'pos', 'Place of service', '#pos', 'select', '', '2'],
    [a, 'qpa', 'Qualifying payment amount (QPA)', '#qpa', 'text', '', '2'],
    [a, 'initial_payment', 'Initial payment amount', '#initial_payment', 'text', '', '2'],
    [a, 'initial_payment_date', 'Initial payment date', '#initial_payment_date', 'date', '', '2'],
    [a, 'on_start', 'Open negotiation start date', '#on_start', 'date', '', '2'],
    [a, 'on_end', 'Open negotiation end date', '#on_end', 'date', '', '2'],
    [a, 'preferred_idre', 'Preferred IDR entity', '#preferred_idre', 'select', '', '2'],
    [a, 'attest', 'Eligibility attestation', '#attest', 'attest', '', '2'],
    [a, 'documents', 'Supporting documents', '#documents', 'file', '', '2']
  ];
}
