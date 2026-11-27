// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GameState, newGame } from '../src/core/game';
import { type TutorialStage, tutorialBoard } from '../src/core/tutorial';
import { Dir, isMoveDir } from '../src/core/types';
import { FX_MAX_MS } from '../src/ui/endFx';
import { gameScreen } from '../src/ui/screens/game';
import { type TutorialNav, tutorialHooks } from '../src/ui/tutorial';
import { pressKey, setupDom } from './helpers/dom';

vi.mock('../src/ui/gif', () => ({ makeReplayGif: vi.fn(() => new Blob(['gif'])) }));

const ARROW = ['', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] as const;

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const bubbleText = () => q('.tut-bubble')?.textContent ?? null;

function buttonByText(label: string) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`button not found: ${label}`);
  return btn;
}

let disposers: (() => void)[] = [];

const mockNav = () => ({ next: vi.fn(), retry: vi.fn(), title: vi.fn(), play: vi.fn() }) satisfies TutorialNav;

function mountStage(stage: TutorialStage, attempt = 0) {
  const g = newGame(tutorialBoard(stage, attempt));
  const nav = mockNav();
  const root = document.createElement('div');
  document.body.append(root);
  const dispose = gameScreen(
    root,
    g,
    { title: vi.fn(), restart: vi.fn(), again: vi.fn(), shareUrl: '', tutorial: tutorialHooks(stage, nav) },
    false,
  );
  disposers.push(dispose);
  return { g, nav };
}

/** 矢印どおりに 1 歩進む */
function followArrow(g: GameState) {
  const d = g.board.dirs[g.pos];
  if (!isMoveDir(d)) throw new Error('not on the route');
  pressKey(ARROW[d]);
}

/** 矢印どおりに、終わるまで歩く（終了演出も最後まで進める） */
function followToEnd(g: GameState) {
  while (g.status === 'playing') followArrow(g);
  vi.advanceTimersByTime(FX_MAX_MS);
}

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  { name: 'mobile', media: {} },
  { name: 'pc', media: { pc: true } },
])('tutorial on the game screen ($name)', ({ media }) => {
  beforeEach(() => {
    setupDom(media);
    vi.useFakeTimers();
  });

  it('shows the stage instead of N and has no reset button', () => {
    mountStage(1);
    expect(document.body.textContent).toContain('チュートリアル 1 / 3');
    expect(q('.pill--reset')).toBeNull();
  });

  it('shows the intro on the board and hides it on tap', () => {
    mountStage(1);
    expect(bubbleText()).toContain('上へ 1 歩進んでみよう');
    q('.tut-bubble')!.click();
    expect(q('.tut-bubble')).toBeNull();
  });

  it('replaces the message on the first step and hides it on the next', () => {
    const { g } = mountStage(1);
    followArrow(g);
    expect(bubbleText()).toContain('足跡（矢印）が見えました');
    followArrow(g);
    expect(q('.tut-bubble')).toBeNull();
  });

  it('tells once that a cell without footprints was not walked', () => {
    const { g } = mountStage(1);
    pressKey('ArrowLeft');
    expect(g.board.dirs[g.pos]).toBe(Dir.None);
    expect(bubbleText()).toContain('ここには足跡がありません');
    pressKey('ArrowDown');
    expect(q('.tut-bubble')).toBeNull();
  });

  it('points at the moves left at the start of stage 2 until the first move', () => {
    const { g } = mountStage(2);
    expect(q('.hud.tut-focus .tut-pointer')).not.toBeNull();
    followArrow(g);
    expect(q('.tut-focus')).toBeNull();
    expect(q('.tut-pointer')).toBeNull();
  });

  it('shows the stage 1 result card, points at the help button, and goes next', () => {
    const { g, nav } = mountStage(1);
    followToEnd(g);
    expect(g.status).toBe('won');
    expect(q('.tut-card .result-card__title')?.textContent).toBe('宝を見つけた！');
    expect(q('.tut-focus[aria-label="あそびかた"] .tut-pointer')).not.toBeNull();
    // チュートリアルではリプレイやシェアを出さない
    expect(q('.replay')).toBeNull();
    expect(q('.share-row')).toBeNull();
    buttonByText('次へ').click();
    expect(nav.next).toHaveBeenCalledTimes(1);
  });

  it('runs out of moves on stage 2 when following the arrows', () => {
    const { g, nav } = mountStage(2);
    followToEnd(g);
    expect(g.status).toBe('lost');
    expect(q('.tut-card')?.textContent).toContain('48 歩もかけて遠回り');
    buttonByText('次へ').click();
    expect(nav.next).toHaveBeenCalledTimes(1);
  });

  it('offers another map after losing stage 3', () => {
    const { g, nav } = mountStage(3);
    followToEnd(g);
    expect(g.status).toBe('lost');
    buttonByText('別の地図で挑戦').click();
    expect(nav.retry).toHaveBeenCalledTimes(1);
  });
});

describe('tutorialHooks', () => {
  it('stage 3 clear offers the title and the real game', () => {
    const n = mockNav();
    const g = newGame(tutorialBoard(3));
    g.status = 'won';
    const r = tutorialHooks(3, n).result(g);
    expect(r.title).toBe('近道を見つけた！');
    r.actions.find((a) => a.label === '遊んでみる')!.onClick();
    r.actions.find((a) => a.label === 'タイトルへ')!.onClick();
    expect(n.play).toHaveBeenCalledTimes(1);
    expect(n.title).toHaveBeenCalledTimes(1);
  });

  it('warns when 10 moves are left on stage 2', () => {
    const hooks = tutorialHooks(2, mockNav());
    const g = newGame(tutorialBoard(2));
    g.movesLeft = 11;
    expect(hooks.bubble(g)).toBeNull();
    g.movesLeft = 10;
    expect(hooks.bubble(g)?.text).toContain('体力が残り少なく');
  });
});
