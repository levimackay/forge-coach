"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityLog } from "@/components/coach/activity-log";
import { ConnectPanel } from "@/components/coach/connect-panel";
import { describeChanges } from "@/components/coach/diff";
import { HistoryList } from "@/components/coach/history-list";
import { ProposalCard, type ProposalAction } from "@/components/coach/proposal-card";
import { ReportsPanel } from "@/components/coach/reports-panel";
import { Section } from "@/components/coach/section";
import { useCoachContext } from "@/components/coach/use-diff-context";
import { useNowIso, useOnline } from "@/components/coach/use-now";
import { ButtonLink, EmptyState, Skeleton, useToast } from "@/components/ui";
import {
  NetworkRequiredError,
  approveProposal,
  rejectProposal,
  syncNow,
  undoProposal,
  useAuditLog,
  useProfile,
  useProposals,
} from "@/lib/local";

type Running = { id: string; action: ProposalAction | "undo" } | null;

function failureText(err: unknown, verb: string): string {
  if (err instanceof NetworkRequiredError) return err.message;
  return `Could not ${verb}: ${err instanceof Error ? err.message : "unknown error"}`;
}

export function CoachScreen() {
  const proposals = useProposals();
  const audit = useAuditLog(40);
  const profile = useProfile();
  const context = useCoachContext();
  const online = useOnline();
  const nowIso = useNowIso();
  const { toast } = useToast();
  const [running, setRunning] = useState<Running>(null);

  // A proposal made while the app was already open has not been pulled yet.
  useEffect(() => {
    void syncNow();
  }, []);

  const { pending, history } = useMemo(() => {
    const all = proposals ?? [];
    return { pending: all.filter((p) => p.status === "pending"), history: all.filter((p) => p.status !== "pending") };
  }, [proposals]);

  const run = async (id: string, action: ProposalAction | "undo", note: string) => {
    setRunning({ id, action });
    try {
      if (action === "approve") {
        await approveProposal(id, note || undefined);
        toast("Approved. The changes are in your program.");
      } else if (action === "reject") {
        await rejectProposal(id, note || undefined);
        toast("Rejected. Your program is unchanged.");
      } else {
        await undoProposal(id);
        toast("Undone. Your program is back to how it was.");
      }
    } catch (err) {
      toast(failureText(err, action === "undo" ? "undo that" : `${action} that`), { tone: "error" });
      // The proposal may have been decided somewhere else; pull so the list is current.
      void syncNow();
    } finally {
      setRunning(null);
    }
  };

  const loading = proposals === undefined || context === undefined || profile === undefined;

  return (
    <div className="flex flex-col gap-10 py-4">
      <h1 className="title-large">Coach</h1>

      <Section
        title="Waiting for you"
        description="Program changes suggested by Claude or by you. Nothing changes until you approve it."
      >
        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-56 w-full" />
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            action={
              <ButtonLink href="#connect" variant="secondary">
                Connect Claude
              </ButtonLink>
            }
          >
            When Claude suggests a change to your program it shows up here with exactly what would change.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((p) => {
              const program = context.programs.get(p.program_id);
              return (
                <li key={p.id}>
                  <ProposalCard
                    proposal={p}
                    blocks={describeChanges(p.changes, context.diff, "pending")}
                    programVersion={program?.version ?? null}
                    programActive={Boolean(program?.is_active && !program.deleted_at)}
                    online={online}
                    nowIso={nowIso}
                    busy={running?.id === p.id && running.action !== "undo" ? running.action : null}
                    anyBusy={running !== null}
                    onDecide={(action, note) => void run(p.id, action, note)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {!loading && history.length > 0 ? (
        <Section title="History" description="Changes you approved, rejected or undid. Open one to see what it did.">
          <HistoryList
            proposals={history}
            ctx={context.diff}
            online={online}
            nowIso={nowIso}
            undoing={running?.action === "undo" ? running.id : null}
            onUndo={(id) => void run(id, "undo", "")}
          />
        </Section>
      ) : null}

      <Section
        title="Reports"
        description="A summary of your training you can read, save or hand to Claude. Built on this device from your log."
      >
        {profile ? (
          <ReportsPanel unit={profile.unit} />
        ) : (
          <p className="text-[17px] text-ink-dim">{profile === undefined ? "Loading." : "Finish setup to build reports."}</p>
        )}
      </Section>

      <Section title="Claude connection" anchor="connect" description="Let Claude read your training and suggest changes. You stay in charge of what is applied.">
        <ConnectPanel />
      </Section>

      <Section title="Activity" description="A record of who proposed, approved, applied and undid what.">
        {audit === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : audit.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-[17px] text-ink-dim">
            Nothing recorded yet. Proposals and the decisions you make about them are listed here.
          </p>
        ) : (
          <ActivityLog entries={audit} timeZone={profile?.timezone ?? "UTC"} />
        )}
      </Section>
    </div>
  );
}
