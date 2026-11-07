// Owner-only: add a Suno link to the playlist.
const { putSong, resolveSong, readBody } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = await readBody(req);
  if (!process.env.UPLOAD_PASSWORD || body.password !== process.env.UPLOAD_PASSWORD) {
    res.status(403).json({ error: 'Wrong password.' });
    return;
  }
  const link = (body.link || '').toString().trim();
  if (!link) { res.status(400).json({ error: 'Paste a Suno link.' }); return; }

  let host;
  try { host = new URL(link).hostname; } catch (e) { res.status(400).json({ error: 'That does not look like a link.' }); return; }
  if (!/(^|\.)suno\.(com|ai)$/i.test(host)) { res.status(400).json({ error: 'Please paste a Suno link (suno.com/...).' }); return; }

  const info = await resolveSong(link);
  if (!info.id) { res.status(422).json({ error: 'Could not find the song on that link. Make sure it is a public Suno song link.' }); return; }

  const title = ((body.title || '').toString().trim()) || info.title || 'Untitled';
  const entry = { id: info.id, title: title, link: link, addedAt: Date.now() };

  try {
    await putSong(entry);
    res.status(200).json({ ok: true, entry: entry });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
