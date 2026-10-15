"use client";

import { useId, useState } from "react";
import type { CoachProposal } from "@/lib/domain/types";
import { Button, Field } from "@/components/ui";
import type { DiffBlock } from "./diff";
import { DiffView } from "./diff-view";
import { timeAgo } from "./format";
import { Notice } from "./notice";

export type ProposalAction = "approve" | "reject";

export interface ProposalCardProps {
  proposal: CoachProposal;
  blocks: DiffBlock[];
  /** Current version of the program this was proposed for; null when that program is not on this device. */
  programVersion: number | null;
  programActive: boolean;
  online: boolean;
  nowIso: string;
  /** Which action is running for this proposal, if any. Every card's buttons wait while one runs. */
  busy: ProposalAction | null;
  anyBusy: boolean;
  onDecide: (action: ProposalAction, note: string) => void;
}

export function sourceLabel(source: CoachProposal["source"]): string {
  return source === "claude" ? "Claude" : "You";
}

export function ProposalCard({ proposal, blocks, programVersion, programActive, online, nowIso, busy, anyBusy, onDecide }: ProposalCardProps) {
  const titleId = useId();
  const offlineId = useId();
  const [note, setNote] = useState("");
  const disabled = !online || anyBusy;

  const stale = programVersion !== null && programVersion !== proposal.base_program_version;

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <header className="flex flex-col gap-1">
        <h3 id={titleId} className="title">
          {proposal.title}
        </h3>
        <p className="text-[15px] text-ink-dim">{`From ${sourceLabel(proposal.source)}, ${timeAgo(proposal.created_at, nowIso)}`}</p>
      </header>

      {programVersion === null ? (
        <Notice title="This program is not on this device">
          The proposal was written for a program that has not synced here. Connect and sync before you decide.
        </Notice>
      ) : !programActive ? (
        <Notice title="This program is no longer active">
          The proposal was written for a program you have since replaced. Approving changes that older program only.
        </Notice>
      ) : stale ? (
        <Notice title="Your program changed since this was proposed">
          {`It was written against version ${proposal.base_program_version} and your program is now at version ${programVersion}. Check that each change below still makes sense.`}
        </Notice>
      ) : null}

      <p className="whitespace-pre-wrap text-[17px] text-ink">{proposal.rationale}</p>

      <DiffView blocks={blocks} label={`Changes in ${proposal.title}`} />

      <Field
        label="Note (optional)"
        hint="Saved with your decision."
        multiline
        rows={2}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            loading={busy === "approve"}
            disabled={disabled}
            aria-describedby={!online ? offlineId : undefined}
            onClick={() => onDecide("approve", note.trim())}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            loading={busy === "reject"}
            disabled={disabled}
            aria-describedby={!online ? offlineId : undefined}
            onClick={() => onDecide("reject", note.trim())}
          >
            Reject
          </Button>
        </div>
        {!online ? (
          <p id={offlineId} className="text-[15px] text-ink-dim">
            You are offline. Approving or rejecting changes your program on the server, so it needs a connection.
          </p>
        ) : (
          <p className="text-[15px] text-ink-faint">Approving applies these changes to your program right away. You can undo them afterwards.</p>
        )}
      </div>
    </article>
  );
}
