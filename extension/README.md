# Snapfolder — Chrome Screenshot & Folders Extension

Capture screenshots of any browser tab and organize them into folders, all
from a Chrome extension. Built on Manifest V3. Screenshots live locally in the
browser (IndexedDB) today; account login + cloud sync via **Supabase** is the
next milestone (the code is already structured for it).

## Features

- **Capture visible area** — one click (or `Alt+Shift+S` anywhere).
- **Capture full page** — scrolls the page and stitches it into one image.
- **Folders** — create, rename, and delete folders to organize captures.
  Deleting a folder moves its screenshots to **Unsorted** (never lost).
- **Library view** — a full-page gallery with previews (lightbox),
  drag-and-drop to move screenshots between folders, and a "Move to…" menu.
- **Download to disk** — saves into `Downloads/Snapfolder/<Folder name>/`.
- **Light & dark** — follows the OS theme.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin **Snapfolder** from the extensions menu for easy access.

> Chrome can't capture its own pages (`chrome://`, the Web Store, the New Tab
> page). The extension shows a clear message when you try.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, keyboard command. |
| `background.js` | Service worker: owns capture + writes to IndexedDB. |
| `lib/capture.js` | `captureVisible` + `captureFullPage` (scroll & stitch). |
| `lib/db.js` | IndexedDB layer (`folders` + `screenshots` stores). |
| `lib/util.js` | Download, formatting, filename helpers. |
| `lib/auth.js` | Auth facade — local stub today, Supabase-ready. |
| `lib/config.js` | Supabase credentials + app config. |
| `popup.html/.js/.css` | Toolbar popup: pick folder, capture, recents. |
| `library.html/.js/.css` | Full gallery + folder management. |

Images are stored as PNG **Blobs** in IndexedDB (with a small JPEG thumbnail
per item). `unlimitedStorage` is requested so large libraries aren't capped.

### Permissions, and why

- `activeTab` + `tabs` — read the active tab and run `captureVisibleTab`.
- `scripting` — measure/scroll the page for full-page capture.
- `storage` + `unlimitedStorage` — remember the last folder; store blobs.
- `downloads` — save screenshots into Downloads subfolders.

## Next: Supabase login & sync

The groundwork is in place so auth drops in without reshaping the UI:

- `lib/auth.js` is the single seam the UI talks to
  (`getUser` / `onChange` / `signIn` / `signOut` / `init`).
- `lib/config.js` holds the Supabase URL + anon key (empty → "Local only").
- Each stored record already carries `remoteId` / `synced` fields for sync.

Planned steps:

1. Add `@supabase/supabase-js` and set credentials in `lib/config.js`.
2. Implement `signIn` with `chrome.identity.launchWebAuthFlow` (popups are
   too short-lived for a redirect flow), and persist the session in
   `chrome.storage.local`.
3. On sign-in, upload blobs to the `screenshots` Storage bucket and mirror
   folders/screenshots rows to Postgres, protected by row-level security.
4. Flip the footer status from "Local only" to the signed-in account.

## Regenerating icons

```bash
cd icons && python3 make_icons.py
```
