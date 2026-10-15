import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpEnv } from "./env";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Asymmetric algorithms only. getClaims falls back to a network call to the Auth server for HS* tokens.
const ASYMMETRIC_ALGS = new Set(["ES256", "RS256"]);

type Jwks = NonNullable<NonNullable<Parameters<SupabaseClient["auth"]["getClaims"]>[1]>["jwks"]>;

// getClaims also calls the Auth server when the key id is not in the key set, and it keeps no record of
// misses. So the key set is held here, and a key id it does not list triggers at most one refetch per
// cooldown. Unauthenticated callers can then make no more than one outbound request every few minutes,
// and a rotated-in key is picked up within the cooldown.
const KEY_SET_TTL_MS = 10 * 60_000;
const UNKNOWN_KID_REFETCH_MS = 5 * 60_000;

let keySet: { url: string; jwks: Jwks; fetchedAt: number } | null = null;

/** Test hook. */
export function resetKeySetForTests(): void {
  keySet = null;
}

async function keysFor(env: McpEnv, kid: string): Promise<Jwks | null> {
  const now = Date.now();
  const url = `${env.issuer}/.well-known/jwks.json`;
  const cached = keySet?.url === url ? keySet : null;
  const known = cached?.jwks.keys.some((k) => k.kid === kid) ?? false;
  const age = cached ? now - cached.fetchedAt : Number.POSITIVE_INFINITY;
  if (cached && known && age < KEY_SET_TTL_MS) return cached.jwks;
  if (!known && age < UNKNOWN_KID_REFETCH_MS) return null;

  const res = await fetch(url, { headers: { apikey: env.publishableKey } });
  if (!res.ok) return null;
  const body = (await res.json()) as { keys?: unknown };
  if (!Array.isArray(body.keys)) return null;
  const jwks = { keys: body.keys } as Jwks;
  keySet = { url, jwks, fetchedAt: now };
  return jwks.keys.some((k) => k.kid === kid) ? jwks : null;
}

function decodeHeader(token: string): { alg?: unknown; kid?: unknown } | null {
  const [encoded, , signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  try {
    const header: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return header && typeof header === "object" ? header : null;
  } catch {
    return null;
  }
}

/**
 * Builds the verifyToken callback for withMcpAuth. getClaims checks the signature against the project's JWKS
 * and the expiry; everything else (issuer, role, audience, client) is checked here. Every failure, including
 * unexpected exceptions, resolves to undefined so withMcpAuth answers 401 and the token is never logged.
 */
export function createTokenVerifier(env: McpEnv) {
  return async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
    try {
      if (!bearerToken) return undefined;

      const header = decodeHeader(bearerToken);
      if (!header || typeof header.alg !== "string" || !ASYMMETRIC_ALGS.has(header.alg)) return undefined;
      if (typeof header.kid !== "string" || header.kid === "") return undefined;

      const jwks = await keysFor(env, header.kid);
      if (!jwks) return undefined;

      // A fresh client per call keeps no session state. With the key set passed in, getClaims makes no request.
      const supabase = createClient(env.supabaseUrl, env.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.auth.getClaims(bearerToken, { jwks });
      if (error || !data) return undefined;

      const claims = data.claims as Record<string, unknown>;
      const { iss, aud, role, sub, exp } = claims;
      const clientId = claims.client_id;

      if (iss !== env.issuer) return undefined;
      if (role !== "authenticated") return undefined;
      if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) return undefined;
      if (typeof sub !== "string" || !UUID.test(sub)) return undefined;
      if (typeof exp !== "number" || exp * 1000 <= Date.now()) return undefined;
      // Tokens without client_id are the app's own sessions. Only tokens issued through the OAuth server may use MCP.
      if (typeof clientId !== "string" || clientId === "") return undefined;
      if (env.oauthClientId && clientId !== env.oauthClientId) return undefined;

      return {
        token: bearerToken,
        clientId,
        scopes: [],
        expiresAt: exp,
        extra: { userId: sub },
      };
    } catch {
      return undefined;
    }
  };
}
