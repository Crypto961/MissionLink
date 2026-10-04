/* MissionLink — claude.js
   The AI layer on top of speech capture, powered by the Claude API.

   What Claude does here:
   - Triage: turns a raw speech transcript (often noisy, often not English) into
     a cleaned transcript, a plain-English summary for the physician, a routing
     category, and any danger signs the patient actually mentioned. It never
     diagnoses; a nurse confirms everything before it's saved.
   - Physician: tidies a dictated note (punctuation, medical spelling) without
     adding anything the physician didn't say.

   What Claude does NOT do: turn audio into text. The Claude API accepts text,
   images and PDFs, not audio, so speech capture stays in speech.js (the
   browser's recogniser in this demo, an on-device model in production) and
   Claude works on the transcript it produces.

   Credentials: this is a static site with no server, so for the demo the API
   key is entered in the "Claude AI" dialog and kept in this browser's
   localStorage only — never committed, never sent anywhere except the Claude
   API. Anyone with access to this browser can read it, so use a key with a
   spend limit and remove it after a demo. For a real deployment, set a proxy
   URL instead: a small server that holds the key and forwards requests (see
   README, "Claude API setup"). */

const CLAUDE_SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm";
const CLAUDE_MODEL = "claude-opus-5-5";
const CLAUDE_KEY_STORE = "missionlink_claude_key";
const CLAUDE_PROXY_STORE = "missionlink_claude_proxy";

function claudeSettings(){
  try {
    return {
      apiKey: localStorage.getItem(CLAUDE_KEY_STORE) || "",
      baseURL: localStorage.getItem(CLAUDE_PROXY_STORE) || ""
    };
  } catch(e){
    return { apiKey:"", baseURL:"" };
  }
}

function claudeConfigured(){
  const s = claudeSettings();
  return !!(s.apiKey || s.baseURL);
}

let _claudeSdk = null;
async function claudeSdk(){
  if(!_claudeSdk) _claudeSdk = import(CLAUDE_SDK_URL).then(m => m.default || m.Anthropic);
  try {
    return await _claudeSdk;
  } catch(err){
    _claudeSdk = null; // allow a retry once the network is back
    throw new Error("Couldn't load the Claude SDK — check the internet connection.");
  }
}

async function claudeClient(){
  const Anthropic = await claudeSdk();
  const s = claudeSettings();
  const opts = { dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 60_000 };
  // A proxy holds the real key server-side; the browser sends a placeholder.
  opts.apiKey = s.apiKey || "proxy-held-key";
  if(s.baseURL) opts.baseURL = s.baseURL;
  return { Anthropic, client: new Anthropic(opts) };
}

/* Turns SDK errors into a sentence a nurse can act on. */
function claudeErrorMessage(err, Anthropic){
  if(Anthropic){
    if(err instanceof Anthropic.AuthenticationError) return "Claude rejected the API key — check it in Claude AI settings.";
    if(err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use Claude — check the key's workspace.";
    if(err instanceof Anthropic.RateLimitError) return "Claude is busy (rate limit) — try again in a moment.";
    if(err instanceof Anthropic.BadRequestError) return "Claude couldn't process this request.";
    if(err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude — check the internet connection.";
    if(err instanceof Anthropic.APIError) return `Claude returned an error (${err.status}).`;
  }
  return err && err.message ? err.message : "Claude request failed.";
}

/* One request to Claude with server-side refusal fallback opted in, so a
   safety-classifier decline is retried on Anthropic's recommended model rather
   than just failing. Returns the response, or throws a readable Error. */
async function claudeCall(params){
  const { Anthropic, client } = await claudeClient();
  let response;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...params
    });
  } catch(err){
    throw new Error(claudeErrorMessage(err, Anthropic));
  }
  if(response.stop_reason === "refusal") throw new Error("Claude declined this request — use the manual fields.");
  if(response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off — try a shorter recording.");
  return response;
}

function claudeText(response){
  return response.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
}

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    cleaned_transcript: { type: "string", description: "The patient's words in the original language, with recognition errors, punctuation and filler fixed. Nothing added." },
    english_summary: { type: "string", description: "One or two plain-English sentences restating what the patient said, for the physician. No diagnosis." },
    category: { type: "string", enum: COMPLAINT_CATEGORIES.map(c => c.key) },
    danger_signs: { type: "array", items: { type: "string" }, description: "Red-flag symptoms the patient explicitly mentioned, in English. Empty if none." },
    follow_up_question: { type: "string", description: "One short question the nurse could ask to clarify, in English, or an empty string." }
  },
  required: ["cleaned_transcript", "english_summary", "category", "danger_signs", "follow_up_question"],
  additionalProperties: false
};

const TRIAGE_SYSTEM = `You support triage nurses at short-term medical camps in Kenya, Mauritania, Peru and Lebanon.
You receive a chief complaint captured by speech recognition. It may be in Swahili, Hassaniya or Lebanese Arabic, Quechua, Spanish, French or English, and recognition errors are common — a Quechua speaker may have been transcribed with a Spanish recogniser, for example.

Your job is routing support, not diagnosis:
- Restate only what the patient said. Never name a diagnosis, a cause or a treatment.
- Pick the routing category that best fits. Use "other" when unsure.
- List danger signs only when the patient actually mentioned them (for example difficulty breathing, chest pain, heavy bleeding, convulsions, unconsciousness, severe dehydration, high fever in an infant, pregnancy with bleeding or severe pain). Don't infer them.
- If the transcript is too garbled to understand, say so in the English summary and use "other".
- Volunteers use both metric and US units. Whenever the patient states a temperature, weight or height, keep their number and unit and add the other system in brackets in the English summary, e.g. "fever of 102 °F (38.9 °C)", "weighs 20 lb (9.1 kg)".

Routing categories:
${COMPLAINT_CATEGORIES.map(c => `- ${c.key}: ${c.label}`).join("\n")}`;

/* Triage: transcript -> structured, nurse-reviewable result. */
async function claudeAnalyzeComplaint(transcript, { language, locale, age, sex } = {}){
  const response = await claudeCall({
    max_tokens: 2048,
    output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    system: TRIAGE_SYSTEM,
    messages: [{
      role: "user",
      content: `Camp language: ${language || "unknown"} (recogniser locale ${locale || "unknown"}).
Patient: ${sex || "?"}, approx. age ${age ?? "?"}.

<transcript>
${transcript}
</transcript>`
    }]
  });
  const result = JSON.parse(claudeText(response));
  const cat = COMPLAINT_CATEGORIES.find(c => c.key === result.category) || COMPLAINT_CATEGORIES.find(c => c.key === "other");
  return { ...result, category: cat.key, label: cat.label };
}

/* Physician: tidy a dictated note without changing its clinical content. */
async function claudeCleanNote(transcript){
  const response = await claudeCall({
    max_tokens: 4096,
    output_config: { effort: "low" },
    system: `You tidy physicians' dictated clinical notes captured by speech recognition.
Fix punctuation, capitalisation, obvious recognition errors and medical spelling (drug names, doses, units). Keep the physician's wording, order and meaning.
Never add findings, diagnoses, doses or advice that weren't dictated. If a word is unclear, keep it and mark it [unclear].
The care team mixes metric and US units: after every temperature, body weight or height, add the other system in brackets — e.g. "temp 101.3 °F (38.5 °C)", "weight 44 lb (20 kg)". Keep the dictated value first and unchanged. Don't convert drug doses.
Reply with the tidied note only.`,
    messages: [{ role: "user", content: `<dictation>\n${transcript}\n</dictation>` }]
  });
  return claudeText(response);
}

/* Checks a key (or proxy) without spending tokens: looks up the model, which
   needs a valid credential and confirms this account can use it. */
async function claudeTestConnection({ apiKey, baseURL }){
  const Anthropic = await claudeSdk();
  const client = new Anthropic({ apiKey: apiKey || "proxy-held-key", baseURL: baseURL || undefined,
    dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 20_000 });
  try {
    return await client.models.retrieve(CLAUDE_MODEL);
  } catch(err){
    if(err instanceof Anthropic.NotFoundError) throw new Error(`The key works, but this account can't use ${CLAUDE_MODEL}.`);
    throw new Error(claudeErrorMessage(err, Anthropic));
  }
}

/* ---------- Settings dialog (shared by every page that loads this file) ---------- */
function claudeStatusLabel(){
  return claudeConfigured() ? "Claude AI: on" : "Claude AI: set up";
}

function openClaudeSettings(){
  let dlg = document.getElementById("claudeDialog");
  if(!dlg){
    dlg = document.createElement("dialog");
    dlg.id = "claudeDialog";
    dlg.className = "card";
    dlg.setAttribute("aria-labelledby", "claudeDialogTitle");
    dlg.innerHTML = `
      <form method="dialog" id="claudeForm">
        <h2 id="claudeDialogTitle">Claude AI settings</h2>
        <p class="small muted">Claude summarises and translates spoken complaints, sorts them for routing, and tidies dictated notes.
          Speech-to-text itself stays on this device's recogniser — the Claude API works with text, not audio.</p>
        <div class="field">
          <label for="claudeKey">Anthropic API key</label>
          <input type="password" id="claudeKey" autocomplete="off" spellcheck="false" aria-describedby="claudeKeyHelp">
          <p class="small muted" id="claudeKeyHelp" style="margin-top:4px;">Stored only in this browser. Use a key with a spend limit, and clear it after the demo.</p>
        </div>
        <div class="field">
          <label for="claudeProxy">Proxy URL (optional, for production)</label>
          <input type="text" id="claudeProxy" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://your-proxy.example.org" aria-describedby="claudeProxyHelp">
          <p class="small muted" id="claudeProxyHelp" style="margin-top:4px;">A server that holds the key and forwards requests to the Claude API. With a proxy, leave the key empty.</p>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary" value="save">Save</button>
          <button type="submit" class="btn btn-secondary" value="clear">Clear key</button>
          <button type="submit" class="btn btn-ghost" value="cancel" formnovalidate>Cancel</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => {
      if(dlg.returnValue === "save" || dlg.returnValue === "clear"){
        try {
          const key = dlg.returnValue === "clear" ? "" : qs("#claudeKey").value.trim();
          const proxy = dlg.returnValue === "clear" ? "" : qs("#claudeProxy").value.trim();
          if(key) localStorage.setItem(CLAUDE_KEY_STORE, key); else localStorage.removeItem(CLAUDE_KEY_STORE);
          if(proxy) localStorage.setItem(CLAUDE_PROXY_STORE, proxy); else localStorage.removeItem(CLAUDE_PROXY_STORE);
          toast(dlg.returnValue === "clear" ? "Claude AI turned off on this device" : (claudeConfigured() ? "Claude AI is on" : "Claude AI is off"));
        } catch(e){
          toast("This browser blocked saving the settings.");
        }
        document.dispatchEvent(new CustomEvent("claude-settings-changed"));
      }
      qsa("[data-claude-settings]").forEach(b => b.textContent = claudeStatusLabel());
      const opener = dlg._opener;
      if(opener && document.contains(opener)) opener.focus();
    });
  }
  const s = claudeSettings();
  qs("#claudeKey").value = s.apiKey;
  qs("#claudeProxy").value = s.baseURL;
  dlg._opener = document.activeElement;
  dlg.returnValue = "";
  dlg.showModal();
  qs("#claudeKey").focus();
}

/* Any element with data-claude-settings becomes the dialog's opener. */
function initClaudeSettingsButtons(){
  qsa("[data-claude-settings]").forEach(b => {
    b.textContent = claudeStatusLabel();
    b.addEventListener("click", openClaudeSettings);
  });
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initClaudeSettingsButtons);
else initClaudeSettingsButtons();
