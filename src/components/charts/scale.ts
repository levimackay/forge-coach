/** Maps a value in `domain` onto `range`. A zero-width domain maps to the middle of the range. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

// Steps of 1, 2 or 5 times a power of ten read as round numbers on an axis.
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const f = rough / power;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * power;
}

const clean = (n: number): number => Number(n.toFixed(10));

export interface Ticks {
  ticks: number[];
  /** Axis bounds, widened to the first and last tick. */
  min: number;
  max: number;
}

/** Round tick values covering [min, max]. A flat series gets a band around it so the line is not pinned to an edge. */
export function niceTicks(min: number, max: number, target = 4): Ticks {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / target);
  const start = clean(Math.floor(lo / step) * step);
  const end = clean(Math.ceil(hi / step) * step);
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(clean(v));
  return { ticks, min: start, max: end };
}

/** Index of the entry in `xs` closest to `x`. `xs` must be sorted ascending and not empty. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = 0;
  let bestDistance = Math.abs(xs[0] - x);
  for (let i = 1; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
