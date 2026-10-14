import type { Rng } from './rng';
import { type Board, type GenMode, dirBetween } from './types';

/** 中央から宝までのマス列（path[0] が中央、末尾が宝）から Board を作る。 */
export function boardFromPath(
  n: number,
  path: ArrayLike<number>,
  length: number,
  seed: number,
  mode: GenMode,
): Board {
  const size = 2 * n + 1;
  const dirs = new Uint8Array(size * size);
  for (let i = 0; i + 1 < length; i++) dirs[path[i]] = dirBetween(path[i], path[i + 1], size);
  return { n, size, dirs, treasure: path[length - 1], length, seed, mode };
}

/**
 * 中央からの Chebyshev 距離が [ceil(n/3), n] のマスを一様に選ぶ（最低 1）。
 * accept が false を返すマスは選ばない。
 */
export function pickFarCell(rng: Rng, n: number, accept: (r: number, c: number) => boolean): number {
  const size = 2 * n + 1;
  const minDist = Math.max(1, Math.ceil(n / 3));
  for (;;) {
    const r = rng.int(size);
    const c = rng.int(size);
    if (Math.max(Math.abs(r - n), Math.abs(c - n)) < minDist) continue;
    if (accept(r, c)) return r * size + c;
  }
}
