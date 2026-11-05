# Hawk Eye 🦅

**Lock any website behind a PIN, a secret phrase, or a drawn pattern.**
A Chrome extension built from a handwritten invention by *The I Min*.

This is the **real** version. Unlike a web page, a browser extension is allowed to
watch the sites you visit and stop them loading until you pass the lock.

---

## What it does

- Put a lock on **any website** (`poki.com`, `youtube.com`, anything).
- When you — or anyone on this computer — tries to open that site, Chrome shows the
  **Hawk Eye lock screen first**. No code, no entry.
- Three ways to lock: **PIN code**, **secret phrase**, or a **drawn pattern**.
- **3 wrong tries** = a 30-second lockout ("the hawk is watching").
- Once you unlock a site, it stays open **until you close Chrome**. Then it re-locks.
- Your PINs and phrases are **scrambled (hashed) before they're saved** and never leave
  this computer.

---

## How to install it (about 2 minutes)

1. **Get the folder onto your computer.** Download or copy this `hawk-eye-extension`
   folder somewhere easy to find (like your Desktop).
2. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
3. Turn on **Developer mode** — the switch in the **top-right corner**.
4. Click **"Load unpacked"** (top-left).
5. Choose the **`hawk-eye-extension`** folder.
6. Hawk Eye appears in your extensions. Click the **puzzle-piece icon** in the Chrome
   toolbar and **pin** Hawk Eye so you can reach it easily.

## How to use it

1. Click the **Hawk Eye icon** in the toolbar.
2. Type a website (like `poki.com`), pick **PIN / Phrase / Pattern**, set your secret,
   and hit **🔒 Lock this site**.
3. Try visiting that site — the Hawk Eye lock screen stops you until you enter the secret.
4. **"Re-lock everything now"** in the popup instantly re-locks every site without
   waiting for Chrome to close.

---

## The honest limits

- It only locks sites **in this Chrome, on this computer**. Another browser or another
  computer needs its own copy.
- It can't use a real fingerprint reader or face camera — a web page's sandbox blocks
  that. True hardware scans would need a full installed app. (That was in the original
  notebook too: *"a thumbprint if their computer has it."*)
- Developer-mode extensions are for your own use; they aren't published on the Chrome
  Web Store.

---

*Invented by The I Min. 🦅*
