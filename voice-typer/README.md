# 🎙️ Voice Typer

Press a keyboard shortcut to start recording, press it again to stop, and the
app transcribes your speech **locally** and **auto-pastes** the text wherever
your cursor is. No cloud, no API keys, no cost.

- **Local & free transcription** — [Whisper](https://github.com/openai/whisper)
  runs entirely on your machine via
  [Transformers.js](https://github.com/huggingface/transformers.js) (ONNX /
  WASM). The model downloads once from Hugging Face, then works fully offline.
- **Global, customizable hotkey** — default `Cmd+Shift+Space` (macOS) /
  `Ctrl+Shift+Space` (Windows). Change it in Settings.
- **Audio feedback** — a rising beep when recording starts, a falling beep when
  it stops.
- **Auto-paste at your cursor** — the transcription lands in whatever app is
  focused (editor, browser, chat, email…). The text is also copied to your
  clipboard as a fallback.
- **Cross-platform** — macOS and Windows (Linux works too with `xdotool` /
  `wtype`).

It lives in your menu bar / system tray. There's no dock/taskbar window.

---

## How it works

1. You press the shortcut → a beep plays and recording starts (tray icon turns
   red).
2. You speak.
3. You press the shortcut again → a beep plays, recording stops.
4. The audio is transcribed on-device with Whisper.
5. The result is copied to the clipboard and pasted at your cursor (Cmd+V /
   Ctrl+V is simulated for you).

---

## Running from source

Requires [Node.js](https://nodejs.org/) 18+.

```bash
cd voice-typer
npm install
npm start
```

The first time you record, the selected Whisper model (default **Whisper Base
English**, ~145 MB) downloads from Hugging Face and is cached. After that it
runs offline.

## Building installers

```bash
npm run dist          # build for your current OS
npm run dist:mac      # macOS .dmg / .zip
npm run dist:win      # Windows .exe (NSIS installer)
```

Outputs land in `dist/`. (Build each platform's installer on that platform, or
use a CI matrix — electron-builder does not cross-compile a macOS app from
Windows or vice versa.)

---

## Permissions

**macOS** — grant two permissions in **System Settings → Privacy & Security**:

- **Microphone** → Voice Typer (to record).
- **Accessibility** → Voice Typer (so it can send Cmd+V to paste).

The app requests microphone access on first launch; it will prompt for
Accessibility the first time it tries to paste.

**Windows** — allow microphone access if prompted (**Settings → Privacy →
Microphone**). Auto-paste uses PowerShell `SendKeys` and needs no extra setup.

**Linux** — install `xdotool` (X11) or `wtype` (Wayland) for auto-paste.

---

## Settings

Open the tray icon → **Settings…** (or double-click the tray icon):

| Setting | What it does |
| --- | --- |
| **Keyboard shortcut** | Click the field and press your desired combo. Must include a modifier. |
| **Transcription model** | Trade speed vs. accuracy. Tiny is fastest; Small is most accurate. `.en` models are English-only; the others are multilingual. |
| **Language** | Shown for multilingual models. Auto-detect or pick a language. |
| **Microphone** | Choose an input device, or use the system default. |
| **Auto-paste** | Toggle automatic pasting. If off, the text still goes to your clipboard. |
| **Sounds** | Toggle the start/stop beeps. |

Settings are stored in your OS user-data directory (`settings.json`).

---

## Model options

| Model | Size | Notes |
| --- | --- | --- |
| `whisper-tiny.en` | ~75 MB | Fastest, English only |
| `whisper-base.en` | ~145 MB | **Default** — good balance, English only |
| `whisper-small.en` | ~490 MB | Most accurate English, slower |
| `whisper-tiny` / `base` / `small` | same sizes | Multilingual variants |

All are free, open-weight models run locally — nothing is sent to a server.

---

## Troubleshooting

- **Nothing pastes, but text is on the clipboard** — grant Accessibility
  permission (macOS) or install `xdotool`/`wtype` (Linux). You can always paste
  manually with Cmd/Ctrl+V.
- **Shortcut won't save** — another app or the OS already owns that combo. Pick
  a different one.
- **First transcription is slow** — the model is downloading. Subsequent runs
  are fast and offline.
- **No microphone found** — check OS microphone permissions, then reopen
  Settings.

---

## Tech

- [Electron](https://www.electronjs.org/) — cross-platform desktop shell, global
  shortcuts, tray, clipboard.
- [@huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers)
  — Whisper inference in-process (WASM/WebGPU).
- OS automation (`osascript` / PowerShell `SendKeys` / `xdotool`) for pasting —
  no native modules to compile.

MIT licensed.
