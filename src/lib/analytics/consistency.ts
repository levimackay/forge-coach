import type { IsoDate, Workout } from "@/lib/domain/types";
import { daysBetween, inRange, localDate } from "./dates";

export interface Consistency {
  from: IsoDate;
  to: IsoDate;
  days: number;
  /** days_per_week prorated to the window; null when there is no program. */
  planned: number | null;
  completed: number;
  abandoned: number;
  /** completed / planned. Can exceed 1. Null when nothing was planned. */
  adherence: number | null;
  training_days: number;
  /** Most days between two consecutive training days in the window (back to back days = 1). */
  longest_gap_days: number | null;
  /** Days from the latest completed workout (any time up to `to`) to `to`. */
  days_since_last: number | null;
}

export function consistency(input: {
  workouts: Workout[];
  daysPerWeek: number | null;
  from: IsoDate;
  to: IsoDate;
  timeZone: string;
}): Consistency {
  const days = daysBetween(input.from, input.to) + 1;
  const live = input.workouts.filter((w) => !w.deleted_at);
  const dated = (status: Workout["status"]) =>
    live.filter((w) => w.status === status).map((w) => localDate(w.started_at, input.timeZone));

  const completedDates = dated("completed");
  const inWindow = completedDates.filter((d) => inRange(d, input.from, input.to)).sort();
  const trainingDays = [...new Set(inWindow)];

  const gaps = trainingDays.slice(1).map((d, i) => daysBetween(trainingDays[i], d));
  const before = completedDates.filter((d) => d <= input.to).sort();
  const planned = input.daysPerWeek === null ? null : Math.round((input.daysPerWeek * days) / 7);

  return {
    from: input.from,
    to: input.to,
    days,
    planned,
    completed: inWindow.length,
    abandoned: dated("abandoned").filter((d) => inRange(d, input.from, input.to)).length,
    adherence: planned ? inWindow.length / planned : null,
    training_days: trainingDays.length,
    longest_gap_days: gaps.length ? Math.max(...gaps) : null,
    days_since_last: before.length ? daysBetween(before[before.length - 1], input.to) : null,
  };
}
