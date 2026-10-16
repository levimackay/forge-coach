import type { Session } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY } from "@/lib/supabase/client";

/**
 * supabase-js returns no session when the access token has expired and the
 * refresh request cannot reach the network, even though it keeps the session
 * in storage. Reading that stored copy is what lets the app open offline.
 */
export function readPersistedSession(
  storage: Pick<Storage, "getItem">,
  key: string = AUTH_STORAGE_KEY,
): Session | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (
      parsed &&
      typeof parsed.access_token === "string" &&
      typeof parsed.refresh_token === "string" &&
      typeof parsed.user?.id === "string"
    ) {
      return parsed as Session;
    }
  } catch {
    // unreadable or blocked storage means there is no session to restore
  }
  return null;
}

/**
 * Opens the app on the session stored on this device straight away, then lets supabase-js correct it
 * (a refresh lands as TOKEN_REFRESHED, a revoked session as SIGNED_OUT, both through `commit`). Waiting
 * on getSession instead would hold an offline cold start on the splash screen: when the access token
 * has expired, supabase-js start-up retries the refresh for about 25 seconds before it answers.
 */
export function restoreSession(input: {
  getSession: () => Promise<{ data: { session: Session | null } }>;
  storage: Pick<Storage, "getItem">;
  commit: (session: Session | null) => Promise<unknown>;
  cancelled: () => boolean;
}): void {
  const stored = readPersistedSession(input.storage);
  if (stored) void input.commit(stored);
  void (async () => {
    const { data } = await input.getSession();
    if (input.cancelled()) return;
    // Offline with an expired access token supabase-js answers null: keep the stored session, sync resumes later.
    await input.commit(data.session ?? readPersistedSession(input.storage));
  })();
}
