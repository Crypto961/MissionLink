/* MissionLink — importer.js
   Brings patient records from other or previous missions into this one.

   Accepted files:
   - CSV, one row per visit (download the template from the Admin page).
     Rows for the same patient are grouped by patient_id, or — when a row has
     no pass ID — by name + country + sex + age.
   - JSON: either a MissionLink backup (the Admin page's "Download backup")
     or a plain array of patient records in the app's own shape.

   Nothing is saved until the admin has seen a preview and confirmed it.
   Records are matched to existing patients by pass ID only. A row without
   an ID is never merged automatically into someone else's history; it gets
   a new pass ID, and likely duplicates (same name, country and sex) are
   listed in the preview for a person to check — the same "a person decides
   the match" rule the lost-card lookup follows. */

const CSV_TEMPLATE_HEADERS = ["patient_id","name","sex","approx_age","country","allergies","visit_date","complaint","category","diagnosis","prescription","bp","temp_c","temp_f","weight_kg","weight_lb","height_cm","height_in","note"];

function csvTemplate(){
  const rows = [
    CSV_TEMPLATE_HEADERS,
    ["ML-KE-0101","Wanjiru Kamau","F","27","KE","","2025-11-12","Headache and fever for 3 days","fever","Malaria (RDT positive)","ANTIMAL","110/70","38.6","","54","","","","Follow up in 2026"],
    ["","Juan Quispe","M","63","Peru","Penicillin","2025-09-14","Knee pain when walking","musculoskel","Osteoarthritis","IBU-200","138/86","","98.2","","150","","64",""]
  ];
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(v){
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* RFC 4180 CSV parser: quoted fields, escaped quotes, newlines in quotes.
   Handles a UTF-8 BOM and ; separated files (common in Excel exports from
   countries that use the decimal comma). */
function parseCsv(text){
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"' && text[i+1] === '"'){ field += '"'; i++; }
      else if(c === '"') inQuotes = false;
      else field += c;
    } else if(c === '"') inQuotes = true;
    else if(c === sep){ row.push(field); field = ""; }
    else if(c === "\n" || c === "\r"){
      if(c === "\r" && text[i+1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if(field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

/* ---------- Normalising one record ---------- */
function resolveCountryCode(value){
  const v = String(value || "").trim();
  if(!v) return "";
  const missions = db_getMissions();
  const byCode = missions.find(m => m.code.toLowerCase() === v.toLowerCase());
  if(byCode) return byCode.code;
  const byName = missions.find(m => m.country.toLowerCase() === v.toLowerCase());
  if(byName) return byName.code;
  return v.length <= 3 ? v.toUpperCase() : "";
}

function resolveCategory(value){
  const v = String(value || "").trim().toLowerCase();
  const c = COMPLAINT_CATEGORIES.find(c => c.key === v || c.label.toLowerCase() === v);
  return c ? c.key : null;
}

function resolveSkus(list){
  const inv = db_getInventory();
  return splitList(list).map(x => {
    const hit = inv.find(i => i.sku.toLowerCase() === x.toLowerCase() || i.name.toLowerCase() === x.toLowerCase());
    return hit ? hit.sku : x;
  });
}

function splitList(v){
  if(Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v || "").split(/[;|]/).map(s => s.trim()).filter(Boolean);
}

/* Metric value from whichever unit column is filled; US columns are converted. */
function metricFrom(metricRaw, imperialRaw, kind){
  const m = parseMeasure(metricRaw);
  if(m !== null) return String(roundTo(m, UNIT_KINDS[kind].metric.decimals));
  const i = parseMeasure(imperialRaw);
  if(i !== null) return String(roundTo(UNIT_KINDS[kind].toMetric(i), UNIT_KINDS[kind].metric.decimals));
  return "";
}

function normaliseVisit(v, countryCode, warnings, who){
  const date = String(v.date || v.visit_date || "").trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if(date && !validDate) warnings.push(`${who}: visit date "${date}" isn't YYYY-MM-DD — kept the year only if readable.`);
  const yearMatch = (validDate ? date : String(v.year || date)).match(/\d{4}/);
  const complaint = String(v.complaint || "").trim();
  const category = resolveCategory(v.category) || classifyComplaint(complaint).key;
  const vitals = v.vitals || {};
  return {
    year: yearMatch ? Number(yearMatch[0]) : null,
    date: validDate ? date : "",
    vitals: {
      bp: String(vitals.bp ?? v.bp ?? "").trim(),
      temp: metricFrom(vitals.temp ?? v.temp_c, v.temp_f, "temp"),
      weight: metricFrom(vitals.weight ?? v.weight_kg, v.weight_lb, "weight"),
      height: metricFrom(vitals.height ?? v.height_cm, v.height_in, "height")
    },
    complaint,
    category,
    language: String(v.language || missionForCode(countryCode).language || "").trim(),
    diagnosis: String(v.diagnosis || "").trim(),
    prescription: resolveSkus(v.prescription),
    labOrdered: v.labOrdered === true || /^(yes|true|1)$/i.test(String(v.lab_ordered || "")),
    note: String(v.note || "").trim(),
    importedAt: new Date().toISOString().slice(0,10)
  };
}

function normalisePatient(p, warnings){
  const name = String(p.name || "").trim();
  const sexRaw = String(p.sex || "").trim().toUpperCase();
  const sex = sexRaw.startsWith("M") ? "M" : sexRaw.startsWith("F") ? "F" : "";
  const country = resolveCountryCode(p.country);
  const who = name || p.id || "A record";
  if(!name){ warnings.push(`${who}: skipped — no name.`); return null; }
  if(!country){ warnings.push(`${who}: skipped — country "${p.country || ""}" doesn't match any mission. Create the mission first or use its country code.`); return null; }
  if(!sex) warnings.push(`${who}: sex missing or unreadable — left blank.`);
  if(!missionForCode(country).id) warnings.push(`${who}: no mission exists yet for country code ${country}.`);
  const visits = (p.visits || []).map(v => normaliseVisit(v, country, warnings, who)).filter(v => v.complaint || v.diagnosis || v.date);
  visits.sort((a,b) => (a.date || String(a.year)).localeCompare(b.date || String(b.year)));
  return {
    id: String(p.id || p.patient_id || "").trim().toUpperCase(),
    name, sex,
    approxAge: Number(p.approxAge ?? p.approx_age) || 0,
    country,
    allergies: splitList(p.allergies),
    visits
  };
}

/* CSV rows -> patient records with grouped visits. */
function patientsFromCsv(text){
  const rows = parseCsv(text);
  if(rows.length < 2) throw new Error("The CSV file has no data rows.");
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if(!headers.includes("name")) throw new Error('The CSV needs at least a "name" column — download the template to see the format.');
  const groups = new Map();
  rows.slice(1).forEach(cells => {
    const r = {};
    headers.forEach((h, i) => r[h] = (cells[i] ?? "").trim());
    const key = r.patient_id ? "id:" + r.patient_id.toUpperCase()
      : ["n", r.name.toLowerCase(), resolveCountryCode(r.country), r.sex.toUpperCase(), r.approx_age].join("|");
    if(!groups.has(key)) groups.set(key, { id:r.patient_id, name:r.name, sex:r.sex, approx_age:r.approx_age, country:r.country, allergies:r.allergies, visits:[] });
    const g = groups.get(key);
    if(r.allergies) g.allergies = [...new Set([...splitList(g.allergies), ...splitList(r.allergies)])];
    if(r.complaint || r.diagnosis || r.visit_date) g.visits.push(r);
  });
  return [...groups.values()];
}

function patientsFromJson(text){
  let data;
  try { data = JSON.parse(text); } catch(e){ throw new Error("This isn't valid JSON."); }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.patients) ? data.patients : null;
  if(!list) throw new Error('Expected a list of patients, or a MissionLink backup with a "patients" list.');
  return list;
}

/* Parse + normalise + compare with what's stored. Saves nothing. */
function prepareImport(fileName, text){
  const raw = /\.json$/i.test(fileName) || /^\s*[\[{]/.test(text) ? patientsFromJson(text) : patientsFromCsv(text);
  const warnings = [];
  const patients = raw.map(p => normalisePatient(p, warnings)).filter(Boolean);
  const existing = db_getPatients();
  const plan = { patients:[], warnings, newPatients:0, mergedPatients:0, newVisits:0, alreadyOnFile:0, possibleDuplicates:[] };
  patients.forEach(p => {
    // A row without a pass ID that matches someone exactly (name, country,
    // sex, age) and brings no new visits was imported before: skip it
    // rather than create a duplicate person.
    if(!p.id){
      const twins = existing.filter(e => e.name.toLowerCase() === p.name.toLowerCase() && e.country === p.country && e.sex === p.sex && e.approxAge === p.approxAge);
      if(twins.some(t => p.visits.every(v => t.visits.some(tv => sameVisit(tv, v))))){ plan.alreadyOnFile++; return; }
    }
    plan.patients.push(p);
    const match = p.id && existing.find(e => e.id === p.id);
    if(match){
      const fresh = p.visits.filter(v => !match.visits.some(mv => sameVisit(mv, v))).length;
      if(!fresh && p.allergies.every(a => match.allergies.includes(a))){ plan.patients.pop(); plan.alreadyOnFile++; return; }
      plan.mergedPatients++;
      plan.newVisits += fresh;
    } else {
      plan.newPatients++;
      plan.newVisits += p.visits.length;
      const dup = existing.find(e => e.name.toLowerCase() === p.name.toLowerCase() && e.country === p.country && (!p.sex || e.sex === p.sex));
      if(dup) plan.possibleDuplicates.push(`${p.name}${p.id ? " (" + p.id + ")" : ""} may be the same person as ${dup.name} (${dup.id}) — check, and merge by giving the row that pass ID.`);
    }
  });
  return plan;
}

function sameVisit(a, b){
  return (a.date || a.year) === (b.date || b.year) && a.complaint.trim().toLowerCase() === b.complaint.trim().toLowerCase();
}

/* Writes a prepared import. Returns counts for the confirmation message. */
function commitImport(plan){
  const state = db_read();
  let added = 0, merged = 0, visits = 0;
  plan.patients.forEach(p => {
    const match = p.id && state.patients.find(e => e.id === p.id);
    if(match){
      const fresh = p.visits.filter(v => !match.visits.some(mv => sameVisit(mv, v)));
      match.visits = [...match.visits, ...fresh].sort((a,b) => (a.date || String(a.year)).localeCompare(b.date || String(b.year)));
      match.allergies = [...new Set([...match.allergies, ...p.allergies])];
      visits += fresh.length; merged++;
    } else {
      if(!p.id || state.patients.some(e => e.id === p.id)){
        const n = state.patients.filter(e => e.country === p.country).length;
        let i = n + 1, id;
        do { id = `ML-${p.country}-${String(i++).padStart(4,"0")}`; } while(state.patients.some(e => e.id === id));
        p.id = id;
      }
      state.patients.push(p);
      visits += p.visits.length; added++;
    }
  });
  db_write(state);
  return { added, merged, visits };
}

/* ---------- Downloads ---------- */
function downloadFile(name, content, type){
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupJson(){
  const s = db_read();
  return JSON.stringify({ format:"missionlink-backup", version:1, exportedAt:new Date().toISOString(),
    settings:s.settings, missions:s.missions, staff:s.staff, inventory:s.inventory, patients:s.patients }, null, 2);
}
