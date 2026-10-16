import type { EquipmentCode, Exercise, PlannedExercise, Unit } from "@/lib/domain/types";
import type { ConsistencyInfo, EngineInput, EngineSet, EquipmentLike, SessionHistoryEntry } from "./types";

export const NOW = "2026-10-15T12:00:00.000Z";
const DAY = 86_400_000;

export const daysAgo = (days: number, from: string = NOW): string => new Date(Date.parse(from) - days * DAY).toISOString();

export function makeExercise(p: Partial<Exercise> & Pick<Exercise, "id" | "slug" | "name">): Exercise {
  return {
    user_id: null,
    primary_muscle: "chest",
    secondary_muscles: [],
    movement_pattern: "horizontal_push",
    equipment: ["bodyweight"],
    load_type: "bodyweight",
    progression_group: null,
    ladder_level: null,
    default_rep_min: 8,
    default_rep_max: 12,
    default_increment: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...p,
  };
}

const ext = (equipment: EquipmentCode[]): Partial<Exercise> => ({ equipment, load_type: "external" });

export const BENCH = makeExercise({ id: "ex-bench", slug: "barbell-bench-press", name: "Barbell Bench Press", ...ext(["barbell", "bench", "rack"]), default_rep_min: 6, default_rep_max: 10 });
export const DB_PRESS = makeExercise({ id: "ex-db-press", slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", ...ext(["dumbbells", "bench"]) });
export const DB_CURL = makeExercise({ id: "ex-db-curl", slug: "dumbbell-curl", name: "Dumbbell Curl", primary_muscle: "biceps", movement_pattern: "elbow_flexion", ...ext(["dumbbells"]) });
export const SQUAT = makeExercise({ id: "ex-squat", slug: "barbell-back-squat", name: "Barbell Back Squat", primary_muscle: "quads", movement_pattern: "squat", ...ext(["barbell", "rack"]), default_rep_min: 6, default_rep_max: 10 });
export const GOBLET = makeExercise({ id: "ex-goblet", slug: "goblet-squat", name: "Goblet Squat", primary_muscle: "quads", movement_pattern: "squat", ...ext(["dumbbells"]) });
export const BW_SQUAT = makeExercise({ id: "ex-bw-squat", slug: "bodyweight-squat", name: "Bodyweight Squat", primary_muscle: "quads", movement_pattern: "squat" });
export const CABLE_ROW = makeExercise({ id: "ex-cable-row", slug: "cable-row", name: "Cable Row", primary_muscle: "upper_back", movement_pattern: "horizontal_pull", ...ext(["cable"]) });
export const LEG_PRESS = makeExercise({ id: "ex-leg-press", slug: "leg-press", name: "Leg Press", primary_muscle: "quads", movement_pattern: "squat", ...ext(["machines"]) });

const push = (level: number, id: string, name: string, extra: Partial<Exercise> = {}): Exercise =>
  makeExercise({ id, slug: id.replace("ex-", ""), name, progression_group: "pushup", ladder_level: level, default_rep_min: 8, default_rep_max: 20, ...extra });
export const PU_INCLINE = push(1, "ex-pu-incline", "Incline Push-Up");
export const PU_STD = push(2, "ex-pu-std", "Push-Up");
export const PU_DECLINE = push(3, "ex-pu-decline", "Decline Push-Up");
export const PU_ARCHER = push(4, "ex-pu-archer", "Archer Push-Up");
export const PU_WEIGHTED = push(5, "ex-pu-weighted", "Weighted Push-Up", { load_type: "external" });

const pull = (level: number, id: string, name: string, extra: Partial<Exercise> = {}): Exercise =>
  makeExercise({ id, slug: id.replace("ex-", ""), name, primary_muscle: "lats", movement_pattern: "vertical_pull", progression_group: "pullup", ladder_level: level, default_rep_min: 5, default_rep_max: 12, ...extra });
export const PL_BAND = pull(1, "ex-pl-band", "Band-Assisted Pull-Up", { equipment: ["bands", "pullup_bar"] });
export const PL_PULLUP = pull(2, "ex-pl-pullup", "Pull-Up", { equipment: ["pullup_bar"] });
export const PL_WEIGHTED = pull(3, "ex-pl-weighted", "Weighted Pull-Up", { equipment: ["pullup_bar"], load_type: "external" });

export const ASSISTED = makeExercise({ id: "ex-assisted", slug: "assisted-pull-up", name: "Assisted Pull-Up Machine", primary_muscle: "lats", movement_pattern: "vertical_pull", equipment: ["machines"], load_type: "assisted", default_rep_min: 6, default_rep_max: 10 });

export const LIBRARY: Exercise[] = [
  BENCH, DB_PRESS, DB_CURL, SQUAT, GOBLET, BW_SQUAT, CABLE_ROW, LEG_PRESS,
  PU_INCLINE, PU_STD, PU_DECLINE, PU_ARCHER, PU_WEIGHTED,
  PL_BAND, PL_PULLUP, PL_WEIGHTED, ASSISTED,
];

export const makeEquipment = (p: Partial<EquipmentLike> & Pick<EquipmentLike, "equipment">): EquipmentLike => ({
  name: "Gym",
  dumbbell_increment: null,
  dumbbell_max: null,
  barbell_increment: null,
  ...p,
});

export const GYM = makeEquipment({
  name: "Full gym",
  equipment: ["bodyweight", "pullup_bar", "dip_bars", "rings", "dumbbells", "bands", "kettlebells", "barbell", "rack", "bench", "cable", "machines"],
});
export const HOTEL = makeEquipment({ name: "Hotel gym", equipment: ["dumbbells", "bench"], dumbbell_increment: 5, dumbbell_max: 50 });

export function makeSets(reps: number[], p: { load?: number | null; rir?: number | (number | null)[] | null; exercise?: string; pain?: boolean[] } = {}): EngineSet[] {
  return reps.map((r, i) => ({
    exercise_id: p.exercise ?? "ex-bench",
    set_index: i + 1,
    reps: r,
    load: p.load === undefined ? null : p.load,
    rir: Array.isArray(p.rir) ? (p.rir[i] ?? null) : (p.rir ?? null),
    is_warmup: false,
    pain: p.pain?.[i] ?? false,
  }));
}

export const warmup = (reps: number, load: number | null, exercise = "ex-bench", index = 0): EngineSet => ({
  exercise_id: exercise,
  set_index: index,
  reps,
  load,
  rir: null,
  is_warmup: true,
  pain: false,
});

export const session = (days: number, sets: EngineSet[], workoutId: string | null = null): SessionHistoryEntry => ({
  workout_id: workoutId ?? `w-${days}`,
  completed_at: daysAgo(days),
  sets,
});

export const CONSISTENT: ConsistencyInfo = { days_since_last_session: null, sessions_last_28d: 12, planned_last_28d: 12 };

export function makeInput(p: Partial<EngineInput> & { prescription?: Partial<EngineInput["planned"]> } = {}): EngineInput {
  const { prescription, ...rest } = p;
  const exercise = rest.exercise ?? BENCH;
  return {
    planned: {
      exercise_id: exercise.id,
      sets: 3,
      rep_min: exercise.default_rep_min,
      rep_max: exercise.default_rep_max,
      target_rir: 2,
      load: exercise.load_type === "bodyweight" ? null : 100,
      ...prescription,
    },
    exercise,
    library: LIBRARY,
    history: [],
    recovery: [],
    equipment: null,
    consistency: CONSISTENT,
    unit: "lb",
    now: NOW,
    ...rest,
  };
}

export function makePlanned(p: Partial<PlannedExercise> & Pick<PlannedExercise, "id" | "exercise_id">): PlannedExercise {
  return {
    user_id: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    program_day_id: "day-1",
    position: 1,
    sets: 3,
    rep_min: 6,
    rep_max: 10,
    target_rir: 2,
    load: 100,
    rest_seconds: null,
    notes: null,
    is_active: true,
    ...p,
  };
}

export const isOneSentence = (s: string): boolean =>
  /^[A-Z]/.test(s) && s.endsWith(".") && !/[.!?]\s+\S/.test(s) && !s.includes("\n");

export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
};

export type { Unit };
