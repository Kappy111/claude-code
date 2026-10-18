// Auth facade for Snapfolder.
//
// NEXT MILESTONE: back this with Supabase. The rest of the app only talks to
// this module (getUser / onChange / signIn / signOut), so swapping the local
// stub for a real Supabase client won't ripple through the UI.
//
// Planned Supabase wiring (left as a guide for the follow-up):
//
//   import { createClient } from "@supabase/supabase-js";
//   import { CONFIG } from "./config.js";
//   const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
//
//   // Chrome extension popups are short-lived, so persist the session in
//   // chrome.storage and rehydrate it on load, and complete OAuth via
//   // chrome.identity.launchWebAuthFlow rather than a redirect.
//
// For now this reports a guest (signed-out) user and tells the UI that auth
// is not configured yet.

import { isSupabaseConfigured } from "./config.js";

const listeners = new Set();
let currentUser = null; // null = signed out / guest

export function isConfigured() {
  return isSupabaseConfigured();
}

export function getUser() {
  return currentUser;
}

export function onChange(fn) {
  listeners.add(fn);
  // Fire immediately with the current state.
  try {
    fn(currentUser);
  } catch (_) {
    /* ignore listener errors */
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

export async function signIn() {
  if (!isConfigured()) {
    throw new Error(
      "Sign-in isn't set up yet. Add your Supabase credentials in lib/config.js."
    );
  }
  // TODO(supabase): launch the OAuth / email flow and set currentUser.
  throw new Error("Supabase sign-in not implemented yet.");
}

export async function signOut() {
  currentUser = null;
  // TODO(supabase): await supabase.auth.signOut();
  emit();
}

export async function init() {
  // TODO(supabase): rehydrate a stored session from chrome.storage.local and
  // subscribe to supabase.auth.onAuthStateChange.
  emit();
}
