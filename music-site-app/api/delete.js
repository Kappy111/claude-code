// Removes a song from Blob storage. Owner-password protected.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { body = {}; }
  }

  if (!process.env.UPLOAD_PASSWORD || body.password !== process.env.UPLOAD_PASSWORD) {
    res.status(403).json({ error: 'Wrong password.' });
    return;
  }
  if (!body.url) { res.status(400).json({ error: 'Missing url' }); return; }

  try {
    const { del } = await import('@vercel/blob');
    await del(body.url);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || String(e) });
  }
};
