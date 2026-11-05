#!/usr/bin/env python3
"""
Dust — a real Gmail cleaner.
By the Supa Man idea notebook. :)

What it does:
  1. Asks you a short survey (what dates? what companies?) -- just like the app idea.
  2. Searches your real Gmail for emails that match.
  3. Shows you a preview and asks you to confirm.
  4. Moves them to the TRASH so you get more storage.

Why it's safe:
  * It moves mail to the Trash, which Gmail keeps for 30 days. Nothing is
    gone forever -- you can open Gmail, go to Trash, and put anything back.
  * It NEVER touches mail you have Starred.
  * It shows you exactly how many emails it found and asks you to type "yes"
    before it sweeps anything.

Before this works you need a one-time setup -- see README.md in this folder.
"""

import os
import sys
import time

# These three packages come from Google. README.md says how to install them.
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("\n  Dust needs some Google helper packages first.")
    print("  Open README.md and do STEP 1 (install), then run Dust again.\n")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

# "gmail.modify" lets Dust move mail to the Trash. It does NOT let Dust
# delete mail forever, which keeps things safe.
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

# These two files live next to this script.
HERE = os.path.dirname(os.path.abspath(__file__))
CREDS_FILE = os.path.join(HERE, "credentials.json")  # you download this from Google
TOKEN_FILE = os.path.join(HERE, "token.json")        # Dust makes this after you log in once

# The Trash label is how Gmail marks something as trashed.
TRASH_LABEL = "TRASH"


# ---------------------------------------------------------------------------
# A little style so it feels like the Dust app
# ---------------------------------------------------------------------------

def banner():
    print()
    print("  =========================================")
    print("          D U S T   .   Gmail cleaner")
    print("     Sweep away the clutter, get storage.")
    print("  =========================================")
    print()


def ask(prompt):
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print("\n  Okay, stopping. Nothing was changed.\n")
        sys.exit(0)


# ---------------------------------------------------------------------------
# Step A: log in to Gmail
# ---------------------------------------------------------------------------

def get_gmail():
    """Logs in and returns a connection to your Gmail."""
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDS_FILE):
                print("  Dust can't find 'credentials.json'.")
                print("  Open README.md and do STEP 2 (get your Google key),")
                print("  then run Dust again.\n")
                sys.exit(1)
            print("  A browser window will open so you can log in to Google.")
            print("  Pick your account and click Allow. (This is just you,")
            print("  giving Dust permission to tidy your own mailbox.)\n")
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


# ---------------------------------------------------------------------------
# Step B: the survey  (your two questions, plus one bonus)
# ---------------------------------------------------------------------------

DATE_CHOICES = {
    "1": ("older_than:1y",  "older than 1 year"),
    "2": ("older_than:6m",  "older than 6 months"),
    "3": ("older_than:30d", "older than 1 month"),
    "4": ("",               "any date"),
}


def survey():
    """Asks the questions and builds a Gmail search out of the answers."""
    print("  -- Question 1 --")
    print("  From what dates do you want to delete?")
    print("    1) older than 1 year")
    print("    2) older than 6 months")
    print("    3) older than 1 month")
    print("    4) any date")
    choice = ask("  Pick 1-4: ")
    while choice not in DATE_CHOICES:
        choice = ask("  Please type 1, 2, 3, or 4: ")
    date_op, date_label = DATE_CHOICES[choice]

    print("\n  -- Question 2 --")
    print("  From what companies or senders? (emails, newsletters, ads...)")
    print("  Type names separated by commas, like:  amazon, netflix, groupon")
    print("  (Or just press Enter to skip and clean by category only.)")
    senders_raw = ask("  Senders: ")
    senders = [s.strip() for s in senders_raw.split(",") if s.strip()]

    print("\n  -- Bonus Question --")
    print("  Also sweep the whole 'Promotions' tab? (ads & deals)  [y/n]")
    promos = ask("  y/n: ").lower().startswith("y")

    # ---- turn the answers into a Gmail search ----
    parts = []
    if date_op:
        parts.append(date_op)
    if senders:
        joined = " OR ".join(senders)
        parts.append(f"from:({joined})")
    if promos:
        parts.append("category:promotions")

    # Safety: never, ever sweep starred mail.
    parts.append("-is:starred")

    # Safety: refuse to run if the survey would match basically everything.
    meaningful = date_op or senders or promos
    if not meaningful:
        print("\n  That would try to delete your whole mailbox, which Dust")
        print("  won't do. Pick a date, some senders, or the Promotions tab.\n")
        sys.exit(0)

    query = " ".join(parts)

    print("\n  Dust will search for:")
    print("    dates:    ", date_label)
    print("    senders:  ", ", ".join(senders) if senders else "(any)")
    print("    promos:   ", "yes" if promos else "no")
    print("    (starred mail is always kept safe)")
    print("\n  Gmail search it will use:  " + query + "\n")
    return query


# ---------------------------------------------------------------------------
# Step C: find the matching emails
# ---------------------------------------------------------------------------

def find_messages(gmail, query):
    """Returns a list of all message IDs that match the search."""
    ids = []
    page_token = None
    print("  Searching your mail...")
    while True:
        resp = gmail.users().messages().list(
            userId="me", q=query, maxResults=500, pageToken=page_token
        ).execute()
        ids.extend(m["id"] for m in resp.get("messages", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


def preview(gmail, ids, how_many=8):
    """Shows a few of the emails so you can see what will be swept."""
    print(f"\n  Here are {min(how_many, len(ids))} of them:")
    for mid in ids[:how_many]:
        try:
            msg = gmail.users().messages().get(
                userId="me", id=mid, format="metadata",
                metadataHeaders=["From", "Subject"]
            ).execute()
            headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
            sender = headers.get("From", "(unknown sender)")[:38]
            subject = headers.get("Subject", "(no subject)")[:46]
            print(f"    - {sender:<40}  {subject}")
        except HttpError:
            pass


# ---------------------------------------------------------------------------
# Step D: sweep them to the Trash (in bulk, recoverable)
# ---------------------------------------------------------------------------

def sweep(gmail, ids):
    """Moves every matching email to the Trash, 1000 at a time."""
    total = len(ids)
    done = 0
    for i in range(0, total, 1000):
        chunk = ids[i:i + 1000]
        gmail.users().messages().batchModify(
            userId="me",
            body={"ids": chunk, "addLabelIds": [TRASH_LABEL]},
        ).execute()
        done += len(chunk)
        print(f"    swept {done} / {total}...")
        time.sleep(0.2)  # be gentle on Gmail
    return done


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    banner()
    gmail = get_gmail()

    query = survey()
    ids = find_messages(gmail, query)

    if not ids:
        print("  Nothing matched those answers. Nothing was changed.")
        print("  Try a wider date range or different senders.\n")
        return

    print(f"\n  Dust found {len(ids)} emails that match.")
    preview(gmail, ids)

    print("\n  These will move to your Trash (Gmail keeps Trash for 30 days,")
    print("  so you can undo this any time in the next month).")
    answer = ask(f'\n  Type "yes" to sweep all {len(ids)} to the Trash: ').lower()
    if answer != "yes":
        print("\n  Okay! Nothing was changed. Your mail is exactly as it was.\n")
        return

    print("\n  Sweeping...")
    done = sweep(gmail, ids)
    print(f"\n  All done! {done} emails swept to the Trash.")
    print("  Open Gmail -> Trash if you ever want any of them back.")
    print("  To get the storage back for real, empty the Trash in Gmail.\n")


if __name__ == "__main__":
    main()
