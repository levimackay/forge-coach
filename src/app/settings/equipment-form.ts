import type { EquipmentCode, EquipmentProfile } from "@/lib/domain/types";

/** Every piece of kit a profile can list. Bodyweight is always available, so it is not a choice. */
export const EQUIPMENT_OPTIONS: Record<Exclude<EquipmentCode, "bodyweight">, string> = {
  pullup_bar: "Pull-up bar",
  dip_bars: "Dip bars",
  rings: "Rings",
  dumbbells: "Dumbbells",
  bands: "Bands",
  kettlebells: "Kettlebells",
  barbell: "Barbell",
  rack: "Rack",
  bench: "Bench",
  cable: "Cable station",
  machines: "Machines",
};

export const EQUIPMENT_CODES = Object.keys(EQUIPMENT_OPTIONS) as Exclude<EquipmentCode, "bodyweight">[];

export interface EquipmentDraft {
  name: string;
  equipment: EquipmentCode[];
  dumbbellIncrement: string;
  dumbbellMax: string;
  barbellIncrement: string;
  isDefault: boolean;
}

const text = (n: number | null): string => (n === null ? "" : String(n));

export function draftFromProfile(profile: EquipmentProfile | null, firstProfile: boolean): EquipmentDraft {
  if (!profile) {
    return { name: "", equipment: ["bodyweight"], dumbbellIncrement: "", dumbbellMax: "", barbellIncrement: "", isDefault: firstProfile };
  }
  return {
    name: profile.name,
    equipment: profile.equipment,
    dumbbellIncrement: text(profile.dumbbell_increment),
    dumbbellMax: text(profile.dumbbell_max),
    barbellIncrement: text(profile.barbell_increment),
    isDefault: profile.is_default,
  };
}

export type NumberParse = { ok: true; value: number | null } | { ok: false; error: string };

const MAX_STEP = 1000;

/** Blank means "not set". Accepts a comma as the decimal mark, since many phone keyboards offer only that. */
export function parseOptionalNumber(input: string): NumberParse {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, error: "Enter a number such as 5 or 2.5." };
  const value = Number(trimmed);
  if (!(value > 0)) return { ok: false, error: "Enter a number above zero, or leave it blank." };
  if (value > MAX_STEP) return { ok: false, error: `Enter a number up to ${MAX_STEP}.` };
  return { ok: true, value };
}

type Fields = "name" | "dumbbellIncrement" | "dumbbellMax" | "barbellIncrement";

export type DraftResult =
  | { ok: true; value: Pick<EquipmentProfile, "name" | "equipment" | "dumbbell_increment" | "dumbbell_max" | "barbell_increment" | "is_default"> }
  | { ok: false; errors: Partial<Record<Fields, string>> };

export function parseDraft(draft: EquipmentDraft): DraftResult {
  const errors: Partial<Record<Fields, string>> = {};
  const name = draft.name.trim();
  if (name === "") errors.name = "Give this profile a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";

  const hasDumbbells = draft.equipment.includes("dumbbells");
  const hasBarbell = draft.equipment.includes("barbell");

  const dbInc = hasDumbbells ? parseOptionalNumber(draft.dumbbellIncrement) : ({ ok: true, value: null } as const);
  const dbMax = hasDumbbells ? parseOptionalNumber(draft.dumbbellMax) : ({ ok: true, value: null } as const);
  const bbInc = hasBarbell ? parseOptionalNumber(draft.barbellIncrement) : ({ ok: true, value: null } as const);
  if (!dbInc.ok) errors.dumbbellIncrement = dbInc.error;
  if (!dbMax.ok) errors.dumbbellMax = dbMax.error;
  if (!bbInc.ok) errors.barbellIncrement = bbInc.error;
  if (dbInc.ok && dbMax.ok && dbInc.value !== null && dbMax.value !== null && dbMax.value < dbInc.value) {
    errors.dumbbellMax = "The heaviest dumbbell cannot be lighter than the smallest step.";
  }

  if (Object.keys(errors).length > 0 || !dbInc.ok || !dbMax.ok || !bbInc.ok) return { ok: false, errors };

  // Bodyweight stays on the list: it is always available, and exercises list it as a requirement.
  const equipment = [...new Set<EquipmentCode>(["bodyweight", ...draft.equipment])];
  return {
    ok: true,
    value: {
      name,
      equipment,
      dumbbell_increment: dbInc.value,
      dumbbell_max: dbMax.value,
      barbell_increment: bbInc.value,
      is_default: draft.isDefault,
    },
  };
}
