import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Fixed so the persisted session can be read back without the client
// (see lib/auth/persisted-session.ts) when the access token expired offline.
export const AUTH_STORAGE_KEY = "forge-coach-auth";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (typeof window === "undefined") {
    throw new Error("The Supabase client is only available in the browser.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are not set.");
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in happens inside the installed app with a password, never from a URL.
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
  return client;
}
