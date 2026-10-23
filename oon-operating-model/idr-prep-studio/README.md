# IDR Initiation Prep Studio (v3)

An internal Google Apps Script web app. Lebanon prepares each Notice of IDR Initiation here, on 7 pages that follow the federal **IDR Gateway** web form page by page. The US desk then copies every field into the portal from top to bottom, with one click per field.

Nothing in this app connects to, or sends anything to, the CMS portal.

v3 follows the official **IDR Gateway Notice of IDR Initiation User Guide, version 15.0 (October 14, 2026)**. It also builds in three fixed business facts:
- **We always initiate.** The Studio only prepares initiations by a provider or facility. Plan-side questions and air ambulance options are not built.
- **We are always a health care provider or a health care facility.** "I am (or I am acting on behalf of) a" has only these two options. It comes from the billing entity.
- **The location of service is always Texas.** It is fixed to `TX` on every line, and is still copied to the portal. Our contact state defaults to TX.

The app learns as it is used. Every dropdown list lives in the **Options** tab and grows as people save. The values used most are suggested first, and the defaults follow what recent disputes used. See [The learning system](#the-learning-system).

| File | What it is |
| --- | --- |
| `Code.gs` | Server code: portal field schema, Sheet storage, Drive uploads, the portal's rules, deadlines, the learning system, Insights, Lists admin, confirmation PDF, US desk actions, `setup()` and the v3 upgrade |
| `Index.html` | The app: dispute list, the 7 entry pages, the US copy desk, Insights and Lists (admins) |
| `Pdf.html` | Layout of the confirmation PDF |
| `DemoData.gs` | Optional. Synthetic demo disputes, view switching for demos, and cleanup |

## IDR Gateway transition: dates for the US desk

- **From November 13, 2026**, the Notice of IDR Initiation web form is inside the IDR Gateway. You sign in, then choose **Disputes → Start a Dispute**.
- For a limited time, the form still works without signing in. **After January 15, 2027** it is only available inside the IDR Gateway.
- **Every US desk user needs an IDR Gateway account joined to our organization** before January 15, 2027. Joined users can also see our disputes under **Disputes → View All Disputes**.
- If you used the portal before, clear the browser cache or use a private window so the updated form loads.
- The copy desk shows a banner with these dates until January 15, 2027.

## Page order (same as the portal)

| Page | Studio page | What it holds |
| --- | --- | --- |
| 1 | Introduction & Qualification Questions | Billing entity (internal box, fills the rest), prior to 1/1/2022, I am a(n), Tax ID and NPI, Health Plan Type, FEHB enrollment code, open negotiation start date with the timing helper, evidence upload, extension reason and its evidence, consent to waive |
| 2 | Dispute Type | A single dispute (then: bundled payment arrangement? Yes or No) or a batched dispute (then: "I reviewed the batching questions and this dispute qualifies") |
| 3 | Initiating party contact | Health care provider name (billing entity), Hospital, Health Care Facility or Group Name, email, phone, fax, mailing address, city, state, ZIP; points of contact (collapsed) |
| 4 | Non-initiating party contact | Insurance provider type (from the plan type), Health Insurance Plan or Company (payer address book), email, phone, fax, address; points of contact (collapsed) |
| 5 | Dispute Line Items | The portal's summary table as a grid, with Edit, Duplicate, Delete, Add line item, and Paste lines from a spreadsheet |
| 6 | Preferred Certified IDR Entity & Conflict of Interest | IDRE legal business name, the third-party question, the conflict of interest attestation, additional documents; initiating party and date shown as filled by the portal |
| 7 | Review & Submit | Every page with its status and an Edit link, the summary table, warnings, and **Save & create confirmation PDF** (sends it to the US desk) |

Then the **US desk** copies it into the portal and marks it filed.

**Moving around.** The stepper at the top shows each page with a ✓ or the number of things to fix. The footer stays at the bottom of the screen with Back, Save and Save & Continue. **Enter** moves to the next field and **Ctrl+S** saves the page (or the open line). Save keeps your work even when something is still missing; Save & Continue checks the page first.

**Locked chips.** Values that the app sets show as a grey chip, not an input:
- Location of Service: `TX` (fixed).
- I am a(n): from the billing entity, once a saved dispute has confirmed it. **Change** unlocks it.
- Insurance provider type: from the Health Plan Type. **Change** unlocks it.
- Initiating party and date on page 6: the portal fills them.

## The portal's rules in the Studio

### Qualification (page 1)
- **Prior to 1/1/2022 = Yes** or **consent to waive = Yes**: "Not eligible for federal IDR". The dispute cannot go to the US desk.
- **Tax ID or NPI**: at least one is required, not both. Tax ID is 9 digits, NPI is 10 digits.
- **Health Plan Type** is a strict list of the portal's 7 options, in the portal's order: Individual health insurance issuer; Fully-insured ERISA group health plan; Federal Employees Health Benefits (FEHB) carrier; Either partially or fully self-insured ERISA group health plan; Church plan; Non-federal governmental plan (e.g., state or local government plan); No Plan/Issuer Response. New values are not learned, but use counts still set the default (seeded: "Either partially or fully self-insured ERISA group health plan"). A note under it says that Medicare, Medicaid, CHIP, TRICARE or health care sharing ministry coverage is not eligible.
- **FEHB carrier**: the 3-digit enrollment code shows and is required.
- **Open negotiation timing.** The portal counts business days with the open negotiation start date itself as **business day 1** (weekends and the Holiday list are skipped; a start date that is not a business day does not count). Let b be the business days from the start date to today:
  - **b < 31: blocked.** "If the parties can't agree on an out-of-network rate, the 30-business-day open negotiation period must elapse before starting the Federal IDR process." The helper shows the first allowed initiation date.
  - **31 to 34: initiation window.** The helper shows "Initiation window: first day to last day (n business days left)".
  - **b > 34: extension reason required.** Pick one of the portal's two reasons:
    - "I received an extension approval from the Federal IDR mailbox..." → upload the extension approval.
    - "The item(s) or service(s) under dispute was subject to the cooling off period." → enter the dispute reference number (`DISP-` and digits) and upload the payment determination(s).
    - Without a reason, the dispute is blocked with "Deadline passed".
  - Example: a start of Sep 1, 2026 ends open negotiation on Oct 14; the window is Oct 15 to Oct 20, 2026. A start of Sep 2 gives Oct 16 to Oct 21. Real filings on those days were accepted by the portal.
- **Evidence.** At least one file. In a batch with different open negotiation start dates, enter the first claim's date and upload a notice for each start date.

### Dispute type (page 2) and line items (page 5)
The answer on page 2 sets the line-item layout the portal uses:

| Page 2 answer | Layout | Line rules |
| --- | --- | --- |
| A single dispute, not bundled | Single Line Item – Not Bundled | Exactly 1 line. No Add line item. |
| A single dispute, bundled | Single Line Item – Bundled | Line 1 is the "Bundled Item or Service" (the disputed code). Lines 2 and on are "Component Item or Service" (optional). The grid shows the Line Item Type. |
| A batched dispute | Batched Items or Services | At least 2 lines ("Batched items or services require two or more line items."). At most 50 when the open negotiation started on or after Nov 1, 2026 (the portal's message). The Studio caps every dispute at 50. All dates of service within 30 business days of each other, unless the cooling off extension applies. |

If you change the dispute type after entering lines, the portal asks for the lines again: check page 5.

**Each line item:**
- Description, claim number, date of service, QPA, cost sharing (required) and initial payment (optional).
- **Claim number**: up to 40 letters and digits, no spaces or symbols.
- **Date of service** must be **before** the open negotiation start date.
- Item type: checkboxes, default Emergency item(s)/service(s); "Other" needs a description. Air ambulance is not offered.
- **Service code**: exactly 5 letters or digits.
- **Modifiers**: up to 4 codes of 2 letters or digits. They are stored and copied as the portal shows them: `25; 59`.
- **Place of service**: 2 digits, default 23.
- **Location**: fixed TX.
- QPA documentation: at least one file per line. "Use for all lines with this claim number" links one upload to every line of the claim.
- **Complex State attestation.** If the location is on the `ComplexStates` setting (empty by default), a required tick box shows: "I have reviewed the state-specific eligibility criteria regarding the IDR processes for this item or service, and attest that this item or service is eligible for the Federal IDR process."

**Duplicate lines.** The portal refuses a line with the same claim number, date of service, service code and modifier(s) as a line in an earlier dispute. There are two exceptions: the earlier dispute was closed as ineligible because of the cooling off period, or this dispute has an approved extension.
- The Studio blocks a line that repeats a line of a dispute that is **Ready for US desk** or **Filed**. Draft and Returned disputes do not count.
- The block is lifted only when this dispute has an extension reason. A warning then reminds you to check that the exception really applies.
- A repeat inside the same dispute is always blocked.

Improperly batched or bundled resubmissions use the portal's separate **"Notice of IDR Initiation – Resubmission"** form. That form is out of scope for the Studio, and the duplicate check does not apply to it.

**Paste lines from a spreadsheet** (batched and bundled disputes):
- Copy rows from Excel or Sheets in this order: description, claim number, date of service, QPA, cost sharing, initial payment, service code, modifiers, POS.
- **Check rows** validates each row. **Add** saves them all at once, and only when every row is fine.
- Dates can be `MM/DD/YYYY` or `YYYY-MM-DD`.
- Item type takes the default and location is TX. A blank description is taken from the service code list.

**Files.** Each file must be under 45 MB (an Apps Script limit). The whole dispute must stay under 500 MB (the portal's limit), counting the files the US desk uploads to the portal.

### Contact pages (3 and 4)
- Initiating party: provider name, **Hospital, Health Care Facility or Group Name (now required)**, email, phone, mailing address, city, state, ZIP. Fax is optional.
- Non-initiating party: the **insurance provider type** is set from the plan type: Individual health insurance issuer → Individual health insurance issuer; FEHB carrier → Federal Employee Health Benefits (FEHB) carrier; all others → Group health plan. You can change it.
- **Points of contact** start collapsed. Once a contact name is entered, the full contact is required, including the mailing address.
- **Characters the portal accepts.** The portal checks these when a field loses focus, and so does the Studio:
  - **Names** (provider, group, plan or company, points of contact, signature): letters (accented too), digits, spaces and `, - ’ ' . & ~`.
  - **Addresses and cities**: the same, plus `# / \ :`.
  - Anything else shows an error with a **Fix** button that removes the rejected characters. For example, "GEHA (Government Employees Health Association, Inc.)" becomes "GEHA Government Employees Health Association, Inc.".
  - The Lists screen flags seeded or learned names the portal would reject.

### Page 6
- IDRE legal business name (default: the most used).
- The third-party question (default No): "Is the undersigned individual below a third-party administrator or other service provider initiating on behalf of the plan, issuer, carrier, or Health Care Provider/Health Care Facility/Provider of Air Ambulance Services?"
- The conflict of interest attestation (required tick).
- Additional documents.
- The portal fills the initiating party and the date itself.

## US desk steps

1. Open a dispute under **Ready for US desk**. It opens in the copy desk.
2. Read the **IDR Gateway** banner. Sign in to the IDR Gateway (from Nov 13, 2026), then choose **Disputes → Start a Dispute**.
3. The portal form must be **finished in one session**. It times out after 60 minutes of inactivity and saves nothing when you leave it. Start only when you can finish this dispute in one sitting. Click **Start portal entry** to start the 60-minute timer; it warns you at 50 minutes.
4. Copy each value, top to bottom. The sections follow the portal's pages:
   - **Pages 1 to 4.** Radio and checkbox answers show as "Select" or "Tick" instructions.
   - **Line items**, one tab per line, in the order of the portal's summary table: Description, Claim Number (Line Item Type for bundled disputes), Date, QPA, Location, Service Code, Modifier(s), POS. Cost sharing, initial payment, item types and the QPA documents follow. Use **Save & Add Another** between lines in the portal.
   - **Page 6** and the attestations, then **Review & Submit** in the portal.
5. Download the documents from the dispute folder and upload them where the copy desk says **Upload in portal**.
6. In the portal, select **Submit**. On the confirmation page, select **Save as PDF**.
7. **Send the non-initiating party a copy of the Notice of IDR Initiation the same day.** This is required.
8. **Mark as filed**:
   - The portal dispute number (`DISP-` and digits).
   - The Notice of IDR Initiation PDF.
   - The date and method (Email, Mail, Fax or Portal) you sent the notice to the non-initiating party.

   If that date is not the filing day, the dispute and Insights show a warning.
9. **Optional, later:** record the certified IDR entity finally selected and its status (Pending, Accepted preferred, Alternate accepted, Alternate denied). If the non-initiating party picks another entity, the portal lets you accept or deny it. This tracking never blocks anything.
10. **Something wrong?** Pick a reason, say what to fix, and click **Return to Lebanon**.

Copied formats:
- Dates as `Sep 15, 2026`.
- Amounts as `154.00`.
- Phones as `(817) 566-1232`.
- Modifiers as `25; 59`.

## Deploy (about 15 minutes)

1. Create a Google Sheet named **IDR Prep Studio**.
2. In the Sheet, open **Extensions → Apps Script**.
3. Replace the default `Code.gs` with this `Code.gs`.
4. Add two HTML files with **+ → HTML**, named exactly **Index** and **Pdf**, and paste in `Index.html` and `Pdf.html`.
5. Click **Services +**, choose **Google Sheets API** and click **Add**. Keep the identifier `Sheets`. This makes the app much faster; without it the app still works, more slowly.
6. Select **setup** in the function menu and click **Run**. Approve the permissions prompt. This creates:
   - The tabs **Disputes**, **LineItems**, **Files**, **Options**, **Settings** and **Log**.
   - The seed lists in **Options** (see [Seed lists](#seed-lists)).
   - The **Settings** rows: `LearningMode` = `On`, `DefaultWindow` = `50`, `DefaultShare` = `0.8`, `ComplexStates` = empty.
   - A Drive folder named **IDR Prep Studio - Disputes**.
   - You as the first US desk user and the first admin (only when those lists are empty).
7. In the **Options** tab:
   - Add one row per US desk user (`UsDeskUser` in List, their email in Value).
   - Add one row per admin (`Admin`, email). Admins see the **Lists** screen.
   - Each December, add next year's federal holidays to the **Holiday** list (Value `YYYY-MM-DD`). The timing rules use them.
8. **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone within your organization**.
9. Share the web app URL with the team.

## Upgrade from v2

1. Replace `Code.gs`, `Index.html`, `Pdf.html` (and `DemoData.gs` if you use it).
2. Run **setup** once. It is safe to run again; a second run changes nothing. It:
   - **Adds the new columns** at the end of each tab and never moves existing ones:
     - Disputes: `dispute_type`, `bundled_payment`, `batch_qualifies`, `fehb_enrollment_code`, `extension_reason`, `cooling_dispute_ref`, `coi_attest`, `nip_notified_date`, `nip_notified_method`, `idre_final`, `idre_status`.
     - LineItems: `state_attest`.
     - Files: `Size`.
   - **Moves saved disputes to the new fields:**
     - The v2 "What are you disputing today?" becomes the dispute type: "Single dispute" → A single dispute, not bundled; "A batched dispute" → A batched dispute; "A bundled dispute" → A single dispute, bundled. The line-item layout (`dispute_kind`) is derived from it.
     - The insurance provider types get the portal's spelling: "Group Health Plan" → "Group health plan", "Federal Employees Health Benefits (FEHB) carrier" → "Federal Employee Health Benefits (FEHB) carrier".
     - An empty "I am a(n)" is taken from the v2 health care designation.
     - Modifiers are rewritten as `25; 59`.
   - **Updates the lists:**
     - Renames "SILVER ALLIANCE LLC" and "CAPITAL HEALTH PLLC" to their legal names, "Silver Alliance, LLC" and "Capital Health, PLLC". Counts and profiles stay.
     - Merges "United Healthcare" into **UHC** and "BLUECROSS BLUESHIELD" into **BCBS**. The old names stay as hidden aliases.
     - Hides Health Plan Types that are not one of the portal's 7 options.
     - Drops the unused seed code 99281.
     - Adds every missing seed value.
3. **Deploy → Manage deployments → Edit → New version**, so the same URL picks up the change.
4. Look at disputes still in Draft or Returned. They may now need:
   - The batching tick box.
   - The group name, which is now required.
   - The conflict of interest attestation.
   - Claim numbers without symbols.
   - An extension reason, if they are past day 34.

## Seed lists

| List | Seed |
| --- | --- |
| BillingEntity | Our 24 billing entities, exactly as the business spelled them. The first guess for "I am a(n)" comes from the legal form: PLLC = health care provider, LLC = health care facility. It shows a "guess from the name: check it" chip until a saved dispute confirms it. Silver Alliance, LLC (facility) and Capital Health, PLLC (provider, group "Totalcare ER, Cedar Hill") keep their full v2 profiles from the notices. The other profiles are learned on their first save. |
| Payer | The 124 non-initiating parties (plans, issuers, TPAs) given by the business. UMR, UHC, BCBS and Cigna have address-book profiles from the notices. Aliases: United Healthcare → UHC, BLUECROSS BLUESHIELD → BCBS, Health Now → HealthNow. BENEFITS HEALTHSMART and Healthsmart stay separate. |
| ServiceCode | 373 codes. Descriptions are seeded only for the 29 codes seen on the notices; the others are learned on first save. |
| HealthPlanType | The portal's 7 options (strict) |
| PlanRole, ActingAs, ExtensionReason, DisputeType | The portal's options (reference lists) |
| IdrEntity, PosCode, Modifier, ReturnReason, Holiday, State | As in v2 (ReturnReason adds "Duplicate line item") |
| Team, Owner | Learned on save |

**Names to confirm with the business.** These are kept exactly as given:
- "Deerfield plains"
- "Silver choice"
- "Cedar Physcians"
- "WRFER University" (the others are "WFRER Denton" and "WFRER Cooper")
- "RSER Benbrook"

Also check that "BENEFITS HEALTHSMART" and "Healthsmart" really are different TPAs.

**Portal characters.** The payer "GEHA (Government Employees Health Association, Inc.)" has parentheses, which the portal rejects in name fields. Use **Fix** when entering it, or rename it in **Lists**.

## The learning system

The **Options** tab is the single source for every list. One row per value:

| Column | What it holds |
| --- | --- |
| List | The list name, such as `Payer` or `ServiceCode` |
| Value | The value as it is typed into the portal |
| Label | A display name or description (for service codes, the description) |
| Data | Address-book profile as JSON (a payer's address, email and phone; a billing entity's I am a(n), whether a saved dispute confirmed it, Tax ID, NPI, group name and contact details); `mergedInto` for aliases |
| Count | How many disputes or lines used it |
| LastUsed | When it was last saved |
| Source | `seed` (from setup) or `learned` (typed by a user) |
| Status | `Active`, or `Hidden` (never suggested) |
| AddedBy, AddedAt | Who added it and when |

- **Suggestions while typing.** These fields take free typing, with suggestions ranked by Count, then LastUsed:
  - Health insurance plan or company, billing entity, IDRE.
  - Service code, modifiers, place of service.
  - Team, owner and the return reason.

  Health Plan Type and State are strict lists.
- **Learn on save.** Every save of a page, a line item, a pasted set of lines or a return adds new values (Source `learned`, Count 1) and adds 1 to the Count of known ones. Saving the same dispute again does not count twice. Address-book lists keep the latest non-empty profile fields.
- **Address book.**
  - Picking a payer fills its contact fields.
  - Picking a billing entity fills I am a(n), Tax ID, NPI, the group name and the contact fields.
  - Picking a service code fills the description.
  - Only empty fields are filled, or fields that still hold the previously picked entity's values. **Refill from …** overwrites the rest.
- **Typo protection.** A value within 2 edits of a known one shows "Did you mean …?" (case, spaces and punctuation are ignored). For example, `SILVER ALLIANCE,LLC` suggests `Silver Alliance, LLC`. Values whose digits differ are never typos of each other.
- **Learned defaults.** A field's default is the value used most in the last `DefaultWindow` saves, when its share is at least `DefaultShare` and at least 5 records have the field. Otherwise it is the seeded default. Defaults show with a **default** chip.

| Field | Seeded default |
| --- | --- |
| Prior to 1/1/2022? | No |
| Health Plan Type | Either partially or fully self-insured ERISA group health plan |
| Consent to waive protections | No |
| What are you disputing today? | A batched dispute |
| Billing entity (provider name) | none, learned |
| Initiating party state | TX |
| IDRE legal business name | the most used one (Maximus Federal Services Inc at seed) |
| Third-party question | No |
| Type of item or service | Emergency item(s)/service(s) |
| Place of Service Code | 23 |
| Service Code Modifier(s) | blank |

## Settings

The **Settings** tab has one row per key. Edits take effect within a minute.

| Key | Default | What it does |
| --- | --- | --- |
| `LearningMode` | `On` | **On:** values users type are active at once. **Off:** they are added as Hidden and wait for an admin in **Lists**. |
| `DefaultWindow` | `50` | How many recent saved disputes (and line items) the learned defaults look at |
| `DefaultShare` | `0.8` | The share one value needs to become the default (0 to 1; `80%` also works) |
| `ComplexStates` | empty | States on CMS's Complex State list, comma separated (like `TX, NM`). Lines located in one of them need the state-specific attestation. **Open question:** is TX on the list? |

## Training phase, Insights and Lists

- Keep `LearningMode` = `On` for the first weeks.
- **Insights** (for everyone) shows:
  - The top values of each list.
  - The defaults now suggested.
  - The values added this week.
  - Filed disputes whose notice to the non-initiating party was **not sent on the filing day**.
- **Lists** (for admins) lets you:
  - Rename, merge, hide or reactivate values.
  - See values that look like another one, and names the portal would reject (with what Fix would give).
- Merging moves the uses and the profile into another value and hides the old one. Later saves of the old value count toward the new one.

## Demo data

Add `DemoData.gs` as a second script file (**+ → Script**, name it **DemoData**). Then run these from the editor's function menu:

| Function | What it does |
| --- | --- |
| `seedDemoData` | Creates 11 synthetic disputes, `IDR-DEMO-001` to `IDR-DEMO-011`, with synthetic documents in Drive. Running it again replaces them. |
| `demoUseLebanonView` / `demoUseUsView` | Switch your account between the Lebanon entry screens and the US copy desk |
| `clearDemoData` | Deletes every `IDR-DEMO-` dispute, its rows and its Drive folder |

The demo data is all synthetic:
- Claim numbers start with `DEMO` and use letters and digits only, as the portal requires.
- Amounts, dates of service, people, portal dispute numbers and documents are made up.
- The payers, billing entities, IDR entities and service codes come from the seed lists.
- The open negotiation start dates are set so the window is open **on the day you seed**. Seed again on a later day to refresh them.

| Dispute | Stage | Shows |
| --- | --- | --- |
| 001 | Draft | Stopped after page 1 |
| 002 | Draft | Stopped part-way through the initiating party page |
| 003 | Draft | Batch with 2 lines, not yet finalized |
| 004 | Returned | Batch of 3; returned for "Wrong amount" (line 2 does not add up) |
| 005 | Ready | **Single Line Item – Not Bundled** (1 line, fully-insured plan) |
| 006 | Ready | **Single Line Item – Bundled**: the bundled item plus 2 components |
| 007 | Ready | Batch of 5 with a point of contact and modifiers `25; 59` |
| 008 | Ready | Batch of 12 |
| 009 | Ready | **Cooling off period extension**: business day 40, dispute reference and determination uploaded; dates of service more than 30 business days apart (allowed) |
| 010 | Filed | Notice sent the same day; IDR entity accepted |
| 011 | Filed | Single line item; notice sent the day after filing (shows the warning in Insights) |

## Access and data

- Everyone in your Workspace can prepare disputes and see Insights.
- Only `UsDeskUser` users see the copy desk, mark disputes filed, record the IDR entity selection, or return disputes.
- Only `Admin` users can change lists in the app.
- Filed disputes are locked.
- Uploaded documents are stored in Drive under the account that deployed the app.
- Every save, upload, status change and list change is written to the **Log** tab.
- The seed lists hold business data only: our billing entities, payers, IDR entities and codes. No claim numbers, dates of service or account numbers from the notices are stored in the code, the lists or the demo data.

## Speed

- **Opening the app:** the first screen's data is built into the page, so it opens without a second server call.
- **Reading:** one request reads every tab a screen needs.
- **Writing:** each row is written in one call; a pasted set of lines is written in one call too.
- **Fewer round trips:** every save, upload and status change sends back the updated dispute.
- **Options cache:** about 650 option rows are cached for 10 minutes in a compact form that stays under the 100 KB cache limit. A save that learns, an admin change, or an edit to the Options or Settings tab clears the cache.

## Limits and open questions

- **Open question:** is TX on CMS's Complex State list? If it is, set `ComplexStates` to `TX`, and every line will ask for the state-specific attestation.
- **Open question:** what should a facility enter as "Hospital, Health Care Facility or Group Name"? It is now required, and the notices left it blank for Silver Alliance. The demo uses the facility's own name.
- **Blocked before day 31.** Lebanon can save drafts at any time, but a dispute can only go to the US desk inside the window (or with an extension reason). This matches the portal.
- **Alert texts.** The guide shows the portal's alerts for "prior to 1/1/2022" and "consent to waive" only as pictures. The Studio uses its own wording.
- **Batches with several start dates.** The open negotiation start date is entered once per dispute, as in the portal. The Studio cannot check that a notice was uploaded for each distinct start date.
- **Files.** Each file must be under 45 MB (Apps Script).
- **Holidays.** The holiday list must be extended each year (2026 and 2027 are seeded).
