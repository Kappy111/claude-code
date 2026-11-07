// Shared helpers. Each song is its own blob at songs/<id>.json.
// kind: 'suno' (embeddable player), 'file' (uploaded audio), 'link' (open-out only).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function readList() {
  const { list } = await import('@vercel/blob');
  const out = await list({ prefix: 'songs/' });
  const blobs = (out.blobs || []).filter(function (b) { return /\.json$/i.test(b.pathname); });
  const items = await Promise.all(blobs.map(async function (b) {
    try {
      const u = b.url + (b.url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(String(b.uploadedAt || ''));
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json();
      return (j && j.id) ? j : null;
    } catch (e) { return null; }
  }));
  return items.filter(Boolean).sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
}

async function getSong(id) {
  const { list } = await import('@vercel/blob');
  const key = 'songs/' + id + '.json';
  const out = await list({ prefix: key });
  const b = (out.blobs || []).find(function (x) { return x.pathname === key; });
  if (!b) return null;
  try { const r = await fetch(b.url + '?v=' + encodeURIComponent(String(b.uploadedAt || '')), { cache: 'no-store' }); return await r.json(); }
  catch (e) { return null; }
}

async function putSong(entry) {
  const { put } = await import('@vercel/blob');
  await put('songs/' + entry.id + '.json', JSON.stringify(entry), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
  });
}

async function deleteSong(id) {
  const { list, del } = await import('@vercel/blob');
  const entry = await getSong(id);
  if (entry && entry.kind === 'file' && entry.url) { try { await del(entry.url); } catch (e) {} }
  const key = 'songs/' + id + '.json';
  const out = await list({ prefix: key });
  const b = (out.blobs || []).find(function (x) { return x.pathname === key; });
  if (b) await del(b.url);
}

// Resolve a Suno link (short /s/ or full /song/) to its song id + title.
async function resolveSuno(link) {
  let id = null, title = '';
  const direct = link.match(UUID);
  if (direct) id = direct[0];
  try {
    const r = await fetch(link, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow' });
    const html = await r.text();
    if (!id) { const m = ((r.url || '') + '\n' + html).match(UUID); if (m) id = m[0]; }
    const t = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (t) title = t[1].replace(/\s*\|\s*Suno.*$/i, '').trim();
  } catch (e) { /* ignore */ }
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

module.exports = { readList, getSong, putSong, deleteSong, resolveSuno, readBody, hashId, UA };
