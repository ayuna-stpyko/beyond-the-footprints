/**
 * solve.ts を生成盤面で走らせて手数を集計する。
 *   npx tsx scripts/solve-bench.ts big [seeds]     N=2000 × 密度 0.5/0.7/0.9/1
 *   npx tsx scripts/solve-bench.ts small [seeds]   小さい N × 密度混在
 *   npx tsx scripts/solve-bench.ts one N seed [density]
 * 各盤面について、手数制限なし（RawInteractor）で手数を測り、
 * さらに game.ts（12N 制限）で勝てるかを確認する。
 */
import { generateBoard } from '../src/core/generate';
import { GameInteractor, RawInteractor, solve } from './solve';

interface Row {
  n: number;
  seed: number;
  density: number | undefined;
  moves: number;
  won12: boolean;
  mode: string;
  len: number;
}

function runOne(n: number, seed: number, density?: number): Row {
  const b = generateBoard(n, seed, density === undefined ? {} : { density });
  const raw = new RawInteractor(b);
  const r = solve(raw);
  if (!r.won || raw.moves !== r.moves) throw new Error('raw run did not finish');
  const gi = new GameInteractor(b);
  const g = solve(gi, { maxMoves: 12 * n });
  if (g.won !== (gi.status === 'won')) throw new Error('status mismatch');
  if (g.won && g.moves !== r.moves) throw new Error('nondeterministic');
  return { n, seed, density, moves: r.moves, won12: g.won, mode: b.mode, len: b.length };
}

function summarize(label: string, rows: Row[]) {
  const ratios = rows.map((x) => x.moves / x.n);
  const ok = rows.filter((x) => x.won12).length;
  const max = Math.max(...ratios);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const worst = rows[ratios.indexOf(max)];
  console.log(
    `${label.padEnd(22)} runs ${String(rows.length).padStart(4)}  ok ${String(ok).padStart(4)}  ` +
      `max ${max.toFixed(3)}N  avg ${avg.toFixed(3)}N  (worst seed ${worst.seed}, ${worst.moves} moves, ${worst.mode})`,
  );
  return rows;
}

const [mode = 'small', a1, a2, a3] = process.argv.slice(2);
const all: Row[] = [];
if (mode === 'one') {
  const r = runOne(Number(a1), Number(a2), a3 === undefined ? undefined : Number(a3));
  console.log(r, `${(r.moves / r.n).toFixed(3)}N`);
} else if (mode === 'big') {
  const seeds = Number(a1 ?? 10);
  const n = Number(a2 ?? 2000);
  for (const d of [0.5, 0.7, 0.9, 1]) {
    const rows: Row[] = [];
    for (let s = 1; s <= seeds; s++) rows.push(runOne(n, s, d));
    all.push(...summarize(`N=${n} d=${d}`, rows));
  }
} else {
  const seeds = Number(a1 ?? 200);
  const ns = a2 ? a2.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 10, 20, 50, 200];
  for (const n of ns) {
    const rows: Row[] = [];
    for (let s = 1; s <= seeds; s++) rows.push(runOne(n, s));
    all.push(...summarize(`N=${n} mixed`, rows));
  }
}
if (all.length) {
  const w = all.reduce((p, x) => (x.moves / x.n > p.moves / p.n ? x : p));
  const fails = all.filter((x) => !x.won12);
  console.log(
    `worst: n=${w.n} seed=${w.seed} density=${w.density ?? 'auto'} mode=${w.mode} moves=${w.moves} (${(w.moves / w.n).toFixed(3)}N)`,
  );
  console.log(`fails within 12N: ${fails.length}`);
  for (const f of fails.slice(0, 20))
    console.log(`  n=${f.n} seed=${f.seed} density=${f.density ?? 'auto'} moves=${f.moves} limit=${12 * f.n}`);
}
