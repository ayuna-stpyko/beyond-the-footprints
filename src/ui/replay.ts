import type { GameState } from '../core/game';
import { canvasImages } from './assets';
import { CellLook, paintCell, paintStartMark } from './cellPainter';
import { CELL_RATIO, COLORS, GAP_RATIO } from './constants';
import { paintSparkles } from './endFx';

/** 切り出し範囲の最小マス数（一辺） */
const MIN_SPAN = 7;
/** 歩いた範囲が広いときに足す余白の割合 */
const SPAN_MARGIN = 1.15;
/** 画像の一辺に対する外側の余白・角丸の割合 */
const PAD_RATIO = 0.023;
const RADIUS_RATIO = 0.04;
/** マスがこれより小さいときは軌跡の線で描く */
const MIN_CELL_PX = 6;

/** 軌跡を線で描くときの太さ（画像の一辺に対する割合と下限） */
const TRAIL_WIDTH_RATIO = 1 / 120;
const TRAIL_MIN_WIDTH_PX = 2;

/**
 * 一辺 px の画像に、盤面のどの範囲をどの大きさで描くか。
 * - 大きい盤面（全体を描くとマスが細かく描けない）: 盤面全体を描く。
 *   スタート・宝・現在地が盤面のどこにあるかが分かるように
 * - 小さい盤面: 歩いた範囲と宝が収まるところを切り出して大きく描く
 */
function replayLayout(game: GameState, px: number) {
  const { board, log } = game;
  const { size } = board;
  const pad = px * PAD_RATIO;
  const pitchOf = (span: number) => (px - 2 * pad) / (span - GAP_RATIO);

  if (pitchOf(size) * CELL_RATIO < MIN_CELL_PX) {
    const pitch = pitchOf(size);
    return { r0: 0, c0: 0, span: size, pad, pitch, cell: pitch * CELL_RATIO };
  }

  // 切り出し範囲: 軌跡と宝の外接矩形 + 1 マスの余白を正方形にする（最小 7 マス）
  let rMin = size, rMax = -1, cMin = size, cMax = -1;
  for (const i of [...log, board.treasure]) {
    const r = Math.floor(i / size);
    const c = i % size;
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    cMin = Math.min(cMin, c); cMax = Math.max(cMax, c);
  }
  // 余白は 1 マス、範囲が広いときは 15% ほどとる（端に貼りつかないように）
  const extent = Math.max(rMax - rMin, cMax - cMin) + 1;
  const span = Math.min(size, Math.max(MIN_SPAN, extent + 2, Math.ceil(extent * SPAN_MARGIN)));
  const r0 = clamp(Math.round((rMin + rMax) / 2 - span / 2 + 0.5), 0, size - span);
  const c0 = clamp(Math.round((cMin + cMax) / 2 - span / 2 + 0.5), 0, size - span);

  const pitch = pitchOf(span);
  return { r0, c0, span, pad, pitch, cell: pitch * CELL_RATIO };
}

/**
 * リプレイの画像での宝のマスの中心と大きさ（演出を重ねる位置）。
 * マスが小さすぎて線で描く表示のときは、宝のアイコンの大きさを返す
 */
export function replayTreasureSpot(game: GameState, px: number) {
  const { treasure, size } = game.board;
  const { r0, c0, pad, pitch, cell } = replayLayout(game, px);
  const r = Math.floor(treasure / size) - r0;
  const c = (treasure % size) - c0;
  if (cell < MIN_CELL_PX) return { cx: pad + (c + 0.5) * pitch, cy: pad + (r + 0.5) * pitch, s: (px / 40) * 3 };
  return { cx: pad + c * pitch + cell / 2, cy: pad + r * pitch + cell / 2, s: cell };
}

/** リプレイと GIF は小さく描くので、きらめきをゲーム中より大きめにする */
const SPARKLE_SCALE = 1.4;

/** クリアしたリプレイの宝のまわりに、きらめきを濃さ alpha で重ねる（画像からはみ出さないように） */
export function paintReplaySparkles(ctx: CanvasRenderingContext2D, game: GameState, px: number, alpha: number) {
  const { cx, cy, s } = replayTreasureSpot(game, px);
  paintSparkles(ctx, cx, cy, s * SPARKLE_SCALE, alpha, { w: px, h: px });
}

// リプレイの1フレームを描画
export function drawReplayFrame(ctx: CanvasRenderingContext2D, game: GameState, step: number, px: number) {
  const { board, log } = game;
  const { size, dirs } = board;
  const { r0, c0, span, pad, pitch, cell } = replayLayout(game, px);

  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = COLORS.boardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, px, px, px * RADIUS_RATIO);
  ctx.fill();

  if (cell < MIN_CELL_PX) {
    drawReplayMap(ctx, game, step, px, pad, pitch, r0, c0, span);
    return;
  }

  const seen = new Uint8Array(size * size);
  for (let k = 0; k <= step; k++) seen[log[k]] = 1;
  const pos = log[step];
  const won = game.status === 'won' && step === log.length - 1;

  for (let r = r0; r < r0 + span; r++) {
    for (let c = c0; c < c0 + span; c++) {
      const i = r * size + c;
      let look: CellLook = CellLook.Empty;
      if (i === board.treasure) look = won ? CellLook.Found : CellLook.Treasure;
      else if (seen[i]) look = dirs[i] ? CellLook.Arrow : CellLook.Nothing;
      const isPlayer = i === pos && !won;
      const dir = look === CellLook.Arrow || (isPlayer && dirs[i]) ? dirs[i] : 0;
      paintCell(ctx, pad + (c - c0) * pitch, pad + (r - r0) * pitch, cell, look, dir, isPlayer, i === log[0]);
    }
  }
}

/**
 * マスが小さすぎて描き分けられないとき（歩いた範囲が広いとき）の描き方。
 * 全体マップと同じく、軌跡を線で、スタート・宝・現在地を印で示す。
 */
function drawReplayMap(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  step: number,
  px: number,
  pad: number,
  pitch: number,
  r0: number,
  c0: number,
  span: number,
) {
  const { board, log } = game;
  const { size } = board;
  const at = (i: number) =>
    [pad + ((i % size) - c0 + 0.5) * pitch, pad + (Math.floor(i / size) - r0 + 0.5) * pitch] as const;

  ctx.fillStyle = COLORS.empty;
  ctx.fillRect(pad, pad, span * pitch, span * pitch);

  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = Math.max(TRAIL_MIN_WIDTH_PX, px * TRAIL_WIDTH_RATIO);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= step; k++) {
    const [x, y] = at(log[k]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const mark = px / 40;
  const [sx, sy] = at(log[0]);
  paintStartMark(ctx, sx, sy, mark * 0.6);

  const [tx, ty] = at(board.treasure);
  const t = canvasImages.treasure;
  const ts = mark * 3;
  if (t?.complete) ctx.drawImage(t, tx - ts / 2, ty - ts / 2, ts, ts);

  const won = game.status === 'won' && step === log.length - 1;
  const [ppx, ppy] = at(log[step]);
  ctx.beginPath();
  ctx.arc(ppx, ppy, won ? mark * 2.2 : mark * 1.2, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, px / 120);
  ctx.strokeStyle = COLORS.red;
  ctx.stroke();
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
