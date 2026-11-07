// Shared helpers for the listen-site playlist (stored as one JSON blob).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function readList() {
  const { list } = await import('@vercel/blob');
  const out = await list({ prefix: 'playlist.json' });
  const b = (out.blobs || []).find(function (x) { return x.pathname === 'playlist.json'; });
  if (!b) return [];
  try {
    const r = await fetch(b.url, { cache: 'no-store' });
    const a = await r.json();
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

async function writeList(arr) {
  const { put } = await import('@vercel/blob');
  await put('playlist.json', JSON.stringify(arr), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

// Resolve a Suno link (short /s/ or full /song/) to its song id + a title.
async function resolveSong(link) {
  let id = null, title = '';
  const direct = link.match(UUID);
  if (direct) id = direct[0];
  if (!id || !title) {
    try {
      const r = await fetch(link, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow' });
      const html = await r.text();
      if (!id) { const m = ((r.url || '') + '\n' + html).match(UUID); if (m) id = m[0]; }
      const t = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (t) title = t[1].replace(/\s*\|\s*Suno.*$/i, '').trim();
    } catch (e) { /* ignore */ }
  }
  return { id: id, title: title };
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

module.exports = { readList, writeList, resolveSong, readBody, UA };
