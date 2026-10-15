"use client";

import { useState } from "react";
import type { AuditEntry } from "@/lib/domain/types";
import { Button } from "@/components/ui";
import { dateTimeText, sentence } from "./format";

const ACTOR: Record<AuditEntry["actor"], string> = {
  user: "You",
  claude: "Claude",
  engine: "Progression rules",
  system: "System",
};

const TEXT: Record<string, (actor: string) => string> = {
  proposal_created: (actor) => `${actor} proposed a change`,
  proposal_approved: () => "You approved a change",
  proposal_rejected: () => "You rejected a change",
  proposal_applied: () => "A change was applied to your program",
  proposal_undone: () => "You undid a change",
  export_my_data: () => "You exported your data",
  delete_my_data: () => "You deleted all your data",
};

export function describeAudit(entry: Pick<AuditEntry, "actor" | "action" | "details">): { text: string; extra: string | null } {
  const actor = ACTOR[entry.actor] ?? sentence(entry.actor);
  // The database writes proposal_created; older and sample rows spell it proposal.created.
  const action = entry.action.replace(/\./g, "_");
  const text = TEXT[action]?.(actor) ?? `${actor}: ${sentence(action).toLowerCase()}`;
  const d = entry.details;
  const title = typeof d.title === "string" ? d.title : null;
  const version = typeof d.program_version === "number" ? `program version ${d.program_version}` : null;
  const note = typeof d.note === "string" && d.note.trim() ? `note: ${d.note}` : null;
  const extra = [title, version, note].filter(Boolean).join(", ");
  return { text, extra: extra || null };
}

const FIRST_PAGE = 8;

export function ActivityLog({ entries, timeZone }: { entries: AuditEntry[]; timeZone: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, FIRST_PAGE);

  return (
    <div className="flex flex-col gap-3">
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((entry) => {
          const { text, extra } = describeAudit(entry);
          return (
            <li key={entry.id} className="flex flex-col gap-0.5 border-b border-line px-4 py-3 last:border-b-0">
              <p className="text-[15px] text-ink">{text}</p>
              {extra ? <p className="text-[15px] text-ink-dim">{extra}</p> : null}
              <p className="text-[13px] text-ink-faint">{dateTimeText(entry.at, timeZone)}</p>
            </li>
          );
        })}
      </ul>
      {!all && entries.length > FIRST_PAGE ? (
        <Button variant="secondary" onClick={() => setAll(true)}>
          {`Show ${entries.length - FIRST_PAGE} more`}
        </Button>
      ) : null}
    </div>
  );
}
