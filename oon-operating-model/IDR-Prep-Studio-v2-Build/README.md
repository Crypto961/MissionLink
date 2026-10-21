# IDR Prep Studio v2 — build folder

Version 2.0 · 2026-10-21

## What's here

| Folder | File | What it is |
| --- | --- | --- |
| 01-Web-App | Code.gs | Back end (Google Apps Script): schema, validation, learning lists, defaults, deadlines, US desk actions |
| 01-Web-App | Index.html | Front end: entry pages, line items, copy desk, Insights and Lists views |
| 01-Web-App | Pdf.html | Confirmation PDF template |
| 01-Web-App | DemoData.gs | Synthetic demo data (no real claims) |
| 01-Web-App | README.md | Setup, upgrade and admin guide |
| 02-IT-Build-Spec | IDR-Prep-Studio-Build-Spec.xlsx | Build spec for IT and software development (15 sheets) |

## What changed in v2

- Defaults come from the 4 portal notices: not prior to 2022, no consent waiver, ERISA self-insured plan, a batched dispute, emergency item/service, POS 23, TX, no modifiers, third party attestation No.
- New portal fields: Tax ID, NPI, dispute kind, hospital/group name, certified IDR entity, third party attestation.
- Address books: picking the billing entity or the payer fills the contact fields. Picking a service code fills the description.
- Lists learn on every save. New values show for everyone on the next load. The most-used value becomes the default once it reaches 80% of the last 50 records (at least 5 records).
- Deadline helper: open negotiation end and the initiate-by date, in business days, with federal holidays.
- Checks: eligibility hard stops, a passed deadline blocks Ready, blank line values block, amount and duplicate-claim warnings.
- Admins can rename, merge and hide list values. The Insights view shows the trends during the training phase.

## Data rule

Only business data is seeded (payers, our billing entities, IDR entities, codes). No claim numbers, dates of service or account numbers are stored in these files. Use synthetic data until Gate 0.
