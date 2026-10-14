import type { GenerateOptions } from './generate';
import type { Board } from './types';
import type { GenRequest, GenResponse } from './worker';

/** これを過ぎても返事がなければ失敗とみなす（N=2000 でも通常は 2 秒以内） */
const TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (b: Board) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Worker を捨て、待っている呼び出しをすべて失敗させる。次の呼び出しで作り直す */
function resetWorker(reason: string) {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.addEventListener('message', (e: MessageEvent<GenResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    clearTimeout(p.timer);
    if (e.data.ok) p.resolve(e.data.board);
    else p.reject(new Error(e.data.error));
  });
  // Worker の読み込み失敗や、捕まえられなかった例外
  w.addEventListener('error', (e) => {
    e.preventDefault();
    resetWorker(`worker error: ${e.message || 'unknown'}`);
  });
  w.addEventListener('messageerror', () => resetWorker('worker message could not be decoded'));
  worker = w;
  return w;
}

/**
 * 盤面生成を Web Worker で行う（大きい盤面でも UI を止めない）。
 * 生成中の例外・検証エラー・Worker の異常・タイムアウトのときは reject する。
 */
export function generateBoardAsync(n: number, seed: number, options: GenerateOptions = {}): Promise<Board> {
  const w = getWorker();
  const id = nextId++;
  const req: GenRequest = { id, n, seed, options };
  return new Promise((resolve, reject) => {
    // 無限ループなどで返事がないときは Worker ごと作り直す
    const timer = setTimeout(() => resetWorker(`generation timed out after ${TIMEOUT_MS} ms`), TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    // Worker の postMessage には targetOrigin がない（window.postMessage 用のルール）
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    w.postMessage(req);
  });
}
