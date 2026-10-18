// Central configuration for Snapfolder.
//
// Auth/cloud is backed by a Base44 app (the "Supabase Engine" project). The
// extension talks to Base44's REST API directly:
//
//   POST {server}/api/apps/{appId}/auth/login     {email,password} -> {access_token,user}
//   POST {server}/api/apps/{appId}/auth/register  {email,password}
//   GET  {server}/api/apps/{appId}/entities/User/me   (Bearer token)
//
// The appId is public (it's in the Base44 editor URL). Requests are sent with
// an "X-App-Id" header and, once signed in, "Authorization: Bearer <token>".

export const CONFIG = {
  base44: {
    appId: "6ad4e6ae268c0f00e89d6e05",
    serverUrl: "https://base44.app",
  },

  // Entity names in the Base44 app used for cloud sync (created in the Base44
  // editor). Sync is wired up once these exist.
  entities: {
    folder: "Folder",
    screenshot: "Screenshot",
  },

  // Local IndexedDB names.
  db: {
    name: "snapfolder",
    version: 1,
  },
};

// True once a Base44 app is configured to talk to.
export function isConfigured() {
  return Boolean(CONFIG.base44.appId && CONFIG.base44.serverUrl);
}

// Back-compat alias used by older call sites.
export function isSupabaseConfigured() {
  return isConfigured();
}
