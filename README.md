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
npm run seed           # if not already seeded
npm start              # Express serves the API + built client on :4000
```

## What's implemented

**Accounts & profiles** — email/username/password signup with avatar, simulated Google/Apple login, persistent sessions (JWT), unique usernames, edit display name / username / bio / avatar / password, public profile with four content tabs, followers/following lists, verification badges.

**Content creation** — a universal **+ Create** flow with a dedicated editor per format: Thought (live 280-char counter, threads, image/link attach), Snap (multi-photo carousel), Short (vertical upload + thumbnail + sound), Video (title, description, thumbnail, chapters, tags, visibility).

**Feeds** — home feed with a **For you / Following / Discover** source switcher and **All / Shorts / Snaps / Thoughts / Videos** format filter; the mixed feed interleaves formats so it reads like a mixtape. Engagement-aware recommendations. Dedicated Shorts (TikTok-style, autoplay-on-visible, swipe), Photos, Thoughts and Videos pages. Infinite scroll + skeleton loaders throughout.

**YouTube-style video** — watch page with a full custom player (play/pause, scrubber, volume, speed, quality, fullscreen, chapters), channel row + Subscribe, like/dislike, Share, Save, expandable description, an **Up next** related-videos rail, duration badges, and watch history with resume progress.

**Engagement** — likes (optimistic, de-duplicated), threaded comments with replies & likes, reposts, bookmarks, shares, follows, view counts. A reusable comments panel (modal on mobile, side panel on desktop).

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

`users`, `posts` (type = thought/snap/short/video), `comments` (self-referencing for replies), `likes` (unique per user+post / user+comment), `bookmarks`, `follows` (active/pending), `notifications`, `watch_history`. See `server/src/schema.sql`.
