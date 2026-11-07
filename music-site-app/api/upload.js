// Generates a one-time client upload token after checking the owner password.
// Used by the browser's @vercel/blob client upload() flow.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const { handleUpload } = await import('@vercel/blob/client');

  let body = req.body;
  if (!body || typeof body !== 'object') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { body = {}; }
  }

  try {
    const json = await handleUpload({
      request: req,
      body: body,
      onBeforeGenerateToken: async function (pathname, clientPayload) {
        if (!process.env.UPLOAD_PASSWORD || clientPayload !== process.env.UPLOAD_PASSWORD) {
          throw new Error('Wrong password. Enter the password you set to add songs.');
        }
        return {
          addRandomSuffix: false,
          allowOverwrite: true,
          allowedContentTypes: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'application/octet-stream'],
          maximumSizeInBytes: 60 * 1024 * 1024
        };
      },
      onUploadCompleted: async function () { /* nothing to do */ }
    });
    res.status(200).json(json);
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || String(e) });
  }
};
