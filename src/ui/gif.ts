import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { GameState } from '../core/game';
import { COLORS } from './constants';
import { FX, sparkleAlpha } from './endFx';
import { drawReplayFrame, paintReplaySparkles } from './replay';

const PX = 320;
const MAX_FRAMES = 120;
const FRAME_DELAY_MS = 160;
/** 最後のコマは結果が分かるよう長めに止める */
const LAST_FRAME_DELAY_MS = 2500;
/** クリア後のきらめきのコマの間隔 */
const SPARKLE_FRAME_MS = 100;

/** GIF の 1 コマ: 何歩目を描くか、きらめきの濃さ（0 でなし）、表示時間 */
export interface GifFrame {
  step: number;
  sparkle: number;
  delay: number;
}

/**
 * GIF のコマ割り。歩みを最大 MAX_FRAMES コマに間引き、最後のコマを長めに止める。
 * クリアしたときは、最後のコマのあとに宝のまわりのきらめき（ゲーム中と同じ）が光って消えるコマを足す
 */
export function gifFrames(game: GameState): GifFrame[] {
  const last = game.log.length - 1;
  const stride = Math.max(1, Math.ceil(last / MAX_FRAMES));
  const frames: GifFrame[] = [];
  for (let s = 0; s < last; s += stride) frames.push({ step: s, sparkle: 0, delay: FRAME_DELAY_MS });
  if (game.status === 'won' && FX.won.sparkle) {
    const [from, to] = FX.won.sparkle;
    for (let t = from; t < to; t += SPARKLE_FRAME_MS) {
      frames.push({ step: last, sparkle: sparkleAlpha('won', t), delay: SPARKLE_FRAME_MS });
    }
  }
  frames.push({ step: last, sparkle: 0, delay: LAST_FRAME_DELAY_MS });
  return frames;
}

/** リプレイを GIF にする */
export function makeReplayGif(game: GameState): Blob {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const gif = GIFEncoder();
  for (const { step, sparkle, delay } of gifFrames(game)) {
    ctx.fillStyle = COLORS.gifBg;
    ctx.fillRect(0, 0, PX, PX);
    drawReplayFrame(ctx, game, step, PX);
    if (sparkle > 0) paintReplaySparkles(ctx, game, PX, sparkle);
    const { data } = ctx.getImageData(0, 0, PX, PX);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, PX, PX, { palette, delay });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
