import { boardFromPath } from './board';
import { moveLimit } from './game';
import { hamiltonianPath } from './hamiltonian';
import { inflatePath } from './inflate';
import { createRng } from './rng';
import type { Board } from './types';

export interface GenerateOptions {
  /** 経路密度を固定する（0.5〜1）。省略時はシードから決める */
  density?: number;
  /** density 省略時に 100% モードを選ぶ確率 */
  fullChance?: number;
}

export const MIN_DENSITY = 0.5;
export const MAX_DENSITY = 0.9;
export const DEFAULT_FULL_CHANCE = 0.15;

/** 迷路型への寄せ具合（depthBias）: 上限、密度に対する傾き、シードごとの揺らぎ幅 */
const MAX_DEPTH_BIAS = 0.7;
const DEPTH_BIAS_SLOPE = 0.6;
const DEPTH_BIAS_JITTER = 0.15;
/** 経路長の下限は盤面の 95% を超えない（小さい盤面で埋め尽くせないため） */
const MAX_MIN_FILL = 0.95;
/** 経路が目標より短すぎたときに引き直す回数 */
const MAX_RETRIES = 30;

/**
 * 盤面を生成する。同じ (n, seed, options) なら必ず同じ盤面になる。
 * - 密度 1: 十字＋ブロック木＋backbite のハミルトン路（hamiltonian.ts）
 * - それ以外: 辺の膨張（inflate.ts）
 */
export function generateBoard(n: number, seed: number, options: GenerateOptions = {}): Board {
  if (!Number.isInteger(n) || n < 1) throw new Error(`invalid n: ${n}`);
  const rng = createRng(seed);
  const size = 2 * n + 1;
  const cells = size * size;

  const density =
    options.density ??
    (rng.next() < (options.fullChance ?? DEFAULT_FULL_CHANCE) ? 1 : rng.range(MIN_DENSITY, MAX_DENSITY));

  if (density >= 1) {
    const path = hamiltonianPath(n, rng);
    return boardFromPath(n, path, path.length, seed, 'hamiltonian');
  }

  // 密度が低いほど迷路型（直前の辺を優先）に寄せ、高いほど網目型（一様）に寄せる
  const t = (MAX_DENSITY - Math.min(Math.max(density, MIN_DENSITY), MAX_DENSITY)) / (MAX_DENSITY - MIN_DENSITY);
  const depthBias = Math.min(MAX_DEPTH_BIAS, Math.max(0, DEPTH_BIAS_SLOPE * t + rng.range(-DEPTH_BIAS_JITTER, DEPTH_BIAS_JITTER)));
  // 矢印を素直にたどる（L-1 手）だけでは 12N 手に収まらない長さを下限にする。
  // N=3, 4 では密度 0.5 だとこの下限を下回る。N<=2 は盤面が小さすぎて原理的に不可能。
  const minLength = Math.min(moveLimit(n) + 3, Math.floor(MAX_MIN_FILL * cells));
  const targetLength = Math.max(Math.round(density * cells), minLength);

  // 小さい盤面では、膨張が途中で行き詰まって極端に短くなることがある。そのときは引き直す
  let best = inflatePath(n, rng, { targetLength, depthBias });
  for (let tries = 0; tries < MAX_RETRIES && best.length < targetLength - 2; tries++) {
    const r = inflatePath(n, rng, { targetLength, depthBias });
    if (r.length > best.length) best = r;
  }
  return boardFromPath(n, best.path, best.length, seed, 'inflate');
}
