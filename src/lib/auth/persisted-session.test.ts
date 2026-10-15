import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { readPersistedSession, restoreSession } from "./persisted-session";
import { describeAuthError } from "./errors";

const store = (value: string | null) => ({ getItem: () => value });

describe("readPersistedSession", () => {
  const session = {
    access_token: "a",
    refresh_token: "r",
    expires_at: 1,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "a@b.co" },
  };

  it("returns the stored session even when its access token has expired", () => {
    expect(readPersistedSession(store(JSON.stringify(session)))?.user.id).toBe(session.user.id);
  });

  it("returns null for nothing, junk, or a partial session", () => {
    expect(readPersistedSession(store(null))).toBeNull();
    expect(readPersistedSession(store("{not json"))).toBeNull();
    expect(readPersistedSession(store(JSON.stringify({ access_token: "a" })))).toBeNull();
  });

  it("returns null when storage throws", () => {
    expect(
      readPersistedSession({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
  });
});

describe("restoreSession", () => {
  const stored = {
    access_token: "a",
    refresh_token: "r",
    expires_at: 1,
    user: { id: "11111111-1111-4111-8111-111111111111" },
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("signs in from the stored session while supabase-js is still retrying its refresh offline", async () => {
    const committed: (Session | null)[] = [];
    restoreSession({
      getSession: () => new Promise(() => {}),
      storage: store(JSON.stringify(stored)),
      commit: async (s) => void committed.push(s),
      cancelled: () => false,
    });
    await tick();
    expect(committed.map((s) => s?.user.id)).toEqual([stored.user.id]);
  });

  it("then takes whatever supabase-js settles on", async () => {
    const committed: (Session | null)[] = [];
    const fresh = { ...stored, access_token: "fresh" } as unknown as Session;
    restoreSession({
      getSession: async () => ({ data: { session: fresh } }),
      storage: store(JSON.stringify(stored)),
      commit: async (s) => void committed.push(s),
      cancelled: () => false,
    });
    await tick();
    expect(committed.map((s) => s?.access_token)).toEqual(["a", "fresh"]);
  });

  it("waits for supabase-js when nothing is stored", async () => {
    const committed: (Session | null)[] = [];
    restoreSession({
      getSession: async () => ({ data: { session: null } }),
      storage: store(null),
      commit: async (s) => void committed.push(s),
      cancelled: () => false,
    });
    await tick();
    expect(committed).toEqual([null]);
  });
});

describe("describeAuthError", () => {
  it("explains the common failures in plain words", () => {
    expect(describeAuthError({ message: "Invalid login credentials", code: "invalid_credentials" })).toBe(
      "That email and password do not match.",
    );
    expect(describeAuthError({ message: "Email not confirmed", code: "email_not_confirmed" })).toMatch(
      /confirm your email/i,
    );
    expect(describeAuthError({ message: "x", code: "user_already_exists" })).toMatch(/already exists/i);
    expect(describeAuthError({ message: "Failed to fetch", name: "AuthRetryableFetchError" })).toMatch(/offline/i);
    expect(describeAuthError({ message: "Something odd" })).toBe("Something odd");
  });
});
