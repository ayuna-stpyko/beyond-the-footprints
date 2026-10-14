import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { GameState } from '../core/game';
import { COLORS } from './constants';
import { drawReplayFrame } from './replay';

const PX = 320;
const MAX_FRAMES = 120;
const FRAME_DELAY_MS = 160;
/** 最後のコマは結果が分かるよう長めに止める */
const LAST_FRAME_DELAY_MS = 2500;

/** リプレイを GIF にする */
export function makeReplayGif(game: GameState): Blob {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const last = game.log.length - 1;
  const stride = Math.max(1, Math.ceil(last / MAX_FRAMES));
  const steps: number[] = [];
  for (let s = 0; s < last; s += stride) steps.push(s);
  steps.push(last);

  const gif = GIFEncoder();
  steps.forEach((s, k) => {
    ctx.fillStyle = COLORS.gifBg;
    ctx.fillRect(0, 0, PX, PX);
    drawReplayFrame(ctx, game, s, PX);
    const { data } = ctx.getImageData(0, 0, PX, PX);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const isLast = k === steps.length - 1;
    gif.writeFrame(index, PX, PX, { palette, delay: isLast ? LAST_FRAME_DELAY_MS : FRAME_DELAY_MS });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
