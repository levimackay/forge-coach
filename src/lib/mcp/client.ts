import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { McpEnv } from "./env";

/**
 * Supabase client that sends the caller's own access token, so every query runs under that user's row level
 * security. Only the publishable key is ever used here; there is no privileged key in this app.
 */
export function createUserClient(env: McpEnv, token: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false },
    db: { timeout: 25_000 },
  });
}
