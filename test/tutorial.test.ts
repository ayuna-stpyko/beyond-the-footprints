import { describe, expect, it } from 'vitest';
import { moveLimit } from '../src/core/game';
import { STAGE3, TUTORIAL_N, parseBoard, tutorialBoard } from '../src/core/tutorial';
import { validateBoard } from '../src/core/validate';
import { GameInteractor, solve } from '../scripts/solve';

const LIMIT = moveLimit(TUTORIAL_N);
/** 矢印どおりに歩いたときの歩数 */
const follow = (b: ReturnType<typeof parseBoard>) => b.length - 1;
/** 公式解法のソルバーが 36 歩以内に解けるか */
const solvable = (b: ReturnType<typeof parseBoard>) => solve(new GameInteractor(b), { maxMoves: LIMIT }).won;

describe('tutorial boards', () => {
  const fixed = [
    ['stage 1', tutorialBoard(1)],
    ['stage 2', tutorialBoard(2)],
    ...STAGE3.map((_, i) => [`stage 3 map ${i + 1}`, tutorialBoard(3, i)] as const),
  ] as const;

  it.each(fixed)('%s is a valid 7x7 board', (_, b) => {
    expect(b.n).toBe(TUTORIAL_N);
    expect(validateBoard(b)).toBeNull();
  });

  it('stage 1 can be cleared just by following the arrows', () => {
    expect(follow(tutorialBoard(1))).toBe(11);
  });

  it('stage 2 cannot be cleared by following the arrows, and the treasure is close', () => {
    const b = tutorialBoard(2);
    expect(follow(b)).toBe(48);
    expect(follow(b)).toBeGreaterThan(LIMIT);
    // 中央から ↓↓↓← の位置
    expect(b.treasure).toBe(6 * b.size + 2);
  });

  it.each(STAGE3.map((_, i) => i))('stage 3 map %i needs a shortcut and has one', (i) => {
    const b = tutorialBoard(3, i);
    expect(follow(b)).toBeGreaterThan(LIMIT);
    expect(solvable(b)).toBe(true);
  });

  it('stage 3 falls back to generated boards that still need a shortcut', () => {
    for (let seed = 0; seed < 200; seed++) {
      const b = tutorialBoard(3, STAGE3.length, seed);
      expect(validateBoard(b)).toBeNull();
      expect(follow(b)).toBeGreaterThan(LIMIT);
    }
  });
});

describe('parseBoard', () => {
  it('rejects malformed boards', () => {
    expect(() => parseBoard(['...', '...'])).toThrow();
    expect(() => parseBoard(['...', '.x.', '..T'])).toThrow('unknown cell');
    expect(() => parseBoard(['...', '...', '...'])).toThrow('no treasure');
    expect(() => parseBoard(['...', '..', '..T'])).toThrow('row 1');
  });
});
