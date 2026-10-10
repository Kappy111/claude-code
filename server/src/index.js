import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR, initSchema } from './db.js';
import { withUser } from './middleware/auth.js';
import { runSeed, applyOwnerBadge, OWNER_USERNAME } from './seed.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import notificationRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import uploadRoutes from './routes/upload.js';
import messageRoutes from './routes/messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(withUser); // attach req.user when a valid token is present

// Serve uploaded media
app.use('/media', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'omnifeed' }));

// Current deployed build id. The client polls this and reloads when it changes,
// so every new deploy refreshes all open browsers onto the latest version.
const APP_VERSION = process.env.RENDER_GIT_COMMIT || process.env.OMNIFEED_VERSION || 'dev';
app.get('/api/version', (_req, res) => res.json({ version: APP_VERSION }));

// Serve the built client in production (single-port deploy)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// JSON error fallback — never leave a client hanging
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

if (process.env.NODE_ENV === 'production' && !process.env.OMNIFEED_JWT_SECRET) {
  console.warn('⚠  OMNIFEED_JWT_SECRET is not set — set it so logins stay valid across restarts.');
}

// Create the schema, start serving, then seed demo content in the background
// (no-op once the database already has users).
(async () => {
  try {
    await initSchema();
  } catch (e) {
    console.error('Database schema init failed:', e.message);
  }
  app.listen(PORT, () => console.log(`OmniFeed running on http://localhost:${PORT}`));
  runSeed()
    .then((r) => { if (r.skipped) console.log(`Database already has ${r.users} users — skipping seed.`); })
    .then(() => applyOwnerBadge())
    .then((n) => { if (n) console.log(`Verified badge applied to owner account "${OWNER_USERNAME}".`); })
    .catch((e) => console.error('Seed-on-boot failed (continuing):', e.message));
})();
