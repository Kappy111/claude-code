# The1Min — Chrome extension (Chromebook-friendly)

The1Min reads what's in your current browser tab and shows you the best way to get
unstuck: a few steps to try, a resource to look up, and a copy-ready "better prompt."

This is the **Chromebook version** of the idea. No terminal, no `npm`, no Linux — it
installs straight into Chrome and runs where your work actually is.

## Install (about 2 minutes, no terminal)

1. **Download the code.** On GitHub, on the branch `claude/blissful-carson-wmkhwo`, click
   the green **Code** button → **Download ZIP**. (This downloads to your Chromebook's
   **Downloads**, not the Linux disk — so a full Linux container doesn't matter.)
2. **Unzip it.** Open the **Files** app, find the ZIP in Downloads, right-click →
   **Extract all**. You'll get a folder containing **`the1min-extension`**.
3. **Open** `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (toggle, top-right).
5. Click **Load unpacked** and choose the **`the1min-extension`** folder.
6. The amber **1** appears in your toolbar. Click the puzzle-piece icon and **pin** it.

## First run

1. Click the **1** icon → the gear (⚙) → paste an **Anthropic API key**
   (`sk-ant-…` from [console.anthropic.com](https://console.anthropic.com/settings/keys)) → **Save**.
2. Go to any web page you're working on, click the **1**, then **Read my screen**.
3. Or press **Ctrl + Shift + Space** to open it anytime.

## The auto-watch

Flip on **"Watch for when I'm stuck."** After a full minute with no typing or clicking
(the "stuck and staring" moment — the notebook's *more than 1 minute* rule), The1Min reads
your active tab and pops up with help on its own. Turn it off whenever you want privacy.

## Privacy — please read

When The1Min runs, it sends **one screenshot of your current tab** to the Anthropic API to
work out what you're stuck on. Nothing is stored by the extension and nothing goes anywhere
else. Your API key stays in this browser only. Don't run it over passwords or private
messages — switch the watch off when you need to.

## What it can and can't see

- ✅ Normal web pages and web apps (Google Docs, Classroom, coding sites, most homework).
- ❌ Chrome's own pages (`chrome://…`), the extensions page, and the Chrome Web Store —
  Chrome blocks screenshots of those. Switch to your work tab and try again.

## Models

Open the gear to switch models. **Haiku 5.5** is the fastest and cheapest — a good pick if
you use The1Min a lot. **Opus 5.5** (default) is the most capable.

## Files

```
the1min-extension/
  manifest.json   what the extension is and may do
  background.js   the auto-watch (idle → read tab → help)
  shared.js       screenshot + Claude call, shared by both parts
  panel.html/.js  the popup you see
  icons/          the amber "1"
```
