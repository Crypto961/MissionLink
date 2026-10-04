/* MissionLink — lookup.js
   "Find my record" for a patient who has lost their QR/NFC card.
   Deliberately NOT facial recognition — see README for why. This matches on
   name (fuzzy, to absorb transliteration spelling differences across four
   languages), approximate age, sex and country, then shows the stored
   reference photo of each candidate for a staff member to compare by eye
   and confirm. No algorithm decides the match; a person does. */

function levenshtein(a, b){
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  const d = Array.from({length:m+1}, () => new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) d[i][0] = i;
  for(let j=0;j<=n;j++) d[0][j] = j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i-1][j] + 1,
        d[i][j-1] + 1,
        d[i-1][j-1] + cost
      );
    }
  }
  return d[m][n];
}

function nameSimilarity(a, b){
  const dist = levenshtein(a, b);
  const longer = Math.max(a.length, b.length) || 1;
  return 1 - dist / longer;
}

/* Returns candidates sorted best-first. Each candidate carries a score
   (0-1) and the reasons it matched, so staff see WHY it was suggested
   rather than trusting a black box. */
function findPatientCandidates({ name="", approxAge=null, sex="", country="" }, limit=5){
  const patients = db_getPatients();
  const scored = patients.map(p => {
    let score = 0;
    const reasons = [];

    if(name.trim()){
      const sim = nameSimilarity(name, p.name);
      score += sim * 0.55;
      if(sim > 0.6) reasons.push("name is a close match");
    }
    if(approxAge !== null && approxAge !== "" && !isNaN(approxAge)){
      const diff = Math.abs(Number(approxAge) - p.approxAge);
      if(diff <= 2){ score += 0.2; reasons.push("age matches closely"); }
      else if(diff <= 5){ score += 0.1; reasons.push("age is close"); }
    }
    if(sex && sex === p.sex){ score += 0.1; reasons.push("sex matches"); }
    if(country && country === p.country){ score += 0.15; reasons.push("same camp/country"); }

    return { patient:p, score, reasons };
  });

  return scored
    .filter(s => s.score > 0.15)
    .sort((a,b) => b.score - a.score)
    .slice(0, limit);
}

/* Renders a candidate list into a container element. onConfirm(patient) fires
   when staff tap "This is the patient" after visually comparing the photo. */
function renderCandidates(container, candidates, onConfirm){
  container.innerHTML = "";
  if(candidates.length === 0){
    container.innerHTML = `<p class="muted">No close matches yet — refine the search, or register as a new patient.</p>`;
    return;
  }
  candidates.forEach(({patient, reasons}) => {
    const row = document.createElement("div");
    row.className = "match-card";
    row.innerHTML = `
      <div class="match-photo"><img src="${avatarDataUri(patient.name)}" alt=""></div>
      <div class="match-info">
        <div class="match-name">${patient.name}</div>
        <div class="match-meta">${patient.sex} · approx. age ${patient.approxAge} · ${missionForCode(patient.country).country}</div>
        <div class="match-meta small">${reasons.join(", ") || "possible match"}</div>
      </div>
      <button class="btn btn-secondary">Compare &amp; confirm</button>
    `;
    row.querySelector("button").addEventListener("click", () => onConfirm(patient));
    container.appendChild(row);
  });
}
