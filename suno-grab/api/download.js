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

  // Collect every plausible audio URL from the page.
  const found = [];
  let m = html.match(/<meta[^>]+property=["']og:audio["'][^>]+content=["']([^"']+)["']/i);
  if (m) found.push(m[1]);
  m = html.match(/<meta[^>]+content=["']([^"']+\.mp3[^"']*)["'][^>]+property=["']og:audio["']/i);
  if (m) found.push(m[1]);
  let am;
  const reAudio = /"audio_url"\s*:\s*"([^"]+)"/g;
  while ((am = reAudio.exec(html))) found.push(am[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
  const reMp3 = /(https?:\/\/[^"'\s\\]+\.(?:mp3|m4a)[^"'\s\\]*)/gi;
  while ((am = reMp3.exec(html))) found.push(am[1]);
  dbg.foundInPage = found.slice(0, 6);

  const candidates = [];
  const seen = {};
  function add(u) { if (u && !seen[u]) { seen[u] = 1; candidates.push(u); } }
  found.forEach(add);
  if (id) {
    add('https://cdn1.suno.ai/' + id + '.mp3');
    add('https://cdn2.suno.ai/' + id + '.mp3');
  }
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
        if (b.length > 20000 && !htmlish && audioish) {
          audioBuf = b; usedUrl = c;
          usedType = ct.indexOf('mp4') !== -1 || /\.m4a/i.test(c) ? 'audio/mp4' : 'audio/mpeg';
          att.accepted = true;
          dbg.attempts.push(att);
          break;
        }
        att.rejected = true;
      }
    } catch (e) { att.error = String(e); }
    dbg.attempts.push(att);
  }

  if (debug) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(JSON.stringify(dbg, null, 2)); return; }

  if (!audioBuf) {
    res.status(502).send('Found the song page but every audio source came back empty or blocked. Add &debug=1 to the end of the link to see details, or use Suno\'s own Download button.');
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
