// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { nRange } from '../src/analytics';
import { type GameState, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { Dir } from '../src/core/types';
import { CellLook, paintCell } from '../src/ui/cellPainter';
import { COLORS, GAP_RATIO, MIN_DETAIL_CELL_PX } from '../src/ui/constants';
import { replayTreasureSpot } from '../src/ui/replay';
import { replayTiming } from '../src/ui/replayPlayer';
import { boardLabel } from '../src/ui/screens/common';
import {
  FX,
  FX_MAX_MS,
  PAN_MAX_MS,
  bounceAt,
  fxTimeline,
  panDuration,
  PRE_RIPPLE_INTERVAL,
  ZOOM_MAX_MS,
  ZOOM_MIN_MS,
  ZOOM_MS_PER_HALVING,
  cameraPhase,
  preRippleProgress,
  rippleProgress,
  sparkleAlpha,
  zoomDuration,
} from '../src/ui/endFx';
import { gifFrames } from '../src/ui/gif';
import { keyAction, positionText, treasureText, zoomText } from '../src/ui/screens/game';
import { parseN } from '../src/ui/screens/nInput';
import { shareText } from '../src/ui/share';
import { wonGame } from './helpers/game';

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

describe('treasureText', () => {
  it('tells where the treasure was, counted from the start like the position badge', () => {
    const g = gameAt(0, 0);
    const { n, size } = g.board;
    g.board = { ...g.board, treasure: (n + 3) * size + (n + 4) };
    expect(treasureText(g)).toBe('宝は スタートから右4・下3 にありました。');
  });
});

/** 細かく描けない小ささのマスを塗ったときの色 */
function fillColor(look: CellLook, player: boolean) {
  const ctx = { fillStyle: '', fillRect: () => {} };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  paintCell(ctx as unknown as CanvasRenderingContext2D, 0, 0, MIN_DETAIL_CELL_PX - 1, look, 0, player);
  return ctx.fillStyle;
}

describe('paintCell (cells too small for details)', () => {
  it('paints the treasure gold so it differs from the current position (red)', () => {
    expect(fillColor(CellLook.Treasure, false)).toBe(COLORS.gold);
    expect(fillColor(CellLook.Found, false)).toBe(COLORS.gold);
    expect(fillColor(CellLook.Empty, true)).toBe(COLORS.red);
    expect(fillColor(CellLook.Arrow, true)).toBe(COLORS.red);
    expect(fillColor(CellLook.Arrow, false)).toBe(COLORS.arrow);
  });
});

describe('replayTreasureSpot', () => {
  const PX = 300;
  /** 盤面全体を一辺 PX に描いたときのマスの中心 */
  function wholeBoardCenter(g: GameState, cell: number) {
    const pad = PX * 0.023;
    const pitch = (PX - 2 * pad) / (g.board.size - GAP_RATIO);
    return { x: pad + ((cell % g.board.size) + 0.5) * pitch, y: pad + (Math.floor(cell / g.board.size) + 0.5) * pitch };
  }

  it('draws the whole board for large boards, so the treasure is where it is on the board', () => {
    // スタートから 1 歩も動いていなくても、切り出さずに盤面全体を描く
    const g = newGame(generateBoard(200, 1));
    const spot = replayTreasureSpot(g, PX);
    const want = wholeBoardCenter(g, g.board.treasure);
    expect(spot.cx).toBeCloseTo(want.x);
    expect(spot.cy).toBeCloseTo(want.y);
  });

  it('keeps cropping small boards around the walk and the treasure', () => {
    const g = wonGame();
    const spot = replayTreasureSpot(g, PX);
    // 切り出して大きく描くので、マスは細かく描ける大きさ
    expect(spot.s).toBeGreaterThan(MIN_DETAIL_CELL_PX);
  });
});

describe('gifFrames', () => {
  it('adds sparkle frames on the last step after a win, then holds a clean frame', () => {
    const g = wonGame();
    const last = g.log.length - 1;
    const frames = gifFrames(g);
    const sparkles = frames.filter((f) => f.sparkle > 0);
    expect(sparkles.length).toBeGreaterThan(0);
    expect(sparkles.every((f) => f.step === last)).toBe(true);
    // きらめきは歩みのあとに出て、最後は何も重ねないコマで長めに止める
    const firstSparkle = frames.indexOf(sparkles[0]);
    expect(frames.slice(0, firstSparkle).every((f) => f.sparkle === 0)).toBe(true);
    const end = frames.at(-1)!;
    expect(end).toMatchObject({ step: last, sparkle: 0 });
    expect(end.delay).toBeGreaterThan(sparkles[0].delay);
    // きらめきの区間の長さだけ足される
    const [from, to] = FX.won.sparkle!;
    const added = frames.filter((f) => f.step === last && f !== end).reduce((sum, f) => sum + f.delay, 0);
    expect(added).toBe(to - from);
  });

  it('has no sparkles after a loss', () => {
    // コマ割りは status と log しか見ないので、歩いた記録を直接作る
    const g = newGame(generateBoard(1, 5));
    g.log.push(g.pos - 1, g.pos);
    g.status = 'lost';
    const frames = gifFrames(g);
    expect(frames.every((f) => f.sparkle === 0)).toBe(true);
    expect(frames.at(-1)!.step).toBe(g.log.length - 1);
  });
});

describe('end effect timing', () => {
  it('moves the camera after a short pause and arrives before the result', () => {
    // 縮小も拡大もしないとき（宝が見えていて、倍率もそのまま）は移動だけ
    const tl = fxTimeline('lost', 2000);
    const { panDelay } = FX.lost;
    expect(cameraPhase(tl, 0).move).toBe(0);
    expect(cameraPhase(tl, panDelay + 1000).move).toBeCloseTo(0.5);
    expect(cameraPhase(tl, panDelay + 2000).move).toBe(1);
    expect(tl.arrive).toBe(panDelay + 2000);
    expect(tl.total).toBe(tl.arrive + FX.lost.after);
    // クリアはカメラを動かさず、最初から宝に着いている
    const won = fxTimeline('won');
    expect(cameraPhase(won, 0)).toEqual({ zoomOut: 0, move: 1, zoomIn: 1 });
    expect(won.arrive).toBe(0);
  });

  it('zooms out, then moves, then zooms in, one at a time', () => {
    const out = 600;
    const move = 1000;
    const back = 800;
    const tl = fxTimeline('lost', move, out, back);
    expect(tl.pan).toBe(out + move + back);
    expect(tl.arrive).toBe(tl.panDelay + tl.pan);
    const at = (t: number) => cameraPhase(tl, tl.panDelay + t);
    // 縮小している間は動かない
    expect(at(out / 2)).toEqual({ zoomOut: expect.closeTo(0.5), move: 0, zoomIn: 0 });
    // 縮小しきってから動く。動いている間は倍率そのまま
    expect(at(out)).toEqual({ zoomOut: 1, move: 0, zoomIn: 0 });
    expect(at(out + move / 2)).toEqual({ zoomOut: 1, move: expect.closeTo(0.5), zoomIn: 0 });
    // 着いてから拡大する。拡大している間は動かない
    expect(at(out + move)).toEqual({ zoomOut: 1, move: 1, zoomIn: 0 });
    expect(at(out + move + back / 2)).toEqual({ zoomOut: 1, move: 1, zoomIn: expect.closeTo(0.5) });
    expect(at(tl.pan)).toEqual({ zoomOut: 1, move: 1, zoomIn: 1 });
  });

  it('can skip the zoom-out and still zoom in after moving (the treasure is already in view)', () => {
    const move = 1000;
    const back = 800;
    const tl = fxTimeline('lost', move, 0, back);
    expect(tl.pan).toBe(move + back);
    const at = (t: number) => cameraPhase(tl, tl.panDelay + t);
    // すぐ動き出す
    expect(at(move / 2).move).toBeCloseTo(0.5);
    expect(at(move)).toEqual({ zoomOut: 1, move: 1, zoomIn: 0 });
    expect(at(move + back / 2).zoomIn).toBeCloseTo(0.5);
    expect(at(tl.pan).zoomIn).toBe(1);
  });

  it('takes longer to zoom the more it zooms out', () => {
    // 倍率が変わらなければ縮小しない
    expect(zoomDuration(1)).toBe(0);
    expect(zoomDuration(Number.POSITIVE_INFINITY)).toBe(0);
    // 少しだけ引くときも短すぎないように
    expect(zoomDuration(1.5)).toBe(ZOOM_MIN_MS);
    // 半分になるごとに同じだけ長くなる
    expect(zoomDuration(2 ** 8) - zoomDuration(2 ** 4)).toBeCloseTo(ZOOM_MS_PER_HALVING * 4);
    // どんなに引いても上限まで
    expect(zoomDuration(2 ** 30)).toBe(ZOOM_MAX_MS);
  });

  it('takes longer to move to a farther treasure, up to a limit', () => {
    const base = FX.lost.pan;
    // 画面 1 枚分以内は最短
    expect(panDuration(0)).toBe(base);
    expect(panDuration(1)).toBe(base);
    // 遠いほど長い（距離の平方根に比例）
    expect(panDuration(4)).toBeCloseTo(base * 2);
    expect(panDuration(9)).toBeGreaterThan(panDuration(4));
    // どんなに遠くても上限まで
    expect(panDuration(10_000)).toBe(PAN_MAX_MS);
    expect(panDuration(Number.POSITIVE_INFINITY)).toBe(base);
    // 最も長い演出は、上限まで引いて上限の長さで動いたゲームオーバー
    expect(FX_MAX_MS).toBe(fxTimeline('lost', PAN_MAX_MS, ZOOM_MAX_MS).total);
  });

  it('sends ripples from the treasure while the camera moves toward it', () => {
    const tl = fxTimeline('lost', 2000);
    const { panDelay } = tl;
    // 動き出す前は出ない
    expect(preRippleProgress(tl, panDelay - 1)).toEqual([]);
    expect(preRippleProgress(tl, panDelay)).toEqual([0]);
    // 一定の間隔で次々に出る
    expect(preRippleProgress(tl, panDelay + PRE_RIPPLE_INTERVAL)).toHaveLength(2);
    // 着いたあとは新しく出ない（出ていたものは広がりきって消える）
    const last = Math.floor((tl.pan - 1) / PRE_RIPPLE_INTERVAL) * PRE_RIPPLE_INTERVAL + panDelay;
    expect(preRippleProgress(tl, last + FX.lost.ripple)).toEqual([]);
    // カメラが動かないとき（クリア・全体が見えているとき）は出さない
    expect(preRippleProgress(fxTimeline('won'), 0)).toEqual([]);
    expect(preRippleProgress(fxTimeline('lost', 0), panDelay)).toEqual([]);
  });

  it('runs every ripple to the end before the result', () => {
    for (const kind of ['won', 'lost'] as const) {
      const { ripples, ripple, after } = FX[kind];
      for (const at of ripples) expect(at + ripple).toBeLessThanOrEqual(after);
      expect(rippleProgress(kind, ripples[0] - 1)).toEqual([]);
      expect(rippleProgress(kind, ripples[0] + ripple / 2)[0]).toBeCloseTo(0.5);
      expect(rippleProgress(kind, after)).toEqual([]);
    }
  });

  it('bounces the treasure and sparkles only on a win', () => {
    expect(bounceAt('won', FX.won.bounce / 2)?.scale).toBeGreaterThan(1);
    expect(bounceAt('won', FX.won.bounce)).toBeNull();
    expect(bounceAt('lost', 100)).toBeNull();
    const [s0, s1] = FX.won.sparkle!;
    expect(sparkleAlpha('won', (s0 + s1) / 2)).toBeCloseTo(1);
    expect(sparkleAlpha('won', s1)).toBe(0);
    expect(sparkleAlpha('lost', 500)).toBe(0);
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
