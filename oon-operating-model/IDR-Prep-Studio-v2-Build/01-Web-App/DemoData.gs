/**
 * Demo data for IDR Initiation Prep Studio.
 *
 * Add this file next to Code.gs (+ > Script, name it DemoData), then run from the editor:
 *   seedDemoData()      creates 10 synthetic disputes across the whole cycle
 *   demoUseUsView()     adds you to the US desk (copy desk view)
 *   demoUseLebanonView() removes you from the US desk (Lebanon entry view)
 *   clearDemoData()     deletes every demo dispute, its rows and its Drive folder
 *
 * Claims, amounts, dates, people and documents are made up. The payers, billing entities,
 * IDR entities and service codes come from the seeded lists, so Insights and the learned
 * defaults show realistic trends. Demo disputes use ids that start with IDR-DEMO- and
 * claim numbers that start with DEMO-, so they are easy to spot and remove.
 */

const DEMO_PREFIX = 'IDR-DEMO-';

const DEMO_STREETS = ['Main St', 'Commerce St', 'Elm St', 'Congress Ave', 'Preston Rd', 'Camp Bowie Blvd', 'Lamar Blvd'];
const DEMO_TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
const DEMO_OWNERS = ['R. Haddad', 'M. Khoury', 'J. Saad', 'L. Nassar', 'S. Aoun', 'N. Fares', 'K. Daher'];
const DEMO_LEBANON_USERS = ['r.haddad@demo.example', 'm.khoury@demo.example', 'j.saad@demo.example'];
// Used only when the ServiceCode list is empty (setup() not run yet).
const DEMO_CODES_FALLBACK = [{ v: '99284', l: 'EMERGENCY ROOM SERVICE' }, { v: '94761', l: 'MEASURE BLOOD OXYGEN LEVEL' },
  { v: 'A4670', l: 'AUTOMATIC BLOOD PRESSURE MONITOR' }, { v: 'A6413', l: 'ADHESIVE BANDAGE, FIRST-AID' }];

// Which stage each demo dispute is left in, how many line items it has, and what it shows.
const DEMO_PLAN = [
  { stage: 'draft-q1', lines: 0 },
  { stage: 'draft-parties', lines: 0 },
  { stage: 'draft-lines', lines: 2 },
  { stage: 'returned', lines: 3, mismatch: 2, reason: 'Wrong amount',
    details: 'Line 2: cost sharing plus initial payment does not equal the QPA. Re-check the EOB and re-attach.' },
  { stage: 'ready', lines: 1, kind: 'Single dispute' },
  { stage: 'ready', lines: 3, claims: 2, kind: 'Single dispute' }, // shows the "Single dispute" warning
  { stage: 'ready', lines: 5, poc: true },
  { stage: 'ready', lines: 12 },
  { stage: 'filed', lines: 2 },
  { stage: 'filed', lines: 4 }
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
  const payers = (lists.Payer || []).filter(function (p) { return p.d; });
  const entities = (lists.BillingEntity || []).filter(function (e) { return e.d; });
  const idrEntities = options_().IdrEntity || ['Maximus Federal Services Inc'];
  const codes = (lists.ServiceCode || []).length ? lists.ServiceCode : DEMO_CODES_FALLBACK;
  const erCodes = codes.filter(function (c) { return /^9928/.test(c.v); });
  const others = codes.filter(function (c) { return !/^9928/.test(c.v); });
  if (!payers.length || !entities.length) throw new Error('Run setup() first: the Payer and BillingEntity lists are empty.');
  const me = currentUser_();
  const today = new Date();

  DEMO_PLAN.forEach(function (spec, i) {
    const id = DEMO_PREFIX + String(i + 1).padStart(3, '0');
    const payer = payers[i % payers.length];
    // Three in four disputes are the facility, as on the notices seen so far.
    const entity = entities[i % 4 === 3 && entities.length > 1 ? 1 : 0];
    const ed = entity.d;
    const preparer = DEMO_LEBANON_USERS[i % DEMO_LEBANON_USERS.length];
    const created = daysAgo_(today, 12 - i);
    // Open negotiation started 36 to 45 days ago, so every demo deadline is still ahead.
    const onStart = isoDate_(daysAgo_(today, 36 + i));
    const folder = disputeFolder_(id);

    // ---- header (pages 1-3 and the final page)
    const v = {
      DisputeID: id, Status: STATUS.draft, Team: pick_(DEMO_TEAMS, i), Owner: pick_(DEMO_OWNERS, i),
      CreatedBy: preparer, CreatedAt: stamp_(created), UpdatedBy: preparer, UpdatedAt: stamp_(daysAgo_(today, Math.max(0, 6 - i))),
      FolderUrl: folder.getUrl(),
      q_prior_2022: 'No', q_acting_as: ed.acting_as, tin: ed.tin, npi: ed.npi, q_plan_type: PLAN_TYPE_DEFAULT,
      prov_name: entity.v
    };
    if (spec.stage !== 'draft-q1') {
      Object.assign(v, { on_start_date: onStart, consent_waiver: 'No', dispute_kind: spec.kind || 'A batched dispute' });
      Object.assign(v, {
        plan_role: 'Group Health Plan', plan_name: payer.v,
        plan_addr1: payer.d.addr1 || '', plan_city: payer.d.city || '', plan_state: payer.d.state || '', plan_zip: payer.d.zip || '',
        plan_email: payer.d.email || '', plan_phone: payer.d.phone || '', plan_fax: payer.d.fax || '',
        prov_group_name: ed.group_name || '', prov_designation: ed.acting_as,
        prov_addr1: ed.addr1, prov_city: ed.city, prov_state: ed.state, prov_zip: ed.zip, prov_email: ed.email, prov_phone: ed.phone
      });
      if (spec.poc) {
        Object.assign(v, {
          prov_p1_name: pick_(DEMO_OWNERS, i), prov_p1_addr1: (500 + i * 11) + ' ' + pick_(DEMO_STREETS, i + 3),
          prov_p1_city: 'Fort Worth', prov_p1_state: 'TX', prov_p1_zip: '76132',
          prov_p1_email: 'idr.team' + (i + 1) + '@er-demo.example', prov_p1_phone: '(817) 555-04' + pad2_(i)
        });
      }
    }
    if (spec.stage === 'draft-parties') {
      // Stopped part-way through the parties page.
      ['prov_designation', 'prov_addr1', 'prov_city', 'prov_state', 'prov_zip', 'prov_email', 'prov_phone']
        .forEach(function (k) { delete v[k]; });
    }
    if (spec.stage === 'returned' || spec.stage === 'ready' || spec.stage === 'filed') {
      v.idr_entity = i % 4 === 1 ? idrEntities[1] || idrEntities[0] : idrEntities[0];
      v.third_party_attest = 'No';
    }

    // ---- documents and line items
    if (spec.stage !== 'draft-q1') {
      addDemoFile_(fileRecs, folder, id, 'on_evidence', '', 'Open negotiation notice - ' + id + '.pdf',
        'Notice of Open Negotiation', ['Sent to: ' + payer.v, 'Open negotiation start date: ' + onStart]);
    }

    // One claim per dispute (as on every notice seen), except where the plan asks for more.
    const claimCount = spec.claims || 1;
    const eobs = [];
    for (let n = 1; n <= spec.lines; n++) {
      const claimNo = Math.min(claimCount, Math.ceil(n * claimCount / spec.lines));
      const c = n === 1 ? pick_(erCodes.length ? erCodes : codes, i) : pick_(others.length ? others : codes, i * 3 + n);
      const qpa = money_(n === 1 ? 450 + rand_(i * 31 + n) * 900 : 15 + rand_(i * 31 + n) * 400);
      const cost = n === 1 && i % 3 === 0 ? money_(Number(qpa) * 0.1) : '0.00';
      const initial = spec.mismatch === n ? money_(Number(qpa) * 0.5) : money_(Number(qpa) - Number(cost));
      lineRecs.push({
        DisputeID: id, LineNo: n,
        claim_number: 'DEMO-' + (70000 + i * 100 + claimNo),
        service_date: isoDate_(daysAgo_(today, 70 + i * 2 + claimNo)),
        description: c.l || 'EMERGENCY ROOM SERVICE',
        qpa: qpa, cost_sharing: cost, initial_payment: initial,
        item_types: 'Emergency item(s)/service(s)', other_desc: '',
        service_code: c.v, modifiers: '', pos_code: '23', location: 'TX'
      });
      // One synthetic EOB per claim, attached to every line of that claim.
      if (!eobs[claimNo]) {
        eobs[claimNo] = createDemoPdf_(folder, 'EOB - ' + id + ' claim ' + claimNo + '.pdf', 'Explanation of Benefits / Remittance Advice',
          ['Payer: ' + payer.v, 'Synthetic claim DEMO-' + (70000 + i * 100 + claimNo)]);
      }
      const eob = eobs[claimNo];
      fileRecs.push({ DisputeID: id, Category: 'qpa', LineNo: n, Name: eob.getName(), Url: eob.getUrl(), FileId: eob.getId(),
        UploadedBy: preparer, UploadedAt: stamp_(created) });
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
      v.Status = STATUS.filed;
      v.FiledBy = me;
      v.FiledAt = stamp_(daysAgo_(today, 2));
      v.PortalDisputeNumber = 'DISP-0' + (480000 + i * 17); // synthetic, in the portal's DISP-1234567 format
    }

    disputeRecs.push(v);
    if (spec.stage === 'ready' || spec.stage === 'filed' || spec.stage === 'returned') needPdf.push(id);
    logRecs.push({ Timestamp: nowStr_(), User: me, DisputeID: id, Event: 'demo-seed', Details: spec.stage + ', ' + spec.lines + ' line(s)' });
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
    UploadedBy: 'demo', UploadedAt: nowStr_() });
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
function isoDate_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function stamp_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
