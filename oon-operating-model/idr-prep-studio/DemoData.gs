/**
 * Demo data for IDR Initiation Prep Studio.
 *
 * Add this file next to Code.gs (+ > Script, name it DemoData), then run from the editor:
 *   seedDemoData()      creates 10 synthetic disputes across the whole cycle
 *   demoUseUsView()     adds you to the US desk (copy desk view)
 *   demoUseLebanonView() removes you from the US desk (Lebanon entry view)
 *   clearDemoData()     deletes every demo dispute, its rows and its Drive folder
 *
 * All names, addresses, claims and documents are made up. Demo disputes use ids that
 * start with IDR-DEMO- so they are easy to spot and remove.
 */

const DEMO_PREFIX = 'IDR-DEMO-';

const DEMO_PLANS = [
  { name: 'Lone Star Benefit Plan (Demo)', role: 'Group Health Plan', city: 'Austin', zip: '78701' },
  { name: 'Northwind Health Insurance Co (Demo)', role: 'Individual health insurance issuer', city: 'Houston', zip: '77002' },
  { name: 'Bluebonnet Employer Trust (Demo)', role: 'Group Health Plan', city: 'Dallas', zip: '75201' },
  { name: 'Prairie Mutual Health (Demo)', role: 'Individual health insurance issuer', city: 'San Antonio', zip: '78205' },
  { name: 'Federal Employee Sample Carrier (Demo)', role: 'Federal Employees Health Benefits (FEHB) carrier', city: 'Fort Worth', zip: '76102' }
];

const DEMO_FACILITIES = ['Frisco', 'Denton', 'Cedar Hill', 'Garland', 'Weatherford', 'Desoto', 'Benbrook'];
const DEMO_STREETS = ['Main St', 'Commerce St', 'Elm St', 'Congress Ave', 'Preston Rd', 'Camp Bowie Blvd', 'Lamar Blvd'];
const DEMO_CODES = [
  { code: '99285', desc: 'Emergency department visit, high severity' },
  { code: '99284', desc: 'Emergency department visit, moderate-high severity' },
  { code: '99283', desc: 'Emergency department visit, moderate severity' },
  { code: '99291', desc: 'Critical care, first 30-74 minutes' },
  { code: '71046', desc: 'Chest X-ray, 2 views' },
  { code: '74177', desc: 'CT abdomen and pelvis with contrast' }
];
const DEMO_TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
const DEMO_OWNERS = ['R. Haddad', 'M. Khoury', 'J. Saad', 'L. Nassar', 'S. Aoun', 'N. Fares', 'K. Daher'];
const DEMO_LEBANON_USERS = ['r.haddad@demo.example', 'm.khoury@demo.example', 'j.saad@demo.example'];

// Which stage each demo dispute is left in, and how many line items it has.
const DEMO_PLAN = [
  { stage: 'draft-q1', lines: 0 },
  { stage: 'draft-parties', lines: 0 },
  { stage: 'draft-lines', lines: 2 },
  { stage: 'returned', lines: 3, reason: 'Line 2 QPA does not match the remittance advice. Please re-check the EOB and re-attach.' },
  { stage: 'ready', lines: 1 },
  { stage: 'ready', lines: 3 },
  { stage: 'ready', lines: 5 },
  { stage: 'ready', lines: 12 },
  { stage: 'filed', lines: 2 },
  { stage: 'filed', lines: 4 }
];

// ------------------------------------------------------------------ public functions

function seedDemoData() {
  if (!ss_().getSheetByName(TABS.disputes)) setup();
  clearDemoData();

  const disputesSh = tab_(TABS.disputes);
  const linesSh = tab_(TABS.lines);
  const dHeader = disputesSh.getRange(1, 1, 1, disputesSh.getLastColumn()).getValues()[0];
  const lHeader = linesSh.getRange(1, 1, 1, linesSh.getLastColumn()).getValues()[0];
  const planTypes = options_().HealthPlanType || ['Fully insured group health plan'];
  const me = currentUser_();
  const today = new Date();

  DEMO_PLAN.forEach(function (spec, i) {
    const id = DEMO_PREFIX + String(i + 1).padStart(3, '0');
    const plan = DEMO_PLANS[i % DEMO_PLANS.length];
    const facility = DEMO_FACILITIES[i % DEMO_FACILITIES.length];
    const isFacility = i % 3 !== 2;
    const designation = isFacility ? 'Health care facility' : 'Health care provider';
    const preparer = DEMO_LEBANON_USERS[i % DEMO_LEBANON_USERS.length];
    const created = daysAgo_(today, 12 - i);
    const onStart = isoDate_(daysAgo_(today, 40 + i * 2));
    const folder = disputeFolder_(id);

    // ---- header (pages 1-3)
    const v = {
      DisputeID: id, Status: STATUS.draft, Team: pick_(DEMO_TEAMS, i), Owner: pick_(DEMO_OWNERS, i),
      CreatedBy: preparer, CreatedAt: stamp_(created), UpdatedBy: preparer, UpdatedAt: stamp_(daysAgo_(today, Math.max(0, 6 - i))),
      FolderUrl: folder.getUrl(),
      q_prior_2022: 'No', q_acting_as: designation, q_plan_type: pick_(planTypes, i)
    };
    if (spec.stage !== 'draft-q1') {
      Object.assign(v, { on_start_date: onStart, consent_waiver: 'No' });
      Object.assign(v, {
        plan_role: plan.role, plan_name: plan.name,
        plan_addr1: (100 + i * 37) + ' ' + pick_(DEMO_STREETS, i), plan_addr2: 'Suite ' + (200 + i),
        plan_city: plan.city, plan_state: 'TX', plan_zip: plan.zip,
        plan_email: 'idr.disputes' + (i + 1) + '@plan-demo.example', plan_phone: '512-555-01' + pad2_(i), plan_fax: '512-555-02' + pad2_(i),
        plan_p1_name: 'Plan Dispute Analyst ' + (i + 1), plan_p1_email: 'analyst' + (i + 1) + '@plan-demo.example', plan_p1_phone: '512-555-03' + pad2_(i),
        prov_designation: designation,
        prov_p1_name: pick_(DEMO_OWNERS, i), prov_p1_addr1: (500 + i * 11) + ' ' + pick_(DEMO_STREETS, i + 3),
        prov_p1_city: facility, prov_p1_state: 'TX', prov_p1_zip: '75' + String(100 + i * 7).slice(-3),
        prov_p1_email: 'idr.team' + (i + 1) + '@er-demo.example', prov_p1_phone: '214-555-04' + pad2_(i)
      });
    }
    if (spec.stage === 'draft-parties') {
      // Stopped part-way through the parties page.
      ['prov_designation', 'prov_p1_name', 'prov_p1_addr1', 'prov_p1_city', 'prov_p1_state', 'prov_p1_zip', 'prov_p1_email', 'prov_p1_phone']
        .forEach(function (k) { delete v[k]; });
    }

    // ---- documents and line items
    if (spec.stage !== 'draft-q1') {
      addDemoFile_(folder, id, 'on_evidence', '', 'Notice of Open Negotiation - ' + id + '.pdf',
        'Notice of Open Negotiation', ['Sent to: ' + plan.name, 'Open negotiation start date: ' + onStart]);
    }

    const lineRows = [];
    let eob = null;
    for (let n = 1; n <= spec.lines; n++) {
      const c = DEMO_CODES[(i + n) % DEMO_CODES.length];
      const qpa = money_(150 + rand_(i * 31 + n) * 1350);
      const line = {
        DisputeID: id, LineNo: n,
        claim_number: 'CLM' + (70000 + i * 100 + n),
        service_date: isoDate_(daysAgo_(today, 70 + i * 2 + n)),
        description: c.desc,
        qpa: qpa,
        cost_sharing: money_(rand_(i + n) * 100),
        initial_payment: money_(Number(qpa) * (0.4 + rand_(n * 7 + i) * 0.4)),
        item_types: c.code.charAt(0) === '9' ? 'Emergency item(s)/service(s); Hospital-based service(s)' : 'Emergency item(s)/service(s); Professional service(s)',
        other_desc: '',
        service_code: c.code,
        modifiers: c.code.charAt(0) === '9' ? '25' : '26',
        pos_code: '23',
        location: 'TX'
      };
      lineRows.push(lHeader.map(function (h) { return line[h] !== undefined ? String(line[h]) : ''; }));
      // One synthetic EOB per dispute, attached to every line, keeps seeding fast.
      if (!eob) {
        eob = createDemoPdf_(folder, 'EOB and remittance - ' + id + '.pdf', 'Explanation of Benefits / Remittance Advice',
          ['Payer: ' + plan.name, 'Claims in this file: ' + spec.lines]);
      }
      tab_(TABS.files).appendRow([id, 'qpa', n, eob.getName(), eob.getUrl(), eob.getId(), preparer, stamp_(created)]);
    }
    if (lineRows.length) linesSh.getRange(linesSh.getLastRow() + 1, 1, lineRows.length, lHeader.length).setValues(lineRows);

    // ---- stage-specific status
    if (spec.stage === 'returned' || spec.stage === 'ready' || spec.stage === 'filed') {
      if (spec.lines >= 5) {
        addDemoFile_(folder, id, 'additional', '', 'Payer correspondence - ' + id + '.pdf', 'Additional supporting documentation',
          ['Correspondence with ' + plan.name + ' during open negotiation.']);
      }
    }
    if (spec.stage === 'returned') {
      v.Status = STATUS.returned;
      v.ReadyAt = stamp_(daysAgo_(today, 3));
      v.ReturnReason = spec.reason;
    }
    if (spec.stage === 'ready' || spec.stage === 'filed') {
      v.Status = STATUS.ready;
      v.ReadyAt = stamp_(daysAgo_(today, spec.stage === 'filed' ? 5 : 1));
    }
    if (spec.stage === 'filed') {
      v.Status = STATUS.filed;
      v.FiledBy = me;
      v.FiledAt = stamp_(daysAgo_(today, 2));
      v.PortalDisputeNumber = 'DISP-DEMO-' + (480000 + i * 17);
    }

    disputesSh.appendRow(dHeader.map(function (h) { return v[h] !== undefined ? String(v[h]) : ''; }));

    // The confirmation PDF is built from the saved rows, exactly as the app does it.
    if (spec.stage === 'ready' || spec.stage === 'filed' || spec.stage === 'returned') {
      const pdfUrl = buildConfirmationPdf_(id);
      setCells_(disputesSh, findRow_(disputesSh, 'DisputeID', id), { ConfirmationPdfUrl: pdfUrl });
    }
    log_(id, 'demo-seed', spec.stage + ', ' + spec.lines + ' line(s)');
  });

  Logger.log('Demo data ready: ' + DEMO_PLAN.length + ' disputes (' + DEMO_PREFIX + '001 to ' + DEMO_PREFIX + pad3_(DEMO_PLAN.length) + ').');
  Logger.log('You are ' + (isUsDesk_(me) ? 'on the US desk view.' : 'on the Lebanon view.') + ' Run demoUseUsView() or demoUseLebanonView() to switch.');
}

/** Puts your account on the US desk: opening a Ready dispute shows the copy desk. */
function demoUseUsView() {
  const me = currentUser_();
  if (isUsDesk_(me)) { Logger.log(me + ' is already on the US desk view. Reload the web app.'); return; }
  tab_(TABS.options).appendRow(['UsDeskUser', me, 'Added by demoUseUsView()']);
  Logger.log(me + ' now sees the US desk view. Reload the web app.');
}

/** Takes your account off the US desk: you see the Lebanon entry screens. */
function demoUseLebanonView() {
  const me = String(currentUser_()).toLowerCase();
  const sh = tab_(TABS.options);
  const data = sh.getDataRange().getValues();
  let removed = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === 'UsDeskUser' && String(data[i][1]).toLowerCase() === me) { sh.deleteRow(i + 1); removed++; }
  }
  Logger.log(removed ? me + ' now sees the Lebanon view. Reload the web app.' : me + ' was already on the Lebanon view.');
}

/** Removes every demo dispute: its rows in all tabs and its Drive folder. Real disputes are untouched. */
function clearDemoData() {
  [TABS.disputes, TABS.lines, TABS.files, TABS.log].forEach(function (name) {
    const sh = ss_().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const data = sh.getDataRange().getValues();
    const col = name === TABS.log ? 2 : 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][col]).indexOf(DEMO_PREFIX) === 0) sh.deleteRow(i + 1);
    }
  });
  const root = rootFolder_();
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(DEMO_PREFIX) === 0) f.setTrashed(true);
  }
  Logger.log('Demo data removed.');
}

// ------------------------------------------------------------------ helpers

function addDemoFile_(folder, id, category, lineNo, name, title, lines) {
  const file = createDemoPdf_(folder, name, title, lines);
  tab_(TABS.files).appendRow([id, category, lineNo, name, file.getUrl(), file.getId(), 'demo', nowStr_()]);
  return file;
}

function createDemoPdf_(folder, name, title, lines) {
  const html = '<html><body style="font-family:Arial;color:#003B5C">' +
    '<p style="background:#FEF3DC;padding:8px;font-weight:bold">SYNTHETIC DEMO DOCUMENT - not a real claim, patient or payer</p>' +
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
