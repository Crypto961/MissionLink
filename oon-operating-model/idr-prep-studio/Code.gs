/**
 * IDR Initiation Prep Studio (internal).
 *
 * Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the
 * federal IDR portal page by page. The US desk then copies every field into the portal.
 * Nothing in this app connects to, or sends anything to, the CMS portal.
 *
 * The app learns as it is used: every list (payers, billing entities, IDR entities,
 * service codes, teams...) lives in the Options tab, grows when people save new values,
 * and suggests the values used most. See the README for the learning rules.
 *
 * Deploy: create a Google Sheet, Extensions > Apps Script, add Code.gs, Index.html and
 * Pdf.html, add the Google Sheets API under Services (identifier: Sheets), run setup(),
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within
 * your organization). setup() is safe to run again after every code update.
 */

const APP_NAME = 'IDR Initiation Prep Studio';
const LOGO_URL = 'https://drive.google.com/thumbnail?id=18bqSCdjITeFAI8RmT6EAngDvhOV5cXmX&sz=w1000';
const SHEET_ID = ''; // leave empty when the script is bound to the Sheet

const TABS = { disputes: 'Disputes', lines: 'LineItems', files: 'Files', options: 'Options', settings: 'Settings', log: 'Log' };

const STATUS = { draft: 'Draft', ready: 'Ready for US desk', filed: 'Filed', returned: 'Returned' };

// One row per list value. Data holds the profile fields (JSON) for address-book lists.
const OPTION_COLS = ['List', 'Value', 'Label', 'Data', 'Count', 'LastUsed', 'Source', 'Status', 'AddedBy', 'AddedAt'];
const ACTIVE = 'Active';
const HIDDEN = 'Hidden';

// Settings tab (Key | Value | Note). These apply when a key is missing.
const SETTING_DEFAULTS = { LearningMode: 'On', DefaultWindow: 50, DefaultShare: 0.8 };
const MIN_DEFAULT_SAMPLE = 5; // a learned default needs at least this many saved records

// Lists the app learns from saves, shown in Insights and the Lists admin view.
const LEARNED_LISTS = ['Payer', 'BillingEntity', 'HealthPlanType', 'IdrEntity', 'ServiceCode', 'Modifier', 'PosCode',
  'Team', 'Owner', 'ReturnReason'];
// These keep the order of the Options tab; every other list is ranked by use.
const FIXED_ORDER_LISTS = ['State', 'Holiday', 'UsDeskUser', 'Admin'];
// Never sent to the browser.
const PRIVATE_LISTS = ['UsDeskUser', 'Admin'];

// ------------------------------------------------------------------ portal schema
// Labels and order follow the portal's saved pages and the Notices of IDR Initiation.
// Change a label here and the entry screens, the copy desk and the PDF follow.
//
// Field options used below:
//   type 'combo'  free typing with suggestions from an Options list (options = list name)
//   default       seeded default; '@top' means the most used value of the list. The app
//                 replaces it with a learned default when one value dominates recent saves.
//   learnEmpty    a blank answer counts as a value when learning the default
//   fill          picking a value of this profile list fills these fields (data key -> field key or keys)
//   stop          answering stop.value makes the dispute ineligible (blocks Ready)
//   pattern       regular expression the value must match (patternMsg is the message)
//   digits        spaces and hyphens are removed before saving (Tax ID, NPI)
//   carry         a new line item starts with the previous line's value
//   multi         several values separated by commas (modifiers)

const YES_NO = ['Yes', 'No'];
const ACTING_AS = ['Group Health Plan', 'Individual health insurance issuer', 'Federal Employees Health Benefits (FEHB) carrier',
  'Health care provider', 'Health care facility', 'Provider of air ambulance services'];
const PLAN_ROLE = ['Group Health Plan', 'Individual health insurance issuer', 'Federal Employees Health Benefits (FEHB) carrier'];
const DESIGNATION = ['Health care provider', 'Health care facility', 'Provider of air ambulance services'];
const ITEM_TYPES = ['Emergency item(s)/service(s)', 'Post-stabilization service(s)', 'Professional service(s)',
  'Hospital-based service(s)', 'Item(s)/service(s) furnished by a nonparticipating provider at a participating health care facility',
  'Out-of-network air ambulance service(s)', 'Other: Provide description'];
const DISPUTE_KINDS = ['Single dispute', 'A batched dispute', 'A bundled dispute'];
const PLAN_TYPE_DEFAULT = 'Either partially or fully self-insured ERISA group health plan';
const NOT_ELIGIBLE = 'Not eligible for federal IDR';

const PAYER_FILL = { role: 'plan_role', addr1: 'plan_addr1', addr2: 'plan_addr2', city: 'plan_city', state: 'plan_state',
  zip: 'plan_zip', email: 'plan_email', phone: 'plan_phone', fax: 'plan_fax' };
const ENTITY_FILL = { acting_as: ['q_acting_as', 'prov_designation'], tin: 'tin', npi: 'npi', group_name: 'prov_group_name',
  addr1: 'prov_addr1', addr2: 'prov_addr2', city: 'prov_city', state: 'prov_state', zip: 'prov_zip',
  email: 'prov_email', phone: 'prov_phone', fax: 'prov_fax' };
const CODE_FILL = { description: 'description' };

function contactFields_(prefix, required) {
  return [
    { key: prefix + 'name', label: 'Name:', type: 'text', required: false, skipForMain: true },
    { key: prefix + 'addr1', label: 'Mailing Address:', type: 'text', required: required, placeholder: 'Street Address' },
    { key: prefix + 'addr2', label: 'Mailing Address Line 2:', type: 'text', placeholder: 'Apartment, suite, unit, building, floor etc.' },
    { key: prefix + 'city', label: 'City:', type: 'text', required: required, placeholder: 'City Name', width: 'third' },
    { key: prefix + 'state', label: 'State:', type: 'select', options: 'State', required: required, width: 'third' },
    { key: prefix + 'zip', label: 'Zip Code:', type: 'zip', required: required, placeholder: '#####-####', width: 'third' },
    { key: prefix + 'email', label: 'Email:', type: 'email', required: required, width: 'half' },
    { key: prefix + 'phone', label: 'Phone:', type: 'phone', required: required, placeholder: '(###) ###-####', width: 'half' }
  ];
}

// Points of contact were empty on every notice seen, so they start collapsed.
function pocSection_(prefix, title) {
  return { title: title, collapsible: true, fields: contactFields_(prefix, false) };
}

function mainContact_(prefix) {
  return contactFields_(prefix, true).filter(function (f) { return !f.skipForMain; })
    .concat([{ key: prefix + 'fax', label: 'Fax:', type: 'phone', placeholder: '(###) ###-####', width: 'half' }]);
}

function schema_() {
  const planMain = [
    { key: 'plan_role', label: "I'm a(n):", type: 'radio', options: PLAN_ROLE, required: true },
    { key: 'plan_name', label: 'Health Insurance Plan or Company:', type: 'combo', options: 'Payer', required: true, fill: PAYER_FILL }
  ].concat(mainContact_('plan_'));

  const provMain = [
    { key: 'prov_name', label: 'Name:', type: 'combo', options: 'BillingEntity', required: true, default: '', fill: ENTITY_FILL, width: 'half' },
    { key: 'prov_group_name', label: 'Hospital, Facility or Group Name:', type: 'text', width: 'half' },
    { key: 'prov_designation', label: 'Select one of the Health Care Designations:', type: 'radio', options: DESIGNATION, required: true }
  ].concat(mainContact_('prov_'));

  return {
    // Internal fields (not on the portal), shown on page 1.
    internal: [
      { key: 'Team', label: 'Team', type: 'combo', options: 'Team', width: 'half' },
      { key: 'Owner', label: 'Owner (account owner)', type: 'combo', options: 'Owner', width: 'half' }
    ],
    pages: [
      {
        id: 'q1', title: 'Qualification Questions', step: 'Qualification Questions · page 1',
        sections: [{ title: '', fields: [
          { key: 'q_prior_2022', label: 'Was the service in question provided prior to 1/1/2022?', type: 'radio', options: YES_NO, required: true,
            default: 'No', stop: { value: 'Yes', message: NOT_ELIGIBLE } },
          { key: 'q_acting_as', label: 'I am (or I am acting on behalf of) a:', type: 'radio', options: ACTING_AS, required: true, default: '' },
          { key: 'tin', label: 'Tax ID:', type: 'text', required: true, digits: true, pattern: '^\\d{9}$', patternMsg: 'must be 9 digits',
            placeholder: '#########', width: 'half' },
          { key: 'npi', label: 'National Provider Identifier (NPI):', type: 'text', required: true, digits: true, pattern: '^\\d{10}$',
            patternMsg: 'must be 10 digits', placeholder: '##########', width: 'half' },
          { key: 'q_plan_type', label: 'Health Plan Type:', type: 'combo', options: 'HealthPlanType', required: true, default: PLAN_TYPE_DEFAULT }
        ] }]
      },
      {
        id: 'q2', title: 'Qualification Questions', step: 'Qualification Questions · page 2',
        sections: [{ title: '', fields: [
          { key: 'on_start_date', label: 'Start Date of the Open Negotiation Period:', type: 'date', required: true, max: 'today', helper: 'deadline' },
          { key: 'on_evidence', label: 'Upload evidence of the open negotiation period start date. For example, a copy of the notice or notices of open negotiation for the claim or claims in this dispute that was sent to the non-initiating party.', type: 'file', category: 'on_evidence', required: true },
          { key: 'consent_waiver', label: 'Did the health care provider or health care facility get consent from the participant, beneficiary, or enrollee to waive surprise billing protections for these items or services?', type: 'radio', options: YES_NO, required: true,
            default: 'No', stop: { value: 'Yes', message: NOT_ELIGIBLE } },
          { key: 'dispute_kind', label: 'What are you disputing today?', type: 'radio', options: DISPUTE_KINDS, required: true, default: 'A batched dispute' }
        ] }]
      },
      {
        id: 'parties', title: 'Notice of IDR Initiation', step: 'Notice of IDR Initiation · parties',
        sections: [
          { title: 'Group Health Plan / Health Insurance Issuer / FEHB Carrier Information or TPA', fields: planMain },
          pocSection_('plan_p1_', 'Primary point-of-contact if different from above:'),
          pocSection_('plan_p2_', 'Secondary point-of-contact: (optional)'),
          { title: 'Health Care Provider, Health Care Facility, or Provider of Air Ambulance Services Information or TPA', fields: provMain },
          pocSection_('prov_p1_', 'Primary point-of-contact if different from above:'),
          pocSection_('prov_p2_', 'Secondary point-of-contact: (optional)')
        ]
      }
    ],
    line: {
      title: 'Notice of IDR Initiation', step: 'Notice of IDR Initiation · line items',
      sections: [
        { title: 'Line Item', fields: [
          { key: 'claim_number', label: 'Claim Number:', type: 'text', required: true, width: 'half', carry: true },
          { key: 'service_date', label: 'Date of the qualified IDR item or service:', type: 'date', required: true, min: '2022-01-01', width: 'half', carry: true }
        ] },
        { title: 'Payment Information', fields: [
          { key: 'description', label: 'Enter the description of the item or service.', type: 'textarea', required: true },
          { key: 'qpa', label: 'Qualifying Payment Amount (QPA):', type: 'money', required: true, width: 'half' },
          { key: 'qpa_docs', label: 'Upload documentation of the claim and QPA. Examples of acceptable documentation include the initial payment or notice of denial of payment, remittance form and explanation of benefits, explanation of payments.', type: 'file', category: 'qpa', required: true },
          { key: 'cost_sharing', label: 'Cost sharing amount allowed:', type: 'money', required: true, width: 'half' },
          { key: 'initial_payment', label: 'Initial payment amount for the item(s) and/or service(s) (if applicable):', type: 'money', width: 'half' }
        ] },
        { title: 'Type of Qualified Item(s) or Service(s)', fields: [
          { key: 'item_types', label: 'Select the item(s) or service(s) under dispute and provide the service code.', type: 'checkboxes', options: ITEM_TYPES, required: true,
            default: 'Emergency item(s)/service(s)', carry: true },
          { key: 'other_desc', label: 'Other: Provide description', type: 'text', requiredIf: { key: 'item_types', includes: 'Other: Provide description' } },
          { key: 'service_code', label: 'Service Code:', type: 'combo', options: 'ServiceCode', required: true, fill: CODE_FILL, width: 'quarter' },
          { key: 'modifiers', label: 'Service Code Modifier(s):', type: 'combo', options: 'Modifier', multi: true, default: '', learnEmpty: true, width: 'quarter' },
          { key: 'pos_code', label: 'Place of Service Code:', type: 'combo', options: 'PosCode', required: true, default: '23', carry: true, width: 'quarter' },
          { key: 'location', label: 'Location of Service:', type: 'select', options: 'State', required: true, default: 'TX', carry: true, width: 'quarter' }
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
      additional: { key: 'additional_docs', label: 'Additional Supporting Documentation', type: 'file', category: 'additional' },
      // Saved on the dispute row, after the summary table (portal order).
      fields: [
        { key: 'idr_entity', label: 'Certified IDR entity legal business name:', type: 'combo', options: 'IdrEntity', required: true, default: '@top' },
        { key: 'third_party_attest', label: 'Third Party Attestation:', type: 'radio', options: YES_NO, required: true, default: 'No' }
      ]
    }
  };
}

/** Every dispute-row field, in portal order: pages 1-3, then the final page. */
function headerFields_(s) {
  s = s || schema_();
  const out = [];
  s.pages.forEach(function (p) {
    p.sections.forEach(function (sec) { sec.fields.forEach(function (f) { out.push(f); }); });
  });
  return out.concat(s.final.fields);
}

function lineFields_(s) {
  s = s || schema_();
  const out = [];
  s.line.sections.forEach(function (sec) { sec.fields.forEach(function (f) { out.push(f); }); });
  return out;
}

function headerKeys_() {
  return headerFields_().filter(function (f) { return f.type !== 'file'; }).map(function (f) { return f.key; });
}

function lineKeys_() {
  return lineFields_().filter(function (f) { return f.type !== 'file'; }).map(function (f) { return f.key; });
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
  const settings = getSettings_();
  const boot = {
    user: email,
    isUsDesk: desk,
    isAdmin: isAdmin_(email),
    schema: schema_(),
    lists: optionLists_(),
    aliases: aliases_(),
    defaults: suggestDefaults_(),
    learningMode: settings.LearningMode,
    today: todayStr_(),
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
      const dl = r.Status === STATUS.filed ? null : businessDeadline_(r.on_start_date);
      return {
        id: r.DisputeID, status: r.Status, team: r.Team, owner: r.Owner, plan: r.plan_name,
        lines: count[r.DisputeID] || 0, updatedAt: r.UpdatedAt, updatedBy: r.UpdatedBy,
        returnReason: r.ReturnReason, pdf: r.ConfirmationPdfUrl,
        initiateBy: dl ? dl.initiateBy : '', daysLeft: dl ? dl.daysLeft : ''
      };
    })
    .reverse();
}

/** Everything the editor and the copy desk need for one dispute, read in a single Sheets request. */
function getDispute(id) {
  const t = readTables_([TABS.disputes, TABS.lines, TABS.files]);
  const all = rows_(t[0]);
  const d = all.filter(function (r) { return r.DisputeID === id; })[0];
  if (!d) throw new Error('Dispute not found: ' + id);
  const allLines = rows_(t[1]);
  const lines = allLines
    .filter(function (l) { return l.DisputeID === id; })
    .sort(function (a, b) { return Number(a.LineNo) - Number(b.LineNo); });
  return { dispute: d, lines: lines, files: filesOf_(id), warnings: warnings_(d, lines, all, allLines),
    deadline: businessDeadline_(d.on_start_date) };
}

/** Creates or updates the dispute header (pages 1-3 and the final page fields). Returns { id, bundle }. */
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
    const old = Object.assign({}, rec);

    const values = payload.values || {};
    const fields = headerFields_().concat(schema_().internal);
    fields.forEach(function (f) {
      if (f.type !== 'file' && Object.prototype.hasOwnProperty.call(values, f.key)) rec[f.key] = safe_(normValue_(f, values[f.key]));
    });
    rec.UpdatedBy = user;
    rec.UpdatedAt = now;
    if (rowNum === -1) appendRecords_(TABS.disputes, [rec]); else writeRecord_(TABS.disputes, rowNum, rec);
    learnRecord_(fields, values, old, rec);
    learnFlush_();
    log_(id, 'save', payload.page || '');
    return id;
  });
  return { id: id, bundle: getDispute(id) };
}

/** Adds or replaces a line item (page 4). Returns { lineNo, bundle }. */
function saveLine(id, lineNo, values) {
  lineNo = withLock_(function () {
    assertEditable_(id);
    const fields = lineFields_();
    const all = table_(TABS.lines).rows;
    const existing = all.filter(function (r) { return r.DisputeID === id; });
    if (!lineNo) {
      if (existing.length >= 50) throw new Error('This dispute already has 50 line items, the maximum for one batched dispute.');
      lineNo = existing.reduce(function (m, r) { return Math.max(m, Number(r.LineNo) || 0); }, 0) + 1;
    }
    const rec = { DisputeID: id, LineNo: Number(lineNo) };
    fields.forEach(function (f) { if (f.type !== 'file') rec[f.key] = safe_(normValue_(f, values[f.key])); });
    let rowNum = -1;
    all.forEach(function (r, i) { if (r.DisputeID === id && Number(r.LineNo) === Number(lineNo)) rowNum = i + 2; });
    const old = rowNum === -1 ? {} : Object.assign({}, all[rowNum - 2]);
    if (rowNum === -1) appendRecords_(TABS.lines, [rec]); else writeRecord_(TABS.lines, rowNum, rec);
    linkClaimDocs_(id, Number(lineNo), rec.claim_number, existing);
    learnRecord_(fields, values, old, rec);
    learnFlush_();
    touch_(id);
    log_(id, 'line:' + lineNo, 'saved');
    return lineNo;
  });
  return { lineNo: lineNo, bundle: getDispute(id) };
}

// One QPA document per claim: a line with no QPA documentation gets the files of another
// line with the same claim number. The Drive file is shared; only a Files row is added.
function linkClaimDocs_(id, lineNo, claim, lines) {
  claim = String(claim || '').trim();
  if (!claim) return;
  const files = filesOf_(id).filter(function (f) { return f.Category === 'qpa'; });
  if (files.some(function (f) { return Number(f.LineNo) === lineNo; })) return;
  const sameClaim = lines.filter(function (l) { return Number(l.LineNo) !== lineNo && String(l.claim_number).trim() === claim; })
    .map(function (l) { return Number(l.LineNo); });
  const seen = {};
  const copies = files.filter(function (f) {
    if (sameClaim.indexOf(Number(f.LineNo)) === -1 || seen[f.FileId]) return false;
    seen[f.FileId] = true;
    return true;
  }).map(function (f) { return Object.assign({}, f, { LineNo: lineNo, UploadedBy: currentUser_(), UploadedAt: nowStr_() }); });
  appendRecords_(TABS.files, copies);
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

/**
 * Stores one uploaded file in the dispute's Drive folder. data is base64 without the data: prefix.
 * With sameClaim, a QPA document is also attached to every other line with the same claim number.
 * Returns the dispute's file list.
 */
function uploadFile(id, category, lineNo, name, mimeType, data, sameClaim) {
  if (!id) throw new Error('Save the page before uploading files.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > 45 * 1024 * 1024) throw new Error('Files must be under 45 MB each.');
  const file = disputeFolder_(id).createFile(Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name));
  return withLock_(function () {
    const recs = [fileRecord_(id, category, lineNo, name, file)];
    if (sameClaim && category === 'qpa' && lineNo) {
      const lines = rows_(table_(TABS.lines)).filter(function (l) { return l.DisputeID === id; });
      const mine = lines.filter(function (l) { return Number(l.LineNo) === Number(lineNo); })[0];
      const claim = mine ? String(mine.claim_number).trim() : '';
      lines.forEach(function (l) {
        if (claim && Number(l.LineNo) !== Number(lineNo) && String(l.claim_number).trim() === claim) {
          recs.push(fileRecord_(id, category, l.LineNo, name, file));
        }
      });
    }
    appendRecords_(TABS.files, recs);
    log_(id, 'upload', category + ' ' + name + (recs.length > 1 ? ' (' + recs.length + ' lines)' : ''));
    return { name: name, url: file.getUrl(), id: file.getId(), files: filesOf_(id) };
  });
}

/** Removes a file. With lineNo, a QPA document shared by other lines is only unlinked from that line. */
function removeFile(id, fileId, lineNo) {
  return withLock_(function () {
    assertEditable_(id);
    const uses = filesOf_(id).filter(function (r) { return r.FileId === fileId; }).length;
    const onlyLine = !!lineNo && uses > 1;
    deleteWhere_(TABS.files, function (r) {
      return r.DisputeID === id && r.FileId === fileId && (!onlyLine || Number(r.LineNo) === Number(lineNo));
    });
    if (!onlyLine) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    }
    log_(id, onlyLine ? 'file-unlinked' : 'file-removed', fileId + (onlyLine ? ' line ' + lineNo : ''));
    return filesOf_(id);
  });
}

/** Checks the dispute, saves the summary page as a PDF in Drive and hands it to the US desk. */
function finalizeDispute(id) {
  const problems = validate_(id);
  if (problems.length) return { ok: false, problems: problems, warnings: getDispute(id).warnings };
  const pdfUrl = buildConfirmationPdf_(id);
  withLock_(function () {
    setCells_(id, { Status: STATUS.ready, ConfirmationPdfUrl: pdfUrl, ReadyAt: nowStr_(), ReturnReason: '' });
    log_(id, 'status', STATUS.ready);
  });
  const bundle = getDispute(id);
  return { ok: true, pdfUrl: pdfUrl, bundle: bundle, warnings: bundle.warnings };
}

// ------------------------------------------------------------------ US desk

function markFiled(id, portalNumber, portalPdf) {
  requireUsDesk_();
  portalNumber = String(portalNumber || '').trim().toUpperCase();
  if (!/^DISP-\d{7}$/.test(portalNumber)) throw new Error('Enter the dispute number the portal gave you, like DISP-1234567.');
  if (!portalPdf || !portalPdf.data) throw new Error('Attach the portal confirmation PDF.');
  const pdfUrl = uploadFile(id, 'portal_confirmation', '', portalPdf.name, portalPdf.mimeType, portalPdf.data).url;
  withLock_(function () {
    setCells_(id, { Status: STATUS.filed, FiledBy: currentUser_(), FiledAt: nowStr_(),
      PortalDisputeNumber: safe_(portalNumber), PortalPdfUrl: pdfUrl });
    log_(id, 'status', STATUS.filed + ' ' + portalNumber);
  });
  return getDispute(id);
}

/** reason comes from the ReturnReason list (or is typed and learned); details say what to fix. */
function returnDispute(id, reason, details) {
  requireUsDesk_();
  reason = String(reason || '').trim();
  details = String(details || '').trim();
  if (!reason) throw new Error('Pick a reason for returning the dispute.');
  return withLock_(function () {
    const text = reason + (details ? ': ' + details : '');
    setCells_(id, { Status: STATUS.returned, ReturnReason: safe_(text) });
    learn_('ReturnReason', reason);
    learnFlush_();
    log_(id, 'status', STATUS.returned + ': ' + text);
    return true;
  });
}

// ------------------------------------------------------------------ learning
// Every combo value saved feeds the Options tab: new values are added (Source learned),
// known values get Count + 1 and LastUsed. Profile lists also keep the latest non-empty
// contact fields in Data. Changes are queued and written in two calls by learnFlush_().

let LEARN_ = null; // { header, dirty: { rowNum: record }, adds: [records] } for this server call

/** Upserts one value of a list. data: profile fields to merge. noCount: update Data only. Returns the stored value. */
function learn_(list, value, data, noCount) {
  value = String(value == null ? '' : value).trim();
  if (!list || !value || isPlaceholder_(value)) return value;
  if (!LEARN_) LEARN_ = { header: table_(TABS.options).header, dirty: {}, adds: [] };
  data = cleanData_(data);
  const now = nowStr_();

  // A value an admin merged into another one counts toward that one.
  let hit = findOption_(list, value);
  for (let hops = 0; hit && parseData_(hit.rec.Data).mergedInto && hops < 5; hops++) {
    const next = findOption_(list, parseData_(hit.rec.Data).mergedInto);
    if (!next) break;
    hit = next;
  }

  if (!hit) {
    if (noCount) return value;
    LEARN_.adds.push(optionRecord_(list, value, {
      label: list === 'ServiceCode' && data ? data.description || '' : '', data: data, count: 1, lastUsed: now,
      source: 'learned', status: getSettings_().LearningMode === 'On' ? ACTIVE : HIDDEN
    }));
    return value;
  }
  const rec = hit.rec;
  let changed = false;
  if (!noCount) { rec.Count = (Number(rec.Count) || 0) + 1; rec.LastUsed = now; changed = true; }
  if (data) {
    const before = parseData_(rec.Data);
    const json = JSON.stringify(Object.assign({}, before, data));
    if (json !== JSON.stringify(before)) { rec.Data = json; changed = true; }
  }
  if (changed && hit.rowNum) LEARN_.dirty[hit.rowNum] = rec;
  return rec.Value;
}

// Pending additions first, then the tab. Matching ignores case and punctuation.
function findOption_(list, value) {
  const key = optionKey_(value);
  const add = LEARN_ ? LEARN_.adds.filter(function (r) { return r.List === list && optionKey_(r.Value) === key; })[0] : null;
  if (add) return { rec: add, rowNum: 0 };
  const rows = table_(TABS.options).rows;
  let fallback = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].List !== list || optionKey_(rows[i].Value) !== key) continue;
    if (rows[i].Value === value) return { rec: rows[i], rowNum: i + 2 };
    if (!fallback) fallback = { rec: rows[i], rowNum: i + 2 };
  }
  return fallback;
}

/** Learns the combo fields of a saved record. Count goes up only when the value is new on this record. */
function learnRecord_(fields, values, old, rec) {
  fields.forEach(function (f) {
    if (f.type !== 'combo' || !f.options || !Object.prototype.hasOwnProperty.call(values, f.key)) return;
    const now = String(rec[f.key] || '').trim();
    if (!now) return;
    const data = f.fill ? profileData_(f.fill, rec) : null;
    const before = (f.multi ? splitMulti_(old[f.key]) : [String(old[f.key] || '')]).map(optionKey_);
    (f.multi ? splitMulti_(now) : [now]).forEach(function (v) {
      const isNew = before.indexOf(optionKey_(v)) === -1;
      if (isNew || data) learn_(f.options, v, data, !isNew);
    });
  });
}

function learnFlush_() {
  const q = LEARN_;
  LEARN_ = null;
  if (!q || (!q.adds.length && !Object.keys(q.dirty).length)) return;
  appendRecords_(TABS.options, q.adds); // appending never moves the rows in q.dirty
  writeRows_(TABS.options, q.header, q.dirty);
  clearOptionsCache_(); // new values show for everyone on their next page load
}

// The profile a record holds for a fill map: { dataKey: value } of its non-empty fields.
function profileData_(fill, rec) {
  const out = {};
  Object.keys(fill).forEach(function (dk) {
    const v = String(rec[[].concat(fill[dk])[0]] || '').trim();
    if (v) out[dk] = v;
  });
  return Object.keys(out).length ? out : null;
}

function cleanData_(data) {
  if (!data) return null;
  const out = {};
  Object.keys(data).forEach(function (k) {
    const v = String(data[k] == null ? '' : data[k]).trim();
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
}

function parseData_(json) {
  if (!json) return {};
  if (typeof json === 'object') return json;
  try { const o = JSON.parse(json); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

function splitMulti_(v) {
  return String(v || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(String);
}

function optionRecord_(list, value, o) {
  o = o || {};
  return { List: list, Value: String(value), Label: o.label || '',
    Data: o.data && Object.keys(o.data).length ? JSON.stringify(o.data) : '',
    Count: o.count || 0, LastUsed: o.lastUsed || '', Source: o.source || 'seed', Status: o.status || ACTIVE,
    AddedBy: o.addedBy || currentUser_(), AddedAt: o.addedAt || nowStr_() };
}

// "N/A", "-" and a lone "$" are what a blank looks like on some notices.
function isPlaceholder_(v) {
  return /^(n\/?a|none|-+|\$)$/i.test(String(v).trim());
}

// ---- typo protection
// Case, spaces and punctuation are ignored, so "SILVER ALLIANCE,LLC" and "Silver Alliance, L.L.C."
// both match "SILVER ALLIANCE LLC". Values whose digits differ are never typos of each other
// (99284 and 99285, Team 1 and Team 11).

function optionKey_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function editDistance_(a, b) {
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** The known value a typed value is probably meant to be, or '' (exact matches and new values return ''). */
function closestOption_(values, typed) {
  const key = optionKey_(typed);
  if (!key || values.indexOf(typed) !== -1) return '';
  const digits = function (s) { return s.replace(/\D/g, ''); };
  let best = '';
  let bestD = 3;
  values.forEach(function (v) {
    const k = optionKey_(v);
    if (!k || bestD === 0) return;
    if (k === key) { best = v; bestD = 0; return; }
    if (digits(k) !== digits(key)) return;
    const d = editDistance_(k, key);
    if (d <= 2 && d < Math.min(k.length, key.length) / 2 && d < bestD) { best = v; bestD = d; }
  });
  return best;
}

// ---- learned defaults

/**
 * The effective default of every field that has one: the most used value in the last
 * DefaultWindow saved records when its share is at least DefaultShare (and the sample
 * has MIN_DEFAULT_SAMPLE records), otherwise the seeded default. Cached for 10 minutes.
 * Returns { fieldKey: { value, source: 'learned' | 'seed', share, sample } }.
 */
function suggestDefaults_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('defaults');
  if (hit) return JSON.parse(hit);
  const st = getSettings_();
  const s = schema_();
  const t = readTables_([TABS.disputes, TABS.lines]);
  const hidden = {};
  optionRows_().forEach(function (r) { if (r.Status === HIDDEN) hidden[r.List + '|' + optionKey_(r.Value)] = true; });
  const out = {};

  const learnFrom = function (fields, recs) {
    const recent = recs.slice(-st.DefaultWindow);
    fields.forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(f, 'default')) return;
      const seed = f.default === '@top' ? (options_()[f.options] || [])[0] || '' : f.default;
      const tally = {};
      let n = 0;
      recent.forEach(function (r) {
        const v = String(r[f.key] == null ? '' : r[f.key]).trim();
        if (!v && !f.learnEmpty) return;
        tally[v] = (tally[v] || 0) + 1;
        n++;
      });
      let top = '';
      let topN = 0;
      Object.keys(tally).forEach(function (v) { if (tally[v] > topN) { top = v; topN = tally[v]; } });
      const share = n ? Math.round(topN / n * 100) / 100 : 0;
      const usable = n >= MIN_DEFAULT_SAMPLE && share >= st.DefaultShare && !(f.type === 'combo' && hidden[f.options + '|' + optionKey_(top)]);
      out[f.key] = usable ? { value: top, source: 'learned', share: share, sample: n } : { value: seed, source: 'seed', share: share, sample: n };
    });
  };
  // Disputes by last save, newest last; line items in the order they were added.
  learnFrom(headerFields_(s), rows_(t[0]).slice().sort(function (a, b) { return String(a.UpdatedAt) < String(b.UpdatedAt) ? -1 : 1; }));
  learnFrom(lineFields_(s), rows_(t[1]));
  try { cache.put('defaults', JSON.stringify(out), 600); } catch (e) { /* computed again next time */ }
  return out;
}

// ---- Insights (trends during the training phase)

function getInsights() {
  const rows = optionRows_();
  const st = getSettings_();
  const weekAgo = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const labels = {};
  const s = schema_();
  headerFields_(s).concat(lineFields_(s)).forEach(function (f) { labels[f.key] = shortLabel_(f.label); });
  let addedThisWeek = 0;

  const lists = LEARNED_LISTS.map(function (name) {
    const mine = rows.filter(function (r) { return r.List === name; });
    const active = mine.filter(function (r) { return r.Status !== HIDDEN; });
    const total = active.reduce(function (sum, r) { return sum + r.Count; }, 0);
    const added = mine.filter(function (r) { return r.Source === 'learned' && String(r.AddedAt) >= weekAgo; }).length;
    addedThisWeek += added;
    return {
      list: name, values: active.length, total: total, addedThisWeek: added,
      pending: mine.filter(function (r) { return r.Status === HIDDEN && r.Source === 'learned' && !parseData_(r.Data).mergedInto; }).length,
      top: rankRows_(active).slice(0, 10).map(function (r) {
        return { value: r.Value, label: r.Label, count: r.Count, share: total ? Math.round(r.Count / total * 100) : 0, source: r.Source };
      })
    };
  });
  const defaults = suggestDefaults_();
  return {
    settings: st, addedThisWeek: addedThisWeek, lists: lists,
    defaults: Object.keys(defaults).map(function (k) { return Object.assign({ key: k, label: labels[k] || k }, defaults[k]); })
  };
}

// ---- Lists admin (users in the Admin list)

/** Without list: the list names with value counts. With list: every value of that list. */
function adminListOptions(list) {
  requireAdmin_();
  const rows = rows_(table_(TABS.options));
  const summary = {};
  rows.forEach(function (r) {
    const s = summary[r.List] = summary[r.List] || { list: r.List, active: 0, hidden: 0 };
    if (r.Status === HIDDEN) s.hidden++; else s.active++;
  });
  const out = { lists: Object.keys(summary).sort().map(function (k) { return summary[k]; }), learningMode: getSettings_().LearningMode };
  if (!list) return out;
  const mine = rows.filter(function (r) { return r.List === list; });
  const activeValues = mine.filter(function (r) { return r.Status !== HIDDEN; }).map(function (r) { return r.Value; });
  out.list = list;
  out.rows = mine.map(function (r) {
    const data = parseData_(r.Data);
    return {
      value: r.Value, label: r.Label, data: data, count: Number(r.Count) || 0, lastUsed: r.LastUsed, source: r.Source,
      status: r.Status || ACTIVE, addedBy: r.AddedBy, addedAt: r.AddedAt, mergedInto: data.mergedInto || '',
      similar: closestOption_(activeValues.filter(function (v) { return v !== r.Value; }), r.Value)
    };
  }).sort(function (a, b) { return b.count - a.count; });
  return out;
}

/**
 * change: { label?, status?: 'Active' | 'Hidden', mergeInto? }. Merging moves the count and the
 * profile into another value (created if it does not exist, which is how a value is renamed) and
 * hides this one; later saves of the old value count toward the new one. Returns the list again.
 */
function adminUpdateOption(list, value, change) {
  requireAdmin_();
  change = change || {};
  withLock_(function () {
    const t = table_(TABS.options);
    const header = t.header;
    const idx = t.rows.findIndex(function (r) { return r.List === list && r.Value === value; });
    if (idx === -1) throw new Error('Not found in ' + list + ': ' + value);
    const rec = Object.assign({}, t.rows[idx]);
    const dirty = {};
    const adds = [];
    if (change.label != null) rec.Label = safe_(change.label);
    if (change.status) {
      if ([ACTIVE, HIDDEN].indexOf(change.status) === -1) throw new Error('Status must be Active or Hidden.');
      rec.Status = change.status;
      if (change.status === ACTIVE) {
        const data = parseData_(rec.Data);
        delete data.mergedInto;
        rec.Data = Object.keys(data).length ? JSON.stringify(data) : '';
      }
    }
    const into = String(change.mergeInto || '').trim();
    if (into) {
      if (into === value) throw new Error('Pick a different value to merge into.');
      const srcData = parseData_(rec.Data);
      delete srcData.mergedInto;
      const other = function (test) { return t.rows.findIndex(function (r, i) { return i !== idx && r.List === list && test(r); }); };
      let ti = other(function (r) { return r.Value === into; });
      if (ti === -1) ti = other(function (r) { return optionKey_(r.Value) === optionKey_(into); });
      if (ti === -1) {
        adds.push(optionRecord_(list, into, { label: rec.Label, data: srcData, count: Number(rec.Count) || 0, lastUsed: rec.LastUsed,
          source: 'learned', status: ACTIVE }));
      } else {
        const target = Object.assign({}, t.rows[ti]);
        target.Count = (Number(target.Count) || 0) + (Number(rec.Count) || 0);
        if (String(rec.LastUsed) > String(target.LastUsed)) target.LastUsed = rec.LastUsed;
        const merged = Object.assign({}, srcData, cleanData_(parseData_(target.Data)) || {});
        target.Data = Object.keys(merged).length ? JSON.stringify(merged) : '';
        target.Status = ACTIVE;
        dirty[ti + 2] = target;
      }
      rec.Count = 0;
      rec.Status = HIDDEN;
      rec.Data = JSON.stringify(Object.assign(parseData_(rec.Data), { mergedInto: ti === -1 ? into : t.rows[ti].Value }));
    }
    dirty[idx + 2] = rec;
    appendRecords_(TABS.options, adds);
    writeRows_(TABS.options, header, dirty);
    log_('', 'option', list + ': ' + value + ' ' + JSON.stringify(change));
  });
  clearOptionsCache_();
  CacheService.getScriptCache().remove('defaults');
  return adminListOptions(list);
}

// ------------------------------------------------------------------ deadlines
// Open negotiation lasts 30 business days, counted from the day after it starts. The dispute
// must then be initiated within the next 4 business days. Weekends and the dates in the
// Holiday list (federal holidays, as observed) are not business days.

const DAY_MS = 86400000;
let HOLIDAYS_ = null;

/** Returns { onEnds, initiateBy, daysLeft } for an ISO start date, or null. daysLeft counts today; 0 or less means passed. */
function businessDeadline_(onStart, today) {
  const start = isoToUtc_(onStart);
  if (start === null) return null;
  const hol = holidays_();
  const onEnds = addBusinessDays_(start, 30, hol);
  const initiateBy = addBusinessDays_(onEnds, 4, hol);
  const now = isoToUtc_(today || todayStr_());
  let daysLeft = 0;
  if (now <= initiateBy) {
    for (let d = now; d <= initiateBy; d += DAY_MS) if (isBusinessDay_(d, hol)) daysLeft++;
  } else {
    for (let d = initiateBy + DAY_MS; d <= now && daysLeft > -400; d += DAY_MS) if (isBusinessDay_(d, hol)) daysLeft--;
  }
  return { onEnds: utcToIso_(onEnds), initiateBy: utcToIso_(initiateBy), daysLeft: daysLeft };
}

function addBusinessDays_(from, n, hol) {
  let d = from;
  while (n > 0) {
    d += DAY_MS;
    if (isBusinessDay_(d, hol)) n--;
  }
  return d;
}

function isBusinessDay_(ms, hol) {
  const wd = new Date(ms).getUTCDay();
  return wd !== 0 && wd !== 6 && !hol[utcToIso_(ms)];
}

function holidays_() {
  if (HOLIDAYS_) return HOLIDAYS_;
  const out = {};
  optionRows_().forEach(function (r) {
    if (r.List !== 'Holiday' || r.Status === HIDDEN) return;
    let v = String(r.Value).trim();
    if (/^\d{5}$/.test(v)) v = serialToText_(Number(v), 'yyyy-MM-dd');
    const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) v = us[3] + '-' + ('0' + us[1]).slice(-2) + '-' + ('0' + us[2]).slice(-2);
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) out[v.slice(0, 10)] = true;
  });
  return (HOLIDAYS_ = out);
}

function isoToUtc_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function utcToIso_(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
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

  const pages = s.pages.concat([{ step: s.final.step, sections: [{ fields: s.final.fields }] }]);
  pages.forEach(function (p) {
    p.sections.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'file') {
          if (f.required && !hasFile(f.category)) problems.push(p.step + ': ' + shortLabel_(f.label) + ' is missing');
          return;
        }
        const msg = checkField_(f, d[f.key], d);
        if (msg) problems.push(p.step + ': ' + shortLabel_(f.label) + ' ' + msg);
        if (f.stop && String(d[f.key]) === f.stop.value) problems.push(f.stop.message + ': "' + shortLabel_(f.label) + '" is ' + f.stop.value + '.');
      });
    });
  });

  if (full.deadline && full.deadline.daysLeft <= 0) {
    problems.push('Deadline passed: the dispute had to be initiated by ' + fmt_(full.deadline.initiateBy, 'date') + '.');
  }

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

/** Checks that do not block Ready: amounts, dispute kind, claims already in other disputes, timing. */
function warnings_(d, lines, allDisputes, allLines) {
  const out = [];
  const isAmt = function (v) { return /^\d+(\.\d{1,2})?$/.test(String(v == null ? '' : v)); };
  const cents = function (v) { return Math.round(Number(v) * 100); };
  lines.forEach(function (l) {
    if (!isAmt(l.qpa) || !isAmt(l.cost_sharing)) return;
    if (cents(l.cost_sharing) > cents(l.qpa)) {
      out.push('Line ' + l.LineNo + ': cost sharing (' + fmt_(l.cost_sharing, 'money') + ') is more than the QPA (' + fmt_(l.qpa, 'money') + ').');
    } else if (isAmt(l.initial_payment) && cents(l.cost_sharing) + cents(l.initial_payment) !== cents(l.qpa)) {
      out.push('Line ' + l.LineNo + ': cost sharing plus initial payment (' + fmt_((cents(l.cost_sharing) + cents(l.initial_payment)) / 100, 'money') +
        ') does not equal the QPA (' + fmt_(l.qpa, 'money') + ').');
    }
  });

  const claims = [];
  lines.forEach(function (l) {
    const c = String(l.claim_number || '').trim();
    if (c && claims.indexOf(c) === -1) claims.push(c);
  });
  if (d.dispute_kind === 'Single dispute' && claims.length > 1) {
    out.push('This is marked "Single dispute" but has ' + claims.length + ' different claim numbers. Check "What are you disputing today?".');
  }

  const status = {};
  allDisputes.forEach(function (r) { status[r.DisputeID] = r.Status; });
  const elsewhere = {};
  allLines.forEach(function (l) {
    const st = status[l.DisputeID];
    const c = String(l.claim_number || '').trim();
    if (l.DisputeID === d.DisputeID || !st || st === STATUS.returned || claims.indexOf(c) === -1) return;
    (elsewhere[c] = elsewhere[c] || {})[l.DisputeID] = st;
  });
  Object.keys(elsewhere).forEach(function (c) {
    out.push('Claim ' + c + ' is also in ' + Object.keys(elsewhere[c]).map(function (i) { return i + ' (' + elsewhere[c][i] + ')'; }).join(', ') + '.');
  });

  const dl = businessDeadline_(d.on_start_date);
  if (dl && todayStr_() <= dl.onEnds) {
    out.push('Open negotiation runs until ' + fmt_(dl.onEnds, 'date') + '. The dispute can be initiated from the next business day.');
  }
  return out;
}

function checkField_(f, value, record) {
  let v = value == null ? '' : String(value).trim();
  const required = f.required || (f.requiredIf && String(record[f.requiredIf.key] || '').indexOf(f.requiredIf.includes) !== -1);
  if (v && isPlaceholder_(v) && f.type !== 'checkboxes') return required ? 'is required ("' + v + '" is not accepted)' : '';
  if (!v) return required ? 'is required' : '';
  if (f.digits) v = v.replace(/[\s-]/g, '');
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMsg || 'is not in the right format';
  if (f.type === 'zip' && !/^\d{5}(-\d{4})?$/.test(normZip_(v))) return 'must be 5 or 9 digits, like 76132 or 76132-1234';
  if (f.type === 'phone' && !/^\(\d{3}\) \d{3}-\d{4}$/.test(normPhone_(v))) return 'must be 10 digits, like (817) 566-1232';
  if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'is not a valid email';
  if (f.type === 'money' && !/^\d+(\.\d{1,2})?$/.test(v)) return 'must be an amount like 154.00';
  if (f.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'must be a date';
    if (f.min && v < f.min) return 'must be on or after ' + f.min;
    if (f.max === 'today' && v > todayStr_()) return 'cannot be in the future';
  }
  return '';
}

/** The stored form of a typed value: phones as (817) 566-1232, ZIP+4 with a hyphen, Tax ID and NPI as digits. */
function normValue_(f, v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v;
  let s = String(v).trim();
  if (f.type === 'phone') s = normPhone_(s);
  if (f.type === 'zip') s = normZip_(s);
  if (f.type === 'money') s = s.replace(/[$,\s]/g, '');
  if (f.digits) s = s.replace(/[\s-]/g, '');
  return s;
}

/** Accepts (817) 566-1232, 817-566-1232, 817.566.1232, 8175661232 or +1 817 566 1232. Anything else is returned as typed. */
function normPhone_(v) {
  const s = String(v == null ? '' : v).trim();
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length !== 10 || /[^\d\s().+-]/.test(s)) return s;
  return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

function normZip_(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^\d{9}$/.test(s)) return s.slice(0, 5) + '-' + s.slice(5);
  return s;
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
    warnings: full.warnings,
    deadline: full.deadline,
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

const STAMP_COLS = ['CreatedAt', 'UpdatedAt', 'ReadyAt', 'FiledAt', 'UploadedAt', 'Timestamp', 'LastUsed', 'AddedAt'];
let FIELD_TYPES_ = null;

function fieldTypes_() {
  if (FIELD_TYPES_) return FIELD_TYPES_;
  const out = {};
  const s = schema_();
  headerFields_(s).concat(lineFields_(s)).forEach(function (f) { out[f.key] = f.type; });
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
    if (type === 'zip') return v > 99999 ? normZip_(('000000000' + v).slice(-9)) : ('00000' + v).slice(-5);
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

/** Writes several scattered rows ({ rowNum: record }) in one call. */
function writeRows_(name, header, byRow) {
  const nums = Object.keys(byRow);
  if (!nums.length) return;
  if (useApi_()) {
    Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: 'RAW',
      data: nums.map(function (n) { return { range: "'" + name + "'!A" + n, values: [recordToRow_(header, byRow[n])] }; })
    }, ss_().getId());
  } else {
    const sh = tab_(name);
    nums.forEach(function (n) {
      sh.getRange(Number(n), 1, 1, header.length).setValues([recordToRow_(header, byRow[n]).map(guard_)]);
    });
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
  LEARN_ = null;
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

// ------------------------------------------------------------------ users, options and settings

function currentUser_() {
  return Session.getActiveUser().getEmail() || 'unknown user';
}

function inList_(list, email) {
  const values = options_()[list] || [];
  return values.map(function (e) { return String(e).toLowerCase(); }).indexOf(String(email).toLowerCase()) !== -1;
}

function isUsDesk_(email) { return inList_('UsDeskUser', email); }

function isAdmin_(email) { return inList_('Admin', email); }

function requireUsDesk_() {
  if (!isUsDesk_(currentUser_())) throw new Error('Only US desk users listed in the Options tab can do this.');
}

function requireAdmin_() {
  if (!isAdmin_(currentUser_())) throw new Error('Only admins listed in the Options tab (List: Admin) can change lists.');
}

// The Options rows are cached for 10 minutes. Saving a new value or editing the Options tab
// clears the cache (see learnFlush_ and onEdit).
let OPTION_ROWS_ = null;
let OPTIONS_ = null;

/** Every Options row, hidden ones included, with Count as a number. */
function optionRows_() {
  if (OPTION_ROWS_) return OPTION_ROWS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('options');
  if (hit) return (OPTION_ROWS_ = JSON.parse(hit));
  const out = readTab_(TABS.options).filter(function (r) { return r.List && r.Value !== ''; }).map(function (r) {
    return { List: String(r.List), Value: String(r.Value), Label: r.Label || '', Data: r.Data || '', Count: Number(r.Count) || 0,
      LastUsed: r.LastUsed || '', Source: r.Source || 'seed', Status: r.Status === HIDDEN ? HIDDEN : ACTIVE, AddedAt: r.AddedAt || '' };
  });
  try { cache.put('options', JSON.stringify(out), 600); } catch (e) { /* too large to cache: read each time */ }
  return (OPTION_ROWS_ = out);
}

// Most used first, then most recently used; ties keep the tab's order.
function rankRows_(rows) {
  return rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
    return (b.r.Count - a.r.Count) || (String(b.r.LastUsed) > String(a.r.LastUsed) ? 1 : String(b.r.LastUsed) < String(a.r.LastUsed) ? -1 : a.i - b.i);
  }).map(function (x) { return x.r; });
}

function activeByList_() {
  const by = {};
  optionRows_().forEach(function (r) { if (r.Status !== HIDDEN) (by[r.List] = by[r.List] || []).push(r); });
  Object.keys(by).forEach(function (k) { if (FIXED_ORDER_LISTS.indexOf(k) === -1) by[k] = rankRows_(by[k]); });
  return by;
}

/** { List: [values] } of active values, most used first. */
function options_() {
  if (OPTIONS_) return OPTIONS_;
  const by = activeByList_();
  const out = {};
  Object.keys(by).forEach(function (k) { out[k] = by[k].map(function (r) { return r.Value; }); });
  return (OPTIONS_ = out);
}

/** For the browser: { List: [{ v, l, d, n }] } of active values (value, label, profile data, count). */
function optionLists_() {
  const by = activeByList_();
  const out = {};
  Object.keys(by).forEach(function (k) {
    if (PRIVATE_LISTS.indexOf(k) !== -1) return;
    out[k] = by[k].map(function (r) {
      const o = { v: r.Value };
      if (r.Label) o.l = r.Label;
      if (r.Data) o.d = parseData_(r.Data);
      if (r.Count) o.n = r.Count;
      return o;
    });
  });
  return out;
}

/** { List: { key: value it was merged into } }, so typing an old value suggests the new one. */
function aliases_() {
  const out = {};
  optionRows_().forEach(function (r) {
    const into = r.Status === HIDDEN ? parseData_(r.Data).mergedInto : '';
    if (into && PRIVATE_LISTS.indexOf(r.List) === -1) (out[r.List] = out[r.List] || {})[optionKey_(r.Value)] = into;
  });
  return out;
}

function clearOptionsCache_() {
  OPTION_ROWS_ = null;
  OPTIONS_ = null;
  HOLIDAYS_ = null;
  CacheService.getScriptCache().remove('options');
}

let SETTINGS_ = null;

/** The Settings tab with defaults filled in: { LearningMode: 'On' | 'Off', DefaultWindow: number, DefaultShare: 0-1 }. */
function getSettings_() {
  if (SETTINGS_) return SETTINGS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('settings');
  if (hit) return (SETTINGS_ = JSON.parse(hit));
  const out = Object.assign({}, SETTING_DEFAULTS);
  try {
    readTab_(TABS.settings).forEach(function (r) { if (r.Key && r.Value !== '') out[r.Key] = r.Value; });
  } catch (e) { /* no Settings tab yet: run setup(). The defaults apply. */ }
  out.LearningMode = /^(off|no|false)$/i.test(String(out.LearningMode).trim()) ? 'Off' : 'On';
  out.DefaultWindow = Math.max(1, parseInt(out.DefaultWindow, 10) || SETTING_DEFAULTS.DefaultWindow);
  let share = parseFloat(String(out.DefaultShare).replace('%', ''));
  if (share > 1) share = share / 100; // 80 or 80% means 0.8
  out.DefaultShare = share > 0 && share <= 1 ? share : SETTING_DEFAULTS.DefaultShare;
  try { cache.put('settings', JSON.stringify(out), 600); } catch (e) { /* read again next time */ }
  return (SETTINGS_ = out);
}

/** Simple trigger: an edit to the Options or Settings tab takes effect right away. */
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    if (name === TABS.options) CacheService.getScriptCache().removeAll(['options', 'defaults']);
    if (name === TABS.settings) CacheService.getScriptCache().removeAll(['settings', 'defaults']);
  } catch (err) { /* the caches expire on their own within 10 minutes */ }
}

function log_(id, event, details) {
  appendRecords_(TABS.log, [{ Timestamp: nowStr_(), User: currentUser_(), DisputeID: id, Event: event, Details: safe_(details) }]);
}

// ------------------------------------------------------------------ one-time setup

/** Run from the editor. Creates or updates the tabs, the Options lists, the Settings and the Drive folder. */
function setup() {
  const ss = ss_();
  const style = function (sh, col, n) {
    sh.getRange(1, col, 1, n).setFontWeight('bold').setBackground('#003B5C').setFontColor('#FFFFFF');
  };
  const ensure = function (name, header) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(header);
      style(sh, 1, header.length);
      sh.setFrozenRows(1);
    } else {
      // New fields become new columns at the end; existing columns stay where they are.
      const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const add = header.filter(function (h) { return have.indexOf(h) === -1; });
      if (add.length) {
        sh.getRange(1, have.length + 1, 1, add.length).setValues([add]);
        style(sh, have.length + 1, add.length);
      }
    }
    SpreadsheetApp.flush();
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
  migrateOptions_(style);
  ensure(TABS.options, OPTION_COLS);
  ensure(TABS.settings, ['Key', 'Value', 'Note']);

  // Send queued SpreadsheetApp changes before anything reads the tabs through the Sheets API.
  SpreadsheetApp.flush();
  TABLES_ = {};
  const added = seedOptions_();
  seedSettings_();
  clearOptionsCache_();
  CacheService.getScriptCache().removeAll(['settings', 'defaults']);
  rootFolder_();
  Logger.log('Options: ' + added + ' seed value(s) added.');
  Logger.log(useApi_() ? 'Using the Google Sheets API advanced service.' : 'Google Sheets API advanced service is off: using SpreadsheetApp (slower).');
  Logger.log('Setup complete. Deploy as a web app: Execute as Me, access Anyone within your organization.');
}

// The first version's Options tab had List | Value | Note. Its rows move to the new columns
// (Source seed, Status Active); the Note column and the 7 placeholder plan types are dropped.
const OLD_PLAN_TYPES = ['Self-insured group health plan (ERISA)', 'Fully insured group health plan', 'Individual market plan',
  'Federal Employees Health Benefits (FEHB) plan', 'Non-federal governmental plan', 'Church plan', 'Student health plan'];

function migrateOptions_(style) {
  const sh = ss_().getSheetByName(TABS.options);
  if (!sh || sh.getLastRow() === 0) return;
  const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (have.indexOf('Status') !== -1) return;
  const iList = have.indexOf('List');
  const iValue = have.indexOf('Value');
  const old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, have.length).getValues() : [];
  const recs = old.filter(function (r) {
    return r[iList] !== '' && r[iValue] !== '' && !(r[iList] === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(String(r[iValue])) !== -1);
  }).map(function (r) { return recordToRow_(OPTION_COLS, optionRecord_(String(r[iList]), String(r[iValue]), { addedBy: 'setup (migrated)' })); });
  sh.clearContents();
  sh.getRange(1, 1, 1, OPTION_COLS.length).setValues([OPTION_COLS]);
  style(sh, 1, OPTION_COLS.length);
  sh.setFrozenRows(1);
  if (recs.length) {
    sh.getRange(2, 1, recs.length, OPTION_COLS.length).setNumberFormat('@').setValues(recs.map(function (r) { return r.map(guard_); }));
  }
  SpreadsheetApp.flush();
  TABLES_ = {};
  Logger.log('Options tab moved to the new columns: ' + recs.length + ' row(s) kept.');
}

/** Adds the seed values that are missing (matched ignoring case and punctuation). Returns how many were added. */
function seedOptions_() {
  const rows = readTab_(TABS.options);
  const have = {};
  const lists = {};
  rows.forEach(function (r) { have[r.List + '|' + optionKey_(r.Value)] = true; lists[r.List] = true; });
  // Placeholder plan types left by a partial migration.
  deleteWhere_(TABS.options, function (r) {
    return r.List === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(r.Value) !== -1 && !(Number(r.Count) > 0);
  });
  const me = Session.getActiveUser().getEmail();
  const seeds = seedRows_();
  if (me && !lists.UsDeskUser) seeds.push(['UsDeskUser', me, '', null, 0]);
  if (me && !lists.Admin) seeds.push(['Admin', me, '', null, 0]);
  const add = [];
  seeds.forEach(function (s) {
    const k = s[0] + '|' + optionKey_(s[1]);
    if (have[k]) return;
    have[k] = true;
    add.push(optionRecord_(s[0], s[1], { label: s[2], data: s[3], count: s[4], source: 'seed', addedBy: 'setup' }));
  });
  appendRecords_(TABS.options, add);
  return add.length;
}

function seedSettings_() {
  const have = {};
  readTab_(TABS.settings).forEach(function (r) { have[r.Key] = true; });
  const notes = {
    LearningMode: 'On: new values typed by users are active at once (training). Off: they are added as Hidden until an admin activates them.',
    DefaultWindow: 'How many recent saved records the learned defaults look at.',
    DefaultShare: 'Share of those records (0 to 1) one value needs to become the default.'
  };
  const add = Object.keys(SETTING_DEFAULTS).filter(function (k) { return !have[k]; })
    .map(function (k) { return { Key: k, Value: String(SETTING_DEFAULTS[k]), Note: notes[k] }; });
  appendRecords_(TABS.settings, add);
}

// ------------------------------------------------------------------ seed lists
// Business data from the Notices of IDR Initiation seen so far (payers, our billing entities,
// IDR entities, service codes). Counts are how often each value appeared. No claim numbers,
// dates of service or account numbers are kept here.

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'];

/** [list, value, label, data, count] */
function seedRows_() {
  const rows = [];
  const add = function (list, value, label, data, count) { rows.push([list, value, label || '', data || null, count || 0]); };
  US_STATES.forEach(function (s) { add('State', s); });

  const totalcare = { addr1: '6049 S. Hulen St.', city: 'Fort Worth', state: 'TX', zip: '76132',
    email: 'cedarhill.negotiations@totalcare.us', phone: '(817) 566-1232' };
  add('BillingEntity', 'SILVER ALLIANCE LLC', 'Health care facility',
    Object.assign({ acting_as: 'Health care facility', tin: '862923814', npi: '1972273233' }, totalcare), 3);
  add('BillingEntity', 'CAPITAL HEALTH PLLC', 'Health care provider',
    Object.assign({ acting_as: 'Health care provider', tin: '872524265', npi: '1609548056', group_name: 'Totalcare ER, Cedar Hill' }, totalcare), 1);

  add('Payer', 'UMR', '', { addr1: 'PO BOX 30541', city: 'SALT LAKE CITY', state: 'UT', zip: '84130', email: 'idr@clearhealthcloud.com', phone: '(877) 233-1800' }, 1);
  add('Payer', 'BLUECROSS BLUESHIELD', '', { addr1: 'PO BOX 660044', city: 'Dallas', state: 'TX', zip: '75266', email: 'nsa.disputes@bcbstx.com', phone: '(800) 451-0287' }, 1);
  add('Payer', 'Cigna', '', { addr1: 'P.O. BOX 182223', city: 'CHATTANOOGA', state: 'TN', zip: '37422-7223', email: 'nsaidr@multiplan.com', phone: '(800) 244-6224' }, 1);
  add('Payer', 'United Healthcare', '', { addr1: 'PO Box 30783', city: 'Salt Lake City', state: 'UT', zip: '84130-0783', email: 'uhg_idr_disputes@uhc.com', phone: '(877) 842-3210' }, 1);

  add('IdrEntity', 'Maximus Federal Services Inc', '', null, 2);
  add('IdrEntity', 'Capitol Bridge LLC', '', null, 1);
  add('IdrEntity', 'Federal Hearings and Appeals Services, LLC', '', null, 1);

  add('HealthPlanType', PLAN_TYPE_DEFAULT, '', null, 4);

  [['99283', 'EMERGENCY ROOM SERVICE', 1], ['99284', 'EMERGENCY ROOM SERVICE', 3], ['94761', 'MEASURE BLOOD OXYGEN LEVEL', 2],
    ['12001', 'REPAIR- TRUNK/SCALP/NECK/AXIL/LIMBS <2.5', 1], ['A4670', 'AUTOMATIC BLOOD PRESSURE MONITOR', 2],
    ['A6413', 'ADHESIVE BANDAGE, FIRST-AID', 2], ['A4930', 'GLOVES STERILE PER PAIR', 1], ['A4248', 'CHLORHEXIDINE ANTISEPT', 1],
    ['82150', 'ASSAY OF AMYLASE', 1], ['81003', 'URINALYSIS, AUTO, W/O SCOPE', 1], ['81025', 'URINE PREGNANCY TEST', 2],
    ['85025', 'COMPLETE CBC W/AUTO DIFF WBC', 1], ['80051', 'ELECTROLYTE PANEL', 1], ['82550', 'ASSAY OF CK (CPK)', 1],
    ['82565', 'ASSAY OF CREATININE', 1], ['82947', 'ASSAY, GLUCOSE, BLOOD QUANT', 1], ['84520', 'ASSAY OF UREA NITROGEN', 1],
    ['80076', 'HEPATIC FUNCTION PANEL', 1], ['10061', 'DRAINAGE OF SKIN ABSCESS', 1], ['J3490', 'PHARMACY', 1],
    ['J0696', 'Injection, ceftriaxone sodium, per 250 mg', 1], ['96372', 'THERAPY/PROPHYLAXIS/DIAGNOSIS INJECTION, SC/IM', 1],
    ['72125', 'CT NECK SPINE W/O DYE', 1], ['70450', 'CT HEAD/BRAIN W/O DYE', 1], ['72128', 'Computed tomography, thoracic spine', 1],
    ['J1885', 'Injection, ketorolac tromethamine, per 15 mg', 1], ['A4215', 'NEEDLES ONLY STERILE ANY SIZE EACH', 1],
    ['A4657', 'SYRINGE WITH OR WITHOUT NEEDLE EACH', 1], ['E1399', 'Durable medical equipment, miscellaneous', 1],
    ['99281', 'EMERGENCY ROOM SERVICE', 0], ['99282', 'EMERGENCY ROOM SERVICE', 0], ['99285', 'EMERGENCY ROOM SERVICE', 0]
  ].forEach(function (c) { add('ServiceCode', c[0], c[1], { description: c[1] }, c[2]); });

  add('PosCode', '23', 'Emergency room – hospital', null, 25);
  add('PosCode', '22', 'On campus-outpatient hospital');
  add('PosCode', '11', 'Office');
  add('PosCode', '20', 'Urgent care facility');
  add('PosCode', '41', 'Ambulance – land');

  ['25', '59', 'XU', '76', '77', 'LT', 'RT', 'GC'].forEach(function (m) { add('Modifier', m); });

  ['Missing document', 'Wrong amount', 'Wrong payer details', 'Not eligible', 'Deadline passed', 'Other']
    .forEach(function (r) { add('ReturnReason', r); });

  // US federal holidays as observed (OPM). Add next year's dates each December.
  [['2026-01-01', "New Year's Day"], ['2026-01-19', 'Birthday of Martin Luther King, Jr.'], ['2026-02-16', "Washington's Birthday"],
    ['2026-05-25', 'Memorial Day'], ['2026-06-19', 'Juneteenth National Independence Day'], ['2026-07-03', 'Independence Day (observed)'],
    ['2026-09-07', 'Labor Day'], ['2026-10-12', 'Columbus Day'], ['2026-11-11', 'Veterans Day'], ['2026-11-26', 'Thanksgiving Day'],
    ['2026-12-25', 'Christmas Day'],
    ['2027-01-01', "New Year's Day"], ['2027-01-18', 'Birthday of Martin Luther King, Jr.'], ['2027-02-15', "Washington's Birthday"],
    ['2027-05-31', 'Memorial Day'], ['2027-06-18', 'Juneteenth National Independence Day (observed)'], ['2027-07-05', 'Independence Day (observed)'],
    ['2027-09-06', 'Labor Day'], ['2027-10-11', 'Columbus Day'], ['2027-11-11', 'Veterans Day'], ['2027-11-25', 'Thanksgiving Day'],
    ['2027-12-24', 'Christmas Day (observed)'], ['2027-12-31', "New Year's Day 2028 (observed)"]
  ].forEach(function (h) { add('Holiday', h[0], h[1]); });
  return rows;
}
