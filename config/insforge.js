const { createClient } = require('@insforge/sdk');

const INSFORGE_BASE_URL = process.env.INSFORGE_URL || 'https://gcj3agx8.us-west.insforge.app';
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY || 'anon_fe9d1abcef3173c9e111eebe321163961260701c2425c7b6ffa509e80de3c86f';
const INSFORGE_API_KEY = process.env.INSFORGE_API_KEY || 'ik_a8ed83968d699a83aa3d6f3206b6e452';

if (!INSFORGE_BASE_URL || !INSFORGE_ANON_KEY) {
  throw new Error('Missing INSFORGE_URL or INSFORGE_ANON_KEY in environment');
}

// Public client (anon key) — for citizen-facing reads
const insforgePublic = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY,
});

// Admin client (API key as bearer) — for server-side writes and privileged reads
const insforgeAdmin = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_API_KEY,
});

// Direct HTTP helper for PostgREST-style operations
async function ifgFetch(path, options = {}) {
  const key = options.admin ? INSFORGE_API_KEY : INSFORGE_ANON_KEY;
  const res = await fetch(`${INSFORGE_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(msg || `InsForge error: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

module.exports = {
  insforgePublic,
  insforgeAdmin,
  ifgFetch,
  // Legacy aliases so existing route files that import supabaseAdmin / supabasePublic still work
  // while we progressively migrate each route
  supabaseAdmin: insforgeAdmin,
  supabasePublic: insforgePublic,
};
