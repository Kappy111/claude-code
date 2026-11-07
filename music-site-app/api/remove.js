// Owner-only: remove a song from the playlist by id.
const { deleteSong, readBody } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = await readBody(req);
  if (!process.env.UPLOAD_PASSWORD || body.password !== process.env.UPLOAD_PASSWORD) {
    res.status(403).json({ error: 'Wrong password.' });
    return;
  }
  if (!body.id) { res.status(400).json({ error: 'Missing id' }); return; }

  try {
    await deleteSong(body.id);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
