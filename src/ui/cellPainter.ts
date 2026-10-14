import { canvasImages } from './assets';
import { CELL_PX, COLORS, MIN_DETAIL_CELL_PX, redAlpha } from './constants';

/** マスの見た目（Figma の Cell コンポーネント + 「訪れたが何もない」） */
export const CellLook = {
  Empty: 0,
  Arrow: 1,
  /** 訪れたが矢印のないマス（Figma にない追加状態） */
  Nothing: 2,
  Treasure: 3,
  Found: 4,
} as const;
export type CellLook = (typeof CellLook)[keyof typeof CellLook];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * (x, y) を左上とする一辺 s の位置にマスを描く。
 * dir は矢印（1..4、0 = なし）、player は現在地の輪を重ねるか。
 */
export function paintCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  look: CellLook,
  dir: number,
  player: boolean,
  start = false,
) {
  // 以下の座標・寸法は Figma の 44px のマスでの値。k 倍して s に合わせる
  const k = s / CELL_PX;

  // 細かすぎるときは塗りだけ
  if (s < MIN_DETAIL_CELL_PX) {
    ctx.fillStyle =
      player || look === CellLook.Found || look === CellLook.Treasure
        ? COLORS.red
        : look === CellLook.Arrow
          ? COLORS.arrow
          : look === CellLook.Nothing
            ? COLORS.nothing
            : COLORS.empty;
    ctx.fillRect(x, y, s, s);
    return;
  }

  const r = 4 * k;
  let fill: string = COLORS.empty;
  if (look === CellLook.Arrow) fill = COLORS.arrow;
  else if (look === CellLook.Nothing) fill = COLORS.nothing;

  if (look === CellLook.Found) {
    ctx.save();
    ctx.shadowColor = redAlpha(0.6);
    ctx.shadowBlur = 5 * k;
    roundRect(ctx, x + 1.5 * k, y + 1.5 * k, s - 3 * k, s - 3 * k, r);
    ctx.fillStyle = COLORS.empty;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = COLORS.red;
    ctx.stroke();
  } else if (look === CellLook.Treasure) {
    roundRect(ctx, x + k, y + k, s - 2 * k, s - 2 * k, r);
    ctx.fillStyle = COLORS.empty;
    ctx.fill();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = COLORS.red;
    ctx.stroke();
  } else if (player) {
    // Figma の Player: 2px の赤枠
    roundRect(ctx, x + k, y + k, s - 2 * k, s - 2 * k, 3 * k);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = COLORS.red;
    ctx.stroke();
  } else {
    roundRect(ctx, x + 0.5 * k, y + 0.5 * k, s - k, s - k, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(0.5, k);
    ctx.strokeStyle = COLORS.border;
    ctx.stroke();
  }

  if (look === CellLook.Treasure || look === CellLook.Found) {
    const t = canvasImages.treasure;
    if (t?.complete) ctx.drawImage(t, x + 8 * k, y + 8 * k, 28 * k, 28 * k);
  } else if (dir > 0) {
    const a = canvasImages.arrows[dir];
    if (a?.complete) ctx.drawImage(a, x + 10 * k, y + 10 * k, 24 * k, 24 * k);
  } else if (look === CellLook.Nothing && !player) {
    // 何もないマスの印: 小さな点
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, 2.5 * k, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.border;
    ctx.fill();
  }

  if (player) {
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, 15.5 * k, 0, Math.PI * 2);
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = COLORS.red;
    ctx.stroke();
  }

  if (start) paintStartMark(ctx, x + 7 * k, y + 7 * k, 3 * k);
}

/** スタート地点の印（Figma の Cell / Start=true: 左上の点） */
export function paintStartMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ink;
  ctx.fill();
}
