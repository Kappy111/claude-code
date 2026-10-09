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

- **Backend:** Node + Express, **PostgreSQL** (via `pg`), JWT auth (`bcryptjs`), uploads via `multer`
- **Database & storage:** **Supabase** — Postgres for data, Supabase Storage for uploaded media. Because state lives in Supabase, the web app is stateless and runs on any host (no disk/volume needed).
- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, React Router, Axios, lucide-react
- **Media:** Demo media is generated as SVG posters (and optional `ffmpeg` videos in local dev) and stored the same way real uploads are — Supabase Storage in production, local disk in dev.

## Quick start (local dev)

Needs a Postgres database. Easiest: point `DATABASE_URL` at a free Supabase
project; or run Postgres locally.

```bash
npm install
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"   # your Supabase/Postgres URL
npm run seed           # creates tables + demo content (destructive reset)
npm run dev            # API (:4000) + Vite dev server (:5173)
```

Open **http://localhost:5173**. **Demo login:** `aria` / `password`.

Without `SUPABASE_URL` set, uploaded media falls back to local disk (served at `/media`).

### Production (single port)

```bash
npm run build          # builds the client into client/dist
npm start              # Express serves API + built client; creates tables + seeds on first boot
```

The server **auto-seeds demo content on first boot only** (a no-op once the
database has users), so production never wipes real data.

## Deploy a public instance (anyone can sign up)

Because data and media live in **Supabase**, the app itself is stateless — deploy
the `Dockerfile` to any host (even a free tier), no volume needed.

### 1. Create the Supabase project (free)
1. At [supabase.com](https://supabase.com) → **New project** (pick a region, set a DB password).
2. **Project Settings → Database → Connection string → URI** — copy it; that's `DATABASE_URL` (put your DB password in it).
3. **Project Settings → API** — copy the **Project URL** (`SUPABASE_URL`) and the **`service_role`** key (`SUPABASE_SERVICE_ROLE_KEY`). The app auto-creates a public **`media`** storage bucket on first boot.

### 2. Deploy the app (Render free, or Railway / Fly)
1. Connect this repo to the host; it detects the `Dockerfile`.
2. Set these environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string (URI, with password) |
| `SUPABASE_URL` | Supabase Project URL (for Storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (for Storage) |
| `OMNIFEED_JWT_SECRET` | A long random string (keeps logins valid across restarts) |
| `SUPABASE_BUCKET` | Storage bucket name (optional; default `media`) |
| `OMNIFEED_SEED_MEDIA` | `svg` to skip ffmpeg demo videos (set in production) |
| `PORT` | Usually injected by the host; defaults to `4000` |

3. Deploy, then open the host's generated URL. First boot creates the tables and
   seeds demo content; after that **anyone can sign up and everyone shares the same
   data**.

### Point your own domain at it
Add a custom domain in your host's dashboard (Render/Railway/Fly all support this),
then add the **CNAME** (or ALIAS/ANAME for a root domain) record they give you at
your DNS provider. HTTPS is provisioned automatically.

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
    db.js               # Postgres (pg) pool + query shim + Supabase Storage
    schema.pg.sql       # Database schema (PostgreSQL)
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

`users`, `posts` (type = thought/snap/short/video), `comments` (self-referencing for replies), `likes` (unique per user+post / user+comment), `bookmarks`, `follows` (active/pending), `notifications`, `messages` (DMs), `watch_history`. See `server/src/schema.pg.sql`.
