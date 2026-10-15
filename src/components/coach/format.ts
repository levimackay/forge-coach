import type { IsoDateTime, ProgressionAction, Unit } from "@/lib/domain/types";
import { num } from "@/lib/reports/format";

/** "front_delts" becomes "Front delts". */
export function sentence(snake: string): string {
  const spaced = snake.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function loadText(load: number | null, unit: Unit, empty = "Not set"): string {
  return load === null ? empty : `${num(load)} ${unit}`;
}

export function repRangeText(min: number, max: number): string {
  return min === max ? `${min} reps` : `${min} to ${max} reps`;
}

export function restText(seconds: number | null): string {
  if (seconds === null) return "Not set";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 days ago", then a plain date. `now` is an input so output is stable. */
export function timeAgo(iso: IsoDateTime, nowIso: IsoDateTime): string {
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return "";
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return "just now";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (diff < HOUR) return unit(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return unit(Math.floor(diff / HOUR), "hour");
  if (diff < 14 * DAY) return unit(Math.floor(diff / DAY), "day");
  return dateText(iso, nowIso);
}

/** Short calendar date in the device's locale, e.g. "Oct 15". Adds the year when `nowIso` is in a different one. */
export function dateText(iso: IsoDateTime, nowIso?: IsoDateTime, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const otherYear = nowIso !== undefined && new Date(nowIso).getUTCFullYear() !== d.getUTCFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(otherYear ? { year: "numeric" } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

export function dateTimeText(iso: IsoDateTime, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

export const ACTION_LABEL: Record<ProgressionAction, string> = {
  increase_load: "Load up",
  increase_reps: "Add reps",
  hold: "Hold",
  advance_variation: "Harder variation",
  regress_variation: "Easier variation",
  deload: "Deload",
  reduce_after_gap: "Eased back after a break",
  pain_hold: "Held for pain",
  substitute_equipment: "Swapped for equipment",
};
