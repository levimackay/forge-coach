export interface McpEnv {
  /** Supabase project URL without a trailing slash. */
  supabaseUrl: string;
  publishableKey: string;
  /** Exact URL entered when adding the connector, e.g. https://host/api/mcp */
  resourceUrl: string;
  /** Origin of resourceUrl. */
  origin: string;
  /** OAuth issuer, `${supabaseUrl}/auth/v1`. */
  issuer: string;
  /** When set, only tokens issued to this OAuth client are accepted. */
  oauthClientId?: string;
}

export type McpEnvResult = { ok: true; env: McpEnv } | { ok: false; problems: string[] };

type Source = Record<string, string | undefined>;

// Read at request time, never at import time: `next build` imports route modules without the runtime env.
export function readMcpEnv(source: Source = process.env): McpEnvResult {
  const problems: string[] = [];
  const supabaseUrl = source.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const resourceUrl = source.MCP_RESOURCE_URL?.trim();
  const oauthClientId = source.MCP_OAUTH_CLIENT_ID?.trim() || undefined;

  if (!supabaseUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!publishableKey) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");

  let origin = "";
  if (!resourceUrl) {
    problems.push("MCP_RESOURCE_URL is not set");
  } else {
    // The protected resource metadata must echo this value exactly, so a trailing slash, query or fragment
    // would make it differ from the URL the connector was added with.
    try {
      const parsed = new URL(resourceUrl);
      origin = parsed.origin;
      if (resourceUrl.endsWith("/") || parsed.search || parsed.hash) {
        problems.push("MCP_RESOURCE_URL must have no trailing slash, query or fragment");
      }
    } catch {
      problems.push("MCP_RESOURCE_URL is not a valid URL");
    }
  }

  if (problems.length > 0 || !supabaseUrl || !publishableKey || !resourceUrl) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    env: { supabaseUrl, publishableKey, resourceUrl, origin, issuer: `${supabaseUrl}/auth/v1`, oauthClientId },
  };
}
