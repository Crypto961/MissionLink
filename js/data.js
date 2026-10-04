/* MissionLink — seed data
   All patients, names and vitals below are SYNTHETIC, generated for this demo.
   No real patient data of any kind should ever be committed to this repo. */

/* Mission camps. One record per camp run; `code` is the country code that
   patient records and pass IDs use, so a patient seen in Kenya in 2025 and
   2026 is one record across both missions. These are only the demo's
   starting point: the Admin page creates, edits and removes missions. */
const MISSIONS = [
  { id:"KE-2025", code:"KE", country:"Kenya",      camp:"Turkana Camp",    location:"Lodwar, Turkana County",       language:"Swahili",          startDate:"2025-11-10", endDate:"2025-11-16", dailyHours:"08:00–17:00", notes:"" },
  { id:"MR-2025", code:"MR", country:"Mauritania", camp:"Nouakchott Camp", location:"Sebkha district, Nouakchott",  language:"Hassaniya Arabic", startDate:"2025-11-18", endDate:"2025-11-23", dailyHours:"08:00–16:00", notes:"" },
  { id:"PE-2025", code:"PE", country:"Peru",       camp:"Cusco Highlands", location:"Ccatca, Quispicanchi",         language:"Quechua",          startDate:"2025-09-12", endDate:"2025-09-18", dailyHours:"07:30–16:30", notes:"" },
  { id:"KE-2026", code:"KE", country:"Kenya",      camp:"Turkana Camp",    location:"Lodwar, Turkana County",       language:"Swahili",          startDate:"2026-10-01", endDate:"2026-10-10", dailyHours:"08:00–17:00", notes:"Second year at this site. Interpreters for Turkana available on site." },
  { id:"MR-2026", code:"MR", country:"Mauritania", camp:"Nouakchott Camp", location:"Sebkha district, Nouakchott",  language:"Hassaniya Arabic", startDate:"2026-10-01", endDate:"2026-10-08", dailyHours:"08:00–16:00", notes:"" },
  { id:"PE-2026", code:"PE", country:"Peru",       camp:"Cusco Highlands", location:"Ccatca, Quispicanchi",         language:"Quechua",          startDate:"2026-10-01", endDate:"2026-10-09", dailyHours:"07:30–16:30", notes:"High altitude (3,700 m): stock altitude-sickness supplies." },
  { id:"LB-2026", code:"LB", country:"Lebanon",    camp:"Bekaa Valley",    location:"Bar Elias, Bekaa",             language:"Lebanese Arabic",  startDate:"2026-10-02", endDate:"2026-10-12", dailyHours:"09:00–17:00", notes:"First mission at this site." }
];

/* Languages the speech recogniser and Claude are set up for. */
const MISSION_LANGUAGES = ["Swahili", "Hassaniya Arabic", "Lebanese Arabic", "Quechua", "Spanish", "French", "English", "Arabic", "Portuguese"];

const STAFF_ROLES = [
  { key:"physician",  label:"Physician" },
  { key:"nurse",      label:"Nurse" },
  { key:"pharmacist", label:"Pharmacist" },
  { key:"runner",     label:"Runner" },
  { key:"interpreter",label:"Interpreter" },
  { key:"volunteer",  label:"General volunteer" },
  { key:"lead",       label:"Mission lead" }
];

/* Synthetic volunteer roster for the demo. */
const STAFF_SEED = [
  { id:"S-001", name:"Dr. Leila Haddad",    role:"physician",  specialty:"Family medicine",         languages:"Arabic, French, English", homeCountry:"Lebanon",  missionIds:["LB-2026","MR-2026"] },
  { id:"S-002", name:"Dr. Samuel Otieno",   role:"physician",  specialty:"Pediatrics",              languages:"Swahili, English",        homeCountry:"Kenya",    missionIds:["KE-2025","KE-2026"] },
  { id:"S-003", name:"Dr. María Condori",   role:"physician",  specialty:"Internal medicine",       languages:"Spanish, Quechua",        homeCountry:"Peru",     missionIds:["PE-2025","PE-2026"] },
  { id:"S-004", name:"Dr. James Whitfield", role:"physician",  specialty:"Dermatology",             languages:"English",                 homeCountry:"United States", missionIds:["KE-2026","PE-2026"] },
  { id:"S-005", name:"Dr. Aïcha Ba",        role:"physician",  specialty:"Obstetrics & gynecology", languages:"French, Hassaniya Arabic", homeCountry:"Mauritania", missionIds:["MR-2025","MR-2026"] },
  { id:"S-006", name:"Grace Wanjiku, RN",   role:"nurse",      specialty:"Triage",                  languages:"Swahili, English",        homeCountry:"Kenya",    missionIds:["KE-2026"] },
  { id:"S-007", name:"Nour Khoury, RN",     role:"nurse",      specialty:"Pediatric nursing",       languages:"Arabic, English",         homeCountry:"Lebanon",  missionIds:["LB-2026"] },
  { id:"S-008", name:"Rosa Huamán, RN",     role:"nurse",      specialty:"Midwifery",               languages:"Spanish, Quechua",        homeCountry:"Peru",     missionIds:["PE-2026"] },
  { id:"S-009", name:"Emily Carter, RN",    role:"nurse",      specialty:"Emergency nursing",       languages:"English",                 homeCountry:"Canada",   missionIds:["KE-2026","MR-2026"] },
  { id:"S-010", name:"Karim Mansour",       role:"pharmacist", specialty:"Clinical pharmacy",       languages:"Arabic, French",          homeCountry:"Lebanon",  missionIds:["LB-2026","MR-2026"] },
  { id:"S-011", name:"Peter Mwangi",        role:"pharmacist", specialty:"Community pharmacy",      languages:"Swahili, English",        homeCountry:"Kenya",    missionIds:["KE-2026"] },
  { id:"S-012", name:"Sidi Mohamed Ould Ahmed", role:"interpreter", specialty:"Hassaniya ↔ French",  languages:"Hassaniya Arabic, French", homeCountry:"Mauritania", missionIds:["MR-2026"] },
  { id:"S-013", name:"Lucas Mamani",        role:"runner",     specialty:"",                        languages:"Spanish, Quechua",        homeCountry:"Peru",     missionIds:["PE-2026"] },
  { id:"S-014", name:"Hannah Schmidt",      role:"lead",       specialty:"Operations",              languages:"German, English, French", homeCountry:"Germany",  missionIds:["KE-2026","MR-2026","PE-2026","LB-2026"] }
];

const SETTINGS_SEED = {
  organization: "TotalCare",
  activeMissionId: "KE-2026",
  defaultUnits: "metric"
};

const COMPLAINT_CATEGORIES = [
  { key:"respiratory",   label:"Respiratory",       keywords:["cough","breath","chest","wheeze","asthma"] },
  { key:"gi",            label:"GI / digestive",    keywords:["stomach","diarrhea","vomit","nausea","abdomen"] },
  { key:"musculoskel",   label:"Musculoskeletal",   keywords:["back","joint","knee","muscle","pain in","sprain"] },
  { key:"skin",          label:"Skin",              keywords:["rash","itch","skin","wound","burn"] },
  { key:"fever",         label:"Fever / infection", keywords:["fever","hot","chills","infection"] },
  { key:"maternal",      label:"Maternal / child",  keywords:["pregnan","baby","child","infant"] },
  { key:"dental",        label:"Dental",            keywords:["tooth","teeth","gum","dental"] },
  { key:"other",         label:"Other / unsure",    keywords:[] }
];

const INVENTORY_SEED = [
  { sku:"AMOX-250", name:"Amoxicillin 250mg",        unit:"capsules", onHand:480, parLevel:150 },
  { sku:"PARA-500", name:"Paracetamol 500mg",         unit:"tablets",  onHand:900, parLevel:300 },
  { sku:"ORS-SACH",  name:"Oral rehydration salts",    unit:"sachets",  onHand:260, parLevel:100 },
  { sku:"IBU-200",  name:"Ibuprofen 200mg",           unit:"tablets",  onHand:520, parLevel:200 },
  { sku:"INSULIN",  name:"Insulin (rapid-acting)",     unit:"vials",    onHand:34,  parLevel:20 },
  { sku:"ABX-CREAM",name:"Antibiotic ointment",       unit:"tubes",    onHand:140, parLevel:60 },
  { sku:"ANTIHIST",  name:"Antihistamine 10mg",        unit:"tablets",  onHand:300, parLevel:120 },
  { sku:"GAUZE",    name:"Sterile gauze pads",         unit:"packs",    onHand:210, parLevel:80 },
  { sku:"GLOVES",   name:"Exam gloves (box)",         unit:"boxes",    onHand:65,  parLevel:30 },
  { sku:"ANTIMAL",  name:"Antimalarial course",        unit:"courses",  onHand:90,  parLevel:40 },
  { sku:"VITA-A",    name:"Vitamin A capsules",         unit:"capsules", onHand:400, parLevel:150 },
  { sku:"IRON-FOL",  name:"Iron + folic acid",          unit:"tablets",  onHand:380, parLevel:150 }
];

/* Synthetic patients. visits[] is ordered oldest -> newest.
   A patient with two visits across two camp years is the continuity-of-care demo:
   the physician view will show the prior year's note automatically. */
const PATIENTS_SEED = [
  {
    id:"ML-KE-0001", name:"Amina Wanjiru", sex:"F", approxAge:34, country:"KE", allergies:["Penicillin"],
    visits:[
      { year:2025, date:"2025-11-12", vitals:{bp:"118/76",temp:"37.1",weight:"58",height:"160"},
        complaint:"Persistent cough and chest tightness for two weeks", category:"respiratory",
        language:"Swahili", diagnosis:"Mild bronchitis", prescription:["AMOX-250"], labOrdered:false,
        note:"Advised rest and follow-up if symptoms persist beyond 10 days." },
      { year:2026, date:"2026-10-03", vitals:{bp:"122/78",temp:"36.9",weight:"59",height:"160"},
        complaint:"Follow-up, occasional cough returned", category:"respiratory",
        language:"Swahili", diagnosis:"Resolved, mild seasonal irritation", prescription:[], labOrdered:false,
        note:"" }
    ]
  },
  {
    id:"ML-KE-0002", name:"Joseph Kiptoo", sex:"M", approxAge:7, country:"KE", allergies:[],
    visits:[
      { year:2026, date:"2026-10-03", vitals:{bp:"—",temp:"38.4",weight:"21",height:"115"},
        complaint:"Fever and stomach pain since yesterday", category:"fever",
        language:"Swahili", diagnosis:"", prescription:[], labOrdered:true, note:"" }
    ]
  },
  {
    id:"ML-MR-0001", name:"Fatimetou Mint Salem", sex:"F", approxAge:29, country:"MR", allergies:["Sulfa drugs"],
    visits:[
      { year:2025, date:"2025-11-20", vitals:{bp:"110/70",temp:"36.8",weight:"61",height:"162"},
        complaint:"Lower back pain from carrying water", category:"musculoskel",
        language:"Hassaniya Arabic", diagnosis:"Musculoskeletal strain", prescription:["IBU-200"], labOrdered:false,
        note:"Recommended stretching routine shown to patient." },
      { year:2026, date:"2026-10-03", vitals:{bp:"112/72",temp:"36.9",weight:"60",height:"162"},
        complaint:"Same back pain, worse this season", category:"musculoskel",
        language:"Hassaniya Arabic", diagnosis:"", prescription:[], labOrdered:false, note:"" }
    ]
  },
  {
    id:"ML-MR-0002", name:"Mohamed Ould Brahim", sex:"M", approxAge:52, country:"MR", allergies:[],
    visits:[
      { year:2026, date:"2026-10-03", vitals:{bp:"146/92",temp:"37.0",weight:"78",height:"171"},
        complaint:"Headaches and dizziness for a week", category:"other",
        language:"Hassaniya Arabic", diagnosis:"", prescription:[], labOrdered:false, note:"" }
    ]
  },
  {
    id:"ML-PE-0001", name:"Rosa Quispe Mamani", sex:"F", approxAge:41, country:"PE", allergies:[],
    visits:[
      { year:2025, date:"2025-09-15", vitals:{bp:"116/74",temp:"37.0",weight:"57",height:"152"},
        complaint:"Skin rash on arms", category:"skin",
        language:"Quechua", diagnosis:"Contact dermatitis", prescription:["ANTIHIST","ABX-CREAM"], labOrdered:false,
        note:"Likely reaction to new soap; advised to discontinue use." },
      { year:2026, date:"2026-10-03", vitals:{bp:"118/76",temp:"36.8",weight:"58",height:"152"},
        complaint:"Rash returned on same arm", category:"skin",
        language:"Quechua", diagnosis:"", prescription:[], labOrdered:false, note:"" }
    ]
  },
  {
    id:"ML-PE-0002", name:"Elena Huaman Flores", sex:"F", approxAge:2, country:"PE", allergies:[],
    visits:[
      { year:2026, date:"2026-10-03", vitals:{bp:"—",temp:"37.8",weight:"11",height:"84"},
        complaint:"Mother reports poor appetite and diarrhea", category:"gi",
        language:"Quechua", diagnosis:"", prescription:[], labOrdered:false, note:"" }
    ]
  },
  {
    id:"ML-LB-0001", name:"Hiba Khalil", sex:"F", approxAge:45, country:"LB", allergies:["Latex"],
    visits:[
      { year:2026, date:"2026-10-03", vitals:{bp:"134/88",temp:"37.0",weight:"70",height:"158"},
        complaint:"Joint pain in both knees, worse walking", category:"musculoskel",
        language:"Lebanese Arabic", diagnosis:"", prescription:[], labOrdered:false, note:"" }
    ]
  },
  {
    id:"ML-LB-0002", name:"Ahmad Nasser", sex:"M", approxAge:61, country:"LB", allergies:[],
    visits:[
      { year:2026, date:"2026-10-03", vitals:{bp:"150/95",temp:"36.9",weight:"82",height:"174"},
        complaint:"Known diabetic, needs insulin refill", category:"other",
        language:"Lebanese Arabic", diagnosis:"Type 2 diabetes, stable", prescription:["INSULIN"], labOrdered:false,
        note:"Continue current regimen." }
    ]
  }
];

/* Station queue seed — who is waiting where right now, for the triage / physician / runner views */
const QUEUE_SEED = [
  { patientId:"ML-KE-0002", station:"physician", urgent:true,  arrived:"08:12" },
  { patientId:"ML-PE-0002", station:"triage",    urgent:true,  arrived:"08:20" },
  { patientId:"ML-MR-0002", station:"physician", urgent:false, arrived:"08:05" },
  { patientId:"ML-LB-0001", station:"triage",    urgent:false, arrived:"08:25" },
  { patientId:"ML-LB-0002", station:"pharmacy",  urgent:false, arrived:"07:58" },
  { patientId:"ML-KE-0001", station:"pharmacy",  urgent:false, arrived:"08:02" }
];
