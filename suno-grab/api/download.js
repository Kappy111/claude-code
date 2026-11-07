// Helper: turn any Suno link (short /s/ share link or full /song/ link)
// into a real MP3 download.
// GET /api/download?url=<suno link>&name=<song title>
// Add &debug=1 to get a JSON diagnostic instead of the file.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const q = req.query || {};
  const input = (q.url || q.link || '').toString().trim();
  const wantName = (q.name || 'suno-song').toString();
  const debug = !!q.debug;
  const dbg = { input: input };

  if (!input) { res.status(400).send('Add ?url=<your Suno share link>'); return; }

  let target;
  try { target = new URL(input); } catch (e) { res.status(400).send('That does not look like a web link.'); return; }
  if (!/(^|\.)suno\.(com|ai)$/i.test(target.hostname)) {
    res.status(400).send('Please paste a Suno link (it should start with https://suno.com/).');
    return;
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  // Follow the (possibly short) link to the real song page and read its HTML.
  let html = '';
  let finalUrl = input;
  try {
    const r = await fetch(input, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow' });
    finalUrl = r.url || input;
    html = await r.text();
    dbg.pageStatus = r.status;
  } catch (e) { dbg.pageError = String(e); }
  dbg.finalUrl = finalUrl;
  dbg.htmlLen = html.length;

  const haystack = finalUrl + '\n' + html;
  const idMatch = haystack.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const id = idMatch ? idMatch[0] : null;
  dbg.id = id;

  let audioUrl = null;
  let m = html.match(/<meta[^>]+property=["']og:audio["'][^>]+content=["']([^"']+)["']/i);
  if (m) audioUrl = m[1];
  if (!audioUrl) { m = html.match(/<meta[^>]+content=["']([^"']+\.mp3[^"']*)["'][^>]+property=["']og:audio["']/i); if (m) audioUrl = m[1]; }
  if (!audioUrl) { m = html.match(/"audio_url"\s*:\s*"([^"]+)"/); if (m) audioUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }
  if (!audioUrl) { m = html.match(/(https?:\/\/[^"'\s]+\.(?:mp3|m4a)[^"'\s]*)/i); if (m) audioUrl = m[1]; }
  dbg.audioUrl = audioUrl;

  const candidates = [];
  if (audioUrl) candidates.push(audioUrl);
  if (id) {
    candidates.push('https://cdn1.suno.ai/' + id + '.mp3');
    candidates.push('https://cdn2.suno.ai/' + id + '.mp3');
    candidates.push('https://audiopipe.suno.ai/?item_id=' + id);
  }
  dbg.candidates = candidates;

  if (!candidates.length) {
    if (debug) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(JSON.stringify(dbg, null, 2)); return; }
    res.status(422).send('Found the Suno page but could not locate the audio on it. If the song is private, set it to Public in Suno, then try again.');
    return;
  }

  let audioRes = null, usedUrl = null;
  dbg.attempts = [];
  for (const c of candidates) {
    try {
      const r = await fetch(c, { headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': 'https://suno.com/' } });
      dbg.attempts.push({ url: c, status: r.status, type: r.headers.get('content-type') });
      if (r.ok) { audioRes = r; usedUrl = c; break; }
    } catch (e) { dbg.attempts.push({ url: c, error: String(e) }); }
  }

  if (debug) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(JSON.stringify(dbg, null, 2)); return; }

  if (!audioRes) {
    res.status(502).send('Could not reach the audio file for this song. It may be private or the link expired. Try making the song Public on Suno, or use Suno\'s own Download button.');
    return;
  }

  const safe = wantName.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'suno-song';
  const buf = Buffer.from(await audioRes.arrayBuffer());
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '.mp3"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(buf);
};
