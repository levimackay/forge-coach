import { metadataCorsOptionsRequestHandler, protectedResourceHandler, withMcpAuth } from "mcp-handler";
import { connection } from "next/server";
import { createTokenVerifier } from "./auth";
import { readMcpEnv } from "./env";
import { createForgeMcpHandler } from "./server";

function misconfigured(problems: string[]): Response {
  // Names the missing settings in the server log only; callers just see a closed door.
  console.error(`[mcp] not configured: ${problems.join("; ")}`);
  return Response.json({ error: "server_misconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

/** The /api/mcp route: Streamable HTTP MCP behind OAuth bearer verification. Fails closed without env. */
export async function handleMcp(req: Request): Promise<Response> {
  // Without this, Next prerenders a GET handler at build time, and a build without env would freeze the 503 below.
  await connection();
  const result = readMcpEnv();
  if (!result.ok) return misconfigured(result.problems);
  const { env } = result;
  // withMcpAuth builds its resource_metadata link as `${resourceUrl}/.well-known/oauth-protected-resource`,
  // so it takes the origin, while the metadata document itself carries the full MCP URL.
  return withMcpAuth(createForgeMcpHandler(env), createTokenVerifier(env), {
    required: true,
    resourceUrl: env.origin,
  })(req);
}

/** RFC 9728 protected resource metadata for both well-known paths. */
export async function handleProtectedResource(req: Request): Promise<Response> {
  // Keeps this GET out of build-time prerendering, so the env is read per request.
  await connection();
  const result = readMcpEnv();
  if (!result.ok) return misconfigured(result.problems);
  const { env } = result;
  return protectedResourceHandler({ authServerUrls: [env.issuer], resourceUrl: env.resourceUrl })(req);
}

export const handleMetadataPreflight = metadataCorsOptionsRequestHandler();
