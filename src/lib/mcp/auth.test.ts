import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenVerifier, resetKeySetForTests } from "./auth";
import { readMcpEnv } from "./env";
import { CLIENT_ID, ISSUER, TEST_ENV, USER_ID, createSigner, signHs256, stubNetwork, type Signer } from "./testkit";

let signer: Signer;
let calls: ReturnType<typeof stubNetwork>;

function verifier(extra: Record<string, string> = {}) {
  const result = readMcpEnv({ ...TEST_ENV, ...extra });
  if (!result.ok) throw new Error(result.problems.join(", "));
  return createTokenVerifier(result.env);
}

const verify = (token?: string, extra?: Record<string, string>) =>
  verifier(extra)(new Request("https://forge.example.com/api/mcp"), token);

beforeAll(async () => {
  signer = await createSigner();
});

beforeEach(() => {
  resetKeySetForTests();
  calls = stubNetwork(signer.jwks);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyToken", () => {
  it("accepts an ES256 token from the project's OAuth server and exposes the user id", async () => {
    const token = await signer.sign();
    const info = await verify(token);
    expect(info).toMatchObject({ token, clientId: CLIENT_ID, scopes: [], extra: { userId: USER_ID } });
    expect(info?.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("rejects a missing token and malformed tokens without any network call", async () => {
    expect(await verify(undefined)).toBeUndefined();
    expect(await verify("")).toBeUndefined();
    expect(await verify("garbage")).toBeUndefined();
    expect(await verify("a.b")).toBeUndefined();
    expect(await verify("a.b.c")).toBeUndefined();
    expect(await verify("a.b.c.d")).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("rejects HS256 tokens locally instead of asking the Auth server", async () => {
    expect(await verify(await signHs256({}))).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("rejects a token signed by a different key that claims the same key id", async () => {
    const other = await createSigner(signer.kid);
    expect(await verify(await other.sign())).toBeUndefined();
  });

  it("rejects a token whose key id is not in the project's key set", async () => {
    const stranger = await createSigner("unknown-key");
    expect(await verify(await stranger.sign())).toBeUndefined();
  });

  it("lets unknown key ids cost at most one key set fetch per cooldown and never reach the Auth server", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const forged = (kid: string) =>
        `${Buffer.from(JSON.stringify({ alg: "ES256", kid })).toString("base64url")}.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString("base64url")}.c2ln`;
      for (let i = 0; i < 5; i++) expect(await verify(forged(`made-up-${i}`))).toBeUndefined();
      expect(calls.map((c) => c.url.pathname)).toEqual(["/auth/v1/.well-known/jwks.json"]);

      // A real key still verifies from the cached set without another request.
      expect(await verify(await signer.sign())).toBeDefined();
      expect(calls).toHaveLength(1);

      // After the cooldown a key rotated in since the last fetch is found.
      const rotated = await createSigner("rotated-key");
      calls = stubNetwork({ keys: [...signer.jwks.keys, ...rotated.jwks.keys] });
      expect(await verify(await rotated.sign())).toBeUndefined();
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
      expect(await verify(await rotated.sign())).toBeDefined();
      expect(calls.map((c) => c.url.pathname)).toEqual(["/auth/v1/.well-known/jwks.json"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a wrong issuer", async () => {
    expect(await verify(await signer.sign({ iss: "https://evil.supabase.co/auth/v1" }))).toBeUndefined();
    expect(await verify(await signer.sign({ iss: ISSUER + "/" }))).toBeUndefined();
  });

  it("rejects a token with no client_id, which is the app's own session", async () => {
    expect(await verify(await signer.sign({ client_id: undefined }))).toBeUndefined();
    expect(await verify(await signer.sign({ client_id: "" }))).toBeUndefined();
  });

  it("pins the OAuth client when MCP_OAUTH_CLIENT_ID is set", async () => {
    const extra = { MCP_OAUTH_CLIENT_ID: CLIENT_ID };
    expect(await verify(await signer.sign(), extra)).toBeDefined();
    expect(await verify(await signer.sign({ client_id: "11111111-1111-4111-8111-111111111111" }), extra)).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(await verify(await signer.sign({ exp: past, iat: past - 3600 }))).toBeUndefined();
  });

  it("rejects a token with no expiry", async () => {
    expect(await verify(await signer.sign({ exp: undefined }))).toBeUndefined();
  });

  it("rejects the wrong role, audience or subject", async () => {
    expect(await verify(await signer.sign({ role: "anon" }))).toBeUndefined();
    expect(await verify(await signer.sign({ aud: "someone-else" }))).toBeUndefined();
    expect(await verify(await signer.sign({ sub: "not-a-uuid" }))).toBeUndefined();
    expect(await verify(await signer.sign({ sub: undefined }))).toBeUndefined();
  });

  it("returns undefined instead of throwing when the key endpoint is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const stranger = await createSigner("fresh-key-after-outage");
    expect(await verify(await stranger.sign())).toBeUndefined();
  });
});
