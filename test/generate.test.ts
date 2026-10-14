import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/core/generate';
import { Dir, centerIndex } from '../src/core/types';
import { createRng } from '../src/core/rng';
import { validateBoard } from '../src/core/validate';

const NS = [1, 2, 3, 4, 5, 10, 50];
const SEEDS = 200;

describe.each([
  ['inflate (random density)', {}],
  ['inflate density 0.5', { density: 0.5 }],
  ['inflate density 0.9', { density: 0.9 }],
  ['hamiltonian', { density: 1 }],
])('%s', (_, options) => {
  it.each(NS)('n=%i: every board is valid', (n) => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const b = generateBoard(n, seed, { fullChance: 0, ...options });
      const err = validateBoard(b);
      expect(err, `n=${n} seed=${seed}`).toBeNull();
      expect(b.dirs[centerIndex(n)]).toBe(Dir.Up);
    }
  });
});

describe('generateBoard', () => {
  it('is deterministic for the same seed', () => {
    const a = generateBoard(20, 12345);
    const b = generateBoard(20, 12345);
    expect(a.treasure).toBe(b.treasure);
    expect(Array.from(a.dirs)).toEqual(Array.from(b.dirs));
  });

  it('density 1 covers every cell', () => {
    for (const n of [1, 2, 3, 8, 9, 40, 41]) {
      const b = generateBoard(n, n * 7, { density: 1 });
      expect(b.length).toBe(b.size * b.size);
      expect(b.mode).toBe('hamiltonian');
    }
  });

  it('hits the target density for inflate mode', () => {
    for (const density of [0.5, 0.7, 0.9]) {
      for (const n of [10, 50]) {
        const b = generateBoard(n, 99, { density });
        expect(Math.abs(b.length / (b.size * b.size) - density)).toBeLessThan(0.01);
      }
    }
  });

  it('route is much longer than the move limit for n >= 3', () => {
    for (const n of [3, 5, 10, 50]) {
      for (let seed = 0; seed < 50; seed++) {
        expect(generateBoard(n, seed).length - 1, `n=${n} seed=${seed}`).toBeGreaterThan(12 * n);
      }
    }
  });

  it('n=200 is generated quickly', () => {
    for (const density of [0.7, 1]) {
      const t0 = performance.now();
      const b = generateBoard(200, 1, { density });
      expect(validateBoard(b)).toBeNull();
      expect(performance.now() - t0).toBeLessThan(500);
    }
  });
});

// 本番では盤面を検証しないので、遊ぶときと同じ設定（密度・100% モードの抽選込み）で
// いろいろな N の盤面を作って確かめる。N は 1〜2000 から対数的に散らばるように選ぶ（両端は必ず含める）
const SAMPLE = 100;
const sampleRng = createRng(20241208);
const samples = Array.from({ length: SAMPLE }, (_, i) => {
  const n = i === 0 ? 1 : i === 1 ? 2000 : Math.max(1, Math.round(Math.exp(sampleRng.next() * Math.log(2000))));
  return { n, seed: sampleRng.int(2 ** 32) };
});

describe(`${SAMPLE} boards with production settings`, () => {
  it.each(samples)('n=$n seed=$seed', ({ n, seed }) => {
    expect(validateBoard(generateBoard(n, seed))).toBeNull();
  }, 30_000);
});
