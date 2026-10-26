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
 * Configuration lives in the Sheet (v4):
 *   Options          every list (with a stable Key for options the logic depends on, Sort, Strict)
 *   Fields           per-field label, help, required, default and default mode, locked, visible, order
 *   Settings         app-wide settings
 *   Users            who may use the app, and their role (Admin, LB Member, US Member)
 *   BillingEntities  our billing entities (the initiating party address book)
 * The values in this file are only the fallback seed, used when a tab, list or row is missing.
 *
 * Deploy: create a Google Sheet, Extensions > Apps Script, add Code.gs, Index.html and
 * Pdf.html, add the Google Sheets API under Services (identifier: Sheets), run setup(),
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within
 * your organization). setup() is safe to run again after every code update.
 */

const APP_NAME = 'IDR Initiation Prep Studio';

const LOGO_URL = 'https://drive.google.com/thumbnail?id=18bqSCdjITeFAI8RmT6EAngDvhOV5cXmX&sz=w1000';

const SHEET_ID = ''; // leave empty when the script is bound to the Sheet

const TABS = { disputes: 'Disputes', lines: 'LineItems', files: 'Files', options: 'Options', settings: 'Settings', log: 'Log',
  fields: 'Fields', users: 'Users', entities: 'BillingEntities' };

const STATUS = { draft: 'Draft', ready: 'Ready for US desk', filed: 'Filed', returned: 'Returned' };

// One row per list value. Key: a stable id the logic uses (labels can be reworded). Sort: display order.
// Strict = Yes on the rows of a list whose text must match the portal: it never learns new values.
const OPTION_COLS = ['List', 'Key', 'Value', 'Label', 'Data', 'Count', 'LastUsed', 'Source', 'Status', 'Sort', 'Strict', 'AddedBy', 'AddedAt'];

const ACTIVE = 'Active';

const HIDDEN = 'Hidden';

// Roles (Users tab).
const ROLES = { admin: 'Admin', lb: 'LB Member', us: 'US Member' };

const ALL_ROLES = [ROLES.admin, ROLES.lb, ROLES.us];

const USER_COLS = ['Email', 'Name', 'Role', 'Team', 'Active', 'AddedBy', 'AddedAt', 'Notes'];

// Billing entities (initiating party address book). Data keys used by the profile fill and the client.
const ENTITY_COLS = ['Name', 'ActingAs', 'TIN', 'NPI', 'GroupName', 'Addr1', 'Addr2', 'City', 'State', 'ZIP', 'Email', 'Phone', 'Fax',
  'Confirmed', 'Status', 'Count', 'LastUsed', 'AddedBy', 'AddedAt', 'Notes', 'Aliases'];

const ENTITY_DATA = { ActingAs: 'acting_as', TIN: 'tin', NPI: 'npi', GroupName: 'group_name', Addr1: 'addr1', Addr2: 'addr2', City: 'city',
  State: 'state', ZIP: 'zip', Email: 'email', Phone: 'phone', Fax: 'fax' };

// Fields tab: one row per field; it overrides the built-in schema below (see applyFields_).
const FIELD_COLS = ['Page', 'Section', 'Order', 'Key', 'Label', 'Help', 'Type', 'List', 'Required', 'Default', 'DefaultMode', 'Locked',
  'Visible', 'Pattern', 'PatternMessage', 'CopyOrder', 'Notes'];

const DEFAULT_MODES = ['Fixed', 'Learned', 'None'];

// Settings tab (Key | Value | Note). These apply when a key is missing or its value is not valid.
const SETTING_DEFAULTS = { LearningMode: 'On', DefaultWindow: 50, DefaultShare: 0.8, ComplexStates: '', MaxFileMb: 45, DisputeMaxMb: 500,
  GatewayFrom: '2026-11-13', GatewayBannerUntil: '2027-01-15', PortalSessionMinutes: 60, PortalWarnMinutes: 50, StagingDays: 7 };

const SETTING_NOTES = {
  LearningMode: 'On: new values typed by users are active at once (training). Off: they are added as Hidden until an admin activates them.',
  DefaultWindow: 'How many recent saved records the learned defaults look at.',
  DefaultShare: 'Share of those records (0 to 1) one value needs to become the default.',
  ComplexStates: 'States on CMS\'s Complex State list, comma separated (like TX, NM). Lines with a location in the list need the state-specific eligibility attestation. Empty until confirmed.',
  MaxFileMb: 'Largest file the app accepts, in MB (Apps Script allows up to 45).',
  DisputeMaxMb: 'Total size of the files of one dispute that go to the portal, in MB (the portal allows 500).',
  GatewayFrom: 'Date the web form moves into the IDR Gateway (sign-in), YYYY-MM-DD.',
  GatewayBannerUntil: 'Last day the IDR Gateway banner shows on the copy desk (the form without sign-in ends that day), YYYY-MM-DD.',
  PortalSessionMinutes: 'The portal session times out after this many minutes of inactivity (copy desk timer).',
  PortalWarnMinutes: 'The copy desk timer warns after this many minutes.',
  StagingDays: 'Files uploaded to a dispute or line that was never saved are deleted after this many days.'
};

const MIN_DEFAULT_SAMPLE = 5; // a learned default needs at least this many saved records

// Lists the app learns from saves, shown in Insights.
const LEARNED_LISTS = ['Payer', 'BillingEntity', 'HealthPlanType', 'IdrEntity', 'ServiceCode', 'Modifier', 'PosCode',
  'Team', 'RcmSpecialist', 'ReturnReason'];

const LIST_TITLES = { RcmSpecialist: 'RCM Specialist', BillingEntity: 'Billing entity', IdrEntity: 'IDR entity', ServiceCode: 'Service code',
  PosCode: 'Place of service', HealthPlanType: 'Health plan type', ReturnReason: 'Return reason' };

// Without Sort values these keep the order of the Options tab; other lists are ranked by use.
const FIXED_ORDER_LISTS = ['State', 'Holiday'];

// Old v3 lists replaced by the Users tab; never sent to the browser.
const PRIVATE_LISTS = ['UsDeskUser', 'Admin'];

// Upload before saving: files of a never-saved dispute sit under this draft token in the Staging folder.
const DRAFT_PREFIX = 'DRAFT-';

// ------------------------------------------------------------------ built-in lists (fallback seed)
// [Key, Value, Label]. setup() seeds them into the Options tab, which is the live source. These
// values are used only when a list is missing or has no active value. The logic refers to Keys,
// so an admin can reword a value (if CMS changes the wording) without breaking the rules.

const EXT_APPROVAL = 'I received an extension approval from the Federal IDR mailbox and will upload evidence of this extension in the Supporting Documentation section of this web form.';

const EXT_COOLING = 'The item(s) or service(s) under dispute was subject to the cooling off period.';

const BUILTIN_LISTS = {
  YesNo: [['yes', 'Yes'], ['no', 'No']],
  BundledPayment: [['yes', 'Yes'], ['no', 'No']],
  ActingAs: [['provider', 'Health care provider'], ['facility', 'Health care facility']],
  PlanRole: [['group', 'Group health plan'], ['individual', 'Individual health insurance issuer'],
    ['fehb', 'Federal Employee Health Benefits (FEHB) carrier']],
  HealthPlanType: [['individual', 'Individual health insurance issuer'], ['fully_insured', 'Fully-insured ERISA group health plan'],
    ['fehb', 'Federal Employees Health Benefits (FEHB) carrier'], ['self_insured', 'Either partially or fully self-insured ERISA group health plan'],
    ['church', 'Church plan'], ['governmental', 'Non-federal governmental plan (e.g., state or local government plan)'],
    ['no_response', 'No Plan/Issuer Response']],
  DisputeType: [
    ['single', 'A single dispute', 'I’m disputing either (a) one service code that represents one item or service, or (b) one service code that represents multiple items or services (a bundled payment arrangement).'],
    ['batched', 'A batched dispute', 'I’m disputing multiple items or services related to the treatment of a similar condition.']],
  ExtensionReason: [['approval', EXT_APPROVAL, 'Extension approval'], ['cooling', EXT_COOLING, 'Cooling off period']],
  // Air ambulance never applies to us, so it is not offered.
  ItemType: [['emergency', 'Emergency item(s)/service(s)'], ['post_stabilization', 'Post-stabilization service(s)'],
    ['professional', 'Professional service(s)'], ['hospital_based', 'Hospital-based service(s)'],
    ['nonpar_at_par', 'Item(s)/service(s) furnished by a nonparticipating provider at a participating health care facility'],
    ['other', 'Other: Provide description']],
  LineType: [['bundled', 'Bundled Item or Service'], ['component', 'Component Item or Service']],
  NipMethod: [['email', 'Email'], ['mail', 'Mail'], ['fax', 'Fax'], ['portal', 'Portal']],
  IdreStatus: [['pending', 'Pending'], ['accepted_preferred', 'Accepted preferred'], ['alternate_accepted', 'Alternate accepted'],
    ['alternate_denied', 'Alternate denied']],
  ReturnReason: [['', 'Missing document'], ['', 'Wrong amount'], ['', 'Wrong payer details'], ['', 'Not eligible'], ['', 'Deadline passed'],
    ['', 'Duplicate line item'], ['', 'Other']],
  PosCode: [['', '23', 'Emergency room – hospital'], ['', '22', 'On campus-outpatient hospital'], ['', '11', 'Office'],
    ['', '20', 'Urgent care facility'], ['', '41', 'Ambulance – land']],
  Modifier: [['', '25'], ['', '59'], ['', 'XU'], ['', '76'], ['', '77'], ['', 'LT'], ['', 'RT'], ['', 'GC']],
  IdrEntity: [['', 'Maximus Federal Services Inc'], ['', 'Capitol Bridge LLC'], ['', 'Federal Hearings and Appeals Services, LLC']]
};

// Lists whose exact text must match the portal (plus the fixed answer lists): Strict = Yes, never learned.
const STRICT_LISTS = ['HealthPlanType', 'PlanRole', 'ActingAs', 'ExtensionReason', 'ItemType', 'DisputeType', 'LineType',
  'YesNo', 'BundledPayment', 'NipMethod', 'IdreStatus'];

// Fallback-seed values used by the seeds, the v3 upgrade and the demo (never as the live source).
const builtin_ = function (list, key) { return (BUILTIN_LISTS[list].filter(function (r) { return r[0] === key; })[0] || [])[1] || ''; };

const PLAN_TYPE_DEFAULT = builtin_('HealthPlanType', 'self_insured');

// The dispute kind the line rules follow (the portal's names for its three line-item layouts; derived, not entered).
const KIND = { single: 'Single Line Item – Not Bundled', bundled: 'Single Line Item – Bundled', batched: 'Batched Items or Services' };

const LOCATION = 'TX';

const NOT_ELIGIBLE = 'Not eligible for federal IDR';

const MAX_LINES = 50;

const BATCH_CAP_FROM = '2026-11-01'; // batched disputes with open negotiation starting on or after this date: at most 50 lines

const MB = 1024 * 1024;

// Files the US desk uploads to the portal (they count toward the dispute limit).
const PORTAL_FILE_CATEGORIES = ['on_evidence', 'extension', 'cooling', 'qpa', 'additional'];

const MSG = {
  prior2022: NOT_ELIGIBLE + ': items or services provided before January 1, 2022 are not eligible for the Federal IDR process',
  consent: NOT_ELIGIBLE + ': surprise billing protections were waived for these items or services',
  onEarly: 'If the parties can’t agree on an out-of-network rate, the 30-business-day open negotiation period must elapse before starting the Federal IDR process.',
  batchMin: 'Batched items or services require two or more line items.',
  batchMax: 'Batched items or services cannot exceed 50 dispute line items. If you have additional items or services to report, you must create an additional dispute.',
  fileLimit: 'The file you are attempting to upload exceeds the 500MB file size limit for the entire dispute and cannot be uploaded. Reduce the file size and try attaching the document again.',
  coverage: 'Not eligible if the member is only enrolled in coverage such as Medicare, Medicaid, CHIP, TRICARE or a health care sharing ministry.',
  noAccess: 'Access not granted. Ask an admin to add you on the Users tab.'
};

const PAYER_FILL = { addr1: 'plan_addr1', addr2: 'plan_addr2', city: 'plan_city', state: 'plan_state',
  zip: 'plan_zip', email: 'plan_email', phone: 'plan_phone', fax: 'plan_fax' };

const ENTITY_FILL = { acting_as: 'q_acting_as', tin: 'tin', npi: 'npi', group_name: 'prov_group_name',
  addr1: 'prov_addr1', addr2: 'prov_addr2', city: 'prov_city', state: 'prov_state', zip: 'prov_zip',
  email: 'prov_email', phone: 'prov_phone', fax: 'prov_fax' };

const CODE_FILL = { description: 'description' };

const LATE = { key: 'on_start_date', late: true }; // more than 34 business days since open negotiation started

// ------------------------------------------------------------------ portal schema (built in)
// Labels and order follow the IDR Gateway web form (user guide v15.0). The Fields tab can override
// labels, help, required, defaults, locked, visible, order, patterns and copy order (applyFields_).
//
// Field options used below:
//   options       the Options list the choices come from (radio, checkboxes, select, combo)
//   type 'combo'  free typing with suggestions; addNew 'email' | 'text': a searchable box with "Add new"
//   type 'check'  one tick box; the stored value is Yes when ticked
//   default       the default value; '@top' = the most used value of the list, '@me' = the signed-in LB
//                 Member's email, '@myteam' = the signed-in user's team (Users tab)
//   defaultMode   'Learned' (the most used recent value when it dominates, else default), 'Fixed', 'None'
//   locked        shown as a locked chip; with defaultMode Fixed the default is always stored
//   learnEmpty    a blank answer counts as a value when learning the default
//   fill          picking a value of this profile list fills these fields (data key -> field key or keys)
//   auto          'entity': filled from the billing entity; 'planType': derived from the health plan type
//   stop          answering the option with Key stop.is makes the dispute ineligible (blocks Ready)
//   showIf        the field shows (and is checked) only when the condition holds (see condMet_)
//   requiredIf    required when the condition holds; requiredUnless: required when that other field is empty
//   rule          required-ness is portal logic in code (the Fields tab shows Required = Rule)
//   pattern       regular expression the value must match (patternMsg is the message)
//   chars         'name' or 'address': the portal's allowed characters (see badChars_)
//   digits        spaces and hyphens are removed before saving (Tax ID, NPI)
//   upper         stored in capitals
//   carry         a new line item starts with the previous line's value
//   multi         several values, stored "; "-separated as the portal shows them (modifiers)
//   countUse      a strict list whose use counts still feed the learned default
//   before        (dates) must be before this dispute field
//   optionNotes   radio choices show their Options Label as a note (the portal's longer wording)

// Main contact block, in the portal's order: email, phone, fax, mailing address, city, state, ZIP.
function mainContact_(prefix, stateDefault) {
  const state = { key: prefix + 'state', label: 'State:', type: 'select', options: 'State', required: true, width: 'third' };
  if (stateDefault) { state.default = stateDefault; state.defaultMode = 'Learned'; }
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

/** The built-in schema, before the Fields tab is applied. */
function baseSchema_() {
  const reason = function (key) { return { key: 'extension_reason', list: 'ExtensionReason', is: key }; };
  const dtype = function (key) { return { key: 'dispute_type', list: 'DisputeType', is: key }; };
  return {
    // Internal fields (not on the portal), shown on page 1.
    internal: [
      { key: 'Team', label: 'Team', type: 'combo', options: 'Team', addNew: 'text', chars: 'name', default: '@myteam', defaultMode: 'Fixed', width: 'half' },
      { key: 'RcmSpecialist', label: 'RCM Specialist', type: 'combo', options: 'RcmSpecialist', addNew: 'email', people: true, default: '@me',
        defaultMode: 'Fixed', width: 'half' }
    ],
    pages: [
      {
        id: 'qual', title: 'Introduction & Qualification Questions', step: 'Introduction & Qualification Questions · page 1', short: 'Qualification',
        sections: [{ title: '', fields: [
          { key: 'q_prior_2022', label: 'Was the service in question provided prior to 1/1/2022?', type: 'radio', options: 'YesNo', required: true,
            default: 'No', defaultMode: 'Learned', stop: { is: 'yes', message: MSG.prior2022 } },
          { key: 'q_acting_as', label: 'I am (or I am acting on behalf of) a:', type: 'radio', options: 'ActingAs', required: true, auto: 'entity' },
          { key: 'tin', label: 'Tax ID:', type: 'text', requiredUnless: 'npi', requiredMsg: 'is required when there is no NPI (enter at least one of the two)',
            digits: true, pattern: '^\\d{9}$', patternMsg: 'must be 9 digits', placeholder: '#########', width: 'half' },
          { key: 'npi', label: 'National Provider Identifier (NPI):', type: 'text', requiredUnless: 'tin',
            requiredMsg: 'is required when there is no Tax ID (enter at least one of the two)', digits: true, pattern: '^\\d{10}$',
            patternMsg: 'must be 10 digits', placeholder: '##########', width: 'half' },
          { key: 'q_plan_type', label: 'Health Plan Type:', type: 'select', options: 'HealthPlanType', countUse: true, required: true,
            default: PLAN_TYPE_DEFAULT, defaultMode: 'Learned', note: MSG.coverage },
          { key: 'fehb_enrollment_code', label: 'Enrollment Code:', type: 'text', digits: true, pattern: '^\\d{3}$', patternMsg: 'must be 3 digits',
            placeholder: '###', required: true, showIf: { key: 'q_plan_type', list: 'HealthPlanType', is: 'fehb' }, width: 'third' },
          { key: 'on_start_date', label: 'When did the open negotiation period start?', type: 'date', required: true, max: 'today', helper: 'deadline' },
          { key: 'on_evidence', label: 'Upload evidence of the open negotiation period start date (for example, the notice or notices of open negotiation sent to the non-initiating party).',
            type: 'file', category: 'on_evidence', required: true,
            note: 'At least one file. In a batch with different open negotiation start dates, enter the first claim’s date above and upload a notice for each start date.' },
          { key: 'extension_reason', label: 'Extension justification reason:', type: 'radio', options: 'ExtensionReason', required: true, showIf: LATE },
          { key: 'ext_approval', label: 'Upload a copy of the extension approval received from the Federal IDR Questions mailbox.', type: 'file',
            category: 'extension', required: true, showIf: [LATE, reason('approval')] },
          { key: 'cooling_dispute_ref', label: 'Dispute Reference Number:', type: 'text', upper: true, required: true, showIf: [LATE, reason('cooling')],
            requiredMsg: 'is required: enter the dispute reference number that triggered the cooling off period', pattern: '^DISP-\\d+$',
            patternMsg: 'is not valid: use the DISP-XXXXXX format', placeholder: 'DISP-XXXXXX', width: 'half' },
          { key: 'cooling_docs', label: 'Upload a copy of the payment determination(s) that initiated the cooling off period (all of them if cooling off periods overlap).',
            type: 'file', category: 'cooling', required: true, showIf: [LATE, reason('cooling')] },
          { key: 'consent_waiver', label: 'Did the health care provider or health care facility get consent from the participant, beneficiary, or enrollee to waive surprise billing protections for these items or services?',
            type: 'radio', options: 'YesNo', required: true, default: 'No', defaultMode: 'Learned', stop: { is: 'yes', message: MSG.consent } }
        ] }]
      },
      {
        id: 'dtype', title: 'Dispute Type', step: 'Dispute Type · page 2', short: 'Dispute type',
        sections: [{ title: '', fields: [
          { key: 'dispute_type', label: 'What are you disputing today?', type: 'radio', options: 'DisputeType', optionNotes: true, required: true,
            default: 'A batched dispute', defaultMode: 'Learned' },
          { key: 'bundled_payment', label: 'Are you disputing a bundled payment arrangement (multiple items or services billed or reimbursed under one service code)?',
            type: 'radio', options: 'BundledPayment', required: true, showIf: dtype('single') },
          { key: 'batch_qualifies', label: 'I reviewed the batching questions and this dispute qualifies', type: 'check', required: true,
            showIf: dtype('batched'),
            note: 'The portal asks "Do your disputes qualify for the batching process?" in a pop-up. Answer Yes there only when this is ticked.' }
        ] }]
      },
      {
        id: 'init', title: 'Initiating Party Contact Information', step: 'Contact Information · initiating party · page 3', short: 'Initiating party',
        sections: [
          { title: 'Name and Address Information', fields: [
            { key: 'prov_name', label: 'Health care provider name:', type: 'combo', options: 'BillingEntity', required: true, default: '',
              defaultMode: 'Learned', fill: ENTITY_FILL, chars: 'name', width: 'half' },
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
            { key: 'plan_role', label: 'Select one of the insurance provider types below:', type: 'radio', options: 'PlanRole', required: true, auto: 'planType' }
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
          { key: 'description', label: 'Enter the description of the item or service.', type: 'textarea', required: true, copyOrder: 1 },
          { key: 'claim_number', label: 'Claim Number:', type: 'text', required: true, pattern: '^[A-Za-z0-9]{1,40}$',
            patternMsg: 'must be up to 40 letters and digits (no spaces or symbols)', width: 'half', carry: true, copyOrder: 2 },
          { key: 'service_date', label: 'Date of the qualified IDR item or service:', type: 'date', required: true, min: '2022-01-01',
            before: 'on_start_date', width: 'half', carry: true, copyOrder: 4 },
          { key: 'qpa', label: 'Qualifying Payment Amount (QPA):', type: 'money', required: true, width: 'third', copyOrder: 5 },
          { key: 'cost_sharing', label: 'Cost sharing amount allowed:', type: 'money', required: true, width: 'third', copyOrder: 10 },
          { key: 'initial_payment', label: 'Initial payment amount for the item(s) and/or service(s) (if applicable):', type: 'money', width: 'third', copyOrder: 11 }
        ] },
        { title: 'Item(s) or service(s) under dispute', fields: [
          { key: 'item_types', label: 'Select the item(s) or service(s) under dispute.', type: 'checkboxes', options: 'ItemType', required: true,
            default: 'Emergency item(s)/service(s)', defaultMode: 'Learned', carry: true, copyOrder: 12 },
          { key: 'other_desc', label: 'Other: Provide description', type: 'text', required: true,
            showIf: { key: 'item_types', list: 'ItemType', has: 'other' }, copyOrder: 13 }
        ] },
        { title: 'Service codes', fields: [
          { key: 'service_code', label: 'Service Code:', type: 'combo', options: 'ServiceCode', required: true, fill: CODE_FILL, upper: true,
            pattern: '^[A-Za-z0-9]{5}$', patternMsg: 'must be exactly 5 letters or digits', width: 'quarter', copyOrder: 7 },
          { key: 'modifiers', label: 'Service Code Modifier(s):', type: 'combo', options: 'Modifier', multi: true, upper: true, default: '',
            defaultMode: 'Learned', learnEmpty: true, itemPattern: '^[A-Za-z0-9]{2}$', maxItems: 4,
            itemMsg: 'must be up to 4 modifiers of 2 letters or digits each, like 25; 59', width: 'quarter', copyOrder: 8 },
          { key: 'pos_code', label: 'Place of Service Code:', type: 'combo', options: 'PosCode', required: true, default: '23', defaultMode: 'Learned',
            carry: true, pattern: '^\\d{2}$', patternMsg: 'must be 2 digits', width: 'quarter', copyOrder: 9 },
          { key: 'location', label: 'Location of Service:', type: 'select', options: 'State', required: true, default: LOCATION, defaultMode: 'Fixed',
            locked: true, width: 'quarter', copyOrder: 6 }
        ] },
        { title: 'Documentation', fields: [
          { key: 'qpa_docs', label: 'Upload documentation of the claim and QPA (for example, the initial payment or notice of denial of payment, remittance form and explanation of benefits, explanation of payments).',
            type: 'file', category: 'qpa', required: true, copyOrder: 14 },
          { key: 'state_attest', label: 'I have reviewed the state-specific eligibility criteria regarding the IDR processes for this item or service, and attest that this item or service is eligible for the Federal IDR process.',
            type: 'check', required: true, showIf: { key: 'location', inSetting: 'complexStates' }, copyOrder: 15 }
        ] }
      ],
      // The derived Line Item Type (bundled disputes) has no field; it is copied right after the claim number.
      lineTypeCopyOrder: 3
    },
    final: {
      id: 'final', title: 'Preferred Certified IDR Entity & Conflict of Interest', step: 'Preferred Certified IDR Entity & Conflict of Interest · page 6',
      short: 'IDR entity',
      sections: [
        { title: 'Preferred Certified IDR Entity Selection', fields: [
          { key: 'idr_entity', label: 'IDRE legal business name:', type: 'combo', options: 'IdrEntity', required: true, default: '@top', defaultMode: 'Learned' }
        ] },
        { title: 'Conflict of Interest Attestation', fields: [
          { key: 'third_party_attest', label: 'Is the undersigned individual below a third-party administrator or other service provider initiating on behalf of the plan, issuer, carrier, or Health Care Provider/Health Care Facility/Provider of Air Ambulance Services?',
            type: 'radio', options: 'YesNo', required: true, default: 'No', defaultMode: 'Learned' },
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

// ------------------------------------------------------------------ Fields tab merge

let SCHEMA_ = null; // merged schema for this server call

let CONFIG_WARNINGS_ = [];

/** The schema in use: the built-in schema with the Fields tab applied. Bad rows fall back to the built-in values. */
function schema_() {
  if (SCHEMA_) return SCHEMA_;
  CONFIG_WARNINGS_ = [];
  SCHEMA_ = applyFields_(baseSchema_(), fieldRows_(), CONFIG_WARNINGS_);
  return SCHEMA_;
}

// Every section of a schema with its page id, in order.
function schemaSections_(s) {
  const out = [];
  s.internal && out.push({ page: 'internal', title: 'Internal', fields: s.internal, holder: s, prop: 'internal' });
  s.pages.concat([s.line, s.final]).forEach(function (p) {
    p.sections.forEach(function (sec) { out.push({ page: p.id, title: sec.title, fields: sec.fields, sec: sec }); });
  });
  return out;
}

/** 'Rule' when the field's required-ness is portal logic in code; otherwise Yes or No. */
function requiredMode_(f) {
  if (f.rule || f.requiredIf || f.requiredUnless || f.showIf) return 'Rule';
  return f.required ? 'Yes' : 'No';
}

const yes_ = function (v) { return /^(yes|y|true|1)$/i.test(String(v == null ? '' : v).trim()); };

const no_ = function (v) { return /^(no|n|false|0)$/i.test(String(v == null ? '' : v).trim()); };

/**
 * Applies the Fields tab rows to a built-in schema. Sheet values win for Label, Help, Required (not for Rule fields),
 * Default, DefaultMode, Locked, Visible, Order, Pattern, PatternMessage and CopyOrder. Invalid values keep the built-in
 * value and are listed in warnings.
 */
function applyFields_(s, rows, warnings) {
  const byKey = {};
  rows.forEach(function (r) { if (r.Key) byKey[String(r.Key).trim()] = r; });
  const known = {};
  const warn = function (key, msg) { warnings.push('Fields, ' + key + ': ' + msg); };
  schemaSections_(s).forEach(function (sec) {
    sec.fields.forEach(function (f, i) {
      known[f.key] = true;
      f.order = i + 1;
      f.requiredMode = requiredMode_(f);
      const r = byKey[f.key];
      if (!r) return;
      const txt = function (c) { return String(r[c] == null ? '' : r[c]).trim(); };
      if (txt('Label')) f.label = txt('Label');
      if (txt('Help')) f.note = txt('Help') === '-' ? '' : txt('Help');
      const req = txt('Required');
      if (req) {
        if (f.requiredMode === 'Rule') { if (!/^rule$/i.test(req)) warn(f.key, 'Required is a portal rule in code ("' + req + '" ignored).'); }
        else if (yes_(req)) f.required = true;
        else if (no_(req)) f.required = false;
        else warn(f.key, 'Required must be Yes or No ("' + req + '" ignored).');
        f.requiredMode = requiredMode_(f);
      }
      const mode = txt('DefaultMode');
      if (mode) {
        const m = DEFAULT_MODES.filter(function (x) { return x.toLowerCase() === mode.toLowerCase(); })[0];
        if (m) f.defaultMode = m; else warn(f.key, 'DefaultMode must be Fixed, Learned or None ("' + mode + '" ignored).');
      }
      if (r.Default !== undefined && r.Default !== null && (txt('Default') !== '' || f.defaultMode === 'None')) {
        const d = txt('Default');
        const bad = defaultProblem_(f, d);
        if (bad) warn(f.key, bad + ' ("' + d + '" ignored).'); else f.default = d;
      }
      if (txt('Locked')) { if (yes_(txt('Locked'))) f.locked = true; else if (no_(txt('Locked'))) f.locked = false; else warn(f.key, 'Locked must be Yes or No.'); }
      if (txt('Visible')) {
        if (no_(txt('Visible'))) {
          if (f.required || f.requiredMode === 'Rule') warn(f.key, 'a required field cannot be hidden (Visible = No ignored).');
          else f.visible = false;
        } else if (yes_(txt('Visible'))) f.visible = true;
        else warn(f.key, 'Visible must be Yes or No.');
      }
      if (txt('Order')) { const o = Number(txt('Order')); if (isFinite(o)) f.order = o; else warn(f.key, 'Order must be a number.'); }
      if (txt('CopyOrder')) { const c = Number(txt('CopyOrder')); if (isFinite(c)) f.copyOrder = c; else warn(f.key, 'CopyOrder must be a number.'); }
      if (txt('Pattern')) {
        try { new RegExp(txt('Pattern')); f.pattern = txt('Pattern'); } catch (e) { warn(f.key, 'Pattern is not a valid regular expression.'); }
      }
      if (txt('PatternMessage')) f.patternMsg = txt('PatternMessage');
    });
    // Order within the section (stable).
    const sorted = sec.fields.map(function (f, i) { return { f: f, i: i }; })
      .sort(function (a, b) { return (a.f.order - b.f.order) || (a.i - b.i); }).map(function (x) { return x.f; });
    sec.fields.length = 0;
    sorted.forEach(function (f) { sec.fields.push(f); });
  });
  Object.keys(byKey).forEach(function (k) { if (!known[k]) warnings.push('Fields: unknown field key "' + k + '" ignored.'); });
  // Copy desk order of a line: by CopyOrder (the derived Line Item Type sits at lineTypeCopyOrder).
  const lineFieldList = [];
  s.line.sections.forEach(function (sec) { sec.fields.forEach(function (f) { lineFieldList.push(f); }); });
  s.line.deskOrder = lineFieldList.map(function (f, i) { return { k: f.key, o: f.copyOrder == null ? 100 + i : f.copyOrder }; })
    .concat([{ k: 'line_type', o: s.line.lineTypeCopyOrder }])
    .sort(function (a, b) { return a.o - b.o; }).map(function (x) { return x.k; });
  return s;
}

/** Why a default is not valid for a field, or ''. Tokens: @top, @me, @myteam. */
function defaultProblem_(f, d) {
  if (!d || /^@(top|me|myteam)$/.test(d)) return '';
  if (f.type === 'file') return 'a file field has no default';
  const list = typeof f.options === 'string' ? f.options : '';
  const closed = list && (f.type === 'radio' || f.type === 'select' || f.type === 'checkboxes' || isStrictList_(list));
  if (closed) {
    const vals = (options_()[list] || []);
    const items = f.type === 'checkboxes' ? d.split(/;\s*/) : [d];
    const missing = items.filter(function (x) { return vals.indexOf(x) === -1; });
    if (missing.length) return 'Default must be an option of the ' + list + ' list';
  }
  if (f.pattern && !f.multi && !new RegExp(f.pattern).test(d)) return 'Default does not match the field pattern';
  return '';
}

// Fields rows are keyed by Key (the first column, Page, may be blank).
function fieldTabRows_() {
  return table_(TABS.fields).rows.filter(function (r) { return String(r.Key || '').trim() !== ''; });
}

/** Fields tab rows (cached 10 minutes); [] before setup(). */
function fieldRows_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('fields');
  if (hit) return JSON.parse(hit);
  let rows = [];
  try { rows = ss_().getSheetByName(TABS.fields) ? fieldTabRows_() : []; } catch (e) { rows = []; }
  try { cache.put('fields', JSON.stringify(rows), 600); } catch (e) { /* read again next time */ }
  return rows;
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

// Sheet columns come from the built-in schema, so a field hidden on the Fields tab keeps its column.
function headerKeys_() {
  return headerFields_(baseSchema_()).filter(function (f) { return f.type !== 'file'; }).map(function (f) { return f.key; });
}

function lineKeys_() {
  return lineFields_(baseSchema_()).filter(function (f) { return f.type !== 'file'; }).map(function (f) { return f.key; });
}

// dispute_kind is derived from the dispute type (page 2); the nip_ and idre_ columns are US desk tracking.
const DISPUTE_META = ['DisputeID', 'Status', 'Team', 'RcmSpecialist', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt',
  'FolderUrl', 'ConfirmationPdfUrl', 'ReadyAt', 'FiledBy', 'FiledAt', 'PortalDisputeNumber', 'PortalPdfUrl', 'ReturnReason',
  'dispute_kind', 'nip_notified_date', 'nip_notified_method', 'idre_final', 'idre_status'];

const LINE_META = ['DisputeID', 'LineNo'];

// LineKey: the client's key of a line not saved yet; SameClaim: apply the QPA file to the claim's other lines when it is saved.
const FILE_COLS = ['DisputeID', 'Category', 'LineNo', 'Name', 'Url', 'FileId', 'UploadedBy', 'UploadedAt', 'Size', 'LineKey', 'SameClaim'];

// ------------------------------------------------------------------ options by Key

/** The active entries of a list in display order: [{ key, value, label, data, count }]. Fallback seed when the list is empty. */
function listEntries_(list) {
  return (activeByList_()[list] || []).map(function (r) {
    return { key: r.Key || '', value: r.Value, label: r.Label || '', data: r.Data ? parseData_(r.Data) : null, count: r.Count };
  });
}

/** The current text of the option with this Key (falls back to the built-in text). */
function optValue_(list, key) {
  const e = listEntries_(list).filter(function (x) { return x.key === key; })[0];
  return e ? e.value : (BUILTIN_LISTS[list] ? builtin_(list, key) : '');
}

/** The Key of an option's text, or ''. Text saved before an admin reworded the option still maps through the built-in text. */
function optKeyOf_(list, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const e = listEntries_(list).filter(function (x) { return x.value === v; })[0];
  if (e && e.key) return e.key;
  const b = (BUILTIN_LISTS[list] || []).filter(function (r) { return r[1] === v; })[0];
  return b ? b[0] : '';
}

/** True when the list's text must match the portal: it never learns new values. */
function isStrictList_(list) {
  if (!STRICT_) {
    STRICT_ = {};
    const seen = {};
    optionRows_().forEach(function (r) { seen[r.List] = true; if (yes_(r.Strict)) STRICT_[r.List] = true; });
    STRICT_LISTS.forEach(function (l) { if (!seen[l]) STRICT_[l] = true; });
  }
  return !!STRICT_[list];
}

/** The portal's line-item layout for a dispute type and the bundled answer. */
function disputeKind_(type, bundled) {
  const t = optKeyOf_('DisputeType', type);
  if (t === 'batched') return KIND.batched;
  if (t === 'single') return optKeyOf_('BundledPayment', bundled) === 'yes' ? KIND.bundled : KIND.single;
  return '';
}

/** Non-initiating party type the portal expects for a health plan type. */
function planRoleFor_(planType) {
  const k = optKeyOf_('HealthPlanType', planType);
  if (!planType) return '';
  if (k === 'individual') return optValue_('PlanRole', 'individual');
  if (k === 'fehb') return optValue_('PlanRole', 'fehb');
  return optValue_('PlanRole', 'group');
}

/** Line 1 of a bundled dispute is the bundled item; later lines are components. Other kinds have no line type. */
function lineTypeFor_(kind, index) {
  if (kind !== KIND.bundled) return '';
  return optValue_('LineType', index === 0 ? 'bundled' : 'component');
}

// ------------------------------------------------------------------ web app

function doGet() {
  // Only active members on the Users tab get the app.
  let u = null;
  try { u = me_(); } catch (e) { u = null; }
  if (!u) {
    return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;color:#003B5C">' +
      '<h2>Access not granted</h2><p>Your account (' + escHtml_(currentUser_()) + ') is not an active member of ' + escHtml_(APP_NAME) + '.</p>' +
      '<p>Ask an admin to add you on the Users tab.</p><p style="color:#6B4A00;background:#FEF3DC;padding:8px">Internal preparation tool. It is not the CMS portal.</p></div>')
      .setTitle(APP_NAME);
  }
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

function escHtml_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function getBootstrap(withList) {
  const u = requireRole_();
  const settings = getSettings_();
  const boot = {
    user: u.Email,
    role: u.Role,
    me: { email: u.Email, name: u.Name, team: u.Team },
    isAdmin: u.Role === ROLES.admin,
    isUsDesk: u.Role === ROLES.us || u.Role === ROLES.admin,
    isLb: u.Role === ROLES.lb || u.Role === ROLES.admin,
    people: activeUsers_().map(function (x) { return { email: x.Email, name: x.Name, team: x.Team }; }),
    schema: schema_(),
    lists: optionLists_(),
    aliases: aliases_(),
    defaults: suggestDefaults_(),
    learningMode: settings.LearningMode,
    complexStates: settings.ComplexStates,
    today: todayStr_(),
    status: STATUS,
    kinds: KIND,
    gateway: { transition: settings.GatewayFrom, noSignInEnds: settings.GatewayBannerUntil },
    rules: { maxLines: MAX_LINES, batchCapFrom: BATCH_CAP_FROM, fileLimit: settings.MaxFileMb * MB, disputeFileLimit: settings.DisputeMaxMb * MB,
      maxFileMb: settings.MaxFileMb, disputeMaxMb: settings.DisputeMaxMb, portalFileCategories: PORTAL_FILE_CATEGORIES,
      sessionMinutes: settings.PortalSessionMinutes, warnMinutes: settings.PortalWarnMinutes, draftPrefix: DRAFT_PREFIX, msg: MSG }
  };
  if (withList) {
    boot.listFilter = u.Role === ROLES.us ? STATUS.ready : STATUS.draft;
    boot.list = listDisputes(boot.listFilter);
  }
  return boot;
}

// ------------------------------------------------------------------ access (Users tab)
// LB Member: prepares disputes (Draft and Returned), uploads, sends to the US desk; reads everything and Insights.
// US Member: reads Ready and Filed disputes; copy desk, Mark filed, Return, IDR entity selection.
// Admin: everything, plus Lists, Settings & fields, Users and Billing entities.

let USERS_ = null;

/** Every Users row, normalized: { Email (lower case), Name, Role, Team, Active (bool), rowNum }. Cached for 2 minutes. */
function usersAll_() {
  if (USERS_) return USERS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('users');
  if (hit) return (USERS_ = JSON.parse(hit));
  let rows = [];
  try {
    if (ss_().getSheetByName(TABS.users)) {
      rows = table_(TABS.users).rows.map(function (r, i) {
        const role = ALL_ROLES.filter(function (x) { return x.toLowerCase() === String(r.Role || '').trim().toLowerCase(); })[0] || '';
        return { Email: String(r.Email || '').trim().toLowerCase(), Name: String(r.Name || '').trim(), Role: role, Team: String(r.Team || '').trim(),
          Active: !no_(r.Active) && String(r.Email || '').trim() !== '', Notes: r.Notes || '', rowNum: i + 2 };
      }).filter(function (r) { return r.Email; });
    }
  } catch (e) { rows = []; }
  try { cache.put('users', JSON.stringify(rows), 120); } catch (e) { /* read again next time */ }
  return (USERS_ = rows);
}

function activeUsers_() { return usersAll_().filter(function (u) { return u.Active && u.Role; }); }

function clearUsersCache_() {
  USERS_ = null;
  CacheService.getScriptCache().remove('users');
}

/**
 * The active member for an email, or null. While the Users tab has no active member (before setup), the account the
 * script runs as is treated as Admin, so nobody is locked out.
 */
function userOf_(email) {
  email = String(email || '').trim().toLowerCase();
  const active = activeUsers_();
  if (!active.length) {
    const owner = effectiveUser_();
    return email && email === owner ? { Email: email, Name: '', Role: ROLES.admin, Team: '', Active: true, bootstrap: true } : null;
  }
  return active.filter(function (u) { return u.Email === email; })[0] || null;
}

function effectiveUser_() {
  try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

function me_() { return userOf_(currentUser_()); }

/** The signed-in member, when their role is one of roles (any role when none given). Throws otherwise. */
function requireRole_() {
  const roles = Array.prototype.slice.call(arguments);
  const u = me_();
  if (!u) throw new Error(MSG.noAccess);
  if (roles.length && roles.indexOf(u.Role) === -1) throw new Error('Your role (' + u.Role + ') cannot do this.');
  return u;
}

// Editor tools (setup, demo, triggers) can also be called from a browser: only admins. allowTrigger: a time trigger
// (no signed-in user) may run it too.
function requireEditorOrAdmin_(allowTrigger) {
  const email = String(Session.getActiveUser().getEmail() || '');
  if (!email && allowTrigger) return;
  // First setup (no active member yet): only the account the script runs as (the editor, or the web app's owner).
  if (!activeUsers_().length) { if (email && email.toLowerCase() === effectiveUser_()) return; throw new Error('Only an Admin can run this.'); }
  const u = userOf_(email);
  if (!u || u.Role !== ROLES.admin) throw new Error('Only an Admin can run this.');
}

/** LB Members edit Draft and Returned disputes; Admins every dispute that is not filed. Returns the dispute row. */
function assertCanEdit_(id, u) {
  const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
  if (rowNum === -1) throw new Error('Dispute not found: ' + id);
  const d = rowAt_(TABS.disputes, rowNum);
  if (d.Status === STATUS.filed) throw new Error('This dispute is already filed and can no longer be edited.');
  if (u && u.Role === ROLES.lb && [STATUS.draft, STATUS.returned].indexOf(d.Status) === -1) {
    throw new Error('LB Members edit Draft and Returned disputes only. This one is ' + d.Status + '; ask the US desk to return it.');
  }
  return d;
}

// US Members only see disputes handed to the US desk.
function visibleTo_(u, d) {
  return u.Role !== ROLES.us || d.Status === STATUS.ready || d.Status === STATUS.filed;
}

// ------------------------------------------------------------------ disputes

function listDisputes(filter) {
  const u = requireRole_();
  const t = readTables_([TABS.disputes, TABS.lines]);
  const count = {};
  rows_(t[1]).forEach(function (l) { count[l.DisputeID] = (count[l.DisputeID] || 0) + 1; });
  return rows_(t[0])
    .filter(function (r) { return visibleTo_(u, r) && (!filter || filter === 'All' || r.Status === filter); })
    .map(function (r) {
      const dl = r.Status === STATUS.filed ? null : businessDeadline_(r.on_start_date);
      return {
        id: r.DisputeID, status: r.Status, team: r.Team, rcm: r.RcmSpecialist, plan: r.plan_name, kind: r.dispute_kind,
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
  const u = requireRole_();
  const b = disputeBundle_(id);
  if (!visibleTo_(u, b.dispute)) throw new Error('US Members see disputes that are Ready for US desk or Filed.');
  return b;
}

function disputeBundle_(id) {
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

/**
 * Creates or updates the dispute header (pages 1-4 and page 6). payload: { id?, values, page, draftToken? }.
 * On the first save, files uploaded under draftToken move to the new dispute. Returns { id, bundle }.
 */
function saveDispute(payload) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
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
      rec = assertCanEdit_(id, u);
    }
    const old = Object.assign({}, rec);

    const values = payload.values || {};
    const fields = headerFields_().concat(schema_().internal);
    fields.forEach(function (f) {
      if (f.type !== 'file' && (Object.prototype.hasOwnProperty.call(values, f.key) || isFixed_(f))) rec[f.key] = safe_(normValue_(f, values[f.key]));
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
    if (rowNum === -1 && payload.draftToken) relinkDraft_(payload.draftToken, id, u);
    learnRecord_(fields, values, old, rec);
    learnFlush_();
    log_(id, 'save', payload.page || '');
    return id;
  });
  return { id: id, bundle: disputeBundle_(id) };
}

/** Adds or replaces a line item (page 5). lineKey: the client's key of a new line (files uploaded before saving). Returns { lineNo, bundle }. */
function saveLine(id, lineNo, values, lineKey) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  lineNo = withLock_(function () {
    return storeLines_(id, [{ lineNo: lineNo, values: values, lineKey: lineKey }], u)[0];
  });
  return { lineNo: lineNo, bundle: disputeBundle_(id) };
}

/**
 * Adds several line items at once (bulk paste from a spreadsheet). rows: [{ field: value, lineKey? }].
 * Every row is checked first; nothing is saved when one has a problem. Returns { lineNos, bundle }.
 */
function saveLines(id, rows) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  rows = rows || [];
  if (!rows.length) throw new Error('Nothing to add.');
  const lineNos = withLock_(function () {
    const d = assertCanEdit_(id, u);
    const ctx = ruleCtx_(d);
    const problems = [];
    rows.forEach(function (values, i) {
      const rec = {};
      lineFields_().forEach(function (f) { if (f.type !== 'file') rec[f.key] = normValue_(f, values[f.key]); });
      lineFields_().forEach(function (f) {
        if (f.type === 'file') return;
        const msg = checkField_(f, rec[f.key], rec, ctx);
        if (msg) problems.push('Row ' + (i + 1) + ': ' + shortLabel_(f.label) + ' ' + msg);
      });
    });
    if (problems.length) throw new Error(problems.slice(0, 10).join(' ') + (problems.length > 10 ? ' (and ' + (problems.length - 10) + ' more)' : ''));
    return storeLines_(id, rows.map(function (v) { return { lineNo: null, values: v, lineKey: v.lineKey }; }), u);
  });
  return { lineNos: lineNos, bundle: disputeBundle_(id) };
}

// Inside the lock: writes line items, links their staged and same-claim QPA documents and learns. Returns the line numbers.
function storeLines_(id, items, u) {
  const d = assertCanEdit_(id, u);
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
    if (found === -1) adds.push(rec); else dirty[found] = Object.assign({}, all[found - 2], rec); // keeps columns not in the schema
    out.push({ lineNo: Number(lineNo), rec: rec, values: it.values || {}, lineKey: it.lineKey });
  });
  appendRecords_(TABS.lines, adds);
  writeRows_(TABS.lines, table_(TABS.lines).header, dirty);
  existing = existing.filter(function (r) { return !out.some(function (o) { return o.lineNo === Number(r.LineNo); }); })
    .concat(out.map(function (o) { return o.rec; }));
  out.forEach(function (o, i) {
    if (o.lineKey) relinkLineFiles_(id, o.lineKey, o.lineNo, o.rec.claim_number, existing);
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
  }).map(function (f) { return Object.assign({}, f, { LineNo: lineNo, LineKey: '', SameClaim: '', UploadedBy: currentUser_(), UploadedAt: nowStr_() }); });
  appendRecords_(TABS.files, copies);
}

// Files uploaded on a line before it was saved get its line number; "Use for all lines with this claim number"
// then attaches them to the claim's other lines too.
function relinkLineFiles_(id, lineKey, lineNo, claim, lines) {
  const t = table_(TABS.files);
  const dirty = {};
  const shared = [];
  t.rows.forEach(function (r, i) {
    if (r.DisputeID !== id || r.LineKey !== lineKey || String(r.LineNo) !== '') return;
    dirty[i + 2] = Object.assign({}, r, { LineNo: lineNo });
    if (yes_(r.SameClaim)) shared.push(r);
  });
  if (!Object.keys(dirty).length) return;
  writeRows_(TABS.files, t.header, dirty);
  claim = String(claim || '').trim();
  if (!claim || !shared.length) return;
  const have = {};
  filesOf_(id).forEach(function (f) { have[f.FileId + '|' + f.LineNo] = true; });
  const copies = [];
  lines.forEach(function (l) {
    if (Number(l.LineNo) === lineNo || String(l.claim_number).trim() !== claim) return;
    shared.forEach(function (f) {
      if (have[f.FileId + '|' + l.LineNo]) return;
      copies.push(Object.assign({}, f, { LineNo: Number(l.LineNo), LineKey: '', SameClaim: '' }));
    });
  });
  appendRecords_(TABS.files, copies);
}

// The first save of a new dispute: its staged files (DisputeID = the draft token) move to the dispute. Only the
// files the saving user staged move; an upload still running finds the new dispute through the cache (storeFile_).
function relinkDraft_(token, id, u) {
  if (String(token).indexOf(DRAFT_PREFIX) !== 0) return;
  CacheService.getScriptCache().put('draft:' + token, id, 21600);
  const t = table_(TABS.files);
  const dirty = {};
  const moved = {};
  t.rows.forEach(function (r, i) {
    if (r.DisputeID !== token || (u && !uploadedBy_(r, u))) return;
    dirty[i + 2] = Object.assign({}, r, { DisputeID: id });
    if (!moved[r.FileId]) {
      moved[r.FileId] = true;
      try { DriveApp.getFileById(r.FileId).moveTo(disputeFolder_(id)); } catch (e) { /* the Files row still points to it */ }
    }
  });
  writeRows_(TABS.files, t.header, dirty);
  if (Object.keys(dirty).length) log_(id, 'relink', Object.keys(dirty).length + ' staged file row(s) from ' + token);
}

function deleteLine(id, lineNo) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  withLock_(function () {
    assertCanEdit_(id, u);
    deleteWhere_(TABS.lines, function (r) { return r.DisputeID === id && Number(r.LineNo) === Number(lineNo); });
    // Remove that line's QPA documentation records too; the Drive files stay in the folder.
    deleteWhere_(TABS.files, function (r) { return r.DisputeID === id && r.Category === 'qpa' && Number(r.LineNo) === Number(lineNo); });
    touch_(id);
    log_(id, 'line:' + lineNo, 'deleted');
  });
  return disputeBundle_(id);
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

function isDraftToken_(v) { return /^DRAFT-[A-Za-z0-9-]{6,}$/.test(String(v || '')); }

function uploadedBy_(r, u) { return String(r.UploadedBy || '').trim().toLowerCase() === u.Email; }

// A draft token belongs to the member who staged its files: nobody else adds to, removes from or saves it.
function assertOwnDraft_(token, u) {
  if (filesOf_(token).some(function (r) { return !uploadedBy_(r, u); })) throw new Error('These files belong to another user\'s new dispute.');
}

/**
 * Stores one uploaded file. target: a dispute id, or the draft token of a dispute not saved yet (the file waits in the
 * Staging folder). lineNo: a saved line; lineKey: a line not saved yet. data is base64 without the data: prefix. With
 * sameClaim, a QPA document is also attached to every other line with the same claim number (for an unsaved line,
 * when it is saved). Returns { name, url, id, files } with the files of the dispute or draft.
 */
function uploadFile(target, category, lineNo, name, mimeType, data, sameClaim, lineKey) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  if (!target) throw new Error('No dispute to attach the file to.');
  if (['portal_confirmation', 'confirmation_pdf'].indexOf(category) !== -1) throw new Error('That document is added by the app.');
  withLock_(function () { if (isDraftToken_(target)) assertOwnDraft_(target, u); else assertCanEdit_(target, u); });
  return storeFile_(target, category, lineNo, name, mimeType, data, sameClaim, lineKey);
}

// The upload itself (also used by markFiled for the portal's notice).
function storeFile_(target, category, lineNo, name, mimeType, data, sameClaim, lineKey) {
  const st = getSettings_();
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > st.MaxFileMb * MB) throw new Error('Files must be under ' + st.MaxFileMb + ' MB each.');
  if (PORTAL_FILE_CATEGORIES.indexOf(category) !== -1 && disputeFileBytes_(filesOf_(target)) + bytes.length > st.DisputeMaxMb * MB) {
    throw new Error(st.DisputeMaxMb === 500 ? MSG.fileLimit : 'The files of one dispute must stay under ' + st.DisputeMaxMb + ' MB.');
  }
  let draft = isDraftToken_(target);
  const file = (draft ? stagingFolder_(target) : disputeFolder_(target)).createFile(Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name));
  return withLock_(function () {
    // The dispute was saved (and its staged files relinked) while this file was uploading: it goes to the dispute.
    const saved = draft ? CacheService.getScriptCache().get('draft:' + target) : null;
    if (saved) {
      try { DriveApp.getFileById(file.getId()).moveTo(disputeFolder_(saved)); } catch (e) { /* the Files row still points to it */ }
      target = saved;
      draft = false;
    }
    const pending = !lineNo && !!lineKey;
    const rec = fileRecord_(target, category, lineNo, name, file, bytes.length);
    if (pending) { rec.LineKey = String(lineKey); rec.SameClaim = sameClaim && category === 'qpa' ? 'Yes' : ''; }
    const recs = [rec];
    if (sameClaim && category === 'qpa' && lineNo && !draft) {
      const lines = rows_(table_(TABS.lines)).filter(function (l) { return l.DisputeID === target; });
      const mine = lines.filter(function (l) { return Number(l.LineNo) === Number(lineNo); })[0];
      const claim = mine ? String(mine.claim_number).trim() : '';
      lines.forEach(function (l) {
        if (claim && Number(l.LineNo) !== Number(lineNo) && String(l.claim_number).trim() === claim) {
          recs.push(fileRecord_(target, category, l.LineNo, name, file, bytes.length));
        }
      });
    }
    appendRecords_(TABS.files, recs);
    log_(draft ? '' : target, 'upload', category + ' ' + name + (draft ? ' (staged ' + target + ')' : '') + (recs.length > 1 ? ' (' + recs.length + ' lines)' : ''));
    return { name: name, url: file.getUrl(), id: file.getId(), files: filesOf_(target) };
  });
}

/** Removes a file of a dispute or a draft. With lineNo or lineKey, a QPA document shared by other lines is only unlinked from that line. */
function removeFile(target, fileId, lineNo, lineKey) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  return withLock_(function () {
    if (isDraftToken_(target)) assertOwnDraft_(target, u); else assertCanEdit_(target, u);
    const mine = function (r) {
      return (lineNo && Number(r.LineNo) === Number(lineNo)) || (lineKey && r.LineKey === lineKey && String(r.LineNo) === '');
    };
    const uses = filesOf_(target).filter(function (r) { return r.FileId === fileId; });
    if (!uses.length) return filesOf_(target); // not a file of this dispute or draft: never trash it
    const onlyLine = (!!lineNo || !!lineKey) && uses.length > 1 && uses.some(mine);
    deleteWhere_(TABS.files, function (r) { return r.DisputeID === target && r.FileId === fileId && (!onlyLine || mine(r)); });
    if (!onlyLine && !rows_(table_(TABS.files)).some(function (r) { return r.FileId === fileId; })) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    }
    log_(isDraftToken_(target) ? '' : target, onlyLine ? 'file-unlinked' : 'file-removed', fileId + (onlyLine ? ' line ' + (lineNo || lineKey) : ''));
    return filesOf_(target);
  });
}

/**
 * Staged files that never became part of a saved dispute or line, older than StagingDays, are trashed and their Files
 * rows deleted. Runs from setup() and from the daily trigger (installTriggers). Returns how many rows were removed.
 */
function cleanupStaging_(now) {
  const days = getSettings_().StagingDays;
  const cutoff = Utilities.formatDate(new Date((now || Date.now()) - days * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const t = table_(TABS.files);
  const stale = function (r) {
    if (String(r.UploadedAt) >= cutoff) return false;
    return isDraftToken_(r.DisputeID) || (r.LineKey && String(r.LineNo) === '');
  };
  const rows = rows_(t);
  const gone = rows.filter(stale);
  if (!gone.length) return 0;
  const keep = {};
  rows.forEach(function (r) { if (!stale(r)) keep[r.FileId] = true; });
  const trashed = {};
  gone.forEach(function (r) {
    if (keep[r.FileId] || trashed[r.FileId]) return;
    trashed[r.FileId] = true;
    try { DriveApp.getFileById(r.FileId).setTrashed(true); } catch (e) { /* already gone */ }
  });
  const n = deleteWhere_(TABS.files, stale);
  log_('', 'cleanup', n + ' staged file row(s) older than ' + days + ' days');
  return n;
}

/** Daily maintenance (time trigger, see installTriggers): removes old staged uploads. */
function dailyMaintenance() {
  requireEditorOrAdmin_(true);
  return withLock_(function () { return cleanupStaging_(); });
}

/** Run once from the editor: a daily trigger at about 3 AM for dailyMaintenance. Running it again keeps one trigger. */
function installTriggers() {
  requireEditorOrAdmin_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyMaintenance') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Daily maintenance trigger installed.');
}

/** Checks the dispute, saves the summary as a PDF in Drive and hands it to the US desk. */
function finalizeDispute(id) {
  const u = requireRole_(ROLES.admin, ROLES.lb);
  withLock_(function () { assertCanEdit_(id, u); });
  const problems = validate_(id);
  if (problems.length) return { ok: false, problems: problems, warnings: disputeBundle_(id).warnings };
  const pdfUrl = buildConfirmationPdf_(id);
  withLock_(function () {
    setCells_(id, { Status: STATUS.ready, ConfirmationPdfUrl: pdfUrl, ReadyAt: nowStr_(), ReturnReason: '' });
    log_(id, 'status', STATUS.ready);
  });
  const bundle = disputeBundle_(id);
  return { ok: true, pdfUrl: pdfUrl, bundle: bundle, warnings: bundle.warnings };
}

// ------------------------------------------------------------------ US desk

// The dispute must be with the US desk (Ready).
function readyDispute_(id) {
  const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
  if (rowNum === -1) throw new Error('Dispute not found: ' + id);
  const d = rowAt_(TABS.disputes, rowNum);
  if (d.Status !== STATUS.ready) throw new Error('Only disputes that are Ready for US desk can be filed or returned (this one is ' + d.Status + ').');
  return d;
}

/**
 * portalNumber: the portal's dispute number (DISP-...). portalPdf: the Notice of IDR Initiation PDF
 * ({ name, mimeType, data }). notice: { date: 'YYYY-MM-DD', method }, when and how the non-initiating party
 * was sent a copy of the notice (required the same day). method: a value of the NipMethod list.
 */
function markFiled(id, portalNumber, portalPdf, notice) {
  requireRole_(ROLES.admin, ROLES.us);
  portalNumber = String(portalNumber || '').trim().toUpperCase();
  if (!/^DISP-\d+$/.test(portalNumber)) throw new Error('Enter the dispute number the portal gave you, like DISP-1234567.');
  if (!portalPdf || !portalPdf.data) throw new Error('Attach the Notice of IDR Initiation PDF (Save as PDF on the portal’s confirmation page).');
  notice = notice || {};
  const nDate = String(notice.date || '').trim();
  const nMethod = String(notice.method || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nDate) || nDate > todayStr_()) {
    throw new Error('Enter the date the non-initiating party was sent a copy of the Notice of IDR Initiation (not in the future).');
  }
  const methods = options_().NipMethod || [];
  if (methods.indexOf(nMethod) === -1) throw new Error('Pick how the notice was sent: ' + methods.join(', ') + '.');
  assertWindowOpen_(readyDispute_(id));
  const pdfUrl = storeFile_(id, 'portal_confirmation', '', portalPdf.name, portalPdf.mimeType, portalPdf.data).url;
  withLock_(function () {
    readyDispute_(id); // another US Member may have filed or returned it meanwhile
    setCells_(id, { Status: STATUS.filed, FiledBy: currentUser_(), FiledAt: nowStr_(),
      PortalDisputeNumber: safe_(portalNumber), PortalPdfUrl: pdfUrl, nip_notified_date: nDate, nip_notified_method: nMethod,
      idre_status: optValue_('IdreStatus', 'pending') });
    log_(id, 'status', STATUS.filed + ' ' + portalNumber + '; notice sent ' + nDate + ' by ' + nMethod);
  });
  return disputeBundle_(id);
}

/** After filing: the certified IDR entity finally selected and how the selection went (IdreStatus list). Optional tracking. */
function updateIdreSelection(id, idreFinal, idreStatus) {
  requireRole_(ROLES.admin, ROLES.us);
  idreStatus = String(idreStatus || '').trim();
  const statuses = options_().IdreStatus || [];
  if (statuses.indexOf(idreStatus) === -1) throw new Error('Pick a status: ' + statuses.join(', ') + '.');
  withLock_(function () {
    const rowNum = findRow_(TABS.disputes, 'DisputeID', id);
    if (rowNum === -1) throw new Error('Dispute not found: ' + id);
    if (rowAt_(TABS.disputes, rowNum).Status !== STATUS.filed) throw new Error('Only filed disputes have an IDR entity selection.');
    setCells_(id, { idre_final: safe_(String(idreFinal || '').trim()), idre_status: idreStatus });
    log_(id, 'idre', idreStatus + (idreFinal ? ': ' + idreFinal : ''));
  });
  return disputeBundle_(id);
}

/** reason comes from the ReturnReason list (or is typed and learned); details say what to fix. */
function returnDispute(id, reason, details) {
  requireRole_(ROLES.admin, ROLES.us);
  reason = String(reason || '').trim();
  details = String(details || '').trim();
  if (!reason) throw new Error('Pick a reason for returning the dispute.');
  return withLock_(function () {
    readyDispute_(id);
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
// contact fields in Data. Billing entities live on their own tab (learnEntity_). Changes are
// queued and written in a few calls by learnFlush_(). Strict lists never learn new values.

let LEARN_ = null; // { header, dirty: { rowNum: record }, adds: [records], ent: { dirty, adds } } for this server call

function learnQueue_() {
  if (!LEARN_) LEARN_ = { header: table_(TABS.options).header, dirty: {}, adds: [], ent: { dirty: {}, adds: [] } };
  return LEARN_;
}

/** Upserts one value of a list. data: profile fields to merge. noCount: update Data only. Returns the stored value. */
function learn_(list, value, data, noCount) {
  value = String(value == null ? '' : value).trim();
  if (!list || !value || isPlaceholder_(value)) return value;
  if (list === 'BillingEntity') return learnEntity_(value, data, noCount);
  const q = learnQueue_();
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
    if (noCount || isStrictList_(list)) return value;
    q.adds.push(optionRecord_(list, value, {
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
  if (changed && hit.rowNum) q.dirty[hit.rowNum] = rec;
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
    if (!(f.type === 'combo' || f.countUse) || typeof f.options !== 'string' || !f.options ||
        !Object.prototype.hasOwnProperty.call(values, f.key)) return;
    const now = String(rec[f.key] || '').trim();
    if (!now) return;
    const data = f.fill ? profileData_(f.fill, rec) : null;
    const before = (f.multi ? splitMulti_(old[f.key]) : [String(old[f.key] || '')]).map(optionKey_);
    (f.multi ? splitMulti_(now) : [now]).forEach(function (v) {
      const isNew = before.indexOf(optionKey_(v)) === -1;
      // A value the portal would refuse is saved on the draft but never becomes a suggestion. (A member's name typed in a
      // people box is known but not an email: it is not added to the list either.)
      const listed = (options_()[f.options] || []).some(function (x) { return optionKey_(x) === optionKey_(v); });
      if (isNew && !listed && invalidNew_(f, v)) return;
      if (isNew || data) learn_(f.options, v, data, !isNew);
    });
  });
}

/** True when a typed value fails the field's format rules (email for "Add new" people, characters, pattern). */
function invalidNew_(f, v) {
  if (f.addNew === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return true;
  if (f.chars && badChars_(f.chars, v).length) return true;
  if (f.multi && f.itemPattern) return !new RegExp(f.itemPattern).test(v);
  return !!f.pattern && !new RegExp(f.pattern).test(f.upper ? v.toUpperCase() : v);
}

function learnFlush_() {
  const q = LEARN_;
  LEARN_ = null;
  if (!q) return;
  const ent = q.ent;
  if (q.adds.length || Object.keys(q.dirty).length) {
    appendRecords_(TABS.options, q.adds); // appending never moves the rows in q.dirty
    writeRows_(TABS.options, q.header, q.dirty);
  }
  if (ent.adds.length || Object.keys(ent.dirty).length) {
    const header = table_(TABS.entities).header;
    appendRecords_(TABS.entities, ent.adds);
    writeRows_(TABS.entities, header, ent.dirty);
  }
  clearOptionsCache_(); // new values show for everyone on their next page load
}

// ---- billing entities (BillingEntities tab)

/** Entity rows with their sheet row numbers; matching on the name or an alias, ignoring case and punctuation. */
function findEntity_(name) {
  const key = optionKey_(name);
  if (!key) return null;
  const q = LEARN_;
  const add = q ? q.ent.adds.filter(function (r) { return optionKey_(r.Name) === key; })[0] : null;
  if (add) return { rec: add, rowNum: 0 };
  const rows = table_(TABS.entities).rows;
  let alias = null;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].Name) continue;
    if (optionKey_(rows[i].Name) === key) return { rec: (q && q.ent.dirty[i + 2]) || rows[i], rowNum: i + 2 };
    if (!alias && splitAliases_(rows[i].Aliases).some(function (a) { return optionKey_(a) === key; })) alias = { rec: (q && q.ent.dirty[i + 2]) || rows[i], rowNum: i + 2 };
  }
  return alias;
}

function splitAliases_(v) { return String(v || '').split(';').map(function (s) { return s.trim(); }).filter(String); }

/**
 * Learns a billing entity from a saved dispute: a new name is added (Confirmed No; Hidden while LearningMode is Off);
 * a known one counts, and its empty columns are filled from the dispute. A non-empty column is never overwritten,
 * except I am a(n) while it is not confirmed: the saved dispute confirms it.
 */
function learnEntity_(name, data, noCount) {
  const q = learnQueue_();
  data = cleanData_(data) || {};
  const now = nowStr_();
  const hit = findEntity_(name);
  if (!hit) {
    if (noCount) return name;
    const rec = { Name: name, Confirmed: 'No', Status: getSettings_().LearningMode === 'On' ? ACTIVE : HIDDEN, Count: 1, LastUsed: now,
      AddedBy: currentUser_(), AddedAt: now };
    Object.keys(ENTITY_DATA).forEach(function (col) { if (data[ENTITY_DATA[col]]) rec[col] = data[ENTITY_DATA[col]]; });
    q.ent.adds.push(rec);
    return name;
  }
  const rec = Object.assign({}, hit.rec);
  if (!noCount) { rec.Count = (Number(rec.Count) || 0) + 1; rec.LastUsed = now; }
  Object.keys(ENTITY_DATA).forEach(function (col) {
    const v = data[ENTITY_DATA[col]];
    if (v && String(rec[col] || '').trim() === '') rec[col] = v;
  });
  if (data.acting_as && !yes_(rec.Confirmed)) { rec.ActingAs = data.acting_as; rec.Confirmed = 'Yes'; }
  if (hit.rowNum) q.ent.dirty[hit.rowNum] = rec; else Object.assign(hit.rec, rec);
  return rec.Name;
}

/** An entity row as an option row (List BillingEntity) for the lists, suggestions and Insights. */
function entityOptionRows_() {
  if (!ss_().getSheetByName(TABS.entities)) return [];
  const out = [];
  readTab_(TABS.entities).forEach(function (r) {
    const data = { acting_as_confirmed: yes_(r.Confirmed) };
    Object.keys(ENTITY_DATA).forEach(function (col) { if (String(r[col] || '').trim() !== '') data[ENTITY_DATA[col]] = String(r[col]).trim(); });
    const status = String(r.Status || '').toLowerCase() === 'hidden' ? HIDDEN : ACTIVE;
    out.push({ List: 'BillingEntity', Key: '', Value: String(r.Name), Label: data.acting_as || '', Data: JSON.stringify(data), Count: Number(r.Count) || 0,
      LastUsed: r.LastUsed || '', Source: String(r.AddedBy || '') === 'setup' ? 'seed' : 'learned', Status: status, Sort: '', Strict: '', AddedAt: r.AddedAt || '' });
    splitAliases_(r.Aliases).forEach(function (a) {
      out.push({ List: 'BillingEntity', Key: '', Value: a, Label: '', Data: JSON.stringify({ mergedInto: String(r.Name) }), Count: 0, LastUsed: '',
        Source: 'seed', Status: HIDDEN, Sort: '', Strict: '', AddedAt: '' });
    });
  });
  return out;
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
  return { List: list, Key: o.key || '', Value: String(value), Label: o.label || '',
    Data: o.data && Object.keys(o.data).length ? JSON.stringify(o.data) : '',
    Count: o.count || 0, LastUsed: o.lastUsed || '', Source: o.source || 'seed', Status: o.status || ACTIVE,
    Sort: o.sort == null ? '' : o.sort, Strict: o.strict ? 'Yes' : '',
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

// ---- learned defaults

/**
 * The effective default of every field with a default mode: Fixed = the Default column; Learned = the most used value in
 * the last DefaultWindow saved records when its share is at least DefaultShare (and the sample has MIN_DEFAULT_SAMPLE
 * records), otherwise the Default column; None = no default. Cached for 10 minutes.
 * Returns { fieldKey: { value, source: 'learned' | 'seed' | 'fixed', share, sample } }. Tokens (@me, @myteam) are resolved in the browser.
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
      const mode = f.defaultMode || (Object.prototype.hasOwnProperty.call(f, 'default') ? 'Learned' : 'None');
      if (mode === 'None' || f.type === 'file') return;
      const seed = f.default === '@top' ? (options_()[f.options] || [])[0] || '' : (f.default == null ? '' : f.default);
      if (mode === 'Fixed') { out[f.key] = { value: seed, source: 'fixed', share: 0, sample: 0 }; return; }
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
      const valid = !defaultProblem_(f, top);
      const usable = n >= MIN_DEFAULT_SAMPLE && share >= st.DefaultShare && allowed && valid;
      out[f.key] = usable ? { value: top, source: 'learned', share: share, sample: n } : { value: seed, source: 'seed', share: share, sample: n };
    });
  };
  // Disputes by last save, newest last; line items in the order they were added.
  learnFrom(headerFields_(s).concat(s.internal), rows_(t[0]).slice().sort(function (a, b) { return String(a.UpdatedAt) < String(b.UpdatedAt) ? -1 : 1; }));
  learnFrom(lineFields_(s), rows_(t[1]));
  try { cache.put('defaults', JSON.stringify(out), 600); } catch (e) { /* computed again next time */ }
  return out;
}

// ---- Insights (trends during the training phase)

function getInsights() {
  requireRole_();
  const rows = optionRows_();
  const st = getSettings_();
  const weekAgo = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const labels = {};
  const s = schema_();
  headerFields_(s).concat(lineFields_(s), s.internal).forEach(function (f) { labels[f.key] = shortLabel_(f.label); });
  let addedThisWeek = 0;

  const lists = LEARNED_LISTS.map(function (name) {
    const mine = rows.filter(function (r) { return r.List === name; });
    const active = mine.filter(function (r) { return r.Status !== HIDDEN; });
    const total = active.reduce(function (sum, r) { return sum + r.Count; }, 0);
    const added = mine.filter(function (r) { return r.Source === 'learned' && String(r.AddedAt) >= weekAgo; }).length;
    addedThisWeek += added;
    return {
      list: name, title: LIST_TITLES[name] || name, values: active.length, total: total, addedThisWeek: added,
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
    settings: { LearningMode: st.LearningMode, DefaultWindow: st.DefaultWindow, DefaultShare: st.DefaultShare, ComplexStates: st.ComplexStates },
    addedThisWeek: addedThisWeek, lists: lists,
    defaults: Object.keys(defaults).map(function (k) { return Object.assign({ key: k, label: labels[k] || k }, defaults[k]); }),
    notices: { filed: filed.length, notSameDay: late }
  };
}

// True when a filed dispute's notice to the non-initiating party was not sent on the filing day.
function noticeLate_(d) {
  if (d.Status !== STATUS.filed || !d.FiledAt) return false;
  return String(d.nip_notified_date || '') !== String(d.FiledAt).slice(0, 10);
}

// ---- Lists admin (Options tab)

/** Without list: the list names with value counts. With list: every value of that list. Billing entities have their own view. */
function adminListOptions(list) {
  requireRole_(ROLES.admin);
  const rows = rows_(table_(TABS.options)).filter(function (r) { return PRIVATE_LISTS.indexOf(r.List) === -1 && r.List !== 'BillingEntity'; });
  const summary = {};
  rows.forEach(function (r) {
    const s = summary[r.List] = summary[r.List] || { list: r.List, active: 0, hidden: 0, strict: false };
    if (r.Status === HIDDEN) s.hidden++; else s.active++;
    if (yes_(r.Strict)) s.strict = true;
  });
  const out = { lists: Object.keys(summary).sort().map(function (k) { return summary[k]; }), learningMode: getSettings_().LearningMode };
  if (!list) return out;
  const mine = rows.filter(function (r) { return r.List === list; });
  const activeValues = mine.filter(function (r) { return r.Status !== HIDDEN; }).map(function (r) { return r.Value; });
  out.list = list;
  out.strict = !!(summary[list] && summary[list].strict);
  out.rows = mine.map(function (r) {
    const data = parseData_(r.Data);
    return {
      key: r.Key || '', value: r.Value, label: r.Label, data: data, count: Number(r.Count) || 0, lastUsed: r.LastUsed, source: r.Source,
      status: r.Status || ACTIVE, sort: r.Sort, addedBy: r.AddedBy, addedAt: r.AddedAt, mergedInto: data.mergedInto || '',
      similar: closestOption_(activeValues.filter(function (v) { return v !== r.Value; }), r.Value)
    };
  }).sort(function (a, b) { return out.strict ? (Number(a.sort) || 0) - (Number(b.sort) || 0) : b.count - a.count; });
  return out;
}

/**
 * change: { label?, status?: 'Active' | 'Hidden', mergeInto?, value?, sort? }. Merging moves the count and the
 * profile into another value (created if it does not exist, which is how a value is renamed) and hides this one;
 * later saves of the old value count toward the new one. value rewords an option in place, keeping its Key (strict
 * lists: the portal changed its wording). Returns the list again.
 */
function adminUpdateOption(list, value, change) {
  requireRole_(ROLES.admin);
  if (list === 'BillingEntity') throw new Error('Billing entities are edited in the Billing entities view.');
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
    if (change.sort != null) {
      if (String(change.sort).trim() !== '' && !isFinite(Number(change.sort))) throw new Error('Sort must be a number.');
      rec.Sort = String(change.sort).trim();
    }
    if (change.value != null) {
      const nv = String(change.value).trim();
      if (!nv) throw new Error('The value cannot be empty.');
      if (nv !== value && t.rows.some(function (r, i) { return i !== idx && r.List === list && r.Value === nv; })) throw new Error(list + ' already has "' + nv + '".');
      rec.Value = nv;
    }
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
      if (yes_(rec.Strict) && rec.Key) throw new Error('A portal option with a Key cannot be merged; reword it instead.');
      const srcData = parseData_(rec.Data);
      delete srcData.mergedInto;
      const other = function (test) { return t.rows.findIndex(function (r, i) { return i !== idx && r.List === list && test(r); }); };
      let ti = other(function (r) { return r.Value === into; });
      if (ti === -1) ti = other(function (r) { return optionKey_(r.Value) === optionKey_(into); });
      if (ti === -1) {
        adds.push(optionRecord_(list, into, { label: rec.Label, data: srcData, count: Number(rec.Count) || 0, lastUsed: rec.LastUsed,
          source: 'learned', status: ACTIVE, strict: yes_(rec.Strict) }));
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
  clearConfigCache_();
}

// ---- Users admin

/** Every member (active or not). */
function adminListUsers() {
  requireRole_(ROLES.admin);
  return listUsers_();
}

function listUsers_() {
  return { roles: ALL_ROLES, users: usersAll_().map(function (u) {
    return { email: u.Email, name: u.Name, role: u.Role, team: u.Team, active: u.Active, notes: u.Notes };
  }) };
}

/**
 * Adds or updates a member. user: { email, name?, role, team?, active?, notes? }. Members are never deleted
 * (set active false). The last active Admin cannot be deactivated or given another role. Returns the list again.
 */
function adminSaveUser(user) {
  const me = requireRole_(ROLES.admin);
  user = user || {};
  const email = String(user.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email.');
  const role = ALL_ROLES.filter(function (r) { return r.toLowerCase() === String(user.role || '').trim().toLowerCase(); })[0];
  if (!role) throw new Error('Role must be ' + ALL_ROLES.join(', ') + '.');
  const active = user.active === undefined ? true : (user.active === true || yes_(user.active));
  if (user.name && badChars_('name', user.name).length) throw new Error('The name has characters the portal does not accept: ' + badChars_('name', user.name).join(' '));
  withLock_(function () {
    clearUsersCache_();
    const all = usersAll_();
    const cur = all.filter(function (u) { return u.Email === email; })[0];
    const admins = all.filter(function (u) { return u.Active && u.Role === ROLES.admin && u.Email !== email; });
    if (!admins.length && (!active || role !== ROLES.admin) && cur && cur.Active && cur.Role === ROLES.admin) {
      throw new Error('This is the last active Admin. Add another Admin first.');
    }
    // Before the first member (the script owner is Admin only while nobody is active): the first one must be an active Admin.
    if (!admins.length && !(active && role === ROLES.admin)) throw new Error('There would be no active Admin. Add an Admin first.');
    const rec = { Email: email, Name: safe_(user.name == null ? (cur ? cur.Name : '') : user.name).trim(), Role: role,
      Team: safe_(user.team == null ? (cur ? cur.Team : '') : user.team).trim(), Active: active ? 'Yes' : 'No',
      Notes: safe_(user.notes == null ? (cur ? cur.Notes : '') : user.notes) };
    if (cur) {
      const row = rowAt_(TABS.users, cur.rowNum);
      writeRecord_(TABS.users, cur.rowNum, Object.assign(row, rec));
    } else {
      appendRecords_(TABS.users, [Object.assign(rec, { AddedBy: me.Email, AddedAt: nowStr_() })]);
    }
    log_('', 'user', email + ': ' + role + (active ? '' : ' (inactive)') + (rec.Team ? ', team ' + rec.Team : ''));
    clearUsersCache_();
    // An admin's change ends a demo view switch (DemoData.gs), so the member cannot switch back to Admin on their own.
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('DEMO_SWITCH_EMAIL') === email) props.deleteProperty('DEMO_SWITCH_EMAIL');
  });
  return listUsers_(); // no second role check: an admin may have just changed their own role
}

// ---- Billing entities admin

function adminListEntities() {
  requireRole_(ROLES.admin);
  return { columns: ENTITY_COLS, actingAs: options_().ActingAs || [], states: options_().State || [],
    rows: readTab_(TABS.entities).map(function (r) { const o = {}; ENTITY_COLS.forEach(function (c) { o[c] = r[c] == null ? '' : r[c]; }); return o; }) };
}

/** Problems with an entity row, as messages. */
function entityProblems_(e) {
  const out = [];
  const v = function (c) { return String(e[c] == null ? '' : e[c]).trim(); };
  if (!v('Name')) out.push('Name is required.');
  if (badChars_('name', v('Name')).length) out.push('Name has characters the portal does not accept (' + badChars_('name', v('Name')).join(' ') + ').');
  if (badChars_('name', v('GroupName')).length) out.push('Group name has characters the portal does not accept.');
  ['Addr1', 'Addr2', 'City'].forEach(function (c) { if (badChars_('address', v(c)).length) out.push(c + ' has characters the portal does not accept.'); });
  if (v('ActingAs') && (options_().ActingAs || []).indexOf(v('ActingAs')) === -1) out.push('ActingAs must be one of: ' + (options_().ActingAs || []).join(', ') + '.');
  if (v('TIN') && !/^\d{9}$/.test(v('TIN').replace(/[\s-]/g, ''))) out.push('TIN must be 9 digits.');
  if (v('NPI') && !/^\d{10}$/.test(v('NPI').replace(/[\s-]/g, ''))) out.push('NPI must be 10 digits.');
  if (v('ZIP') && !/^\d{5}(-\d{4})?$/.test(normZip_(v('ZIP')))) out.push('ZIP must be 5 or 9 digits.');
  if (v('Phone') && !/^\(\d{3}\) \d{3}-\d{4}$/.test(normPhone_(v('Phone')))) out.push('Phone must be 10 digits.');
  if (v('Fax') && !/^\(\d{3}\) \d{3}-\d{4}$/.test(normPhone_(v('Fax')))) out.push('Fax must be 10 digits.');
  if (v('Email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('Email'))) out.push('Email is not valid.');
  if (v('State') && (options_().State || []).indexOf(v('State')) === -1) out.push('State must be a state code like TX.');
  if (v('Status') && ['active', 'hidden'].indexOf(v('Status').toLowerCase()) === -1) out.push('Status must be Active or Hidden.');
  if (v('Confirmed') && !yes_(v('Confirmed')) && !no_(v('Confirmed'))) out.push('Confirmed must be Yes or No.');
  return out;
}

/**
 * Adds (originalName empty) or updates an entity. Renaming keeps the old name as an alias. Count, LastUsed and the
 * Added columns are not edited here. Returns the list again.
 */
function adminSaveEntity(entity, originalName) {
  const me = requireRole_(ROLES.admin);
  entity = entity || {};
  const problems = entityProblems_(entity);
  if (problems.length) throw new Error(problems.join(' '));
  withLock_(function () {
    const t = table_(TABS.entities);
    const name = String(entity.Name).trim();
    const idx = originalName ? t.rows.findIndex(function (r) { return r.Name === originalName; }) : -1;
    if (originalName && idx === -1) throw new Error('Billing entity not found: ' + originalName);
    const clash = t.rows.findIndex(function (r, i) { return i !== idx && r.Name && optionKey_(r.Name) === optionKey_(name); });
    if (clash !== -1) throw new Error('A billing entity "' + t.rows[clash].Name + '" already exists.');
    const rec = idx === -1 ? { Count: 0, AddedBy: me.Email, AddedAt: nowStr_() } : Object.assign({}, t.rows[idx]);
    ['Name', 'ActingAs', 'GroupName', 'Addr1', 'Addr2', 'City', 'State', 'Email', 'Notes'].forEach(function (c) {
      if (entity[c] !== undefined) rec[c] = safe_(entity[c]).trim();
    });
    if (entity.TIN !== undefined) rec.TIN = String(entity.TIN).replace(/[\s-]/g, '');
    if (entity.NPI !== undefined) rec.NPI = String(entity.NPI).replace(/[\s-]/g, '');
    if (entity.ZIP !== undefined) rec.ZIP = normZip_(entity.ZIP);
    if (entity.Phone !== undefined) rec.Phone = normPhone_(entity.Phone);
    if (entity.Fax !== undefined) rec.Fax = normPhone_(entity.Fax);
    rec.Confirmed = entity.Confirmed === undefined ? (rec.Confirmed || (rec.ActingAs ? 'Yes' : 'No')) : (yes_(entity.Confirmed) ? 'Yes' : 'No');
    rec.Status = entity.Status === undefined ? (rec.Status || ACTIVE) : (String(entity.Status).toLowerCase() === 'hidden' ? HIDDEN : ACTIVE);
    let aliases = entity.Aliases === undefined ? splitAliases_(rec.Aliases) : splitAliases_(entity.Aliases);
    if (idx !== -1 && originalName !== name && aliases.indexOf(originalName) === -1) aliases.push(originalName);
    rec.Aliases = aliases.filter(function (a) { return optionKey_(a) !== optionKey_(name); }).join('; ');
    if (idx === -1) appendRecords_(TABS.entities, [rec]); else writeRecord_(TABS.entities, idx + 2, rec);
    log_('', 'entity', (idx === -1 ? 'added ' : 'updated ') + name);
  });
  clearOptionsCache_();
  CacheService.getScriptCache().remove('defaults');
  return adminListEntities();
}

// ---- Settings & fields admin

/** Settings (with the value in use and any problem), the Fields rows merged with the built-in schema, and config warnings. */
function adminGetConfig() {
  requireRole_(ROLES.admin);
  clearConfigCache_();
  const st = getSettings_();
  const raw = {};
  try { readTab_(TABS.settings).forEach(function (r) { raw[r.Key] = r.Value; }); } catch (e) { /* no tab yet */ }
  const s = schema_();
  const base = baseSchema_();
  const baseByKey = {};
  schemaSections_(base).forEach(function (sec) { sec.fields.forEach(function (f) { baseByKey[f.key] = f; }); });
  const fields = [];
  schemaSections_(s).forEach(function (sec) {
    sec.fields.forEach(function (f) {
      fields.push({ page: sec.page, section: sec.title, key: f.key, label: f.label, help: f.note || '', type: f.type, list: typeof f.options === 'string' ? f.options : '',
        required: f.requiredMode, rule: f.requiredMode === 'Rule', default: f.default == null ? '' : f.default, defaultMode: f.defaultMode || 'None',
        locked: !!f.locked, visible: f.visible !== false, order: f.order, copyOrder: f.copyOrder == null ? '' : f.copyOrder,
        builtinLabel: baseByKey[f.key] ? baseByKey[f.key].label : '' });
    });
  });
  return {
    settings: Object.keys(SETTING_DEFAULTS).map(function (k) {
      return { key: k, value: raw[k] === undefined ? '' : raw[k], effective: Array.isArray(st[k]) ? st[k].join(', ') : st[k], fallback: SETTING_DEFAULTS[k], note: SETTING_NOTES[k] };
    }),
    fields: fields, lists: options_(), warnings: (st.Warnings || []).concat(CONFIG_WARNINGS_), defaultModes: DEFAULT_MODES
  };
}

/** Why a setting value is not valid, or ''. */
function settingProblem_(key, value) {
  const v = String(value == null ? '' : value).trim();
  const num = function (min, max) { const n = Number(v); return v !== '' && isFinite(n) && n >= min && n <= max; };
  switch (key) {
    case 'LearningMode': return /^(on|off)$/i.test(v) ? '' : 'must be On or Off';
    case 'DefaultWindow': return num(1, 1000) ? '' : 'must be a number from 1 to 1000';
    case 'DefaultShare': { const n = parseFloat(v.replace('%', '')); const s = n > 1 ? n / 100 : n; return s > 0 && s <= 1 ? '' : 'must be a share like 0.8 or 80%'; }
    case 'ComplexStates': return v.split(/[,;\s]+/).filter(String).every(function (x) { return /^[A-Za-z]{2}$/.test(x); }) ? '' : 'must be 2-letter state codes, comma separated';
    case 'MaxFileMb': return num(1, 45) ? '' : 'must be a number from 1 to 45 (the Apps Script limit)';
    case 'DisputeMaxMb': return num(1, 500) ? '' : 'must be a number from 1 to 500 (the portal limit)';
    case 'GatewayFrom': case 'GatewayBannerUntil': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : 'must be a date like 2027-01-15';
    case 'PortalSessionMinutes': return num(5, 240) ? '' : 'must be a number of minutes from 5 to 240';
    case 'PortalWarnMinutes': return num(1, 239) ? '' : 'must be a number of minutes from 1 to 239';
    case 'StagingDays': return num(1, 90) ? '' : 'must be a number of days from 1 to 90';
    default: return 'is not a known setting';
  }
}

/** Saves one Settings value (validated). Returns the config again. */
function adminSaveSetting(key, value) {
  requireRole_(ROLES.admin);
  if (!Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key)) throw new Error('Unknown setting: ' + key);
  const bad = String(value == null ? '' : value).trim() === '' && key === 'ComplexStates' ? '' : settingProblem_(key, value);
  if (bad) throw new Error(key + ' ' + bad + '.');
  withLock_(function () {
    const rowNum = findRow_(TABS.settings, 'Key', key);
    const rec = { Key: key, Value: String(value == null ? '' : value).trim(), Note: SETTING_NOTES[key] };
    if (rowNum === -1) appendRecords_(TABS.settings, [rec]); else writeRecord_(TABS.settings, rowNum, Object.assign(rowAt_(TABS.settings, rowNum), rec));
    log_('', 'setting', key + ' = ' + rec.Value);
  });
  clearConfigCache_();
  return adminGetConfig();
}

/**
 * Saves one Fields row. change: { label?, help?, required? ('Yes' | 'No'), default?, defaultMode?, locked?, visible?, order? }.
 * Invalid changes are refused with the reason. Returns the config again.
 */
function adminSaveField(key, change) {
  requireRole_(ROLES.admin);
  change = change || {};
  let f = null;
  schemaSections_(schema_()).forEach(function (sec) { sec.fields.forEach(function (x) { if (x.key === key) f = x; }); });
  if (!f) throw new Error('Unknown field: ' + key);
  const problems = [];
  const mode = change.defaultMode == null ? f.defaultMode || 'None' : String(change.defaultMode).trim();
  if (DEFAULT_MODES.indexOf(mode) === -1) problems.push('DefaultMode must be Fixed, Learned or None.');
  if (change.required != null && String(change.required) !== '') {
    if (f.requiredMode === 'Rule') { if (!/^rule$/i.test(change.required)) problems.push('Required is a portal rule for this field and cannot be changed.'); }
    else if (!yes_(change.required) && !no_(change.required)) problems.push('Required must be Yes or No.');
  }
  const required = f.requiredMode === 'Rule' || (change.required == null ? f.required : yes_(change.required));
  if (change.visible != null && no_(change.visible) && required) problems.push('A required field cannot be hidden.');
  if (change.default != null) { const d = defaultProblem_(f, String(change.default).trim()); if (d) problems.push(d + '.'); }
  if (change.order != null && String(change.order).trim() !== '' && !isFinite(Number(change.order))) problems.push('Order must be a number.');
  if (change.label != null && !String(change.label).trim()) problems.push('Label cannot be empty.');
  if (problems.length) throw new Error(problems.join(' '));
  withLock_(function () {
    const rowNum = findRow_(TABS.fields, 'Key', key);
    const cur = rowNum === -1 ? fieldRow_(f) : rowAt_(TABS.fields, rowNum);
    const set = function (col, v) { if (v != null) cur[col] = String(v).trim(); };
    set('Label', change.label);
    set('Help', change.help);
    if (change.required != null && f.requiredMode !== 'Rule') cur.Required = yes_(change.required) ? 'Yes' : 'No';
    set('Default', change.default);
    if (change.defaultMode != null) cur.DefaultMode = mode;
    if (change.locked != null) cur.Locked = yes_(change.locked) || change.locked === true ? 'Yes' : 'No';
    if (change.visible != null) cur.Visible = no_(change.visible) || change.visible === false ? 'No' : 'Yes';
    set('Order', change.order);
    if (rowNum === -1) appendRecords_(TABS.fields, [cur]); else writeRecord_(TABS.fields, rowNum, cur);
    log_('', 'field', key + ' ' + JSON.stringify(change));
  });
  clearConfigCache_();
  return adminGetConfig();
}

// Settings, Fields, the merged schema and the defaults computed from them.
function clearConfigCache_() {
  SCHEMA_ = null;
  SETTINGS_ = null;
  FIELD_TYPES_ = null;
  CacheService.getScriptCache().removeAll(['fields', 'settings', 'defaults']);
}

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

// ------------------------------------------------------------------ validation

/** What the rules need besides the record itself: today, the Complex State list and the dispute (for line checks). */
function ruleCtx_(dispute, today) {
  return { today: today || todayStr_(), complexStates: getSettings_().ComplexStates, dispute: dispute || {} };
}

/**
 * A field condition: { key, list, is } (the value's option Key) | { key, list, has } (checkboxes: one ticked option has
 * that Key) | { key, filled: true } | { key, late: true } (open negotiation started more than 34 business days ago)
 * | { key, inSetting: 'complexStates' }. An array means all of them.
 */
function condMet_(c, rec, ctx) {
  if (!c) return true;
  if (Array.isArray(c)) return c.every(function (x) { return condMet_(x, rec, ctx); });
  const v = String(rec[c.key] == null ? '' : rec[c.key]).trim();
  if (c.late) { const dl = businessDeadline_(v, ctx && ctx.today); return !!dl && dl.band === 'late'; }
  if (c.filled) return v !== '' && !isPlaceholder_(v);
  if (c.is != null) return optKeyOf_(c.list, v) === c.is;
  if (c.has != null) return v.split(/;\s*/).some(function (x) { return optKeyOf_(c.list, x) === c.has; });
  if (c.inSetting) return ((ctx && ctx[c.inSetting]) || []).indexOf(v.toUpperCase()) !== -1;
  return true;
}

function fieldShown_(f, rec, ctx) {
  return f.visible !== false && (!f.showIf || condMet_(f.showIf, rec, ctx));
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

/** A locked field with a Fixed default always holds that default (location of service = TX). */
function isFixed_(f) {
  return !!f.locked && f.defaultMode === 'Fixed' && f.default != null && String(f.default) !== '' && !/^@/.test(f.default);
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
  const full = disputeBundle_(id);
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
        if (f.stop && optKeyOf_(f.options, d[f.key]) === f.stop.is) problems.push(f.stop.message + ' ("' + shortLabel_(f.label) + '" is ' + d[f.key] + ').');
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
  if (disputeFileBytes_(files) > getSettings_().DisputeMaxMb * MB) problems.push(MSG.fileLimit);
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
  return optKeyOf_('ExtensionReason', d.extension_reason) === 'cooling' && condMet_(LATE, d, { today: today });
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

/** A value an "Add new" box already knows: a value of its list, or (people boxes) an active member's email or name. */
function knownValue_(f, v) {
  const key = optionKey_(v);
  if ((options_()[f.options] || []).some(function (x) { return optionKey_(x) === key; })) return true;
  if (!f.people) return false;
  return activeUsers_().some(function (u) { return optionKey_(u.Email) === key || (u.Name && optionKey_(u.Name) === key); });
}

/** Problem with one value, or ''. record: the dispute or line it belongs to; ctx: see ruleCtx_. */
function checkField_(f, value, record, ctx) {
  record = record || {};
  if (!fieldShown_(f, record, ctx) || isFixed_(f)) return '';
  let v = value == null ? '' : String(value).trim();
  const required = fieldRequired_(f, record, ctx);
  const missing = f.requiredMsg || 'is required';
  if (v && isPlaceholder_(v) && f.type !== 'checkboxes') return required ? missing + ' ("' + v + '" is not accepted)' : '';
  if (!v) return required ? missing : '';
  if (f.type === 'check') return v === 'Yes' || !required ? '' : 'must be ticked';
  if (f.digits) v = v.replace(/[\s-]/g, '');
  if (f.upper) v = v.toUpperCase();
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMsg || 'is not in the right format';
  const list = typeof f.options === 'string' ? f.options : '';
  if (list && (f.type === 'radio' || f.type === 'select' || f.type === 'checkboxes' || isStrictList_(list))) {
    const vals = options_()[list] || [];
    const items = f.type === 'checkboxes' ? v.split(/;\s*/).filter(String) : [v];
    if (items.some(function (x) { return vals.indexOf(x) === -1; })) return 'is not one of the options of the ' + list + ' list';
  }
  if (f.addNew === 'email' && !knownValue_(f, v) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'must be a valid email to add a new one';
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
  if (isFixed_(f)) return String(f.default);
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
  if (f.addNew === 'email' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) s = s.toLowerCase();
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
  const full = disputeBundle_(id);
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
  const owner = header.indexOf('Owner') !== -1 && header.indexOf('RcmSpecialist') === -1;
  const rows = grid.slice(1).map(function (r) {
    const o = {};
    header.forEach(function (h, i) { o[h] = normCell_(h, r[i]); });
    // Before setup() renames it, the v3 Owner column is read as RcmSpecialist.
    if (owner) o.RcmSpecialist = o.Owner;
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
  // Types never change on the Fields tab, so the built-in schema is enough (and needs no sheet read).
  const out = { nip_notified_date: 'date', ZIP: 'zip' };
  const s = baseSchema_();
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

// Inside the lock, read the Sheet fresh so another user's save is never overwritten.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  TABLES_ = {};
  LEARN_ = null;
  USERS_ = null;
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

// ------------------------------------------------------------------ users, options and settings

// Files of a dispute that was never saved wait in Staging/<draft token> until its first save (see relinkDraft_).
function stagingFolder_(token) {
  const root = rootFolder_();
  const it = root.getFoldersByName('Staging');
  const staging = it.hasNext() ? it.next() : root.createFolder('Staging');
  const sub = staging.getFoldersByName(token);
  return sub.hasNext() ? sub.next() : staging.createFolder(token);
}

function currentUser_() {
  return Session.getActiveUser().getEmail() || 'unknown user';
}

// The Options rows are cached for 10 minutes. Saving a new value or editing the Options or BillingEntities tab
// clears the cache (see learnFlush_ and onEdit). The cache keeps compact rows to stay under the 100 KB limit.
let OPTION_ROWS_ = null;

let OPTIONS_ = null;
let ACTIVE_BY_ = null; // activeByList_ for this server call
let STRICT_ = null; // { list: true } for this server call

const OPTION_CACHE_COLS = ['List', 'Value', 'Label', 'Data', 'Count', 'LastUsed', 'Source', 'Status', 'AddedAt', 'Key', 'Sort', 'Strict'];

/**
 * Every option row, hidden ones included, with Count as a number: the Options tab, the BillingEntities tab (as List
 * BillingEntity) and, for a built-in list that is missing or has no active value, its fallback seed (Source fallback).
 */
function optionRows_() {
  if (OPTION_ROWS_) return OPTION_ROWS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('options');
  let out;
  if (hit) {
    out = JSON.parse(hit).map(function (r) {
      if (!Array.isArray(r)) return Object.assign({ Key: '', Sort: '', Strict: '' }, r);
      const o = {};
      OPTION_CACHE_COLS.forEach(function (c, i) { o[c] = r[i] == null ? '' : r[i]; });
      o.Count = Number(o.Count) || 0;
      o.Source = { l: 'learned', s: 'seed' }[o.Source] || o.Source;
      o.Status = o.Status === 'H' ? HIDDEN : ACTIVE;
      o.Strict = o.Strict === 'Y' ? 'Yes' : '';
      return o;
    });
  } else {
    out = [];
    try {
      out = readTab_(TABS.options).filter(function (r) { return r.List && r.Value !== '' && r.List !== 'BillingEntity'; }).map(function (r) {
        return { List: String(r.List), Key: String(r.Key || '').trim(), Value: String(r.Value), Label: r.Label || '', Data: r.Data || '',
          Count: Number(r.Count) || 0, LastUsed: r.LastUsed || '', Source: r.Source || 'seed', Status: r.Status === HIDDEN ? HIDDEN : ACTIVE,
          Sort: r.Sort == null ? '' : String(r.Sort), Strict: yes_(r.Strict) ? 'Yes' : '', AddedAt: r.AddedAt || '' };
      });
      out = out.concat(entityOptionRows_());
    } catch (e) { out = []; /* no tabs yet: the fallback seed applies */ }
    const compact = out.map(function (r) {
      const row = [r.List, r.Value, r.Label, r.Data, r.Count, r.LastUsed, { learned: 'l', seed: 's' }[r.Source] || r.Source,
        r.Status === HIDDEN ? 'H' : 'A', r.AddedAt, r.Key, r.Sort, r.Strict ? 'Y' : ''];
      while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === 0)) row.pop();
      return row;
    });
    try { cache.put('options', JSON.stringify(compact), 600); } catch (e) { /* too large to cache: read each time */ }
  }
  // A built-in list that is missing, or has no active value, uses its fallback seed (never cached, never written).
  const fallbackLists = Object.assign({ State: US_STATES.map(function (s) { return ['', s]; }) }, BUILTIN_LISTS);
  Object.keys(fallbackLists).forEach(function (list) {
    if (out.some(function (r) { return r.List === list && r.Status !== HIDDEN; })) return;
    fallbackLists[list].forEach(function (b, i) {
      out.push({ List: list, Key: b[0] || '', Value: b[1], Label: b[2] || '', Data: '', Count: 0, LastUsed: '', Source: 'fallback', Status: ACTIVE,
        Sort: STRICT_LISTS.indexOf(list) !== -1 ? String(i + 1) : '', Strict: STRICT_LISTS.indexOf(list) !== -1 ? 'Yes' : '', AddedAt: '' });
    });
  });
  return (OPTION_ROWS_ = out);
}

// Most used first, then most recently used; ties keep the tab's order.
function rankRows_(rows) {
  return rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
    return (b.r.Count - a.r.Count) || (String(b.r.LastUsed) > String(a.r.LastUsed) ? 1 : String(b.r.LastUsed) < String(a.r.LastUsed) ? -1 : a.i - b.i);
  }).map(function (x) { return x.r; });
}

// Lists with Sort values follow them (portal order); State and Holiday keep the tab's order; the others are ranked by use.
function activeByList_() {
  if (ACTIVE_BY_) return ACTIVE_BY_;
  const by = {};
  optionRows_().forEach(function (r) { if (r.Status !== HIDDEN) (by[r.List] = by[r.List] || []).push(r); });
  Object.keys(by).forEach(function (k) {
    const rows = by[k];
    if (rows.some(function (r) { return String(r.Sort).trim() !== ''; })) {
      by[k] = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
        const sa = String(a.r.Sort).trim() === '' ? 1e9 : Number(a.r.Sort);
        const sb = String(b.r.Sort).trim() === '' ? 1e9 : Number(b.r.Sort);
        return (sa - sb) || (a.i - b.i);
      }).map(function (x) { return x.r; });
    } else if (FIXED_ORDER_LISTS.indexOf(k) === -1) {
      by[k] = rankRows_(rows);
    }
  });
  return (ACTIVE_BY_ = by);
}

/** { List: [values] } of active values, in display order. */
function options_() {
  if (OPTIONS_) return OPTIONS_;
  const by = activeByList_();
  const out = {};
  Object.keys(by).forEach(function (k) { out[k] = by[k].map(function (r) { return r.Value; }); });
  return (OPTIONS_ = out);
}

/** For the browser: { List: [{ v, k, l, d, n }] } of active values (value, key, label, profile data, count), and strict lists. */
function optionLists_() {
  const by = activeByList_();
  const out = {};
  Object.keys(by).forEach(function (k) {
    if (PRIVATE_LISTS.indexOf(k) !== -1) return;
    out[k] = by[k].map(function (r) {
      const o = { v: r.Value };
      if (r.Key) o.k = r.Key;
      if (r.Label) o.l = r.Label;
      if (r.Data) o.d = parseData_(r.Data);
      if (r.Count) o.n = r.Count;
      if (r.Strict) o.s = 1;
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
  ACTIVE_BY_ = null;
  STRICT_ = null;
  HOLIDAYS_ = null;
  SCHEMA_ = null;
  CacheService.getScriptCache().removeAll(['options', 'defaults']);
}

let SETTINGS_ = null;

/**
 * The Settings tab with defaults filled in. Values that are not valid fall back to the built-in value and are listed in
 * Warnings. ComplexStates is a list of state codes; the numbers are numbers.
 */
function getSettings_() {
  if (SETTINGS_) return SETTINGS_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('settings');
  if (hit) return (SETTINGS_ = JSON.parse(hit));
  const out = Object.assign({}, SETTING_DEFAULTS);
  const warnings = [];
  try {
    if (ss_().getSheetByName(TABS.settings)) {
      readTab_(TABS.settings).forEach(function (r) {
        const k = String(r.Key || '').trim();
        if (!k) return;
        if (!Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, k)) { warnings.push('Settings: unknown key "' + k + '" ignored.'); return; }
        if (r.Value === '' || r.Value == null) return;
        const bad = settingProblem_(k, r.Value);
        if (bad) warnings.push('Settings, ' + k + ': ' + bad + ' ("' + r.Value + '" ignored; using ' + SETTING_DEFAULTS[k] + ').');
        else out[k] = r.Value;
      });
    }
  } catch (e) { /* no Settings tab yet: run setup(). The defaults apply. */ }
  out.LearningMode = /^off$/i.test(String(out.LearningMode).trim()) ? 'Off' : 'On';
  ['DefaultWindow', 'MaxFileMb', 'DisputeMaxMb', 'PortalSessionMinutes', 'PortalWarnMinutes', 'StagingDays'].forEach(function (k) { out[k] = Number(out[k]); });
  out.DefaultWindow = Math.round(out.DefaultWindow);
  let share = parseFloat(String(out.DefaultShare).replace('%', ''));
  if (share > 1) share = share / 100; // 80 or 80% means 0.8
  out.DefaultShare = share;
  if (out.PortalWarnMinutes >= out.PortalSessionMinutes) {
    warnings.push('Settings: PortalWarnMinutes must be less than PortalSessionMinutes (using ' + SETTING_DEFAULTS.PortalWarnMinutes + ' and ' + SETTING_DEFAULTS.PortalSessionMinutes + ').');
    out.PortalWarnMinutes = SETTING_DEFAULTS.PortalWarnMinutes;
    out.PortalSessionMinutes = SETTING_DEFAULTS.PortalSessionMinutes;
  }
  out.ComplexStates = String(out.ComplexStates || '').split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(String);
  out.Warnings = warnings;
  try { cache.put('settings', JSON.stringify(out), 600); } catch (e) { /* read again next time */ }
  return (SETTINGS_ = out);
}

/** Simple trigger: an edit to a configuration tab takes effect right away. */
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    const cache = CacheService.getScriptCache();
    if (name === TABS.options || name === TABS.entities) cache.removeAll(['options', 'defaults']);
    if (name === TABS.settings) cache.removeAll(['settings', 'defaults']);
    if (name === TABS.fields) cache.removeAll(['fields', 'defaults']);
    if (name === TABS.users) cache.remove('users');
  } catch (err) { /* the caches expire on their own within 10 minutes */ }
}

function log_(id, event, details) {
  appendRecords_(TABS.log, [{ Timestamp: nowStr_(), User: currentUser_(), DisputeID: id, Event: event, Details: safe_(details) }]);
}

// ------------------------------------------------------------------ one-time setup

/** Run from the editor. Creates or updates every tab, the lists, Settings, Fields, Users and the Drive folder. Safe to run again. */
function setup() {
  requireEditorOrAdmin_();
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

  renameHeader_(TABS.disputes, 'Owner', 'RcmSpecialist');
  ensure(TABS.disputes, DISPUTE_META.concat(headerKeys_()));
  ensure(TABS.lines, LINE_META.concat(lineKeys_()));
  ensure(TABS.files, FILE_COLS);
  ensure(TABS.log, ['Timestamp', 'User', 'DisputeID', 'Event', 'Details']);
  migrateOptions_(style);
  ensure(TABS.options, OPTION_COLS);
  ensure(TABS.settings, ['Key', 'Value', 'Note']);
  ensure(TABS.fields, FIELD_COLS);
  ensure(TABS.users, USER_COLS);
  ensure(TABS.entities, ENTITY_COLS);

  // Send queued SpreadsheetApp changes before anything reads the tabs through the Sheets API.
  SpreadsheetApp.flush();
  TABLES_ = {};
  clearOptionsCache_();
  clearConfigCache_();
  clearUsersCache_();
  const changed = migrateOptionsV3_();
  const users = migrateUsers_();
  const moved = migrateEntities_();
  const added = seedOptions_();
  const aliased = applySeedAliases_();
  const ents = seedEntities_();
  seedSettings_();
  const fields = seedFields_();
  const migrated = migrateRecordsV3_();
  clearOptionsCache_();
  clearConfigCache_();
  clearUsersCache_();
  const cleaned = cleanupStaging_();
  rootFolder_();
  Logger.log('Options: ' + added + ' seed value(s) added, ' + changed + ' updated, ' + aliased + ' alias(es) applied.');
  Logger.log('Users: ' + users + ' added. Billing entities: ' + moved + ' moved from Options, ' + ents + ' seeded. Fields: ' + fields + ' row(s) added.');
  Logger.log('Saved records updated: ' + migrated.disputes + ' dispute(s), ' + migrated.lines + ' line item(s). Staged files cleaned: ' + cleaned + '.');
  Logger.log(useApi_() ? 'Using the Google Sheets API advanced service.' : 'Google Sheets API advanced service is off: using SpreadsheetApp (slower).');
  Logger.log('Setup complete. Deploy as a web app: Execute as Me, access Anyone within your organization. Optional: run installTriggers().');
}

// v3 to v4: the Owner column becomes RcmSpecialist (same data).
function renameHeader_(name, from, to) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() === 0) return;
  const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const i = have.indexOf(from);
  if (i === -1 || have.indexOf(to) !== -1) return;
  sh.getRange(1, i + 1, 1, 1).setValues([[to]]);
  SpreadsheetApp.flush();
  TABLES_ = {};
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
  const portal = BUILTIN_LISTS.HealthPlanType.map(function (r) { return r[1]; });
  const old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, have.length).getValues() : [];
  const recs = old.filter(function (r) {
    return r[iList] !== '' && r[iValue] !== '' && !(r[iList] === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(String(r[iValue])) !== -1 &&
      portal.indexOf(String(r[iValue])) === -1);
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
 * Upgrade of the earlier lists: renames the two billing entities to their legal names, renames the Owner list to
 * RcmSpecialist, gives the built-in options their Key, Sort and Strict, hides Health Plan Types that are not one of the
 * portal's 7 options, and drops the unused seed code 99281. Returns rows changed.
 */
function migrateOptionsV3_() {
  const t = table_(TABS.options);
  const dirty = {};
  const exact = {};
  t.rows.forEach(function (r) { exact[r.List + '|' + r.Value] = true; });
  const portal = BUILTIN_LISTS.HealthPlanType.map(function (r) { return r[1]; });
  t.rows.forEach(function (r, i) {
    if (!r.List) return;
    const rec = Object.assign({}, r);
    SEED_RENAMES.forEach(function (x) {
      if (r.List === x[0] && r.Value === x[1] && !exact[x[0] + '|' + x[2]]) {
        rec.Value = x[2];
        rec.Data = JSON.stringify(Object.assign(parseData_(r.Data), { acting_as_confirmed: true }));
      }
    });
    if (r.List === 'Owner') rec.List = 'RcmSpecialist';
    const b = BUILTIN_LISTS[rec.List];
    if (b && STRICT_LISTS.indexOf(rec.List) !== -1) {
      const at = b.findIndex(function (x) { return x[1] === rec.Value; });
      if (at !== -1) {
        if (!rec.Key) rec.Key = b[at][0];
        if (String(rec.Sort == null ? '' : rec.Sort) === '') rec.Sort = String(at + 1);
      }
      if (!yes_(rec.Strict)) rec.Strict = 'Yes';
    }
    if (rec.List === 'HealthPlanType' && portal.indexOf(rec.Value) === -1 && rec.Status !== HIDDEN && !rec.Key) rec.Status = HIDDEN;
    if (t.header.some(function (h) { return String(rec[h] == null ? '' : rec[h]) !== String(r[h] == null ? '' : r[h]); })) dirty[i + 2] = rec;
  });
  writeRows_(TABS.options, t.header, dirty);
  const dropped = deleteWhere_(TABS.options, function (r) {
    return (r.List === 'ServiceCode' && r.Value === '99281' && r.Source === 'seed' && !(Number(r.Count) > 0)) ||
      (r.List === 'HealthPlanType' && OLD_PLAN_TYPES.indexOf(r.Value) !== -1 && portal.indexOf(r.Value) === -1 && !(Number(r.Count) > 0));
  });
  return Object.keys(dirty).length + dropped;
}

/**
 * v3 to v4: the Admin and UsDeskUser lists become Users rows (Admin; US Member) and those lists are hidden. When the
 * Users tab is still empty, the person running setup() becomes the first Admin. Returns how many users were added.
 */
function migrateUsers_() {
  const have = {};
  readTab_(TABS.users).forEach(function (r) { have[String(r.Email).trim().toLowerCase()] = true; });
  const opts = table_(TABS.options);
  const add = {};
  opts.rows.forEach(function (r) {
    if ((r.List !== 'Admin' && r.List !== 'UsDeskUser') || r.Status === HIDDEN) return;
    const email = String(r.Value).trim().toLowerCase();
    if (!email || have[email]) return;
    const role = r.List === 'Admin' ? ROLES.admin : ROLES.us;
    if (!add[email] || role === ROLES.admin) add[email] = role;
  });
  // v3 let everyone in the Workspace prepare disputes: the people who did so keep access as LB Members.
  if (!Object.keys(have).length) {
    rows_(table_(TABS.disputes)).forEach(function (r) {
      if (String(r.DisputeID).indexOf('IDR-DEMO-') === 0) return;
      [r.CreatedBy, r.UpdatedBy].forEach(function (e) {
        e = String(e || '').trim().toLowerCase();
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !have[e] && !add[e]) add[e] = ROLES.lb;
      });
    });
  }
  const recs = Object.keys(add).map(function (email) {
    return { Email: email, Name: '', Role: add[email], Team: '', Active: 'Yes', AddedBy: 'setup (migrated)', AddedAt: nowStr_(), Notes: add[email] === ROLES.lb ? 'Prepared disputes in v3' : 'From the v3 ' + (add[email] === ROLES.admin ? 'Admin' : 'UsDeskUser') + ' list' };
  });
  const dirty = {};
  opts.rows.forEach(function (r, i) { if ((r.List === 'Admin' || r.List === 'UsDeskUser') && r.Status !== HIDDEN) dirty[i + 2] = Object.assign({}, r, { Status: HIDDEN }); });
  writeRows_(TABS.options, opts.header, dirty);
  // Nobody is locked out: without an active Admin, the person running setup() becomes one.
  const anyAdmin = readTab_(TABS.users).some(function (r) { return !no_(r.Active) && String(r.Role).toLowerCase() === 'admin'; }) ||
    recs.some(function (r) { return r.Role === ROLES.admin; });
  if (!anyAdmin) {
    const me = String(Session.getActiveUser().getEmail() || effectiveUser_()).toLowerCase();
    const at = recs.findIndex(function (r) { return r.Email === me; });
    if (at !== -1) recs[at].Role = ROLES.admin;
    else if (me && !have[me]) recs.push({ Email: me, Name: '', Role: ROLES.admin, Team: '', Active: 'Yes', AddedBy: 'setup', AddedAt: nowStr_(), Notes: 'First admin (ran setup)' });
  }
  appendRecords_(TABS.users, recs);
  clearUsersCache_();
  return recs.length;
}

/** v3 to v4: BillingEntity rows of the Options tab move to the BillingEntities tab (aliases into the Aliases column). Returns rows moved. */
function migrateEntities_() {
  const opts = rows_(table_(TABS.options)).filter(function (r) { return r.List === 'BillingEntity'; });
  if (!opts.length) return 0;
  const existing = readTab_(TABS.entities);
  const byKey = {};
  existing.forEach(function (r) { byKey[optionKey_(r.Name)] = r; });
  const adds = [];
  opts.filter(function (r) { return !parseData_(r.Data).mergedInto; }).forEach(function (r) {
    if (byKey[optionKey_(r.Value)]) return;
    const d = parseData_(r.Data);
    const rec = { Name: r.Value, Confirmed: d.acting_as_confirmed === true || d.acting_as_confirmed === 'true' ? 'Yes' : 'No', Status: r.Status === HIDDEN ? HIDDEN : ACTIVE,
      Count: Number(r.Count) || 0, LastUsed: r.LastUsed || '', AddedBy: r.AddedBy || 'setup', AddedAt: r.AddedAt || nowStr_(), Aliases: '' };
    Object.keys(ENTITY_DATA).forEach(function (col) { if (d[ENTITY_DATA[col]]) rec[col] = String(d[ENTITY_DATA[col]]); });
    if (!rec.ActingAs && r.Label) rec.ActingAs = r.Label;
    adds.push(rec);
    byKey[optionKey_(r.Value)] = rec;
  });
  const dirty = {};
  opts.filter(function (r) { return parseData_(r.Data).mergedInto; }).forEach(function (r) {
    const target = byKey[optionKey_(parseData_(r.Data).mergedInto)];
    if (!target) return;
    const list = splitAliases_(target.Aliases);
    if (list.indexOf(r.Value) === -1) list.push(r.Value);
    target.Aliases = list.join('; ');
    const at = existing.indexOf(target);
    if (at !== -1) dirty[at] = target;
  });
  appendRecords_(TABS.entities, adds);
  if (Object.keys(dirty).length) {
    const t = table_(TABS.entities);
    const rows = {};
    t.rows.forEach(function (r, i) { Object.keys(dirty).forEach(function (k) { if (r.Name === dirty[k].Name) rows[i + 2] = dirty[k]; }); });
    writeRows_(TABS.entities, t.header, rows);
  }
  deleteWhere_(TABS.options, function (r) { return r.List === 'BillingEntity'; });
  return adds.length;
}

/** Adds the seed values that are missing (matched ignoring case and punctuation). Returns how many were added. */
function seedOptions_() {
  const rows = readTab_(TABS.options);
  const have = {};
  const exact = {};
  const keyed = {};
  rows.forEach(function (r) {
    exact[r.List + '|' + r.Value] = true;
    if (!parseData_(r.Data).mergedInto) have[r.List + '|' + optionKey_(r.Value)] = true;
    if (String(r.Key || '').trim()) keyed[r.List + '|' + String(r.Key).trim()] = true;
  });
  const add = [];
  seedRows_().forEach(function (s) {
    // An option an admin reworded keeps its Key: the old built-in text is not added back.
    if (s[6] && keyed[s[0] + '|' + s[6]]) return;
    const alias = !!(s[3] && s[3].mergedInto);
    // An alias row ("Health Now" for "HealthNow") is matched on its exact spelling.
    if (alias ? exact[s[0] + '|' + s[1]] : have[s[0] + '|' + optionKey_(s[1])]) return;
    if (alias) exact[s[0] + '|' + s[1]] = true; else have[s[0] + '|' + optionKey_(s[1])] = true;
    add.push(optionRecord_(s[0], s[1], { label: s[2], data: s[3], count: s[4], source: 'seed', status: s[5] || ACTIVE, key: s[6], sort: s[7],
      strict: s[8], addedBy: 'setup' }));
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

/** Adds the seed billing entities that are missing (name or alias, ignoring case and punctuation). Returns how many. */
function seedEntities_() {
  const have = {};
  readTab_(TABS.entities).forEach(function (r) {
    have[optionKey_(r.Name)] = true;
    splitAliases_(r.Aliases).forEach(function (a) { have[optionKey_(a)] = true; });
  });
  const add = seedEntityRows_().filter(function (r) { return !have[optionKey_(r.Name)]; });
  appendRecords_(TABS.entities, add);
  return add.length;
}

function seedSettings_() {
  const have = {};
  readTab_(TABS.settings).forEach(function (r) { have[r.Key] = true; });
  const add = Object.keys(SETTING_DEFAULTS).filter(function (k) { return !have[k]; })
    .map(function (k) { return { Key: k, Value: String(SETTING_DEFAULTS[k]), Note: SETTING_NOTES[k] }; });
  appendRecords_(TABS.settings, add);
}

/** A Fields row for a built-in field. */
function fieldRow_(f, page, section) {
  const mode = requiredMode_(f);
  return { Page: page || '', Section: section || '', Order: f.order || '', Key: f.key, Label: f.label, Help: f.note || '', Type: f.type,
    List: typeof f.options === 'string' ? f.options : '', Required: mode, Default: f.default == null ? '' : f.default,
    DefaultMode: f.defaultMode || 'None', Locked: f.locked ? 'Yes' : 'No', Visible: 'Yes', Pattern: f.pattern || '', PatternMessage: f.patternMsg || '',
    CopyOrder: f.copyOrder == null ? '' : f.copyOrder, Notes: mode === 'Rule' ? 'Required depends on other answers (portal rule in code)' : '' };
}

/** Adds a Fields row for every built-in field that has none. Existing rows are never changed. Returns how many. */
function seedFields_() {
  const have = {};
  fieldTabRows_().forEach(function (r) { have[r.Key] = true; });
  const add = [];
  schemaSections_(baseSchema_()).forEach(function (sec) {
    sec.fields.forEach(function (f, i) {
      if (have[f.key]) return;
      f.order = i + 1;
      add.push(fieldRow_(f, sec.page, sec.title));
    });
  });
  appendRecords_(TABS.fields, add);
  return add.length;
}

// v2 values of saved records mapped to v3.
const OLD_KIND_MAP = { 'Single dispute': ['single', 'no'], 'A batched dispute': ['batched', ''], 'A bundled dispute': ['single', 'yes'] };

const OLD_ROLE_MAP = { 'Group Health Plan': 'group', 'Federal Employees Health Benefits (FEHB) carrier': 'fehb' };

/**
 * Upgrade of saved disputes and lines (idempotent): the v2 dispute_kind becomes dispute_type, bundled_payment and the
 * derived kind; the v2 plan roles get the portal's spelling; I'm a(n) comes from the v2 designation when empty;
 * modifiers become "; "-separated. Returns { disputes, lines } changed.
 */
function migrateRecordsV3_() {
  TABLES_ = {};
  const t = table_(TABS.disputes);
  const acting = options_().ActingAs || [];
  const dirty = {};
  t.rows.forEach(function (r, i) {
    if (!r.DisputeID) return;
    const rec = Object.assign({}, r);
    const m = OLD_KIND_MAP[r.dispute_kind];
    if (m && !r.dispute_type) {
      rec.dispute_type = optValue_('DisputeType', m[0]);
      if (m[1]) rec.bundled_payment = optValue_('BundledPayment', m[1]);
    }
    if (rec.dispute_type) rec.dispute_kind = disputeKind_(rec.dispute_type, rec.bundled_payment);
    if (OLD_ROLE_MAP[r.plan_role]) rec.plan_role = optValue_('PlanRole', OLD_ROLE_MAP[r.plan_role]);
    if (!r.q_acting_as && acting.indexOf(r.prov_designation) !== -1) rec.q_acting_as = r.prov_designation;
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

/** Options seed rows: [list, value, label, data, count, status, key, sort, strict] */
function seedRows_() {
  const rows = [];
  const add = function (list, value, label, data, count, status, key, sort, strict) {
    rows.push([list, value, label || '', data || null, count || 0, status || '', key || '', sort == null ? '' : sort, !!strict]);
  };
  US_STATES.forEach(function (s) { add('State', s); });

  // Built-in lists: strict ones keep the portal's order (Sort) and never learn.
  const counts = { HealthPlanType: { self_insured: 4 }, PosCode: { 23: 25 }, IdrEntity: { 'Maximus Federal Services Inc': 2, 'Capitol Bridge LLC': 1,
    'Federal Hearings and Appeals Services, LLC': 1 } };
  Object.keys(BUILTIN_LISTS).forEach(function (list) {
    const strict = STRICT_LISTS.indexOf(list) !== -1;
    BUILTIN_LISTS[list].forEach(function (b, i) {
      const c = counts[list] ? counts[list][b[0] || b[1]] || 0 : 0;
      add(list, b[1], b[2], null, c, '', b[0], strict ? i + 1 : '', strict);
    });
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

  SEED_CODES.forEach(function (c) {
    const o = OBSERVED_CODES[c];
    add('ServiceCode', c, o ? o[0] : '', o ? { description: o[0] } : null, o ? o[1] : 0);
  });

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

/** BillingEntities seed rows. Profiles seen on the notices; the others are learned on their first save. */
function seedEntityRows_() {
  const totalcare = { Addr1: '6049 S. Hulen St.', City: 'Fort Worth', State: 'TX', ZIP: '76132', Email: 'cedarhill.negotiations@totalcare.us',
    Phone: '(817) 566-1232' };
  const profiles = {
    'Silver Alliance, LLC': Object.assign({ ActingAs: builtin_('ActingAs', 'facility'), TIN: '862923814', NPI: '1972273233', Confirmed: 'Yes', Count: 3 }, totalcare),
    'Capital Health, PLLC': Object.assign({ ActingAs: builtin_('ActingAs', 'provider'), TIN: '872524265', NPI: '1609548056', GroupName: 'Totalcare ER, Cedar Hill',
      Confirmed: 'Yes', Count: 1 }, totalcare)
  };
  const aliases = { 'Silver Alliance, LLC': 'SILVER ALLIANCE LLC; SILVER ALLIANCE,LLC', 'Capital Health, PLLC': 'CAPITAL HEALTH PLLC' };
  return SEED_ENTITIES.map(function (name) {
    // First guess from the legal form: PLLC = provider, LLC = facility. A saved dispute confirms it.
    const guess = /\bPLLC\s*$/i.test(name) ? builtin_('ActingAs', 'provider') : builtin_('ActingAs', 'facility');
    return Object.assign({ Name: name, ActingAs: guess, Confirmed: 'No', Status: ACTIVE, Count: 0, LastUsed: '', AddedBy: 'setup', AddedAt: nowStr_(),
      Aliases: aliases[name] || '' }, profiles[name] || {});
  });
}
