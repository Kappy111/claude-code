# OmniFeed

A unified, multi-format social media platform — **one account, four formats**:

| Format | Inspired by | What it is |
| --- | --- | --- |
| 📸 **Snaps** | Instagram | Photos & multi-image carousels |
| 💭 **Thoughts** | X / Twitter | Short text posts & threads (280 chars) |
| 🎬 **Shorts** | TikTok | Vertical, autoplaying short videos |
| ▶️ **Videos** | YouTube | Long-form video with a full watch page |

Dark-mode-first, responsive (phone → large monitor), and **fully functional** — not a mockup. Content persists in a real database.

---

## Tech stack

- **Backend:** Node + Express, SQLite (`better-sqlite3`), JWT auth (`bcryptjs`), local file uploads (`multer`)
- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, React Router, Axios, lucide-react
- **Media:** Demo media is generated locally (SVG posters + `ffmpeg` sample videos) so the app works with no external media hosts.

## Quick start

```bash
npm install            # installs server + client (workspaces)
npm run seed           # creates the SQLite DB + demo users/content (needs ffmpeg for sample videos)
npm run dev            # starts API (:4000) and Vite dev server (:5173)
```

Open **http://localhost:5173**.

**Demo login:** `aria` / `password` (or sign up / use the simulated Google / Apple buttons).

### Production (single port)

```bash
npm run build          # builds the client into client/dist
npm start              # Express serves API + built client; seeds demo data on first boot
```

The server **auto-seeds demo content on first boot only** (it's a no-op once the
database has users), so production never wipes real data. `npm run seed` is the
destructive reset for local dev.

## Deploy a public instance (anyone can sign up)

OmniFeed ships a `Dockerfile` that runs the whole app (API + built client +
SQLite + uploaded media) in one container. Mount a **persistent volume at
`/data`** so accounts, posts and uploads survive restarts.

**Railway (recommended — all in the browser):**
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → pick this repo and branch. Railway
   detects the `Dockerfile` and builds automatically.
3. Open the service → **Variables** and add:
   - `OMNIFEED_JWT_SECRET` = a long random string (keeps logins valid across restarts)
   - `OMNIFEED_DATA_DIR` = `/data`
4. Open **Settings → Volumes**, add a volume mounted at **`/data`**.
5. **Settings → Networking → Generate Domain** to get a public URL.

That's it — the first boot seeds demo content, then anyone who visits can sign up
and everyone sees each other's posts. The same image also runs on Render, Fly.io
or any Docker host; just set those two env vars and mount a volume at `/data`.

**Environment variables:**

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port to listen on (most hosts inject this) | `4000` |
| `OMNIFEED_DATA_DIR` | Where the SQLite DB + uploads live (point at the volume) | `server/data` |
| `OMNIFEED_JWT_SECRET` | Signing secret for login tokens | dev-only fallback |
| `OMNIFEED_SEED_MEDIA` | `svg` skips ffmpeg demo-video generation (set in production) | unset |

### Point your own domain at it

Once it's deployed on Railway:
1. In the service, open **Settings → Networking → Custom Domain** and enter your
   domain (e.g. `omnifeed.app`) or a subdomain (e.g. `app.omnifeed.app`).
2. Railway shows a **CNAME target** (something like `xxxx.up.railway.app`).
3. At your domain registrar / DNS provider, add a **CNAME record**:
   - a subdomain → `CNAME  app  xxxx.up.railway.app`
   - a root/apex domain → use your registrar's "ANAME/ALIAS/flattened CNAME"
     option pointing at the same target (plain CNAME isn't allowed on an apex).
4. Save, then wait a few minutes — Railway provisions the HTTPS certificate
   automatically. Your app is then live on your own domain.

Render and Fly have the same flow (add a custom domain in their dashboard, then
add the CNAME/ALIAS record they give you).

## What's implemented

**Accounts & profiles** — email/username/password signup with avatar, simulated Google/Apple login, persistent sessions (JWT), unique usernames, edit display name / username / bio / avatar / password, public profile with four content tabs, followers/following lists, verification badges.

**Content creation** — a universal **+ Create** flow with a dedicated editor per format: Thought (live 280-char counter, threads, image/link attach), Snap (multi-photo carousel), Short (vertical upload + thumbnail + sound), Video (title, description, thumbnail, chapters, tags, visibility).

**Feeds** — home feed with a **For you / Following / Discover** source switcher and **All / Shorts / Snaps / Thoughts / Videos** format filter; the mixed feed interleaves formats so it reads like a mixtape. Engagement-aware recommendations. Dedicated Shorts (TikTok-style, autoplay-on-visible, swipe), Photos, Thoughts and Videos pages. Infinite scroll + skeleton loaders throughout.

**YouTube-style video** — watch page with a full custom player (play/pause, scrubber, volume, speed, quality, fullscreen, chapters), channel row + Subscribe, like/dislike, Share, Save, expandable description, an **Up next** related-videos rail, duration badges, and watch history with resume progress.

**Engagement** — likes (optimistic, de-duplicated), threaded comments with replies & likes, reposts, bookmarks, shares, follows, view counts. A reusable comments panel (modal on mobile, side panel on desktop).

**Direct messages** — one-to-one conversations with a two-pane inbox (conversation list + chat thread), live polling for new messages, unread badges in the nav, and a **Message** button on every profile.

**Discovery** — Explore page with debounced search across users / posts / hashtags, category filters, and a trending section (hashtags, creators, popular videos/shorts/snaps). Hashtag pages.

**Notifications** — grouped notification center (follows, likes, comments, replies, reposts) with unread badges, plus follow-request approval for private accounts.

**Privacy** — public/private accounts (with follow approval), who-can-comment controls, notification preferences.

**Polish** — empty states, skeleton loaders, friendly error handling (invalid login, username taken, file too large, unsupported media, network loss), toasts, and responsive mobile bottom-nav / desktop sidebar navigation.

## Project structure

```
server/
  src/
    index.js            # Express app (API + serves built client + /media)
    db.js               # SQLite connection + migrations
    schema.sql          # Database schema
    seed.js             # Demo data (+ local media generation)
    gen-assets.js       # SVG + ffmpeg media generators
    lib/                # presenters (row → API object), notifications
    middleware/auth.js  # JWT auth
    routes/             # auth, users, posts, comments, notifications, search, upload
client/
  src/
    api.ts              # typed API client
    store/              # auth + toast contexts
    components/         # Layout/nav, PostCard, VideoPlayer, Carousel, CreateModal, CommentsPanel, …
    pages/              # Auth, Home, Explore, Shorts, Profile, PostView, Videos, Notifications, Settings, …
```

## Data model

`users`, `posts` (type = thought/snap/short/video), `comments` (self-referencing for replies), `likes` (unique per user+post / user+comment), `bookmarks`, `follows` (active/pending), `notifications`, `messages` (DMs), `watch_history`. See `server/src/schema.sql`.
