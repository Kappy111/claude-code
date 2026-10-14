// Supabase integration for saving transcripts to the cloud.
// Table is prefixed "vtt_" so it never collides with other apps sharing the
// same Supabase project. The anon key is public by design and protected by
// Row-Level Security (see the SQL in supabase-setup.sql).

// Credentials are stored per-browser in localStorage (entered via the app's
// "Connect database" settings) — never committed to the repo. The anon key is
// safe to keep in the browser; it is protected by Row-Level Security.
const TABLE = 'vtt_transcripts';

export function getConfig() {
  try {
    return {
      url: localStorage.getItem('vidtotext.supabaseUrl') || '',
      key: localStorage.getItem('vidtotext.supabaseKey') || '',
    };
  } catch (_) { return { url: '', key: '' }; }
}

export function setConfig(url, key) {
  try {
    if (url) localStorage.setItem('vidtotext.supabaseUrl', url.replace(/\/+$/, ''));
    else localStorage.removeItem('vidtotext.supabaseUrl');
    if (key) localStorage.setItem('vidtotext.supabaseKey', key);
    else localStorage.removeItem('vidtotext.supabaseKey');
  } catch (_) {}
  _client = null; // rebuild with the new config on next use
}

export function cloudConfigured() {
  const { url, key } = getConfig();
  return !!(url && key);
}

let _client = null;
async function client() {
  if (_client) return _client;
  const { url, key } = getConfig();
  if (!url || !key) throw new Error('Supabase is not configured.');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function sessionToRow(session, email) {
  return {
    id: session.id,
    user_email: email || null,
    title: session.title || 'Untitled',
    source: session.source || null,
    language: session.language || null,
    duration: session.duration ?? null,
    model: session.model || null,
    device: session.device || null,
    transcript_text: session.text || null,
    chunks: session.chunks || null,
    speakers: session.speakers || null,
    summary: session.summary || null,
    translation: session.translation || null,
    created_at: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
  };
}

function rowToSession(row) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    language: row.language,
    duration: row.duration,
    model: row.model,
    device: row.device,
    text: row.transcript_text,
    chunks: row.chunks || [],
    speakers: row.speakers || null,
    summary: row.summary || null,
    translation: row.translation || null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    _cloud: true,
  };
}

// Upsert a transcript (keyed by id, so re-saving updates in place).
export async function saveToCloud(session, email) {
  const c = await client();
  const { error } = await c.from(TABLE).upsert(sessionToRow(session, email), { onConflict: 'id' });
  if (error) throw new Error(error.message || 'Could not save to Supabase.');
  return true;
}

// List this user's saved transcripts (most recent first).
export async function listCloud(email) {
  const c = await client();
  let q = c.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200);
  if (email) q = q.eq('user_email', email);
  const { data, error } = await q;
  if (error) throw new Error(error.message || 'Could not load from Supabase.');
  return (data || []).map(rowToSession);
}

export async function deleteFromCloud(id) {
  const c = await client();
  const { error } = await c.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message || 'Could not delete from Supabase.');
  return true;
}

// Delete all of this user's saved transcripts.
export async function clearCloud(email) {
  const c = await client();
  let q = c.from(TABLE).delete();
  q = email ? q.eq('user_email', email) : q.neq('id', '');
  const { error } = await q;
  if (error) throw new Error(error.message || 'Could not clear Supabase.');
  return true;
}
