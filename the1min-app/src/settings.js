/* The1Min settings renderer */
const keyEl = document.getElementById('key');
const modelEl = document.getElementById('model');
const envNote = document.getElementById('envNote');

window.the1min.getSettings().then((s) => {
  keyEl.value = s.apiKey || '';
  if (s.model) modelEl.value = s.model;
  if (s.envKey) envNote.textContent = 'An ANTHROPIC_API_KEY is also set in your environment and will be used if this box is empty.';
});

document.getElementById('getkey').addEventListener('click', (e) => {
  e.preventDefault();
  window.the1min.openExternal('https://console.anthropic.com/settings/keys');
});

document.getElementById('save').addEventListener('click', () => {
  window.the1min.saveSettings({ apiKey: keyEl.value, model: modelEl.value });
});
