"use client";

import { useState } from "react";
import type { CoachProposal, ProposalStatus } from "@/lib/domain/types";
import { Button, IconChevronRight, ListRow, Sheet, named } from "@/components/ui";
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
      <ul className="border-b border-rule">
        {proposals.map((p) => (
          <li key={p.id} className="border-t border-rule">
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 active:underline [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{p.title}</span>
                  <span className="block text-small">{`${STATUS_LABEL[p.status]} ${timeAgo(happenedAt(p), nowIso)}, from ${sourceLabel(p.source)}`}</span>
                </span>
                <IconChevronRight size={20} className="shrink-0 transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-4 pb-4">
                <p className="whitespace-pre-wrap text-why">{p.rationale}</p>
                <div>
                  <DiffView
                    blocks={describeChanges(p.changes, ctx, MODE[p.status], p.inverse_changes)}
                    label={p.status === "applied" ? `Changes made by ${p.title}` : `Changes proposed in ${p.title}`}
                  />
                  {p.status === "applied" && p.inverse_changes ? (
                    <ul>
                      <li>
                        <ListRow
                          title="Undo this change"
                          trailing={undoing === p.id ? "Undoing" : undefined}
                          chevron
                          disabled={!online || undoing !== null}
                          onClick={() => setConfirming(p)}
                        />
                      </li>
                    </ul>
                  ) : null}
                </div>
                {p.status === "applied" && p.inverse_changes && !online ? (
                  <p className="text-why">You are offline. Undoing changes your program on the server, so it needs a connection.</p>
                ) : null}
                {p.decision_note ? <p className="text-small">{`Your note: ${p.decision_note}`}</p> : null}
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
          <div className="flex items-stretch">
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
        <div className="flex flex-col gap-3">
          <p className="text-name">{confirming ? named(confirming.title) : null}</p>
          <p className="text-why">
            The exercises it touched go back to the values they had before, even if your training moved them since. Your logged
            workouts are not affected.
          </p>
        </div>
      </Sheet>
    </>
  );
}
