import type { EquipmentCode, EquipmentProfile, Exercise, Goal, Muscle, Profile, Unit } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { requireUserId } from "@/lib/local/session";
import { putRow, putRows, type RowInput } from "@/lib/local/write";
import { PPL_TEMPLATES, resolveSlot, type PplVariant } from "@/lib/templates/ppl";
import { createPplProgram } from "./program-build";

export type Place = "home" | "gym";
export type GoalKind = Goal["kind"];

export interface OnboardingDraft {
  name: string;
  unit: Unit;
  bodyweight: number | null;
  atHome: boolean;
  atGym: boolean;
  /** The place the program is built around. */
  main: Place;
  /** Home equipment beyond bodyweight, which is always there. */
  homeEquipment: EquipmentCode[];
  /** Null means "use the default for this unit" until the lifter changes it. */
  dumbbellIncrement: number | null;
  dumbbellMax: number | null;
  goalKind: GoalKind;
  goalNote: string;
  focus: Muscle[];
  variant: PplVariant;
}

export const HOME_CHOICES: EquipmentCode[] = [
  "pullup_bar",
  "dip_bars",
  "rings",
  "dumbbells",
  "bands",
  "kettlebells",
  "bench",
  "barbell",
  "rack",
];

/** What a commercial gym is assumed to have. */
export const GYM_EQUIPMENT: EquipmentCode[] = [
  "bodyweight",
  "pullup_bar",
  "dip_bars",
  "dumbbells",
  "bands",
  "barbell",
  "rack",
  "bench",
  "cable",
  "machines",
];

export const GOAL_LABEL: Record<GoalKind, string> = {
  hypertrophy: "Build muscle",
  strength: "Get stronger",
  skill: "Learn a skill, like a pull-up or handstand",
  body_composition: "Change my body composition",
  other: "Something else",
};

export const GOAL_KINDS = Object.keys(GOAL_LABEL) as GoalKind[];

export function unitDefaults(unit: Unit) {
  return unit === "lb"
    ? { dumbbellIncrement: 5, dumbbellMax: 50, bodyweight: { min: 50, max: 700 } }
    : { dumbbellIncrement: 2.5, dumbbellMax: 25, bodyweight: { min: 25, max: 320 } };
}

export function emptyDraft(profile: Pick<Profile, "display_name" | "unit" | "bodyweight"> | null): OnboardingDraft {
  return {
    name: profile?.display_name ?? "",
    unit: profile?.unit ?? "lb",
    bodyweight: profile?.bodyweight ?? null,
    atHome: true,
    atGym: false,
    main: "home",
    homeEquipment: [],
    dumbbellIncrement: null,
    dumbbellMax: null,
    goalKind: "hypertrophy",
    goalNote: "",
    focus: [],
    variant: "3day",
  };
}

export const resolvedIncrement = (d: OnboardingDraft): number =>
  d.dumbbellIncrement ?? unitDefaults(d.unit).dumbbellIncrement;
export const resolvedMax = (d: OnboardingDraft): number => d.dumbbellMax ?? unitDefaults(d.unit).dumbbellMax;

/** The place that actually builds the program, which is never one the lifter turned off. */
export function mainPlace(d: OnboardingDraft): Place {
  if (d.atHome && d.atGym) return d.main;
  return d.atGym ? "gym" : "home";
}

export type StepErrors = Partial<Record<"name" | "bodyweight" | "places" | "dumbbell_increment" | "dumbbell_max", string>>;

export const STEP_COUNT = 4;

/** Returns what is wrong with a step, or an empty object when it can be left. */
export function validateStep(step: number, d: OnboardingDraft): StepErrors {
  const errors: StepErrors = {};
  if (step === 0) {
    if (d.name.trim() === "") errors.name = "Enter the name you want to see in the app.";
    const range = unitDefaults(d.unit).bodyweight;
    if (d.bodyweight === null) errors.bodyweight = "Enter your bodyweight.";
    else if (d.bodyweight < range.min || d.bodyweight > range.max) {
      errors.bodyweight = `Enter a bodyweight between ${range.min} and ${range.max} ${d.unit}.`;
    }
  }
  if (step === 1) {
    if (!d.atHome && !d.atGym) errors.places = "Choose at least one place you train.";
    if (d.atHome && d.homeEquipment.includes("dumbbells")) {
      const inc = resolvedIncrement(d);
      const max = resolvedMax(d);
      if (!(inc > 0)) errors.dumbbell_increment = "The jump between dumbbells must be more than zero.";
      if (!(max >= inc)) errors.dumbbell_max = "The heaviest dumbbell cannot be lighter than the jump.";
    }
  }
  return errors;
}

type EquipmentInput = RowInput<EquipmentProfile>;

/** The equipment profiles to create: Home and/or Gym, with the main place marked as the default. */
export function buildEquipmentInputs(d: OnboardingDraft): EquipmentInput[] {
  const main = mainPlace(d);
  const out: EquipmentInput[] = [];
  if (d.atHome) {
    const dumbbells = d.homeEquipment.includes("dumbbells");
    out.push({
      name: "Home",
      equipment: ["bodyweight", ...HOME_CHOICES.filter((c) => d.homeEquipment.includes(c))],
      dumbbell_increment: dumbbells ? resolvedIncrement(d) : null,
      dumbbell_max: dumbbells ? resolvedMax(d) : null,
      barbell_increment: null,
      is_default: main === "home",
    });
  }
  if (d.atGym) {
    out.push({
      name: "Gym",
      equipment: GYM_EQUIPMENT,
      dumbbell_increment: unitDefaults(d.unit).dumbbellIncrement,
      dumbbell_max: null,
      barbell_increment: null,
      is_default: main === "gym",
    });
  }
  return out;
}

export interface PreviewDay {
  name: string;
  exercises: { name: string; swapped: boolean }[];
}

export interface Preview {
  days: PreviewDay[];
  /** Slots with no fitting exercise at all. */
  skipped: number;
}

/** What the program would contain, using the same slot rules as the real build. */
export function previewProgram(variant: PplVariant, owned: readonly EquipmentCode[], library: readonly Exercise[]): Preview {
  let skipped = 0;
  const days = PPL_TEMPLATES[variant].days.map((spec): PreviewDay => {
    const used = new Set<string>();
    const exercises: PreviewDay["exercises"] = [];
    for (const slot of spec.slots) {
      const resolved = resolveSlot(slot, library, owned, used);
      if (!resolved) {
        skipped += 1;
        continue;
      }
      used.add(resolved.exercise.id);
      exercises.push({ name: resolved.exercise.name, swapped: resolved.source === "substitute" });
    }
    return { name: spec.name, exercises };
  });
  return { days, skipped };
}

/**
 * Creates the profile's equipment, goal and first program, then marks the account as set
 * up. All of it is one local transaction and the profile row goes last, so an interrupted
 * save leaves nothing behind and the lifter simply starts onboarding again.
 */
export async function saveOnboarding(
  draft: OnboardingDraft,
  library: Exercise[],
  now: Date = new Date(),
): Promise<void> {
  const userId = requireUserId();
  const db = getDb();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  await db.transaction(
    "rw",
    [db.profiles, db.goals, db.equipment_profiles, db.programs, db.program_days, db.planned_exercises, db.outbox],
    async () => {
      const equipment = await putRows("equipment_profiles", buildEquipmentInputs(draft));
      const main = equipment.find((e) => e.is_default) ?? equipment[0];
      await createPplProgram({ variant: draft.variant, equipment: main, library, now });

      const note = draft.goalNote.trim();
      await putRows("goals", [
        {
          kind: draft.goalKind,
          description: note === "" ? GOAL_LABEL[draft.goalKind] : note,
          focus_muscles: draft.focus,
          target_date: null,
          active: true,
        },
      ]);

      await putRow("profiles", {
        user_id: userId,
        display_name: draft.name.trim(),
        unit: draft.unit,
        bodyweight: draft.bodyweight,
        timezone,
        onboarded_at: now.toISOString(),
      });
    },
  );
}
