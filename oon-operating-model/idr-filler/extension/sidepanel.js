// Side panel: lists ready bundles from the Google Sheet backend and fills the current page on request.
const $ = (id) => document.getElementById(id);

const STATUS_TEXT = {
  'ok': 'Filled and matches',
  'mismatch': 'Does not match the bundle',
  'no-data': 'No value in the bundle',
  'not-found': 'Field not found on the form',
  'blocked': 'Mapped to a button; skipped',
  'operator-confirms': 'You must confirm this yourself',
  'manual-upload': 'Upload the documents by hand'
};

// Hosts already covered by the manifest; anything else is requested at runtime.
const BUILT_IN_HOSTS = [/^https:\/\/script\.google\.com$/, /^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com$/];

let settings = {};
let current = null; // { bundle, mappings }

// ---------------------------------------------------------------- helpers

function toast(message, isError) {
  const t = $('toast');
  t.textContent = message;
  t.classList.toggle('error', !!isError);
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), isError ? 6000 : 3000);
}

function show(view) {
  ['setup', 'queue-view', 'bundle-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

function busy(on) {
  document.querySelectorAll('button').forEach((b) => { b.disabled = on; });
}

async function loadSettings() {
  settings = await chrome.storage.sync.get(['apiUrl', 'token', 'operator']);
  $('who').textContent = settings.operator ? 'Operator: ' + settings.operator : 'Operator not set';
  return !!(settings.apiUrl && settings.token && settings.operator);
}

async function apiGet(params) {
  const url = new URL(settings.apiUrl);
  Object.entries(Object.assign({ token: settings.token }, params)).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { redirect: 'follow' });
  return parse(res);
}

async function apiPost(body) {
  const res = await fetch(settings.apiUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: settings.token, operator: settings.operator }, body))
  });
  return parse(res);
}

async function parse(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('The backend did not return JSON. Check the web app URL and that it is deployed for your access level.');
  }
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function log(event, details) {
  if (!current) return;
  apiPost({ api: 'log', bundleId: current.bundle.id, event: event, details: details }).catch(() => {});
}

// ---------------------------------------------------------------- queue

async function loadQueue() {
  show('queue-view');
  $('queue').innerHTML = '<div class="empty">Loading…</div>';
  try {
    const data = await apiGet({ api: 'queue' });
    $('queue').innerHTML = '';
    if (!data.bundles.length) {
      $('queue').innerHTML = '<div class="empty">No bundles are ready right now.</div>';
      return;
    }
    data.bundles.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'item';
      const title = document.createElement('b');
      title.textContent = b.id + ' · ' + b.action;
      const sub = document.createElement('span');
      sub.textContent = [b.payer, b.team, b.owner, b.due ? 'due ' + b.due : ''].filter(Boolean).join(' · ');
      btn.append(title, sub);
      btn.addEventListener('click', () => openBundle(b.id));
      $('queue').appendChild(btn);
    });
  } catch (e) {
    $('queue').innerHTML = '';
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- bundle

async function openBundle(id) {
  busy(true);
  try {
    const data = await apiGet({ api: 'bundle', id: id });
    current = { bundle: data.bundle, mappings: data.mappings };
    renderBundle();
    show('bundle-view');
    log('opened', {});
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy(false);
  }
}

function renderBundle() {
  const b = current.bundle;
  $('b-id').textContent = b.id;
  $('b-meta').textContent = [b.action, b.team, b.owner, b.due ? 'due ' + b.due : ''].filter(Boolean).join(' · ');

  $('b-docs').innerHTML = '';
  (b.documents.length ? b.documents : ['No documents listed']).forEach((d) => {
    const isLink = /^https:\/\//.test(d);
    const el = document.createElement(isLink ? 'a' : 'span');
    el.textContent = (isLink ? 'Open document: ' : 'Document: ') + d;
    if (isLink) { el.href = d; el.target = '_blank'; el.rel = 'noopener'; }
    $('b-docs').appendChild(el);
  });

  $('values').innerHTML = '';
  current.mappings.forEach((m) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td');
    const v = document.createElement('td');
    a.textContent = m.label || m.field;
    v.textContent = m.type === 'file' ? '(upload by hand)' : (b.fields[m.field] || '');
    tr.append(a, v);
    $('values').appendChild(tr);
  });

  $('summary').classList.add('hidden');
  $('results').innerHTML = '';
  $('confirmation').value = '';
  $('reason').value = '';
}

function entries() {
  return current.mappings.map((m) => Object.assign({}, m, { value: current.bundle.fields[m.field] }));
}

// ---------------------------------------------------------------- page actions

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https:\/\//.test(tab.url)) throw new Error('Open the form page (an https page) in the current tab first.');
  return tab;
}

async function ensureAccess(tab) {
  const origin = new URL(tab.url).origin;
  if (BUILT_IN_HOSTS.some((r) => r.test(origin))) return;
  const wanted = { origins: [origin + '/*'] };
  if (await chrome.permissions.contains(wanted)) return;
  const granted = await chrome.permissions.request(wanted);
  if (!granted) throw new Error('Permission to work on ' + origin + ' was not granted.');
}

async function inject(tab, call, args) {
  const run = async (target) => {
    await chrome.scripting.executeScript({ target: target, files: ['page-actions.js'] });
    return chrome.scripting.executeScript({
      target: target,
      func: (name, payload) => window.__idrFiller[name](payload),
      args: [call, args || null]
    });
  };
  try {
    return await run({ tabId: tab.id, allFrames: true });
  } catch (e) {
    // A frame we may not touch (for example a third-party iframe): fall back to the top frame only.
    return run({ tabId: tab.id, frameIds: [0] });
  }
}

async function pageAction(call) {
  if (!current) return;
  busy(true);
  try {
    const tab = await activeTab();
    await ensureAccess(tab);
    const frames = await inject(tab, call, call === 'clear' ? null : entries());
    if (call === 'clear') {
      $('summary').classList.add('hidden');
      $('results').innerHTML = '';
      toast('Highlights cleared');
      return;
    }
    const best = frames
      .map((f) => f.result)
      .filter(Boolean)
      .sort((a, b) => b.onPage - a.onPage)[0];
    if (!best || !best.onPage) {
      showSummary('bad', 'No mapped fields were found on this page. Is the right form open?');
      $('results').innerHTML = '';
      log(call, { onPage: 0, url: tab.url });
      return;
    }
    renderResults(best.results.filter((r) => r.status !== 'not-on-page'));
    log(call, counts(best.results));
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy(false);
  }
}

function counts(results) {
  const c = {};
  results.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

function showSummary(kind, text) {
  const s = $('summary');
  s.className = 'summary ' + kind;
  s.textContent = text;
}

function renderResults(results) {
  const c = counts(results);
  const problems = (c['mismatch'] || 0) + (c['no-data'] || 0) + (c['not-found'] || 0) + (c['blocked'] || 0);
  const manual = (c['operator-confirms'] || 0) + (c['manual-upload'] || 0);
  if (problems) {
    showSummary('bad', problems + ' field(s) need attention before you continue.');
  } else if (manual) {
    showSummary('warn', (c.ok || 0) + ' field(s) match. ' + manual + ' item(s) are yours to do by hand.');
  } else {
    showSummary('good', 'All ' + (c.ok || 0) + ' field(s) on this page match the bundle. Check them, then continue.');
  }

  $('results').innerHTML = '';
  results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'res';
    const dot = document.createElement('span');
    dot.className = 'dot ' + r.status;
    const text = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = r.label || r.field;
    const note = document.createElement('small');
    note.textContent = STATUS_TEXT[r.status] + (r.status === 'mismatch' ? ' (bundle: ' + r.expected + ', form: ' + (r.shown || 'empty') + ')' : '');
    text.append(name, note);
    row.append(dot, text);
    $('results').appendChild(row);
  });
}

// ---------------------------------------------------------------- finish

async function setStatus(status) {
  if (!current) return;
  const body = { api: 'status', bundleId: current.bundle.id, status: status };
  if (status === 'Filed') {
    body.confirmation = $('confirmation').value.trim();
    if (!body.confirmation) { toast('Enter the confirmation or dispute number first.', true); return; }
  } else {
    body.reason = $('reason').value.trim();
    if (!body.reason) { toast('Say what needs fixing before returning the bundle.', true); return; }
  }
  busy(true);
  try {
    await apiPost(body);
    toast(status === 'Filed' ? 'Marked as filed' : 'Returned to Lebanon');
    current = null;
    await loadQueue();
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy(false);
  }
}

// ---------------------------------------------------------------- wiring

$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('refresh').addEventListener('click', loadQueue);
$('back').addEventListener('click', () => { current = null; loadQueue(); });
$('fill').addEventListener('click', () => pageAction('fill'));
$('verify').addEventListener('click', () => pageAction('verify'));
$('clear').addEventListener('click', () => pageAction('clear'));
$('filed').addEventListener('click', () => setStatus('Filed'));
$('return').addEventListener('click', () => setStatus('Returned'));

chrome.storage.onChanged.addListener(async () => {
  if (await loadSettings()) loadQueue(); else show('setup');
});

(async () => {
  if (await loadSettings()) loadQueue(); else show('setup');
})();
