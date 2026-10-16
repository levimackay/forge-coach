"use client";

import { useId, useState } from "react";
import type { CoachProposal } from "@/lib/domain/types";
import { Button, Sheet, named } from "@/components/ui";
import { changeLines, type DiffBlock } from "./diff";
import { plainReason } from "@/components/train/format";
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
  /** Which action is running for this proposal, if any. */
  busy: ProposalAction | null;
  anyBusy: boolean;
  onDecide: (action: ProposalAction) => void;
}

export function sourceLabel(source: CoachProposal["source"]): string {
  return source === "claude" ? "Claude" : "You";
}

interface Caution {
  title: string;
  detail?: string;
}

/** Things worth knowing before approving. They live behind Why?, and the screen only points at them. */
export function cautions(
  proposal: Pick<CoachProposal, "base_program_version">,
  blocks: readonly DiffBlock[],
  programVersion: number | null,
  programActive: boolean,
): Caution[] {
  const out: Caution[] = [];
  if (programVersion === null) {
    out.push({
      title: "This program is not on this device",
      detail: "The suggestion was written for a program that has not synced here. Connect and sync before you decide.",
    });
  } else if (!programActive) {
    out.push({
      title: "This program is no longer active",
      detail: "The suggestion was written for a program you have since replaced. Approving changes that older program only.",
    });
  } else if (programVersion !== proposal.base_program_version) {
    out.push({
      title: "Your program changed since this was suggested",
      detail: `It was written against version ${proposal.base_program_version} and your program is now at version ${programVersion}. Check that each change still makes sense.`,
    });
  }
  for (const block of blocks) if (block.warning) out.push({ title: block.title, detail: block.warning });
  return out;
}

/** Screen readers hear "3 changes to 4 sets" where the eye sees an arrow. */
function Line({ text }: { text: string }) {
  return (
    <span className="block">
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{text.replace(" → ", " changes to ")}</span>
    </span>
  );
}

export function ProposalCard({ proposal, blocks, programVersion, programActive, online, nowIso, busy, anyBusy, onDecide }: ProposalCardProps) {
  const titleId = useId();
  const offlineId = useId();
  const [why, setWhy] = useState(false);
  const disabled = !online || anyBusy;
  const warnings = cautions(proposal, blocks, programVersion, programActive);

  return (
    <article aria-labelledby={titleId} className="flex flex-col pb-20">
      <h2 id={titleId} className="text-[36px] leading-10 tracking-[-0.3px]">
        {named(proposal.title)}
      </h2>

      <ul aria-label={`Changes in ${proposal.title}`} className="mt-8 border-y border-rule">
        {blocks.map((block) => (
          <li key={block.key} className="flex min-h-14 items-baseline justify-between gap-4 border-t border-rule py-3.5 first:border-t-0">
            <h3 className="min-w-0 break-words text-name">{named(block.title)}</h3>
            <p className="shrink-0 text-right text-control font-light">
              {changeLines(block).map((line) => (
                <Line key={line} text={line} />
              ))}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" className="-ml-2" onClick={() => setWhy(true)}>
          Why?
        </Button>
        <Button
          variant="ghost"
          className="-mr-2"
          loading={busy === "reject"}
          disabled={disabled}
          aria-describedby={!online ? offlineId : undefined}
          onClick={() => onDecide("reject")}
        >
          Not now
        </Button>
      </div>

      {warnings.length > 0 ? <p className="mt-4 font-medium">Check Why? before you approve.</p> : null}
      {!online ? (
        <p id={offlineId} className="mt-4 text-small">
          You are offline. Connect to decide.
        </p>
      ) : null}

      <Button
        variant="primary"
        pinned="tabs"
        loading={busy === "approve"}
        disabled={disabled}
        aria-describedby={!online ? offlineId : undefined}
        onClick={() => onDecide("approve")}
      >
        Approve
      </Button>

      <Sheet open={why} onClose={() => setWhy(false)} title="Why this change">
        <div className="flex flex-col gap-4">
          <p className="text-small">{`From ${sourceLabel(proposal.source)}, ${timeAgo(proposal.created_at, nowIso)}`}</p>
          {warnings.map((w) => (
            <Notice key={w.title} title={w.title}>
              {w.detail}
            </Notice>
          ))}
          <p className="whitespace-pre-wrap text-why">{plainReason(proposal.rationale)}</p>
        </div>
      </Sheet>
    </article>
  );
}
