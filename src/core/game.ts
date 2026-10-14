import { type Board, DC, DR, Dir, centerIndex } from './types';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  board: Board;
  pos: number;
  maxMoves: number;
  movesLeft: number;
  /** 一度でも踏んだマス */
  visited: Uint8Array;
  /** 通ったマスの列（log[0] は中央）。リプレイと GIF に使う */
  log: number[];
  status: GameStatus;
}

export const moveLimit = (n: number) => 12 * n;

export function newGame(board: Board): GameState {
  const pos = centerIndex(board.n);
  const visited = new Uint8Array(board.size * board.size);
  visited[pos] = 1;
  const max = moveLimit(board.n);
  return { board, pos, maxMoves: max, movesLeft: max, visited, log: [pos], status: 'playing' };
}

/** 1 マス動く。盤外への移動やゲーム終了後の操作は無視して false を返す。 */
export function move(g: GameState, d: Exclude<Dir, 0>): boolean {
  if (g.status !== 'playing') return false;
  const { size } = g.board;
  const r = ((g.pos / size) | 0) + DR[d];
  const c = (g.pos % size) + DC[d];
  if (r < 0 || c < 0 || r >= size || c >= size) return false;
  g.pos = r * size + c;
  g.visited[g.pos] = 1;
  g.log.push(g.pos);
  g.movesLeft--;
  if (g.pos === g.board.treasure) g.status = 'won';
  else if (g.movesLeft === 0) g.status = 'lost';
  return true;
}

export const movesUsed = (g: GameState) => g.maxMoves - g.movesLeft;

/** 中央から見た相対位置（右・上が正） */
export function offsetFromStart(board: Board, cell: number): { right: number; up: number } {
  const r = (cell / board.size) | 0;
  const c = cell % board.size;
  return { right: c - board.n, up: board.n - r };
}

export { Dir };
