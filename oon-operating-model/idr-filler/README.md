# IDR Bundle Filler: demo kit

A Chrome extension that fills the current page of an IDR form from a prepared bundle, plus a Google Sheets backend and a practice form to demonstrate it.

The operator checks every field and clicks Submit. The extension never submits, never moves to the next page, never ticks attestations, and never uploads files.

```
idr-filler/
├── apps-script/                 Google Sheets backend + practice form
│   ├── Code.gs                  JSON API, audit log, setup() with sample data
│   └── DemoForm.html            Two-page practice IDR initiation form
└── extension/                   Chrome extension (Manifest V3)
    ├── manifest.json
    ├── background.js            Opens the side panel from the toolbar icon
    ├── sidepanel.html/.css/.js  Bundle queue, Fill / Check / Clear, Mark filed / Return
    ├── page-actions.js          Runs on the form page: fills, checks, highlights
    ├── options.html/.js         Web app URL, API token, operator name
    └── icons/
```

> **Demo only.** Use the synthetic sample data. Do not point this at the real IDR Gateway, or load real patient data, until legal sign-off and the Gateway terms check (Gate 0 in the Model B plan) are done.

---

## 1. Set up the backend in Google Sheets (about 10 minutes)

1. Create a Google Sheet named **IDR Bundles (Demo)**.
2. Open **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with `apps-script/Code.gs`.
4. Add an HTML file: click **+ → HTML**, name it exactly **DemoForm**, and paste in `apps-script/DemoForm.html`.
5. Select the `setup` function and click **Run**. Approve the permissions prompt.
   - This creates the tabs **Bundles** (3 sample bundles), **Mappings**, **Log** and **DemoSubmissions**.
   - It also creates an API token.
6. Open **Executions** (or View → Logs) and copy the **API token** from the log.
7. Click **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone. This is for the demo with synthetic data; the token still protects the API.
8. Copy the **Web app URL**, which ends in `/exec`.

Check that it works: open `<web app URL>?page=form`. You should see the practice form with an orange "practice form" banner.

## 2. Install the extension (about 2 minutes)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder (unzip `idr-filler-extension.zip` first).
4. Pin **IDR Bundle Filler** to the toolbar.
5. Right-click the icon, choose **Options**, then enter:
   - the web app URL,
   - the API token,
   - your name.
6. Click **Save**.

## 3. Five-minute leadership demo

1. **Open the form.** Go to `<web app URL>?page=form` in a tab, then click the toolbar icon to open the side panel. It lists the 3 ready bundles from the Sheet.
2. **Pick a bundle.** Click **BND-1001** and expand **Bundle values** to show the data Lebanon prepared.
3. **Fill page 1.** Click **Fill this page**. All 10 fields fill and turn green, and the panel says "All 10 fields on this page match the bundle".
   - Point out that the tool stopped. It didn't click **Next page**.
4. **Page 2.** Click **Next page** in the form yourself, then **Fill this page** again.
   - 10 fields turn green.
   - The attestation box and the document upload get an amber dashed outline, because those stay with the operator.
5. **Show the safety check.** Change the QPA in the form to `999.99`, then click **Check this page**. The field turns red and the panel shows "bundle: 612.40, form: 999.99". Change it back.
6. **The operator finishes.** Tick the attestation, optionally attach any PDF, and click **Submit**. The form shows a practice confirmation number such as `DEMO-1A2B3C4D`.
7. **Close the loop.** Paste that number into the panel and click **Mark as filed**. The bundle leaves the queue.
8. **Show the audit trail in the Sheet:**
   - **Bundles:** status Filed, plus who filed it, when, and the confirmation number.
   - **Log:** every open, fill and check, with field counts.
   - **DemoSubmissions:** what the form received.

**Return to Lebanon** sends a bundle back with a reason. You can reset a bundle for another demo by changing its Status in the Sheet back to `Ready`.

## 4. How mapping to a form works

Each row in the **Mappings** tab connects one bundle field to one form field.

| Column | Meaning |
| --- | --- |
| Action | Which form the row belongs to (matches the bundle's Action) |
| Field | The bundle column to read |
| Label | The field's label on the form. Used to find the field if the selector stops working |
| Selector | CSS selector for the field, e.g. `#claim_number` or `input[name="plan_type"]` |
| Type | `text`, `date`, `select`, `radio`, `checkbox`, `attest` (never filled), `file` (never filled) |
| Format | Optional. `MM/DD/YYYY` if a text field expects US dates |

To support another form, the Automation Analysts add rows with that form's selectors and labels. No code changes are needed. The extension only works on Google Apps Script pages unless the operator approves another site the first time they click **Fill** there.

## 5. Moving from demo to production (after Gate 0)

- **Sign-in:** replace the shared token with Google Workspace sign-in (`chrome.identity`), and restrict the web app to your domain.
- **Data:** confirm the Google Workspace HIPAA BAA covers the Sheet and Drive before any real PHI goes in.
- **Rollout:** publish the extension privately to your domain in the Chrome Web Store, then force-install it on the US desk's laptops from the Google Admin console (Devices → Chrome → Apps & extensions).
- **Real form:** build the Mappings for the real IDR Gateway pages only after the Gateway's terms are confirmed to allow assisted form filling.

## Troubleshooting

| Message | Fix |
| --- | --- |
| "The backend did not return JSON" | Check that the URL ends in `/exec` and that the deployment's access is set to Anyone |
| "Invalid API token" | Copy the token again from the `setup()` log, with no extra spaces |
| "No mapped fields were found on this page" | Make sure the form is the active tab, and that the bundle's Action matches the Mappings |
| Changes to `Code.gs` don't show | Deploy → Manage deployments → Edit → Version: New version |
