/* The1Min — server-side proxy. The Anthropic API key lives ONLY here, as the Netlify
   environment variable ANTHROPIC_API_KEY. The browser never sees it. The page sends just
   a screenshot (+ optional note + chosen model); this function builds the request, so the
   endpoint can't be abused as a general-purpose Claude key. */

const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

function reply(status, obj) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}

function instructions(note) {
  return `You are The1Min, a calm, friendly helper. The person has been stuck on their computer for more than a minute. Below is a screenshot of their screen.

Look at it and work out what they're most likely trying to do and where they appear to be stuck — an error, a blank result, a confusing screen, or a task that isn't responding.
${note ? `The person also said: "${note}"` : ''}
Explain simply and kindly, the way you'd help a clever kid. Short, plain words.

Reply with ONLY a JSON object, no other text, shaped exactly like this:
{"problem":"<one friendly sentence naming what they seem stuck on>","steps":["<small concrete thing to try>","<next>","<next>"],"resource":"<the single best thing to look up or place to check, in plain words>","prompt":"<a short ready-to-paste prompt they can give an AI or a search box>","cheer":"<one short encouraging line, max 12 words>"}
Use 2 to 4 steps. Keep every string short. If the screenshot is unclear, make your best guess and say so gently in "problem".`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: { message: 'Method not allowed.' } });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return reply(500, { error: { message: 'This site has no API key set yet. In Netlify, open Site configuration → Environment variables, add ANTHROPIC_API_KEY, then redeploy.' } });
  }

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: { message: 'Bad request.' } }); }

  const image = input.image;
  if (!image || typeof image !== 'string') return reply(400, { error: { message: 'No screenshot was provided.' } });

  const model = ALLOWED_MODELS.includes(input.model) ? input.model : 'claude-opus-5-5';
  const note = typeof input.note === 'string' ? input.note.slice(0, 400) : '';

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
            { type: 'text', text: instructions(note) }
          ]
        }]
      })
    });
  } catch (e) {
    return reply(502, { error: { message: 'Could not reach Claude. Try again in a moment.' } });
  }

  if (!r.ok) {
    let m = '';
    try { m = (await r.json()).error.message; } catch {}
    return reply(r.status, { error: { message: m || ('Claude returned an error (' + r.status + ').') } });
  }

  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return reply(200, { text });
};
