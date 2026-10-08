import jwt from 'jsonwebtoken';
import { getUserById } from '../lib/present.js';

export const JWT_SECRET = process.env.OMNIFEED_JWT_SECRET || 'omnifeed-dev-secret-change-me';

export function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

// Attaches req.user (full row) if a valid token is present; otherwise null.
export function withUser(req, _res, next) {
  const token = readToken(req);
  req.user = null;
  if (token) {
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const row = getUserById(uid);
      if (row) req.user = row;
    } catch { /* ignore invalid token */ }
  }
  next();
}

// Rejects the request if not authenticated.
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  next();
}
