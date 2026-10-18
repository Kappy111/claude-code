// Thin Base44 REST client for Snapfolder.
//
// We call Base44's HTTP API directly (no SDK bundle) so it works inside an
// MV3 extension, which can't load remote code. Extension pages/service workers
// with host access to base44.app can fetch cross-origin without CORS trouble.
//
// Endpoints (relative to {serverUrl}/api):
//   POST /apps/{appId}/auth/login       {email,password} -> {access_token,user}
//   POST /apps/{appId}/auth/register    {email,password}
//   GET  /apps/{appId}/entities/User/me (Bearer)         -> user
//   GET/POST/PUT/DELETE /apps/{appId}/entities/{Entity}[/id]

import { CONFIG } from "./config.js";

const { appId, serverUrl } = CONFIG.base44;
const API = `${serverUrl}/api`;

function headers(token) {
  const h = {
    "Content-Type": "application/json",
    "X-App-Id": appId,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: headers(token),
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      "Couldn't reach the server. Check your connection and try again."
    );
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.detail || data.error)) ||
      `Request failed (${res.status})`;
    const error = new Error(msg);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/* --------------------------------- Auth --------------------------------- */

export async function login(email, password) {
  // -> { access_token, user }
  return request("POST", `/apps/${appId}/auth/login`, {
    body: { email, password },
  });
}

export async function register(email, password) {
  return request("POST", `/apps/${appId}/auth/register`, {
    body: { email, password },
  });
}

export async function me(token) {
  // -> current User entity
  return request("GET", `/apps/${appId}/entities/User/me`, { token });
}

/* ------------------------------- Entities ------------------------------- */
// Wired for the upcoming folder/screenshot sync.

export async function listEntities(entity, token) {
  return request("GET", `/apps/${appId}/entities/${entity}`, { token });
}

export async function createEntity(entity, data, token) {
  return request("POST", `/apps/${appId}/entities/${entity}`, {
    token,
    body: data,
  });
}

export async function updateEntity(entity, id, data, token) {
  return request("PUT", `/apps/${appId}/entities/${entity}/${id}`, {
    token,
    body: data,
  });
}

export async function deleteEntity(entity, id, token) {
  return request("DELETE", `/apps/${appId}/entities/${entity}/${id}`, {
    token,
  });
}
