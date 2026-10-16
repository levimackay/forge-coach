"use client";

import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { Sheet } from "@/components/ui/sheet";
import type { Unit, WorkoutSet } from "@/lib/domain/types";
import { SwitchRow } from "./bits";
import type { Slot } from "./set-entry";
import { setLine, type SetDraft } from "./workout-model";

type Flags = Pick<SetDraft, "warmup" | "pain" | "note">;

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  /** The set being entered, when there is one. Without it the sheet has no switches. */
  flags: { draft: Flags; onChange: (change: Partial<SetDraft>) => void } | null;
  unit: Unit;
  /** The sets already logged for the exercise on screen, with their work set numbers (0 for a warmup). */
  sets: { set: WorkoutSet; number: number }[];
  slots: Slot[];
  currentId: string | null;
  /** True when the exercise on screen is done, so one more set can be asked for. */
  canAddSet: boolean;
  onEditSet: (set: WorkoutSet, number: number) => void;
  onSwap: () => void;
  onPickExercise: (plannedId: string) => void;
  onAddSet: () => void;
}

/**
 * Everything the logger keeps out of the way: the switches for this set, a different exercise,
 * a set already logged. One small link opens it.
 */
export function MoreSheet({
  open,
  onClose,
  flags,
  unit,
  sets,
  slots,
  currentId,
  canAddSet,
  onEditSet,
  onSwap,
  onPickExercise,
  onAddSet,
}: MoreSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="flex flex-col gap-6 pb-2">
        {flags ? (
          <div className="flex flex-col gap-4">
            <div className="border-t border-rule">
              <SwitchRow label="Warmup set" checked={flags.draft.warmup} onChange={(warmup) => flags.onChange({ warmup })} />
              <SwitchRow
                label="Something hurt"
                hint={flags.draft.pain ? "This lift stays at its weight next time." : undefined}
                checked={flags.draft.pain}
                onChange={(pain) => flags.onChange({ pain })}
              />
            </div>
            <Field
              label="Note"
              multiline
              rows={2}
              maxLength={1000}
              value={flags.draft.note}
              onChange={(e) => flags.onChange({ note: e.target.value })}
            />
          </div>
        ) : null}

        {currentId !== null ? (
          <ListGroup label="This exercise" className="border-t border-rule">
            <ListRow title="Swap exercise" onClick={onSwap} chevron />
            {canAddSet ? <ListRow title="Add a set" onClick={onAddSet} /> : null}
          </ListGroup>
        ) : null}

        {sets.length > 0 ? (
          <section>
            <h3 className="pb-2 text-name">{named("Sets so far")}</h3>
            <ListGroup label="Sets so far" className="border-t border-rule">
              {sets.map(({ set, number }) => (
                <ListRow
                  key={set.id}
                  label={set.is_warmup ? "Warmup" : `Set ${number}`}
                  title={setLine(set, unit)}
                  trailing={set.pain ? "Hurt" : undefined}
                  onClick={() => onEditSet(set, number)}
                  chevron
                />
              ))}
            </ListGroup>
          </section>
        ) : null}

        {slots.length > 1 ? (
          <section>
            <h3 className="pb-2 text-name">{named("Exercises")}</h3>
            <ListGroup label="Exercises" className="border-t border-rule">
              {slots.map((slot) => {
                const id = slot.item.planned.id;
                return (
                  <ListRow
                    key={id}
                    title={named(slot.exercise.name)}
                    name
                    trailing={id === currentId ? "Now" : `${slot.workSets} of ${slot.item.prescription.sets}`}
                    onClick={() => onPickExercise(id)}
                  />
                );
              })}
            </ListGroup>
          </section>
        ) : null}

        {/* The workout stays open, and Today offers to resume it. */}
        <ListGroup label="Leave" className="border-t border-rule">
          <ListRow title="Back to Today" href="/today" />
        </ListGroup>
      </div>
    </Sheet>
  );
}
