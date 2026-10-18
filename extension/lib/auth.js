// Auth facade for Snapfolder, backed by the Base44 app.
//
// The UI only talks to this module (getUser / onChange / signIn / signUp /
// signOut / init). The session (access token + user) is persisted in
// chrome.storage.local so it survives the popup closing and reopening.

import { isConfigured } from "./config.js";
import * as api from "./base44.js";

const STORAGE_KEY = "sf_session"; // { token, user }

const listeners = new Set();
let currentUser = null;
let currentToken = null;

export { isConfigured };

export function getUser() {
  return currentUser;
}

export function getToken() {
  return currentToken;
}

export function onChange(fn) {
  listeners.add(fn);
  try {
    fn(currentUser);
  } catch (_) {
    /* ignore */
  }
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(currentUser);
    } catch (_) {
      /* ignore */
    }
  }
}

async function persist() {
  try {
    if (currentToken) {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { token: currentToken, user: currentUser },
      });
    } else {
      await chrome.storage.local.remove(STORAGE_KEY);
    }
  } catch (_) {
    /* best effort */
  }
}

function setSession(token, user) {
  currentToken = token || null;
  currentUser = user || null;
}

export async function signIn(email, password) {
  const res = await api.login(String(email).trim(), password);
  if (!res || !res.access_token) {
    throw new Error("Sign-in failed — no token returned.");
  }
  setSession(res.access_token, res.user || { email });
  await persist();
  emit();
  return currentUser;
}

export async function signUp(email, password) {
  await api.register(String(email).trim(), password);
  // Try to sign in right away; if the app requires email verification this
  // will fail and the caller surfaces the message.
  return signIn(email, password);
}

export async function signOut() {
  setSession(null, null);
  await persist();
  emit();
}

export async function init() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const session = stored[STORAGE_KEY];
    if (session && session.token) {
      setSession(session.token, session.user);
      // Validate the token in the background; sign out if it's no longer good.
      api
        .me(session.token)
        .then((user) => {
          if (user) {
            currentUser = user;
            persist();
            emit();
          }
        })
        .catch((err) => {
          if (err && err.status === 401) signOut();
        });
    }
  } catch (_) {
    /* ignore */
  }
  emit();
}
