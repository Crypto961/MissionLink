# IDR Initiation Prep Studio

An internal Google Apps Script web app. Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the federal IDR portal page by page. The US desk then copies every field into the portal with one click per field.

Nothing in this app connects to, or sends anything to, the CMS portal.

| File | What it is |
| --- | --- |
| `Code.gs` | Server code: portal field schema, Sheet storage, Drive uploads, validation, confirmation PDF, US desk actions, `setup()` |
| `Index.html` | The app: dispute list, the five entry pages, the summary, and the US copy desk |
| `Pdf.html` | Layout of the confirmation PDF (the summary page) |
| `DemoData.gs` | Optional. Synthetic demo disputes, view switching for demos, and cleanup |

## How it works

| Step | Who | Screen | Mirrors portal page |
| --- | --- | --- | --- |
| 1 | Lebanon | Qualification · page 1 | Qualification Questions |
| 2 | Lebanon | Qualification · page 2, with the open negotiation evidence upload | Qualification Questions (page 2) |
| 3 | Lebanon | Parties: plan or issuer, provider designation, points of contact | Notice of IDR Initiation (page 3) |
| 4 | Lebanon | Line items, one per claim, up to 50, each with its QPA documentation | Notice of IDR Initiation (page 4, repeated per line) |
| 5 | Lebanon | Summary, additional documents, **Save & create confirmation PDF** | Notice of IDR Initiation (final page) |
| 6 | US desk | Copy desk: every value in portal order with a **Copy** button, documents to download, then **Mark as filed** with the portal's dispute number | All pages |

- **Confirmation PDF.** It reproduces the summary page: the Summary of Qualified Items table, the dispute details and the document list. It is saved in the dispute's Drive folder and linked from the dispute.
- **Portal confirmation.** The US desk can also attach the portal's own confirmation PDF when marking the dispute filed.
- **Copied formats.** Values are copied the way the portal expects them:
  - Dates as `Sep 15, 2026`.
  - Amounts as `154.00`.
  - Radio and checkbox answers are shown as "Select" or "Tick" instructions.

## Deploy (about 15 minutes)

1. Create a Google Sheet named **IDR Prep Studio**.
2. In the Sheet, open **Extensions → Apps Script**.
3. Replace the default `Code.gs` with this `Code.gs`.
4. Add two HTML files with **+ → HTML**, named exactly **Index** and **Pdf**, and paste in `Index.html` and `Pdf.html`.
5. In the editor's left bar, click **Services +**, choose **Google Sheets API** and click **Add**. Keep the identifier `Sheets`. This makes the app much faster. Without it, the app still works but is slower.
6. Select **setup** in the function menu and click **Run**. Approve the permissions prompt. This creates:
   - The tabs **Disputes**, **LineItems**, **Files**, **Options** and **Log**.
   - A Drive folder named **IDR Prep Studio - Disputes**.
   - You as the first US desk user.
7. In the **Options** tab:
   - Add one row per US desk user, with `UsDeskUser` in List and their email in Value.
   - Replace the **HealthPlanType** rows with the exact wording of the portal's Health Plan Type list. The portal loads that list on demand, so it wasn't in the saved pages.
   - The **State** list is already filled in.
8. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone within your organization
9. Share the web app URL with the team. Everyone signs in with their Google Workspace account.

When you change the code later:
1. Run **setup** again. It is safe to re-run, and it keeps every tab as plain text so typed dates and amounts stay exactly as entered. Any cells Sheets had already turned into dates or numbers are written back as text.
2. Use **Deploy → Manage deployments → Edit → New version** so the same URL picks up the change.

The Drive API advanced service is not needed. It does no harm if you have already added it.

## Demo data

Add `DemoData.gs` as a second script file (**+ → Script**, name it **DemoData**). Then run these from the editor's function menu:

| Function | What it does |
| --- | --- |
| `seedDemoData` | Creates 10 synthetic disputes, `IDR-DEMO-001` to `IDR-DEMO-010`, with documents in Drive (about a minute). Running it again replaces them. |
| `demoUseLebanonView` | Takes your account off the US desk, so you see the Lebanon entry screens |
| `demoUseUsView` | Puts your account back on the US desk, so Ready disputes open in the copy desk |
| `clearDemoData` | Deletes every `IDR-DEMO-` dispute, its rows and its Drive folder. Real disputes are untouched. |

After switching views, reload the web app.

**What the demo data covers:**

| Dispute | Stage | Shows |
| --- | --- | --- |
| 001 | Draft | Stopped after Qualification page 1 |
| 002 | Draft | Stopped part-way through the parties page |
| 003 | Draft | 2 line items, not yet finalized |
| 004 | Returned | Sent back by the US desk with a reason (a QPA mismatch) |
| 005 to 008 | Ready for US desk | 1, 3, 5 and 12 line items, each with a confirmation PDF. 008 shows the multi-page line items. |
| 009 to 010 | Filed | Portal dispute number recorded |

**A suggested demo:**
1. **Lebanon view (`demoUseLebanonView`):**
   - Open 003, add a line item, and finalize it to create the confirmation PDF.
   - Then open 004 to show a returned dispute.
2. **US view (`demoUseUsView`):**
   - Open 008 and copy fields across the line tabs.
   - Mark it filed with any number, then return 006 with a reason.
3. **Lebanon view again:** 006 now appears under Returned, showing the reason.

## Access and data

- Everyone in your Workspace can prepare disputes. Only users listed as `UsDeskUser` see the copy desk and can mark disputes filed or return them.
- Filed disputes are locked: no more edits to the header, line items or files.
- Uploaded documents are stored in Drive under the account that deployed the app. Before real claim documents go in, confirm that your Google Workspace HIPAA BAA covers Drive and Sheets.
- Every save, upload, status change and copy-desk filing is written to the **Log** tab with the user's email.

## Speed

- **Opening the app:** the first screen's data is built into the page, so the list shows without a second server call.
- **Saving:** a page save takes about 5 Sheet calls, down from about 75. Each row is written in one call, and one request reads all the tabs a screen needs.
- **Fewer round trips:** every save, upload and status change sends back the updated dispute, so the screen updates without a second request.
- **Uploads:** several files picked at once upload in parallel.
- **Lists:** a list you have already opened shows immediately and then refreshes in the background.
- **Options cache:** the Options lists, including US desk users, are cached for 10 minutes. Editing the Options tab clears the cache right away. If a change doesn't show, reload the web app.

## Limits worth knowing

- Files must be under 45 MB each. The portal's limit is 500 MB for the whole dispute.
- A dispute is capped at 50 line items. That matches the portal's rule for open negotiation start dates on or after November 1, 2026.
- The portal's provider-side fields that only appear after a designation is chosen weren't in the saved pages. If you see more fields there, add them to `schema_()` in `Code.gs`; the entry screens and copy desk pick them up automatically.
