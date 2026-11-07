// Helper: turn any Suno link (short /s/ share link or full /song/ link)
// into a real MP3 download.
// GET /api/download?url=<suno link>&name=<song title>
// Add &debug=1 to get a JSON diagnostic (tests every source) instead of the file.
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

  // Collect plausible audio URLs from the page, skipping Suno's silent placeholder.
  const found = [];
  function note(u) { if (u && !/sil-\d+\.mp3/i.test(u)) found.push(u); }
  let m = html.match(/<meta[^>]+property=["']og:audio["'][^>]+content=["']([^"']+)["']/i);
  if (m) note(m[1]);
  m = html.match(/<meta[^>]+content=["']([^"']+\.mp3[^"']*)["'][^>]+property=["']og:audio["']/i);
  if (m) note(m[1]);
  let am;
  const reAudio = /"audio_url"\s*:\s*"([^"]+)"/g;
  while ((am = reAudio.exec(html))) note(am[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
  const reMp3 = /(https?:\/\/[^"'\s\\]+\.(?:mp3|m4a)[^"'\s\\]*)/gi;
  while ((am = reMp3.exec(html))) note(am[1]);

  // Order: real MP3s first (play everywhere), then whatever the page offers (often m4a).
  const candidates = [];
  const seen = {};
  function add(u) { if (u && !seen[u]) { seen[u] = 1; candidates.push(u); } }
  if (id) {
    add('https://cdn1.suno.ai/' + id + '.mp3');
    add('https://cdn2.suno.ai/' + id + '.mp3');
  }
  found.filter(function (u) { return /\.mp3(\?|$)/i.test(u); }).forEach(add);
  found.forEach(add);
  dbg.candidates = candidates;

  if (!candidates.length) {
    if (debug) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(JSON.stringify(dbg, null, 2)); return; }
    res.status(422).send('Found the Suno page but could not locate the audio on it. If the song is private, set it to Public in Suno, then try again.');
    return;
  }

  let audioBuf = null, usedType = 'audio/mpeg', usedUrl = null;
  dbg.attempts = [];
  for (const c of candidates) {
    const att = { url: c };
    try {
      const r = await fetch(c, { headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': 'https://suno.com/' }, redirect: 'follow' });
      att.status = r.status;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      att.type = ct;
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        att.bytes = b.length;
        const head = b.slice(0, 1).toString('latin1');
        const htmlish = head === '<' || head === '{';
        const audioish = ct.indexOf('audio') !== -1 || ct.indexOf('mpeg') !== -1 || ct.indexOf('mp4') !== -1 || ct.indexOf('octet-stream') !== -1 || /\.(mp3|m4a)(\?|$)/i.test(c);
        // Verify it is really decodable audio, not Suno's encrypted stream.
        const isMp3 = (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0);
        const isMp4 = b.slice(4, 8).toString('latin1') === 'ftyp';
        const validSig = isMp3 || isMp4;
        att.validSig = validSig;
        if (b.length > 20000 && !htmlish && audioish && validSig) {
          att.accepted = true;
          if (!audioBuf) {
            audioBuf = b; usedUrl = c;
            usedType = (ct.indexOf('mp4') !== -1 || /\.m4a/i.test(c)) ? 'audio/mp4' : 'audio/mpeg';
          }
        } else { att.rejected = true; }
      }
    } catch (e) { att.error = String(e); }
    dbg.attempts.push(att);
    if (audioBuf && !debug) break;
  }

  if (debug) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(JSON.stringify(dbg, null, 2)); return; }

  if (!audioBuf) {
    res.status(451).send('Suno protects the audio on share links (it is encrypted), so it cannot be downloaded and played from the link alone. To save this song, open it in Suno and use Suno\'s own Download button, then add that file to your site.');
    return;
  }

  const ext = usedType === 'audio/mp4' ? '.m4a' : '.mp3';
  const safe = wantName.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'suno-song';
  res.setHeader('Content-Type', usedType);
  res.setHeader('Content-Length', String(audioBuf.length));
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + ext + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(audioBuf);
};
