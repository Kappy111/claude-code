# The1Min — website (deploy to Netlify)

A website that watches your screen, notices when you've been stuck for a minute, reads
what's there with Claude, and shows the best way to get unstuck — with a copy-ready
"better prompt." No app to install, no browser extension.

## Deploy in 1 minute (drag-and-drop, no terminal)

1. Go to **https://app.netlify.com/drop**
2. Drag the **whole folder** (the one with `index.html`) onto the page — or drag the
   `the1min-netlify.zip` straight on.
3. Netlify gives you a live `https://…netlify.app` link. Open it.

That's it — it's live. (It must be opened over the `https://…netlify.app` link, not as a
local file, because browsers only allow screen-sharing on a secure https page.)

## Use it

1. Click the gear (⚙) → paste your **Anthropic API key** (`sk-ant-…` from
   [console.anthropic.com](https://console.anthropic.com/settings/keys)) → **Save**.
2. Click **Share my screen & start** → choose the screen, window, or tab with your work.
3. The1Min watches. If your screen doesn't change for a minute (you're stuck and staring),
   it reads the screen and pops up with help. Or hit **I'm stuck — help** anytime.

## Privacy — please read

When The1Min helps, it sends **one screenshot of the screen you shared** to the Anthropic
API. Nothing is stored by the site; your key lives only in your own browser. Because this
is a static site, the key is used directly from your browser — fine for your own personal
use. Don't share your deployed link-with-key with others, and stop sharing your screen when
you're on anything private.

> Want the key hidden on a server instead? That's a small upgrade using a Netlify Function
> (the key becomes a Netlify environment variable and never touches the browser). Ask and
> I'll add it.

## Files

```
index.html   the entire app — that's all Netlify needs
```
