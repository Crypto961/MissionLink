/**
 * IDR Initiation Prep Studio (internal).
 *
 * Lebanon prepares each Notice of IDR Initiation here, on 7 pages that follow the federal
 * IDR Gateway web form page by page (IDR Gateway Notice of IDR Initiation User Guide,
 * version 15.0, October 14, 2026). The US desk then copies every field into the portal,
 * top to bottom. Nothing in this app connects to, or sends anything to, the CMS portal.
 *
 * We always initiate, as a health care provider or a health care facility, and the
 * location of service is always Texas. Plan-side and air ambulance paths are not built.
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
// ComplexStates: states on CMS's Complex State list (comma list). Empty until the business confirms it.
const SETTING_DEFAULTS = { LearningMode: 'On', DefaultWindow: 50, DefaultShare: 0.8, ComplexStates: '' };
const MIN_DEFAULT_SAMPLE = 5; // a learned default needs at least this many saved records

// Lists the app learns from saves, shown in Insights and the Lists admin view.
const LEARNED_LISTS = ['Payer', 'BillingEntity', 'HealthPlanType', 'IdrEntity', 'ServiceCode', 'Modifier', 'PosCode',
  'Team', 'Owner', 'ReturnReason'];
// These keep the order of the Options tab (portal order); every other list is ranked by use.
const FIXED_ORDER_LISTS = ['State', 'Holiday', 'UsDeskUser', 'Admin', 'HealthPlanType', 'PlanRole', 'ActingAs', 'ExtensionReason',
  'DisputeType'];
// Never sent to the browser.
const PRIVATE_LISTS = ['UsDeskUser', 'Admin'];

// IDR Gateway transition (user guide v15.0): from Nov 13, 2026 the web form is inside the
// Gateway (sign-in); the form without sign-in is not available after Jan 15, 2027.
const GATEWAY = { transition: '2026-11-13', noSignInEnds: '2027-01-15' };

// ------------------------------------------------------------------ portal schema
// Labels and order follow the IDR Gateway web form (user guide v15.0).
// Change a label here and the entry screens, the copy desk and the PDF follow.
//
// Field options used below:
//   type 'combo'  free typing with suggestions from an Options list (options = list name)
//   type 'check'  one tick box; the stored value is Yes when ticked
//   type 'fixed'  always value (shown as a locked chip, still copied to the portal)
//   default       seeded default; '@top' means the most used value of the list. The app
//                 replaces it with a learned default when one value dominates recent saves.
//   learnEmpty    a blank answer counts as a value when learning the default
//   fill          picking a value of this profile list fills these fields (data key -> field key or keys)
//   auto          'entity': filled from the billing entity; 'planType': derived from the health plan type
//   stop          answering stop.value makes the dispute ineligible (blocks Ready)
//   showIf        the field shows (and is checked) only when the condition holds (see condMet_)
//   requiredIf    required when the condition holds; requiredUnless: required when that other field is empty
//   pattern       regular expression the value must match (patternMsg is the message)
//   chars         'name' or 'address': the portal's allowed characters (see badChars_)
//   digits        spaces and hyphens are removed before saving (Tax ID, NPI)
//   upper         stored in capitals
//   carry         a new line item starts with the previous line's value
//   multi         several values, stored "; "-separated as the portal shows them (modifiers)
//   strict        only values of the list are accepted (nothing new is learned); countUse: counts still feed the default
//   before        (dates) must be before this dispute field

const YES_NO = ['Yes', 'No'];
const ACTING_AS = ['Health care provider', 'Health care facility'];
const PLAN_TYPES = ['Individual health insurance issuer', 'Fully-insured ERISA group health plan',
  'Federal Employees Health Benefits (FEHB) carrier', 'Either partially or fully self-insured ERISA group health plan',
  'Church plan', 'Non-federal governmental plan (e.g., state or local government plan)', 'No Plan/Issuer Response'];
const PLAN_TYPE_DEFAULT = PLAN_TYPES[3];
const PLAN_TYPE_FEHB = PLAN_TYPES[2];
const PLAN_ROLE = ['Group health plan', 'Individual health insurance issuer', 'Federal Employee Health Benefits (FEHB) carrier'];
const DISPUTE_TYPES = ['A single dispute', 'A batched dispute'];
const DISPUTE_TYPE_NOTES = {
  'A single dispute': 'I’m disputing either (a) one service code that represents one item or service, or (b) one service code that represents multiple items or services (a bundled payment arrangement).',
  'A batched dispute': 'I’m disputing multiple items or services related to the treatment of a similar condition.'
};
// The dispute kind the line rules follow (the portal's names for the three line-item layouts).
const KIND = { single: 'Single Line Item – Not Bundled', bundled: 'Single Line Item – Bundled', batched: 'Batched Items or Services' };
const LINE_TYPE = { bundled: 'Bundled Item or Service', component: 'Component Item or Service' };
const EXT_APPROVAL = 'I received an extension approval from the Federal IDR mailbox and will upload evidence of this extension in the Supporting Documentation section of this web form.';
const EXT_COOLING = 'The item(s) or service(s) under dispute was subject to the cooling off period.';
const EXT_REASONS = [EXT_APPROVAL, EXT_COOLING];
// Air ambulance never applies to us, so it is not offered.
const ITEM_TYPES = ['Emergency item(s)/service(s)', 'Post-stabilization service(s)', 'Professional service(s)',
  'Hospital-based service(s)', 'Item(s)/service(s) furnished by a nonparticipating provider at a participating health care facility',
  'Other: Provide description'];
const NIP_METHODS = ['Email', 'Mail', 'Fax', 'Portal'];
const IDRE_STATUS = ['Pending', 'Accepted preferred', 'Alternate accepted', 'Alternate denied'];
const LOCATION = 'TX';
const NOT_ELIGIBLE = 'Not eligible for federal IDR';
const MAX_LINES = 50;
const BATCH_CAP_FROM = '2026-11-01'; // batched disputes with open negotiation starting on or after this date: at most 50 lines
const FILE_LIMIT = 45 * 1024 * 1024; // per file (Apps Script)
const DISPUTE_FILE_LIMIT = 500 * 1024 * 1024; // portal: the whole dispute
// Files the US desk uploads to the portal (they count toward the 500 MB).
const PORTAL_FILE_CATEGORIES = ['on_evidence', 'extension', 'cooling', 'qpa', 'additional'];

const MSG = {
  prior2022: NOT_ELIGIBLE + ': items or services provided before January 1, 2022 are not eligible for the Federal IDR process',
  consent: NOT_ELIGIBLE + ': surprise billing protections were waived for these items or services',
  onEarly: 'If the parties can’t agree on an out-of-network rate, the 30-business-day open negotiation period must elapse before starting the Federal IDR process.',
  batchMin: 'Batched items or services require two or more line items.',
  batchMax: 'Batched items or services cannot exceed 50 dispute line items. If you have additional items or services to report, you must create an additional dispute.',
  fileLimit: 'The file you are attempting to upload exceeds the 500MB file size limit for the entire dispute and cannot be uploaded. Reduce the file size and try attaching the document again.',
  coverage: 'Not eligible if the member is only enrolled in coverage such as Medicare, Medicaid, CHIP, TRICARE or a health care sharing ministry.'
};

const PAYER_FILL = { addr1: 'plan_addr1', addr2: 'plan_addr2', city: 'plan_city', state: 'plan_state',
  zip: 'plan_zip', email: 'plan_email', phone: 'plan_phone', fax: 'plan_fax' };
const ENTITY_FILL = { acting_as: 'q_acting_as', tin: 'tin', npi: 'npi', group_name: 'prov_group_name',
  addr1: 'prov_addr1', addr2: 'prov_addr2', city: 'prov_city', state: 'prov_state', zip: 'prov_zip',
  email: 'prov_email', phone: 'prov_phone', fax: 'prov_fax' };
const CODE_FILL = { description: 'description' };

const LATE = { key: 'on_start_date', late: true }; // more than 34 business days since open negotiation started

// Main contact block, in the portal's order: email, phone, fax, mailing address, city, state, ZIP.
function mainContact_(prefix, stateDefault) {
  const state = { key: prefix + 'state', label: 'State:', type: 'select', options: 'State', required: true, width: 'third' };
  if (stateDefault) state.default = stateDefault;
  return [
    { key: prefix + 'email', label: 'Email:', type: 'email', required: true, width: 'third' },
    { key: prefix + 'phone', label: 'Phone:', type: 'phone', required: true, placeholder: '(###) ###-####', width: 'third' },
    { key: prefix + 'fax', label: 'Fax:', type: 'phone', placeholder: '(###) ###-####', width: 'third' },
    { key: prefix + 'addr1', label: 'Mailing Address:', type: 'text', required: true, chars: 'address', placeholder: 'Street Address' },
    { key: prefix + 'addr2', label: 'Mailing Address Line 2:', type: 'text', chars: 'address', placeholder: 'Apartment, suite, unit, building, floor etc.' },
    { key: prefix + 'city', label: 'City:', type: 'text', required: true, chars: 'address', placeholder: 'City Name', width: 'third' },
    state,
    { key: prefix + 'zip', label: 'ZIP Code:', type: 'zip', required: true, placeholder: '#####-####', width: 'third' }
  ];
}

// Points of contact start collapsed. Once a contact name is entered, the full contact incl. the mailing address is required.
function pocSection_(prefix, title) {
  const named = { key: prefix + 'name', filled: true };
  return { title: title, collapsible: true, fields: [
    { key: prefix + 'name', label: title.indexOf('Primary') === 0 ? 'Primary Contact Name:' : 'Secondary Contact Name:', type: 'text', chars: 'name' },
    { key: prefix + 'email', label: 'Email:', type: 'email', requiredIf: named, width: 'half' },
    { key: prefix + 'phone', label: 'Phone:', type: 'phone', requiredIf: named, placeholder: '(###) ###-####', width: 'half' },
    { key: prefix + 'addr1', label: 'Mailing Address:', type: 'text', requiredIf: named, chars: 'address', placeholder: 'Street Address' },
    { key: prefix + 'addr2', label: 'Mailing Address Line 2:', type: 'text', chars: 'address' },
    { key: prefix + 'city', label: 'City:', type: 'text', requiredIf: named, chars: 'address', width: 'third' },
    { key: prefix + 'state', label: 'State:', type: 'select', options: 'State', requiredIf: named, width: 'third' },
    { key: prefix + 'zip', label: 'ZIP Code:', type: 'zip', requiredIf: named, placeholder: '#####-####', width: 'third' }
  ] };
}

function schema_() {
  const cooling = { key: 'extension_reason', equals: EXT_COOLING };
  return {
    // Internal fields (not on the portal), shown on page 1.
    internal: [
      { key: 'Team', label: 'Team', type: 'combo', options: 'Team', width: 'half' },
      { key: 'Owner', label: 'Owner (account owner)', type: 'combo', options: 'Owner', width: 'half' }
    ],
    pages: [
      {
        id: 'qual', title: 'Introduction & Qualification Questions', step: 'Introduction & Qualification Questions · page 1', short: 'Qualification',
        sections: [{ title: '', fields: [
          { key: 'q_prior_2022', label: 'Was the service in question provided prior to 1/1/2022?', type: 'radio', options: YES_NO, required: true,
            default: 'No', stop: { value: 'Yes', message: MSG.prior2022 } },
          { key: 'q_acting_as', label: 'I am (or I am acting on behalf of) a:', type: 'radio', options: ACTING_AS, required: true, auto: 'entity' },
          { key: 'tin', label: 'Tax ID:', type: 'text', requiredUnless: 'npi', requiredMsg: 'is required when there is no NPI (enter at least one of the two)',
            digits: true, pattern: '^\\d{9}$', patternMsg: 'must be 9 digits', placeholder: '#########', width: 'half' },
          { key: 'npi', label: 'National Provider Identifier (NPI):', type: 'text', requiredUnless: 'tin',
            requiredMsg: 'is required when there is no Tax ID (enter at least one of the two)', digits: true, pattern: '^\\d{10}$',
            patternMsg: 'must be 10 digits', placeholder: '##########', width: 'half' },
          { key: 'q_plan_type', label: 'Health Plan Type:', type: 'select', options: 'HealthPlanType', strict: true, countUse: true, required: true,
            default: PLAN_TYPE_DEFAULT, note: MSG.coverage },
          { key: 'fehb_enrollment_code', label: 'Enrollment Code:', type: 'text', digits: true, pattern: '^\\d{3}$', patternMsg: 'must be 3 digits',
            placeholder: '###', required: true, showIf: { key: 'q_plan_type', equals: PLAN_TYPE_FEHB }, width: 'third' },
          { key: 'on_start_date', label: 'When did the open negotiation period start?', type: 'date', required: true, max: 'today', helper: 'deadline' },
          { key: 'on_evidence', label: 'Upload evidence of the open negotiation period start date (for example, the notice or notices of open negotiation sent to the non-initiating party).',
            type: 'file', category: 'on_evidence', required: true,
            note: 'At least one file. In a batch with different open negotiation start dates, enter the first claim’s date above and upload a notice for each start date.' },
          { key: 'extension_reason', label: 'Extension justification reason:', type: 'radio', options: EXT_REASONS, required: true, showIf: LATE },
          { key: 'ext_approval', label: 'Upload a copy of the extension approval received from the Federal IDR Questions mailbox.', type: 'file',
            category: 'extension', required: true, showIf: [LATE, { key: 'extension_reason', equals: EXT_APPROVAL }] },
          { key: 'cooling_dispute_ref', label: 'Dispute Reference Number:', type: 'text', upper: true, required: true, showIf: [LATE, cooling],
            requiredMsg: 'is required: enter the dispute reference number that triggered the cooling off period', pattern: '^DISP-\\d+$',
            patternMsg: 'is not valid: use the DISP-XXXXXX format', placeholder: 'DISP-XXXXXX', width: 'half' },
          { key: 'cooling_docs', label: 'Upload a copy of the payment determination(s) that initiated the cooling off period (all of them if cooling off periods overlap).',
            type: 'file', category: 'cooling', required: true, showIf: [LATE, cooling] },
          { key: 'consent_waiver', label: 'Did the health care provider or health care facility get consent from the participant, beneficiary, or enrollee to waive surprise billing protections for these items or services?',
            type: 'radio', options: YES_NO, required: true, default: 'No', stop: { value: 'Yes', message: MSG.consent } }
        ] }]
      },
      {
        id: 'dtype', title: 'Dispute Type', step: 'Dispute Type · page 2', short: 'Dispute type',
        sections: [{ title: '', fields: [
          { key: 'dispute_type', label: 'What are you disputing today?', type: 'radio', options: DISPUTE_TYPES, notes: DISPUTE_TYPE_NOTES, required: true,
            default: DISPUTE_TYPES[1] },
          { key: 'bundled_payment', label: 'Are you disputing a bundled payment arrangement (multiple items or services billed or reimbursed under one service code)?',
            type: 'radio', options: YES_NO, required: true, showIf: { key: 'dispute_type', equals: DISPUTE_TYPES[0] } },
          { key: 'batch_qualifies', label: 'I reviewed the batching questions and this dispute qualifies', type: 'check', required: true,
            showIf: { key: 'dispute_type', equals: DISPUTE_TYPES[1] },
            note: 'The portal asks "Do your disputes qualify for the batching process?" in a pop-up. Answer Yes there only when this is ticked.' }
        ] }]
      },
      {
        id: 'init', title: 'Initiating Party Contact Information', step: 'Contact Information · initiating party · page 3', short: 'Initiating party',
        sections: [
          { title: 'Name and Address Information', fields: [
            { key: 'prov_name', label: 'Health care provider name:', type: 'combo', options: 'BillingEntity', required: true, default: '', fill: ENTITY_FILL,
              chars: 'name', width: 'half' },
            { key: 'prov_group_name', label: 'Hospital, Health Care Facility or Group Name:', type: 'text', required: true, chars: 'name', width: 'half' }
          ].concat(mainContact_('prov_', LOCATION)) },
          pocSection_('prov_p1_', 'Primary point of contact if different from above:'),
          pocSection_('prov_p2_', 'Secondary point of contact: (optional)')
        ]
      },
      {
        id: 'noninit', title: 'Non-Initiating Party Contact Information', step: 'Contact Information · non-initiating party · page 4', short: 'Non-initiating party',
        sections: [
          { title: 'Insurance provider type', fields: [
            { key: 'plan_role', label: 'Select one of the insurance provider types below:', type: 'radio', options: PLAN_ROLE, required: true, auto: 'planType' }
          ] },
          { title: 'Name and Address Information', fields: [
            { key: 'plan_name', label: 'Health Insurance Plan or Company:', type: 'combo', options: 'Payer', required: true, fill: PAYER_FILL, chars: 'name' }
          ].concat(mainContact_('plan_')) },
          pocSection_('plan_p1_', 'Primary point of contact if different from above:'),
          pocSection_('plan_p2_', 'Secondary point of contact: (optional)')
        ]
      }
    ],
    line: {
      id: 'lines', title: 'Dispute Line Items', step: 'Dispute Line Items · page 5', short: 'Line items',
      sections: [
        { title: 'New Line Item', fields: [
          { key: 'description', label: 'Enter the description of the item or service.', type: 'textarea', required: true },
          { key: 'claim_number', label: 'Claim Number:', type: 'text', required: true, pattern: '^[A-Za-z0-9]{1,40}$',
            patternMsg: 'must be up to 40 letters and digits (no spaces or symbols)', width: 'half', carry: true },
          { key: 'service_date', label: 'Date of the qualified IDR item or service:', type: 'date', required: true, min: '2022-01-01',
            before: 'on_start_date', width: 'half', carry: true },
          { key: 'qpa', label: 'Qualifying Payment Amount (QPA):', type: 'money', required: true, width: 'third' },
          { key: 'cost_sharing', label: 'Cost sharing amount allowed:', type: 'money', required: true, width: 'third' },
          { key: 'initial_payment', label: 'Initial payment amount for the item(s) and/or service(s) (if applicable):', type: 'money', width: 'third' }
        ] },
        { title: 'Item(s) or service(s) under dispute', fields: [
          { key: 'item_types', label: 'Select the item(s) or service(s) under dispute.', type: 'checkboxes', options: ITEM_TYPES, required: true,
            default: 'Emergency item(s)/service(s)', carry: true },
          { key: 'other_desc', label: 'Other: Provide description', type: 'text', required: true,
            showIf: { key: 'item_types', includes: 'Other: Provide description' } }
        ] },
        { title: 'Service codes', fields: [
          { key: 'service_code', label: 'Service Code:', type: 'combo', options: 'ServiceCode', required: true, fill: CODE_FILL, upper: true,
            pattern: '^[A-Za-z0-9]{5}$', patternMsg: 'must be exactly 5 letters or digits', width: 'quarter' },
          { key: 'modifiers', label: 'Service Code Modifier(s):', type: 'combo', options: 'Modifier', multi: true, upper: true, default: '', learnEmpty: true,
            itemPattern: '^[A-Za-z0-9]{2}$', maxItems: 4, itemMsg: 'must be up to 4 modifiers of 2 letters or digits each, like 25; 59', width: 'quarter' },
          { key: 'pos_code', label: 'Place of Service Code:', type: 'combo', options: 'PosCode', required: true, default: '23', carry: true,
            pattern: '^\\d{2}$', patternMsg: 'must be 2 digits', width: 'quarter' },
          { key: 'location', label: 'Location of Service:', type: 'fixed', value: LOCATION, required: true, width: 'quarter' }
        ] },
        { title: 'Documentation', fields: [
          { key: 'qpa_docs', label: 'Upload documentation of the claim and QPA (for example, the initial payment or notice of denial of payment, remittance form and explanation of benefits, explanation of payments).',
            type: 'file', category: 'qpa', required: true },
          { key: 'state_attest', label: 'I have reviewed the state-specific eligibility criteria regarding the IDR processes for this item or service, and attest that this item or service is eligible for the Federal IDR process.',
            type: 'check', required: true, showIf: { key: 'location', inSetting: 'complexStates' } }
        ] }
      ],
      // Copy desk order: the portal summary table's columns first.
      deskOrder: ['description', 'claim_number', 'line_type', 'service_date', 'qpa', 'location', 'service_code', 'modifiers', 'pos_code',
        'cost_sharing', 'initial_payment', 'item_types', 'other_desc', 'qpa_docs', 'state_attest']
    },
    final: {
      id: 'final', title: 'Preferred Certified IDR Entity & Conflict of Interest', step: 'Preferred Certified IDR Entity & Conflict of Interest · page 6',
      short: 'IDR entity',
      sections: [
        { title: 'Preferred Certified IDR Entity Selection', fields: [
          { key: 'idr_entity', label: 'IDRE legal business name:', type: 'combo', options: 'IdrEntity', required: true, default: '@top' }
        ] },
        { title: 'Conflict of Interest Attestation', fields: [
          { key: 'third_party_attest', label: 'Is the undersigned individual below a third-party administrator or other service provider initiating on behalf of the plan, issuer, carrier, or Health Care Provider/Health Care Facility/Provider of Air Ambulance Services?',
            type: 'radio', options: YES_NO, required: true, default: 'No' },
          { key: 'coi_attest', label: 'I (We), the undersigned initiating party (or representative of the initiating party), attest that to the best of my knowledge the preferred certified IDR entity does not have a disqualifying conflict of interest and that the item(s) and/or service(s) at issue are qualified IDR item(s) and/or service(s) within the scope of the Federal IDR process.',
            type: 'check', required: true }
        ] },
        { title: 'Additional Supporting Documentation', fields: [
          { key: 'additional_docs', label: 'Upload any additional supporting documentation that is relevant to the dispute.', type: 'file', category: 'additional' }
        ] }
      ],
      // Filled by the portal; shown as locked chips.
      auto: [{ label: 'Initiating party', from: 'prov_name' }, { label: 'Date', text: 'filled by the portal on the day the US desk submits' }],
      // The portal's Summary of Qualified Items and/or Services table. kinds: only for those dispute kinds.
      columns: [
        { key: 'description', label: 'Description of Item(s) or Service(s)' },
        { key: 'claim_number', label: 'Claim Number' },
        { key: 'line_type', label: 'Line Item Type', kinds: [KIND.bundled] },
        { key: 'service_date', label: 'Date of Item or Service', type: 'date' },
        { key: 'qpa', label: 'Qualifying Payment Amount (QPA)', type: 'money' },
        { key: 'location', label: 'Location of Service (include state)' },
        { key: 'service_code', label: 'Service Code' },
        { key: 'modifiers', label: 'Service Code Modifier(s)' },
        { key: 'pos_code', label: 'Place of Service Code(s)' }
      ]
    },
    review: { id: 'review', title: 'Review & Submit', step: 'Review & Submit · page 7', short: 'Review' }
  };
}

/** Every dispute-row field, in portal order: pages 1-4, then page 6. */
function headerFields_(s) {
  s = s || schema_();
  const out = [];
  s.pages.concat([s.final]).forEach(function (p) {
    p.sections.forEach(function (sec) { sec.fields.forEach(function (f) { out.push(f); }); });
  });
  return out;
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

// dispute_kind is derived from the dispute type (page 2); the nip_ and idre_ columns are US desk tracking.
const DISPUTE_META = ['DisputeID', 'Status', 'Team', 'Owner', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt',
  'FolderUrl', 'ConfirmationPdfUrl', 'ReadyAt', 'FiledBy', 'FiledAt', 'PortalDisputeNumber', 'PortalPdfUrl', 'ReturnReason',
  'dispute_kind', 'nip_notified_date', 'nip_notified_method', 'idre_final', 'idre_status'];
const LINE_META = ['DisputeID', 'LineNo'];
const FILE_COLS = ['DisputeID', 'Category', 'LineNo', 'Name', 'Url', 'FileId', 'UploadedBy', 'UploadedAt', 'Size'];

// ------------------------------------------------------------------ derived values

/** The portal's line-item layout for a dispute type and the bundled answer. */
function disputeKind_(type, bundled) {
  if (type === DISPUTE_TYPES[1]) return KIND.batched;
  if (type === DISPUTE_TYPES[0]) return bundled === 'Yes' ? KIND.bundled : KIND.single;
  return '';
}

/** Non-initiating party type the portal expects for a health plan type. */
function planRoleFor_(planType) {
  if (!planType) return '';
  if (planType === PLAN_TYPES[0]) return PLAN_ROLE[1];
  if (planType === PLAN_TYPE_FEHB) return PLAN_ROLE[2];
  return PLAN_ROLE[0];
}

/** Line 1 of a bundled dispute is the bundled item; later lines are components. Other kinds have no line type. */
function lineTypeFor_(kind, index) {
  if (kind !== KIND.bundled) return '';
  return index === 0 ? LINE_TYPE.bundled : LINE_TYPE.component;
}

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
    complexStates: settings.ComplexStates,
    today: todayStr_(),
    status: STATUS,
    kinds: KIND,
    gateway: GATEWAY,
    rules: { maxLines: MAX_LINES, batchCapFrom: BATCH_CAP_FROM, fileLimit: FILE_LIMIT, disputeFileLimit: DISPUTE_FILE_LIMIT,
      portalFileCategories: PORTAL_FILE_CATEGORIES, nipMethods: NIP_METHODS, idreStatus: IDRE_STATUS, extCooling: EXT_COOLING,
      disputeTypes: DISPUTE_TYPES, planTypes: PLAN_TYPES, planRoles: PLAN_ROLE, lineType: LINE_TYPE, msg: MSG }
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
        id: r.DisputeID, status: r.Status, team: r.Team, owner: r.Owner, plan: r.plan_name, kind: r.dispute_kind,
        lines: count[r.DisputeID] || 0, updatedAt: r.UpdatedAt, updatedBy: r.UpdatedBy,
        returnReason: r.ReturnReason, pdf: r.ConfirmationPdfUrl, portalNumber: r.PortalDisputeNumber, idreStatus: r.idre_status,
        initiateBy: dl ? dl.initiateBy : '', daysLeft: dl ? dl.daysLeft : '', band: dl ? dl.band : '',
        opens: dl ? dl.opens : '', extension: !!r.extension_reason
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
  const lines = linesOf_(d, allLines);
  return { dispute: d, lines: lines, files: filesOf_(id), warnings: warnings_(d, lines, all, allLines),
    deadline: businessDeadline_(d.on_start_date) };
}

// The lines of a dispute in order, each with its derived line type (bundled disputes).
function linesOf_(d, allLines) {
  return allLines
    .filter(function (l) { return l.DisputeID === d.DisputeID; })
    .sort(function (a, b) { return Number(a.LineNo) - Number(b.LineNo); })
    .map(function (l, i) { return Object.assign({}, l, { line_type: lineTypeFor_(d.dispute_kind, i) }); });
}

/** Creates or updates the dispute header (pages 1-4 and page 6). Returns { id, bundle }. */
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
    // The non-initiating party type follows the health plan type unless someone changed it by hand.
    const has = function (k) { return Object.prototype.hasOwnProperty.call(values, k); };
    if (has('q_plan_type') && !has('plan_role') && rec.q_plan_type !== old.q_plan_type &&
        (!old.plan_role || old.plan_role === planRoleFor_(old.q_plan_type))) {
      rec.plan_role = planRoleFor_(rec.q_plan_type);
    }
    rec.dispute_kind = disputeKind_(rec.dispute_type, rec.bundled_payment);
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

/** Adds or replaces a line item (page 5). Returns { lineNo, bundle }. */
function saveLine(id, lineNo, values) {
  lineNo = withLock_(function () {
    return storeLines_(id, [{ lineNo: lineNo, values: values }])[0];
  });
  return { lineNo: lineNo, bundle: getDispute(id) };
}

/**
 * Adds several line items at once (bulk paste from a spreadsheet). rows: [{ field: value }].
 * Every row is checked first; nothing is saved when one has a problem. Returns { lineNos, bundle }.
 */
function saveLines(id, rows) {
  rows = rows || [];
  if (!rows.length) throw new Error('Nothing to add.');
  const lineNos = withLock_(function () {
    const d = rowAt_(TABS.disputes, findRow_(TABS.disputes, 'DisputeID', id));
    const ctx = ruleCtx_(d);
    const problems = [];
    rows.forEach(function (values, i) {
      lineFields_().forEach(function (f) {
        if (f.type === 'file') return;
        const msg = checkField_(f, normValue_(f, values[f.key]), Object.assign({ location: LOCATION }, values), ctx);
        if (msg) problems.push('Row ' + (i + 1) + ': ' + shortLabel_(f.label) + ' ' + msg);
      });
    });
    if (problems.length) throw new Error(problems.slice(0, 10).join(' ') + (problems.length > 10 ? ' (and ' + (problems.length - 10) + ' more)' : ''));
    return storeLines_(id, rows.map(function (v) { return { lineNo: null, values: v }; }));
  });
  return { lineNos: lineNos, bundle: getDispute(id) };
}

// Inside the lock: writes line items, links the claim's QPA documents and learns. Returns the line numbers.
function storeLines_(id, items) {
  const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
  if (rowNum === -1) throw new Error('Dispute not found: ' + id);
  const d = rowAt_(TABS.disputes, rowNum);
  if (d.Status === STATUS.filed) throw new Error('This dispute is already filed and can no longer be edited.');
  const fields = lineFields_();
  const all = table_(TABS.lines).rows;
  let existing = all.filter(function (r) { return r.DisputeID === id; });
  let next = existing.reduce(function (m, r) { return Math.max(m, Number(r.LineNo) || 0); }, 0) + 1;
  const adds = [];
  const dirty = {};
  const out = [];
  const olds = [];
  items.forEach(function (it) {
    let lineNo = it.lineNo;
    if (!lineNo) {
      const count = existing.length + adds.length;
      if (count >= MAX_LINES) throw new Error('This dispute already has ' + MAX_LINES + ' line items, the maximum for one dispute.');
      if (d.dispute_kind === KIND.single && count >= 1) {
        throw new Error('A single dispute that is not bundled has exactly one line item. Change the dispute type on page 2 to add more.');
      }
      lineNo = next++;
    }
    const rec = { DisputeID: id, LineNo: Number(lineNo) };
    fields.forEach(function (f) { if (f.type !== 'file') rec[f.key] = safe_(normValue_(f, (it.values || {})[f.key])); });
    let found = -1;
    all.forEach(function (r, i) { if (r.DisputeID === id && Number(r.LineNo) === Number(lineNo)) found = i + 2; });
    olds.push(found === -1 ? {} : Object.assign({}, all[found - 2]));
    if (found === -1) adds.push(rec); else dirty[found] = rec;
    out.push({ lineNo: Number(lineNo), rec: rec, values: it.values || {} });
  });
  appendRecords_(TABS.lines, adds);
  writeRows_(TABS.lines, table_(TABS.lines).header, dirty);
  existing = existing.concat(adds);
  out.forEach(function (o, i) {
    linkClaimDocs_(id, o.lineNo, o.rec.claim_number, existing);
    learnRecord_(fields, o.values, olds[i], o.rec);
  });
  learnFlush_();
  touch_(id);
  log_(id, out.length > 1 ? 'lines:' + out.length : 'line:' + out[0].lineNo, 'saved');
  return out.map(function (o) { return o.lineNo; });
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

/** Total size in bytes of the files the US desk uploads to the portal for a dispute (a shared file counts once). */
function disputeFileBytes_(files) {
  const seen = {};
  return files.reduce(function (sum, f) {
    if (PORTAL_FILE_CATEGORIES.indexOf(f.Category) === -1 || seen[f.FileId]) return sum;
    seen[f.FileId] = true;
    return sum + (Number(f.Size) || 0);
  }, 0);
}

/**
 * Stores one uploaded file in the dispute's Drive folder. data is base64 without the data: prefix.
 * With sameClaim, a QPA document is also attached to every other line with the same claim number.
 * Returns the dispute's file list.
 */
function uploadFile(id, category, lineNo, name, mimeType, data, sameClaim) {
  if (!id) throw new Error('Save the page before uploading files.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > FILE_LIMIT) throw new Error('Files must be under 45 MB each.');
  if (PORTAL_FILE_CATEGORIES.indexOf(category) !== -1 && disputeFileBytes_(filesOf_(id)) + bytes.length > DISPUTE_FILE_LIMIT) {
    throw new Error(MSG.fileLimit);
  }
  const file = disputeFolder_(id).createFile(Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name));
  return withLock_(function () {
    const recs = [fileRecord_(id, category, lineNo, name, file, bytes.length)];
    if (sameClaim && category === 'qpa' && lineNo) {
      const lines = rows_(table_(TABS.lines)).filter(function (l) { return l.DisputeID === id; });
      const mine = lines.filter(function (l) { return Number(l.LineNo) === Number(lineNo); })[0];
      const claim = mine ? String(mine.claim_number).trim() : '';
      lines.forEach(function (l) {
        if (claim && Number(l.LineNo) !== Number(lineNo) && String(l.claim_number).trim() === claim) {
          recs.push(fileRecord_(id, category, l.LineNo, name, file, bytes.length));
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

/** Checks the dispute, saves the summary as a PDF in Drive and hands it to the US desk. */
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

/**
 * portalNumber: the portal's dispute number (DISP-...). portalPdf: the Notice of IDR Initiation PDF
 * ({ name, mimeType, data }). notice: { date: 'YYYY-MM-DD', method: Email | Mail | Fax | Portal }, when
 * the non-initiating party was sent a copy of the notice (required the same day).
 */
function markFiled(id, portalNumber, portalPdf, notice) {
  requireUsDesk_();
  portalNumber = String(portalNumber || '').trim().toUpperCase();
  if (!/^DISP-\d+$/.test(portalNumber)) throw new Error('Enter the dispute number the portal gave you, like DISP-1234567.');
  if (!portalPdf || !portalPdf.data) throw new Error('Attach the Notice of IDR Initiation PDF (Save as PDF on the portal’s confirmation page).');
  notice = notice || {};
  const nDate = String(notice.date || '').trim();
  const nMethod = String(notice.method || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nDate) || nDate > todayStr_()) {
    throw new Error('Enter the date the non-initiating party was sent a copy of the Notice of IDR Initiation (not in the future).');
  }
  if (NIP_METHODS.indexOf(nMethod) === -1) throw new Error('Pick how the notice was sent: ' + NIP_METHODS.join(', ') + '.');
  assertWindowOpen_(getDispute(id).dispute);
  const pdfUrl = uploadFile(id, 'portal_confirmation', '', portalPdf.name, portalPdf.mimeType, portalPdf.data).url;
  withLock_(function () {
    setCells_(id, { Status: STATUS.filed, FiledBy: currentUser_(), FiledAt: nowStr_(),
      PortalDisputeNumber: safe_(portalNumber), PortalPdfUrl: pdfUrl, nip_notified_date: nDate, nip_notified_method: nMethod,
      idre_status: IDRE_STATUS[0] });
    log_(id, 'status', STATUS.filed + ' ' + portalNumber + '; notice sent ' + nDate + ' by ' + nMethod);
  });
  return getDispute(id);
}

/** After filing: the certified IDR entity finally selected and how the selection went. Optional tracking, never blocking. */
function updateIdreSelection(id, idreFinal, idreStatus) {
  requireUsDesk_();
  idreStatus = String(idreStatus || '').trim();
  if (IDRE_STATUS.indexOf(idreStatus) === -1) throw new Error('Pick a status: ' + IDRE_STATUS.join(', ') + '.');
  withLock_(function () {
    const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
    if (rowNum === -1) throw new Error('Dispute not found: ' + id);
    if (rowAt_(TABS.disputes, rowNum).Status !== STATUS.filed) throw new Error('Only filed disputes have an IDR entity selection.');
    setCells_(id, { idre_final: safe_(String(idreFinal || '').trim()), idre_status: idreStatus });
    log_(id, 'idre', idreStatus + (idreFinal ? ': ' + idreFinal : ''));
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
  if (list === 'ServiceCode' && !rec.Label && data && data.description) { rec.Label = data.description; changed = true; }
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

/** Learns the combo fields (and counted strict selects) of a saved record. Count goes up only when the value is new on this record. */
function learnRecord_(fields, values, old, rec) {
  fields.forEach(function (f) {
    if (!(f.type === 'combo' || f.countUse) || !f.options || typeof f.options !== 'string' ||
        !Object.prototype.hasOwnProperty.call(values, f.key)) return;
    const now = String(rec[f.key] || '').trim();
    if (!now) return;
    let data = f.fill ? profileData_(f.fill, rec) : null;
    // A saved dispute confirms the billing entity's provider or facility answer.
    if (data && f.options === 'BillingEntity' && data.acting_as) data.acting_as_confirmed = true;
    const before = (f.multi ? splitMulti_(old[f.key]) : [String(old[f.key] || '')]).map(optionKey_);
    (f.multi ? splitMulti_(now) : [now]).forEach(function (v) {
      if (f.strict && !findOption_(f.options, v)) return; // strict lists never grow from typing
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
    if (typeof data[k] === 'boolean') { out[k] = data[k]; return; }
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
// both match "Silver Alliance, LLC". Values whose digits differ are never typos of each other
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
      const listed = typeof f.options === 'string' && f.options;
      const allowed = !listed || !hidden[f.options + '|' + optionKey_(top)];
      const inOptions = !Array.isArray(f.options) || f.options.indexOf(top) !== -1;
      const usable = n >= MIN_DEFAULT_SAMPLE && share >= st.DefaultShare && allowed && inOptions;
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
  // Filed disputes whose non-initiating party did not get the notice on the filing day.
  const filed = readTab_(TABS.disputes).filter(function (r) { return r.Status === STATUS.filed; });
  const late = filed.filter(function (r) { return noticeLate_(r); }).map(function (r) {
    return { id: r.DisputeID, filedOn: String(r.FiledAt).slice(0, 10), notified: r.nip_notified_date || '', method: r.nip_notified_method || '' };
  });
  return {
    settings: st, addedThisWeek: addedThisWeek, lists: lists,
    defaults: Object.keys(defaults).map(function (k) { return Object.assign({ key: k, label: labels[k] || k }, defaults[k]); }),
    notices: { filed: filed.length, notSameDay: late }
  };
}

// True when a filed dispute's notice to the non-initiating party was not sent on the filing day.
function noticeLate_(d) {
  if (d.Status !== STATUS.filed || !d.FiledAt) return false;
  return String(d.nip_notified_date || '') !== String(d.FiledAt).slice(0, 10);
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
  updateOption_(list, value, change);
  return adminListOptions(list);
}

// The change itself, also used by setup() for the seeded aliases.
function updateOption_(list, value, change) {
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
        delete merged.mergedInto; // the target becomes a real value again
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
}

// ------------------------------------------------------------------ deadlines
// The portal counts business days with the open negotiation start date itself as business day 1
// (both ends count; a start date that is not a business day does not count). Real filings were
// accepted on Oct 15, 2026 for a start of Sep 1, 2026 and on Oct 16 for Sep 2, which this count gives.
// Open negotiation is business days 1 to 30; the initiation window is business days 31 to 34.
// Weekends and the dates in the Holiday list (federal holidays, as observed) are not business days.
//
// b = business days from the open negotiation start date to today, both counted:
//   b < 31   the open negotiation period has not elapsed (blocking)
//   31 - 34  initiation window
//   b > 34   an extension reason is required (approval from the Federal IDR mailbox, or cooling off period)

const DAY_MS = 86400000;
const WINDOW_FIRST = 31;
const WINDOW_LAST = 34;
let HOLIDAYS_ = null;

/**
 * Returns { onEnds, opens, initiateBy, daysLeft, b, band } for an ISO start date, or null. onEnds is business day 30,
 * opens day 31 (first day of the initiation window), initiateBy day 34 (last day). daysLeft counts today; 0 or less
 * means passed. band: 'early' | 'window' | 'late'.
 */
function businessDeadline_(onStart, today) {
  const start = isoToUtc_(onStart);
  if (start === null) return null;
  const hol = holidays_();
  const onEnds = nthBusinessDay_(start, 30, hol);
  const opens = nthBusinessDay_(start, WINDOW_FIRST, hol);
  const initiateBy = nthBusinessDay_(start, WINDOW_LAST, hol);
  const now = isoToUtc_(today || todayStr_());
  let daysLeft = 0;
  if (now <= initiateBy) {
    for (let d = now; d <= initiateBy; d += DAY_MS) if (isBusinessDay_(d, hol)) daysLeft++;
  } else {
    for (let d = initiateBy + DAY_MS; d <= now && daysLeft > -400; d += DAY_MS) if (isBusinessDay_(d, hol)) daysLeft--;
  }
  const b = businessDaysBetween_(start - DAY_MS, now, hol); // both ends counted
  const band = b < WINDOW_FIRST ? 'early' : b <= WINDOW_LAST ? 'window' : 'late';
  return { onEnds: utcToIso_(onEnds), opens: utcToIso_(opens), initiateBy: utcToIso_(initiateBy), daysLeft: daysLeft, b: b, band: band };
}

/** The n-th business day counting from start (start is day 1 when it is a business day). */
function nthBusinessDay_(start, n, hol) {
  let d = start;
  let count = isBusinessDay_(d, hol) ? 1 : 0;
  while (count < n) {
    d += DAY_MS;
    if (isBusinessDay_(d, hol)) count++;
  }
  return d;
}

/** Business days d with from < d <= to (0 when to is not after from). */
function businessDaysBetween_(from, to, hol) {
  let n = 0;
  for (let d = from + DAY_MS; d <= to; d += DAY_MS) if (isBusinessDay_(d, hol)) n++;
  return n;
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

/** What the rules need besides the record itself: today, the Complex State list and the dispute (for line checks). */
function ruleCtx_(dispute, today) {
  return { today: today || todayStr_(), complexStates: getSettings_().ComplexStates, dispute: dispute || {} };
}

/**
 * A field condition: { key, equals } | { key, includes } | { key, filled: true } | { key, late: true }
 * (open negotiation started more than 34 business days ago) | { key, inSetting: 'complexStates' }.
 * An array means all of them.
 */
function condMet_(c, rec, ctx) {
  if (!c) return true;
  if (Array.isArray(c)) return c.every(function (x) { return condMet_(x, rec, ctx); });
  const v = String(rec[c.key] == null ? '' : rec[c.key]).trim();
  if (c.late) { const dl = businessDeadline_(v, ctx && ctx.today); return !!dl && dl.band === 'late'; }
  if (c.filled) return v !== '' && !isPlaceholder_(v);
  if (c.equals != null) return v === c.equals;
  if (c.includes != null) return v.indexOf(c.includes) !== -1;
  if (c.inSetting) return ((ctx && ctx[c.inSetting]) || []).indexOf(v.toUpperCase()) !== -1;
  return true;
}

function fieldShown_(f, rec, ctx) {
  return !f.showIf || condMet_(f.showIf, rec, ctx);
}

function fieldRequired_(f, rec, ctx) {
  if (!fieldShown_(f, rec, ctx)) return false;
  if (f.required) return true;
  if (f.requiredIf && condMet_(f.requiredIf, rec, ctx)) return true;
  if (f.requiredUnless) {
    const o = String(rec[f.requiredUnless] == null ? '' : rec[f.requiredUnless]).trim();
    return !o || isPlaceholder_(o);
  }
  return false;
}

// The portal's allowed characters. Names: letters (accented too), digits, spaces and , - ’ ' . & ~.
// Addresses and cities also allow # / \ :.
const CHAR_HELP = {
  name: 'letters, digits, spaces and , - ’ \' . & ~',
  address: 'letters, digits, spaces and # , - ’ \' . & ~ / \\ :'
};

function charRe_(kind) {
  const base = 'A-Za-z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u0300-\\u036F\\u1E00-\\u1EFF ,\\-\\u2019\'.&~';
  return new RegExp('[^' + base + (kind === 'address' ? '#/\\\\:' : '') + ']', 'g');
}

/** The characters of v the portal rejects for this kind of field, each once. */
function badChars_(kind, v) {
  const out = [];
  (String(v == null ? '' : v).match(charRe_(kind)) || []).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
  return out;
}

/** v without the rejected characters (what the Fix button gives). */
function fixChars_(kind, v) {
  return String(v == null ? '' : v).replace(charRe_(kind), '').replace(/\s+/g, ' ').trim();
}

/** Modifiers as the portal shows them: up to 4 two-character codes, "; "-separated. */
function normModifiers_(v) {
  return splitMulti_(v).map(function (m) { return m.toUpperCase(); }).join('; ');
}

function validate_(id) {
  const full = getDispute(id);
  const d = full.dispute;
  const s = schema_();
  const ctx = ruleCtx_(d);
  const problems = [];
  const files = full.files;
  const hasFile = function (cat, line) {
    return files.some(function (f) { return f.Category === cat && (!line || Number(f.LineNo) === Number(line)); });
  };

  s.pages.concat([s.final]).forEach(function (p) {
    p.sections.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'file') {
          if (fieldRequired_(f, d, ctx) && !hasFile(f.category)) problems.push(p.step + ': ' + shortLabel_(f.label) + ' is missing');
          return;
        }
        const msg = checkField_(f, d[f.key], d, ctx);
        if (msg) problems.push(p.step + ': ' + shortLabel_(f.label) + ' ' + msg);
        if (f.stop && String(d[f.key]) === f.stop.value) problems.push(f.stop.message + ' ("' + shortLabel_(f.label) + '" is ' + f.stop.value + ').');
      });
    });
  });

  timingProblems_(d, ctx.today).forEach(function (p) { problems.push(p); });
  lineRules_(d, full.lines).forEach(function (p) { problems.push(s.line.step + ': ' + p); });
  full.lines.forEach(function (l) {
    s.line.sections.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'file') {
          if (fieldRequired_(f, l, ctx) && !hasFile('qpa', l.LineNo)) problems.push('Line ' + l.LineNo + ': QPA documentation is missing');
          return;
        }
        const msg = checkField_(f, l[f.key], l, ctx);
        if (msg) problems.push('Line ' + l.LineNo + ': ' + shortLabel_(f.label) + ' ' + msg);
      });
    });
  });
  const t = readTables_([TABS.disputes, TABS.lines]);
  duplicateLines_(d, full.lines, rows_(t[0]), rows_(t[1])).blocking.forEach(function (p) { problems.push(p); });
  if (disputeFileBytes_(files) > DISPUTE_FILE_LIMIT) problems.push(MSG.fileLimit);
  return problems;
}

/**
 * Open negotiation timing problems that block Ready. Before business day 31 Lebanon may prepare ahead: that is
 * only a notice (see warnings_), and the US desk cannot file until the window opens (see assertWindowOpen_).
 */
function timingProblems_(d, today) {
  const dl = businessDeadline_(d.on_start_date, today);
  if (!dl) return [];
  if (dl.band === 'late' && !String(d.extension_reason || '').trim()) {
    return ['Deadline passed: the initiation window was ' + fmt_(dl.opens, 'date') + ' to ' + fmt_(dl.initiateBy, 'date') +
      '. Pick an extension reason on page 1 if one applies.'];
  }
  return [];
}

/** True when the cooling off period exception applies (late, with the cooling off extension reason). */
function coolingApplies_(d, today) {
  return d.extension_reason === EXT_COOLING && condMet_(LATE, d, { today: today });
}

/** Line count and date-of-service rules of the dispute kind. Returns blocking problems. */
function lineRules_(d, lines, today) {
  const out = [];
  const n = lines.length;
  const kind = d.dispute_kind;
  if (!n) out.push('Add at least one line item.');
  if (kind === KIND.single && n > 1) out.push('A single dispute that is not bundled has exactly 1 line item (this one has ' + n + '). Change the dispute type on page 2, or delete lines.');
  if (kind === KIND.batched && n === 1) out.push(MSG.batchMin);
  if (n > MAX_LINES) out.push(kind === KIND.batched && String(d.on_start_date) >= BATCH_CAP_FROM ? MSG.batchMax : 'A dispute can have at most ' + MAX_LINES + ' line items.');
  if (kind === KIND.batched && n > 1 && !coolingApplies_(d, today)) {
    const spread = dosSpread_(lines);
    if (spread && spread.days > 30) {
      out.push('In a batched dispute, all dates of service must be within 30 business days of each other (unless a cooling off period applies). ' +
        'Earliest ' + fmt_(spread.first, 'date') + ', latest ' + fmt_(spread.last, 'date') + ': ' + spread.days + ' business days apart.');
    }
  }
  return out;
}

/** { first, last, days }: the earliest and latest date of service and the business days between them, or null. */
function dosSpread_(lines) {
  const dates = lines.map(function (l) { return String(l.service_date || ''); }).filter(function (v) { return isoToUtc_(v) !== null; }).sort();
  if (dates.length < 2) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  return { first: first, last: last, days: businessDaysBetween_(isoToUtc_(first), isoToUtc_(last), holidays_()) };
}

// The portal's duplicate key: claim number, date of service, service code and modifier(s).
function lineKey_(l) {
  return [String(l.claim_number || '').trim().toUpperCase(), String(l.service_date || '').trim(),
    String(l.service_code || '').trim().toUpperCase(), normModifiers_(l.modifiers)].join('|');
}

/**
 * The portal refuses a line that repeats the claim number, date of service, service code and modifiers of a line in
 * an earlier dispute (here: one that is Ready or Filed), unless this dispute has an extension, or of another line of
 * the same dispute. Returns { blocking: [], notes: [] }; notes are repeats allowed because of the extension.
 */
function duplicateLines_(d, lines, allDisputes, allLines) {
  const blocking = [];
  const notes = [];
  const seen = {};
  lines.forEach(function (l) {
    if (!String(l.claim_number || '').trim()) return;
    const k = lineKey_(l);
    if (seen[k]) blocking.push('Line ' + l.LineNo + ' repeats line ' + seen[k] + ' (same claim number, date of service, service code and modifiers).');
    else seen[k] = l.LineNo;
  });
  const status = {};
  allDisputes.forEach(function (r) { status[r.DisputeID] = r.Status; });
  const hits = {};
  allLines.forEach(function (o) {
    const st = status[o.DisputeID];
    if (o.DisputeID === d.DisputeID || (st !== STATUS.filed && st !== STATUS.ready)) return;
    const n = seen[lineKey_(o)];
    if (!n) return;
    const label = o.DisputeID + ' (' + st + ')';
    hits[n] = hits[n] || [];
    if (hits[n].indexOf(label) === -1) hits[n].push(label);
  });
  const extension = !!String(d.extension_reason || '').trim();
  Object.keys(hits).sort(function (a, b) { return a - b; }).forEach(function (n) {
    const msg = 'Line ' + n + ' has the same claim number, date of service, service code and modifiers as a line in ' + hits[n].join(', ') + '.';
    if (extension) notes.push(msg + ' Allowed only because this dispute has an extension reason: check that it applies.');
    else blocking.push(msg + ' The portal does not accept duplicate line items.');
  });
  return { blocking: blocking, notes: notes };
}

/** Checks that do not block Ready: amounts, claims already in other disputes, allowed repeats, the notice to the other party. */
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
  duplicateLines_(d, lines, allDisputes, allLines).notes.forEach(function (n) { out.push(n); });

  const dl = d.Status === STATUS.filed ? null : businessDeadline_(d.on_start_date);
  if (dl && dl.band === 'early') out.push(windowNotice_(dl));

  if (noticeLate_(d)) {
    out.push(d.nip_notified_date
      ? 'The non-initiating party was sent the Notice of IDR Initiation on ' + fmt_(d.nip_notified_date, 'date') + ', not on the filing day (' +
        fmt_(String(d.FiledAt).slice(0, 10), 'date') + '). It must be sent the same day.'
      : 'No date recorded for sending the Notice of IDR Initiation to the non-initiating party.');
  }
  return out;
}

function windowNotice_(dl) {
  return 'Filing window opens ' + fmt_(dl.opens, 'date') + ' (open negotiation business day ' + dl.b + ' today). The US desk can file from ' +
    fmt_(dl.opens, 'date') + ' to ' + fmt_(dl.initiateBy, 'date') + '.';
}

/** US desk actions need the initiation window open (business day 31 or later): the portal refuses earlier. */
function assertWindowOpen_(d) {
  const dl = businessDeadline_(d.on_start_date);
  if (dl && dl.band === 'early') throw new Error(MSG.onEarly + ' Filing window opens ' + fmt_(dl.opens, 'date') + '.');
}

/** Problem with one value, or ''. record: the dispute or line it belongs to; ctx: see ruleCtx_. */
function checkField_(f, value, record, ctx) {
  record = record || {};
  if (!fieldShown_(f, record, ctx) || f.type === 'fixed') return '';
  let v = value == null ? '' : String(value).trim();
  const required = fieldRequired_(f, record, ctx);
  const missing = f.requiredMsg || 'is required';
  if (v && isPlaceholder_(v) && f.type !== 'checkboxes') return required ? missing + ' ("' + v + '" is not accepted)' : '';
  if (!v) return required ? missing : '';
  if (f.type === 'check') return v === 'Yes' || !required ? '' : 'must be ticked';
  if (f.digits) v = v.replace(/[\s-]/g, '');
  if (f.upper) v = v.toUpperCase();
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMsg || 'is not in the right format';
  if (Array.isArray(f.options) && (f.type === 'radio' || f.type === 'select') && f.options.indexOf(v) === -1) return 'is not one of the portal’s options';
  if (f.strict && typeof f.options === 'string' && (options_()[f.options] || []).indexOf(v) === -1) return 'is not one of the portal’s options';
  if (f.chars) {
    const bad = badChars_(f.chars, v);
    if (bad.length) return 'has characters the portal does not accept (' + bad.join(' ') + '). Allowed: ' + CHAR_HELP[f.chars] + '.';
  }
  if (f.multi && f.itemPattern) {
    const items = splitMulti_(v);
    const re = new RegExp(f.itemPattern);
    if (items.length > (f.maxItems || 99) || items.some(function (x) { return !re.test(x); })) return f.itemMsg || 'is not in the right format';
  }
  if (f.type === 'zip' && !/^\d{5}(-\d{4})?$/.test(normZip_(v))) return 'must be 5 or 9 digits, like 76132 or 76132-1234';
  if (f.type === 'phone' && !/^\(\d{3}\) \d{3}-\d{4}$/.test(normPhone_(v))) return 'must be 10 digits, like (817) 566-1232';
  if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'is not a valid email';
  if (f.type === 'money' && !/^\d+(\.\d{1,2})?$/.test(v)) return 'must be an amount like 154.00';
  if (f.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'must be a date';
    if (f.min && v < f.min) return 'must be on or after ' + f.min;
    if (f.max === 'today' && v > ((ctx && ctx.today) || todayStr_())) return 'cannot be in the future';
    const lim = f.before && ctx && ctx.dispute ? String(ctx.dispute[f.before] || '') : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(lim) && v >= lim) return 'must be before the open negotiation start date (' + fmt_(lim, 'date') + ')';
  }
  return '';
}

/** The stored form of a typed value: phones as (817) 566-1232, ZIP+4 with a hyphen, Tax ID and NPI as digits, modifiers "25; 59". */
function normValue_(f, v) {
  if (f.type === 'fixed') return f.value;
  if (v == null) return '';
  if (Array.isArray(v)) return v;
  let s = String(v).trim();
  if (f.type === 'phone') s = normPhone_(s);
  if (f.type === 'zip') s = normZip_(s);
  if (f.type === 'money') s = s.replace(/[$,\s]/g, '');
  if (f.type === 'check') s = /^(yes|true|on|1)$/i.test(s) ? 'Yes' : '';
  if (f.digits) s = s.replace(/[\s-]/g, '');
  if (f.multi) s = normModifiers_(s);
  if (f.upper) s = s.toUpperCase();
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
  const kind = full.dispute.dispute_kind;
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
    columns: schema_().final.columns.filter(function (c) { return !c.kinds || c.kinds.indexOf(kind) !== -1; }),
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
  const out = { nip_notified_date: 'date' };
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

function fileRecord_(id, category, lineNo, name, file, size) {
  return { DisputeID: id, Category: category, LineNo: lineNo || '', Name: safe_(name), Url: file.getUrl(),
    FileId: file.getId(), UploadedBy: currentUser_(), UploadedAt: nowStr_(), Size: size || '' };
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
// clears the cache (see learnFlush_ and onEdit). With about 600 seeded rows, the cache keeps
// compact rows ([List, Value, Label, Data, Count, LastUsed, Source, Status, AddedAt]) to stay
// under the 100 KB cache limit.
let OPTION_ROWS_ = null;
let OPTIONS_ = null;
const OPTION_CACHE_COLS = ['List', 'Value', 'Label', 'Data', 'Count', 'LastUsed', 'Source', 'Status', 'AddedAt'];

/** Every Options row, hidden ones included, with Count as a number. */
function optionRows_() {
  if (OPTION_ROWS_) return OPTION_ROWS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('options');
  if (hit) {
    const parsed = JSON.parse(hit);
    return (OPTION_ROWS_ = parsed.map(function (r) {
      if (!Array.isArray(r)) return r;
      const o = {};
      OPTION_CACHE_COLS.forEach(function (c, i) { o[c] = r[i] == null ? '' : r[i]; });
      o.Count = Number(o.Count) || 0;
      o.Source = o.Source === 'l' ? 'learned' : o.Source === 's' ? 'seed' : o.Source;
      o.Status = o.Status === 'H' ? HIDDEN : ACTIVE;
      return o;
    }));
  }
  const out = readTab_(TABS.options).filter(function (r) { return r.List && r.Value !== ''; }).map(function (r) {
    return { List: String(r.List), Value: String(r.Value), Label: r.Label || '', Data: r.Data || '', Count: Number(r.Count) || 0,
      LastUsed: r.LastUsed || '', Source: r.Source || 'seed', Status: r.Status === HIDDEN ? HIDDEN : ACTIVE, AddedAt: r.AddedAt || '' };
  });
  const compact = out.map(function (r) {
    const row = [r.List, r.Value, r.Label, r.Data, r.Count, r.LastUsed, r.Source === 'learned' ? 'l' : r.Source === 'seed' ? 's' : r.Source,
      r.Status === HIDDEN ? 'H' : 'A', r.AddedAt];
    while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === 0)) row.pop();
    return row;
  });
  try { cache.put('options', JSON.stringify(compact), 600); } catch (e) { /* too large to cache: read each time */ }
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

/**
 * The Settings tab with defaults filled in: { LearningMode: 'On' | 'Off', DefaultWindow: number, DefaultShare: 0-1,
 * ComplexStates: ['TX', ...] }.
 */
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
  out.ComplexStates = Array.isArray(out.ComplexStates) ? out.ComplexStates
    : String(out.ComplexStates || '').split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(String);
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
  ensure(TABS.files, FILE_COLS);
  ensure(TABS.log, ['Timestamp', 'User', 'DisputeID', 'Event', 'Details']);
  migrateOptions_(style);
  ensure(TABS.options, OPTION_COLS);
  ensure(TABS.settings, ['Key', 'Value', 'Note']);

  // Send queued SpreadsheetApp changes before anything reads the tabs through the Sheets API.
  SpreadsheetApp.flush();
  TABLES_ = {};
  clearOptionsCache_();
  const changed = migrateOptionsV3_();
  const added = seedOptions_();
  const aliased = applySeedAliases_();
  seedSettings_();
  const migrated = migrateRecordsV3_();
  clearOptionsCache_();
  CacheService.getScriptCache().removeAll(['settings', 'defaults']);
  rootFolder_();
  Logger.log('Options: ' + added + ' seed value(s) added, ' + changed + ' updated for v3, ' + aliased + ' alias(es) applied.');
  Logger.log('Saved records updated for v3: ' + migrated.disputes + ' dispute(s), ' + migrated.lines + ' line item(s).');
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
    return r[iList] !== '' && r[iValue] !== '' && !(r[iList] === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(String(r[iValue])) !== -1 &&
      PLAN_TYPES.indexOf(String(r[iValue])) === -1);
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

// v2 seed values renamed in place in v3 (same row, so counts and profiles stay).
const SEED_RENAMES = [
  ['BillingEntity', 'SILVER ALLIANCE LLC', 'Silver Alliance, LLC'],
  ['BillingEntity', 'CAPITAL HEALTH PLLC', 'Capital Health, PLLC']
];

/**
 * Upgrade of the v2 lists: renames the two billing entities to their legal names, hides Health Plan
 * Types that are not one of the portal's 7 options, and drops the unused seed code 99281. Returns rows changed.
 */
function migrateOptionsV3_() {
  const t = table_(TABS.options);
  const dirty = {};
  const exact = {};
  t.rows.forEach(function (r) { exact[r.List + '|' + r.Value] = true; });
  t.rows.forEach(function (r, i) {
    if (!r.List) return;
    const rec = Object.assign({}, r);
    let ch = false;
    SEED_RENAMES.forEach(function (x) {
      if (r.List === x[0] && r.Value === x[1] && !exact[x[0] + '|' + x[2]]) {
        rec.Value = x[2];
        rec.Data = JSON.stringify(Object.assign(parseData_(r.Data), { acting_as_confirmed: true }));
        ch = true;
      }
    });
    if (r.List === 'HealthPlanType' && PLAN_TYPES.indexOf(r.Value) === -1 && r.Status !== HIDDEN) { rec.Status = HIDDEN; ch = true; }
    if (ch) dirty[i + 2] = rec;
  });
  writeRows_(TABS.options, t.header, dirty);
  const dropped = deleteWhere_(TABS.options, function (r) {
    return (r.List === 'ServiceCode' && r.Value === '99281' && r.Source === 'seed' && !(Number(r.Count) > 0)) ||
      (r.List === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(r.Value) !== -1 && PLAN_TYPES.indexOf(r.Value) === -1 && !(Number(r.Count) > 0));
  });
  return Object.keys(dirty).length + dropped;
}

/** Adds the seed values that are missing (matched ignoring case and punctuation). Returns how many were added. */
function seedOptions_() {
  const rows = readTab_(TABS.options);
  const have = {};
  const exact = {};
  const lists = {};
  rows.forEach(function (r) {
    exact[r.List + '|' + r.Value] = true;
    lists[r.List] = true;
    if (!parseData_(r.Data).mergedInto) have[r.List + '|' + optionKey_(r.Value)] = true;
  });
  const me = Session.getActiveUser().getEmail();
  const seeds = seedRows_();
  if (me && !lists.UsDeskUser) seeds.push(['UsDeskUser', me, '', null, 0]);
  if (me && !lists.Admin) seeds.push(['Admin', me, '', null, 0]);
  const add = [];
  seeds.forEach(function (s) {
    const alias = !!(s[3] && s[3].mergedInto);
    // An alias row ("Health Now" for "HealthNow") is matched on its exact spelling.
    if (alias ? exact[s[0] + '|' + s[1]] : have[s[0] + '|' + optionKey_(s[1])]) return;
    if (alias) exact[s[0] + '|' + s[1]] = true; else have[s[0] + '|' + optionKey_(s[1])] = true;
    add.push(optionRecord_(s[0], s[1], { label: s[2], data: s[3], count: s[4], source: 'seed', status: s[5] || ACTIVE, addedBy: 'setup' }));
  });
  appendRecords_(TABS.options, add);
  return add.length;
}

// Aliases of the seed: typing the old name counts toward the new one (see learn_).
const SEED_ALIASES = [
  ['Payer', 'United Healthcare', 'UHC'],
  ['Payer', 'BLUECROSS BLUESHIELD', 'BCBS'],
  ['Payer', 'Health Now', 'HealthNow']
];

/** A v2 row that is now an alias (United Healthcare, BLUECROSS BLUESHIELD) is merged into the new value. Returns how many. */
function applySeedAliases_() {
  let n = 0;
  SEED_ALIASES.forEach(function (a) {
    TABLES_ = {};
    const row = readTab_(TABS.options).filter(function (r) { return r.List === a[0] && r.Value === a[1]; })[0];
    if (!row || parseData_(row.Data).mergedInto === a[2]) return;
    updateOption_(a[0], a[1], { mergeInto: a[2] });
    n++;
  });
  TABLES_ = {};
  return n;
}

function seedSettings_() {
  const have = {};
  readTab_(TABS.settings).forEach(function (r) { have[r.Key] = true; });
  const notes = {
    LearningMode: 'On: new values typed by users are active at once (training). Off: they are added as Hidden until an admin activates them.',
    DefaultWindow: 'How many recent saved records the learned defaults look at.',
    DefaultShare: 'Share of those records (0 to 1) one value needs to become the default.',
    ComplexStates: 'States on CMS\'s Complex State list, comma separated (like TX, NM). Lines with a location in the list need the state-specific eligibility attestation. Empty until confirmed.'
  };
  const add = Object.keys(SETTING_DEFAULTS).filter(function (k) { return !have[k]; })
    .map(function (k) { return { Key: k, Value: String(SETTING_DEFAULTS[k]), Note: notes[k] }; });
  appendRecords_(TABS.settings, add);
}

// v2 values of saved records mapped to v3.
const OLD_KIND_MAP = { 'Single dispute': [DISPUTE_TYPES[0], 'No'], 'A batched dispute': [DISPUTE_TYPES[1], ''],
  'A bundled dispute': [DISPUTE_TYPES[0], 'Yes'] };
const OLD_ROLE_MAP = { 'Group Health Plan': PLAN_ROLE[0], 'Federal Employees Health Benefits (FEHB) carrier': PLAN_ROLE[2] };

/**
 * Upgrade of saved disputes and lines (idempotent): the v2 dispute_kind becomes dispute_type, bundled_payment and the
 * derived kind; the v2 plan roles get the portal's spelling; I'm a(n) comes from the v2 designation when empty;
 * modifiers become "; "-separated. Returns { disputes, lines } changed.
 */
function migrateRecordsV3_() {
  TABLES_ = {};
  const t = table_(TABS.disputes);
  const dirty = {};
  t.rows.forEach(function (r, i) {
    if (!r.DisputeID) return;
    const rec = Object.assign({}, r);
    const m = OLD_KIND_MAP[r.dispute_kind];
    if (m && !r.dispute_type) {
      rec.dispute_type = m[0];
      if (m[1]) rec.bundled_payment = m[1];
    }
    if (rec.dispute_type) rec.dispute_kind = disputeKind_(rec.dispute_type, rec.bundled_payment);
    if (OLD_ROLE_MAP[r.plan_role]) rec.plan_role = OLD_ROLE_MAP[r.plan_role];
    if (!r.q_acting_as && ACTING_AS.indexOf(r.prov_designation) !== -1) rec.q_acting_as = r.prov_designation;
    if (t.header.some(function (h) { return String(rec[h]) !== String(r[h]); })) dirty[i + 2] = rec;
  });
  writeRows_(TABS.disputes, t.header, dirty);

  const lt = table_(TABS.lines);
  const ldirty = {};
  lt.rows.forEach(function (r, i) {
    if (!r.DisputeID || !r.modifiers) return;
    const m = normModifiers_(r.modifiers);
    if (m !== r.modifiers) ldirty[i + 2] = Object.assign({}, r, { modifiers: m });
  });
  writeRows_(TABS.lines, lt.header, ldirty);
  return { disputes: Object.keys(dirty).length, lines: Object.keys(ldirty).length };
}

// ------------------------------------------------------------------ seed lists
// Business data only: our billing entities (legal names as given by the business), the
// non-initiating parties we dispute with, IDR entities and service codes. Counts are how often
// a value appeared on the Notices of IDR Initiation seen so far. No claim numbers, dates of
// service or account numbers are kept here.

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'];

// Our billing entities, exact legal spelling (not corrected; see the README for names to confirm).
const SEED_ENTITIES = ['Jade Medical, PLLC', 'Deerfield plains, LLC', 'CareMed, PLLC', 'Sycamore Rush, LLC', 'WRFER University, LLC',
  'Windview First, PLLC', 'Capital Health, PLLC', 'Silver Alliance, LLC', 'Trans Oakley, LLC', 'Eastern Elm, PLLC', 'Lakewood Green, LLC',
  'Silver choice, PLLC', 'Greenwood South, LLC', 'Aspen Willow, PLLC', 'RSER Benbrook, LLC', 'TotalCare ER Benbrook, PLLC',
  'Cedar Physcians, PLLC', 'WFRER Denton, LLC', 'Sun Choice, PLLC', 'WFRER Cooper, LLC', 'Greenview Physicians, PLLC',
  'Hillside Alliance, LLC', 'Everwell Medical, PLLC', 'Gracious Health, LLC'];

// Non-initiating parties (plans, issuers, TPAs), as given by the business.
const SEED_PAYERS = [
  '90 Degree Benefits', 'ABA', 'Aetna', 'Allegiance', 'Allegiance Benefi Plan Management, Inc', 'Allied Benefit Systems, Inc.',
  'Allstate', 'Ambetter-Superior HealthPlan', 'Angle Health', 'Ameriben', 'APWU Health Plan', 'Assured Benefits Administrator',
  'AULTCARE', 'Auxiant', 'Baylor Scott & White', 'BCBS', 'Benefit & Risk Management Services- BRMS', 'BENEFITS HEALTHSMART',
  'Boon Chapman', 'Bright HealthCare', 'Cantex Inc', 'CareFactor', 'Centivo', 'CGS Health', 'Chesterfield Resources Inc.',
  'Cigna', 'CITY OF FORT WORTH', 'Coeur Plan', 'Concord Hospital Entreprises', 'Connected Care',
  'COOK CHILDREN\'S HEALTH CARE SYSTEM', 'Dean Health Plan', 'EMI Health', 'Employers Health Network',
  'Enterprise Group Planning, INC', 'EVHC', 'First Health Network', 'Fringe Benefit Group',
  'GEHA (Government Employees Health Association, Inc.)', 'Golden Rule', 'GPA', 'Gravie Administrative Services',
  'Group Management Services', 'Health Choice', 'HEALTH COMP', 'Health EZ', 'Health New England', 'Health Now',
  'Health Partners', 'Health Plans Inc.', 'Healthcare Highways', 'Healthgram', 'healthnet', 'HealthNow', 'HealthScope Benefits',
  'Healthsmart', 'Humana', 'IBEW-NECA Southwestern Health & Benefit Fund', 'IDA', 'Imagine 360', 'Imagine Health', 'JP Farley',
  'Insurance Management Services', 'Insurance Administrator of America', 'Insurance Medical Services', 'Kaiser Permanente',
  'LaSalle Management', 'LIFEX', 'Lucent Health', 'Luminare Health', 'MARPAI', 'Medica', 'Medica Insurance Company',
  'Medical Mutual', 'Meritain Health', 'Minnesota Laborers Health & Welfare Fund', 'MN Teamsters Construction DIVHW Fund',
  'Moda Health', 'NALC Health Benefit Plan', 'Orchestrate', 'Phia Group', 'Personify Health West', 'Point C', 'Priority Health',
  'Professional Benefit Administators', 'Progressive', 'Providence administrative Services', 'Providence Health Plan',
  'Quantum Health', 'Reflect Health', 'S&S HealthCare Strategies', 'Sage', 'SAMBA', 'Sana Benefits',
  'Seafarers Health and Benefits Plan', 'Select Health', 'Sharp Health Plan', 'SHL Solutions', 'Simplan', 'SISCO',
  'Star Marketing and Admin, Inc.', 'Texas Iron Workers Health Benefit Fund', 'The Health Plan', 'The Loomis Company',
  'Total Affiliates Health & Welfare Plan', 'TrustMark', 'UFCW', 'UFCW Med 1000', 'UHC', 'UHC Shared Services', 'UHC Surest',
  'UHSS', 'UMR', 'Unified Group Services', 'UNITED AGRICULTURAL BENEFIT TRUST', 'United Benefit Fund', 'UPMC', 'US Benefits',
  'Vitori Health', 'WebTPA', 'YUZU Health', 'ZELIS', 'Friday Health Plan', 'Unite Here Health'
];

// Service codes we bill (value = code). Descriptions are seeded only for the codes seen on the notices; the others are learned.
const SEED_CODES = [
  '99285 99284 99291 70450 74176 0202U 71046 71100 99283 27780 99000 36410 76705 96372 74177 96365 96366 96368 96375 72125',
  '73030 76870 A4670 94761 96374 93005 E0445 96361 99239 G0378 73552 71250 Q9967 94760 90471 74022 99282 94640 73110 72128',
  '93971 70486 87507 L3809 A4649 12013 73130 A4467 76830 74019 73610 10120 73630 84484 82553 83874 85379 85025 29584 80051',
  '82550 82565 82947 84520 A4770 A9150 70490 A4657 J7613 A4616 E0441 86769 87428 A6453 E1399 A4930 73562 73080 A6449 A4223',
  '82247 82040 81003 84075 84450 82977 84460 82150 84155 36000 29125 87880 J8499 12001 73140 96360 76882 L4361 72100 A6203',
  '96523 80053 74018 81025 80305 72193 87040 87077 87076 93010 G0328 82270 J1100 36415 80076 29505 L1830 73700 99001 87081',
  'A4452 87184 87591 87491 87086 10061 83605 82803 73090 29260 86308 L4360 76856 93975 76937 71260 A4216 G9315 J0500 96367',
  '99234 12011 71045 70491 J7512 69200 69210 J7799 J7620 J7699 Q0144 J0696 64400 A4245 A4248 90715 E0114 J1885 A6413 A4215',
  'A4566 A9273 97010 A6454 A6403 83880 J0131 96376 76536 93040 72072 36416 J8540 A4305 S1015 J7030 J2405 J1200 72131 97116',
  '73590 A4559 J2550 J1836 J2270 J7120 S0164 72040 J2919 S0028 70360 82948 J3010 J3490 J1170 87205 12002 L3908 J7050 90714',
  'A4550 A6250 A4209 A4246 87661 87563 87798 A9270 J2543 A4332 84702 76801 86901 76817 86900 J0171 L3260 76770 29540 29515',
  'S0119 J0295 29581 87070 87075 A4217 A6446 A6219 Q4018 29105 73010 29130 A4364 A6407 A6252 71275 76775 G8598 86803 99292',
  '81513 87481 J0706 J2470 J2060 A4253 86695 86696 86592 94664 84439 73660 84436 84443 84479 A4615 A7015 J1650 J0736 73620',
  'A4244 94762 J7999 64450 11740 87529 87265 87580 87420 99235 86677 93976 29280 J3480 83735 80048 87631 87635 85045 J2490',
  '12004 J7510 93970 93041 A6222 85610 J0744 10060 73200 70496 70498 23650 74178 28190 29550 80320 12032 99222 76857 86735',
  '73120 93931 11760 73502 72192 95992 12052 80143 87181 A4316 J8498 16020 86140 85652 71101 76641 21480 12014 A6251 A6196',
  'J1308 87506 A4301 74175 73100 25605 99152 99153 75989 30300 73070 24600 A6457 10021 29240 73060 Q9963 J1815 J1010 30901',
  'J2930 Q4049 82105 82378 86304 82747 87389 86708 86706 87340 86704 83036 J0616 76700 84156 82570 99238 20610 84550 70110',
  '70480 73600 51702 43752 12051 65222 84481 76805 70487 11730 70488 11750 16025'
].join(' ').split(' ');

// The 29 codes seen on the notices: [description, times seen].
const OBSERVED_CODES = {
  '99283': ['EMERGENCY ROOM SERVICE', 1], '99284': ['EMERGENCY ROOM SERVICE', 3], '94761': ['MEASURE BLOOD OXYGEN LEVEL', 2],
  '12001': ['REPAIR- TRUNK/SCALP/NECK/AXIL/LIMBS <2.5', 1], 'A4670': ['AUTOMATIC BLOOD PRESSURE MONITOR', 2],
  'A6413': ['ADHESIVE BANDAGE, FIRST-AID', 2], 'A4930': ['GLOVES STERILE PER PAIR', 1], 'A4248': ['CHLORHEXIDINE ANTISEPT', 1],
  '82150': ['ASSAY OF AMYLASE', 1], '81003': ['URINALYSIS, AUTO, W/O SCOPE', 1], '81025': ['URINE PREGNANCY TEST', 2],
  '85025': ['COMPLETE CBC W/AUTO DIFF WBC', 1], '80051': ['ELECTROLYTE PANEL', 1], '82550': ['ASSAY OF CK (CPK)', 1],
  '82565': ['ASSAY OF CREATININE', 1], '82947': ['ASSAY, GLUCOSE, BLOOD QUANT', 1], '84520': ['ASSAY OF UREA NITROGEN', 1],
  '80076': ['HEPATIC FUNCTION PANEL', 1], '10061': ['DRAINAGE OF SKIN ABSCESS', 1], 'J3490': ['PHARMACY', 1],
  'J0696': ['Injection, ceftriaxone sodium, per 250 mg', 1], '96372': ['THERAPY/PROPHYLAXIS/DIAGNOSIS INJECTION, SC/IM', 1],
  '72125': ['CT NECK SPINE W/O DYE', 1], '70450': ['CT HEAD/BRAIN W/O DYE', 1], '72128': ['Computed tomography, thoracic spine', 1],
  'J1885': ['Injection, ketorolac tromethamine, per 15 mg', 1], 'A4215': ['NEEDLES ONLY STERILE ANY SIZE EACH', 1],
  'A4657': ['SYRINGE WITH OR WITHOUT NEEDLE EACH', 1], 'E1399': ['Durable medical equipment, miscellaneous', 1]
};

/** [list, value, label, data, count, status] */
function seedRows_() {
  const rows = [];
  const add = function (list, value, label, data, count, status) { rows.push([list, value, label || '', data || null, count || 0, status || '']); };
  US_STATES.forEach(function (s) { add('State', s); });

  // Profiles seen on the notices. The other entities' profiles are learned on their first save.
  const totalcare = { addr1: '6049 S. Hulen St.', city: 'Fort Worth', state: 'TX', zip: '76132',
    email: 'cedarhill.negotiations@totalcare.us', phone: '(817) 566-1232' };
  const profiles = {
    'Silver Alliance, LLC': [Object.assign({ acting_as: 'Health care facility', acting_as_confirmed: true, tin: '862923814', npi: '1972273233' }, totalcare), 3],
    'Capital Health, PLLC': [Object.assign({ acting_as: 'Health care provider', acting_as_confirmed: true, tin: '872524265', npi: '1609548056',
      group_name: 'Totalcare ER, Cedar Hill' }, totalcare), 1]
  };
  SEED_ENTITIES.forEach(function (name) {
    // First guess from the legal form: PLLC = provider, LLC = facility. A saved dispute confirms it.
    const guess = /\bPLLC\s*$/i.test(name) ? ACTING_AS[0] : ACTING_AS[1];
    const p = profiles[name];
    add('BillingEntity', name, p ? p[0].acting_as : guess, p ? p[0] : { acting_as: guess, acting_as_confirmed: false }, p ? p[1] : 0);
  });

  const payerProfiles = {
    'UMR': { addr1: 'PO BOX 30541', city: 'SALT LAKE CITY', state: 'UT', zip: '84130', email: 'idr@clearhealthcloud.com', phone: '(877) 233-1800' },
    'BCBS': { addr1: 'PO BOX 660044', city: 'Dallas', state: 'TX', zip: '75266', email: 'nsa.disputes@bcbstx.com', phone: '(800) 451-0287' },
    'Cigna': { addr1: 'P.O. BOX 182223', city: 'CHATTANOOGA', state: 'TN', zip: '37422-7223', email: 'nsaidr@multiplan.com', phone: '(800) 244-6224' },
    'UHC': { addr1: 'PO Box 30783', city: 'Salt Lake City', state: 'UT', zip: '84130-0783', email: 'uhg_idr_disputes@uhc.com', phone: '(877) 842-3210' }
  };
  const aliasOf = {};
  SEED_ALIASES.forEach(function (a) { if (a[0] === 'Payer') aliasOf[a[1]] = a[2]; });
  SEED_PAYERS.forEach(function (name) {
    if (aliasOf[name]) return;
    add('Payer', name, '', payerProfiles[name] || null, payerProfiles[name] ? 1 : 0);
  });
  SEED_ALIASES.forEach(function (a) { add(a[0], a[1], '', { mergedInto: a[2] }, 0, HIDDEN); });

  add('IdrEntity', 'Maximus Federal Services Inc', '', null, 2);
  add('IdrEntity', 'Capitol Bridge LLC', '', null, 1);
  add('IdrEntity', 'Federal Hearings and Appeals Services, LLC', '', null, 1);

  PLAN_TYPES.forEach(function (p) { add('HealthPlanType', p, '', null, p === PLAN_TYPE_DEFAULT ? 4 : 0); });
  PLAN_ROLE.forEach(function (p) { add('PlanRole', p); });
  ACTING_AS.forEach(function (p) { add('ActingAs', p); });
  EXT_REASONS.forEach(function (p, i) { add('ExtensionReason', p, i ? 'Cooling off period' : 'Extension approval'); });
  DISPUTE_TYPES.forEach(function (p) { add('DisputeType', p); });

  SEED_CODES.forEach(function (c) {
    const o = OBSERVED_CODES[c];
    add('ServiceCode', c, o ? o[0] : '', o ? { description: o[0] } : null, o ? o[1] : 0);
  });

  add('PosCode', '23', 'Emergency room – hospital', null, 25);
  add('PosCode', '22', 'On campus-outpatient hospital');
  add('PosCode', '11', 'Office');
  add('PosCode', '20', 'Urgent care facility');
  add('PosCode', '41', 'Ambulance – land');

  ['25', '59', 'XU', '76', '77', 'LT', 'RT', 'GC'].forEach(function (m) { add('Modifier', m); });

  ['Missing document', 'Wrong amount', 'Wrong payer details', 'Not eligible', 'Deadline passed', 'Duplicate line item', 'Other']
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
