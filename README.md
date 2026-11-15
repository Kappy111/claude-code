# Messenger

A real-time messenger with no phone number involved. Accounts are a username and a password, nothing else.

## Features

- Username/password accounts, 30-day sessions
- Direct messages and named groups
- Live delivery over WebSockets, with history and infinite scroll
- Online presence, typing indicators, delivered/seen receipts, unread counts
- Browser notifications, installable as a PWA, light and dark theme
- Single SQLite file for storage, no native dependencies

## Run

Requires Node 22.13 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000, create two accounts in two browsers, and chat.

## Deploy

Any host that runs a long-lived Node process works (Fly.io, Railway, Render, a VPS). Set:

- `PORT` - listening port
- `DATA_DIR` - where the SQLite file lives; mount a persistent volume here
- `NODE_ENV=production` - marks the session cookie Secure, so serve over HTTPS

Vercel's serverless functions do not hold WebSocket connections open, so pick a host with persistent processes.

## Privacy notes

Traffic is encrypted in transit by HTTPS. Messages are stored in plaintext on the server, so whoever runs the server can read them. End-to-end encryption is a planned addition.
