# Messenger

A real-time messenger with no phone number involved. Accounts are a username and a password, nothing else.

## Features

- Username/password accounts, 30-day sessions
- Direct messages and named groups
- Live delivery via polling, with history and infinite scroll
- Online presence, typing indicators, delivered/seen receipts, unread counts
- Browser notifications, installable as a PWA, light and dark theme
- Postgres storage: Neon in production, PGlite (embedded) for local development

## Run

Requires Node 22.13 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000, create two accounts in two browsers, and chat.

## Deploy on Vercel

The app runs as a Vercel Function (Express) and stores everything in Postgres. Real-time updates use short polling against `/api/sync`, which works on serverless hosts.

1. Import the repository into Vercel (framework: Express).
2. In the project's Storage tab, add a **Neon** Postgres database on the free plan. This sets `DATABASE_URL` automatically.
3. Redeploy. The schema is created on first request.

## Privacy notes

Traffic is encrypted in transit by HTTPS. Messages are stored in plaintext in the database, so whoever runs the server can read them. End-to-end encryption is a planned addition.
