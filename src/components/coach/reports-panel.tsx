"use client";

import { useState } from "react";
import type { Unit } from "@/lib/domain/types";
import type { Report, ReportKind } from "@/lib/reports";
import { buildCoachPrompt } from "@/lib/reports";
import { Button, ListGroup, ListRow, useToast } from "@/components/ui";
import { useWorkouts } from "@/lib/local";
import { copyText, reportFilename, saveTextFile } from "./browser-actions";
import { generateReport } from "./report-data";
import { Panel } from "./section";

const KINDS: { kind: ReportKind; title: string; detail: string }[] = [
  { kind: "session", title: "Last session", detail: "Latest workout vs the one before" },
  { kind: "week", title: "Last 7 days", detail: "Sessions, volume and recovery" },
  { kind: "month", title: "Last 4 weeks", detail: "The same, with four week trends" },
];

type State =
  | { phase: "idle" }
  | { phase: "working"; kind: ReportKind }
  | { phase: "ready"; kind: ReportKind; report: Report }
  | { phase: "error"; kind: ReportKind; message: string };

export function ReportsPanel({ unit }: { unit: Unit }) {
  const { toast } = useToast();
  const [state, setState] = useState<State>({ phase: "idle" });
  const finished = useWorkouts({ status: "completed", limit: 1 });
  const hasSession = finished !== undefined && finished.length > 0;

  const run = async (kind: ReportKind) => {
    setState({ phase: "working", kind });
    try {
      setState({ phase: "ready", kind, report: await generateReport(kind, unit) });
    } catch (err) {
      setState({ phase: "error", kind, message: err instanceof Error ? err.message : "Could not build the report." });
    }
  };

  const copy = async (text: string, what: string) => {
    toast((await copyText(text)) ? `${what} copied.` : "Could not copy. Select the text and copy it by hand.");
  };

  return (
    <div className="flex flex-col gap-4">
      <ListGroup label="Report type">
        {KINDS.map(({ kind, title, detail }) => (
          <ListRow
            key={kind}
            title={title}
            subtitle={kind === "session" && finished !== undefined && !hasSession ? "Finish a workout first." : detail}
            trailing={state.phase === "working" && state.kind === kind ? "Building" : state.phase === "ready" && state.kind === kind ? "Ready" : undefined}
            chevron
            disabled={(kind === "session" && !hasSession) || state.phase === "working"}
            onClick={() => void run(kind)}
          />
        ))}
      </ListGroup>

      {state.phase === "error" ? (
        <p role="alert" className="text-[15px] text-danger">
          {state.message}
        </p>
      ) : null}

      {state.phase === "ready" ? (
        <Panel className="flex flex-col gap-4">
          <h3 className="title">{state.report.title}</h3>
          {state.report.json.missing.length > 0 ? (
            <p className="text-[15px] text-ink-dim">{`Not in this report: ${state.report.json.missing.join("; ")}.`}</p>
          ) : null}
          <pre
            tabIndex={0}
            aria-label="Report text"
            className="max-h-72 overflow-auto whitespace-pre-wrap rounded-control border border-line bg-raised p-3 text-[14px] leading-snug text-ink"
          >
            {state.report.markdown}
          </pre>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="primary" onClick={() => void copy(state.report.markdown, "Report")}>
              Copy report
            </Button>
            <Button variant="secondary" onClick={() => void copy(buildCoachPrompt(state.report), "Prompt")}>
              Copy prompt for Claude
            </Button>
            <Button variant="secondary" onClick={() => void saveTextFile(reportFilename(state.report, "md"), state.report.markdown, "text/markdown")}>
              Download .md
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveTextFile(reportFilename(state.report, "json"), `${JSON.stringify(state.report.json, null, 2)}\n`, "application/json")}
            >
              Download .json
            </Button>
          </div>
          <p className="text-[15px] text-ink-faint">
            The prompt wraps this report with instructions for a hypertrophy coach. Paste it into any Claude chat. Nothing is sent from
            here.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
