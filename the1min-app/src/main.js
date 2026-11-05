// The1Min — main process
// Lives in the menu bar / tray. Watches for ~1 minute of being stuck (no input),
// and gives a global hotkey to summon help instantly. On trigger it screenshots the
// screen, asks Claude (vision) what you're stuck on, and shows the best way to get unstuck.

const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain,
        desktopCapturer, screen, nativeImage, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const IDLE_TRIGGER_SECONDS = 60;      // "stuck for more than a minute"
const IDLE_MAX_SECONDS     = 240;     // don't pop if you've clearly walked away
const HOTKEY = 'CommandOrControl+Shift+Space';

let tray = null;
let popup = null;
let settingsWin = null;
let watching = true;
let idleFired = false;
let lastShot = null;   // keep the last screenshot so "dig deeper" can re-ask
let lastNote = '';
let busy = false;

/* ---------------- config (API key + model) ---------------- */
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function saveConfig(c) {
  try { fs.writeFileSync(configPath(), JSON.stringify(c, null, 2)); } catch (e) { console.error(e); }
}
function getApiKey() { return loadConfig().apiKey || process.env.ANTHROPIC_API_KEY || ''; }
function getModel()  { return loadConfig().model || 'claude-opus-5-5'; }

/* ---------------- windows ---------------- */
function makePopup() {
  const win = new BrowserWindow({
    width: 440, height: 560, show: false, frame: false, resizable: true,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'popup.html'));
  win.on('closed', () => { popup = null; });
  return win;
}
function showPopup() {
  if (!popup) popup = makePopup();
  // place it top-center of the primary display
  const area = screen.getPrimaryDisplay().workArea;
  const [w] = popup.getSize();
  popup.setPosition(Math.round(area.x + (area.width - w) / 2), area.y + 60);
  popup.showInactive();
  popup.setAlwaysOnTop(true, 'floating');
  popup.focus();
}
function sendState(payload) { if (popup && !popup.isDestroyed()) popup.webContents.send('state', payload); }

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 440, height: 440, title: 'The1Min — Settings', resizable: false, minimizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

/* ---------------- screenshot ---------------- */
async function capture() {
  const d = screen.getPrimaryDisplay();
  const scale = d.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(d.size.width * scale), height: Math.round(d.size.height * scale) }
  });
  const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[0];
  if (!src) throw new Error('NO_SCREEN');
  let img = src.thumbnail;
  const sz = img.getSize();
  if (sz.width > 1600) img = img.resize({ width: 1600 });   // keep the API payload small
  return img.toPNG().toString('base64');
}

/* ---------------- ask Claude ---------------- */
async function askClaude(b64, note) {
  const key = getApiKey();
  if (!key) { const e = new Error('NO_KEY'); e.code = 'NO_KEY'; throw e; }
  const mod = require('@anthropic-ai/sdk');
  const Anthropic = mod.default || mod;   // works across SDK major versions
  const client = new Anthropic({ apiKey: key });

  const instructions =
`You are The1Min, a calm, friendly helper. The person has been stuck on their computer for more than a minute. Below is a screenshot of their screen.

Look at the screenshot. Work out what they are most likely trying to do and where they appear to be stuck — an error, a blank result, a confusing screen, or a task that is not responding.
${note ? `The person also said: "${note}"` : ''}
Explain simply and kindly, the way you'd help a clever kid. Short, plain words.

Reply with ONLY a JSON object, no other text, shaped exactly like this:
{"problem":"<one friendly sentence naming what they seem stuck on>","steps":["<small concrete thing to try>","<next>","<next>"],"resource":"<the single best thing to look up or place to check, in plain words>","prompt":"<a short ready-to-paste prompt they can give an AI or a search box>","cheer":"<one short encouraging line, max 12 words>"}
Use 2 to 4 steps. Keep every string short. If the screenshot is unclear, make your best guess and say so gently in "problem".`;

  const msg = await client.messages.create({
    model: getModel(),
    max_tokens: 1024,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
        { type: 'text', text: instructions }
      ]
    }]
  });

  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return parseResult(text);
}

function parseResult(text) {
  let obj = null;
  try { obj = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch {} }
  }
  if (!obj || typeof obj !== 'object') {
    return { problem: text || 'I had trouble reading the screen, but let\'s keep going.',
             steps: ['Tell me in a word or two what you were doing.', 'Then tap “dig deeper” and I\'ll try again.'],
             resource: 'Search the exact words of what\'s going wrong, plus the app you\'re using.',
             prompt: 'I\'m stuck. Here\'s what I was doing: ___. What should I try first?',
             cheer: 'Still here with you.' };
  }
  return {
    problem: String(obj.problem || 'Here\'s what I think you\'re stuck on.'),
    steps: Array.isArray(obj.steps) && obj.steps.length ? obj.steps.map(String).slice(0, 4)
           : ['Break it into the smallest piece that still goes wrong.', 'Try that one piece on its own.'],
    resource: String(obj.resource || 'Look up the exact wording of the problem plus your app\'s help pages.'),
    prompt: String(obj.prompt || 'I\'m trying to ___ but ___ happens. What\'s the simplest fix?'),
    cheer: String(obj.cheer || 'You\'ve got this.')
  };
}

/* ---------------- trigger ---------------- */
async function trigger(reason, note) {
  if (busy) return;
  busy = true;
  idleFired = true;
  try {
    showPopup();
    // macOS needs Screen Recording permission to capture anything but a black frame.
    if (process.platform === 'darwin' &&
        systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      sendState({ kind: 'noperm' });
      return;
    }
    sendState({ kind: 'thinking', reason });
    const b64 = note && lastShot ? lastShot : await capture();
    lastShot = b64; lastNote = note || '';
    const data = await askClaude(b64, note);
    sendState({ kind: 'result', data });
  } catch (e) {
    if (e && e.code === 'NO_KEY') sendState({ kind: 'nokey' });
    else sendState({ kind: 'error', message: (e && e.message) || String(e) });
  } finally {
    busy = false;
  }
}

/* ---------------- idle watch ---------------- */
function startIdleWatch() {
  setInterval(() => {
    if (!watching || busy) return;
    const idle = require('electron').powerMonitor.getSystemIdleTime(); // seconds since last input
    if (idle < 5) idleFired = false;                                   // became active again -> re-arm
    if (!idleFired && idle >= IDLE_TRIGGER_SECONDS && idle <= IDLE_MAX_SECONDS) {
      trigger('idle');
    }
  }, 2000);
}

/* ---------------- tray ---------------- */
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'The1Min', enabled: false },
    { type: 'separator' },
    { label: 'Help me now', accelerator: HOTKEY, click: () => trigger('manual') },
    { label: 'Watch for when I\'m stuck', type: 'checkbox', checked: watching,
      click: (i) => { watching = i.checked; idleFired = false; } },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Quit The1Min', click: () => app.quit() }
  ]);
}

/* ---------------- app lifecycle ---------------- */
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();   // menu-bar-only app

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(false);  // keep the amber color
  tray = new Tray(icon);
  tray.setToolTip('The1Min — stuck for a minute? I jump in.');
  tray.setContextMenu(buildMenu());

  globalShortcut.register(HOTKEY, () => trigger('manual'));
  startIdleWatch();

  // First run with no key: open settings so it actually works.
  if (!getApiKey()) openSettings();
});

// Tray app: don't quit when windows close.
app.on('window-all-closed', (e) => { /* stay alive in the tray */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

/* ---------------- IPC from renderer ---------------- */
ipcMain.on('popup:close', () => { if (popup && !popup.isDestroyed()) popup.hide(); });
ipcMain.on('popup:deeper', (_e, note) => trigger('deeper', note || lastNote || 'That did not help — try a different angle.'));
ipcMain.on('popup:settings', () => openSettings());
ipcMain.handle('settings:get', () => {
  const c = loadConfig();
  return { apiKey: c.apiKey || '', model: c.model || 'claude-opus-5-5', envKey: !!process.env.ANTHROPIC_API_KEY };
});
ipcMain.on('settings:save', (_e, data) => {
  const c = loadConfig();
  if (typeof data.apiKey === 'string') c.apiKey = data.apiKey.trim();
  if (typeof data.model === 'string' && data.model.trim()) c.model = data.model.trim();
  saveConfig(c);
  tray && tray.setContextMenu(buildMenu());
  if (settingsWin) settingsWin.close();
});
ipcMain.on('open-external', (_e, url) => { try { shell.openExternal(url); } catch {} });
