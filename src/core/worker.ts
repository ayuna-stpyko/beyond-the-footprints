import { type GenerateOptions, generateBoard } from './generate';
import type { Board } from './types';

export interface GenRequest {
  id: number;
  n: number;
  seed: number;
  options: GenerateOptions;
}

export type GenResponse = { id: number; ok: true; board: Board } | { id: number; ok: false; error: string };

// tsconfig は DOM の型だけを読むので、self は Window 型になっている。実体は Worker のスコープ
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const scope = self as unknown as Worker;

scope.addEventListener('message', (e: MessageEvent<GenRequest>) => {
  const { id, n, seed, options } = e.data;
  let res: GenResponse;
  try {
    // 盤面の正しさはテスト（validateBoard）で担保する。ここでは生成中の例外だけを失敗として返す
    res = { id, ok: true, board: generateBoard(n, seed, options) };
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // 盤面の配列はコピーせずに渡す
  scope.postMessage(res, res.ok ? [res.board.dirs.buffer] : []);
});
