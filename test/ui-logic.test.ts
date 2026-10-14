// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { nRange } from '../src/analytics';
import { type GameState, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { Dir } from '../src/core/types';
import { replayTiming } from '../src/ui/replayPlayer';
import { boardLabel } from '../src/ui/screens/common';
import { keyAction, positionText, zoomText } from '../src/ui/screens/game';
import { parseN } from '../src/ui/screens/nInput';
import { shareText } from '../src/ui/share';

/** N=5（11×11）の盤面で、スタートから (right, up) の位置にいる状態 */
function gameAt(right: number, up: number): GameState {
  const g = newGame(generateBoard(5, 1));
  const { n, size } = g.board;
  g.pos = (n - up) * size + (n + right);
  return g;
}

/** 修飾キーなしでキーを押したときの操作 */
const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  keyAction({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });

/** リプレイが最後の歩まで進むのにかかる時間（ms） */
function duration(last: number) {
  const { interval, perTick } = replayTiming(last);
  return Math.ceil(last / perTick) * interval;
}

describe('positionText', () => {
  it('shows the start cell', () => {
    expect(positionText(gameAt(0, 0), false)).toBe('スタート地点');
    expect(positionText(gameAt(0, 0), true)).toBe('スタート地点');
  });

  it('shows right/up and left/down offsets', () => {
    expect(positionText(gameAt(3, 2), false)).toBe('右3・上2');
    expect(positionText(gameAt(-4, -1), false)).toBe('左4・下1');
  });

  it('omits a zero axis', () => {
    expect(positionText(gameAt(-2, 0), false)).toBe('左2');
    expect(positionText(gameAt(0, 5), false)).toBe('上5');
  });

  it('adds the prefix when long', () => {
    expect(positionText(gameAt(3, 2), true)).toBe('スタートから 右3・上2');
  });
});

describe('zoomText', () => {
  it('rounds to an integer percent from 10%', () => {
    expect(zoomText(1)).toBe('100%');
    expect(zoomText(2.345)).toBe('235%');
    expect(zoomText(0.1)).toBe('10%');
  });

  it('uses one decimal below 10%', () => {
    expect(zoomText(0.05)).toBe('5.0%');
    expect(zoomText(0.01)).toBe('1.0%');
  });

  it('uses two decimals below 1%', () => {
    expect(zoomText(0.005)).toBe('0.50%');
  });
});

describe('keyAction', () => {
  it('maps arrows and WASD to moves', () => {
    expect(press('ArrowUp')).toBe(Dir.Up);
    expect(press('ArrowDown')).toBe(Dir.Down);
    expect(press('ArrowLeft')).toBe(Dir.Left);
    expect(press('ArrowRight')).toBe(Dir.Right);
    for (const [k, d] of [['w', Dir.Up], ['a', Dir.Left], ['s', Dir.Down], ['d', Dir.Right]] as const) {
      expect(press(k)).toBe(d);
      expect(press(k.toUpperCase())).toBe(d);
    }
  });

  it('maps view keys', () => {
    expect(press(' ')).toBe('recenter');
    expect(press('f')).toBe('fit');
    expect(press('F')).toBe('fit');
    for (const k of ['+', '=', ';']) expect(press(k)).toBe('zoomIn');
    expect(press('-')).toBe('zoomOut');
  });

  it('ignores modifier keys', () => {
    expect(press('ArrowUp', { metaKey: true })).toBeNull();
    expect(press('w', { ctrlKey: true })).toBeNull();
    expect(press('f', { altKey: true })).toBeNull();
    expect(press('-', { ctrlKey: true })).toBeNull();
  });

  it('ignores unknown keys', () => {
    expect(press('x')).toBeNull();
    expect(press('Enter')).toBeNull();
    expect(press('Escape')).toBeNull();
  });
});

describe('parseN', () => {
  it('accepts integers in range', () => {
    expect(parseN('3', 2000)).toBe(3);
    expect(parseN(' 3 ', 2000)).toBe(3);
    expect(parseN('1', 2000)).toBe(1);
  });

  it('accepts full-width digits', () => {
    expect(parseN('３', 2000)).toBe(3);
    expect(parseN('１２', 2000)).toBe(12);
  });

  it('rejects non-integers and out-of-range values', () => {
    for (const t of ['0', '', '3.5', '-1', 'abc', '1e3']) expect(parseN(t, 2000)).toBeNull();
  });

  it('accepts max and rejects max+1', () => {
    expect(parseN('200', 200)).toBe(200);
    expect(parseN('201', 200)).toBeNull();
    expect(parseN('2000', 2000)).toBe(2000);
    expect(parseN('2001', 2000)).toBeNull();
  });
});

describe('replayTiming', () => {
  it('uses the slowest pace for short replays', () => {
    for (const last of [1, 5, 20]) {
      expect(replayTiming(last)).toEqual({ interval: 300, perTick: 1 });
      expect(duration(last)).toBe(last * 300);
    }
  });

  it('finishes in about 6 seconds for long replays', () => {
    for (const last of [100, 375, 400, 560, 1200, 4801, 24000, 24001]) {
      expect(duration(last)).toBeGreaterThanOrEqual(5500);
      expect(duration(last)).toBeLessThanOrEqual(6500);
    }
  });

  it('never ticks faster than about 60fps', () => {
    for (const last of [1, 100, 1200, 24000]) {
      const { interval, perTick } = replayTiming(last);
      expect(interval).toBeGreaterThanOrEqual(16);
      expect(perTick).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('shareText', () => {
  it('describes a win', () => {
    const g = newGame(generateBoard(3, 1));
    g.status = 'won';
    g.movesLeft = g.maxMoves - 12;
    expect(shareText(g, 'https://example.com/x')).toBe(
      'BEYOND THE FOOTPRINTS N=3（7×7）\n12歩で宝を発見！\n#BeyondTheFootprints\nhttps://example.com/x',
    );
  });

  it('describes a loss', () => {
    const g = newGame(generateBoard(3, 1));
    g.status = 'lost';
    expect(shareText(g, 'u')).toBe('BEYOND THE FOOTPRINTS N=3（7×7）\n宝にたどりつけず…\n#BeyondTheFootprints\nu');
  });
});

describe('boardLabel', () => {
  it('shows N and the board size', () => {
    expect(boardLabel(5)).toBe('N = 5（11 × 11）');
    expect(boardLabel(5, true)).toBe('N = 5（11 × 11 マス）');
  });
});

describe('nRange', () => {
  it('buckets N at the edges', () => {
    expect(nRange(1)).toBe('1-5');
    expect(nRange(5)).toBe('1-5');
    expect(nRange(6)).toBe('6-10');
    expect(nRange(2000)).toBe('1001-2000');
    expect(nRange(2001)).toBe('2001-');
  });
});
