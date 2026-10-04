# MissionLink
**On a mission to heal.**

A patient continuity and camp operations system for short-term medical missions — built around
TotalCare's own yearly camps in Kenya, Mauritania, Peru and Lebanon. One record follows a patient
between missions and years; one ledger tracks what the camp used. Entered for the World Bank Group
Small AI for Development Hackathon 2026 (Health track).

This repo is a **self-contained static site** — no build step, no server, no npm install. Open
`index.html` or push the folder to GitHub Pages and it runs.

---

## Quick start

**Locally:** Chrome or Edge, from a local web server (not `file://` — the microphone permission the
speech features need generally won't grant on a bare file URL). The simplest option:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

**On GitHub Pages:**
1. This repo already has the site at its root (with a `.nojekyll` file so GitHub serves it as-is).
2. Repo Settings → Pages → Deploy from branch → `main`, root folder.
3. Your site is live at `https://<username>.github.io/<repo>/` within a minute or two — this is
   already a secure (https) context, so the microphone and speech features work without extra setup.

All data is synthetic demo data (see `js/data.js`) stored only in the visiting browser's
`localStorage`. Clearing site data resets the demo to its seed state.

---

## The five views

| File | Role | What it does |
|---|---|---|
| `index.html` | — | Landing page, role picker |
| `triage.html` | Triage nurse | Register a new patient or find a returning one, log vitals, capture the chief complaint by voice, route to the physician |
| `physician.html` | Physician | Waiting room queue, full chart with prior-visit history, voice-dictated notes, orders a lab test and/or prescription |
| `pharmacist.html` | Pharmacist | Dispensing queue; tapping "dispensed" is the only data entry — stock draws down automatically |
| `runner.html` | Runner | Live count of who's waiting where, and a quick lookup for where to guide a specific patient next |
| `patient.html` | Patient | A patient's own pass (QR) and a plain-language summary of their visit history |
| `dashboard.html` | Mission lead | Auto-generated end-of-mission numbers: visits by country/category/language, continuity count, stock levels, next-mission packing suggestions |

## Architecture

```
missionlink/
  index.html, triage.html, physician.html, pharmacist.html, runner.html, patient.html, dashboard.html
  css/styles.css        shared design tokens and components
  js/data.js             synthetic seed data (patients, inventory, categories, languages)
  js/db.js               storage layer — see "Demo vs. production" below
  js/lookup.js            non-biometric "find my record" matching (name + age + sex + camp)
  js/speech.js            speech-to-text wiring + the chief-complaint classifier
  js/qr.js                QR pass rendering
  js/inventory.js          dispensing + low-stock + packing-list logic
  js/reports.js            dashboard aggregation
```

Every page loads `data.js` and `db.js` first, then whichever of the other modules it needs. All
state lives in one `localStorage` key (`missionlink_db_v1`) so every role view on the same device
shares the same "camp" — open two views in two tabs and actions in one show up in the other on
refresh.

## What's AI, named plainly

- **Speech recognition** — chief complaint (triage) and clinical notes (physician), by voice, in
  the language set for that camp.
- **Chief-complaint classifier** (`speech.js: classifyComplaint`) — a small, auditable keyword
  matcher that sorts a complaint into a routing category. It never outputs a diagnosis, and its
  entire rule set is the `COMPLAINT_CATEGORIES` table in `data.js` — nothing hidden in a model file.
- **Prior-visit summarization** — when a returning patient is found, their last visit is condensed
  into a short brief for triage and a full timeline for the physician.
- **Non-biometric match scoring** (`lookup.js`) — ranks lost-card candidates by name similarity,
  age, sex and camp, and shows its reasons for each suggestion. A person always makes the final call.

Vitals capture is sensor hardware, not AI — see below.

## Demo vs. production — every substitution, named

| In this demo | In a real deployment | Why substituted here |
|---|---|---|
| Browser `localStorage` | Self-hosted Python/PostgreSQL server on a local mini-PC, over local Wi-Fi, encrypted fields and row-level security, syncing to a central archive only when connectivity appears (store-and-forward) | Zero-install demo; `db.js` is written as the one file to replace with a real API client — nothing else in the app talks to storage directly |
| Browser `SpeechRecognition` API | An on-device model (e.g. a quantized Whisper or MMS build) running fully offline | The browser API typically round-trips audio to a vendor's server, which doesn't meet the brief's offline bar. Say this plainly if asked — it's intentional, not hidden |
| QR codes (fully real, scannable) | QR + NFC | NFC needs real hardware and a secure-context Web NFC API with very limited browser support; it's represented in the UI copy ("tap your card") rather than faked |
| Manually typed vitals | Bluetooth-paired BP cuff, pulse oximeter, BLE thermometer writing straight into the record | No real hardware to pair with in a demo; this is IoT integration, not AI, and is a comparatively simple addition later |
| Keyword-based complaint classifier | A trained, still-auditable small classifier, ideally fine-tuned on real (de-identified) camp transcripts | Needs real training data this demo doesn't have access to |

## Why there's no facial recognition

An earlier version of this plan called for facial recognition to find a patient who lost their
QR/NFC card. It isn't in this build, deliberately:

- Face-matching systems are well documented to have higher false-match rates on Black, Indigenous
  and other non-White faces than on White faces — exactly the populations the Kenya, Mauritania and
  Peru camps serve. At a healthcare checkpoint that risk isn't cosmetic: it's someone's allergy or
  medication history attached to the wrong person.
- Biometric data carries a meaningfully higher consent bar than a photo ID card, and getting that
  consent genuinely from a low-literacy patient in a single camp visit is a real unsolved problem,
  not a form to add later.
- The hackathon brief scores "Responsible AI, data and safety" **pass/fail**.

What's here instead (`lookup.js`) solves the same problem — find a patient who lost their card —
by matching name, approximate age, sex and camp, then showing each candidate's stored reference
photo for a staff member to visually compare and confirm. No algorithm decides the match.

**If this gets picked up later:** responsible on-device face-matching would need, at minimum, an
explicit opt-in consent flow (with a no-penalty alternative for anyone who declines), bias and
accuracy testing against a recognized benchmark such as NIST's FRVT before any field use, matching
that never leaves the device, and a published false-match rate broken out by the actual patient
population it will serve — not the general population. Treat this as its own project phase with its
own review, not a feature flag to flip on.

## Known gaps — stated, not hidden

- **Quechua** has no widely supported browser speech-recognition locale yet; the demo falls back to
  Peruvian Spanish, which most camp interpreters also speak. A production on-device model should be
  evaluated specifically for Quechua coverage.
- Demo data is synthetic and clean. Real deployment will meet name spelling that varies across
  Latin, Arabic script and transliteration, shared family phones, and cards lost in the wash — the
  lookup tool is built to help with exactly this, but the demo data doesn't exercise it.
- Accessibility has had an automated and code-level pass (see "Accessibility" below), but not yet a
  session with real screen-reader users or a sunlight-contrast check on the actual field tablets —
  both are worth doing before any real pilot.

## Accessibility

Every view targets WCAG 2.2 AA and passes axe-core (WCAG 2.0/2.1/2.2 A+AA and best-practice rules)
with zero violations at desktop width and at 320px, including the interactive states (search
results, open chart, open pass). What's in place:

- **Structure** — skip link, one `<h1>` per page, labelled `<main>` / `<nav>` / `<section>`
  landmarks, lists marked up as lists.
- **Keyboard** — every action is a real `<button>` or link (waiting-room rows and patient matches
  were clickable `<div>`s); searches and registration are `<form>`s so Enter submits; visible focus
  rings on everything; focus moves to the new heading when a card opens and back to a sensible
  place when the focused control disappears (sending a patient on, dispensing, completing a visit).
- **Auto-refreshing queues** (physician, pharmacist, runner) only re-render when the data actually
  changed, so the 4-second refresh no longer steals keyboard focus or makes screen readers re-read.
- **Screen readers** — every input has a label; toasts are a polite live region; search results
  are announced; QR passes are labelled with the pass ID; identical buttons carry the patient's name
  ("Mark dispensed for …"); prescription toggles and the mic button expose `aria-pressed`; bar
  charts and stock levels carry their numbers as text ("480 capsules on hand, par level 150").
- **Errors** — missing required fields are flagged inline with `aria-invalid`, a text message and
  focus on the field, not only a toast.
- **Not colour alone** — urgent and low-stock states have text badges, selected prescriptions get a
  check mark, the listening mic changes its label to "Listening — tap to stop".
- **Reflow, motion, contrast** — no horizontal scroll at 320px, `prefers-reduced-motion` and Windows
  high-contrast (`forced-colors`) handled, placeholder text meets 4.5:1.
- **Safety** — user-entered names and complaints are HTML-escaped before rendering.

## Roadmap

1. Swap `db.js` for a real API client against the self-hosted Python/PostgreSQL server.
2. Swap `speech.js`'s recognition call for an on-device model; keep `classifyComplaint`'s interface
   unchanged so nothing else in the app needs to change.
3. Add Bluetooth vitals-device pairing at triage.
4. Pilot the non-biometric lookup against a real (de-identified) multi-year patient list to tune the
   match-scoring weights in `lookup.js`.
5. If pursued, scope on-device face-matching as its own reviewed project — see above.

## Data note

Every name, record and number in `js/data.js` is synthetic, generated for this demo. Never commit
real patient data — names, vitals, photos or otherwise — to this or any public repository.
