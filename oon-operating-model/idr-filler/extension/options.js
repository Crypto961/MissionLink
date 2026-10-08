const fields = ['apiUrl', 'token', 'operator'];

chrome.storage.sync.get(fields).then((saved) => {
  fields.forEach((f) => { document.getElementById(f).value = saved[f] || ''; });
});

document.getElementById('save').addEventListener('click', async () => {
  const values = {};
  fields.forEach((f) => { values[f] = document.getElementById(f).value.trim(); });
  const msg = document.getElementById('msg');
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(values.apiUrl)) {
    msg.textContent = 'The URL should start with https://script.google.com/ and end with /exec.';
    return;
  }
  if (!values.token || !values.operator) {
    msg.textContent = 'Add the API token and your name.';
    return;
  }
  await chrome.storage.sync.set(values);
  msg.textContent = 'Saved. Open the side panel from the toolbar icon.';
});
