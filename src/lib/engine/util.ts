import type { IsoDateTime, Unit } from "@/lib/domain/types";

const DAY_MS = 86_400_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// The epsilon keeps 22.5 / 2.5 style divisions from landing a hair under the integer.
export const floorToStep = (n: number, step: number): number => round2(Math.floor(n / step + 1e-9) * step);
export const ceilToStep = (n: number, step: number): number => round2(Math.ceil(n / step - 1e-9) * step);

export const fmt = (n: number): string => String(round2(n));
export const fmtLoad = (n: number, unit: Unit): string => `${fmt(n)} ${unit}`;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function daysBetween(fromIso: IsoDateTime, toIso: IsoDateTime): number {
  const diff = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff / DAY_MS)) : 0;
}

export const sameLoad = (a: number | null, b: number | null): boolean =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.01;

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const isPositive = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
