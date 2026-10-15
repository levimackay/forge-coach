import type {
  EquipmentCode,
  IsoDateTime,
  Muscle,
  PrescriptionSnapshot,
  ProgressionAction,
  Unit,
} from "@/lib/domain/types";

/** 2.5 stays 2.5, 50 stays 50, 22.499999 becomes 22.5. */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatLoad(load: number, unit: Unit): string {
  return `${formatNumber(load)} ${unit}`;
}

export function formatRepRange(min: number, max: number): string {
  return min === max ? String(min) : `${min} to ${max}`;
}

type Prescription = Pick<PrescriptionSnapshot, "sets" | "rep_min" | "rep_max" | "target_rir">;

/** "3 sets of 8 to 12 reps, 2 left in reserve" */
export function formatPrescription(p: Prescription): string {
  const sets = `${p.sets} ${p.sets === 1 ? "set" : "sets"} of ${formatRepRange(p.rep_min, p.rep_max)}`;
  return `${sets}, ${p.target_rir} RIR`;
}

/** 75 seconds becomes "1:15". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

type Zone = { timeZone?: string };

export function formatDate(iso: IsoDateTime, { timeZone }: Zone = {}): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateLong(iso: IsoDateTime, { timeZone }: Zone = {}): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone }).format(
    new Date(iso),
  );
}

export function formatTime(iso: IsoDateTime, { timeZone }: Zone = {}): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function formatMonth(iso: IsoDateTime, { timeZone }: Zone = {}): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone }).format(new Date(iso));
}

/** Date-only strings (YYYY-MM-DD) shown without a timezone shift. */
export function formatDay(date: string): string {
  return formatDate(`${date}T12:00:00Z`, { timeZone: "UTC" });
}

export const ACTION_LABEL: Record<ProgressionAction, string> = {
  increase_load: "Weight goes up",
  increase_reps: "Aim for more reps",
  hold: "Stays the same",
  advance_variation: "Harder variation",
  regress_variation: "Easier variation",
  deload: "Lighter to rebuild",
  reduce_after_gap: "Eased back after a break",
  pain_hold: "Held because of pain",
  substitute_equipment: "Swapped for your equipment",
};

/** Actions that mean the lifter earned something. Only these get the accent. */
export const PROGRESS_ACTIONS: ReadonlySet<ProgressionAction> = new Set([
  "increase_load",
  "increase_reps",
  "advance_variation",
]);

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  triceps: "Triceps",
  biceps: "Biceps",
  forearms: "Forearms",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abs",
};

export const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];

export const EQUIPMENT_NAME: Record<EquipmentCode, string> = {
  bodyweight: "Bodyweight",
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

export const ALL_EQUIPMENT = Object.keys(EQUIPMENT_NAME) as EquipmentCode[];

/** "1 set" or "3 sets". */
export function countLabel(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
