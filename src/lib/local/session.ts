let activeUserId: string | null = null;

/** Set by AuthProvider; every local write is stamped with this user. */
export function setActiveUserId(id: string | null): void {
  activeUserId = id;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export function requireUserId(): string {
  if (!activeUserId) throw new Error("Not signed in.");
  return activeUserId;
}

const DEV_FIXTURE_KEY = "forge-dev-fixture";

export const DEV_FIXTURE_USER_ID = "00000000-0000-4000-8000-00000000f0f0";

/**
 * Development-only switch that swaps the signed-in user for a local fixture
 * user and turns network sync off. The NODE_ENV guard is replaced with a
 * literal at build time, so in production this is `return false` and the rest
 * is removed.
 */
export function devFixtureActive(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEV_FIXTURE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevFixtureActive(on: boolean): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    if (on) window.localStorage.setItem(DEV_FIXTURE_KEY, "1");
    else window.localStorage.removeItem(DEV_FIXTURE_KEY);
  } catch {
    // storage unavailable: the fixture simply stays off
  }
}
