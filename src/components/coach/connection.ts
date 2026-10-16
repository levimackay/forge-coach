import type { OAuthGrant } from "@supabase/supabase-js";

export interface Grant {
  clientId: string;
  name: string;
  grantedAt: string;
}

export function toGrants(grants: readonly OAuthGrant[]): Grant[] {
  return grants.map((g) => ({ clientId: g.client.id, name: g.client.name?.trim() || "An app", grantedAt: g.granted_at }));
}

/**
 * Claude is whichever grant belongs to the client registered for this connector. When this build does not
 * know that client id, every grant counts, because this account only has its own connector to grant.
 */
export function splitGrants(grants: readonly Grant[], claudeClientId: string | undefined): { claude: Grant[]; other: Grant[] } {
  if (!claudeClientId) return { claude: [...grants], other: [] };
  return {
    claude: grants.filter((g) => g.clientId === claudeClientId),
    other: grants.filter((g) => g.clientId !== claudeClientId),
  };
}

export type GrantLookup =
  | { kind: "ok"; grants: Grant[] }
  | { kind: "error"; message: string };
