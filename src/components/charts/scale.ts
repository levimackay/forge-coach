/** Maps a value in `domain` onto `range`. A zero-width domain maps to the middle of the range. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
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

/**
 * Which entries of `xs` (sorted pixel positions) can carry a label without two labels closer than `gap`.
 * Counts back from the last entry, which always has one. `keep` is an entry that must have one, such as the
 * selected point; labels too close to it are dropped.
 */
export function labelIndices(xs: readonly number[], gap: number, keep?: number): Set<number> {
  const out: number[] = [];
  for (let i = xs.length - 1; i >= 0; i--) {
    if (out.length === 0 || Math.abs(xs[i] - xs[out[out.length - 1]]) >= gap) out.push(i);
  }
  if (keep === undefined || out.includes(keep)) return new Set(out);
  return new Set([...out.filter((i) => Math.abs(xs[i] - xs[keep]) >= gap), keep]);
}
