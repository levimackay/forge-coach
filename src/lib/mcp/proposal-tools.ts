import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CoachProposal, Program } from "@/lib/domain/types";
import type { McpEnv } from "./env";
import { READ_ONLY, ToolError, defineTool, loadAll, loadOne } from "./kit";
import { ProposalChangesSchema, ProposalStatusSchema } from "./schemas";

const guid = z.guid();

const PROPOSAL_COLUMNS =
  "id, created_at, source, program_id, base_program_version, title, rationale, changes, status, decided_at, applied_at, undone_at, decision_note";

type ProposalRow = Pick<
  CoachProposal,
  | "id"
  | "created_at"
  | "source"
  | "program_id"
  | "base_program_version"
  | "title"
  | "rationale"
  | "changes"
  | "status"
  | "decided_at"
  | "applied_at"
  | "undone_at"
  | "decision_note"
>;

/** Turn a Postgres error from the proposal insert or apply call into a message the caller can act on. */
function proposalError(error: { message: string; code?: string }): string {
  if (error.code === "PGRST301" || /jwt/i.test(error.message)) {
    return "The FORGE session behind this connector has expired. Reconnect the connector in Claude.";
  }
  if (error.code === "42501") return "FORGE refused this request: the connector is not allowed to do that.";
  // Validation failures are raised by FORGE's own database checks with a message written for the sender.
  return `FORGE rejected the request: ${error.message.slice(0, 300)}`;
}

export function registerProposalTools(server: McpServer, env: McpEnv): void {
  defineTool(
    server,
    env,
    {
      name: "propose_program_change",
      title: "Propose a program change",
      description:
        "Save a proposal to change the athlete's program: update sets, reps, RIR, load, rest or notes of an exercise, swap an exercise, add or remove an exercise, or edit a training day. This only SAVES the proposal as pending; it does not change the program, and you cannot approve it. The athlete reviews every proposal in the FORGE app (Coach tab) and approves or rejects it there. Get exact ids first from get_training_plan and search_exercises. Explain the reasoning in the rationale using the athlete's logged data. Maximum 30 changes per proposal.",
      inputSchema: z.object({
        title: z.string().trim().min(3).max(120).describe("Short headline shown in the athlete's review list"),
        rationale: z.string().trim().min(10).max(2000).describe("Why this change, in terms of the athlete's data"),
        changes: ProposalChangesSchema.describe("The operations to apply, in order"),
        program_id: guid.optional().describe("Program to change; defaults to the active program"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, rationale, changes, program_id }, { db }) => {
      const base = db.from("programs").select("*").is("deleted_at", null);
      const program = await loadOne<Program>(
        (program_id ? base.eq("id", program_id) : base.eq("is_active", true)).maybeSingle(),
        "the program",
      );
      if (!program) {
        throw new ToolError(
          program_id ? "No program with that id." : "The athlete has no active program yet, so there is nothing to change.",
        );
      }

      const { data, error } = await db
        .from("coach_proposals")
        .insert({ program_id: program.id, base_program_version: program.version, title, rationale, changes, status: "pending" })
        .select("id, title, status, created_at, program_id, base_program_version")
        .single();
      if (error) throw new ToolError(proposalError(error));

      return {
        summary: `Saved "${title}" as a pending proposal with ${changes.length} change${changes.length === 1 ? "" : "s"}. Nothing has changed yet: the athlete must approve it in the FORGE app (Coach tab).`,
        data: { proposal: data, applied: false, next_step: "The athlete reviews and approves or rejects it in the FORGE app." },
      };
    },
  );

  defineTool(
    server,
    env,
    {
      name: "list_proposals",
      title: "List proposals",
      description:
        "List program change proposals, newest first, with their status (pending, approved, rejected, applied, undone), the changes and any note the athlete left when deciding. Use it to see what is waiting for the athlete and what was decided before. Read-only.",
      inputSchema: z.object({
        status: ProposalStatusSchema.optional(),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      annotations: READ_ONLY,
    },
    async ({ status, limit }, { db }) => {
      let query = db.from("coach_proposals").select(PROPOSAL_COLUMNS);
      if (status) query = query.eq("status", status);
      const rows = await loadAll<ProposalRow>(query.order("created_at", { ascending: false }).limit(limit), "proposals");
      return {
        summary: `${rows.length} proposal${rows.length === 1 ? "" : "s"}${status ? ` with status ${status}` : ""}, newest first.`,
        data: { proposals: rows },
      };
    },
  );

  defineTool(
    server,
    env,
    {
      name: "apply_approved_change",
      title: "Apply an approved change",
      description:
        "Ask FORGE to apply a proposal whose status is 'approved'. You cannot approve proposals: the athlete does that in the FORGE app (Coach tab), and approval normally applies the change straight away, so call this only when list_proposals shows status 'approved'. A pending, rejected or undone proposal is refused. Applying a proposal that is already applied does nothing.",
      inputSchema: z.object({ proposal_id: guid.describe("Proposal id from list_proposals") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ proposal_id }, { db }) => {
      const fetchRow = () =>
        loadOne<ProposalRow>(db.from("coach_proposals").select(PROPOSAL_COLUMNS).eq("id", proposal_id).maybeSingle(), "the proposal");

      const proposal = await fetchRow();
      if (!proposal) throw new ToolError("No proposal with that id.");
      if (proposal.status === "applied") {
        return { summary: `"${proposal.title}" was already applied.`, data: { proposal, applied: true } };
      }
      if (proposal.status !== "approved") {
        const why =
          proposal.status === "pending"
            ? "It is still waiting for the athlete. They approve it in the FORGE app (Coach tab); ask them to review it."
            : `It was ${proposal.status} and can no longer be applied. Propose a new change instead.`;
        throw new ToolError(`"${proposal.title}" is ${proposal.status}, not approved. ${why}`);
      }

      const { error } = await db.rpc("apply_proposal", { p_id: proposal_id });
      if (error) throw new ToolError(proposalError(error));

      const after = await fetchRow();
      return {
        summary: `Applied "${proposal.title}".`,
        data: { proposal: after ?? proposal, applied: after?.status === "applied" },
      };
    },
  );
}
