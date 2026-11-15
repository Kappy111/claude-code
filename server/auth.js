import crypto from 'node:crypto';
import { query, one, num } from './db.js';

const SESSION_TTL = 30 * 24 * 3600 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await query('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [token, userId, now, now + SESSION_TTL]);
  return token;
}

export const destroySession = (token) => query('DELETE FROM sessions WHERE token = $1', [token]);

export async function userFromToken(token) {
  if (!token) return null;
  return num(await one(`SELECT u.id, u.username, u.display_name FROM sessions s
                        JOIN users u ON u.id = s.user_id
                        WHERE s.token = $1 AND s.expires_at > $2`, [token, Date.now()]));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const cookieOptions = () => ({
  httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL,
  secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
});

export async function requireAuth(req, res, next) {
  try {
    const user = await userFromToken(req.cookies.session);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    next();
  } catch (e) { next(e); }
}
