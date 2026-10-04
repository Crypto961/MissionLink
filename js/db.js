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

function db_seedIfEmpty(){
  if(localStorage.getItem(DB_KEY)) return;
  const state = {
    patients: PATIENTS_SEED,
    queue: QUEUE_SEED,
    inventory: INVENTORY_SEED.map(i => ({...i})),
    dispenseLog: [],
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

function db_read(){
  db_seedIfEmpty();
  return JSON.parse(localStorage.getItem(DB_KEY));
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
function missionForCode(code){
  return MISSIONS.find(m => m.code === code);
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
  const palette = ["#2F6F5E","#B8862E","#C4603A","#4A5A68","#6E5A9E"];
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

function toast(msg){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function param(name){ return new URLSearchParams(location.search).get(name); }
