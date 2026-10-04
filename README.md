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
| `admin.html` | Admin / mission lead | Create and edit missions (camp, location, dates, hours, language), choose the current mission, manage staff and volunteers (role, specialty, languages, missions), edit pharmacy stock, import patient records from other or previous missions, download a backup, set API keys and defaults, reset the demo |
| `dashboard.html` | Mission lead | Auto-generated end-of-mission numbers: visits by country/category/language, continuity count, stock levels, next-mission packing suggestions |

## Architecture

```
missionlink/
  index.html, triage.html, physician.html, pharmacist.html, runner.html, patient.html, dashboard.html
  css/styles.css        shared design tokens and components
  js/data.js             synthetic seed data (patients, inventory, categories, languages)
  js/db.js               storage layer — see "Demo vs. production" below
  js/lookup.js            non-biometric "find my record" matching (name + age + sex + camp)
  js/speech.js            speech-to-text wiring + the keyword chief-complaint classifier
  js/units.js             metric/US conversion for vitals (°C/°F, kg/lb, cm/in)
  js/importer.js          patient import (CSV/JSON), preview and merge rules, backup export
  js/claude.js            Claude API layer: complaint summary/translation/sorting, note tidying, settings dialog
  js/qr.js                QR pass rendering
  js/inventory.js          dispensing + low-stock + packing-list logic
  js/reports.js            dashboard aggregation
```

Every page loads `data.js` and `db.js` first, then whichever of the other modules it needs. All
state lives in one `localStorage` key (`missionlink_db_v1`) so every role view on the same device
shares the same "camp" — open two views in two tabs and actions in one show up in the other on
refresh.

## What's AI, named plainly

- **Claude (Anthropic's Claude API)** — at triage, Claude reads the spoken complaint and returns a
  cleaned transcript in the patient's language, a plain-English summary for the physician, a routing
  category, any danger signs the patient actually mentioned, and one follow-up question for the
  nurse. At the physician's station it tidies a dictated note (punctuation, drug names, doses)
  without adding anything. It never diagnoses, and a person reviews everything before it's saved:
  the nurse can change the category, and marking a patient urgent is always the nurse's call.
  See "Claude API setup" below.
- **Speech recognition** — chief complaint (triage) and clinical notes (physician), by voice, in
  the language set for that camp. This is the step that turns audio into text; the Claude API
  works with text, images and PDFs, not audio, so Claude takes over once there's a transcript.
- **Keyword fallback classifier** (`speech.js: classifyComplaint`) — a small, auditable keyword
  matcher that sorts a complaint into a routing category while Claude is off or unreachable. It never outputs a diagnosis, and its
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
| Claude API key typed into the browser | A small proxy on the camp server (or a hosted function) that holds the key and forwards requests, with store-and-forward when offline | A static demo has no server to hide a key on |
| Keyword fallback classifier when Claude is off | Claude whenever a connection is available; the keyword rules (or a small on-device classifier) as the offline fallback | Keeps triage working with no internet |

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

## Admin & mission settings

`admin.html` (the "Admin & mission settings" card on the landing page) is where a mission is set
up. The demo comes prefilled with seven missions (Kenya, Mauritania and Peru in 2025 and 2026, and
Lebanon in 2026), a 14-person synthetic volunteer roster, and the pharmacy stock. Everything can
be edited, and new missions created.

- **Current mission** — the one every station works on: its camp is preselected at registration,
  its language drives speech capture, its team fills the "Triaged by" and "Seen by" lists, and its
  name shows in every station's header.
- **Missions** — country, country code, camp name, location, main patient language, start and end
  dates, daily hours and notes. A new mission can copy the team from an earlier one. Missions in the
  same country share a country code, so a returning patient keeps one record and one pass ID across
  years.
- **Staff & volunteers** — name, role (physician, nurse, pharmacist, runner, interpreter, general
  volunteer, mission lead), specialty, languages, home country, and which missions they work. Visits
  record who triaged and who saw the patient.
- **Pharmacy inventory** — add items, set stock and par levels, remove items.
- **Patient data** — import CSV (one row per visit; download the template from the page) or a
  MissionLink backup JSON. A preview shows what will change before anything is saved. Records merge
  by pass ID; rows without one get new IDs, likely duplicates are listed for a person to check, and
  re-importing the same file adds nothing. Vitals can be in metric or US columns. "Download backup"
  exports everything as JSON.
- **API keys & settings** — organization name, default units for new devices, Claude API key or
  proxy with a no-cost connection test, and a reset back to the demo data.

There's no login in this demo: anyone who opens `admin.html` can change settings. A real deployment
needs admin accounts on the camp server, along with the server-side storage described below.

## Metric and US units

Volunteers come from countries that measure differently, so every vital works in both systems:

- **Triage:** temperature, weight and height each have a °C/°F, kg/lb or cm/in switch. As you type,
  the converted value shows underneath ("= 101.3 °F"). Switching units converts what's already in
  the field, and commas work as decimal marks. A temperature in the other system's normal range
  (e.g. 100 with °C selected) gets a "this looks like °F — check the unit" warning.
- **Everywhere vitals appear** (the triage prior-visit brief, the physician's chart and visit
  history), they're shown in both systems, e.g. `38.5 °C (101.3 °F)`, `160 cm (63.0 in, 5 ft 3 in)`.
  The physician's chart has a "units shown first" switch.
- **Claude** adds the other unit in brackets whenever a patient mentions a temperature or weight,
  or a physician dictates one (drug doses are never converted).
- Each person's preferred unit (per measurement) is remembered in their browser. Records are always
  **stored in metric**, so data, reports and any future server stay in one unit.

## Claude API setup

Claude features are off until you turn them on, and the app works without them (keyword sorting,
no summaries).

**For a demo:** open Triage or Physician, select **Claude AI** in the header, paste an Anthropic API
key and save. The key is stored in that browser's `localStorage` only — it isn't committed or sent
anywhere except the Claude API — but anyone using that browser could read it, so use a key with a
low spend limit and select **Clear key** afterwards.

**For a real deployment:** don't put keys in browsers. Run a small proxy that adds the key
server-side, and put its URL in the **Proxy URL** field (leave the key empty). It must forward
`POST /v1/messages` to `https://api.anthropic.com/v1/messages` with your key as `x-api-key`, pass
the `anthropic-version` and `anthropic-beta` headers through, and answer CORS preflight requests
for the site's origin. A Cloudflare Worker or any small server that does that is enough.

Details: the SDK (`@anthropic-ai/sdk`, pinned in `js/claude.js`) is loaded from jsDelivr on first
use, the model is `claude-opus-5-5` at low effort, triage results use structured JSON output so the
category is always one of the app's own categories, and refusal fallback is enabled so a safety
decline is retried on Anthropic's recommended model instead of failing.

**Speech troubleshooting:** speech capture needs Chrome or Edge over `https` (GitHub Pages is fine)
or `localhost`, with microphone permission allowed, and an internet connection (the browser's
recogniser runs on the vendor's servers). If a camp language isn't available in that browser, the
app says so and listens in English instead — Claude then makes the best of the English transcript.
Firefox has no speech recognition; type instead.

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
