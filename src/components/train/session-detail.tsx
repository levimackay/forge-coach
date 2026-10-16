"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronRight } from "@/components/ui/icons";
import { ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { sessionMinutes } from "@/lib/analytics";
import type { ProgressionDecision, Unit } from "@/lib/domain/types";
import { BottomBand, SectionTitle } from "./bits";
import { ACTION_LABEL, formatDate, formatDuration, formatTime } from "./format";
import { useSessionData, type SessionData } from "./queries";
import { deleteWorkout } from "./session-actions";
import { groupSessionSets, nameLookup, nextTimeChanges } from "./session-model";
import { ScreenSkeleton } from "./skeletons";
import { setLine, workSetsOf } from "./workout-model";

/**
 * One finished workout: what was done, and what the engine decided for next time.
 * `finished` is the screen right after tapping Finish; `history` is the same data opened later.
 */
export function SessionDetail({ workoutId, variant }: { workoutId: string | null; variant: "finished" | "history" }) {
  const data = useSessionData(workoutId);

  if (!workoutId) return <Missing text="No workout selected." />;
  if (data === undefined) return <ScreenSkeleton rows={4} label="Loading workout" />;
  if (data === null) return <Missing text="This workout is not on this device." />;
  return <Loaded data={data} variant={variant} />;
}

function Missing({ text }: { text: string }) {
  return (
    <EmptyState
      title="Workout not found"
      action={
        <ButtonLink href="/history" variant="primary" className="bleed">
          Back to history
        </ButtonLink>
      }
    >
      {text}
    </EmptyState>
  );
}

function Loaded({ data, variant }: { data: SessionData; variant: "finished" | "history" }) {
  const { workout, day, equipment, sets, decisions, library, profile } = data;
  const router = useRouter();
  const { toast } = useToast();
  const unit: Unit = profile?.unit ?? "lb";
  const nameOf = useMemo(() => nameLookup(library), [library]);
  const groups = useMemo(() => groupSessionSets(sets, nameOf), [sets, nameOf]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const minutes = sessionMinutes(workout);
  const work = workSetsOf(sets).length;
  const title = day?.name ?? "Workout";
  const finished = variant === "finished";
  const facts: [string, string][] = [];
  if (minutes !== null) facts.push(["Duration", formatDuration(minutes)]);
  facts.push(["Work sets", String(work)]);
  if (workout.session_rpe !== null) facts.push(["Effort", `${workout.session_rpe} of 10`]);
  if (equipment?.name) facts.push(["Equipment", equipment.name]);

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkout(workout.id);
      toast("Workout deleted");
      router.replace("/history");
    } catch {
      setDeleteError("The workout was not deleted. Try again.");
      setDeleting(false);
    }
  };

  const nextTime = decisions.length > 0 ? <NextTime decisions={decisions} unit={unit} nameOf={nameOf} /> : null;

  return (
    <div className={finished ? "pb-[calc(var(--band-height)+env(safe-area-inset-bottom))]" : "pb-4"}>
      {finished ? (
        <ScreenBar start={<SyncChip />} />
      ) : (
        <ScreenBar
          start={
            <Link href="/history" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-word active:underline">
              <IconChevronRight size={18} className="rotate-180" />
              History
            </Link>
          }
          end={<SyncChip align="end" />}
        />
      )}

      <header className="pb-3 pt-1">
        <h1 className="text-head">{named(finished ? "Workout complete" : title)}</h1>
        <p>
          {finished ? `${title}, ` : ""}
          {formatDate(workout.started_at)} at {formatTime(workout.started_at)}
        </p>
      </header>

      <dl className="border-y border-rule py-2">
        {facts.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] gap-x-2 py-0.5">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {finished ? nextTime : null}

      <section aria-label="Sets">
        <SectionTitle>What you did</SectionTitle>
        {groups.length === 0 ? (
          <p className="border-t border-rule py-3">No sets were logged.</p>
        ) : (
          <ul className="border-t border-rule">
            {groups.map((group) => (
              <li key={group.key} className="border-b border-rule py-3">
                <h3 className="pb-1 text-name">{named(group.name)}</h3>
                <ol>
                  {group.sets.map(({ set, label }) => (
                    <li key={set.id} className="grid grid-cols-[var(--label-col)_minmax(0,1fr)_auto] items-baseline gap-x-2 py-0.5">
                      <span>{label}</span>
                      <span className="min-w-0">
                        <span className="block">{setLine(set, unit)}</span>
                        {set.notes ? <span className="block text-small">{set.notes}</span> : null}
                      </span>
                      {set.pain ? <span className="text-small font-medium">Pain</span> : null}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </section>

      {finished ? null : nextTime}

      {workout.notes ? (
        <section aria-label="Notes">
          <SectionTitle>Notes</SectionTitle>
          <p className="whitespace-pre-wrap border-y border-rule py-3">{workout.notes}</p>
        </section>
      ) : null}

      {finished ? (
        <BottomBand>
          <ButtonLink href="/today" variant="primary">
            Done
          </ButtonLink>
        </BottomBand>
      ) : (
        <div className="mt-6 border-t border-rule">
          <ListRow title="Delete workout" onClick={() => setConfirmOpen(true)} />
        </div>
      )}

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete this workout?"
        footer={
          <div className="flex items-stretch">
            <Button variant="secondary" size="lg" className="flex-1" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" loading={deleting} onClick={() => void remove()}>
              Delete workout
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>The workout and its sets are removed from your history. Changes it already made to your plan stay.</p>
          {deleteError ? (
            <p role="alert" className="font-medium">
              {deleteError}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

function NextTime({
  decisions,
  unit,
  nameOf,
}: {
  decisions: ProgressionDecision[];
  unit: Unit;
  nameOf: (id: string) => string;
}) {
  return (
    <section aria-label="Next time">
      <SectionTitle>What changes next time</SectionTitle>
      <ul className="border-t border-rule">
        {decisions.map((d) => {
          const changes = nextTimeChanges(d, unit, nameOf);
          const target = typeof d.inputs.target_reps === "number" && d.action === "increase_reps" ? d.inputs.target_reps : null;
          return (
            <li key={d.id} className="border-b border-rule py-3">
              <h3 className="text-name">{named(nameOf(d.before.exercise_id))}</h3>
              <p>{ACTION_LABEL[d.action]}</p>
              <p className="pt-1 text-why">{d.reason}</p>
              {changes.length > 0 ? (
                <ul className="pt-1 text-small">
                  {changes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : target !== null ? (
                <p className="pt-1 text-small">Target: {target} reps on every set.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
