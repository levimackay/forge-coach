"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { named } from "@/components/ui/name";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import type { Exercise, ProgressionDecision, Unit } from "@/lib/domain/types";
import { BottomBand, Figure } from "./bits";
import { changeLabel, formatDate, formatNumber, plainReason } from "./format";
import { useSessionData, type SessionData } from "./queries";
import { deleteWorkout } from "./session-actions";
import { groupSessionSets, nameLookup } from "./session-model";
import { ScreenSkeleton } from "./skeletons";
import { setLine, usesLoad } from "./workout-model";

/**
 * One finished workout. `finished` is the screen right after ending it, which says what comes next
 * time; `history` is the same workout opened later, which says what was done.
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
  const { workout, day, sets, decisions, library, profile } = data;
  const router = useRouter();
  const { toast } = useToast();
  const unit: Unit = profile?.unit ?? "lb";
  const nameOf = useMemo(() => nameLookup(library), [library]);
  const groups = useMemo(() => groupSessionSets(sets, nameOf), [sets, nameOf]);
  const [changedOpen, setChangedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const title = day?.name ?? "Workout";
  const when = formatDate(workout.started_at);

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

  const nextTime = <NextTime decisions={decisions} library={library} unit={unit} nameOf={nameOf} />;

  if (variant === "finished") {
    return (
      <div className="pb-[calc(var(--band-height)+env(safe-area-inset-bottom)+16px)]">
        <ScreenBar />
        <h1 className="text-head">Workout done.</h1>
        <p className="mt-1.5 font-light">{title}</p>
        {decisions.length > 0 ? (
          <section aria-label="Next time" className="pt-8">
            <h2 className="pb-2 text-name">Next time.</h2>
            {nextTime}
          </section>
        ) : null}
        <BottomBand>
          <ButtonLink href="/today" variant="primary">
            Done
          </ButtonLink>
        </BottomBand>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <ScreenBar
        start={
          <ButtonLink href="/history" variant="ghost" size="sm" className="-ml-2">
            History
          </ButtonLink>
        }
        end={
          decisions.length > 0 ? (
            <Button variant="ghost" size="sm" className="-mr-2" onClick={() => setChangedOpen(true)}>
              What changed
            </Button>
          ) : undefined
        }
      />
      <h1 className="text-head">{named(title)}</h1>
      <p className="mt-1.5 font-light">{when}</p>

      {groups.length === 0 ? (
        <p className="mt-6 border-t border-rule py-3">No sets were logged.</p>
      ) : (
        <ul aria-label="Sets" className="mt-6 border-t border-rule">
          {groups.map((group) => (
            <li key={group.key} className="border-b border-rule py-3">
              <h2 className="pb-1 text-name">{named(group.name)}</h2>
              <ol>
                {group.sets.map(({ set, label }) => (
                  <li
                    key={set.id}
                    className="grid grid-cols-[var(--label-col)_minmax(0,1fr)_auto] items-baseline gap-x-2 py-0.5"
                  >
                    <span>{label}</span>
                    <span className="min-w-0">
                      <span className="block">{setLine(set, unit)}</span>
                      {set.notes ? <span className="block text-small">{set.notes}</span> : null}
                    </span>
                    {set.pain ? <span className="text-small font-medium">Hurt</span> : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}

      {workout.notes ? <p className="whitespace-pre-wrap pt-4 font-light">{workout.notes}</p> : null}

      <div className="mt-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setConfirmOpen(true)}>
          Delete workout
        </Button>
      </div>

      <Sheet open={changedOpen} onClose={() => setChangedOpen(false)} title="What changed">
        {nextTime}
      </Sheet>

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
              Delete
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>The workout and its sets are removed from your history.</p>
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

interface Why {
  name: string;
  text: string;
}

/**
 * Each lift with its weight for next time. A lift the engine moved says how, with a Why? that opens
 * the engine's reason. A swap for equipment is only for that day, so it is not a plan for next time.
 */
function NextTime({
  decisions,
  library,
  unit,
  nameOf,
}: {
  decisions: ProgressionDecision[];
  library: Exercise[];
  unit: Unit;
  nameOf: (id: string) => string;
}) {
  const [why, setWhy] = useState<Why | null>(null);
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const rows = decisions.filter((d) => d.action !== "substitute_equipment");
  if (rows.length === 0) return <p className="font-light">Nothing changes.</p>;

  return (
    <>
      <ul className="border-t border-rule">
        {rows.map((d) => {
          const name = nameOf(d.after.exercise_id);
          const exercise = byId.get(d.after.exercise_id);
          const label = changeLabel(d.action, exercise?.load_type === "assisted");
          const weight =
            exercise && !usesLoad(exercise) ? (
              <span className="text-control font-light">Bodyweight</span>
            ) : d.after.load !== null ? (
              <Figure value={formatNumber(d.after.load)} unit={unit} />
            ) : (
              <span className="text-control font-light">Pick a weight</span>
            );
          return (
            <li key={d.id} className="border-b border-rule py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 break-words text-name">{named(name)}</h3>
                <p className="shrink-0">{weight}</p>
              </div>
              {label ? (
                <div className="mt-0.5 flex items-center justify-between gap-3 text-why">
                  <span>{label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-2 -my-3 font-normal"
                    aria-label={`Why, ${name}`}
                    onClick={() => setWhy({ name, text: d.reason })}
                  >
                    Why?
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Sheet open={why !== null} onClose={() => setWhy(null)} title={why?.name ?? ""}>
        <p className="text-why">{why ? plainReason(why.text) : null}</p>
      </Sheet>
    </>
  );
}
