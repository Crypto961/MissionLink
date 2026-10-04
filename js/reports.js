/* MissionLink — reports.js
   Turns the same records every station already created into the donor /
   outcomes report, automatically. Nothing here is entered twice. */

function reportSummary(){
  const patients = db_getPatients();
  const allVisits = patients.flatMap(p => p.visits.map(v => ({...v, patientId:p.id, country:p.country})));

  const byCountry = {};
  MISSIONS.forEach(m => byCountry[m.code] = 0);
  allVisits.forEach(v => { byCountry[v.country] = (byCountry[v.country]||0) + 1; });

  const byCategory = {};
  COMPLAINT_CATEGORIES.forEach(c => byCategory[c.key] = 0);
  allVisits.forEach(v => { byCategory[v.category] = (byCategory[v.category]||0) + 1; });

  const byLanguage = {};
  allVisits.forEach(v => { byLanguage[v.language] = (byLanguage[v.language]||0) + 1; });

  const returningCount = patients.filter(p => p.visits.length > 1).length;
  const newCount = patients.length - returningCount;

  const dispenseLog = db_getDispenseLog();
  const dispensedTotal = dispenseLog.reduce((s,d) => s + d.qty, 0);

  return {
    totalPatients: patients.length,
    totalVisits: allVisits.length,
    byCountry, byCategory, byLanguage,
    returningCount, newCount,
    dispensedTotal,
    lowStock: lowStockItems().length
  };
}
