// Injected into the form page (all frames) when the operator clicks a button in the side panel.
// It fills, verifies or clears the fields that are visible on the current page.
// It never clicks buttons, never navigates, never submits and never touches attestations or file uploads.
(() => {
  if (window.__idrFiller) return;

  const STYLE_ID = 'idr-filler-style';
  const CLASSES = ['idr-ok', 'idr-bad', 'idr-manual'];
  const TRUE_WORDS = ['yes', 'y', 'true', '1', 'x', 'checked'];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.idr-ok { outline: 3px solid #10B981 !important; outline-offset: 2px; }',
      '.idr-bad { outline: 3px solid #E31B23 !important; outline-offset: 2px; }',
      '.idr-manual { outline: 3px dashed #F59E0B !important; outline-offset: 2px; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function byLabel(text) {
    const want = norm(text);
    if (!want) return null;
    for (const label of document.querySelectorAll('label, legend')) {
      if (!norm(label.textContent).startsWith(want)) continue;
      if (label.htmlFor) {
        const el = document.getElementById(label.htmlFor);
        if (el) return el;
      }
      const inner = label.querySelector('input, select, textarea');
      if (inner) return inner;
      const group = label.closest('fieldset');
      if (group) {
        const first = group.querySelector('input, select, textarea');
        if (first) return first;
      }
    }
    for (const el of document.querySelectorAll('[aria-label]')) {
      if (norm(el.getAttribute('aria-label')).startsWith(want)) return el;
    }
    return null;
  }

  // Returns the list of elements for a mapping (several for a radio group).
  function locate(entry) {
    let list = [];
    if (entry.selector) {
      try { list = Array.from(document.querySelectorAll(entry.selector)); } catch (e) { list = []; }
    }
    if (!list.length && entry.label) {
      const el = byLabel(entry.label);
      if (el) list = el.type === 'radio' && el.name
        ? Array.from(document.querySelectorAll('input[type="radio"][name="' + el.name + '"]'))
        : [el];
    }
    return list;
  }

  function toIso(value) {
    const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return String(value).trim();
    return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  }

  function toUs(value) {
    const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[2] + '/' + m[3] + '/' + m[1] : String(value).trim();
  }

  function expectedFor(entry, el) {
    let v = entry.value == null ? '' : String(entry.value);
    if (el && el.type === 'date') return toIso(v);
    if (entry.format === 'MM/DD/YYYY') return toUs(v);
    return v.trim();
  }

  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function matchOption(select, value) {
    const want = norm(value);
    return Array.from(select.options).find((o) => norm(o.value) === want)
      || Array.from(select.options).find((o) => norm(o.textContent) === want)
      || Array.from(select.options).find((o) => want && norm(o.textContent).startsWith(want));
  }

  function radioMatches(radio, value) {
    const want = norm(value);
    const label = radio.id ? document.querySelector('label[for="' + radio.id + '"]') : null;
    return norm(radio.value) === want || (label && norm(label.textContent) === want);
  }

  function write(entry, els) {
    const el = els[0];
    if (entry.type === 'radio' || el.type === 'radio') {
      const target = els.find((r) => radioMatches(r, entry.value));
      if (!target) return false;
      target.checked = true;
      fire(target);
      return true;
    }
    if (el.tagName === 'SELECT') {
      const opt = matchOption(el, entry.value);
      if (!opt) return false;
      setNative(el, opt.value);
      fire(el);
      return true;
    }
    if (el.type === 'checkbox') {
      const want = TRUE_WORDS.indexOf(norm(entry.value)) !== -1;
      if (el.checked !== want) {
        el.checked = want;
        fire(el);
      }
      return true;
    }
    setNative(el, expectedFor(entry, el));
    fire(el);
    return true;
  }

  function read(entry, els) {
    const el = els[0];
    if (entry.type === 'radio' || el.type === 'radio') {
      const on = els.find((r) => r.checked);
      return { ok: !!on && radioMatches(on, entry.value), shown: on ? on.value : '(none)' };
    }
    if (el.tagName === 'SELECT') {
      const opt = el.options[el.selectedIndex];
      const want = matchOption(el, entry.value);
      return { ok: !!want && opt === want, shown: opt ? opt.textContent.trim() : '' };
    }
    if (el.type === 'checkbox') {
      const want = TRUE_WORDS.indexOf(norm(entry.value)) !== -1;
      return { ok: el.checked === want, shown: el.checked ? 'checked' : 'unchecked' };
    }
    return { ok: norm(el.value) === norm(expectedFor(entry, el)), shown: el.value };
  }

  function mark(els, cls, note) {
    els.forEach((e) => {
      e.classList.remove(...CLASSES);
      e.classList.add(cls);
      if (note) e.title = note;
    });
  }

  function isForbidden(el) {
    const t = (el.type || '').toLowerCase();
    return el.tagName === 'BUTTON' || t === 'submit' || t === 'button' || t === 'reset' || t === 'image';
  }

  // mode: 'fill' writes then checks; 'verify' only checks.
  function run(entries, mode) {
    ensureStyle();
    const results = [];
    let onPage = 0;
    for (const entry of entries) {
      const els = locate(entry);
      const base = { field: entry.field, label: entry.label };
      if (!els.length) { results.push(Object.assign(base, { status: 'not-found' })); continue; }
      if (!els.some(isVisible)) { results.push(Object.assign(base, { status: 'not-on-page' })); continue; }
      onPage++;
      if (els.some(isForbidden)) { results.push(Object.assign(base, { status: 'blocked' })); continue; }

      if (entry.type === 'file' || els[0].type === 'file') {
        mark(els, 'idr-manual', 'Upload the bundle documents by hand');
        results.push(Object.assign(base, { status: 'manual-upload' }));
        continue;
      }
      if (entry.type === 'attest') {
        mark(els, 'idr-manual', 'The operator must confirm this personally');
        results.push(Object.assign(base, { status: 'operator-confirms' }));
        continue;
      }
      if (entry.value === '' || entry.value == null) {
        mark(els, 'idr-bad', 'No value in the bundle');
        results.push(Object.assign(base, { status: 'no-data' }));
        continue;
      }
      if (mode === 'fill' && !write(entry, els)) {
        mark(els, 'idr-bad', 'Value not available on this form: ' + entry.value);
        results.push(Object.assign(base, { status: 'mismatch', expected: entry.value, shown: '' }));
        continue;
      }
      const check = read(entry, els);
      mark(els, check.ok ? 'idr-ok' : 'idr-bad', check.ok ? 'Matches the bundle' : 'Does not match the bundle: ' + entry.value);
      results.push(Object.assign(base, { status: check.ok ? 'ok' : 'mismatch', expected: entry.value, shown: check.shown }));
    }
    return { frame: location.href, onPage: onPage, results: results };
  }

  function clear() {
    document.querySelectorAll('.' + CLASSES.join(', .')).forEach((e) => {
      e.classList.remove(...CLASSES);
      e.removeAttribute('title');
    });
    return { frame: location.href, cleared: true };
  }

  window.__idrFiller = {
    fill: (entries) => run(entries, 'fill'),
    verify: (entries) => run(entries, 'verify'),
    clear: clear
  };
})();
