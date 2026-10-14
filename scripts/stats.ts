/** 盤面生成の統計: 密度・経路長/12N・宝の距離・生成時間。 npm run stats */
import { generateBoard } from '../src/core/generate';

const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const fmt = (a: number[], d = 2) => {
  a.sort((x, y) => x - y);
  return `min ${a[0].toFixed(d)} / med ${q(a, 0.5).toFixed(d)} / max ${a.at(-1)!.toFixed(d)}`;
};

for (const n of [3, 5, 10, 25, 50, 100, 200]) {
  const runs = n >= 100 ? 30 : 200;
  const dens: number[] = [];
  const ratio: number[] = [];
  const dist: number[] = [];
  const ms: number[] = [];
  let full = 0;
  for (let seed = 0; seed < runs; seed++) {
    const t0 = performance.now();
    const b = generateBoard(n, seed);
    ms.push(performance.now() - t0);
    if (b.mode === 'hamiltonian') full++;
    dens.push(b.length / (b.size * b.size));
    ratio.push((b.length - 1) / (12 * n));
    const r = (b.treasure / b.size) | 0;
    const c = b.treasure % b.size;
    dist.push(Math.max(Math.abs(r - n), Math.abs(c - n)) / n);
  }
  console.log(`N=${n} (${runs} boards, 100%: ${full})`);
  console.log(`  density        ${fmt(dens)}`);
  console.log(`  (L-1)/12N      ${fmt(ratio)}`);
  console.log(`  treasure dist  ${fmt(dist)}  (Chebyshev / N)`);
  console.log(`  time ms        ${fmt(ms, 1)}`);
}
