"use client";

import { useMemo, useState } from "react";
import { decisionDigest } from "@/lib/analytics";
import { ACTION_LABEL, dateText } from "@/components/coach/format";
import type { DiffContext } from "@/components/coach/diff";
import { DiffRows } from "@/components/coach/diff-view";
import { Section } from "@/components/coach/section";
import { Button, Skeleton, named } from "@/components/ui";
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
  if (!digest || !ctx) body = <Skeleton rows={3} />;
  else if (digest.items.length === 0) {
    body = (
      <p>
        No decisions yet. After you finish a workout, FORGE checks every exercise you did and records what it will ask of you
        next time, with the reason.
      </p>
    );
  } else {
    const items = all ? digest.items : digest.items.slice(0, FIRST_PAGE);
    body = (
      <>
        <ul className="border-b border-rule">
          {items.map((item, i) => {
            const rows = decisionChangeRows(item, ctx);
            return (
              <li key={`${item.decided_at}-${item.exercise_id}-${i}`} className="flex flex-col gap-1 border-t border-rule py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 break-words text-name">{named(item.exercise)}</h3>
                  <span className="shrink-0 text-small">{dateText(item.decided_at, athlete.nowIso, athlete.timeZone)}</span>
                </div>
                <p>{ACTION_LABEL[item.action]}</p>
                <p className="text-why">{item.reason}</p>
                {rows.length > 0 ? (
                  <div className="mt-1">
                    <DiffRows rows={rows} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!all && digest.items.length > FIRST_PAGE ? (
          <Button variant="secondary" className="-ml-4 self-start" onClick={() => setAll(true)}>
            {`Show ${digest.items.length - FIRST_PAGE} more`}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Section title="Recent decisions" description="What the progression rules chose for your next session, and why. The same log always gives the same answer.">
      {body}
    </Section>
  );
}
