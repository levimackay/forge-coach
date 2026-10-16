import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as mcpRoute from "@/app/api/mcp/route";
import * as prmRoot from "@/app/.well-known/oauth-protected-resource/route";
import * as prmPath from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import {
  ISSUER,
  ORIGIN,
  RESOURCE_URL,
  TEST_ENV,
  createSigner,
  setEnv,
  signHs256,
  stubNetwork,
  type Signer,
} from "./testkit";

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/server", () => ({ connection }));

const METADATA_URL = `${ORIGIN}/.well-known/oauth-protected-resource`;

let signer: Signer;

beforeAll(async () => {
  signer = await createSigner();
});

beforeEach(() => {
  setEnv();
  stubNetwork(signer.jwks);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const post = (headers: Record<string, string> = {}) =>
  new Request(RESOURCE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

function expectChallenge(response: Response) {
  expect(response.status).toBe(401);
  const challenge = response.headers.get("www-authenticate") ?? "";
  expect(challenge).toMatch(/^Bearer /);
  expect(challenge).toContain(`resource_metadata="${METADATA_URL}"`);
  // No custom scopes anywhere: Supabase rejects them and the client would loop on step-up.
  expect(challenge).not.toContain("scope=");
}

describe("/api/mcp authentication", () => {
  it("answers 401 with the resource_metadata challenge when there is no token", async () => {
    expectChallenge(await mcpRoute.POST(post()));
  });

  it.each([
    ["garbage", "Bearer not-a-token"],
    ["wrong scheme", "Basic dXNlcjpwYXNz"],
    ["empty bearer", "Bearer "],
  ])("answers 401 with the challenge for a bad token (%s)", async (_name, authorization) => {
    expectChallenge(await mcpRoute.POST(post({ authorization })));
  });

  it("answers 401 for an HS256 token and for a token without client_id", async () => {
    expectChallenge(await mcpRoute.POST(post({ authorization: `Bearer ${await signHs256({})}` })));
    const sessionToken = await signer.sign({ client_id: undefined });
    expectChallenge(await mcpRoute.POST(post({ authorization: `Bearer ${sessionToken}` })));
  });

  it("answers 401 for an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const token = await signer.sign({ exp: past, iat: past - 3600 });
    expectChallenge(await mcpRoute.POST(post({ authorization: `Bearer ${token}` })));
  });

  it("challenges every exported method, not only POST", async () => {
    for (const handler of [mcpRoute.GET, mcpRoute.DELETE, mcpRoute.OPTIONS]) {
      expectChallenge(await handler(new Request(RESOURCE_URL, { method: "GET" })));
    }
  });

  it("never echoes the presented token", async () => {
    const response = await mcpRoute.POST(post({ authorization: "Bearer super-secret-looking-value" }));
    const everything = JSON.stringify([...response.headers]) + (await response.text());
    expect(everything).not.toContain("super-secret-looking-value");
  });

  it("fails closed with 503 when required env is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEnv({ ...TEST_ENV, MCP_RESOURCE_URL: undefined });
    const token = await signer.sign();
    const response = await mcpRoute.POST(post({ authorization: `Bearer ${token}` }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "server_misconfigured" });
  });

  it("fails closed when the resource URL has a trailing slash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEnv({ ...TEST_ENV, MCP_RESOURCE_URL: `${RESOURCE_URL}/` });
    expect((await mcpRoute.POST(post())).status).toBe(503);
  });
});

describe("protected resource metadata", () => {
  const expected = { resource: RESOURCE_URL, authorization_servers: [ISSUER] };

  it.each([
    ["/.well-known/oauth-protected-resource", prmRoot],
    ["/.well-known/oauth-protected-resource/api/mcp", prmPath],
  ])("%s returns the exact document", async (path, route) => {
    const response = await route.GET(new Request(`${ORIGIN}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toStrictEqual(expected);
  });

  it("does not depend on the host the request arrived on", async () => {
    const response = await prmRoot.GET(new Request("https://preview-abc.vercel.app/.well-known/oauth-protected-resource"));
    expect(await response.json()).toStrictEqual(expected);
  });

  it("advertises no scopes", async () => {
    const body = await (await prmRoot.GET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`))).json();
    expect(body).not.toHaveProperty("scopes_supported");
  });

  it("answers CORS preflight", () => {
    for (const route of [prmRoot, prmPath]) {
      const response = route.OPTIONS();
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("fails closed without env", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEnv({ ...TEST_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined });
    const response = await prmRoot.GET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`));
    expect(response.status).toBe(503);
  });

  it("waits for a real request before reading env, which keeps the GET routes out of build-time prerendering", async () => {
    connection.mockClear();
    await prmRoot.GET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`));
    await prmPath.GET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`));
    await mcpRoute.GET(new Request(RESOURCE_URL));
    expect(connection).toHaveBeenCalledTimes(3);
  });
});
