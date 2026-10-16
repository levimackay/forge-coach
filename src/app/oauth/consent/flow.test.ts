import { describe, expect, it, vi } from "vitest";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { oncePerKey, readAuthorizationId, safeDestination, toDetails } from "./flow";

describe("readAuthorizationId", () => {
  it("reads a normal id", () => {
    expect(readAuthorizationId("?authorization_id=3f2a9c1e-7b64-4d2a-9a0e-5d1c2b3a4f55")).toBe("3f2a9c1e-7b64-4d2a-9a0e-5d1c2b3a4f55");
    expect(readAuthorizationId("?foo=1&authorization_id=AbC123_-xyzXYZ")).toBe("AbC123_-xyzXYZ");
  });

  it.each([
    ["missing", ""],
    ["empty", "?authorization_id="],
    ["too short", "?authorization_id=abc"],
    ["a path traversal", "?authorization_id=../../user"],
    ["a slash", "?authorization_id=abcdefgh/consent"],
    ["a query smuggled in", "?authorization_id=abcdefgh%3Fx%3D1"],
    ["a space", "?authorization_id=abcdefgh%20ijk"],
    ["too long", `?authorization_id=${"a".repeat(201)}`],
  ])("refuses %s", (_name, search) => {
    expect(readAuthorizationId(search)).toBeNull();
  });
});

describe("safeDestination", () => {
  it("allows https and loopback http", () => {
    expect(safeDestination("https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz")).toBe(
      "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz",
    );
    expect(safeDestination("http://localhost:54321/callback?code=abc")).toBe("http://localhost:54321/callback?code=abc");
    expect(safeDestination("http://127.0.0.1:8080/callback")).toBe("http://127.0.0.1:8080/callback");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://evil.example/callback",
    "http://localhost.evil.example/callback",
    "ftp://claude.ai/",
    "//claude.ai/callback",
    "/relative",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(safeDestination(url)).toBeNull();
  });
});

describe("toDetails", () => {
  const base: OAuthAuthorizationDetails = {
    authorization_id: "auth-123456",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    client: { id: "client-1", name: "  Claude  ", uri: "https://claude.ai", logo_uri: "" },
    user: { id: "user-1", email: "levi@example.com" },
    scope: "openid email offline_access",
  };

  it("maps the Auth server response and trusts claude.ai", () => {
    expect(toDetails(base)).toEqual({
      authorizationId: "auth-123456",
      clientName: "Claude",
      clientId: "client-1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      redirectHost: "claude.ai",
      trustedHost: true,
      scope: "openid email offline_access",
      email: "levi@example.com",
    });
  });

  it("does not trust other hosts, including look-alikes", () => {
    expect(toDetails({ ...base, redirect_uri: "https://claude.ai.evil.example/cb" })?.trustedHost).toBe(false);
    expect(toDetails({ ...base, redirect_uri: "http://localhost:3000/callback" })?.trustedHost).toBe(false);
  });

  it("names an unnamed client and survives a broken redirect address", () => {
    expect(toDetails({ ...base, client: { ...base.client, name: "" } })?.clientName).toBe("An app");
    expect(toDetails({ ...base, redirect_uri: "nonsense" })).toBeNull();
  });
});

describe("oncePerKey", () => {
  it("runs the lookup once per key however many callers ask", async () => {
    const run = vi.fn(async () => "details");
    const once = oncePerKey<string>();
    const results = await Promise.all([once("a", run), once("a", run), once("a", run)]);
    expect(results).toEqual(["details", "details", "details"]);
    await once("a", run);
    expect(run).toHaveBeenCalledTimes(1);
    await once("b", run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
