import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/core/generate';
import { type Board, Dir } from '../src/core/types';
import { validateBoard } from '../src/core/validate';

/**
 * 手で作った 5×5（N=2）の盤面。行・列は (r,c)、中央は (2,2)。
 * 経路: (2,2)↑ (1,2)→ (1,3)↑ (0,3)=宝
 */
function board(edit: (dirs: Uint8Array, at: (r: number, c: number) => number) => void = () => {}): Board {
  const size = 5;
  const at = (r: number, c: number) => r * size + c;
  const dirs = new Uint8Array(size * size);
  dirs[at(2, 2)] = Dir.Up;
  dirs[at(1, 2)] = Dir.Right;
  dirs[at(1, 3)] = Dir.Up;
  edit(dirs, at);
  return { n: 2, size, dirs, treasure: at(0, 3), length: 4, seed: 0, mode: 'inflate' };
}

describe('validateBoard', () => {
  it('accepts valid boards', () => {
    expect(validateBoard(board())).toBeNull();
    expect(validateBoard(generateBoard(5, 1, { density: 0.7 }))).toBeNull();
  });

  it('rejects a first step that is not north', () => {
    expect(validateBoard(board((d, at) => (d[at(2, 2)] = Dir.Left)))).toMatch(/north/);
  });

  it('rejects an arrow on the treasure', () => {
    expect(validateBoard(board((d, at) => (d[at(0, 3)] = Dir.Left)))).toMatch(/treasure/);
  });

  it('rejects a dead end before the treasure', () => {
    expect(validateBoard(board((d, at) => (d[at(1, 3)] = Dir.None)))).toMatch(/dead end/);
  });

  it('rejects a loop', () => {
    // (1,3) から下へ、(2,3) から左で中央に戻る
    expect(
      validateBoard(
        board((d, at) => {
          d[at(1, 3)] = Dir.Down;
          d[at(2, 3)] = Dir.Left;
        }),
      ),
    ).toMatch(/revisits/);
  });

  it('rejects a path that leaves through the top edge', () => {
    // (1,2) から上へ、(0,2) からさらに上へ
    expect(
      validateBoard(
        board((d, at) => {
          d[at(1, 2)] = Dir.Up;
          d[at(0, 2)] = Dir.Up;
        }),
      ),
    ).toMatch(/leaves the board/);
  });

  it('rejects a path that leaves through the right edge (no wrapping to the next row)', () => {
    // (1,3)→(1,4)→ さらに右。添字だけ見ると (2,0) に回り込んでしまう
    expect(
      validateBoard(
        board((d, at) => {
          d[at(1, 3)] = Dir.Right;
          d[at(1, 4)] = Dir.Right;
        }),
      ),
    ).toMatch(/leaves the board/);
  });

  it('rejects arrows off the path', () => {
    expect(validateBoard(board((d, at) => (d[at(4, 4)] = Dir.Up)))).toMatch(/off the path/);
  });

  it('rejects a wrong length', () => {
    expect(validateBoard({ ...board(), length: 3 })).toMatch(/length/);
  });
});
