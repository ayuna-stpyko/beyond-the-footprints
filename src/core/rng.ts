/** 再現可能な盤面生成のためのシード付き PRNG (mulberry32)。 */
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** [0, n) の整数 */
  int(n: number): number;
  /** [lo, hi) の実数 */
  range(lo: number, hi: number): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
  };
}

export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}
