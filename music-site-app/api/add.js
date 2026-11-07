// Owner-only: add a song by link (Suno → embed, else open-out) OR register an uploaded file.
const { putSong, resolveSuno, grabAudio, readBody, hashId } = require('./_lib');
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

  const niceHost = host.replace(/^www\./, '');

  // Try to pull the real audio from the page (e.g. ElevenLabs) and host it so it plays here.
  try {
    const grabbed = await grabAudio(link);
    if (grabbed && grabbed.buf) {
      const { put } = await import('@vercel/blob');
      const ct = grabbed.contentType || 'audio/mpeg';
      const ext = ct.indexOf('mp4') !== -1 ? '.m4a' : (ct.indexOf('mpeg') !== -1 || ct.indexOf('mp3') !== -1 ? '.mp3' : (ct.indexOf('wav') !== -1 ? '.wav' : (ct.indexOf('ogg') !== -1 ? '.ogg' : '.m4a')));
      const id = 'f_' + hashId(link);
      const blob = await put('media/' + id + ext, grabbed.buf, { access: 'public', addRandomSuffix: true, contentType: ct });
      const entry = { id: id, kind: 'file', title: title || grabbed.title || niceHost, url: blob.url, pathname: blob.pathname, source: link, addedAt: Date.now() };
      await putSong(entry);
      res.status(200).json({ ok: true, entry: entry, imported: true });
      return;
    }
  } catch (e) { /* fall through to open-out link */ }

  // Fallback: store as an open-out entry (nothing playable could be pulled).
  const entry = { id: 'l_' + hashId(link), kind: 'link', title: title || niceHost, link: link, host: niceHost, addedAt: Date.now() };
  try { await putSong(entry); res.status(200).json({ ok: true, entry: entry }); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
};
