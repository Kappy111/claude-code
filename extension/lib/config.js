// Central configuration for Snapfolder.
//
// Auth / cloud sync is the NEXT milestone. When we wire up Supabase, fill in
// the project URL and anon (public) key below. These are safe to ship in a
// client — row-level security on the Supabase side is what protects data.
//
//   1. Create a project at https://supabase.com
//   2. Settings -> API -> copy "Project URL" and the "anon public" key
//   3. Paste them here (or load them from a build-time env for CI)
//
// Until these are set, the extension runs fully locally (IndexedDB only) and
// the UI shows auth as "coming soon".

export const CONFIG = {
  supabase: {
    url: "",      // e.g. "https://xxxxxxxx.supabase.co"
    anonKey: "",  // e.g. "eyJhbGciOi..."
  },

  // Storage bucket we'll upload screenshot blobs into once sync lands.
  storageBucket: "screenshots",

  // Local IndexedDB names.
  db: {
    name: "snapfolder",
    version: 1,
  },
};

// True once real Supabase credentials have been provided.
export function isSupabaseConfigured() {
  return Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);
}
