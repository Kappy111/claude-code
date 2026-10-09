import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Connection ---
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5432/omnifeed';
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }, // Supabase requires SSL
  max: 10,
});

// Return pg bigints (COUNT) as JS numbers.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// --- better-sqlite3-style shim over pg (async) ---
// Supports positional '?' params and named '@name' params (single object arg).
function translate(sql, args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && /@\w/.test(sql)) {
    const obj = args[0];
    const params = [];
    const text = sql.replace(/@(\w+)/g, (_, n) => { params.push(obj[n]); return `$${params.length}`; });
    return { text, params };
  }
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, params: args };
}

export function prepare(sql) {
  return {
    get: async (...a) => { const { text, params } = translate(sql, a); return (await pool.query(text, params)).rows[0]; },
    all: async (...a) => { const { text, params } = translate(sql, a); return (await pool.query(text, params)).rows; },
    run: async (...a) => { const { text, params } = translate(sql, a); const r = await pool.query(text, params); return { changes: r.rowCount }; },
  };
}

export const db = {
  prepare,
  exec: async (sql) => { await pool.query(sql); },
};

export async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf-8');
  await pool.query(schema);
}

// --- Media storage ---
// Supabase Storage when configured; otherwise local disk (dev).
const DATA_DIR = process.env.OMNIFEED_DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
export const BUCKET = process.env.SUPABASE_BUCKET || 'media';
export const storage = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }).storage
  : null;

// Ensure the storage bucket exists (public) when Supabase is configured.
export async function ensureBucket() {
  if (!storage) return;
  try {
    const { data } = await storage.getBucket(BUCKET);
    if (!data) await storage.createBucket(BUCKET, { public: true });
  } catch {
    try { await storage.createBucket(BUCKET, { public: true }); } catch { /* already exists */ }
  }
}

// Upload a buffer and return a servable URL. Uses Supabase Storage when
// available, else writes to the local uploads dir (served at /media).
export async function putMedia(filename, buffer, contentType) {
  if (storage) {
    const { error } = await storage.from(BUCKET).upload(filename, buffer, { contentType, upsert: false });
    if (error) throw error;
    return storage.from(BUCKET).getPublicUrl(filename).data.publicUrl;
  }
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/media/${filename}`;
}
