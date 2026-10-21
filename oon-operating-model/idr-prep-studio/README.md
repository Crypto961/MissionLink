# IDR Initiation Prep Studio

An internal Google Apps Script web app. Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the federal IDR portal page by page. The US desk then copies every field into the portal with one click per field.

Nothing in this app connects to, or sends anything to, the CMS portal.

The app learns as it is used. Every dropdown list lives in the **Options** tab and grows as people save. The values used most are suggested first, and the defaults follow what recent disputes used. See [The learning system](#the-learning-system).

| File | What it is |
| --- | --- |
| `Code.gs` | Server code: portal field schema, Sheet storage, Drive uploads, validation, deadlines, the learning system, Insights, Lists admin, confirmation PDF, US desk actions, `setup()` |
| `Index.html` | The app: dispute list, the five entry pages, the summary, the US copy desk, Insights and Lists (admins) |
| `Pdf.html` | Layout of the confirmation PDF (the summary page) |
| `DemoData.gs` | Optional. Synthetic demo disputes, view switching for demos, and cleanup |

## How it works

| Step | Who | Screen | Mirrors portal page |
| --- | --- | --- | --- |
| 1 | Lebanon | Qualification · page 1: billing entity, Tax ID, NPI, plan type | Qualification Questions |
| 2 | Lebanon | Qualification · page 2: open negotiation start (with the deadline helper), evidence upload, consent, what you are disputing | Qualification Questions (page 2) |
| 3 | Lebanon | Parties: plan or issuer (from the payer address book), provider or facility (from the billing entity), points of contact (collapsed) | Notice of IDR Initiation (page 3) |
| 4 | Lebanon | Line items, one per claim, up to 50, each with its QPA documentation | Notice of IDR Initiation (page 4, repeated per line) |
| 5 | Lebanon | Summary, additional documents, certified IDR entity, third party attestation, **Save & create confirmation PDF** | Notice of IDR Initiation (final page) |
| 6 | US desk | Copy desk: every value in portal order with a **Copy** button, documents to download, then **Mark as filed** with the portal's dispute number (`DISP-1234567`) and the portal confirmation PDF | All pages |

- **Confirmation PDF.** It reproduces the summary page: the Summary of Qualified Items table, the dispute details and the document list. It is saved in the dispute's Drive folder and linked from the dispute.
- **Portal confirmation.** The US desk must attach the portal's own confirmation PDF and enter the portal dispute number (`DISP-` and 7 digits) to mark a dispute filed. To return a dispute, the US desk picks a reason (from the ReturnReason list, or types a new one) and says what to fix.
- **Copied formats.** Values are copied the way the portal expects them:
  - Dates as `Sep 15, 2026`.
  - Amounts as `154.00`.
  - Phones as `(817) 566-1232`. People can type `817-566-1232` or `8175661232`; the app stores the portal format. ZIP codes take 5 or 9 digits.
  - Radio and checkbox answers are shown as "Select" or "Tick" instructions.

## Deploy (about 15 minutes)

1. Create a Google Sheet named **IDR Prep Studio**.
2. In the Sheet, open **Extensions → Apps Script**.
3. Replace the default `Code.gs` with this `Code.gs`.
4. Add two HTML files with **+ → HTML**, named exactly **Index** and **Pdf**, and paste in `Index.html` and `Pdf.html`.
5. In the editor's left bar, click **Services +**, choose **Google Sheets API** and click **Add**. Keep the identifier `Sheets`. This makes the app much faster. Without it, the app still works but is slower.
6. Select **setup** in the function menu and click **Run**. Approve the permissions prompt. This creates:
   - The tabs **Disputes**, **LineItems**, **Files**, **Options**, **Settings** and **Log**.
   - The seed lists in **Options**: billing entities, payers, IDR entities, the health plan type, service codes, place of service codes, modifiers, return reasons, US federal holidays (2026 and 2027) and states.
   - The **Settings** rows: `LearningMode` = `On`, `DefaultWindow` = `50`, `DefaultShare` = `0.8`.
   - A Drive folder named **IDR Prep Studio - Disputes**.
   - You as the first US desk user and the first admin (only when those lists are empty).
7. In the **Options** tab:
   - Add one row per US desk user: `UsDeskUser` in List, their email in Value.
   - Add one row per admin: `Admin` in List, their email in Value. Admins see the **Lists** screen.
   - Each December, add next year's federal holidays to the **Holiday** list (Value `YYYY-MM-DD`, Label the holiday's name). The deadline helper uses them.
8. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone within your organization
9. Share the web app URL with the team. Everyone signs in with their Google Workspace account.

When you change the code later:
1. Run **setup** again. It is safe to re-run:
   - It adds the columns of new fields at the end of each tab, and adds seed values and settings that are missing. It never duplicates a value or changes one you edited.
   - It keeps every tab as plain text so typed dates and amounts stay exactly as entered. Any cells Sheets had already turned into dates or numbers are written back as text.
   - **Upgrading from the first version:** the old Options tab (List | Value | Note) is rewritten with the new columns. Its rows are kept (Source `seed`, Status `Active`); the Note column and the 7 placeholder Health Plan Types are dropped.
2. Use **Deploy → Manage deployments → Edit → New version** so the same URL picks up the change.

The Drive API advanced service is not needed. It does no harm if you have already added it.

## The learning system

The **Options** tab is the single source for every list. One row per value:

| Column | What it holds |
| --- | --- |
| List | The list name, such as `Payer` or `ServiceCode` |
| Value | The value as it is typed into the portal |
| Label | A display name or description (for service codes, the description) |
| Data | For address-book lists, the profile as JSON: a payer's address, email and phone; a billing entity's role, Tax ID, NPI, group name and contact details |
| Count | How many disputes or lines used it |
| LastUsed | When it was last saved |
| Source | `seed` (from setup) or `learned` (typed by a user) |
| Status | `Active`, or `Hidden` (never suggested) |
| AddedBy, AddedAt | Who added it and when |

**Lists:** BillingEntity, Payer, IdrEntity, HealthPlanType, ServiceCode, PosCode, Modifier, ReturnReason, Team, Owner, Holiday, UsDeskUser, Admin, State.

**How it learns:**
- **Suggestions while typing.** These fields take free typing, with suggestions ranked by Count, then LastUsed: health insurance plan, billing entity, health plan type, certified IDR entity, service code, modifiers, place of service, team, owner and the return reason. State stays a strict list.
- **Learn on save.** Every save of a page, a line item or a return adds new values to their list (Source `learned`, Count 1) and adds 1 to the Count of known ones. Saving the same dispute again does not count twice. Address-book lists also keep the latest non-empty profile fields. Everyone sees new values on their next page load.
- **Address book.** Picking a payer fills the plan's address, email, phone and fax. Picking a billing entity fills I'm a(n), Tax ID, NPI, the hospital, facility or group name, the designation and the provider's contact details. Picking a service code fills the description. Only empty fields are filled. **Refill from …** overwrites them. The billing entity can be picked on page 1 (internal box) or page 3; it is the same field.
- **Typo protection.** A typed value within 2 edits of a known one (case, spaces and punctuation ignored) shows "Did you mean …?". The user must pick **Use it** or **Keep** before saving. For example, `SILVER ALLIANCE,LLC` suggests `SILVER ALLIANCE LLC`. Values whose digits differ are never treated as typos (`99284` and `99285`, `Team 1` and `Team 11`). Values that differ only in case or punctuation are counted on the existing row and never create a second one.
- **Learned defaults.** Fields with a default start with it on a new dispute or line, marked with a **default** chip. The default is the value used most in the last `DefaultWindow` saved records when its share is at least `DefaultShare` (and at least 5 records have the field); otherwise it is the seeded default. They are recomputed every 10 minutes.

| Field | Seeded default |
| --- | --- |
| Was the service provided prior to 1/1/2022? | No |
| I am (or I am acting on behalf of) a | none (comes from the billing entity) |
| Health Plan Type | Either partially or fully self-insured ERISA group health plan |
| Consent to waive protections | No |
| What are you disputing today? | A batched dispute |
| Billing entity (provider name) | none, learned |
| Certified IDR entity | the most used one (Maximus Federal Services Inc at seed) |
| Third Party Attestation | No |
| Type of item or service | Emergency item(s)/service(s) |
| Place of Service Code | 23 |
| Location of Service | TX |
| Service Code Modifier(s) | blank |

## Settings

The **Settings** tab has one row per key (Key | Value | Note). Edits take effect within a minute.

| Key | Default | What it does |
| --- | --- | --- |
| `LearningMode` | `On` | **On:** values users type are active at once. **Off:** they are added as Hidden and wait for an admin in **Lists**. |
| `DefaultWindow` | `50` | How many recent saved disputes (and line items) the learned defaults look at |
| `DefaultShare` | `0.8` | The share of those records one value needs to become the default (0 to 1; `80%` also works) |

## Training phase

Keep `LearningMode` = `On` for the first weeks. Every new payer, billing entity, IDR entity, code, team and owner people type becomes usable at once, and the lists fill from real work.

During training, open **Insights** (button on the dispute list, for everyone). It shows:
- The top values of each list, with their uses and share.
- The defaults the app now suggests, whether each is learned or seeded, and its share of recent saves.
- How many values were added this week, and how many wait for an admin.

When the lists look complete, an admin cleans them up in **Lists** and sets `LearningMode` to `Off`. From then on, new values still save on the dispute, but they only appear as suggestions after an admin activates them.

## Lists (admins)

Users in the **Admin** list see a **Lists** button on the dispute list. For each list it shows every value with its uses, last use, source and status, and flags values that look like another one ("Looks like: …").
- **Save label:** changes the display name or description.
- **Hide / Activate:** hidden values are never suggested and never become a default.
- **Merge into:** moves the uses and the profile into another value and hides this one. Later saves of the old value count toward the new one, and typing it suggests the new one. Merging into a value that does not exist yet renames the value.

Merging does not change disputes already saved. You can also edit the Options tab directly; the app picks up the change right away.

## Checks and deadlines

- **Deadline helper.** Under the open negotiation start date: "Open negotiation ends … Initiate by … (n business days left)." Open negotiation is 30 business days counted from the day after it starts; the dispute must be initiated in the next 4 business days. Weekends and the **Holiday** list are skipped. For example, a start of Sep 1, 2026 ends open negotiation on Oct 15 and must be initiated by Oct 21. It turns red on the last day. Once it has passed, the dispute cannot be sent to the US desk. The dispute list and the copy desk show the date too.
- **Not eligible.** "Prior to 1/1/2022" = Yes or "consent to waive protections" = Yes shows "Not eligible for federal IDR" and blocks sending to the US desk.
- **Line items.** A new line starts with the previous line's claim number, date, item type, place of service and location. **Duplicate line** copies a whole line. One QPA upload can cover every line of the same claim ("Use for all lines with this claim number"), and a new line with the same claim number reuses it. The initial payment is suggested as QPA minus cost sharing.
- **Warnings (do not block):** cost sharing more than the QPA; cost sharing plus initial payment different from the QPA; "Single dispute" with more than one claim number; a claim number already in another dispute that is not Returned; open negotiation still running. They show on the line items page, the summary, the copy desk and the confirmation PDF.
- **Blanks on a notice.** "N/A", "-" or a lone "$" in a required field count as blank.

## Demo data

Add `DemoData.gs` as a second script file (**+ → Script**, name it **DemoData**). Then run these from the editor's function menu:

| Function | What it does |
| --- | --- |
| `seedDemoData` | Creates 10 synthetic disputes, `IDR-DEMO-001` to `IDR-DEMO-010`, with documents in Drive (about a minute). Running it again replaces them. They use the seeded payers, billing entities, IDR entities and service codes, so Insights shows trends. Claims (`DEMO-…`), amounts and dates are made up. The first run also adds to the list counts (teams and owners appear as learned values); later runs do not add again. |
| `demoUseLebanonView` | Takes your account off the US desk, so you see the Lebanon entry screens |
| `demoUseUsView` | Puts your account back on the US desk, so Ready disputes open in the copy desk |
| `clearDemoData` | Deletes every `IDR-DEMO-` dispute, its rows and its Drive folder. Real disputes and the lists are untouched. |

After switching views, reload the web app.

**What the demo data covers:**

| Dispute | Stage | Shows |
| --- | --- | --- |
| 001 | Draft | Stopped after Qualification page 1 |
| 002 | Draft | Stopped part-way through the parties page |
| 003 | Draft | 2 line items, not yet finalized |
| 004 | Returned | Sent back by the US desk with a reason (Wrong amount: line 2 does not add up) |
| 005 to 008 | Ready for US desk | 1, 3, 5 and 12 line items, each with a confirmation PDF. 006 is a "Single dispute" with two claims (shows the warning). 007 has a provider point of contact. 008 shows the multi-page line items. |
| 009 to 010 | Filed | Portal dispute number recorded |

Every demo deadline is still ahead (open negotiation started 36 to 45 days before seeding).

**A suggested demo:**
1. **Lebanon view (`demoUseLebanonView`):**
   - Open 003, add a line item (see what it copies from line 1), and finalize it to create the confirmation PDF.
   - Start a new dispute and type `SILVER ALLIANCE,LLC` as the billing entity to see the typo check, then pick it to see the address book fill.
   - Then open 004 to show a returned dispute.
2. **US view (`demoUseUsView`):**
   - Open 008 and copy fields across the line tabs.
   - Mark it filed with any number like `DISP-0000001` and any PDF, then return 006 with a reason.
   - Open **Insights** to show the trends.
3. **Lebanon view again:** 006 now appears under Returned, showing the reason.

## Access and data

- Everyone in your Workspace can prepare disputes and see Insights. Only users listed as `UsDeskUser` see the copy desk and can mark disputes filed or return them. Only users listed as `Admin` can change lists in the app.
- Filed disputes are locked: no more edits to the header, line items or files.
- Uploaded documents are stored in Drive under the account that deployed the app.
- Every save, upload, status change, copy-desk filing and list change is written to the **Log** tab with the user's email.
- The seed lists hold business data only (payers, our billing entities, IDR entities, codes). No claim numbers, dates of service or account numbers from the notices are stored in the code or the lists.

## Speed

- **Opening the app:** the first screen's data is built into the page, so the list shows without a second server call.
- **Saving:** a page save takes about 5 Sheet calls, down from about 75. Each row is written in one call, and one request reads all the tabs a screen needs.
- **Fewer round trips:** every save, upload and status change sends back the updated dispute, so the screen updates without a second request.
- **Uploads:** several files picked at once upload in parallel.
- **Lists:** a list you have already opened shows immediately and then refreshes in the background.
- **Options cache:** the Options lists, including US desk users, are cached for 10 minutes. A save that learns a new value, an admin change, or an edit to the Options or Settings tab clears the cache right away. If a change doesn't show, reload the web app.
- **Learning cost:** a save that learns adds at most 2 Sheet calls (new values appended in one, counts updated in one).

## Limits worth knowing

- Files must be under 45 MB each. The portal's limit is 500 MB for the whole dispute.
- A dispute is capped at 50 line items. That matches the portal's rule for open negotiation start dates on or after November 1, 2026.
- The provider-side fields (name, group name, address, email, phone, fax), Tax ID, NPI, "What are you disputing today?", the certified IDR entity and the third party attestation come from the Notices of IDR Initiation. If the portal shows more fields, add them to `schema_()` in `Code.gs`; the entry screens, copy desk and learning pick them up automatically.
- Only one Health Plan Type has been seen so far. Others are added as people type them.
- The holiday list must be extended each year (2026 and 2027 are seeded).
