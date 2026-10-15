export interface StepBounds {
  step: number;
  min?: number;
  max?: number;
}

export function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function clamp(n: number, min?: number, max?: number): number {
  let out = n;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

/** Decimals to keep: the finer of the step and the value, so 12.5 with a step of 5 stays 12.5. At most 3. */
const precision = (step: number, value: number): number => Math.min(Math.max(decimalsOf(step), decimalsOf(value)), 3);

/** One tap of the stepper. Rounds to the step's precision so 2.5 + 2.5 is never 5.000000001. */
export function stepValue(value: number | null, direction: 1 | -1, { step, min, max }: StepBounds): number {
  const base = value ?? min ?? 0;
  const next = Number((base + direction * step).toFixed(precision(step, base)));
  return clamp(next, min, max);
}

/** Parses what a person typed. Accepts a decimal comma. Returns null when there is no number. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: number, step: number): string {
  return value.toFixed(precision(step, value)).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}
