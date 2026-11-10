import { type GameState, move, newGame } from '../../src/core/game';
import { generateBoard } from '../../src/core/generate';
import { isMoveDir } from '../../src/core/types';

/** 矢印をたどって宝まで歩き、クリアした状態（N=1, seed=5 は矢印どおりに歩けば勝てる） */
export function wonGame(): GameState {
  const g = newGame(generateBoard(1, 5));
  while (g.status === 'playing') {
    const d = g.board.dirs[g.pos];
    if (!isMoveDir(d)) throw new Error('walked off the route');
    move(g, d);
  }
  return g;
}
