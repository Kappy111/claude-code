'use strict';

const el = (id) => document.getElementById(id);
const dot = el('dot');
const statusTitle = el('statusTitle');
const statusDetail = el('statusDetail');
const recordBtn = el('recordBtn');
const shortcutHint = el('shortcutHint');
const notice = el('notice');

let recording = false;

function setStatus({ recording: rec, transcribing, ready, message }) {
  if (rec) {
    dot.className = 'dot recording';
    statusTitle.textContent = 'Recording…';
    statusDetail.textContent = 'Press the shortcut or button again to stop.';
    recordBtn.textContent = 'Stop recording';
    recordBtn.classList.add('active');
  } else if (transcribing) {
    dot.className = 'dot busy';
    statusTitle.textContent = 'Transcribing…';
    statusDetail.textContent = 'Converting speech to text locally.';
    recordBtn.textContent = 'Start recording';
    recordBtn.classList.remove('active');
  } else if (ready) {
    dot.className = 'dot ready';
    statusTitle.textContent = 'Ready';
    statusDetail.textContent = 'Press your shortcut on any page to dictate.';
    recordBtn.textContent = 'Start recording';
    recordBtn.classList.remove('active');
  } else {
    dot.className = 'dot loading';
    statusTitle.textContent = message || 'Preparing…';
    statusDetail.textContent = 'The model loads on first use.';
    recordBtn.textContent = 'Start recording';
    recordBtn.classList.remove('active');
  }
}

function showNotice(msg) {
  notice.textContent = msg;
  notice.hidden = false;
}

async function showShortcut() {
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'toggle-recording');
    shortcutHint.textContent = 'Shortcut: ' + (c && c.shortcut ? c.shortcut : 'not set — click “Change shortcut”');
  } catch (_e) {
    /* ignore */
  }
}

recordBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ target: 'background', type: 'manual-toggle' });
});

el('micBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
});
el('shortcutBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
el('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'popup') return;
  if (msg.type === 'state') {
    recording = msg.recording;
    setStatus({ recording: msg.recording });
  } else if (msg.type === 'model-status') {
    setStatus(msg);
  } else if (msg.type === 'notice') {
    showNotice(msg.message);
  }
});

// Initial state.
setStatus({ ready: true });
showShortcut();
