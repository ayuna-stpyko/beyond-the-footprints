import { pickFarCell } from './board';
import type { Rng } from './rng';

/**
 * 密度 100%（全マスを通る）経路を作る。
 *
 * 1. 偶数行 r0・偶数列 c0 の十字で盤面を 4 つの長方形に分け、それぞれを 2×2 ブロックに分割する
 * 2. ブロックのランダム全域木（乱択 Kruskal 法）の輪郭をなぞって、長方形ごとのハミルトンサイクルを作る
 * 3. 十字の腕をドミノに分け、3 本の腕でサイクル同士を連結し、残りのドミノはサイクルに取り込む
 *    → 十字の交点 q を除く全マスを通る 1 本のサイクルになる
 * 4. サイクルを切り開いて、中央から北へ出発するハミルトン路にする（終点は中央のそば）
 * 5. backbite 操作で終点（宝）をランダムな目標マスまで動かす
 */
export function hamiltonianPath(n: number, rng: Rng): Int32Array {
  const size = 2 * n + 1;
  const cells = size * size;
  const center = n * size + n;
  const north = center - size;
  const even = n % 2 === 0;

  // N が偶数: 交点 q = 中央。N が奇数: q = 中央の右上（中央は左下の長方形の右上角になる）
  const r0 = even ? n : n - 1;
  const c0 = even ? n : n + 1;
  const q = r0 * size + c0;

  const g = new CycleGraph(cells);

  // --- 1, 2: 長方形ごとのサイクル ---
  const rowSpans: [number, number][] = [[0, r0], [r0 + 1, size]];
  const colSpans: [number, number][] = [[0, c0], [c0 + 1, size]];
  const nonEmpty: boolean[] = [];
  for (const [ra, rb] of rowSpans) {
    for (const [ca, cb] of colSpans) {
      const h = rb - ra;
      const w = cb - ca;
      nonEmpty.push(h > 0 && w > 0);
      if (h > 0 && w > 0) blockTreeCycle(g, rng, size, ra, ca, h / 2, w / 2);
    }
  }

  // --- 3: 十字の腕のドミノ ---
  // 長方形の番号: 0=左上, 1=右上, 2=左下, 3=右下
  interface Domino {
    d1: number;
    d2: number;
    /** 腕の両側で向かい合う辺（[a1, a2] は d1, d2 にそれぞれ隣接）。長方形が空なら null */
    sides: [[number, number] | null, [number, number] | null];
    arm: number;
    /** 中央の向きを固定するため、指定した側に取り込む必要があるドミノ */
    forcedSide: 0 | 1 | -1;
  }
  const arms: { quads: [number, number]; dominos: Domino[] }[] = [
    { quads: [0, 1], dominos: [] }, // 上
    { quads: [2, 3], dominos: [] }, // 下
    { quads: [0, 2], dominos: [] }, // 左
    { quads: [1, 3], dominos: [] }, // 右
  ];
  const at = (r: number, c: number) => r * size + c;
  const vertical = (arm: number, from: number, to: number) => {
    for (let r = from; r < to; r += 2) {
      const d1 = at(r, c0);
      const d2 = at(r + 1, c0);
      const left = c0 > 0 ? ([d1 - 1, d2 - 1] as [number, number]) : null;
      const right = c0 < size - 1 ? ([d1 + 1, d2 + 1] as [number, number]) : null;
      arms[arm].dominos.push({ d1, d2, sides: [left, right], arm, forcedSide: -1 });
    }
  };
  const horizontal = (arm: number, from: number, to: number) => {
    for (let c = from; c < to; c += 2) {
      const d1 = at(r0, c);
      const d2 = at(r0, c + 1);
      const up = r0 > 0 ? ([d1 - size, d2 - size] as [number, number]) : null;
      const down = r0 < size - 1 ? ([d1 + size, d2 + size] as [number, number]) : null;
      arms[arm].dominos.push({ d1, d2, sides: [up, down], arm, forcedSide: -1 });
    }
  };
  vertical(0, 0, r0);
  vertical(1, r0 + 1, size);
  horizontal(2, 0, c0);
  horizontal(3, c0 + 1, size);

  if (!even) {
    // 中央の北のドミノは下側（中央の上辺）へ、東のドミノは左側（中央の右辺）へ取り込む。
    // すると中央のサイクル上の隣は北と東になる。
    for (const d of arms[2].dominos) if (d.d1 === north || d.d2 === north) d.forcedSide = 1;
    for (const d of arms[1].dominos) if (d.d1 === center + 1 || d.d2 === center + 1) d.forcedSide = 0;
  }

  // 空でない長方形をつなぐ全域木を、腕の中からランダムに選ぶ
  const uf = [0, 1, 2, 3];
  const find = (x: number): number => (uf[x] === x ? x : (uf[x] = find(uf[x])));
  const armOrder = shuffle([0, 1, 2, 3], rng);
  const used = new Set<Domino>();
  for (const a of armOrder) {
    const [qa, qb] = arms[a].quads;
    if (!nonEmpty[qa] || !nonEmpty[qb] || find(qa) === find(qb)) continue;
    const free = arms[a].dominos.filter((d) => d.forcedSide === -1);
    if (free.length === 0) continue;
    const d = free[rng.int(free.length)];
    const [sa, sb] = d.sides;
    // 両側の長方形が空でないので、両側とも辺がある
    if (!sa || !sb) throw new Error('hamiltonian: bridge domino without sides');
    const [a1, a2] = sa;
    const [b1, b2] = sb;
    g.remove(a1, a2);
    g.remove(b1, b2);
    g.add(a1, d.d1);
    g.add(d.d1, b1);
    g.add(a2, d.d2);
    g.add(d.d2, b2);
    used.add(d);
    uf[find(qa)] = find(qb);
  }

  for (const arm of arms) {
    for (const d of arm.dominos) {
      if (used.has(d)) continue;
      let side = d.forcedSide;
      if (side === -1) {
        const ok = ([0, 1] as const).filter((s) => d.sides[s] !== null);
        side = ok[rng.int(ok.length)];
      }
      const [a1, a2] = d.sides[side]!;
      g.remove(a1, a2);
      g.add(a1, d.d1);
      g.add(d.d1, d.d2);
      g.add(d.d2, a2);
    }
  }

  // --- 4: サイクルを路に切り開く ---
  const path = new Int32Array(cells);
  let len = 0;
  path[len++] = center;
  let prev: number;
  let cur: number;
  let last: number;
  if (even) {
    // 中央 = q はサイクル外。北 n から、サイクル上の隣の一方 m と反対向きに一周する
    const m = g.nb[north * 2 + rng.int(2)];
    prev = m;
    cur = north;
    last = m;
  } else {
    if (!g.has(center, north) || !g.has(center, center + 1)) throw new Error('hamiltonian: center edges');
    prev = center;
    cur = north;
    last = center + 1;
  }
  for (;;) {
    path[len++] = cur;
    if (cur === last) break;
    const a = g.nb[cur * 2];
    const nx = a === prev ? g.nb[cur * 2 + 1] : a;
    prev = cur;
    cur = nx;
  }
  if (!even) path[len++] = q;
  if (len !== cells) throw new Error(`hamiltonian: covered ${len} of ${cells}`);

  // --- 5: 終点を目標マスまで動かす ---
  steerEnd(path, n, rng);
  return path;
}

/** 各マスが最大 2 本の辺を持つ無向グラフ（サイクルの組み立て用） */
class CycleGraph {
  nb: Int32Array;
  constructor(cells: number) {
    this.nb = new Int32Array(cells * 2).fill(-1);
  }
  add(a: number, b: number) {
    this.put(a, b);
    this.put(b, a);
  }
  remove(a: number, b: number) {
    this.drop(a, b);
    this.drop(b, a);
  }
  has(a: number, b: number) {
    return this.nb[a * 2] === b || this.nb[a * 2 + 1] === b;
  }
  private put(a: number, b: number) {
    if (this.nb[a * 2] === -1) this.nb[a * 2] = b;
    else if (this.nb[a * 2 + 1] === -1) this.nb[a * 2 + 1] = b;
    else throw new Error(`cell ${a} already has degree 2`);
  }
  private drop(a: number, b: number) {
    if (this.nb[a * 2] === b) this.nb[a * 2] = -1;
    else if (this.nb[a * 2 + 1] === b) this.nb[a * 2 + 1] = -1;
    else throw new Error(`edge ${a}-${b} does not exist`);
  }
}

/**
 * (r0, c0) を左上とする bh×bw 個の 2×2 ブロックでランダム全域木（乱択 Kruskal 法）を作り、
 * その輪郭のハミルトンサイクルを g に書き込む。
 */
function blockTreeCycle(g: CycleGraph, rng: Rng, size: number, r0: number, c0: number, bh: number, bw: number) {
  const nb = bh * bw;
  const right = new Uint8Array(nb); // ブロック b と右隣が木でつながっている
  const down = new Uint8Array(nb); // ブロック b と下隣が木でつながっている

  // 乱択 Kruskal 法: 辺をシャッフルし、別々の木をつなぐ辺だけ採用する。
  // 辺の番号 e: e < nb ならブロック e の右の辺、それ以外はブロック e - nb の下の辺
  const edges = new Int32Array(2 * nb);
  let m = 0;
  for (let b = 0; b < nb; b++) {
    if (b % bw < bw - 1) edges[m++] = b;
    if (b < nb - bw) edges[m++] = nb + b;
  }
  for (let i = m - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = edges[i];
    edges[i] = edges[j];
    edges[j] = t;
  }
  const parent = new Int32Array(nb);
  for (let b = 0; b < nb; b++) parent[b] = b;
  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let k = 0, joined = 0; k < m && joined < nb - 1; k++) {
    const e = edges[k];
    const a = e < nb ? e : e - nb;
    const b = e < nb ? a + 1 : a + bw;
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    parent[ra] = rb;
    joined++;
    if (e < nb) right[a] = 1;
    else down[a] = 1;
  }

  for (let br = 0; br < bh; br++) {
    for (let bc = 0; bc < bw; bc++) {
      const b = br * bw + bc;
      const tl = (r0 + 2 * br) * size + c0 + 2 * bc;
      const tr = tl + 1;
      const bl = tl + size;
      const brc = bl + 1;
      const up = br > 0 && down[b - bw];
      const left = bc > 0 && right[b - 1];
      if (!up) g.add(tl, tr);
      if (!down[b]) g.add(bl, brc);
      if (!left) g.add(tl, bl);
      if (!right[b]) g.add(tr, brc);
      if (right[b]) {
        g.add(tr, tr + 1);
        g.add(brc, brc + 1);
      }
      if (down[b]) {
        g.add(bl, bl + size);
        g.add(brc, brc + size);
      }
    }
  }
}

/** steerEnd の手数の上限 */
const steerSteps = (n: number) => 60 * n + 100;
/** steerEnd で終点に最も近づく手を選ぶ確率（残りは寄り道） */
const GREEDY_CHANCE = 0.7;

/**
 * backbite 操作で終点をランダムな目標マスへ近づける。
 * 終点 e の隣のマス v = path[i] について、辺 e–v を足して v–path[i+1] を外し、
 * path[i+1..] を反転すると path[i+1] が新しい終点になる。
 * v が中央（i = 0）のときは初手が変わるので選ばない。
 */
function steerEnd(path: Int32Array, n: number, rng: Rng) {
  const size = 2 * n + 1;
  const L = path.length;
  if (L < 4) return;
  const pos = new Int32Array(L);
  for (let i = 0; i < L; i++) pos[path[i]] = i;

  // ハミルトン路の終点は中央と同じ市松色
  const target = pickFarCell(rng, n, (r, c) => (r + c) % 2 === 0);
  const tr = (target / size) | 0;
  const tc = target % size;
  const dist = (x: number) => Math.abs(((x / size) | 0) - tr) + Math.abs((x % size) - tc);

  const maxMoves = steerSteps(n);
  const opts: number[] = [];
  for (let move = 0; move < maxMoves; move++) {
    const e = path[L - 1];
    if (dist(e) === 0) break;
    const er = (e / size) | 0;
    const ec = e % size;
    opts.length = 0;
    if (er > 0) opts.push(e - size);
    if (er < size - 1) opts.push(e + size);
    if (ec > 0) opts.push(e - 1);
    if (ec < size - 1) opts.push(e + 1);

    let best = -1;
    let bestD = Infinity;
    let count = 0;
    let pick = -1;
    for (const v of opts) {
      const i = pos[v];
      if (i === 0 || i === L - 2) continue;
      count++;
      // 寄り道用の候補: 反転する長さ（L - 1 - i）が最も短い手
      if (i > pick) pick = i;
      const d = dist(path[i + 1]);
      if (d < bestD || (d === bestD && rng.next() < 0.5)) {
        bestD = d;
        best = i;
      }
    }
    if (count === 0) break;
    // 3 割は寄り道して行き詰まりを避ける。寄り道には反転の短い手を使う（大盤面の速度対策）
    const i = rng.next() < GREEDY_CHANCE ? best : pick;

    for (let a = i + 1, b = L - 1; a < b; a++, b--) {
      const t = path[a];
      path[a] = path[b];
      path[b] = t;
      pos[path[a]] = a;
      pos[path[b]] = b;
    }
  }
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
