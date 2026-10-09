# IDR Initiation Prep Studio

An internal Google Apps Script web app. Lebanon prepares each Notice of IDR Initiation here, on screens that mirror the federal IDR portal page by page. The US desk then copies every field into the portal with one click per field.

Nothing in this app connects to, or sends anything to, the CMS portal.

| File | What it is |
| --- | --- |
| `Code.gs` | Server code: portal field schema, Sheet storage, Drive uploads, validation, confirmation PDF, US desk actions, `setup()` |
| `Index.html` | The app: dispute list, the five entry pages, the summary, and the US copy desk |
| `Pdf.html` | Layout of the confirmation PDF (the summary page) |

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
5. Select **setup** in the function menu and click **Run**. Approve the permissions prompt. This creates:
   - The tabs **Disputes**, **LineItems**, **Files**, **Options** and **Log**.
   - A Drive folder named **IDR Prep Studio - Disputes**.
   - You as the first US desk user.
6. In the **Options** tab:
   - Add one row per US desk user, with `UsDeskUser` in List and their email in Value.
   - Replace the **HealthPlanType** rows with the exact wording of the portal's Health Plan Type list. The portal loads that list on demand, so it wasn't in the saved pages.
   - The **State** list is already filled in.
7. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone within your organization
8. Share the web app URL with the team. Everyone signs in with their Google Workspace account.

When you change the code later, use **Deploy → Manage deployments → Edit → New version** so the same URL picks up the change.

## Access and data

- Everyone in your Workspace can prepare disputes. Only users listed as `UsDeskUser` see the copy desk and can mark disputes filed or return them.
- Filed disputes are locked: no more edits to the header, line items or files.
- Uploaded documents are stored in Drive under the account that deployed the app. Before real claim documents go in, confirm that your Google Workspace HIPAA BAA covers Drive and Sheets.
- Every save, upload, status change and copy-desk filing is written to the **Log** tab with the user's email.

## Limits worth knowing

- Files must be under 45 MB each. The portal's limit is 500 MB for the whole dispute.
- A dispute is capped at 50 line items. That matches the portal's rule for open negotiation start dates on or after November 1, 2026.
- The portal's provider-side fields that only appear after a designation is chosen weren't in the saved pages. If you see more fields there, add them to `schema_()` in `Code.gs`; the entry screens and copy desk pick them up automatically.
