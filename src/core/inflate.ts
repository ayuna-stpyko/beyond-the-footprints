import { pickFarCell } from './board';
import type { Rng } from './rng';

export interface InflateOptions {
  /** 目標のマス数。届かなければ飽和した時点で止まる */
  targetLength: number;
  /** 直前に追加した辺を優先して膨らませる確率（大きいほど迷路型、小さいほど網目型） */
  depthBias: number;
}

export interface InflateResult {
  path: Int32Array;
  length: number;
}

/**
 * 辺の膨張（edge inflation）で中央から宝までの経路を作る。
 * 1. 中央 → 北 → 宝 の単調な種経路を引く
 * 2. 経路の辺 u→v の片側 u', v' が空いていれば u→u'→v'→v に置き換える（+2 マス）
 * マスは占有されるだけなので、膨らませられない辺は以後も膨らませられない。全体で O(L)。
 */
export function inflatePath(n: number, rng: Rng, opts: InflateOptions): InflateResult {
  const size = 2 * n + 1;
  const cells = size * size;
  const center = n * size + n;
  const north = center - size;

  const used = new Uint8Array(cells);
  const next = new Int32Array(cells).fill(-1);

  // --- 種経路 ---
  const treasure = pickFarCell(rng, n, (r, c) => !(r === n - 1 && c === n));
  const seed = seedPath(n, rng, treasure);
  for (let i = 0; i < seed.length; i++) {
    used[seed[i]] = 1;
    if (i + 1 < seed.length) next[seed[i]] = seed[i + 1];
  }
  let length = seed.length;

  // --- 膨張 ---
  // 候補は辺の始点 u で表す（辺 = u→next[u]）。各マスはちょうど 1 本の辺の始点になる。
  // 中央→北の辺は初手を固定するため対象外。
  const cand = new Int32Array(cells);
  let candLen = 0;
  for (let i = 1; i + 1 < seed.length; i++) cand[candLen++] = seed[i];

  const target = Math.min(opts.targetLength, cells);
  while (candLen > 0 && length + 2 <= target) {
    const k = rng.next() < opts.depthBias ? candLen - 1 : rng.int(candLen);
    const u = cand[k];
    const v = next[u];
    const step = v - u; // ±1 or ±size
    const ur = (u / size) | 0;
    const uc = u - ur * size;

    // 辺に垂直な 2 方向（ランダムな順）
    let s1: number, s2: number;
    if (step === 1 || step === -1) {
      s1 = -size; s2 = size;
    } else {
      s1 = -1; s2 = 1;
    }
    if (rng.next() < 0.5) [s1, s2] = [s2, s1];

    let done = false;
    for (const s of [s1, s2]) {
      if (!inBounds(ur, uc, s, size)) continue;
      const u2 = u + s;
      const v2 = v + s;
      if (used[u2] || used[v2]) continue;
      used[u2] = used[v2] = 1;
      next[u] = u2;
      next[u2] = v2;
      next[v2] = v;
      length += 2;
      cand[candLen++] = u2;
      cand[candLen++] = v2;
      done = true;
      break;
    }
    if (!done) cand[k] = cand[--candLen];
  }

  const path = new Int32Array(length);
  for (let i = 0, x = center; i < length; i++, x = next[x]) path[i] = x;
  if (path[1] !== north || path[length - 1] !== treasure) throw new Error('inflate: broken path');
  return { path, length };
}

function inBounds(r: number, c: number, s: number, size: number): boolean {
  if (s === -size) return r > 0;
  if (s === size) return r < size - 1;
  if (s === -1) return c > 0;
  return c < size - 1;
}

/**
 * 中央 → 北 → 宝 の単調経路（L 字かコの字）。北のマスから下へ動く必要があるときは、
 * 先に横へ動いて中央を踏まないようにする。
 */
function seedPath(n: number, rng: Rng, treasure: number): number[] {
  const size = 2 * n + 1;
  const tr = (treasure / size) | 0;
  const tc = treasure % size;
  let r = n - 1;
  let c = n;
  const path = [n * size + n, r * size + c];
  const push = (dr: number, dc: number) => {
    r += dr;
    c += dc;
    path.push(r * size + c);
  };

  const dr = tr - r;
  const dc = tc - c;
  if (dc === 0 && dr > 0) {
    // 真下の宝: 横に 1 マス避けて下り、最後に戻る
    const side = rng.next() < 0.5 ? -1 : 1;
    push(0, side);
    for (let i = 0; i < dr; i++) push(1, 0);
    push(0, -side);
    return path;
  }

  // 階段状の経路は両側が自分自身にふさがれて膨らませられないので、
  // 曲がり角が 1〜2 個の L 字 / コの字 にする。
  const V = Math.abs(dr);
  const H = Math.abs(dc);
  const vert = (k: number) => { for (let i = 0; i < k; i++) push(Math.sign(dr), 0); };
  const horiz = (k: number) => { for (let i = 0; i < k; i++) push(0, Math.sign(dc)); };
  // dr > 0 のときは横から動き出さないと中央を踏む
  const startH = dr > 0 || V === 0 || (H > 0 && rng.next() < 0.5);
  if (startH) {
    const h1 = H > 1 && rng.next() < 0.5 ? 1 + rng.int(H - 1) : H;
    horiz(h1); vert(V); horiz(H - h1);
  } else {
    const v1 = V > 1 && rng.next() < 0.5 ? 1 + rng.int(V - 1) : V;
    vert(v1); horiz(H); vert(V - v1);
  }
  return path;
}
