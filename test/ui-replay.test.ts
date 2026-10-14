// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GameState, move, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { DC, DR, Dir } from '../src/core/types';
import { replayPlayer } from '../src/ui/replayPlayer';
import { setupDom } from './helpers/dom';

/** 再生し終えるのに十分な時間（正確な間隔・合計時間はここでは問わない） */
const LONG_MS = 20_000;

/** 中央の行を左右に往復して 12N 歩を使い切った盤面（test/game.test.ts と同じ） */
function playedGame(): GameState {
  const b = generateBoard(10, 3);
  const g = newGame(b);
  let d: Exclude<Dir, 0> = Dir.Left;
  while (g.status === 'playing') {
    const r = ((g.pos / b.size) | 0) + DR[d];
    const c = (g.pos % b.size) + DC[d];
    if (r * b.size + c === b.treasure || c < 0 || c >= b.size) d = d === Dir.Left ? Dir.Right : Dir.Left;
    move(g, d);
  }
  return g;
}

function mount(game: GameState, autoplay?: boolean) {
  const player = replayPlayer(game, 300, autoplay === undefined ? undefined : { autoplay });
  document.body.append(player.el);
  const label = () => player.el.querySelector('.playback__label')!.textContent;
  const range = player.el.querySelector<HTMLInputElement>('input[type=range]')!;
  const playBtn = player.el.querySelector<HTMLButtonElement>('.play-btn')!;
  const playing = () => playBtn.classList.contains('play-btn--pause');
  /** ラベルの現在の歩数 */
  const step = () => Number(label()?.split(' / ')[0]);
  return { player, label, range, playBtn, playing, step };
}

let game: GameState;
let last: number;

beforeEach(() => {
  setupDom();
  vi.useFakeTimers();
  game = playedGame();
  last = game.log.length - 1;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('replayPlayer', () => {
  it('starts at the last step', () => {
    const { label, range, playing, player } = mount(game);
    expect(last).toBeGreaterThan(0);
    expect(label()).toBe(`${last} / ${last}歩`);
    expect(range.value).toBe(String(last));
    expect(range.max).toBe(String(last));
    expect(playing()).toBe(false);
    expect(player.el.querySelector('canvas.replay__canvas')).not.toBeNull();
    // 自動再生しないなら時間がたっても動かない
    vi.advanceTimersByTime(LONG_MS);
    expect(label()).toBe(`${last} / ${last}歩`);
  });

  it('restarts from 0 when play is clicked at the end and stops at the end', () => {
    const { label, playBtn, playing, step, range } = mount(game);
    playBtn.click();
    expect(playing()).toBe(true);
    expect(label()).toBe(`0 / ${last}歩`);
    expect(range.value).toBe('0');

    vi.advanceTimersByTime(1000);
    const mid = step();
    expect(mid).toBeGreaterThan(0);
    expect(Number(range.value)).toBe(mid);

    vi.advanceTimersByTime(LONG_MS);
    expect(label()).toBe(`${last} / ${last}歩`);
    expect(playing()).toBe(false);
    // 止まったらタイマーも残っていない
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses and resumes from the current step', () => {
    const { playBtn, playing, step } = mount(game);
    playBtn.click();
    vi.advanceTimersByTime(1000);
    playBtn.click();
    expect(playing()).toBe(false);
    const paused = step();
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(last);
    vi.advanceTimersByTime(LONG_MS);
    expect(step()).toBe(paused);

    // 途中からの再生は 0 に戻らない
    playBtn.click();
    expect(playing()).toBe(true);
    expect(step()).toBe(paused);
    vi.advanceTimersByTime(LONG_MS);
    expect(step()).toBe(last);
    expect(playing()).toBe(false);
  });

  it('stops playback and shows the step when the range is moved', () => {
    const { playBtn, playing, range, label } = mount(game);
    playBtn.click();
    vi.advanceTimersByTime(500);
    const target = Math.floor(last / 2);
    range.value = String(target);
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(playing()).toBe(false);
    expect(label()).toBe(`${target} / ${last}歩`);
    vi.advanceTimersByTime(LONG_MS);
    expect(label()).toBe(`${target} / ${last}歩`);
  });

  it('moves with the range while paused', () => {
    const { range, label, playing } = mount(game);
    range.value = '3';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label()).toBe(`3 / ${last}歩`);
    expect(playing()).toBe(false);
  });

  it('autoplays from the beginning', () => {
    const { label, playing, step } = mount(game, true);
    expect(playing()).toBe(true);
    expect(label()).toBe(`0 / ${last}歩`);
    vi.advanceTimersByTime(1000);
    expect(step()).toBeGreaterThan(0);
    vi.advanceTimersByTime(LONG_MS);
    expect(label()).toBe(`${last} / ${last}歩`);
    expect(playing()).toBe(false);
  });

  it('does not autoplay a game with no moves', () => {
    const { label, playing, range } = mount(newGame(generateBoard(3, 1)), true);
    expect(playing()).toBe(false);
    expect(label()).toBe('0 / 0歩');
    expect(range.value).toBe('0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the timer on dispose', () => {
    const { player, label, playing } = mount(game, true);
    vi.advanceTimersByTime(500);
    player.dispose();
    expect(playing()).toBe(false);
    const shown = label();
    vi.advanceTimersByTime(LONG_MS);
    expect(label()).toBe(shown);
    expect(vi.getTimerCount()).toBe(0);
  });
});
