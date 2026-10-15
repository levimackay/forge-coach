import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { vi } from "vitest";

export const SUPABASE_URL = "https://testref.supabase.co";
export const ISSUER = `${SUPABASE_URL}/auth/v1`;
export const RESOURCE_URL = "https://forge.example.com/api/mcp";
export const ORIGIN = "https://forge.example.com";
export const PUBLISHABLE_KEY = "sb_publishable_testkey";
export const USER_ID = "11111111-2222-4333-8444-555555555555";
export const CLIENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

export const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  MCP_RESOURCE_URL: RESOURCE_URL,
};

const ENV_KEYS = [...Object.keys(TEST_ENV), "MCP_OAUTH_CLIENT_ID"];

/** Set the env the MCP code reads; undefined values remove the variable. */
export function setEnv(values: Record<string, string | undefined> = TEST_ENV): void {
  for (const key of ENV_KEYS) vi.stubEnv(key, values[key]);
}

type Claims = Record<string, unknown>;

export interface Signer {
  jwks: { keys: Array<Record<string, unknown>> };
  kid: string;
  /** Mint an ES256 token. Claim overrides replace the defaults; `undefined` removes a claim. */
  sign(overrides?: Claims, header?: Claims): Promise<string>;
}

export async function createSigner(kid = "test-key-1"): Promise<Signer> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return {
    jwks: { keys: [jwk] },
    kid,
    async sign(overrides = {}, header = {}) {
      const now = Math.floor(Date.now() / 1000);
      const payload: Claims = {
        iss: ISSUER,
        aud: "authenticated",
        sub: USER_ID,
        role: "authenticated",
        client_id: CLIENT_ID,
        session_id: "99999999-8888-4777-8666-555555555555",
        iat: now,
        exp: now + 3600,
        ...overrides,
      };
      return new SignJWT(payload as never).setProtectedHeader({ alg: "ES256", kid, typ: "JWT", ...header } as never).sign(privateKey);
    },
  };
}

export async function signHs256(claims: Claims, secret = "not-the-real-secret-at-all-32bytes!!"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: ISSUER, aud: "authenticated", sub: USER_ID, role: "authenticated", client_id: CLIENT_ID, iat: now, exp: now + 3600, ...claims } as never)
    .setProtectedHeader({ alg: "HS256", kid: "legacy", typ: "JWT" })
    .sign(new TextEncoder().encode(secret));
}

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

export type Route = (call: RecordedCall) => Response | undefined;

/**
 * Replaces global fetch: serves the JWKS, answers other requests through `route`, and records every call.
 * Anything unrouted fails loudly so a test never reaches a real network.
 */
export function stubNetwork(jwks: Signer["jwks"], route: Route = () => undefined): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const call: RecordedCall = {
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    };
    calls.push(call);
    if (call.url.pathname === "/auth/v1/.well-known/jwks.json") return Response.json(jwks);
    return route(call) ?? Response.json({ message: `unrouted ${call.method} ${call.url.pathname}` }, { status: 500 });
  });
  return calls;
}

export const restCalls = (calls: RecordedCall[]) => calls.filter((c) => c.url.pathname.startsWith("/rest/v1/"));

let nextId = 1;

/** Send one JSON-RPC message to an MCP route handler and return the parsed response. */
export async function rpc(
  handler: (req: Request) => Promise<Response>,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  { notification = false }: { notification?: boolean } = {},
) {
  const body = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: nextId++, method, params };
  const response = await handler(
    new Request(RESOURCE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { response, message: parseMessage(text, response.headers.get("content-type") ?? "") };
}

// Parsed JSON-RPC and tool payloads are asserted on field by field in tests, so they are deliberately loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

function parseMessage(text: string, contentType: string): Json | null {
  if (!text) return null;
  if (!contentType.includes("text/event-stream")) return JSON.parse(text);
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return data.length ? JSON.parse(data[data.length - 1]) : null;
}

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

const decode = (value: string) => value.replace(/^"(.*)"$/, "$1");

function matches(row: Row, column: string, filter: string): boolean {
  const value = row[column];
  const dot = filter.indexOf(".");
  const op = filter.slice(0, dot);
  const arg = filter.slice(dot + 1);
  switch (op) {
    case "eq":
      return String(value) === arg;
    case "in":
      return arg.slice(1, -1).split(",").map(decode).includes(String(value));
    case "is":
      return arg === "null" ? value === null || value === undefined : String(value) === arg;
    case "gte":
      return value !== null && value !== undefined && String(value) >= arg;
    case "lte":
      return value !== null && value !== undefined && String(value) <= arg;
    case "ilike": {
      let pattern = "";
      for (let i = 0; i < arg.length; i++) {
        const c = arg[i];
        if (c === "\\" && i + 1 < arg.length) pattern += arg[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        else if (c === "%") pattern += ".*";
        else if (c === "_") pattern += ".";
        else pattern += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      return new RegExp(`^${pattern}$`, "i").test(String(value));
    }
    case "cd": {
      const allowed = arg.slice(1, -1).split(",");
      return Array.isArray(value) && value.every((v) => allowed.includes(String(v)));
    }
    default:
      throw new Error(`fake PostgREST does not support the ${op} operator`);
  }
}

function orderRows(rows: Row[], spec: string): Row[] {
  const keys = spec.split(",").map((part) => {
    const [column, direction = "asc", nulls] = part.split(".");
    return { column, desc: direction === "desc", nullsFirst: nulls === "nullsfirst" };
  });
  return [...rows].sort((a, b) => {
    for (const { column, desc, nullsFirst } of keys) {
      const x = a[column];
      const y = b[column];
      const xn = x === null || x === undefined;
      const yn = y === null || y === undefined;
      if (xn || yn) {
        if (xn && yn) continue;
        return (xn ? 1 : -1) * (nullsFirst ? -1 : 1);
      }
      if (x === y) continue;
      return ((x as number | string) < (y as number | string) ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

/** A small in-memory PostgREST: GET with filters, order, limit and offset over plain arrays. Writes go through `onWrite`. */
export function fakeRest(tables: Tables, onWrite: (call: RecordedCall) => Response | undefined = () => undefined): Route {
  return (call) => {
    if (call.url.pathname.startsWith("/rest/v1/rpc/")) return onWrite(call);
    const match = call.url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!match) return undefined;
    if (call.method !== "GET") return onWrite(call);
    const table = tables[match[1]];
    if (!table) return Response.json({ code: "42P01", message: `no table ${match[1]}` }, { status: 404 });

    let rows = table;
    for (const [column, filter] of call.url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(column)) continue;
      rows = rows.filter((row) => matches(row, column, filter));
    }
    const order = call.url.searchParams.get("order");
    if (order) rows = orderRows(rows, order);
    const offset = Number(call.url.searchParams.get("offset") ?? 0);
    const limit = call.url.searchParams.get("limit");
    rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
    return Response.json(rows);
  };
}
