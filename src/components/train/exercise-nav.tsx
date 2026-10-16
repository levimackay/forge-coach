"use client";

import { useId } from "react";
import { IconChevronDown } from "@/components/ui/icons";
import { named } from "@/components/ui/name";
import type { Slot } from "./exercise-panel";

const hasSetsLeft = (s: Slot): boolean => s.workSets < s.item.prescription.sets;

function ExerciseList({ id, slots, currentId, onPick }: { id?: string; slots: Slot[]; currentId: string | null; onPick: (id: string) => void }) {
  return (
    <ul id={id} aria-label="Exercises">
      {slots.map((slot) => {
        const plannedId = slot.item.planned.id;
        const current = plannedId === currentId;
        return (
          <li key={plannedId}>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              onClick={() => onPick(plannedId)}
              className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2 text-left active:underline"
            >
              <span className={`break-words text-name ${current ? "underline decoration-2 underline-offset-[7px]" : ""}`}>
                {named(slot.exercise.name)}
              </span>
              <span className="text-small">
                {slot.workSets} of {slot.item.prescription.sets} sets
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One collapsed row naming the next exercise, with the count of the rest. Opening it lists every
 * exercise so the lifter can go to any of them. With no exercise open, the list is simply shown.
 */
export function ExerciseNav({
  slots,
  currentId,
  open,
  onToggle,
  onPick,
  ruled,
}: {
  slots: Slot[];
  currentId: string | null;
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  /** Draws the row's top hairline. Leave it off when the rest controls sit directly above. */
  ruled: boolean;
}) {
  const listId = useId();

  if (currentId === null) {
    return (
      <section aria-label="Choose an exercise">
        <h1 className="pb-2 pt-4 text-name">Exercises.</h1>
        <div className="border-t border-rule">
          <ExerciseList slots={slots} currentId={null} onPick={onPick} />
        </div>
      </section>
    );
  }

  const index = slots.findIndex((s) => s.item.planned.id === currentId);
  const others = slots.filter((_, i) => i !== index);
  if (others.length === 0) return null;
  // Whatever follows the current exercise comes first, then whatever was skipped before it.
  const next = [...slots.slice(index + 1), ...slots.slice(0, index)].find(hasSetsLeft);
  const more = others.length - (next ? 1 : 0);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className={`grid min-h-14 w-full grid-cols-[var(--label-col)_minmax(0,1fr)_auto] items-center border-b border-rule text-left ${
          ruled ? "border-t" : ""
        }`}
      >
        <span>Next</span>
        <span className="min-w-0 break-words py-2 text-name">{next ? named(next.exercise.name) : "Nothing left"}</span>
        <span className="flex items-center gap-1.5 pl-3 text-small">
          {more > 0 ? `${more} more` : null}
          <IconChevronDown size={16} className={open ? "rotate-180" : undefined} />
        </span>
      </button>
      {open ? <ExerciseList id={listId} slots={slots} currentId={currentId} onPick={onPick} /> : null}
    </div>
  );
}
