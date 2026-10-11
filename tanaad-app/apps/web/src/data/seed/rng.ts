/** Deterministic PRNG so the demo seed is identical on every reset. */
export function makeRng(seed = 20260818) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    jitter: (base: number, pct: number) => Math.round(base * (1 + (next() * 2 - 1) * pct)),
  };
}
export type Rng = ReturnType<typeof makeRng>;
