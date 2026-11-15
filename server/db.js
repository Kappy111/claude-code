// Postgres everywhere: Neon (serverless HTTP driver) in production,
// PGlite (Postgres compiled to WASM, stored in ./data) for local dev and tests.
import fs from 'node:fs';
import path from 'node:path';

let run; // (sql, params) => Promise<rows>

if (process.env.DATABASE_URL) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  run = (text, params = []) => sql.query(text, params);
} else if (process.env.VERCEL) {
  run = async () => { throw Object.assign(new Error('DATABASE_URL is not set. Add a Neon Postgres database to this Vercel project.'), { status: 503 }); };
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = process.env.DATA_DIR || path.resolve('data');
  fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(path.join(dataDir, 'pglite'));
  run = async (text, params = []) => (await pg.query(text, params)).rows;
}

export const query = run;
export const one = async (text, params) => (await run(text, params))[0] || null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    last_seen BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    dm_key TEXT UNIQUE,
    created_by BIGINT REFERENCES users(id),
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id BIGINT NOT NULL DEFAULT 0,
    typing_until BIGINT NOT NULL DEFAULT 0,
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
  CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
  CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, id);
`;

let readyPromise;
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      // Neon's HTTP driver runs one statement per query.
      for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await run(stmt);
    })();
  }
  return readyPromise;
}

// Postgres returns BIGINT as strings; normalise the columns we care about.
export const num = (row) => {
  if (!row) return row;
  for (const k of ['id', 'user_id', 'sender_id', 'conversation_id', 'last_read_id', 'last_id', 'unread', 'created_at', 'last_seen', 'typing_until'])
    if (k in row && row[k] != null) row[k] = Number(row[k]);
  return row;
};
