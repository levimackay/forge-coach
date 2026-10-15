import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import type { ConsentDetails } from "./parts";

// supabase-js puts the id straight into an Auth server URL path, so anything outside this alphabet is refused.
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,200}$/;

export function readAuthorizationId(search: string): string | null {
  const id = new URLSearchParams(search).get("authorization_id");
  return id && AUTHORIZATION_ID.test(id) ? id : null;
}

/** Only https, or http on this machine (a command line client's loopback callback), is a place to send the browser. */
export function safeDestination(url: string): string | null {
  try {
    const parsed = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function toDetails(data: OAuthAuthorizationDetails): ConsentDetails | null {
  try {
    const host = new URL(data.redirect_uri).host;
    return {
      authorizationId: data.authorization_id,
      clientName: data.client.name?.trim() || "An app",
      clientId: data.client.id,
      redirectUri: data.redirect_uri,
      redirectHost: host,
      trustedHost: host === "claude.ai",
      scope: data.scope,
      email: data.user.email,
    };
  } catch {
    return null;
  }
}

/**
 * Runs `run` once per key and hands every later caller the same promise. The Auth server refuses a second
 * lookup of the same authorization request, and React replays effects in development.
 */
export function oncePerKey<T>() {
  const started = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    let promise = started.get(key);
    if (!promise) {
      promise = run();
      started.set(key, promise);
    }
    return promise;
  };
}
