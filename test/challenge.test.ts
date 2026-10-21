// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { CHALLENGE_N, currentChallenge, PERIODS } from '../src/core/challenge';
import { move, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { Dir } from '../src/core/types';
import { validateBoard } from '../src/core/validate';
import { encodeMoves, loadSave, restoreGame, writeSave } from '../src/ui/challengeSave';
import { shareText } from '../src/ui/share';

/** JST の日時を UTC のミリ秒にする */
const jst = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);

describe('currentChallenge', () => {
  it('switches the day at 0:00 JST', () => {
    expect(currentChallenge('daily', jst(2026, 10, 21, 23, 59)).key).toBe('daily:2026-10-21');
    expect(currentChallenge('daily', jst(2026, 10, 22, 0, 0)).key).toBe('daily:2026-10-22');
    // UTC ではまだ前日の 15:00
    expect(currentChallenge('daily', Date.UTC(2026, 9, 21, 15, 0)).key).toBe('daily:2026-10-22');
  });

  it('starts the week on Monday', () => {
    // 2026-10-19 は月曜
    expect(currentChallenge('weekly', jst(2026, 10, 19, 0, 0)).key).toBe('weekly:2026-10-19');
    expect(currentChallenge('weekly', jst(2026, 10, 25, 23, 59)).key).toBe('weekly:2026-10-19');
    expect(currentChallenge('weekly', jst(2026, 10, 26, 0, 0)).key).toBe('weekly:2026-10-26');
    // 年をまたぐ週
    expect(currentChallenge('weekly', jst(2027, 1, 1)).key).toBe('weekly:2026-12-28');
  });

  it('switches the month on the 1st', () => {
    expect(currentChallenge('monthly', jst(2026, 10, 31, 23, 59)).key).toBe('monthly:2026-10');
    expect(currentChallenge('monthly', jst(2026, 11, 1)).key).toBe('monthly:2026-11');
  });

  it('gives the same seed in the same period and different seeds across periods', () => {
    const a = currentChallenge('daily', jst(2026, 10, 21, 1));
    expect(currentChallenge('daily', jst(2026, 10, 21, 22)).seed).toBe(a.seed);
    expect(currentChallenge('daily', jst(2026, 10, 22, 1)).seed).not.toBe(a.seed);
    expect(currentChallenge('weekly', jst(2026, 10, 19)).seed).not.toBe(currentChallenge('daily', jst(2026, 10, 19)).seed);
  });

  it('labels each period', () => {
    const t = jst(2026, 10, 21);
    expect(currentChallenge('daily', t).label).toBe('2026/10/21');
    expect(currentChallenge('weekly', t).label).toBe('2026/10/19〜');
    expect(currentChallenge('monthly', t).label).toBe('2026年10月');
    expect(currentChallenge('daily', t).shortLabel).toBe('10/21');
    expect(currentChallenge('weekly', t).shortLabel).toBe('10/19〜');
    expect(currentChallenge('monthly', t).shortLabel).toBe('10月');
  });

  it.each(PERIODS)('generates a valid %s board', (p) => {
    const ch = currentChallenge(p, jst(2026, 10, 21));
    expect(validateBoard(generateBoard(CHALLENGE_N[p], ch.seed))).toBeNull();
  });
});

describe('challenge save', () => {
  const ch = currentChallenge('daily', jst(2026, 10, 21));
  const board = generateBoard(5, 1);

  beforeEach(() => localStorage.clear());

  it('starts fresh without a save', () => {
    expect(loadSave(ch)).toEqual({ attempt: 1, moves: '', won: false });
  });

  it('restores the position from the saved moves', () => {
    const g = newGame(board);
    move(g, Dir.Up);
    move(g, Dir.Left);
    move(g, Dir.Down);
    writeSave(ch, { attempt: 2, moves: encodeMoves(g), won: false });

    const save = loadSave(ch);
    expect(save).toEqual({ attempt: 2, moves: '143', won: false });
    const r = restoreGame(board, save.moves);
    expect(r.pos).toBe(g.pos);
    expect(r.log).toEqual(g.log);
    expect(r.movesLeft).toBe(g.movesLeft);
  });

  it('discards a save from another period', () => {
    writeSave(ch, { attempt: 3, moves: '1', won: true });
    expect(loadSave(currentChallenge('daily', jst(2026, 10, 22)))).toEqual({ attempt: 1, moves: '', won: false });
  });

  it('discards a broken save', () => {
    localStorage.setItem('beyond-footprints:challenge:daily', '{oops');
    expect(loadSave(ch).attempt).toBe(1);
    localStorage.setItem('beyond-footprints:challenge:daily', JSON.stringify({ key: ch.key, attempt: 2, moves: '19' }));
    expect(loadSave(ch).attempt).toBe(1);
  });
});

describe('shareText (challenge)', () => {
  it('shows the attempt and the moves', () => {
    const b = generateBoard(1, 5);
    const g = newGame(b);
    g.status = 'won';
    g.movesLeft = 8;
    expect(shareText(g, 'u', { title: 'デイリー 2026/10/21', heading: 'デイリー 10/21', attempt: 3 })).toBe(
      'BEYOND THE FOOTPRINTS デイリー 2026/10/21\n3回目で発見！ 4/12歩\n#BeyondTheFootprints\nu',
    );
  });
});
