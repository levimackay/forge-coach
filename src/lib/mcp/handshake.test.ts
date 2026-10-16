import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as mcpRoute from "@/app/api/mcp/route";
import { createSigner, restCalls, rpc, setEnv, stubNetwork, type Json, type Signer } from "./testkit";

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/server", () => ({ connection }));

const READ_TOOLS = [
  "get_athlete_profile",
  "get_training_plan",
  "get_recent_workouts",
  "get_workout_details",
  "get_exercise_performance",
  "compare_sessions",
  "get_weekly_progress",
  "get_recovery_history",
  "get_progression_decisions",
  "search_exercises",
  "list_proposals",
];
const WRITE_TOOLS = ["propose_program_change", "apply_approved_change"];

let signer: Signer;
let token: string;
let calls: ReturnType<typeof stubNetwork>;

beforeAll(async () => {
  signer = await createSigner();
});

beforeEach(async () => {
  setEnv();
  calls = stubNetwork(signer.jwks);
  token = await signer.sign();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const initialize = () =>
  rpc(mcpRoute.POST, token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test-client", version: "0.1.0" },
  });

describe("MCP handshake over Streamable HTTP (2025-06-18)", () => {
  it("initializes and advertises tools", async () => {
    const { response, message } = await initialize();
    expect(response.status).toBe(200);
    expect(message?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "forge-coach" },
      capabilities: { tools: {} },
    });
    expect(message?.result.instructions).toContain("approves it in the FORGE app");
  });

  it("accepts the initialized notification", async () => {
    await initialize();
    const { response } = await rpc(mcpRoute.POST, token, "notifications/initialized", {}, { notification: true });
    expect(response.status).toBe(202);
  });

  it("lists every tool with a title, description, object schema and annotations", async () => {
    await initialize();
    const { message } = await rpc(mcpRoute.POST, token, "tools/list");
    const tools: Json[] = message?.result.tools;

    expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
    for (const tool of tools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.inputSchema, tool.name).toMatchObject({ type: "object" });
      expect(tool.annotations, tool.name).toMatchObject({ title: tool.title, openWorldHint: false });
      expect(typeof tool.annotations.readOnlyHint, tool.name).toBe("boolean");
    }
  });

  it("marks reads read-only and the two write tools as writes", async () => {
    const { message } = await rpc(mcpRoute.POST, token, "tools/list");
    const byName = new Map<string, Json>(message?.result.tools.map((t: Json) => [t.name, t]));

    for (const name of READ_TOOLS) expect(byName.get(name)?.annotations.readOnlyHint, name).toBe(true);

    expect(byName.get("propose_program_change")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(byName.get("apply_approved_change")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it("tells the caller it cannot approve and that approval happens in the app", async () => {
    const { message } = await rpc(mcpRoute.POST, token, "tools/list");
    const byName = new Map<string, Json>(message?.result.tools.map((t: Json) => [t.name, t]));
    for (const name of WRITE_TOOLS) {
      const text: string = byName.get(name)?.description;
      expect(text, name).toContain("cannot approve");
      expect(text, name).toContain("FORGE app");
    }
  });

  it("describes the proposal operations with the same shapes the app understands", async () => {
    const { message } = await rpc(mcpRoute.POST, token, "tools/list");
    const propose = message?.result.tools.find((t: Json) => t.name === "propose_program_change");
    const ops = propose.inputSchema.properties.changes.items.oneOf.map((o: Json) => o.properties.op.const);
    expect(ops).toEqual(["update_prescription", "swap_exercise", "add_exercise", "remove_exercise", "update_day"]);
    expect(propose.inputSchema.properties.changes).toMatchObject({ minItems: 1, maxItems: 30 });
    expect(propose.inputSchema.required).toEqual(expect.arrayContaining(["title", "rationale", "changes"]));
  });

  it("does not touch the database while handshaking", async () => {
    await initialize();
    await rpc(mcpRoute.POST, token, "tools/list");
    expect(restCalls(calls)).toHaveLength(0);
  });

  it("answers a GET stream request and a DELETE with 405 once authenticated, since there are no sessions", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await mcpRoute[method as "GET" | "DELETE"](
        new Request("https://forge.example.com/api/mcp", {
          method,
          headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
        }),
      );
      expect(response.status, method).toBe(405);
    }
  });

  it("rejects an unknown tool with a JSON-RPC error", async () => {
    const { message } = await rpc(mcpRoute.POST, token, "tools/call", { name: "delete_everything", arguments: {} });
    expect(message?.error).toMatchObject({ code: -32602 });
  });
});
