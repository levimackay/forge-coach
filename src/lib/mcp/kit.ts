import type { CallToolResult, McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { createUserClient } from "./client";
import type { McpEnv } from "./env";

/** An error whose message is safe and useful to show to the MCP client. */
export class ToolError extends Error {}

export interface ToolOutput {
  /** One or two plain sentences saying what the data is. */
  summary: string;
  data: Record<string, unknown>;
}

export interface ToolContext {
  db: SupabaseClient;
  userId: string;
}

// The JSON is sent twice (text block for older clients, structuredContent), and clients drop results above
// roughly 150k characters, so each copy stays well below half of that.
const MAX_DATA_CHARS = 60_000;

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// Analytics floats such as an e1RM of 74.66666666 are noise to a coach; two decimals keeps every real load exact.
const round2 = (_key: string, value: unknown) =>
  typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 100) / 100 : value;

export function toResult({ summary, data }: ToolOutput): CallToolResult {
  const json = JSON.stringify(data, round2);
  if (json.length > MAX_DATA_CHARS) {
    return errorResult("The result is too large to return. Ask for a smaller limit, a shorter window or specific ids.");
  }
  return {
    content: [{ type: "text", text: `${summary}\n${json}` }],
    structuredContent: JSON.parse(json) as Record<string, unknown>,
  };
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };

export interface ToolSpec<S extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
}

export function defineTool<S extends z.ZodObject>(
  server: McpServer,
  env: McpEnv,
  spec: ToolSpec<S>,
  run: (args: z.infer<S>, tc: ToolContext) => Promise<ToolOutput>,
): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema as StandardSchemaWithJSON,
      annotations: { title: spec.title, ...spec.annotations },
    },
    async (args: unknown, ctx) => {
      const auth = ctx.http?.authInfo;
      if (!auth?.token) return errorResult("Not signed in. Reconnect the FORGE connector in Claude.");
      const userId = typeof auth.extra?.userId === "string" ? auth.extra.userId : "";
      try {
        const db = createUserClient(env, auth.token);
        return toResult(await run(args as z.infer<S>, { db, userId }));
      } catch (error) {
        if (error instanceof ToolError) return errorResult(error.message);
        // Only the tool name and error class are logged: messages can carry the athlete's own text.
        console.error(`[mcp] ${spec.name} failed`, error instanceof Error ? error.name : typeof error);
        return errorResult("Something went wrong reading FORGE data. Try again in a moment.");
      }
    },
  );
}

export interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

async function settle<T>(query: PromiseLike<QueryResult<T>>, what: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    // PGRST301 is PostgREST rejecting the JWT: the OAuth session behind the token is gone.
    if (error.code === "PGRST301" || /jwt/i.test(error.message)) {
      throw new ToolError("The FORGE session behind this connector has expired. Reconnect the connector in Claude.");
    }
    throw new ToolError(`Could not read ${what} from FORGE.`);
  }
  return data;
}

/** Await a list query; a database error becomes a ToolError. */
export async function loadAll<T>(query: PromiseLike<QueryResult<T[]>>, what: string): Promise<T[]> {
  return (await settle(query, what)) ?? [];
}

/** Await a maybeSingle() query. */
export function loadOne<T>(query: PromiseLike<QueryResult<T>>, what: string): Promise<T | null> {
  return settle(query, what);
}
