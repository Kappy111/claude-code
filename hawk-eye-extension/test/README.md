# Hawk Eye tests

Three layers, so you can be sure it works before trusting it with real sites.

| File | What it proves | Needs |
|---|---|---|
| `logic.test.js` | The site-matching rules the background worker uses (which sites get blocked, look-alike domains don't, hashing is deterministic). | nothing — just Node |
| `ui.test.js` | The real popup and lock pages: adding a locked site, PIN stored as a hash, correct PIN unlocks, 3 wrong tries = lockout, phrase unlock. | `playwright` |
| `extension.test.js` | The **whole extension loaded into Chrome** — the background worker actually redirects a locked site to the lock screen. | `playwright` |

## Run them

```bash
node test/logic.test.js
```

```bash
npm install --save-dev playwright
node test/ui.test.js
node test/extension.test.js
```

All three should print a green ✅ line.
