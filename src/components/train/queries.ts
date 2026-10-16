"use client";

import type {
  EquipmentProfile,
  Exercise,
  PlannedExercise,
  PrescriptionSnapshot,
  Profile,
  Program,
  ProgramDay,
  ProgressionDecision,
  RecoveryLog,
  Unit,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";
import { nextSessionPlan, plannedSessionsLast28d, type EquipmentLike, type SessionPlanItem } from "@/lib/engine";
import { getDb, getMeta, setMeta } from "@/lib/local/db";
import { localDate, localDateDaysAgo } from "@/lib/local/dates";
import { loadActiveProgram, loadSetsForExercise, useLive } from "@/lib/local/hooks";
import { findInProgress, pickNextDay } from "./rotation";

const alive = <T extends { deleted_at?: string | null }>(row: T): boolean => !row.deleted_at;
const RECOVERY_LOOKBACK_DAYS = 14;

/** Everything the engine needs to plan one program day. */
export interface PlanContext {
  program: Program;
  days: ProgramDay[];
  day: ProgramDay;
  /** Active planned exercises of this day, in order. */
  planned: PlannedExercise[];
  library: Exercise[];
  /** Every workout of this day, any status. */
  dayWorkouts: Workout[];
  /** Every set ever logged against this day's planned exercises. */
  sets: WorkoutSet[];
  recovery: RecoveryLog[];
  equipmentProfiles: EquipmentProfile[];
  unit: Unit;
  bodyweight: number | null;
  /** The most recent engine decision per planned exercise, keyed by planned exercise id. */
  lastDecisions: Record<string, ProgressionDecision>;
}

export async function loadPlanContext(dayId: string): Promise<PlanContext | null> {
  const db = getDb();
  const day = await db.program_days.get(dayId);
  if (!day || day.deleted_at) return null;
  const program = await db.programs.get(day.program_id);
  if (!program || program.deleted_at) return null;

  const [days, planned, library, dayWorkouts, equipmentProfiles, profile, recovery] = await Promise.all([
    db.program_days.where("program_id").equals(program.id).filter(alive).toArray(),
    db.planned_exercises
      .where("program_day_id")
      .equals(day.id)
      .filter((p) => p.is_active && alive(p))
      .toArray(),
    db.exercises.filter(alive).toArray(),
    db.workouts.where("program_day_id").equals(day.id).filter(alive).toArray(),
    db.equipment_profiles.filter(alive).toArray(),
    db.profiles.toCollection().first(),
    db.recovery_logs
      .where("date")
      .aboveOrEqual(localDateDaysAgo(RECOVERY_LOOKBACK_DAYS))
      .filter(alive)
      .toArray(),
  ]);

  planned.sort((a, b) => a.position - b.position);
  const plannedIds = planned.map((p) => p.id);
  const [sets, decisions] = await Promise.all([
    db.workout_sets.where("planned_exercise_id").anyOf(plannedIds).filter(alive).toArray(),
    db.progression_decisions.where("planned_exercise_id").anyOf(plannedIds).filter(alive).toArray(),
  ]);

  const lastDecisions: Record<string, ProgressionDecision> = {};
  for (const d of decisions) {
    const seen = lastDecisions[d.planned_exercise_id];
    if (!seen || d.decided_at > seen.decided_at) lastDecisions[d.planned_exercise_id] = d;
  }

  equipmentProfiles.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  return {
    program,
    days: days.sort((a, b) => a.position - b.position),
    day,
    planned,
    library,
    dayWorkouts,
    sets,
    recovery,
    equipmentProfiles,
    unit: profile?.unit ?? "lb",
    bodyweight: profile?.bodyweight ?? null,
    lastDecisions,
  };
}

/** The profile to plan with: the one asked for, else the day's own, else the default. */
export function resolveEquipment(ctx: PlanContext, preferredId: string | null): EquipmentProfile | null {
  const profiles = ctx.equipmentProfiles;
  return (
    profiles.find((e) => e.id === preferredId) ??
    profiles.find((e) => e.id === ctx.day.equipment_profile_id) ??
    profiles.find((e) => e.is_default) ??
    profiles[0] ??
    null
  );
}

/** Same session-count maths as completeWorkout, so the plan and the recorded decision agree. */
export function buildPlan(ctx: PlanContext, equipment: EquipmentLike | null, nowIso: string): SessionPlanItem[] {
  const plannedSessions28d = plannedSessionsLast28d(ctx.program.days_per_week, ctx.days.length, ctx.program.created_at, nowIso);
  return nextSessionPlan(
    ctx.day,
    ctx.planned,
    ctx.library,
    { workouts: ctx.dayWorkouts, sets: ctx.sets },
    ctx.recovery,
    equipment,
    nowIso,
    { unit: ctx.unit, plannedSessions28d, bodyweight: ctx.bodyweight },
  );
}

export interface ItemNote {
  text: string;
  action: ProgressionDecision["action"];
}

const SAME_FIELDS = ["exercise_id", "sets", "rep_min", "rep_max", "target_rir", "load"] as const;

const sameAsPlan = (a: PrescriptionSnapshot, b: PrescriptionSnapshot): boolean => SAME_FIELDS.every((k) => a[k] === b[k]);

/**
 * Why this exercise looks the way it does. Once a session is already reflected in the plan,
 * the engine only says so, and the explanation is the reason recorded when that session
 * ended. That reason is shown only while the plan still matches what it decided, so a
 * manual edit made since then does not sit under a sentence that no longer fits.
 */
export function itemNote(item: SessionPlanItem, last: ProgressionDecision | undefined): ItemNote | null {
  const rule = String(item.decision.inputs.rule ?? "");
  if (rule === "plan_already_updated") {
    return last && sameAsPlan(last.after, item.planned) ? { text: last.reason, action: last.action } : null;
  }
  if (rule === "no_history") return null;
  return { text: item.decision.reason, action: item.decision.action };
}

export interface TodayData {
  ctx: PlanContext;
  nextDayId: string;
  inProgress: Workout | null;
  lastCompleted: Workout | null;
  recoveryToday: RecoveryLog | null;
}

/** `null` means there is no active program. */
export async function loadToday(selectedDayId: string | null): Promise<TodayData | null> {
  const active = await loadActiveProgram();
  if (!active) return null;
  const db = getDb();
  const dayIds = active.days.map((d) => d.id);
  const workouts = await db.workouts.where("program_day_id").anyOf(dayIds).filter(alive).toArray();
  const next = pickNextDay(active.days, workouts);
  if (!next) return null;

  const dayId = selectedDayId && dayIds.includes(selectedDayId) ? selectedDayId : next.id;
  const ctx = await loadPlanContext(dayId);
  if (!ctx) return null;

  const completed = workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) => (b.completed_at ?? b.started_at).localeCompare(a.completed_at ?? a.started_at));
  const recoveryToday =
    (await db.recovery_logs.where("date").equals(localDate()).filter(alive).first()) ?? null;

  return {
    ctx,
    nextDayId: next.id,
    inProgress: findInProgress(workouts),
    lastCompleted: completed[0] ?? null,
    recoveryToday,
  };
}

export function useTodayData(selectedDayId: string | null): TodayData | null | undefined {
  return useLive(() => loadToday(selectedDayId), [selectedDayId]);
}

export type Swaps = Record<string, string>;

const swapKey = (workoutId: string) => `swaps:${workoutId}`;

export async function getSwaps(workoutId: string): Promise<Swaps> {
  return (await getMeta<Swaps>(swapKey(workoutId))) ?? {};
}

/** Remembers which exercise replaces a planned one for this workout before any set exists to show it. */
export async function setSwap(workoutId: string, plannedExerciseId: string, exerciseId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.meta, async () => {
    const current = await getSwaps(workoutId);
    await setMeta(swapKey(workoutId), { ...current, [plannedExerciseId]: exerciseId });
  });
}

export interface WorkoutData {
  workout: Workout;
  /** Null when the workout has no program day, or its day no longer exists. */
  ctx: PlanContext | null;
  swaps: Swaps;
}

/** `null` means no such workout on this device. */
export async function loadWorkoutData(id: string | null): Promise<WorkoutData | null> {
  if (!id) return null;
  const workout = await getDb().workouts.get(id);
  if (!workout || workout.deleted_at) return null;
  const ctx = workout.program_day_id ? await loadPlanContext(workout.program_day_id) : null;
  return { workout, ctx, swaps: await getSwaps(id) };
}

export function useWorkoutData(id: string | null): WorkoutData | null | undefined {
  return useLive(() => loadWorkoutData(id), [id]);
}

export interface LastSession {
  workout: Workout;
  /** Work sets of that exercise from that session, in order. */
  sets: WorkoutSet[];
}

/** The most recent finished workout that included this exercise, for the "last time" line. */
export async function loadLastSession(exerciseId: string, excludeWorkoutId: string): Promise<LastSession | null> {
  const recent = await loadSetsForExercise(exerciseId, 60);
  const ids = [...new Set(recent.map((s) => s.workout_id))].filter((id) => id !== excludeWorkoutId);
  if (ids.length === 0) return null;
  const workouts = (await getDb().workouts.bulkGet(ids))
    .filter((w): w is Workout => Boolean(w) && w!.status === "completed" && alive(w!))
    .sort((a, b) => (b.completed_at ?? b.started_at).localeCompare(a.completed_at ?? a.started_at));
  const workout = workouts[0];
  if (!workout) return null;
  const sets = recent
    .filter((s) => s.workout_id === workout.id && !s.is_warmup)
    .sort((a, b) => a.set_index - b.set_index || a.completed_at.localeCompare(b.completed_at));
  return sets.length ? { workout, sets } : null;
}

export function useLastSession(exerciseId: string, excludeWorkoutId: string): LastSession | null | undefined {
  return useLive(() => loadLastSession(exerciseId, excludeWorkoutId), [exerciseId, excludeWorkoutId]);
}

export interface SessionData {
  workout: Workout;
  day: ProgramDay | null;
  equipment: EquipmentProfile | null;
  sets: WorkoutSet[];
  decisions: ProgressionDecision[];
  library: Exercise[];
  profile: Profile | null;
}

/** `null` means no such workout on this device. */
export async function loadSessionData(id: string | null): Promise<SessionData | null> {
  if (!id) return null;
  const db = getDb();
  const workout = await db.workouts.get(id);
  if (!workout || workout.deleted_at) return null;
  const [day, equipment, sets, decisions, library, profile] = await Promise.all([
    workout.program_day_id ? db.program_days.get(workout.program_day_id) : undefined,
    workout.equipment_profile_id ? db.equipment_profiles.get(workout.equipment_profile_id) : undefined,
    db.workout_sets.where("workout_id").equals(id).filter(alive).toArray(),
    db.progression_decisions.where("workout_id").equals(id).filter(alive).toArray(),
    db.exercises.toArray(),
    db.profiles.toCollection().first(),
  ]);
  sets.sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.set_index - b.set_index);
  decisions.sort((a, b) => a.decided_at.localeCompare(b.decided_at));
  return {
    workout,
    day: day ?? null,
    equipment: equipment ?? null,
    sets,
    decisions,
    library,
    profile: profile ?? null,
  };
}

export function useSessionData(id: string | null): SessionData | null | undefined {
  return useLive(() => loadSessionData(id), [id]);
}

export interface HistoryRow {
  workout: Workout;
  dayName: string | null;
  workSets: number;
}

export interface HistoryData {
  rows: HistoryRow[];
  /** All completed workouts on this device, so the list knows whether more exist. */
  total: number;
}

export async function loadHistory(limit: number): Promise<HistoryData> {
  const db = getDb();
  const all = await db.workouts.where("status").equals("completed").filter(alive).toArray();
  const total = all.length;
  const workouts = all.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit);
  const ids = workouts.map((w) => w.id);
  const dayIds = [...new Set(workouts.map((w) => w.program_day_id).filter((id): id is string => id !== null))];
  const [sets, days] = await Promise.all([
    db.workout_sets.where("workout_id").anyOf(ids).filter((s) => alive(s) && !s.is_warmup).toArray(),
    db.program_days.bulkGet(dayIds),
  ]);
  const dayName = new Map(days.filter((d): d is ProgramDay => Boolean(d)).map((d) => [d.id, d.name]));
  const counts = new Map<string, number>();
  for (const s of sets) counts.set(s.workout_id, (counts.get(s.workout_id) ?? 0) + 1);
  return {
    total,
    rows: workouts.map((workout) => ({
      workout,
      dayName: workout.program_day_id ? (dayName.get(workout.program_day_id) ?? null) : null,
      workSets: counts.get(workout.id) ?? 0,
    })),
  };
}

export function useHistory(limit: number): HistoryData | undefined {
  return useLive(() => loadHistory(limit), [limit]);
}
