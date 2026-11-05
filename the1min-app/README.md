# The1Min

> Stuck on your computer for more than a minute? The1Min jumps in, reads what's on
> your screen, and shows you the best way to get unstuck.

Built from a kid's notebook of "apps for the future." This is the **real** version of
the idea — a desktop app that can actually watch your computer, which a web page is not
allowed to do.

## What it does

- Lives in your **menu bar / system tray** (no dock icon, no window in the way).
- **Watches** quietly. If you go a full minute without touching the keyboard or mouse —
  the "stuck and staring" moment — it pops up on its own.
- Or summon it instantly with a **global hotkey**: `Ctrl/Cmd + Shift + Space`.
- When it triggers, it takes **one screenshot**, sends it to **Claude**, and shows:
  1. what you seem to be stuck on,
  2. a few concrete steps to try,
  3. the best resource to look up,
  4. a **copy-ready "better prompt"** you can paste into an AI or a search box.

## Run it

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd the1min-app
npm install
npm start
```

The1Min appears in your menu bar (look for the amber **1**). On first run it opens
**Settings** — paste an Anthropic API key (get one at
[console.anthropic.com](https://console.anthropic.com/settings/keys), it starts with
`sk-ant-`) and press Save. That key is stored only on your computer.

Prefer an environment variable? `export ANTHROPIC_API_KEY=sk-ant-...` before `npm start`
and it's picked up automatically.

## Permissions (one-time)

**macOS** — to let it see your screen:
System Settings → Privacy & Security → **Screen Recording** → turn on **The1Min**
(or the Terminal you launched it from), then quit and reopen the app. Without this,
screenshots come back black and The1Min will tell you so.

**Windows / Linux** — no special screen permission is needed. (Global hotkeys and screen
capture work out of the box.)

## Privacy — read this

When The1Min triggers, it sends **one screenshot of your main display** to the Anthropic
API to figure out what you're stuck on. Nothing is stored by this app and nothing is sent
anywhere else. Don't run the watcher over passwords, private messages, or anything you
wouldn't want analyzed — turn off **"Watch for when I'm stuck"** in the tray menu when you
need privacy, and use the hotkey only when you want help.

## Settings

Open **Settings…** from the tray menu to change your key or the model:

| Model | Good for |
|---|---|
| `claude-opus-5-5` | Most capable (default) |
| `claude-sonnet-5-5` | Balanced speed/quality |
| `claude-haiku-5-5` | Fastest & cheapest — best if you test a lot |

## How "stuck" is detected

Watching your *whole* computer to know you're stuck is genuinely hard. This version uses
the most reliable honest signal available: **a full minute with no keyboard or mouse input**
(you're staring at a problem), which matches the notebook's "more than 1 minute" rule. The
**hotkey** is always there for the moment you *know* you're stuck. A future version could
watch for an app that has stopped responding, or repeated undo/retry loops — good next steps.

## Make it a double-click app (optional)

To package it as a real installable app (`.app` / `.exe`) instead of `npm start`:

```bash
npm install --save-dev @electron/packager
npx electron-packager . The1Min --overwrite
```

## Project layout

```
the1min-app/
  package.json
  src/
    main.js         tray, idle watch, global hotkey, screenshot, Claude call
    preload.js      safe bridge between app and windows
    popup.html/.js  the help window
    settings.html/.js  API key + model
    assets/         menu-bar icon
```
