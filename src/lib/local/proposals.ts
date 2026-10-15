import type { CoachProposal } from "@/lib/domain/types";
import { getSupabase } from "@/lib/supabase/client";
import { devFixtureActive } from "./session";
import { applyPulled, syncNow } from "./sync";

/** Thrown when an action needs the server and the device cannot reach it. */
export class NetworkRequiredError extends Error {
  constructor(message = "You are offline. Connect to the internet to do this.") {
    super(message);
    this.name = "NetworkRequiredError";
  }
}

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
  status: number;
}

export async function callRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  if (devFixtureActive()) throw new NetworkRequiredError("Sync is off while the development fixture is loaded.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new NetworkRequiredError();
  let result: RpcResult;
  try {
    result = (await getSupabase().rpc(name, args)) as unknown as RpcResult;
  } catch {
    throw new NetworkRequiredError();
  }
  if (result.error) {
    if (result.status === 0) throw new NetworkRequiredError();
    throw new Error(result.error.message);
  }
  return result.data;
}

async function decide(rpc: string, args: Record<string, unknown>): Promise<CoachProposal | null> {
  // Push local edits first so the server applies the change to current data.
  await syncNow();
  const data = await callRpc(rpc, args);
  const row = (Array.isArray(data) ? data[0] : data) as CoachProposal | null | undefined;
  if (row && typeof row === "object" && "id" in row) {
    await applyPulled("coach_proposals", [row as unknown as Record<string, unknown>]);
  }
  // Approving or undoing rewrites program rows on the server; bring them down.
  await syncNow();
  return row ?? null;
}

export function approveProposal(id: string, note?: string): Promise<CoachProposal | null> {
  return decide("approve_proposal", { p_id: id, p_note: note ?? null });
}

export function rejectProposal(id: string, note?: string): Promise<CoachProposal | null> {
  return decide("reject_proposal", { p_id: id, p_note: note ?? null });
}

export function undoProposal(id: string): Promise<CoachProposal | null> {
  return decide("undo_proposal", { p_id: id });
}
