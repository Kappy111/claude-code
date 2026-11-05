# The1Min — website (Netlify, hidden server key)

Watches the screen you share, notices when you've been stuck for a minute, reads it with
Claude, and shows the best way to get unstuck — with a copy-ready "better prompt." No app,
no browser extension. **The Anthropic key lives only on the server (a Netlify environment
variable); nobody ever types a key into the page.**

## How it fits together

```
index.html                    the app (calls /.netlify/functions/ask, no key in the browser)
netlify/functions/ask.js      server function — holds ANTHROPIC_API_KEY, talks to Claude
netlify.toml                  tells Netlify where the function lives
```

## Deploy (recommended: connect GitHub — reliable for the server function)

The server function needs a real build, so connect the repo instead of drag-and-drop:

1. Go to **https://app.netlify.com** → **Add new site → Import an existing project → GitHub**.
2. Pick the repo **`Kappy111/claude-code`** and the branch **`claude/blissful-carson-wmkhwo`**.
3. Set **Base directory** to `the1min-site`. Leave build command empty; publish directory `.`.
4. Click **Deploy**.

### Add the key (one time, hidden)

5. In the new site: **Site configuration → Environment variables → Add a variable**
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic key (`sk-ant-…` from
     [console.anthropic.com](https://console.anthropic.com/settings/keys))
6. **Deploys → Trigger deploy → Deploy site** (so the new key is picked up).

Open the `https://…netlify.app` link, click **Share my screen & start**, and go. No key
prompt — it just works.

> **Protect the key with a spending cap.** In the Anthropic console set a low monthly limit
> (e.g. $5) under **Billing → Limits**. Because the site is public, anyone who finds your
> link can make it call Claude; the function only ever asks "what am I stuck on?" (capped at
> 1024 tokens), and the spend cap is your hard backstop.

## Changing the model

The gear (⚙) on the page picks Opus / Sonnet / Haiku. **Haiku 5.5** is cheapest and fastest.
The model list is also enforced server-side in `ask.js`.

## Why not drag-and-drop a zip?

Drag-and-drop can publish the page, but Netlify's one-click **Import from GitHub** is the
dependable way to get the serverless function and its environment variable working. That's
the whole point of this version — keeping the key off the page.
