/* MissionLink — db.js
   DEMO STAND-IN: in production this layer is a self-hosted Python/PostgreSQL
   server running on a local mini-PC at the camp, over local Wi-Fi, with
   row-level security and encrypted fields (see README "Production path").
   For a zero-setup GitHub Pages demo, the same interface is backed by the
   browser's localStorage so every role view on one device shares state.
   Swap this file's internals for a real API client later; the function
   signatures below are what the rest of the app calls, so nothing else
   needs to change when you do. */

const DB_KEY = "missionlink_db_v1";

function db_seedState(){
  return {
    patients: JSON.parse(JSON.stringify(PATIENTS_SEED)),
    queue: JSON.parse(JSON.stringify(QUEUE_SEED)),
    inventory: INVENTORY_SEED.map(i => ({...i})),
    dispenseLog: [],
    missions: MISSIONS.map(m => ({...m})),
    staff: STAFF_SEED.map(s => ({...s, missionIds:[...s.missionIds]})),
    settings: {...SETTINGS_SEED},
    createdAt: new Date().toISOString()
  };
}

function db_seedIfEmpty(){
  if(localStorage.getItem(DB_KEY)) return;
  localStorage.setItem(DB_KEY, JSON.stringify(db_seedState()));
}

/* Browsers that opened an earlier version of the demo have state without
   missions, staff or settings; fill those in from the seed, keep the rest. */
function db_upgrade(state){
  let changed = false;
  if(!Array.isArray(state.missions)){ state.missions = MISSIONS.map(m => ({...m})); changed = true; }
  if(!Array.isArray(state.staff)){ state.staff = STAFF_SEED.map(s => ({...s, missionIds:[...s.missionIds]})); changed = true; }
  if(!state.settings){ state.settings = {...SETTINGS_SEED}; changed = true; }
  return changed;
}

function db_read(){
  db_seedIfEmpty();
  const state = JSON.parse(localStorage.getItem(DB_KEY));
  if(db_upgrade(state)) db_write(state);
  return state;
}

function db_resetDemo(){
  localStorage.setItem(DB_KEY, JSON.stringify(db_seedState()));
}

function db_write(state){
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

/* ---------- Patients ---------- */
function db_getPatients(){
  return db_read().patients;
}

function db_getPatient(id){
  return db_read().patients.find(p => p.id === id) || null;
}

function db_addPatient(patient){
  const state = db_read();
  state.patients.push(patient);
  db_write(state);
  return patient;
}

function db_savePatient(patient){
  const state = db_read();
  const idx = state.patients.findIndex(p => p.id === patient.id);
  if(idx === -1) return null;
  state.patients[idx] = patient;
  db_write(state);
  return patient;
}

function db_addVisit(patientId, visit){
  const state = db_read();
  const p = state.patients.find(p => p.id === patientId);
  if(!p) return null;
  p.visits.push(visit);
  db_write(state);
  return p;
}

function db_nextPatientId(countryCode){
  const state = db_read();
  const existing = state.patients.filter(p => p.country === countryCode).length;
  return `ML-${countryCode}-${String(existing + 1).padStart(4,"0")}`;
}

/* ---------- Queue ---------- */
function db_getQueue(station){
  const q = db_read().queue;
  return station ? q.filter(e => e.station === station) : q;
}

function db_moveToStation(patientId, station){
  const state = db_read();
  let entry = state.queue.find(e => e.patientId === patientId);
  const nowLabel = new Date().toTimeString().slice(0,5);
  if(entry){
    entry.station = station;
  } else {
    state.queue.push({ patientId, station, urgent:false, arrived: nowLabel });
  }
  db_write(state);
}

function db_removeFromQueue(patientId){
  const state = db_read();
  state.queue = state.queue.filter(e => e.patientId !== patientId);
  db_write(state);
}

function db_setUrgent(patientId, urgent){
  const state = db_read();
  const entry = state.queue.find(e => e.patientId === patientId);
  if(entry){ entry.urgent = urgent; db_write(state); }
}

/* ---------- Inventory / pharmacy ledger ---------- */
function db_getInventory(){
  return db_read().inventory;
}

function db_dispense(sku, qty, patientId){
  const state = db_read();
  const item = state.inventory.find(i => i.sku === sku);
  if(!item) return { ok:false, reason:"Unknown item" };
  if(item.onHand < qty) return { ok:false, reason:"Not enough stock on hand" };
  item.onHand -= qty;
  state.dispenseLog.push({
    sku, name:item.name, qty, patientId,
    at: new Date().toISOString()
  });
  db_write(state);
  return { ok:true, remaining:item.onHand };
}

function db_getDispenseLog(){
  return db_read().dispenseLog;
}

function db_restock(sku, qty){
  const state = db_read();
  const item = state.inventory.find(i => i.sku === sku);
  if(!item) return;
  item.onHand += qty;
  db_write(state);
}

/* ---------- Helpers shared across pages ---------- */
/* ---------- Missions, staff, settings (managed on the Admin page) ---------- */
function db_getMissions(){
  return db_read().missions.slice().sort((a,b) => (b.startDate||"").localeCompare(a.startDate||""));
}
function db_getMission(id){
  return db_read().missions.find(m => m.id === id) || null;
}
function db_saveMission(mission){
  const state = db_read();
  const idx = state.missions.findIndex(m => m.id === mission.id);
  if(idx === -1) state.missions.push(mission); else state.missions[idx] = mission;
  db_write(state);
  return mission;
}
function db_deleteMission(id){
  const state = db_read();
  state.missions = state.missions.filter(m => m.id !== id);
  state.staff.forEach(s => s.missionIds = s.missionIds.filter(x => x !== id));
  if(state.settings.activeMissionId === id) state.settings.activeMissionId = (state.missions[0] || {}).id || "";
  db_write(state);
}

function db_getSettings(){ return db_read().settings; }
function db_saveSettings(patch){
  const state = db_read();
  state.settings = { ...state.settings, ...patch };
  db_write(state);
  return state.settings;
}
function activeMission(){
  const s = db_getSettings();
  return db_getMission(s.activeMissionId) || db_getMissions()[0] || null;
}

function db_getStaff(){ return db_read().staff; }
function db_saveStaff(person){
  const state = db_read();
  const idx = state.staff.findIndex(s => s.id === person.id);
  if(idx === -1) state.staff.push(person); else state.staff[idx] = person;
  db_write(state);
  return person;
}
function db_deleteStaff(id){
  const state = db_read();
  state.staff = state.staff.filter(s => s.id !== id);
  db_write(state);
}
/* Staff of a given role working the active mission, for on-duty pickers. */
function staffOnMission(role){
  const m = activeMission();
  return db_getStaff().filter(s => s.role === role && (!m || s.missionIds.includes(m.id)));
}
function staffName(id){
  const s = db_getStaff().find(x => x.id === id);
  return s ? s.name : "";
}

function db_saveInventoryItem(item){
  const state = db_read();
  const idx = state.inventory.findIndex(i => i.sku === item.sku);
  if(idx === -1) state.inventory.push(item); else state.inventory[idx] = item;
  db_write(state);
}
function db_deleteInventoryItem(sku){
  const state = db_read();
  state.inventory = state.inventory.filter(i => i.sku !== sku);
  db_write(state);
}

function nextId(prefix, existingIds){
  let n = existingIds.length + 1;
  const pad = v => `${prefix}${String(v).padStart(3,"0")}`;
  while(existingIds.includes(pad(n))) n++;
  return pad(n);
}

/* Country-level info for a patient's country code: the most recent mission
   there. Never returns undefined, so imported records with an unknown code
   still render. */
function missionForCode(code){
  const matches = db_getMissions().filter(m => m.code === code);
  return matches[0] || { id:"", code, country: code || "Unknown", camp:"—", language:"English", location:"" };
}

function categoryLabel(key){
  const c = COMPLAINT_CATEGORIES.find(c => c.key === key);
  return c ? c.label : key;
}

function latestVisit(patient){
  return patient.visits[patient.visits.length - 1];
}

function priorVisits(patient){
  return patient.visits.slice(0, -1);
}

function initials(name){
  return name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
}

/* Deterministic placeholder avatar — stands in for a stored reference photo.
   Generated as an inline SVG data URI so the demo never ships or implies
   real patient photographs. Swap for an actual captured photo in production. */
function avatarDataUri(name){
  const palette = ["#1B6F92","#B8862E","#C4603A","#4A5A68","#6E5A9E"];
  let hash = 0;
  for(let i=0;i<name.length;i++) hash = (hash*31 + name.charCodeAt(i)) % 997;
  const color = palette[hash % palette.length];
  const ini = initials(name);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
    <rect width='100' height='100' fill='${color}'/>
    <text x='50' y='58' font-family='system-ui,sans-serif' font-size='38' fill='white'
      text-anchor='middle' font-weight='600'>${ini}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* Toast doubles as a polite live region so screen-reader users hear the same
   confirmations sighted users see. Created once on load so it exists before the
   first message (live regions added and filled at the same moment are often missed). */
function toastEl(){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }
  return el;
}
function toast(msg){
  const el = toastEl();
  el.textContent = "";
  // re-set on the next frame so a repeated identical message is still announced
  requestAnimationFrame(() => { el.textContent = msg; });
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 5000);
}
if(document.body) toastEl(); else document.addEventListener("DOMContentLoaded", toastEl);

/* Escape text before putting it into innerHTML templates — names and complaints
   are user-entered, so they must never be parsed as markup. */
function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

/* Move keyboard / screen-reader focus to a heading or region after the view
   changes underneath the user (a card appears, the focused button disappears). */
function focusEl(el){
  if(!el) return;
  if(!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus();
}

/* Re-render helper for the auto-refreshing lists: only touches the DOM when the
   underlying data changed, so the 4-second refresh doesn't steal keyboard focus
   or make screen readers re-read the list. */
function renderIfChanged(el, key, renderFn){
  if(el._renderKey === key) return;
  const hadFocus = el.contains(document.activeElement);
  const focusId = hadFocus ? document.activeElement.dataset.focusId : null;
  el._renderKey = key;
  renderFn();
  if(hadFocus){
    const again = focusId && el.querySelector(`[data-focus-id="${CSS.escape(focusId)}"]`);
    focusEl(again || el.closest("section, .card")?.querySelector("h2") || el);
  }
}

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function param(name){ return new URLSearchParams(location.search).get(name); }

/* Fills any [data-active-mission] element (role-page headers) with the
   current mission, so every station shows which camp it's working. */
function renderActiveMissionLine(){
  const m = activeMission();
  qsa("[data-active-mission]").forEach(el => {
    el.textContent = m ? `${m.camp} · ${m.startDate.slice(0,4)}` : "No current mission — set one in Admin";
  });
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { db_seedIfEmpty(); renderActiveMissionLine(); });
else { db_seedIfEmpty(); renderActiveMissionLine(); }

/* "Triaged by" / "Seen by" pickers: staff of one role on the current mission.
   The choice is remembered per device, since one tablet usually stays with
   one person for the day. */
function setupOnDutyPicker(select, role, storeKey){
  const people = staffOnMission(role);
  select.innerHTML = `<option value="">Not recorded</option>` +
    people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.specialty ? " — " + esc(p.specialty) : ""}</option>`).join("");
  let saved = "";
  try { saved = localStorage.getItem(storeKey) || ""; } catch(e){}
  if(people.some(p => p.id === saved)) select.value = saved;
  select.addEventListener("change", () => { try { localStorage.setItem(storeKey, select.value); } catch(e){} });
}
