"use client";

import { useState } from "react";
import type { CoachProposal, ProposalStatus } from "@/lib/domain/types";
import { Button, IconChevronRight, Sheet } from "@/components/ui";
import { describeChanges, type DiffContext, type DiffMode } from "./diff";
import { DiffView } from "./diff-view";
import { timeAgo } from "./format";
import { sourceLabel } from "./proposal-card";

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Waiting",
  approved: "Approved, not applied yet",
  applied: "Applied",
  rejected: "Rejected",
  undone: "Undone",
};

const MODE: Record<ProposalStatus, DiffMode> = {
  pending: "pending",
  approved: "record",
  applied: "applied",
  rejected: "record",
  undone: "record",
};

function happenedAt(p: CoachProposal): string {
  if (p.status === "undone") return p.undone_at ?? p.updated_at;
  if (p.status === "applied") return p.applied_at ?? p.updated_at;
  return p.decided_at ?? p.updated_at;
}

export interface HistoryListProps {
  proposals: CoachProposal[];
  ctx: DiffContext;
  online: boolean;
  nowIso: string;
  /** Id of the proposal being undone right now. */
  undoing: string | null;
  onUndo: (id: string) => void;
}

export function HistoryList({ proposals, ctx, online, nowIso, undoing, onUndo }: HistoryListProps) {
  const [confirming, setConfirming] = useState<CoachProposal | null>(null);

  return (
    <>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {proposals.map((p) => (
          <li key={p.id} className="border-b border-line last:border-b-0">
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 active:bg-raised [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-ink">{p.title}</span>
                  <span className="block text-[15px] text-ink-dim">{`${STATUS_LABEL[p.status]} ${timeAgo(happenedAt(p), nowIso)}, from ${sourceLabel(p.source)}`}</span>
                </span>
                <IconChevronRight size={20} className="shrink-0 text-ink-faint transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-4 px-4 pb-4">
                <p className="whitespace-pre-wrap text-[15px] text-ink">{p.rationale}</p>
                <DiffView
                  blocks={describeChanges(p.changes, ctx, MODE[p.status], p.inverse_changes)}
                  label={p.status === "applied" ? `Changes made by ${p.title}` : `Changes proposed in ${p.title}`}
                />
                {p.decision_note ? <p className="text-[15px] text-ink-dim">{`Your note: ${p.decision_note}`}</p> : null}
                {p.status === "applied" && p.inverse_changes ? (
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" disabled={!online || undoing !== null} loading={undoing === p.id} onClick={() => setConfirming(p)}>
                      Undo this change
                    </Button>
                    {!online ? <p className="text-[15px] text-ink-dim">You are offline. Undoing changes your program on the server, so it needs a connection.</p> : null}
                  </div>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Undo this change?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                if (confirming) onUndo(confirming.id);
                setConfirming(null);
              }}
            >
              Undo
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-[17px] text-ink-dim">
          <p className="font-medium text-ink">{confirming?.title}</p>
          <p>
            The exercises it touched go back to the values they had before, even if your training moved them since. Your logged
            workouts are not affected.
          </p>
        </div>
      </Sheet>
    </>
  );
}
