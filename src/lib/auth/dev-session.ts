import type { Session } from "@supabase/supabase-js";
import { DEV_FIXTURE_USER_ID } from "@/lib/local/session";

// Development only: loaded through a dynamic import behind a NODE_ENV check,
// so it is not part of any production bundle.
export function devFixtureSession(): Session {
  const now = new Date().toISOString();
  return {
    access_token: "dev-fixture",
    refresh_token: "dev-fixture",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: DEV_FIXTURE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@forge.local",
      app_metadata: {},
      user_metadata: {},
      created_at: now,
    },
  };
}
