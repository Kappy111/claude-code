// Owner-only: add a song by link (Suno → embed, else open-out) OR register an uploaded file.
const { putSong, resolveSuno, readBody, hashId } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = await readBody(req);
  if (!process.env.UPLOAD_PASSWORD || body.password !== process.env.UPLOAD_PASSWORD) {
    res.status(403).json({ error: 'Wrong password.' });
    return;
  }

  const title = (body.title || '').toString().trim();

  // --- Uploaded file registration ---
  if (body.kind === 'file' && body.url) {
    const id = (body.id || ('f_' + Date.now().toString(36))).toString();
    const entry = { id: id, kind: 'file', title: title || 'Untitled', url: body.url, pathname: body.pathname || '', addedAt: Date.now() };
    try { await putSong(entry); res.status(200).json({ ok: true, entry: entry }); }
    catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
    return;
  }

  // --- Add by link ---
  const link = (body.link || '').toString().trim();
  if (!link) { res.status(400).json({ error: 'Paste a link or upload a file.' }); return; }
  let host;
  try { host = new URL(link).hostname; } catch (e) { res.status(400).json({ error: 'That does not look like a link.' }); return; }

  if (/(^|\.)suno\.(com|ai)$/i.test(host)) {
    const info = await resolveSuno(link);
    if (!info.id) { res.status(422).json({ error: 'Could not find the song on that Suno link. Make sure it is a public song link.' }); return; }
    const entry = { id: info.id, kind: 'suno', title: title || info.title || 'Untitled', link: link, addedAt: Date.now() };
    try { await putSong(entry); res.status(200).json({ ok: true, entry: entry }); }
    catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
    return;
  }

  // Any other link: store as an open-out entry (cannot embed arbitrary sites).
  const niceHost = host.replace(/^www\./, '');
  const entry = { id: 'l_' + hashId(link), kind: 'link', title: title || niceHost, link: link, host: niceHost, addedAt: Date.now() };
  try { await putSong(entry); res.status(200).json({ ok: true, entry: entry }); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
};
