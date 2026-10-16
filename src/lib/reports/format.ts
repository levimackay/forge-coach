import type { IsoDate, LoadType, PrescriptionSnapshot } from "@/lib/domain/types";
import type { ReportEquipment, ReportGoal, ReportProgram } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(d: IsoDate): string {
  const [, month, day] = d.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

export const fullDate = (d: IsoDate): string => `${shortDate(d)}, ${d.slice(0, 4)}`;

export function dateRange(from: IsoDate, to: IsoDate): string {
  return from.slice(0, 4) === to.slice(0, 4) ? `${shortDate(from)} to ${fullDate(to)}` : `${fullDate(from)} to ${fullDate(to)}`;
}

/** At most one decimal, no trailing zero, never "-0". */
export const num = (n: number, digits = 1): string => String(Number(n.toFixed(digits)));

export function signed(n: number, digits = 1): string {
  const s = num(n, digits);
  return n > 0 && s !== "0" ? `+${s}` : s;
}

export const words = (s: string): string => s.replace(/_/g, " ");

/** Text the athlete typed into a one-line field, kept on one line so it cannot pose as report structure. */
export const oneLine = (s: string): string => s.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ");

export const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;

export function setText(set: { reps: number; load: number | null }, loadType: LoadType): string {
  const load = set.load !== null && set.load > 0 ? num(set.load) : null;
  if (loadType === "external") return load ? `${load} x ${set.reps}` : `${set.reps} reps`;
  if (loadType === "bodyweight") return load ? `+${load} x ${set.reps}` : `${set.reps} reps`;
  return load ? `${set.reps} reps, ${load} assist` : `${set.reps} reps`;
}

export function prescriptionText(p: Pick<PrescriptionSnapshot, "sets" | "rep_min" | "rep_max" | "target_rir" | "load">): string {
  const reps = p.rep_min === p.rep_max ? `${p.rep_min}` : `${p.rep_min} to ${p.rep_max}`;
  return `${p.sets} x ${reps} reps, RIR ${p.target_rir}${p.load !== null ? `, ${num(p.load)}` : ""}`;
}

export function goalText(g: ReportGoal): string {
  const focus = g.focus_muscles.length ? ` (focus: ${g.focus_muscles.map(words).join(", ")})` : "";
  const by = g.target_date ? `, by ${fullDate(g.target_date)}` : "";
  return `${words(g.kind)}: ${oneLine(g.description)}${focus}${by}`;
}

export function equipmentText(e: ReportEquipment): string {
  const steps = [
    e.dumbbell_increment !== null ? `dumbbell step ${num(e.dumbbell_increment)}` : null,
    e.dumbbell_max !== null ? `dumbbells up to ${num(e.dumbbell_max)}` : null,
    e.barbell_increment !== null ? `barbell step ${num(e.barbell_increment)}` : null,
  ].filter((x): x is string => x !== null);
  const kit = e.equipment.length ? e.equipment.map(words).join(", ") : "nothing listed";
  return `${oneLine(e.name)}${e.is_default ? " (default)" : ""}: ${kit}${steps.length ? `; ${steps.join(", ")}` : ""}`;
}

const SPLIT_LABEL: Record<ReportProgram["split"], string> = {
  ppl: "push/pull/legs",
  upper_lower: "upper/lower",
  full_body: "full body",
  custom: "custom split",
};

export const programHeadline = (p: ReportProgram): string =>
  `${oneLine(p.name)} (${SPLIT_LABEL[p.split]}), ${p.days_per_week} days per week, version ${p.version}`;

export function programText(p: ReportProgram): string {
  const days = p.days.map((d) => `${oneLine(d.name)} (${d.focus}, ${plural(d.exercises.length, "exercise")})`).join("; ");
  return `${programHeadline(p)}${days ? `. Days: ${days}` : ""}`;
}
