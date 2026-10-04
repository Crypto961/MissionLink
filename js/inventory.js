/* MissionLink — inventory.js
   Dispensing an item IS the inventory log — there is no separate end-of-day
   tally step. That is the point: a spreadsheet needs someone to stop and
   type; here, serving the next patient is the only action required, and
   the stock count updates itself. */

function lowStockItems(){
  return db_getInventory().filter(i => i.onHand <= i.parLevel);
}

function stockPct(item){
  const ceiling = item.parLevel * 3; // visual reference point, not a hard max
  return Math.max(4, Math.min(100, Math.round((item.onHand / ceiling) * 100)));
}

/* Applies a prescription (array of SKUs) at the pharmacy counter.
   Returns a per-item result list so the UI can show exactly what dispensed
   and what didn't, rather than a single pass/fail for the whole order. */
function dispensePrescription(skus, patientId, qtyPerItem=1){
  return skus.map(sku => {
    const res = db_dispense(sku, qtyPerItem, patientId);
    const item = db_getInventory().find(i => i.sku === sku);
    return { sku, name: item ? item.name : sku, ...res };
  });
}

/* Simple next-mission packing suggestion: items that ran below par level
   this mission get flagged to pack more of next time. This is the
   longitudinal payoff of the Ledger across missions and years. */
function packingSuggestions(){
  return db_getInventory()
    .filter(i => i.onHand <= i.parLevel)
    .map(i => ({ sku:i.sku, name:i.name, suggestion: Math.max(i.parLevel * 2 - i.onHand, i.parLevel) }));
}

/* Stock rows shared by the pharmacist and dashboard views. The bar is visual
   only; the row text ("Amoxicillin 250mg, low stock: 120 on hand, par level 150")
   is what screen readers get, and "low" is a text badge, not just a red bar. */
function stockRowsHtml(items){
  return `<ul class="queue-list">` + items.map(item => {
    const low = item.onHand <= item.parLevel;
    return `<li class="bar-row">
      <div class="name">${esc(item.name)}${low ? ' <span class="badge badge-danger" style="margin-left:4px;">low<span class="visually-hidden"> stock</span></span>' : ""}<span class="visually-hidden">:</span></div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${stockPct(item)}%; ${low ? "background:var(--danger);" : ""}"></div></div>
      <div class="val">${item.onHand}<span class="visually-hidden"> ${esc(item.unit)} on hand, par level ${item.parLevel}</span></div>
    </li>`;
  }).join("") + `</ul>`;
}
