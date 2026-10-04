'use strict';

const enableBtn = document.getElementById('enableBtn');
const micStatus = document.getElementById('micStatus');
const shortcutBtn = document.getElementById('shortcutBtn');
const shortcutEl = document.getElementById('shortcut');

async function showCurrentShortcut() {
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'toggle-recording');
    if (c && c.shortcut) shortcutEl.textContent = c.shortcut;
    else shortcutEl.textContent = '(not set — click “Change shortcut”)';
  } catch (_e) {
    /* ignore */
  }
}

enableBtn.addEventListener('click', async () => {
  micStatus.textContent = 'Requesting access…';
  micStatus.className = 'status';
  try {
    // Triggers the Chrome microphone prompt for this extension's origin.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    micStatus.textContent = '✓ Microphone enabled. You’re ready to dictate.';
    micStatus.className = 'status ok';
    enableBtn.disabled = true;
  } catch (err) {
    micStatus.textContent =
      '✗ Access denied. Click the camera/mic icon in the address bar to allow it, then try again. (' +
      err.message +
      ')';
    micStatus.className = 'status err';
  }
});

shortcutBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

showCurrentShortcut();
