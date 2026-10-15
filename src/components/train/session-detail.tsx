"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronRight } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { sessionMinutes } from "@/lib/analytics";
import type { ProgressionDecision, Unit } from "@/lib/domain/types";
import { SectionTitle } from "./bits";
import {
  ACTION_LABEL,
  PROGRESS_ACTIONS,
  countLabel,
  formatDate,
  formatDuration,
  formatTime,
} from "./format";
import { useSessionData, type SessionData } from "./queries";
import { deleteWorkout } from "./session-actions";
import { groupSessionSets, nameLookup, nextTimeChanges } from "./session-model";
import { ScreenSkeleton } from "./skeletons";
import { describeSet, workSetsOf } from "./workout-model";

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
        <ButtonLink href="/history" variant="primary" size="lg">
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
  const facts = [
    minutes !== null ? formatDuration(minutes) : null,
    countLabel(work, "work set"),
    workout.session_rpe !== null ? `effort ${workout.session_rpe} of 10` : null,
    equipment?.name ?? null,
  ].filter(Boolean);

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
    <div className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-1">
        {finished ? null : (
          <Link href="/history" className="-ml-2 flex min-h-11 w-fit items-center gap-0.5 px-2 text-[17px] text-ink-dim active:text-ink">
            <IconChevronRight size={20} className="rotate-180" />
            History
          </Link>
        )}
        <h1 className="title-large">{finished ? "Workout complete" : title}</h1>
        <p className="text-[17px] text-ink-dim">
          {finished ? `${title}, ` : ""}
          {formatDate(workout.started_at)} at {formatTime(workout.started_at)}
        </p>
        <p className="text-[15px] text-ink-dim">{facts.join(", ")}</p>
      </header>

      {finished ? nextTime : null}

      <section aria-label="Sets" className="flex flex-col gap-2">
        <SectionTitle>What you did</SectionTitle>
        {groups.length === 0 ? (
          <p className="px-1 text-[17px] text-ink-dim">No sets were logged.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((group) => (
              <li key={group.key} className="overflow-hidden rounded-card border border-line bg-surface">
                <h3 className="px-4 pb-1 pt-3 text-[17px] font-semibold">{group.name}</h3>
                <ol>
                  {group.sets.map(({ set, label }) => (
                    <li key={set.id} className="flex items-baseline gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                      <span className="w-16 shrink-0 text-[15px] text-ink-dim">{label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px]">{describeSet(set, unit)}</span>
                        {set.notes ? <span className="block text-[15px] text-ink-dim">{set.notes}</span> : null}
                      </span>
                      {set.pain ? <span className="shrink-0 text-[13px] font-semibold text-danger">Pain</span> : null}
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
        <section aria-label="Notes" className="flex flex-col gap-2">
          <SectionTitle>Notes</SectionTitle>
          <p className="whitespace-pre-wrap rounded-card border border-line bg-surface p-4 text-[17px]">{workout.notes}</p>
        </section>
      ) : null}

      {finished ? (
        <ButtonLink href="/today" variant="primary" size="lg" fullWidth>
          Done
        </ButtonLink>
      ) : (
        <Button variant="danger" fullWidth onClick={() => setConfirmOpen(true)}>
          Delete workout
        </Button>
      )}

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete this workout?"
        footer={
          <div className="flex flex-col gap-3">
            <Button variant="danger" fullWidth loading={deleting} onClick={() => void remove()}>
              Delete workout
            </Button>
            <Button variant="secondary" fullWidth disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[17px] text-ink-dim">
            The workout and its sets are removed from your history. Changes it already made to your plan stay.
          </p>
          {deleteError ? (
            <p role="alert" className="text-[15px] text-danger">
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
    <section aria-label="Next time" className="flex flex-col gap-2">
      <SectionTitle>What changes next time</SectionTitle>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {decisions.map((d) => {
          const changes = nextTimeChanges(d, unit, nameOf);
          const target = typeof d.inputs.target_reps === "number" && d.action === "increase_reps" ? d.inputs.target_reps : null;
          return (
            <li key={d.id} className="flex flex-col gap-1 border-t border-line px-4 py-3 first:border-t-0">
              <p className="text-[17px] font-semibold">{nameOf(d.before.exercise_id)}</p>
              <p className="flex items-center gap-2 text-[15px] text-ink-dim">
                {PROGRESS_ACTIONS.has(d.action) ? (
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-ember" />
                ) : null}
                {ACTION_LABEL[d.action]}
              </p>
              <p className="text-[17px]">{d.reason}</p>
              {changes.length > 0 ? (
                <ul className="text-[15px] text-ink-dim">
                  {changes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : target !== null ? (
                <p className="text-[15px] text-ink-dim">Target: {target} reps on every set.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
