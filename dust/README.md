# Dust — the real Gmail cleaner 🧹

This is the *real* version of Dust. It runs on your own computer and actually
cleans your Gmail by moving old emails to the **Trash** so you get storage back.

It's safe:
- It moves mail to the **Trash**, which Gmail keeps for **30 days**. Nothing is
  gone forever — you can put anything back.
- It **never** touches mail you have **Starred**.
- It shows you a preview and makes you type **yes** before it sweeps anything.

> ⚠️ This deletes *real* emails. Do the setup with a parent or adult the first
> time, especially Step 2.

---

## What you need
- A computer (Mac, Windows, or Linux)
- Python 3 installed → check by running `python3 --version`
  (if that fails, install it from https://www.python.org/downloads/)
- A Gmail account

---

## STEP 1 — Install the helper packages (one time)

Open a terminal **in this `dust` folder** and run:

```bash
pip3 install -r requirements.txt
```

---

## STEP 2 — Get your Google key (one time, ask an adult)

Dust needs your permission to touch your own mailbox. Google gives you a little
key file called `credentials.json`. Here's how to get it:

1. Go to **https://console.cloud.google.com/** and sign in with your Gmail.
2. At the top, click the project dropdown → **New Project** → name it `Dust` →
   **Create**. Make sure `Dust` is the selected project.
3. In the search bar, search **"Gmail API"**, open it, and click **Enable**.
4. Go to **APIs & Services → OAuth consent screen**:
   - Choose **External**, click Create.
   - Fill in an app name (like `Dust`) and your email where it asks. Save.
   - On **Audience** (or "Test users"), click **Add users** and add your own
     Gmail address. (This lets *you* use it.)
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Click **Create**, then **Download JSON**.
6. Rename that downloaded file to exactly **`credentials.json`** and put it in
   **this `dust` folder**, right next to `dust.py`.

You only ever do Step 2 once.

---

## STEP 3 — Run Dust! 🎉

In the terminal, in this folder:

```bash
python3 dust.py
```

The first time, a browser opens asking you to log in and click **Allow** — that's
you giving Dust permission to tidy your own mail. After that it remembers you.

Then Dust asks your survey questions:

- **From what dates?** (older than 1 year / 6 months / 1 month / any)
- **From what companies?** — type names like `amazon, netflix, groupon`
- **Also sweep the Promotions tab?** (all those ads and deals)

It finds the matching emails, shows you some, tells you the total, and sweeps
them to the Trash once you type `yes`.

---

## How to UNDO
Open Gmail → click **Trash** on the left → select mail → **Move to Inbox**.
Anything swept in the last 30 days is still there.

## How to actually free the storage
Trash still uses a little space until it empties. Gmail empties Trash on its own
after 30 days, or you can open **Trash → Empty Trash now**. Do that only when
you're sure you don't want any of it back.

---

### A note on files Dust makes
- `token.json` appears after you log in — it's your saved login. Keep it private
  and don't share it (it's like a key to your mailbox). Don't commit it to GitHub.
- `credentials.json` is also private — keep it on your computer only.
