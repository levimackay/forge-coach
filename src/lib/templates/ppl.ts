import type {
  DayFocus,
  EquipmentCode,
  EquipmentProfile,
  Exercise,
  PlannedExercise,
  Program,
  ProgramDay,
  Uuid,
} from "@/lib/domain/types";

export type PplVariant = "3day" | "6day";

/**
 * One exercise slot in a day. Each slot names the exercise to use with gym
 * equipment and the one to use at home, both as slugs from the seeded library.
 * repMin/repMax apply when the chosen exercise is loaded with external weight;
 * bodyweight and assisted exercises keep their own ladder-specific range.
 */
export interface PplSlot {
  gym: string;
  home: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
}

export interface PplDaySpec {
  name: string;
  focus: DayFocus;
  slots: readonly PplSlot[];
}

export interface PplTemplate {
  name: string;
  daysPerWeek: number;
  notes: string;
  days: readonly PplDaySpec[];
}

// Rest and effort follow the research notes: 2 minutes between multi-joint sets,
// 60 to 90 seconds for single-joint work, and 1 to 2 reps in reserve.
const heavy = (gym: string, home: string, sets = 3, repMin = 6, repMax = 10): PplSlot => ({
  gym, home, sets, repMin, repMax, targetRir: 2, restSeconds: 120,
});
const moderate = (gym: string, home: string, sets = 3, repMin = 8, repMax = 12): PplSlot => ({
  gym, home, sets, repMin, repMax, targetRir: 2, restSeconds: 90,
});
const isolation = (gym: string, home: string, repMin: number, repMax: number, sets = 3): PplSlot => ({
  gym, home, sets, repMin, repMax, targetRir: 1, restSeconds: 75,
});
const withExtraSets = (slot: PplSlot, extra: number): PplSlot => ({ ...slot, sets: slot.sets + extra });

const PUSH_A: readonly PplSlot[] = [
  heavy("barbell-bench-press", "push-up"),
  moderate("seated-dumbbell-shoulder-press", "pike-push-up"),
  moderate("incline-dumbbell-press", "decline-push-up"),
  isolation("cable-lateral-raise", "dumbbell-lateral-raise", 12, 20),
  isolation("cable-triceps-pushdown", "dumbbell-overhead-triceps-extension", 10, 15),
];

const PUSH_B: readonly PplSlot[] = [
  heavy("overhead-press", "elevated-pike-push-up"),
  moderate("dumbbell-bench-press", "close-grip-push-up"),
  moderate("parallel-bar-dip", "bench-dip"),
  isolation("cable-fly", "dumbbell-fly", 10, 15),
  isolation("dumbbell-lateral-raise", "band-lateral-raise", 12, 20),
  isolation("overhead-cable-triceps-extension", "band-triceps-pushdown", 10, 15),
];

const PULL_A: readonly PplSlot[] = [
  moderate("lat-pulldown", "pull-up"),
  heavy("barbell-row", "inverted-row"),
  moderate("seated-cable-row", "one-arm-dumbbell-row"),
  isolation("face-pull", "band-face-pull", 12, 20),
  isolation("barbell-curl", "dumbbell-curl", 8, 12),
];

const PULL_B: readonly PplSlot[] = [
  moderate("chin-up", "chin-up"),
  moderate("chest-supported-dumbbell-row", "band-row"),
  isolation("reverse-pec-deck", "dumbbell-reverse-fly", 12, 20),
  isolation("incline-dumbbell-curl", "dumbbell-curl", 10, 15),
  isolation("hammer-curl", "hammer-curl", 10, 15),
];

const LEGS_A: readonly PplSlot[] = [
  heavy("barbell-back-squat", "bulgarian-split-squat"),
  heavy("romanian-deadlift", "dumbbell-romanian-deadlift"),
  moderate("leg-extension", "split-squat", 3, 10, 15),
  isolation("lying-leg-curl", "slider-leg-curl", 10, 15),
  isolation("standing-calf-raise", "single-leg-calf-raise", 12, 20),
  isolation("cable-crunch", "hanging-knee-raise", 10, 15),
];

const LEGS_B: readonly PplSlot[] = [
  moderate("leg-press", "goblet-squat"),
  heavy("deadlift", "dumbbell-romanian-deadlift", 3, 5, 8),
  moderate("dumbbell-lunge", "split-squat"),
  moderate("hip-thrust", "single-leg-glute-bridge"),
  isolation("standing-calf-raise", "single-leg-calf-raise", 12, 20),
  isolation("hanging-leg-raise", "hanging-knee-raise", 8, 12),
];

// With three days each muscle is trained once a week, so each day takes the A
// list plus one slot from B, and the first two lifts get an extra set.
const threeDay = (a: readonly PplSlot[], extra: PplSlot): readonly PplSlot[] => [
  withExtraSets(a[0], 1),
  withExtraSets(a[1], 1),
  ...a.slice(2),
  extra,
];

export const PPL_TEMPLATES: Record<PplVariant, PplTemplate> = {
  "3day": {
    name: "Push / Pull / Legs (3 day)",
    daysPerWeek: 3,
    notes: "Each muscle group is trained once a week. The 6 day version trains each one twice.",
    days: [
      { name: "Push", focus: "push", slots: threeDay(PUSH_A, PUSH_B[3]) },
      { name: "Pull", focus: "pull", slots: threeDay(PULL_A, PULL_B[3]) },
      { name: "Legs", focus: "legs", slots: threeDay(LEGS_A, LEGS_B[0]) },
    ],
  },
  "6day": {
    name: "Push / Pull / Legs (6 day)",
    daysPerWeek: 6,
    notes: "Each muscle group is trained twice a week, once on an A day and once on a B day.",
    days: [
      { name: "Push A", focus: "push", slots: PUSH_A },
      { name: "Pull A", focus: "pull", slots: PULL_A },
      { name: "Legs A", focus: "legs", slots: LEGS_A },
      { name: "Push B", focus: "push", slots: PUSH_B },
      { name: "Pull B", focus: "pull", slots: PULL_B },
      { name: "Legs B", focus: "legs", slots: LEGS_B },
    ],
  },
};

/** Every library slug a variant refers to, gym and home options together. */
export function pplSlugs(variant: PplVariant): string[] {
  const slugs = new Set<string>();
  for (const day of PPL_TEMPLATES[variant].days) {
    for (const slot of day.slots) {
      slugs.add(slot.gym);
      slugs.add(slot.home);
    }
  }
  return [...slugs].sort();
}

/** An exercise can be done when every equipment code it lists is owned. Bodyweight is always owned. */
export function isExerciseAvailable(
  exercise: Pick<Exercise, "equipment">,
  owned: readonly EquipmentCode[],
): boolean {
  return exercise.equipment.every((code) => code === "bodyweight" || owned.includes(code));
}

export type SlotSource = "gym" | "home" | "substitute";

export interface ResolvedSlot {
  exercise: Exercise;
  source: SlotSource;
}

/**
 * Picks the exercise for a slot: the gym option if the equipment allows it,
 * then the home option, then the closest available exercise with the same
 * movement pattern and primary muscle. Exercises in `used` (already in this
 * day) are skipped. Returns null when nothing fits.
 */
export function resolveSlot(
  slot: Pick<PplSlot, "gym" | "home">,
  library: readonly Exercise[],
  owned: readonly EquipmentCode[],
  used: ReadonlySet<Uuid> = new Set(),
): ResolvedSlot | null {
  const live = library.filter((e) => e.deleted_at === null);
  const bySlug = (slug: string) => live.find((e) => e.slug === slug && e.user_id === null);
  const gym = bySlug(slot.gym);
  const home = bySlug(slot.home);
  const usable = (e: Exercise) => !used.has(e.id) && isExerciseAvailable(e, owned);

  if (gym && usable(gym)) return { exercise: gym, source: "gym" };
  if (home && usable(home)) return { exercise: home, source: "home" };

  const reference = gym ?? home;
  if (!reference) return null;
  const candidates = live
    .filter(
      (e) =>
        e.id !== reference.id &&
        e.movement_pattern === reference.movement_pattern &&
        e.primary_muscle === reference.primary_muscle &&
        usable(e),
    )
    .sort((a, b) => substituteRank(a, reference) - substituteRank(b, reference) || a.slug.localeCompare(b.slug));
  return candidates.length > 0 ? { exercise: candidates[0], source: "substitute" } : null;
}

// Same ladder first, nearest rung first, then everything else.
function substituteRank(candidate: Exercise, reference: Exercise): number {
  const sameGroup = candidate.progression_group !== null && candidate.progression_group === reference.progression_group;
  if (!sameGroup) return 1000;
  return Math.abs((candidate.ladder_level ?? 0) - (reference.ladder_level ?? 0));
}

export interface PplWarning {
  day: string;
  slot: number;
  message: string;
}

export interface BuildPplInput {
  variant: PplVariant;
  userId: Uuid;
  equipment: EquipmentProfile;
  library: readonly Exercise[];
  now?: Date;
  /** Defaults to true. Only one program per user may be active, so the caller deactivates any other. */
  isActive?: boolean;
}

export interface PplBuild {
  program: Program;
  days: ProgramDay[];
  planned: PlannedExercise[];
  /** Slots that used a substitute or had to be skipped, in plain words. */
  warnings: PplWarning[];
}

export function buildPplProgram(input: BuildPplInput): PplBuild {
  const template = PPL_TEMPLATES[input.variant];
  const now = (input.now ?? new Date()).toISOString();
  const owned = input.equipment.equipment;
  const stamp = { created_at: now, updated_at: now, deleted_at: null };

  const program: Program = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    ...stamp,
    name: template.name,
    split: "ppl",
    days_per_week: template.daysPerWeek,
    is_active: input.isActive ?? true,
    version: 1,
    notes: template.notes,
  };

  const days: ProgramDay[] = [];
  const planned: PlannedExercise[] = [];
  const warnings: PplWarning[] = [];

  template.days.forEach((spec, dayIndex) => {
    const day: ProgramDay = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      ...stamp,
      program_id: program.id,
      position: dayIndex,
      name: spec.name,
      focus: spec.focus,
      equipment_profile_id: input.equipment.id,
    };
    days.push(day);

    const used = new Set<Uuid>();
    let position = 0;
    spec.slots.forEach((slot, slotIndex) => {
      const resolved = resolveSlot(slot, input.library, owned, used);
      if (!resolved) {
        warnings.push({
          day: spec.name,
          slot: slotIndex,
          message: `Skipped: no exercise fits your equipment for ${slot.gym} or ${slot.home}.`,
        });
        return;
      }
      if (resolved.source === "substitute") {
        warnings.push({
          day: spec.name,
          slot: slotIndex,
          message: `Used ${resolved.exercise.name} because ${slot.gym} and ${slot.home} need equipment you do not have.`,
        });
      }
      used.add(resolved.exercise.id);

      const external = resolved.exercise.load_type === "external";
      planned.push({
        id: crypto.randomUUID(),
        user_id: input.userId,
        ...stamp,
        program_day_id: day.id,
        position: position++,
        exercise_id: resolved.exercise.id,
        sets: slot.sets,
        rep_min: external ? slot.repMin : resolved.exercise.default_rep_min,
        rep_max: external ? slot.repMax : resolved.exercise.default_rep_max,
        target_rir: slot.targetRir,
        load: null,
        rest_seconds: slot.restSeconds,
        notes: null,
        is_active: true,
      });
    });

    if (position === 0) {
      warnings.push({ day: spec.name, slot: -1, message: "No exercises could be chosen for this day." });
    }
  });

  return { program, days, planned, warnings };
}
