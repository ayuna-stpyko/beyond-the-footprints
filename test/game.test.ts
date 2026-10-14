import { describe, expect, it } from 'vitest';
import { move, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { DC, Dir, isMoveDir } from '../src/core/types';

describe('game', () => {
  it('starts at the center with 12N moves', () => {
    const g = newGame(generateBoard(3, 1));
    expect(g.pos).toBe(3 * 7 + 3);
    expect(g.movesLeft).toBe(36);
    expect(g.visited[g.pos]).toBe(1);
  });

  it('ignores moves off the board without spending a move', () => {
    // 中央から真上の列に宝がない盤面を選び、上端まで進んでからさらに上へ動く
    let seed = 0;
    let b = generateBoard(2, seed);
    while (b.treasure % b.size === 2 && b.treasure < 2 * b.size) b = generateBoard(2, ++seed);
    const g = newGame(b);
    expect(move(g, Dir.Up)).toBe(true);
    expect(move(g, Dir.Up)).toBe(true);
    expect(g.pos).toBe(2);
    expect(move(g, Dir.Up)).toBe(false);
    expect(g.movesLeft).toBe(22);
    expect(g.log.length).toBe(3);
  });

  it('wins by following the arrows when the route is short enough', () => {
    const b = generateBoard(1, 5);
    const g = newGame(b);
    while (g.status === 'playing') {
      const d = b.dirs[g.pos];
      if (!isMoveDir(d)) throw new Error('walked off the route');
      move(g, d);
    }
    expect(g.status).toBe(b.length - 1 <= 12 ? 'won' : 'lost');
  });

  it('loses after 12N moves without reaching the treasure', () => {
    const b = generateBoard(10, 3);
    // 宝は中央の行にない（中央の行を往復しても宝に当たらない）
    expect(Math.floor(b.treasure / b.size)).not.toBe(b.n);
    const g = newGame(b);
    // 中央の行を左右に往復するだけ
    let d: Exclude<Dir, 0> = Dir.Left;
    while (g.status === 'playing') {
      const c = (g.pos % b.size) + DC[d];
      if (c < 0 || c >= b.size) d = d === Dir.Left ? Dir.Right : Dir.Left;
      move(g, d);
    }
    expect(g.status).toBe('lost');
    expect(g.movesLeft).toBe(0);
    expect(g.log.length).toBe(12 * b.n + 1);
    expect(g.pos).not.toBe(b.treasure);
  });
});
