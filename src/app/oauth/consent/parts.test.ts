import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OAuthConsentPage from "./page";
import { ConsentCard, SignInCard, type ConsentDetails } from "./parts";

const details: ConsentDetails = {
  authorizationId: "auth-123456",
  clientName: "Claude",
  clientId: "client-1",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  redirectHost: "claude.ai",
  trustedHost: true,
  scope: "openid email",
  email: "levi@example.com",
};

const card = (over: Partial<ConsentDetails> = {}, busy: "approve" | "deny" | null = null, error: string | null = null) =>
  renderToStaticMarkup(createElement(ConsentCard, { details: { ...details, ...over }, busy, error, onDecide: () => {} }));

describe("consent card", () => {
  it("says plainly what Claude can and cannot do", () => {
    const html = card();
    expect(html).toContain("Connect Claude to FORGE");
    expect(html).toContain("Signed in as levi@example.com");
    expect(html).toContain("Read your program, workouts, sets, recovery logs");
    expect(html).toContain("Suggest changes to your program");
    expect(html).toContain("Change your program until you approve a suggestion in the Coach tab");
    expect(html).toContain("Log, edit or delete your workouts");
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Deny<");
    expect(html).toContain("you go back to claude.ai");
  });

  it("warns when the redirect is not claude.ai", () => {
    const html = card({ redirectHost: "evil.example", trustedHost: false });
    expect(html).toContain("not claude.ai");
    expect(html).toContain("evil.example");
    expect(html).not.toContain("you go back to");
  });

  it("escapes anything the client registered", () => {
    const html = card({ clientName: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("disables both buttons while a choice is in flight and shows errors", () => {
    const html = card({}, "approve", "That did not go through.");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Approving…");
    expect(html).toContain('role="alert"');
  });

  it("keeps the redirect and scope in a technical details section", () => {
    const html = card();
    expect(html).toContain("<details");
    expect(html).toContain("https://claude.ai/api/mcp/auth_callback");
    expect(html).toContain("openid email");
  });

  it("uses no em or en dashes in copy", () => {
    expect(card()).not.toMatch(/[–—]/);
  });
});

describe("sign in card", () => {
  const html = renderToStaticMarkup(createElement(SignInCard, { busy: false, error: "That email and password did not match.", onSubmit: () => {} }));

  it("has labelled, phone friendly fields", () => {
    expect(html).toContain("Email");
    // HTML attribute names are case insensitive; React emits the camel cased form.
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Sign in");
    expect(html).toContain("That email and password did not match.");
  });
});

describe("consent page", () => {
  it("renders a neutral first frame on the server", () => {
    const html = renderToStaticMarkup(createElement(OAuthConsentPage));
    expect(html).toContain("Checking your request");
    expect(html).not.toContain("<form");
  });
});
