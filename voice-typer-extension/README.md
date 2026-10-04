# 🎙️ Voice Typer (Chrome / ChromeOS extension)

Press a keyboard shortcut to start recording, press it again to stop, and the
extension transcribes your speech **locally** with Whisper and **types it at
your cursor** on the current web page. No cloud, no API keys, no cost.

Built for **Chromebooks** (and any desktop Chrome / Edge). Your Chromebook Plus
can run the speech model on-device, including GPU acceleration via WebGPU.

- **Local & free** — [Whisper](https://github.com/openai/whisper) runs entirely
  in your browser via
  [Transformers.js](https://github.com/huggingface/transformers.js) (ONNX /
  WASM / WebGPU). The model (and the runtime) are bundled in the extension; only
  the model weights download once from Hugging Face, then it works offline.
- **Customizable shortcut** — default `Ctrl+Shift+Space`. Change it in Chrome's
  shortcut manager (the extension links you straight there).
- **Start/stop beeps** so you know when it's listening.
- **Types at your cursor** in text boxes, `textarea`s, and most rich editors
  (Gmail, etc.). Always copies to the clipboard too, as a fallback.

### What works where

This is a Chrome extension, so it types into **web pages inside Chrome** — which
on a Chromebook is almost everything (Gmail, Google Docs comments, Slack web,
Notion, X, forms…). It can't type into **Android apps** or ChromeOS system text
fields, and it can't insert into Google Docs' main editor (that uses a custom
canvas) — there the text is placed on your clipboard so you can paste with
Ctrl+V.

---

## Install (load unpacked)

The extension isn't on the Chrome Web Store — load it directly:

1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `voice-typer-extension` folder.
4. A setup tab opens. Click **Enable microphone** and choose **Allow**.
5. (Optional) Pin the 🎙️ icon to your toolbar.

That's it. Click into any text box, press **Ctrl+Shift+Space**, say a sentence,
and press it again. The first time, the speech model downloads once (~145 MB for
the default) and is cached; after that it's fast and offline.

> **Chromebook note:** Chrome keyboard shortcuts fire while Chrome is focused.
> If the shortcut doesn't respond, click once inside a Chrome window first, or
> rebind it (below).

---

## Changing the shortcut

Chrome manages extension shortcuts itself. Open the extension popup (🎙️ icon) →
**Change shortcut**, or go to **`chrome://extensions/shortcuts`** directly, and
set any combo you like for "Start / stop voice recording".

---

## Settings

Open the 🎙️ popup → **Settings**:

| Setting | What it does |
| --- | --- |
| **Model** | Speed vs. accuracy. Tiny = fastest, Small = most accurate. `.en` models are English-only; the others are multilingual. |
| **Language** | Shown for multilingual models — auto-detect or pick one. |
| **Microphone** | Choose an input device or use the system default. |
| **Type at cursor** | On = auto-type; off = clipboard-only (you paste with Ctrl+V). |
| **Use GPU (WebGPU)** | Faster on supported devices (Chromebook Plus qualifies); falls back to CPU automatically. |
| **Sounds** | Toggle the start/stop beeps. |

Settings are stored locally in your browser.

---

## Models

| Model | Size | Notes |
| --- | --- | --- |
| `whisper-tiny.en` | ~75 MB | Fastest, English only |
| `whisper-base.en` | ~145 MB | **Default** — good balance, English only |
| `whisper-small.en` | ~490 MB | Most accurate English, slower |
| `whisper-tiny` / `base` / `small` | same sizes | Multilingual variants |

All are free, open-weight models that run locally — nothing is sent to a server.

---

## Troubleshooting

- **"Could not find a text field…"** — click into an actual text box first. In
  Google Docs' main editor, use Ctrl+V (the text is on your clipboard).
- **Shortcut does nothing** — make sure a Chrome window is focused, or rebind at
  `chrome://extensions/shortcuts`. On ChromeOS, system shortcuts win over
  extensions, so avoid combos ChromeOS reserves.
- **"Microphone access failed"** — open the popup → **Enable microphone**, or
  click the mic icon in the address bar and allow it.
- **First transcription is slow** — the model is downloading. It's cached after
  that.

---

## How it's built

- **Manifest V3** service worker handles the keyboard command and inserts text
  via `chrome.scripting` (using the `activeTab` grant the shortcut provides).
- An **offscreen document** records the mic (`MediaRecorder`) and runs Whisper —
  because MV3 service workers have no DOM or microphone access.
- `lib/transformers.min.js` + `lib/ort-wasm-simd-threaded.jsep.wasm` are bundled,
  so no remote code is ever loaded (MV3-compliant).

MIT licensed.
