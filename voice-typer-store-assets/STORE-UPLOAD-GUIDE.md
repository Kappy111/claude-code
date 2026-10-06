# Publishing Voice Typer to the Chrome Web Store (so it never disappears)

Once it's on the Web Store — even as **Unlisted** (private) — it installs like a
normal extension: it **survives every restart and Chrome update and auto-updates
itself**. No more re-loading.

You'll do this once. Total cost: a **one-time $5** Google developer fee. Review
usually takes **1–3 days**.

Everything you need is in this folder:

| File | What it's for |
| --- | --- |
| `voice-typer-webstore.zip` | **The package you upload.** (manifest is at the root — don't re-zip it) |
| `screenshot-1-welcome.png` | Listing screenshot (1280×800) |
| `screenshot-2-settings.png` | Listing screenshot (1280×800) |
| `store-icon-128.png` | The store icon (also already inside the package) |

---

## Step 1 — Register as a developer (one time, $5)

1. Go to **https://chrome.google.com/webstore/devconsole/**
2. Sign in with the Google account you want to own the extension.
3. Accept the developer agreement and **pay the one-time $5 fee**.

## Step 2 — Create the item and upload

1. In the Developer Dashboard, click **+ New item**.
2. **Upload** `voice-typer-webstore.zip` (drag it in or browse to it).
3. Wait for it to process, then you'll land on the listing form.

## Step 3 — Fill in the Store listing

Copy-paste these:

**Name**
```
Voice Typer — local voice to text
```

**Summary** (short description, max 132 characters)
```
Press a shortcut to dictate. Transcribes locally and free with Whisper, then types the text at your cursor. No cloud.
```

**Description**
```
Voice Typer lets you dictate into any text box in Chrome. Press your keyboard
shortcut to start recording (you'll hear a beep), speak, then press it again to
stop. Your speech is transcribed and typed in at your cursor.

Everything runs locally on your device using OpenAI's open-source Whisper model
(via Transformers.js). There is no cloud service, no account, no API key, and no
cost. After a one-time model download, it works fully offline.

Features
• Customizable keyboard shortcut (start/stop with the same key)
• Start and stop sounds so you know when it's listening
• Types directly at your cursor; also copies to your clipboard
• Choose model size (Tiny / Base / Small) for speed vs. accuracy
• English-only or multilingual models
• Uses your GPU (WebGPU) when available, with automatic CPU fallback
• Private by design — your audio and text never leave your device

How to use
1. Click into any text box on a web page.
2. Press your shortcut (default Ctrl+Shift+Space) — a beep means it's recording.
3. Speak, then press the shortcut again.
4. Your words are typed in.

Note: works in web pages inside Chrome. It cannot type into Android apps or
Chrome's own settings pages. In Google Docs' main editor it copies to your
clipboard (paste with Ctrl+V).
```

**Category:** Productivity
**Language:** English

**Screenshots:** upload `screenshot-1-welcome.png` and `screenshot-2-settings.png`.

**Store icon:** `store-icon-128.png` (if asked; it's also inside the package).

## Step 4 — Privacy practices (this is where most first-timers get stuck)

Go to the **Privacy practices** tab and use these answers:

**Single purpose** (paste):
```
Voice Typer transcribes the user's speech into text locally and inserts it into
the text field they are using.
```

**Permission justifications:**
- **activeTab** →
  ```
  Used to insert the transcribed text into the text field in the tab the user is
  actively using when they trigger dictation.
  ```
- **scripting** →
  ```
  Used to place the transcribed text at the cursor in the active tab.
  ```
- **storage** →
  ```
  Used to save the user's settings (model, language, microphone, toggles)
  locally.
  ```
- **offscreen** →
  ```
  Used to record microphone audio and run the on-device speech model, since the
  extension's service worker cannot access the microphone or DOM.
  ```
- **Host permission / remote use** (if asked) →
  ```
  The extension downloads the open-source speech model once from huggingface.co.
  No user data is sent; only model files are fetched.
  ```

**Data usage** — check the boxes to declare:
- You do **NOT** collect or use user data.
- Certify you comply with the Developer Program Policies.
(Audio, transcripts, and settings are all processed/stored locally and never
transmitted.)

**Privacy policy URL** — paste this (it's the PRIVACY.md included in the
extension, viewable on GitHub):
```
https://github.com/Kappy111/claude-code/blob/claude/keyboard-transcription-app-z7cqxx/voice-typer-extension/PRIVACY.md
```
(If you later merge this to your `main` branch, use the `main` URL instead — any
public page with this text works.)

## Step 5 — Keep it private: set visibility to "Unlisted"

On the listing, set **Visibility** to **Unlisted**. This means:
- It will **not** appear in Web Store search.
- Only people with your direct link can see/install it.
- You still get the permanent install + auto-update benefits.

(If you'd rather make it fully **Public** so anyone can find it, you can — your
choice.)

## Step 6 — Submit

Click **Submit for review**. You'll get an email when it's approved (usually
1–3 days).

## After approval

1. Open your item's Web Store link (the dashboard gives it to you).
2. Click **Add to Chrome**.
3. **Remove the old unpacked version** at `chrome://extensions` (click Remove on
   the Developer-mode card) so they don't both run.
4. Set your shortcut again at `chrome://extensions/shortcuts` if needed.

From now on it stays installed and updates itself — it won't vanish again.

---

### If the review asks for changes
Chrome sometimes asks for clarification on permissions. If that happens, paste me
the exact message and I'll give you the reply/fix.
