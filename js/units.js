/* MissionLink — units.js
   Volunteers come from countries that measure differently, so every vital can
   be typed in either system and is always shown in both.

   Storage is always metric (°C, kg, cm) — the seed data, reports and any
   future server all stay in one unit. Conversion happens only at the edges:
   as a value is typed (live "= 101.1 °F" readout), and when it's displayed.

   Each person's preferred unit per measurement (e.g. °F but kg) is remembered
   in this browser and decides which unit is typed and which is shown first. */

const UNIT_KINDS = {
  temp: {
    label: "Temperature",
    metric:   { unit: "°C", name: "Celsius",    decimals: 1 },
    imperial: { unit: "°F", name: "Fahrenheit", decimals: 1 },
    toImperial: c => c * 9 / 5 + 32,
    toMetric:   f => (f - 32) * 5 / 9,
    // A value in the other system's normal human range is almost always a
    // wrong-unit slip; say so before it reaches the physician.
    looksLikeOther: { metric: v => v >= 86 && v <= 113, imperial: v => v >= 30 && v <= 45 }
  },
  weight: {
    label: "Weight",
    metric:   { unit: "kg", name: "kilograms", decimals: 1 },
    imperial: { unit: "lb", name: "pounds",    decimals: 1 },
    toImperial: kg => kg * 2.2046226218,
    toMetric:   lb => lb / 2.2046226218
  },
  height: {
    label: "Height",
    metric:   { unit: "cm", name: "centimetres", decimals: 0 },
    imperial: { unit: "in", name: "inches",      decimals: 1 },
    toImperial: cm => cm / 2.54,
    toMetric:   inch => inch * 2.54
  }
};

const UNIT_PREF_STORE = "missionlink_unit_prefs";

function unitPrefs(){
  try { return JSON.parse(localStorage.getItem(UNIT_PREF_STORE)) || {}; }
  catch(e){ return {}; }
}
function unitPref(kind){
  const own = unitPrefs()[kind];
  if(own) return own === "imperial" ? "imperial" : "metric";
  // No choice made on this device yet: use the admin's default.
  const def = typeof db_getSettings === "function" ? db_getSettings().defaultUnits : "metric";
  return def === "imperial" ? "imperial" : "metric";
}
function setUnitPref(kind, system){
  const prefs = unitPrefs();
  prefs[kind] = system;
  try { localStorage.setItem(UNIT_PREF_STORE, JSON.stringify(prefs)); } catch(e){}
}

/* Parses typed input: accepts a comma as the decimal mark ("37,5") since
   many volunteers' keyboards use one. Returns null for blank or non-numbers. */
function parseMeasure(text){
  const t = String(text ?? "").trim().replace(",", ".");
  if(!t || t === "—") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

function roundTo(n, decimals){
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function formatIn(kind, system, value){
  const spec = UNIT_KINDS[kind][system];
  return `${roundTo(value, spec.decimals).toFixed(spec.decimals)} ${spec.unit}`;
}

function convertMeasure(kind, value, fromSystem){
  const k = UNIT_KINDS[kind];
  return fromSystem === "metric" ? k.toImperial(value) : k.toMetric(value);
}

/* Heights over 12 inches also read as feet + inches ("5 ft 7 in"). */
function feetInches(inches){
  let ft = Math.floor(inches / 12), inch = Math.round(inches - ft * 12);
  if(inch === 12){ ft += 1; inch = 0; }
  return `${ft} ft ${inch} in`;
}

/* A stored (metric) value as text in both systems, preferred unit first:
   "38.4 °C (101.1 °F)". Missing values come back as "—". */
function formatDual(kind, metricValue){
  const v = parseMeasure(metricValue);
  if(v === null) return "—";
  const imperialValue = UNIT_KINDS[kind].toImperial(v);
  let metricText = formatIn(kind, "metric", v);
  let imperialText = formatIn(kind, "imperial", imperialValue);
  if(kind === "height" && imperialValue >= 12) imperialText += `, ${feetInches(imperialValue)}`;
  return unitPref(kind) === "imperial" ? `${imperialText} (${metricText})` : `${metricText} (${imperialText})`;
}

/* One line of vitals for charts and history, both systems everywhere. */
function formatVitals(vitals){
  vitals = vitals || {};
  const bp = vitals.bp && vitals.bp !== "—" ? `${vitals.bp} mmHg` : "—";
  return `BP ${bp} · Temp ${formatDual("temp", vitals.temp)} · Weight ${formatDual("weight", vitals.weight)} · Height ${formatDual("height", vitals.height)}`;
}

/* Upgrades a plain text input into a dual-unit field:
   - a °C/°F (kg/lb, cm/in) switch next to it — a real radio group
   - a live readout of the converted value as you type
   - switching units converts whatever is already typed
   - a wrong-unit warning for temperatures
   Returns { metricValue() } which gives the value to store, in metric. */
function attachUnitField(input, kind){
  const k = UNIT_KINDS[kind];
  let system = unitPref(kind);
  const field = input.closest(".field");
  const label = field.querySelector(`label[for="${input.id}"]`);
  label.textContent = k.label;

  const group = document.createElement("div");
  group.className = "unit-switch";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${k.label} unit`);
  group.innerHTML = ["metric", "imperial"].map(s => `
    <label class="unit-option"><input type="radio" name="${input.id}-unit" value="${s}">
      <span>${k[s].unit}</span><span class="visually-hidden"> ${k[s].name}</span></label>`).join("");
  label.insertAdjacentElement("afterend", group);

  const readout = document.createElement("p");
  readout.className = "unit-readout small";
  readout.id = `${input.id}-converted`;
  input.insertAdjacentElement("afterend", readout);
  input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), readout.id].filter(Boolean).join(" "));

  function update(){
    const spec = k[system];
    input.placeholder = system === "metric"
      ? ({ temp:"37.0", weight:"60", height:"165" }[kind])
      : ({ temp:"98.6", weight:"132", height:"65" }[kind]);
    input.setAttribute("aria-label", `${k.label} in ${spec.name}`);
    qsa("input", group).forEach(r => r.checked = r.value === system);
    const v = parseMeasure(input.value);
    readout.classList.remove("unit-warning");
    if(v === null){
      readout.textContent = input.value.trim() ? "Enter a number." : "";
      return;
    }
    const other = system === "metric" ? "imperial" : "metric";
    let text = `= ${formatIn(kind, other, convertMeasure(kind, v, system))}`;
    if(kind === "height" && system === "metric" && v / 2.54 >= 12) text += ` (${feetInches(v / 2.54)})`;
    if(k.looksLikeOther && k.looksLikeOther[system](v)){
      readout.classList.add("unit-warning");
      text += ` — this looks like ${k[other].unit}. Check the unit.`;
    }
    readout.textContent = text;
  }

  group.addEventListener("change", (e) => {
    const next = e.target.value;
    if(next === system) return;
    const v = parseMeasure(input.value);
    if(v !== null){
      const converted = convertMeasure(kind, v, system);
      input.value = roundTo(converted, k[next].decimals).toFixed(k[next].decimals);
    }
    system = next;
    setUnitPref(kind, system);
    update();
  });
  input.addEventListener("input", update);
  update();

  return {
    // Value to store, always metric, as text like the rest of the record
    metricValue(){
      const v = parseMeasure(input.value);
      if(v === null) return "";
      const metric = system === "metric" ? v : k.toMetric(v);
      return String(roundTo(metric, k.metric.decimals));
    },
    reset(){ input.value = ""; update(); }
  };
}

/* A "Metric first / US first" switch for pages that only display vitals.
   Sets the preference for all three measurements and calls onChange. */
function attachDisplayUnitSwitch(container, onChange){
  const id = "unitDisplay" + Math.random().toString(36).slice(2, 7);
  const current = () => ["temp","weight","height"].every(k => unitPref(k) === "imperial") ? "imperial" : "metric";
  container.innerHTML = `<span class="small muted" id="${id}-label">Units shown first:</span>
    <div class="unit-switch" role="radiogroup" aria-labelledby="${id}-label" style="margin:0 0 0 6px;">
      <label class="unit-option"><input type="radio" name="${id}" value="metric"><span>°C · kg · cm</span><span class="visually-hidden"> metric</span></label>
      <label class="unit-option"><input type="radio" name="${id}" value="imperial"><span>°F · lb · in</span><span class="visually-hidden"> US</span></label>
    </div>`;
  qsa("input", container).forEach(r => r.checked = r.value === current());
  container._onUnitChange = onChange;
  if(!container._unitBound){ // re-renders reuse one listener
    container._unitBound = true;
    container.addEventListener("change", (e) => {
      ["temp","weight","height"].forEach(k => setUnitPref(k, e.target.value));
      container._onUnitChange();
    });
  }
}
