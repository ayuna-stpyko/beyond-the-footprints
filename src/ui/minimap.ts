import type { GameState } from '../core/game';
import type { BoardView } from './boardView';
import { COLORS, redAlpha } from './constants';
import { h } from './dom';

/** 全体マップ: 歩いた軌跡・スタート・表示中の範囲。クリックでその位置へ移動 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private game: GameState,
    private view: BoardView,
    private px: number,
  ) {
    this.canvas = h('canvas.minimap', { width: px * 2, height: px * 2, style: `width:${px}px;height:${px}px` });
    this.ctx = this.canvas.getContext('2d')!;
    // クリックした位置へ移動し、そのままドラッグすると表示範囲が付いてくる
    const moveTo = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const k = this.game.board.size / rect.width;
      this.view.centerOn((e.clientX - rect.left) * k, (e.clientY - rect.top) * k);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      moveTo(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.canvas.hasPointerCapture(e.pointerId)) moveTo(e);
    });
  }

  setGame(game: GameState) {
    this.game = game;
  }

  draw() {
    const { ctx, px, game } = this;
    const { size } = game.board;
    const k = px / size;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = COLORS.mapBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, px - 1, px - 1);

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = COLORS.boardBg;
    ctx.beginPath();
    ctx.moveTo(px / 2, 0);
    ctx.lineTo(px / 2, px);
    ctx.moveTo(0, px / 2);
    ctx.lineTo(px, px / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const v = this.view.visibleRect();
    ctx.fillStyle = redAlpha(0.12);
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.5;
    const rx = Math.max(0, v.x * k);
    const ry = Math.max(0, v.y * k);
    const rw = Math.min(px, (v.x + v.w) * k) - rx;
    const rh = Math.min(px, (v.y + v.h) * k) - ry;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);

    // 軌跡
    const at = (i: number) => [((i % size) + 0.5) * k, (Math.floor(i / size) + 0.5) * k] as const;
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    game.log.forEach((i, j) => {
      const [x, y] = at(i);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const [sx, sy] = at(game.log[0]);
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (game.status !== 'playing') {
      const [tx, ty] = at(game.board.treasure);
      ctx.fillStyle = COLORS.gold;
      ctx.strokeStyle = COLORS.red;
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
