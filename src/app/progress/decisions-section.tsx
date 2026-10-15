"use client";

import { useMemo, useState } from "react";
import { decisionDigest } from "@/lib/analytics";
import { ACTION_LABEL, dateText } from "@/components/coach/format";
import type { DiffContext } from "@/components/coach/diff";
import { DiffRows } from "@/components/coach/diff-view";
import { Section } from "@/components/coach/section";
import { Button, Skeleton } from "@/components/ui";
import { useExerciseLibrary, useProgressionDecisions } from "@/lib/local";
import { decisionChangeRows } from "./derive";
import type { Athlete } from "./use-progress-data";

const FIRST_PAGE = 6;
const FETCH_LIMIT = 40;

export function DecisionsSection({ athlete }: { athlete: Athlete }) {
  const decisions = useProgressionDecisions(FETCH_LIMIT);
  const library = useExerciseLibrary();
  const [all, setAll] = useState(false);

  const digest = useMemo(
    () =>
      decisions && library
        ? decisionDigest({ decisions, exercises: library, timeZone: athlete.timeZone, limit: FETCH_LIMIT })
        : null,
    [decisions, library, athlete.timeZone],
  );

  const ctx = useMemo<DiffContext | null>(
    () =>
      library
        ? { planned: new Map(), days: new Map(), equipment: new Map(), exercises: new Map(library.map((e) => [e.id, e])), unit: athlete.unit }
        : null,
    [library, athlete.unit],
  );

  let body;
  if (!digest || !ctx) body = <Skeleton className="h-40 w-full" />;
  else if (digest.items.length === 0) {
    body = (
      <p className="rounded-card border border-line bg-surface p-4 text-[17px] text-ink-dim">
        No decisions yet. After you finish a workout, FORGE checks every exercise you did and records what it will ask of you
        next time, with the reason.
      </p>
    );
  } else {
    const items = all ? digest.items : digest.items.slice(0, FIRST_PAGE);
    body = (
      <div className="flex flex-col gap-3">
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {items.map((item, i) => {
            const rows = decisionChangeRows(item, ctx);
            return (
              <li key={`${item.decided_at}-${item.exercise_id}-${i}`} className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[17px] font-medium text-ink">{item.exercise}</span>
                  <span className="shrink-0 text-[15px] text-ink-faint">{dateText(item.decided_at, athlete.nowIso, athlete.timeZone)}</span>
                </div>
                <p className="text-[15px] font-medium text-ink-dim">{ACTION_LABEL[item.action]}</p>
                <p className="text-[15px] text-ink">{item.reason}</p>
                {rows.length > 0 ? (
                  <div className="mt-1 border-t border-line pt-2">
                    <DiffRows rows={rows} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!all && digest.items.length > FIRST_PAGE ? (
          <Button variant="secondary" onClick={() => setAll(true)}>
            {`Show ${digest.items.length - FIRST_PAGE} more`}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Section title="Recent decisions" description="What the progression rules chose for your next session, and why. The same log always gives the same answer.">
      {body}
    </Section>
  );
}
