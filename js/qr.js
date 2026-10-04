/* MissionLink — qr.js
   Thin wrapper around the QRCode library (loaded via CDN script tag in each
   HTML page that needs it). Renders a patient's pass: a scannable QR plus
   the plain-text ID as a human-readable fallback for when a scanner isn't
   handy. NFC write/read needs real hardware and a secure context the demo
   can't assume, so NFC is represented here as "tap this card" in the UI
   copy and documented in the README as a production hardware step, not
   faked in the browser. */

function renderPassCard(container, patient){
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "qr-box";
  container.appendChild(box);

  if(window.QRCode){
    new QRCode(box, { text: patient.id, width: 112, height: 112, correctLevel: QRCode.CorrectLevel.M });
  } else {
    box.innerHTML = `<div class="muted small" style="width:112px;height:112px;display:flex;align-items:center;justify-content:center;text-align:center;">QR library not loaded</div>`;
  }
}
