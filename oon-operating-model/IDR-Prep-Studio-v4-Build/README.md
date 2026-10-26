# IDR Prep Studio v4 — build folder

Version 4.1 · 2026-10-27 · aligned with the IDR Gateway "Notice of IDR Initiation User Guide", Version 15.0, October 14, 2026

| Folder | File | What it is |
| --- | --- | --- |
| 01-Web-App | Code.gs | Back end (Google Apps Script): portal schema merged with the Fields tab, validation, roles, learning lists, staging, US desk actions |
| 01-Web-App | Index.html | Front end: 7-step entry, line-items grid, copy desk, Insights, Admin (Lists, Users, Billing entities, Settings & fields) |
| 01-Web-App | Pdf.html | Confirmation PDF template |
| 01-Web-App | DemoData.gs | 12 synthetic demo disputes and role switching for demos |
| 01-Web-App | README.md | Setup, upgrade from v3, tabs and columns, roles, admin guide |
| 02-IT-Build-Spec | IDR-Prep-Studio-Build-Spec.xlsx | Build spec for IT and software development (18 sheets, incl. Configuration guide and Roles & permissions) |

## What changed in v4

- Every dropdown list lives on the Options tab. Portal-worded lists are Strict (never learn) and the logic uses a stable Key, so admins can reword safely.
- A Fields tab holds each field's label, help, required, default and default mode (Fixed, Learned or None), lock and visibility. Portal rules stay in code.
- A Users tab controls access: Admin, LB Member, US Member. Roles are checked on the server for every action. There is always at least one active Admin.
- RCM Specialist (was Owner) and Team are searchable boxes with "Add new". New entries are saved to the list on save.
- Billing entities have their own tab and admin editor.
- Documents can be attached before the first save. Staged files belong to the uploader, move to the dispute on save, and are cleaned up after 7 days.
- An independent review fixed 11 defects (file deletion, draft ownership, first-setup access, admin lockout, double filing and more).
- v4.1: every page (and Line Items) blocks Continue until all issues are fixed; unlisted users can request access and Admins approve or reject it; Admins can add, edit, hide and remove list values and custom lists; all 24 billing entities are seeded with full profiles.

## Before go-live

1. Run setup() as the script owner, then add every member on the Users tab.
2. Run installTriggers() for the daily staging cleanup.
3. Deploy a test copy and run through each role.

## Data rule

Only business data is seeded. No claim numbers, dates of service or account numbers are stored in these files. Use synthetic data until Gate 0.
