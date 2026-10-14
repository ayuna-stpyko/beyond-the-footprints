import { type Board, Dir, centerIndex } from './types';

/** 盤面の不変条件を確かめ、破れていればエラーメッセージを返す。 */
export function validateBoard(b: Board): string | null {
  const { n, size, dirs, treasure } = b;
  const center = centerIndex(n);
  if (dirs[center] !== Dir.Up) return 'first step is not north';
  if (dirs[treasure] !== Dir.None) return 'treasure cell has an arrow';

  // N=2000 では 1600 万マスをたどるので、行・列ではなく添字の差分で進める。
  // たどり方は決まっているので、同じマスに戻ると以後ずっと回り続ける。
  // よって「マス数以内の歩数で宝に着く」なら同じマスを二度通っていない（訪問済みの配列はいらない）。
  const cells = size * size;
  const delta = [0, -size, 1, size, -1];
  let i = center;
  let c = n;
  let steps = 1;
  for (;;) {
    if (i === treasure) break;
    if (steps > cells) return 'path revisits a cell';
    const d = dirs[i];
    if (d === Dir.None) return `dead end at (${(i / size) | 0},${i % size})`;
    if (d === Dir.Left || d === Dir.Right) {
      c += d === Dir.Right ? 1 : -1;
      if (c < 0 || c >= size) return 'path leaves the board';
    }
    i += delta[d];
    if (i < 0 || i >= cells) return 'path leaves the board';
    steps++;
  }
  if (steps !== b.length) return `length mismatch: walked ${steps}, board says ${b.length}`;

  let arrows = 0;
  for (let k = 0; k < dirs.length; k++) if (dirs[k] !== Dir.None) arrows++;
  if (arrows !== b.length - 1) return 'arrows exist off the path';
  return null;
}
