"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityLog } from "@/components/coach/activity-log";
import { ConnectPanel } from "@/components/coach/connect-panel";
import { describeChanges } from "@/components/coach/diff";
import { HistoryList } from "@/components/coach/history-list";
import { ProposalCard, type ProposalAction } from "@/components/coach/proposal-card";
import { ReportsPanel } from "@/components/coach/reports-panel";
import { useCoachContext } from "@/components/coach/use-diff-context";
import { useNowIso, useOnline } from "@/components/coach/use-now";
import { ScreenBar } from "@/components/shell/screen-bar";
import { Button, ListGroup, ListRow, Sheet, Skeleton, named, useToast } from "@/components/ui";
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
type Panel = "more" | "history" | "reports" | "connect";

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
  const [panel, setPanel] = useState<Panel | null>(null);

  // A proposal made while the app was already open has not been pulled yet.
  useEffect(() => {
    void syncNow();
  }, []);

  // Newest first. One suggestion at a time: deciding on it brings up the next.
  const { current, history } = useMemo(() => {
    const all = proposals ?? [];
    return { current: all.find((p) => p.status === "pending"), history: all.filter((p) => p.status !== "pending") };
  }, [proposals]);

  const run = async (id: string, action: ProposalAction | "undo") => {
    setRunning({ id, action });
    try {
      if (action === "approve") {
        await approveProposal(id);
        toast("Approved. The changes are in your program.");
      } else if (action === "reject") {
        await rejectProposal(id);
        toast("Not now. Your program is unchanged.");
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
  const program = !loading && current ? context.programs.get(current.program_id) : undefined;
  // A sheet that is closing reports it a moment late, so it must not close the one that replaced it.
  const close = (which: Panel) => () => setPanel((now) => (now === which ? null : now));

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">Coach</h1>
      <ScreenBar
        end={
          current ? (
            <Button variant="ghost" size="sm" className="-mr-2" onClick={() => setPanel("more")}>
              More
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col pt-5">
        {loading ? (
          <div aria-busy="true">
            <Skeleton rows={4} />
          </div>
        ) : current ? (
          <ProposalCard
            key={current.id}
            proposal={current}
            blocks={describeChanges(current.changes, context.diff, "pending")}
            programVersion={program?.version ?? null}
            programActive={Boolean(program?.is_active && !program.deleted_at)}
            online={online}
            nowIso={nowIso}
            busy={running?.id === current.id && running.action !== "undo" ? running.action : null}
            anyBusy={running !== null}
            onDecide={(action) => void run(current.id, action)}
          />
        ) : (
          <>
            <p className="text-head">No suggestions right now.</p>
            <ul className="-ml-2 mt-6 flex flex-col items-start">
              <li>
                <Button variant="ghost" onClick={() => setPanel("history")}>
                  Past suggestions
                </Button>
              </li>
              <li>
                <Button variant="ghost" onClick={() => setPanel("reports")}>
                  Reports
                </Button>
              </li>
              <li>
                <Button variant="ghost" onClick={() => setPanel("connect")}>
                  Connect Claude
                </Button>
              </li>
            </ul>
          </>
        )}
      </div>

      <Sheet open={panel === "more"} onClose={close("more")} title="More">
        <ListGroup label="Coach" className="border-t border-rule">
          <ListRow title="Past suggestions" chevron onClick={() => setPanel("history")} />
          <ListRow title="Reports" chevron onClick={() => setPanel("reports")} />
          <ListRow title="Connect Claude" chevron onClick={() => setPanel("connect")} />
        </ListGroup>
      </Sheet>

      <Sheet open={panel === "history"} onClose={close("history")} title="Past suggestions">
        {context ? (
          <div className="flex flex-col gap-8">
            {history.length > 0 ? (
              <HistoryList
                proposals={history}
                ctx={context.diff}
                online={online}
                nowIso={nowIso}
                undoing={running?.action === "undo" ? running.id : null}
                onUndo={(id) => void run(id, "undo")}
              />
            ) : (
              <p>Nothing yet.</p>
            )}
            {audit && audit.length > 0 ? (
              <section aria-labelledby="activity-title" className="flex flex-col gap-3">
                <h3 id="activity-title" className="text-name">
                  {named("Activity")}
                </h3>
                <ActivityLog entries={audit} timeZone={profile?.timezone ?? "UTC"} />
              </section>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={panel === "reports"} onClose={close("reports")} title="Reports">
        {profile ? <ReportsPanel unit={profile.unit} /> : <p>Finish setup to build reports.</p>}
      </Sheet>

      <Sheet open={panel === "connect"} onClose={close("connect")} title="Connect Claude">
        <ConnectPanel />
      </Sheet>
    </div>
  );
}
