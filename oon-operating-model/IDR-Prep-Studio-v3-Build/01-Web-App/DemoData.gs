/**
 * Demo data for IDR Initiation Prep Studio.
 *
 * Add this file next to Code.gs (+ > Script, name it DemoData), then run from the editor:
 *   seedDemoData()      creates 12 synthetic disputes across the whole cycle
 *   demoUseUsView()     adds you to the US desk (copy desk view)
 *   demoUseLebanonView() removes you from the US desk (Lebanon entry view)
 *   clearDemoData()     deletes every demo dispute, its rows and its Drive folder
 *
 * Claims, amounts, dates, people, portal dispute numbers and documents are made up. The payers,
 * billing entities, IDR entities and service codes come from the seeded lists, so Insights and the
 * learned defaults show realistic trends. Demo disputes use ids that start with IDR-DEMO- and claim
 * numbers that start with DEMO (letters and digits only, as the portal requires), so they are easy
 * to spot and remove.
 *
 * The demo covers each dispute kind: a single line item not bundled, a single bundled line item
 * with components, batched items, and a batch past the window that uses the cooling off period
 * extension. Open negotiation start dates are set so the window is open on the day you seed
 * (business day 31 to 34), except one dispute prepared ahead (day 25, not open yet); seed again on
 * a later day to keep it that way.
 */

const DEMO_PREFIX = 'IDR-DEMO-';

const DEMO_STREETS = ['Main St', 'Commerce St', 'Elm St', 'Congress Ave', 'Preston Rd', 'Camp Bowie Blvd', 'Lamar Blvd'];
const DEMO_TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
const DEMO_OWNERS = ['R. Haddad', 'M. Khoury', 'J. Saad', 'L. Nassar', 'S. Aoun', 'N. Fares', 'K. Daher'];
const DEMO_LEBANON_USERS = ['r.haddad@demo.example', 'm.khoury@demo.example', 'j.saad@demo.example'];
// Used only when the ServiceCode list has no descriptions (setup() not run yet).
const DEMO_CODES_FALLBACK = [{ v: '99284', l: 'EMERGENCY ROOM SERVICE' }, { v: '94761', l: 'MEASURE BLOOD OXYGEN LEVEL' },
  { v: 'A4670', l: 'AUTOMATIC BLOOD PRESSURE MONITOR' }, { v: 'A6413', l: 'ADHESIVE BANDAGE, FIRST-AID' }];

// Which stage each demo dispute is left in, its type, how many line items it has, and what it shows.
// day: the business day of open negotiation on the seeding day (the start date is day 1).
const DEMO_PLAN = [
  { stage: 'draft-qual', type: 'batched', lines: 0, day: 31 },
  { stage: 'draft-init', type: 'batched', lines: 0, day: 32 },
  { stage: 'draft-lines', type: 'batched', lines: 2, day: 33 },
  { stage: 'returned', type: 'batched', lines: 3, day: 31, mismatch: 2, reason: 'Wrong amount',
    details: 'Line 2: cost sharing plus initial payment does not equal the QPA. Re-check the EOB and re-attach.' },
  { stage: 'ready', type: 'single', lines: 1, day: 32, planType: 'Fully-insured ERISA group health plan' },
  { stage: 'ready', type: 'bundled', lines: 3, day: 33 },
  { stage: 'ready', type: 'batched', lines: 5, day: 34, poc: true, modifiers: true },
  { stage: 'ready', type: 'batched', lines: 12, day: 31 },
  { stage: 'ready', type: 'batched', lines: 3, day: 40, cooling: true }, // past the window: cooling off period extension
  { stage: 'filed', type: 'batched', lines: 2, day: 33, idre: 'Accepted preferred' },
  { stage: 'filed', type: 'single', lines: 1, day: 34, noticeLate: true, idre: 'Pending' }, // notice sent the next day: shows the warning
  { stage: 'ready', type: 'batched', lines: 2, day: 25 } // prepared ahead: on the US desk under "Not open yet"
];

// ------------------------------------------------------------------ public functions

function seedDemoData() {
  if (!ss_().getSheetByName(TABS.disputes) || !ss_().getSheetByName(TABS.settings)) setup();
  clearDemoData();

  // Rows are collected here and written once per tab at the end.
  const disputeRecs = [];
  const lineRecs = [];
  const fileRecs = [];
  const logRecs = [];
  const needPdf = [];
  const lists = optionLists_();
  const payers = (lists.Payer || []).filter(function (p) { return p.d && p.d.email; });
  const entities = (lists.BillingEntity || []).filter(function (e) { return e.d && e.d.email; });
  const idrEntities = options_().IdrEntity || ['Maximus Federal Services Inc'];
  const described = (lists.ServiceCode || []).filter(function (c) { return c.l || (c.d && c.d.description); });
  const codes = described.length ? described : DEMO_CODES_FALLBACK;
  const erCodes = codes.filter(function (c) { return /^9928/.test(c.v); });
  const others = codes.filter(function (c) { return !/^9928/.test(c.v); });
  if (!payers.length || !entities.length) throw new Error('Run setup() first: the Payer and BillingEntity lists have no profiles.');
  const me = currentUser_();
  const today = new Date();
  const todayIso = todayStr_();
  const desc = function (c) { return c.l || (c.d && c.d.description) || 'EMERGENCY ROOM SERVICE'; };

  DEMO_PLAN.forEach(function (spec, i) {
    const id = DEMO_PREFIX + pad3_(i + 1);
    const payer = payers[i % payers.length];
    // Three in four disputes are the facility, as on the notices seen so far.
    const entity = entities.filter(function (e) { return e.d.acting_as === (i % 4 === 3 ? ACTING_AS[0] : ACTING_AS[1]); })[0] || entities[0];
    const ed = entity.d;
    const preparer = DEMO_LEBANON_USERS[i % DEMO_LEBANON_USERS.length];
    const created = daysAgo_(today, 12 - i);
    const onStart = demoOnStart_(todayIso, spec.day);
    const folder = disputeFolder_(id);
    const planType = spec.planType || PLAN_TYPE_DEFAULT;
    const type = spec.type === 'batched' ? DISPUTE_TYPES[1] : DISPUTE_TYPES[0];
    const bundled = spec.type === 'batched' ? '' : spec.type === 'bundled' ? 'Yes' : 'No';

    // ---- header (pages 1-4 and page 6)
    const v = {
      DisputeID: id, Status: STATUS.draft, Team: pick_(DEMO_TEAMS, i), Owner: pick_(DEMO_OWNERS, i),
      CreatedBy: preparer, CreatedAt: stamp_(created), UpdatedBy: preparer, UpdatedAt: stamp_(daysAgo_(today, Math.max(0, 6 - i))),
      FolderUrl: folder.getUrl(),
      q_prior_2022: 'No', q_acting_as: ed.acting_as, tin: ed.tin || '', npi: ed.npi || '', q_plan_type: planType,
      on_start_date: onStart, consent_waiver: 'No', prov_name: entity.v
    };
    if (spec.cooling) {
      v.extension_reason = EXT_COOLING;
      v.cooling_dispute_ref = 'DISP-' + (100000 + i); // synthetic reference
    }
    if (spec.stage !== 'draft-qual') {
      Object.assign(v, {
        dispute_type: type, bundled_payment: bundled, batch_qualifies: spec.type === 'batched' ? 'Yes' : '',
        dispute_kind: disputeKind_(type, bundled),
        prov_group_name: ed.group_name || entity.v,
        prov_email: ed.email, prov_phone: ed.phone, prov_fax: ed.fax || '', prov_addr1: ed.addr1, prov_city: ed.city, prov_state: ed.state, prov_zip: ed.zip,
        plan_role: planRoleFor_(planType), plan_name: payer.v,
        plan_addr1: payer.d.addr1 || '', plan_city: payer.d.city || '', plan_state: payer.d.state || '', plan_zip: payer.d.zip || '',
        plan_email: payer.d.email || '', plan_phone: payer.d.phone || '', plan_fax: payer.d.fax || ''
      });
      if (spec.poc) {
        Object.assign(v, {
          prov_p1_name: pick_(DEMO_OWNERS, i), prov_p1_addr1: (500 + i * 11) + ' ' + pick_(DEMO_STREETS, i + 3),
          prov_p1_city: 'Fort Worth', prov_p1_state: 'TX', prov_p1_zip: '76132',
          prov_p1_email: 'idr.team' + (i + 1) + '@er-demo.example', prov_p1_phone: '(817) 555-04' + pad2_(i)
        });
      }
    }
    if (spec.stage === 'draft-init') {
      // Stopped part-way through the initiating party page; the non-initiating party is not entered yet.
      ['prov_addr1', 'prov_city', 'prov_zip', 'prov_email', 'prov_phone', 'plan_role', 'plan_name', 'plan_addr1', 'plan_city',
        'plan_state', 'plan_zip', 'plan_email', 'plan_phone', 'plan_fax'].forEach(function (k) { delete v[k]; });
    }
    if (spec.stage === 'returned' || spec.stage === 'ready' || spec.stage === 'filed') {
      v.idr_entity = i % 4 === 1 ? idrEntities[1] || idrEntities[0] : idrEntities[0];
      v.third_party_attest = 'No';
      v.coi_attest = 'Yes';
    }

    // ---- documents and line items
    addDemoFile_(fileRecs, folder, id, 'on_evidence', '', 'Open negotiation notice - ' + id + '.pdf',
      'Notice of Open Negotiation', ['Sent to: ' + payer.v, 'Open negotiation start date: ' + onStart]);
    if (spec.cooling) {
      addDemoFile_(fileRecs, folder, id, 'cooling', '', 'Payment determination - ' + v.cooling_dispute_ref + '.pdf',
        'Payment determination (cooling off period)', ['Synthetic determination for ' + v.cooling_dispute_ref + '.']);
    }

    // One claim per dispute (as on every notice seen), with one EOB for the claim.
    const claim = 'DEMO' + (70000 + i * 100 + 1);
    let eob = null;
    for (let n = 1; n <= spec.lines; n++) {
      const c = n === 1 ? pick_(erCodes.length ? erCodes : codes, i) : pick_(others.length ? others : codes, i * 3 + n);
      const qpa = money_(n === 1 ? 450 + rand_(i * 31 + n) * 900 : 15 + rand_(i * 31 + n) * 400);
      const cost = n === 1 && i % 3 === 0 ? money_(Number(qpa) * 0.1) : '0.00';
      const initial = spec.mismatch === n ? money_(Number(qpa) * 0.5) : money_(Number(qpa) - Number(cost));
      // Dates of service before the open negotiation start; the cooling off batch spans more than 30 business days.
      const dos = isoDate_(daysAgo_(isoToDate_(onStart), spec.cooling ? 10 + (n - 1) * 30 : 12 + (n > 1 && spec.type === 'batched' ? n % 3 : 0)));
      lineRecs.push({
        DisputeID: id, LineNo: n,
        claim_number: claim, service_date: dos, description: desc(c),
        qpa: qpa, cost_sharing: cost, initial_payment: initial,
        item_types: 'Emergency item(s)/service(s)', other_desc: '',
        service_code: c.v, modifiers: spec.modifiers && n === 2 ? '25; 59' : '', pos_code: '23', location: LOCATION
      });
      if (!eob) eob = createDemoPdf_(folder, 'EOB - ' + id + '.pdf', 'Explanation of Benefits / Remittance Advice', ['Payer: ' + payer.v, 'Synthetic claim ' + claim]);
      fileRecs.push({ DisputeID: id, Category: 'qpa', LineNo: n, Name: eob.getName(), Url: eob.getUrl(), FileId: eob.getId(),
        UploadedBy: preparer, UploadedAt: stamp_(created), Size: 20480 });
    }

    // ---- stage-specific status
    if ((spec.stage === 'returned' || spec.stage === 'ready' || spec.stage === 'filed') && spec.lines >= 5) {
      addDemoFile_(fileRecs, folder, id, 'additional', '', 'UB04 form - ' + id + '.pdf', 'Additional supporting documentation',
        ['Synthetic claim form for ' + payer.v + '.']);
    }
    if (spec.stage === 'returned') {
      v.Status = STATUS.returned;
      v.ReadyAt = stamp_(daysAgo_(today, 3));
      v.ReturnReason = spec.reason + ': ' + spec.details;
    }
    if (spec.stage === 'ready' || spec.stage === 'filed') {
      v.Status = STATUS.ready;
      v.ReadyAt = stamp_(daysAgo_(today, spec.stage === 'filed' ? 5 : 1));
    }
    if (spec.stage === 'filed') {
      const filedOn = daysAgo_(today, 2);
      v.Status = STATUS.filed;
      v.FiledBy = me;
      v.FiledAt = stamp_(filedOn);
      v.PortalDisputeNumber = 'DISP-' + (900000 + i); // synthetic
      v.nip_notified_date = isoDate_(spec.noticeLate ? daysAgo_(today, 1) : filedOn);
      v.nip_notified_method = 'Email';
      v.idre_status = spec.idre || 'Pending';
      v.idre_final = spec.idre === 'Accepted preferred' ? v.idr_entity : '';
    }

    disputeRecs.push(v);
    if (spec.stage === 'ready' || spec.stage === 'filed' || spec.stage === 'returned') needPdf.push(id);
    logRecs.push({ Timestamp: nowStr_(), User: me, DisputeID: id, Event: 'demo-seed', Details: spec.stage + ', ' + spec.type + ', ' + spec.lines + ' line(s)' });
  });

  appendRecords_(TABS.disputes, disputeRecs);
  appendRecords_(TABS.lines, lineRecs);
  appendRecords_(TABS.files, fileRecs);
  appendRecords_(TABS.log, logRecs);
  learnDemo_(disputeRecs, lineRecs);

  // The confirmation PDF is built from the saved rows, exactly as the app does it.
  needPdf.forEach(function (id) { setCells_(id, { ConfirmationPdfUrl: buildConfirmationPdf_(id) }); });
  CacheService.getScriptCache().remove('defaults');

  Logger.log('Demo data ready: ' + DEMO_PLAN.length + ' disputes (' + DEMO_PREFIX + '001 to ' + DEMO_PREFIX + pad3_(DEMO_PLAN.length) + ').');
  Logger.log('You are ' + (isUsDesk_(me) ? 'on the US desk view.' : 'on the Lebanon view.') + ' Run demoUseUsView() or demoUseLebanonView() to switch.');
}

// The start date that makes today business day n of open negotiation (the start date is day 1).
function demoOnStart_(todayIso, n) {
  const hol = holidays_();
  let d = isoToUtc_(todayIso);
  let count = 0;
  for (;;) {
    if (isBusinessDay_(d, hol)) count++;
    if (count >= n) return utcToIso_(d);
    d -= DAY_MS;
  }
}

// The demo feeds the lists once (teams and owners appear as learned values, counts go up), so
// Insights has something to show. Seeding again does not add to the counts a second time.
function learnDemo_(disputes, lines) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DEMO_LEARNED')) return;
  const s = schema_();
  const hf = headerFields_(s).concat(s.internal);
  const lf = lineFields_(s);
  withLock_(function () {
    disputes.forEach(function (r) { learnRecord_(hf, r, {}, r); });
    lines.forEach(function (r) { learnRecord_(lf, r, {}, r); });
    learnFlush_();
  });
  props.setProperty('DEMO_LEARNED', nowStr_());
}

/** Puts your account on the US desk: opening a Ready dispute shows the copy desk. */
function demoUseUsView() {
  const me = currentUser_();
  if (isUsDesk_(me)) { Logger.log(me + ' is already on the US desk view. Reload the web app.'); return; }
  appendRecords_(TABS.options, [optionRecord_('UsDeskUser', me, { source: 'seed', addedBy: 'demoUseUsView()' })]);
  clearOptionsCache_();
  Logger.log(me + ' now sees the US desk view. Reload the web app.');
}

/** Takes your account off the US desk: you see the Lebanon entry screens. */
function demoUseLebanonView() {
  const me = String(currentUser_()).toLowerCase();
  const removed = deleteWhere_(TABS.options, function (r) { return r.List === 'UsDeskUser' && String(r.Value).toLowerCase() === me; });
  clearOptionsCache_();
  Logger.log(removed ? me + ' now sees the Lebanon view. Reload the web app.' : me + ' was already on the Lebanon view.');
}

/** Removes every demo dispute: its rows in all tabs and its Drive folder. Real disputes and the lists are untouched. */
function clearDemoData() {
  [TABS.disputes, TABS.lines, TABS.files, TABS.log].forEach(function (name) {
    if (!ss_().getSheetByName(name)) return;
    deleteWhere_(name, function (r) { return String(r.DisputeID).indexOf(DEMO_PREFIX) === 0; });
  });
  const root = rootFolder_();
  const it = root.getFolders();
  const cached = [];
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(DEMO_PREFIX) === 0) { f.setTrashed(true); cached.push('folder:' + f.getName()); }
  }
  if (cached.length) CacheService.getScriptCache().removeAll(cached);
  CacheService.getScriptCache().remove('defaults');
  Logger.log('Demo data removed.');
}

// ------------------------------------------------------------------ helpers

function addDemoFile_(fileRecs, folder, id, category, lineNo, name, title, lines) {
  const file = createDemoPdf_(folder, name, title, lines);
  fileRecs.push({ DisputeID: id, Category: category, LineNo: lineNo, Name: name, Url: file.getUrl(), FileId: file.getId(),
    UploadedBy: 'demo', UploadedAt: nowStr_(), Size: 20480 });
  return file;
}

function createDemoPdf_(folder, name, title, lines) {
  const html = '<html><body style="font-family:Arial;color:#003B5C">' +
    '<p style="background:#FEF3DC;padding:8px;font-weight:bold">SYNTHETIC DEMO DOCUMENT - not a real claim or patient</p>' +
    '<h2>' + title + '</h2>' + lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</body></html>';
  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF).setName(name);
  return folder.createFile(blob);
}

// Deterministic pseudo-random number in [0, 1) so every seed gives the same demo.
function rand_(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function pick_(list, i) { return list[i % list.length]; }
function pad2_(n) { return String(n).padStart(2, '0'); }
function pad3_(n) { return String(n).padStart(3, '0'); }
function money_(n) { return (Math.round(n * 100) / 100).toFixed(2); }
function daysAgo_(from, days) { return new Date(from.getTime() - days * 86400000); }
function isoToDate_(iso) { return new Date(isoToUtc_(iso)); }
function isoDate_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function stamp_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
