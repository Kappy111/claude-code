# Voice Typer — Privacy Policy

_Last updated: 2026-10-06_

Voice Typer is a Chrome extension that turns your speech into text **entirely on
your own device**.

## What we collect

**Nothing.** Voice Typer does not collect, store, transmit, or sell any personal
data.

- **Your voice / audio** is captured only between your two shortcut presses,
  processed **locally on your device**, and then discarded. It is **never sent
  to us or to any server**.
- **Your transcribed text** is produced locally and placed into the text field
  you are using (and copied to your clipboard). It is **never sent to us or to
  any server**.
- **Your settings** (chosen model, language, microphone, and toggles) are stored
  **locally in your browser** using Chrome's storage and never leave your device.

## Network use

The only network request Voice Typer makes is a **one-time download of the
open-source speech model** (Whisper) from the Hugging Face model hub
(`huggingface.co`) the first time you dictate. This downloads model files only;
**no information about you, your audio, or your text is sent** in that request.
After the model is cached, the extension works fully offline.

## Permissions

- **Microphone** — to capture your speech for on-device transcription.
- **activeTab / scripting** — to type the transcribed text into the field you are
  using when you trigger dictation.
- **storage** — to remember your settings on your device.
- **offscreen** — to record audio and run the speech model (required because the
  extension's background cannot access the microphone directly).

## Contact

For questions about this policy, contact the extension's developer through the
Chrome Web Store listing.
