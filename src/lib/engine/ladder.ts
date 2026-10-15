import type { EquipmentCode, Exercise, Unit } from "@/lib/domain/types";
import { ENGINE_CONFIG } from "./config";
import type { EquipmentLike } from "./types";
import { isPositive } from "./util";

const LABELS: Record<EquipmentCode, string> = {
  bodyweight: "bodyweight",
  pullup_bar: "a pull-up bar",
  dip_bars: "dip bars",
  rings: "rings",
  dumbbells: "dumbbells",
  bands: "bands",
  kettlebells: "kettlebells",
  barbell: "a barbell",
  rack: "a rack",
  bench: "a bench",
  cable: "a cable station",
  machines: "machines",
};

export const equipmentLabel = (code: EquipmentCode): string => LABELS[code];

// Every listed piece is required, except bodyweight which is always available.
// With no profile there is nothing to check against, so nothing is missing.
export function missingEquipment(exercise: Pick<Exercise, "equipment">, equipment: EquipmentLike | null): EquipmentCode[] {
  if (!equipment) return [];
  return exercise.equipment.filter((code) => code !== "bodyweight" && !equipment.equipment.includes(code));
}

export const isUsable = (exercise: Pick<Exercise, "equipment">, equipment: EquipmentLike | null): boolean =>
  missingEquipment(exercise, equipment).length === 0;

const bySlug = (a: Exercise, b: Exercise): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

// Same movement pattern and primary muscle, usable with this equipment. Same
// ladder first, then nearest ladder level (ties go to the easier rung), then
// same load type, then slug so the result never depends on library order.
export function substituteForEquipment(
  exercise: Exercise,
  library: Exercise[],
  equipment: EquipmentLike | null,
): Exercise | null {
  const grouped = exercise.progression_group !== null && exercise.ladder_level !== null;
  const rank = (c: Exercise): [number, number, number] => {
    const sameGroup = grouped && c.progression_group === exercise.progression_group && c.ladder_level !== null;
    const distance = sameGroup ? Math.abs((c.ladder_level as number) - (exercise.ladder_level as number)) : 0;
    const easier = sameGroup && (c.ladder_level as number) < (exercise.ladder_level as number) ? 0 : 1;
    return [sameGroup ? 0 : 1, distance * 2 + easier, c.load_type === exercise.load_type ? 0 : 1];
  };
  const candidates = library
    .filter(
      (c) =>
        c.id !== exercise.id &&
        c.deleted_at === null &&
        c.movement_pattern === exercise.movement_pattern &&
        c.primary_muscle === exercise.primary_muscle &&
        isUsable(c, equipment),
    )
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return bySlug(a, b);
    });
  return candidates[0] ?? null;
}

// Next harder (dir 1) or easier (dir -1) rung of the exercise's ladder that
// this equipment can do. Unavailable rungs are skipped.
export function ladderStep(
  exercise: Exercise,
  library: Exercise[],
  equipment: EquipmentLike | null,
  dir: 1 | -1,
): Exercise | null {
  if (exercise.progression_group === null || exercise.ladder_level === null) return null;
  const level = exercise.ladder_level;
  const rungs = library
    .filter(
      (c) =>
        c.id !== exercise.id &&
        c.deleted_at === null &&
        c.progression_group === exercise.progression_group &&
        c.ladder_level !== null &&
        (dir === 1 ? c.ladder_level > level : c.ladder_level < level) &&
        isUsable(c, equipment),
    )
    .sort((a, b) => (dir === 1 ? 1 : -1) * ((a.ladder_level as number) - (b.ladder_level as number)) || bySlug(a, b));
  return rungs[0] ?? null;
}

export type LoadKind = "dumbbell" | "barbell" | "kettlebell" | "machine" | "other";

export function loadKind(exercise: Pick<Exercise, "equipment">): LoadKind {
  const eq = exercise.equipment;
  if (eq.includes("barbell")) return "barbell";
  if (eq.includes("dumbbells")) return "dumbbell";
  if (eq.includes("kettlebells")) return "kettlebell";
  if (eq.includes("cable") || eq.includes("machines")) return "machine";
  return "other";
}

const LOWER_BODY = new Set<Exercise["movement_pattern"]>(["squat", "hinge", "lunge"]);

// Smallest load step the athlete can actually make: their equipment profile
// first, then the exercise's own step, then the config default for the unit.
// Profile steps are entered in the athlete's unit. The exercise's own step is
// stored in pounds, so kg athletes get half of it, the same convention as
// ENGINE_CONFIG.increments (5, 10 and 8 lb become 2.5, 5 and 4 kg).
export function loadIncrement(exercise: Exercise, equipment: EquipmentLike | null, unit: Unit): number {
  const defaults = ENGINE_CONFIG.increments[unit];
  const kind = loadKind(exercise);
  const pounds = exercise.default_increment;
  const own = unit === "kg" && isPositive(pounds) ? pounds / 2 : pounds;
  switch (kind) {
    case "dumbbell":
      return [equipment?.dumbbell_increment, own].find(isPositive) ?? defaults.dumbbell;
    case "barbell":
      return (
        [equipment?.barbell_increment, own].find(isPositive) ??
        (LOWER_BODY.has(exercise.movement_pattern) ? defaults.barbellLower : defaults.barbellUpper)
      );
    case "kettlebell":
      return isPositive(own) ? own : defaults.kettlebell;
    case "machine":
      return isPositive(own) ? own : defaults.machine;
    default:
      return isPositive(own) ? own : defaults.other;
  }
}
