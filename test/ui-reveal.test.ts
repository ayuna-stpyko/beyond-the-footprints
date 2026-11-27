// @vitest-environment happy-dom
/**
 * 宝が見えたあと、通らなかった足跡を薄く見せる（チャレンジ以外）。
 * canvas は描画されないので、薄い足跡を描く関数と、リプレイの描画に渡す引数で確かめる
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GameState, move, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { isMoveDir } from '../src/core/types';
import type * as CellPainterModule from '../src/ui/cellPainter';
import { paintRouteHint } from '../src/ui/cellPainter';
import { FX_MAX_MS } from '../src/ui/endFx';
import type * as ReplayModule from '../src/ui/replay';
import { drawReplayFrame } from '../src/ui/replay';
import { type GameActions, gameScreen } from '../src/ui/screens/game';
import { pressKey, setupDom } from './helpers/dom';

vi.mock('../src/ui/gif', () => ({ makeReplayGif: vi.fn(() => new Blob(['gif'])) }));
vi.mock('../src/ui/cellPainter', async (importOriginal) => {
  const mod = await importOriginal<typeof CellPainterModule>();
  return { ...mod, paintRouteHint: vi.fn(mod.paintRouteHint) };
});
vi.mock('../src/ui/replay', async (importOriginal) => {
  const mod = await importOriginal<typeof ReplayModule>();
  return { ...mod, drawReplayFrame: vi.fn(mod.drawReplayFrame) };
});

const ARROW = ['', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] as const;

/** N=3 の盤面で、最初の 1 歩だけ矢印どおりに動いたあとゲームオーバーにした状態 */
function lostGame(): GameState {
  const g = newGame(generateBoard(3, 1));
  const d = g.board.dirs[g.pos];
  if (!isMoveDir(d)) throw new Error('center has no arrow');
  move(g, d);
  g.status = 'lost';
  return g;
}

const ctx = () => document.createElement('canvas').getContext('2d')!;

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('drawReplayFrame', () => {
  beforeEach(() => setupDom());

  it('draws the unwalked footprints faintly on the last frame when asked', () => {
    const g = lostGame();
    drawReplayFrame(ctx(), g, g.log.length - 1, 300, true);
    expect(vi.mocked(paintRouteHint).mock.calls.length).toBeGreaterThan(0);
  });

  it('does not reveal them on earlier frames or by default (the shared GIF)', () => {
    const g = lostGame();
    drawReplayFrame(ctx(), g, 0, 300, true);
    drawReplayFrame(ctx(), g, g.log.length - 1, 300);
    expect(paintRouteHint).not.toHaveBeenCalled();
  });
});

/**
 * 矢印どおりに宝まで歩いて、演出のあとのリプレイを出す（スマホ表示）。
 * 返り値はリプレイの描画に渡した revealRoute の一覧
 */
function playToEnd(extra: Partial<GameActions>) {
  const g = newGame(generateBoard(1, 5));
  const root = document.createElement('div');
  document.body.append(root);
  const dispose = gameScreen(root, g, { title: vi.fn(), restart: vi.fn(), again: vi.fn(), shareUrl: '', ...extra }, false);
  while (g.status === 'playing') {
    const d = g.board.dirs[g.pos];
    if (!isMoveDir(d)) throw new Error('walked off the route');
    pressKey(ARROW[d]);
  }
  vi.advanceTimersByTime(FX_MAX_MS);
  dispose();
  return vi.mocked(drawReplayFrame).mock.calls.map((c) => c[4]);
}

describe('gameScreen reveals the route after the end except in challenges', () => {
  beforeEach(() => {
    setupDom();
    vi.useFakeTimers();
  });

  it('reveals on a normal board', () => {
    const reveals = playToEnd({});
    expect(reveals.length).toBeGreaterThan(0);
    expect(reveals.every((r) => r === true)).toBe(true);
  });

  it('does not reveal on a challenge board', () => {
    const reveals = playToEnd({ challenge: { title: 'デイリー 11/28', heading: 'デイリー 11/28', attempt: 1 } });
    expect(reveals.length).toBeGreaterThan(0);
    expect(reveals.some((r) => r === true)).toBe(false);
  });
});
