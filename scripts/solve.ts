/**
 * ICPC 2024 Yokohama G "Beyond the Former Explorer" の解法を、このゲームの盤面に対して
 * 対話的に（踏んだマスの情報だけを使って）実行するソルバー。
 *
 * 解法（公式解説の KD 木風二分探索）:
 *   連結な領域 R について「経路が R から出た回数 − 入った回数 = [中央∈R] − [宝∈R]」。
 *   出入りは R の境界をまたぐ辺だけで決まるので、境界だけ調べれば宝が R にあるか分かる。
 *   候補の長方形を長い方の辺に垂直な切れ目で半分に割り、切れ目をまたぐ辺の出入りを調べる。
 *   外周は前回までの切れ目か盤の端なので、出入りは既に分かっている。
 *
 * 公式解説との違い（手数削減）:
 *   切れ目の両側 2 列を全部踏む代わりに、片側の列を進みながら「その辺の出入りがまだ
 *   確定しないときだけ」反対側の列へ移る。確定条件:
 *     - どちらかが「何もない」マス → またがない
 *     - 片側の矢印が相手を指す → またぐ（向きも分かる）
 *     - 片側の矢印が相手を指さず、そのマスの直前のマス（=そのマスを指す既知の隣接マス、
 *       または中央なら直前なし）が相手以外と分かっている → またがない
 *
 * 使い方: import { solve } して solve(interactor)。単体実行は scripts/solve-bench.ts。
 */
import type { Board } from '../src/core/types';
import { DC, DR, centerIndex } from '../src/core/types';
import { move as gameMove, newGame, type GameState } from '../src/core/game';

/** 0: 何もない, 1-4: 矢印, 5: 宝 */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5;
export const TREASURE = 5;

/** 盤面の値（0〜4）を Cell に絞る */
function toCell(v: number): Cell {
  if (v === 0 || v === 1 || v === 2 || v === 3 || v === 4) return v;
  throw new Error(`unexpected cell value ${v}`);
}

/** ソルバーが見られるのは n と move の戻り値だけ */
export interface Interactor {
  readonly n: number;
  move(d: 1 | 2 | 3 | 4): Cell;
}

/** 手数制限なしで実際の手数を測るためのインタラクタ。踏んだマスの内容だけ返す */
export class RawInteractor implements Interactor {
  readonly n: number;
  #b: Board;
  #pos: number;
  #done = false;
  moves = 0;
  constructor(board: Board) {
    this.n = board.n;
    this.#b = board;
    this.#pos = centerIndex(board.n);
  }
  move(d: 1 | 2 | 3 | 4): Cell {
    if (this.#done) throw new Error('move after reaching the treasure');
    const { size } = this.#b;
    const r = ((this.#pos / size) | 0) + DR[d];
    const c = (this.#pos % size) + DC[d];
    if (r < 0 || c < 0 || r >= size || c >= size) throw new Error('solver tried to leave the board');
    this.#pos = r * size + c;
    this.moves++;
    if (this.#pos === this.#b.treasure) {
      this.#done = true;
      return TREASURE;
    }
    return toCell(this.#b.dirs[this.#pos]);
  }
}

/** game.ts の move を使う厳格なインタラクタ（12N 制限つき）。盤面は外から見えない */
export class GameInteractor implements Interactor {
  readonly n: number;
  #g: GameState;
  constructor(board: Board) {
    this.n = board.n;
    this.#g = newGame(board);
  }
  move(d: 1 | 2 | 3 | 4): Cell {
    const g = this.#g;
    if (g.status !== 'playing') throw new Error(`move after game end (${g.status})`);
    if (!gameMove(g, d)) throw new Error('solver tried to leave the board');
    if ((g.status as string) === 'won') return TREASURE;
    return toCell(g.board.dirs[g.pos]);
  }
  get status() {
    return this.#g.status;
  }
  get movesUsed() {
    return this.#g.maxMoves - this.#g.movesLeft;
  }
}

class Won extends Error {}

export interface SolveOptions {
  /** 候補領域の面積がこれ以下なら切らずに全マスを踏む */
  sweepArea?: number;
  /** 縦横比がこれ未満なら、切る向きを手数の見積もりで選ぶ */
  squareRatio?: number;
  /** 移動制限（これを超えたら打ち切り）。既定は無制限 */
  maxMoves?: number;
}

export interface SolveResult {
  won: boolean;
  moves: number;
  /** scan: 切れ目の調査（移動込み）, peeks: 反対側へ移った回数, cutLen: 切れ目の長さの合計, sweep: 最後の総当たり */
  stats?: { scan: number; peeks: number; cutLen: number; sweep: number };
}

export function solve(io: Interactor, opts: SolveOptions = {}): SolveResult {
  const n = io.n;
  const size = 2 * n + 1;
  const start = centerIndex(n);
  const known = new Int8Array(size * size).fill(-1);
  known[start] = 1; // 中央は北向きと分かっている
  let pos = start;
  let moves = 0;
  const maxMoves = opts.maxMoves ?? Infinity;
  const sweepArea = opts.sweepArea ?? 9;
  const squareRatio = opts.squareRatio ?? 1.25;

  const stats = { scan: 0, peeks: 0, cutLen: 0, sweep: 0 };
  const rowOf = (x: number) => (x / size) | 0;
  const colOf = (x: number) => x % size;
  const target = (x: number, d: number) => x + DR[d] * size + DC[d];

  const step = (d: 1 | 2 | 3 | 4) => {
    if (moves >= maxMoves) throw new Error('move limit');
    const c = io.move(d);
    moves++;
    pos = target(pos, d);
    if (c === TREASURE) throw new Won();
    known[pos] = c;
  };

  /** マンハッタン最短路で移動。選べるときは未知のマスを通る */
  const goTo = (t: number) => {
    const tr = rowOf(t);
    const tc = colOf(t);
    // pos は step() の中で更新される
    // oxlint-disable-next-line no-unmodified-loop-condition
    while (pos !== t) {
      const r = rowOf(pos);
      const c = colOf(pos);
      const vd = tr < r ? 1 : tr > r ? 3 : 0;
      const hd = tc < c ? 4 : tc > c ? 2 : 0;
      let d: 0 | 1 | 2 | 3 | 4 = vd || hd;
      if (vd && hd && known[target(pos, vd)] !== -1 && known[target(pos, hd)] === -1) d = hd;
      if (d === 0) throw new Error('goTo: already at target');
      step(d);
    }
  };

  const neighbors = (x: number): number[] => {
    const r = rowOf(x);
    const c = colOf(x);
    const out: number[] = [];
    if (r > 0) out.push(x - size);
    if (r < size - 1) out.push(x + size);
    if (c > 0) out.push(x - 1);
    if (c < size - 1) out.push(x + 1);
    return out;
  };
  const pointsTo = (x: number, y: number) => known[x] >= 1 && known[x] <= 4 && target(x, known[x]) === y;
  /** x の直前のマスが y ではないと分かっているか */
  const predNot = (x: number, y: number) => {
    if (x === start) return true;
    for (const z of neighbors(x)) if (z !== y && pointsTo(z, x)) return true;
    return false;
  };
  /** 隣接マス a,b の辺: 1 = a→b, -1 = b→a, 0 = またがない, null = 未確定 */
  const status = (a: number, b: number): number | null => {
    if (pointsTo(a, b)) return 1;
    if (pointsTo(b, a)) return -1;
    if (known[a] === 0 || known[b] === 0) return 0;
    if (known[a] >= 1 && known[b] >= 1) return 0;
    if (known[a] >= 1 && predNot(a, b)) return 0;
    if (known[b] >= 1 && predNot(b, a)) return 0;
    return null;
  };

  /** 長方形 [r0,r1]x[c0,c1] からの (出た回数 − 入った回数) */
  const flux = (r0: number, r1: number, c0: number, c1: number): number => {
    let f = 0;
    const add = (a: number, b: number) => {
      const s = status(a, b);
      if (s === null) throw new Error(`undetermined boundary edge ${a}-${b}`);
      f += s;
    };
    for (let c = c0; c <= c1; c++) {
      if (r0 > 0) add(r0 * size + c, (r0 - 1) * size + c);
      if (r1 < size - 1) add(r1 * size + c, (r1 + 1) * size + c);
    }
    for (let r = r0; r <= r1; r++) {
      if (c0 > 0) add(r * size + c0, r * size + c0 - 1);
      if (c1 < size - 1) add(r * size + c1, r * size + c1 + 1);
    }
    return f;
  };

  const dist = (a: number, b: number) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));

  /**
   * 切れ目の辺 (A[i], B[i]) をすべて確定させる歩き方を決める。終点は切れ目の中央 q
   * （次の切れ目は中央から垂直に出るので、そこで終わると移動の無駄がない）。
   *  - 案 E: 近い端 e へ行き、e→q は片側を進んで未確定のときだけ反対側へ移る（約 1.6 手/辺）。
   *    q より先は片側で行って反対側で戻る（2 手/辺。戻りが次の切れ目への移動を兼ねる）。
   *  - 案 M: 中央から両側とも往復する（最初の切れ目のように中央にいるとき）。
   */
  const planCut = (A: number[], B: number[]) => {
    const k = A.length;
    const at = (i: number, sd: number) => (sd ? B : A)[i];
    let side = 0;
    let peeks = 0;
    /** 片側を i0→i1 の順に歩く。adaptive なら未確定の辺で反対側へ移る */
    const walk = (i0: number, i1: number, adaptive: boolean) => {
      const st = i1 >= i0 ? 1 : -1;
      for (let i = i0; ; i += st) {
        goTo(at(i, side));
        if (adaptive && status(A[i], B[i]) === null) {
          side ^= 1;
          peeks++;
          goTo(at(i, side));
        }
        if (i === i1) break;
      }
    };
    const nearSide = (i: number) => (dist(pos, A[i]) <= dist(pos, B[i]) ? 0 : 1);
    const q = k >> 1; // 次の切れ目はこのあたりから始まる
    const P = 0.5; // 片側を歩くときに反対側へ移る割合の見積もり
    // 案 E(e): 端 e へ行き、e→q を適応的に、q より先は往復（帰り道が次への移動を兼ねる）
    // 案 M: q へ行き、両側を往復
    const plans: { cost: number; run: () => void }[] = [];
    for (const e of k > 1 ? [0, k - 1] : [0]) {
      const f = e === 0 ? k - 1 : 0;
      const dir = e === 0 ? 1 : -1;
      const nearLen = Math.abs(q - e) + 1;
      const farLen = Math.abs(f - q);
      plans.push({
        cost: Math.min(dist(pos, A[e]), dist(pos, B[e])) + nearLen * (1 + P) + 2 * farLen,
        run: () => {
          side = nearSide(e);
          goTo(at(e, side));
          walk(e, q, true);
          if (farLen > 0) {
            walk(q + dir, f, false);
            side ^= 1;
            walk(f, q + dir, false);
          }
        },
      });
    }
    plans.push({
      cost: Math.min(dist(pos, A[q]), dist(pos, B[q])) + 2 * k,
      run: () => {
        side = nearSide(q);
        goTo(at(q, side));
        const f = k - 1;
        walk(q, f, false);
        side ^= 1;
        walk(f, q, false);
        if (q > 0) {
          walk(q - 1, 0, false);
          side ^= 1;
          walk(0, q - 1, false);
        }
      },
    });
    plans.sort((x, y) => x.cost - y.cost);
    const execute = (run: () => void) => {
      const m1 = moves;
      try {
        run();
        for (let i = 0; i < k; i++) if (status(A[i], B[i]) === null) throw new Error('edge still undetermined');
      } finally {
        stats.scan += moves - m1;
        stats.peeks += peeks;
        stats.cutLen += k;
        if (process.env.SOLVE_TRACE) console.log(`cut k=${k} moves=${moves - m1} peeks=${peeks} total=${moves}`);
      }
    };
    return { cost: plans[0].cost, run: () => execute(plans[0].run) };
  };

  let r0 = 0;
  let r1 = size - 1;
  let c0 = 0;
  let c1 = size - 1;
  const inRect = (x: number, a0: number, a1: number, b0: number, b1: number) => {
    const r = rowOf(x);
    const c = colOf(x);
    return r >= a0 && r <= a1 && c >= b0 && c <= b1;
  };

  try {
    for (;;) {
      const W = c1 - c0 + 1;
      const H = r1 - r0 + 1;
      if (W * H <= sweepArea || W === 1 || H === 1) {
        // 残りの未知マスを近い順に踏む
        const ms = moves;
        try {
          for (;;) {
            let bestCell = -1;
            let bd = Infinity;
            for (let r = r0; r <= r1; r++)
              for (let c = c0; c <= c1; c++) {
                const x = r * size + c;
                if (known[x] !== -1) continue;
                const d = dist(pos, x);
                if (d < bd) {
                  bd = d;
                  bestCell = x;
                }
              }
            if (bestCell < 0) throw new Error('region exhausted without treasure');
            goTo(bestCell);
          }
        } finally {
          stats.sweep += moves - ms;
        }
      }
      // 縦の切れ目（左右に分ける）と横の切れ目（上下に分ける）の候補
      const cuts: { cost: number; run: () => void; finish: () => void }[] = [];
      const vertical = () => {
        const m = c0 + (W >> 1) - 1; // 左半分 [c0,m], 右半分 [m+1,c1]
        const A: number[] = [];
        const B: number[] = [];
        for (let r = r0; r <= r1; r++) {
          A.push(r * size + m);
          B.push(r * size + m + 1);
        }
        const p = planCut(A, B);
        cuts.push({
          ...p,
          finish: () => {
            const f = flux(r0, r1, c0, m);
            const s = inRect(start, r0, r1, c0, m) ? 1 : 0;
            if (s - f === 1) c1 = m;
            else c0 = m + 1;
          },
        });
      };
      const horizontal = () => {
        const m = r0 + (H >> 1) - 1;
        const A: number[] = [];
        const B: number[] = [];
        for (let c = c0; c <= c1; c++) {
          A.push(m * size + c);
          B.push((m + 1) * size + c);
        }
        const p = planCut(A, B);
        cuts.push({
          ...p,
          finish: () => {
            const f = flux(r0, m, c0, c1);
            const s = inRect(start, r0, m, c0, c1) ? 1 : 0;
            if (s - f === 1) r1 = m;
            else r0 = m + 1;
          },
        });
      };
      if (W >= 2 && W >= H * squareRatio) vertical();
      else if (H >= 2 && H >= W * squareRatio) horizontal();
      else {
        if (W >= 2) vertical();
        if (H >= 2) horizontal();
      }
      cuts.sort((x, y) => x.cost - y.cost);
      cuts[0].run();
      cuts[0].finish();
    }
  } catch (e) {
    if (e instanceof Won) return { won: true, moves, stats };
    if (e instanceof Error && e.message === 'move limit') return { won: false, moves, stats };
    throw e;
  }
}
