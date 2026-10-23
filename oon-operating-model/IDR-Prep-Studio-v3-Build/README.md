# IDR Prep Studio v3 — build folder

Version 3.0 · 2026-10-23 · aligned with the IDR Gateway "Notice of IDR Initiation User Guide", Version 15.0, October 14, 2026

| Folder | File | What it is |
| --- | --- | --- |
| 01-Web-App | Code.gs | Back end (Google Apps Script): 7-page portal schema, validation, learning lists, timing, US desk actions |
| 01-Web-App | Index.html | Front end: 7-step entry, line-items grid with bulk paste, copy desk, Insights and Lists views |
| 01-Web-App | Pdf.html | Confirmation PDF template |
| 01-Web-App | DemoData.gs | 12 synthetic demo disputes (no real claims) |
| 01-Web-App | README.md | Setup, upgrade, rules and admin guide |
| 02-IT-Build-Spec | IDR-Prep-Studio-Build-Spec.xlsx | Build spec for IT and software development (16 sheets) |

## Fixed business facts

- We always initiate, as a health care provider or a health care facility.
- Location of service is always Texas.

## What changed in v3

- Pages follow the portal: qualification, dispute type, initiating party, non-initiating party, line items, IDR entity and conflict of interest, review.
- Timing: the open negotiation start date is business day 1. Filing opens on day 31 and closes on day 34. After day 34 an extension reason is required (Federal IDR mailbox approval, or cooling off with the DISP number), with evidence.
- Lebanon can mark a dispute Ready before day 31. It waits in "Not open yet" on the US desk until the window opens.
- Dispute types: single not bundled (1 line), single bundled (bundled line plus components), batched (2–50 lines, service dates within 30 business days).
- Portal rules: Tax ID or NPI, service date before the open negotiation start, 5-character service codes, up to 4 two-character modifiers, claim numbers up to 40 letters and digits, the portal's name and address characters, 500 MB per dispute, no duplicate claim + date + code + modifier.
- Seeds: 24 billing entities, 124 non-initiating parties, 373 service codes, the 7 portal health plan types.
- US desk: IDR Gateway sign-in from November 13, 2026 (the open web form ends January 15, 2027), a 60-minute session timer, and Mark Filed needs the DISP number, the notice PDF and the date the copy was sent to the non-initiating party (same day).

## Data rule

Only business data is seeded. No claim numbers, dates of service or account numbers are stored in these files. Use synthetic data until Gate 0.
