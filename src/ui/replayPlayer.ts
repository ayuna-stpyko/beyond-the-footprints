import type { GameState } from '../core/game';
import { icons } from './assets';
import { h, img } from './dom';
import { drawReplayFrame } from './replay';

/** つまみの直径（main.css の .scrub__knob と対応） */
const KNOB_PX = 26;
/** 目盛りの区間数 */
const TICK_INTERVALS = 5;
/** 手数によらず、だいたいこの時間で再生し終える */
const REPLAY_TOTAL_MS = 6000;
/** 1 コマの間隔の下限（約 60fps）と上限 */
const MIN_TICK_MS = 16;
const MAX_TICK_MS = 300;

/**
 * 再生の速さ。interval ミリ秒ごとに perTick 歩進める。
 * 手数が多いときは 1 コマで何歩も進め、REPLAY_TOTAL_MS 前後で再生し終わるようにする
 */
export function replayTiming(last: number): { interval: number; perTick: number } {
  const steps = Math.max(1, last);
  const perTick = Math.max(1, Math.ceil((MIN_TICK_MS * steps) / REPLAY_TOTAL_MS));
  const interval = Math.max(MIN_TICK_MS, Math.min(MAX_TICK_MS, (REPLAY_TOTAL_MS * perTick) / steps));
  return { interval, perTick };
}

// リプレイ
export function replayPlayer(game: GameState, px: number, opts: { autoplay?: boolean } = {}) {
  const last = game.log.length - 1;
  const canvas = h('canvas.replay__canvas', { width: px * 2, height: px * 2 });
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  let step = last;
  let timer = 0;
  const label = h('span.playback__label');
  const progress = h('div.scrub__progress');
  const knob = img(icons.knob, 'scrub__knob');
  const range = h('input', { type: 'range', min: 0, max: Math.max(1, last), value: last, 'aria-label': 'リプレイ位置' });
  const playBtn = h('button.play-btn', { 'aria-label': '再生' }, img(icons.iconPlay));
  const ticks = Array.from({ length: TICK_INTERVALS + 1 }, (_, k) =>
    h('i.scrub__tick', { style: `left:${(k / TICK_INTERVALS) * 100}%` }),
  );

  const show = (s: number) => {
    step = s;
    drawReplayFrame(ctx, game, step, px);
    const pct = last === 0 ? 100 : (step / last) * 100;
    // つまみがトラックからはみ出さないよう、中心を [半径, 100% - 半径] に収める
    progress.style.width = `calc(${KNOB_PX / 2}px + (100% - ${KNOB_PX}px) * ${pct / 100})`;
    knob.style.left = `calc((100% - ${KNOB_PX}px) * ${pct / 100})`;
    range.value = String(step);
    label.textContent = `${step} / ${last}歩`;
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    playBtn.classList.remove('play-btn--pause');
    playBtn.replaceChildren(img(icons.iconPlay));
  };
  const play = () => {
    if (step >= last) show(0);
    playBtn.classList.add('play-btn--pause');
    playBtn.replaceChildren();
    const { interval, perTick } = replayTiming(last);
    timer = window.setInterval(() => {
      if (step >= last) return stop();
      show(Math.min(last, step + perTick));
    }, interval);
  };
  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  range.addEventListener('input', () => {
    stop();
    show(Number(range.value));
  });

  const el = h(
    'div.replay',
    {},
    canvas,
    h('div.playback', {}, playBtn, h('div.scrub', {}, h('div.scrub__track'), progress, ...ticks, knob, range), label),
  );
  show(last);
  if (opts.autoplay && last > 0) play();
  return { el, dispose: stop };
}
