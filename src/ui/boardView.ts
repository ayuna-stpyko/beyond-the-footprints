import type { GameState } from '../core/game';
import { CellLook, paintCell, paintStartMark } from './cellPainter';
import { COLORS, GAP_RATIO, MIN_DETAIL_CELL_PX, PITCH_PX, redAlpha } from './constants';
import { centerIndex } from '../core/types';
import { h } from './dom';

const FIT_PAD = 8;
/** 拡大の上限。縮小は盤面全体が収まる倍率まで */
const MAX_ZOOM = 2;
/** ホイール 1px あたりのズームの強さ */
const WHEEL_ZOOM_SPEED = 0.015;
/** 現在地を追いかけるとき、画面の端から空けておくマス数（狭い画面では画面幅の 1/4 まで） */
const FOLLOW_MARGIN_CELLS = 2.5;
const FOLLOW_MARGIN_MAX_RATIO = 1 / 4;

export type ViewMode = 'fit' | 'explore';

/**
 * 盤面を canvas に描くビュー。
 * - fit: 盤面全体を枠に収めて表示（小さい盤面）
 * - explore: ズーム・ドラッグ・ピンチで見回す（大きい盤面）
 */
export class BoardView {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private game: GameState;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** 画面中央に来るマス座標（列, 行。小数可） */
  private camX: number;
  private camY: number;
  zoom = 1;
  /** 「全体を表示」の状態（リサイズ時に収め直す） */
  private fitted = false;
  private raf = 0;
  private ro: ResizeObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  onViewChange: () => void = () => {};

  constructor(
    game: GameState,
    readonly mode: ViewMode,
    private debug = false,
  ) {
    this.game = game;
    this.canvas = h('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.el = h('div.board-viewport', {}, this.canvas);
    const { n } = game.board;
    this.camX = n + 0.5;
    this.camY = n + 0.5;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    if (mode === 'explore') this.bindInput();
  }

  setGame(game: GameState) {
    this.game = game;
    this.recenter();
  }

  destroy() {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
  }

  // ---------- カメラ ----------

  get pitch() {
    if (this.mode === 'fit') return this.fitPitch();
    return PITCH_PX * this.zoom;
  }

  private fitPitch() {
    const size = this.game.board.size;
    const inner = Math.min(this.w, this.h || this.w) - 2 * FIT_PAD;
    return inner / (size - GAP_RATIO);
  }

  /** 盤面全体が収まるズーム倍率（「全体を表示」で使う。100% を上限とする） */
  get fitZoom() {
    const size = this.game.board.size;
    const inner = Math.min(this.w, this.h) - 2 * FIT_PAD;
    return Math.min(1, inner / (size - GAP_RATIO) / PITCH_PX);
  }

  setZoom(z: number, anchorX = this.w / 2, anchorY = this.h / 2) {
    const before = this.screenToCell(anchorX, anchorY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.fitZoom, z));
    this.fitted = this.zoom === this.fitZoom;
    const after = this.screenToCell(anchorX, anchorY);
    this.camX += before.x - after.x;
    this.camY += before.y - after.y;
    this.clampCamera();
    this.requestDraw();
  }

  zoomBy(factor: number) {
    this.setZoom(this.zoom * factor);
  }

  recenter() {
    const { size } = this.game.board;
    this.camX = (this.game.pos % size) + 0.5;
    this.camY = Math.floor(this.game.pos / size) + 0.5;
    this.clampCamera();
    this.requestDraw();
  }

  fitAll() {
    const { size } = this.game.board;
    this.zoom = this.fitZoom;
    this.fitted = true;
    this.camX = size / 2;
    this.camY = size / 2;
    this.requestDraw();
  }

  centerOn(col: number, row: number) {
    this.camX = col;
    this.camY = row;
    this.clampCamera();
    this.requestDraw();
  }

  /** 現在地が端に寄りすぎたら追いかける */
  follow() {
    if (this.mode === 'fit') return this.requestDraw();
    const { size } = this.game.board;
    const p = this.pitch;
    const c = (this.game.pos % size) + 0.5;
    const r = Math.floor(this.game.pos / size) + 0.5;
    const marginX = Math.min(FOLLOW_MARGIN_CELLS, (this.w / p) * FOLLOW_MARGIN_MAX_RATIO);
    const marginY = Math.min(FOLLOW_MARGIN_CELLS, (this.h / p) * FOLLOW_MARGIN_MAX_RATIO);
    const halfW = this.w / 2 / p;
    const halfH = this.h / 2 / p;
    if (c < this.camX - halfW + marginX) this.camX = c + halfW - marginX;
    if (c > this.camX + halfW - marginX) this.camX = c - halfW + marginX;
    if (r < this.camY - halfH + marginY) this.camY = r + halfH - marginY;
    if (r > this.camY + halfH - marginY) this.camY = r - halfH + marginY;
    this.clampCamera();
    this.requestDraw();
  }

  /** 表示中の範囲（マス座標） */
  visibleRect() {
    const p = this.pitch;
    return {
      x: this.camX - this.w / 2 / p,
      y: this.camY - this.h / 2 / p,
      w: this.w / p,
      h: this.h / p,
    };
  }

  private screenToCell(sx: number, sy: number) {
    const p = this.pitch;
    return { x: this.camX + (sx - this.w / 2) / p, y: this.camY + (sy - this.h / 2) / p };
  }

  private clampCamera() {
    const { size } = this.game.board;
    this.camX = Math.min(size, Math.max(0, this.camX));
    this.camY = Math.min(size, Math.max(0, this.camY));
  }

  // ---------- 入力 ----------

  private bindInput() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinchDist = this.currentPinchDist();
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 1) {
        this.camX -= (cur.x - prev.x) / this.pitch;
        this.camY -= (cur.y - prev.y) / this.pitch;
        this.clampCamera();
        this.requestDraw();
      }
      this.pointers.set(e.pointerId, cur);
      if (this.pointers.size === 2) {
        const d = this.currentPinchDist();
        if (this.pinchDist > 0) {
          const rect = el.getBoundingClientRect();
          const pts = [...this.pointers.values()];
          const mx = (pts[0].x + pts[1].x) / 2 - rect.left;
          const my = (pts[0].y + pts[1].y) / 2 - rect.top;
          this.setZoom((this.zoom * d) / this.pinchDist, mx, my);
        }
        this.pinchDist = d;
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinchDist = 0;
      if (this.pointers.size === 0) el.classList.remove('dragging');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
  }

  private currentPinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ---------- 描画 ----------

  private resize() {
    const rect = this.el.getBoundingClientRect();
    if (rect.width === 0) return;
    const first = this.w === 0;
    this.w = rect.width;
    this.h = this.mode === 'fit' ? rect.width : rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    if (this.mode === 'explore') {
      if (this.fitted) this.fitAll();
      else if (!first) this.setZoom(this.zoom);
    }
    this.draw();
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  draw() {
    const { ctx, game } = this;
    const { board } = game;
    const { size, dirs } = board;
    const p = this.pitch;
    const s = p * (1 - GAP_RATIO);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.w === 0) return;

    // マス (c, r) の左上の画面座標
    const ox = this.w / 2 - this.camX * p + (p - s) / 2;
    const oy = this.h / 2 - this.camY * p + (p - s) / 2;
    const ended = game.status !== 'playing';
    const start = centerIndex(board.n);

    const lookOf = (i: number): CellLook => {
      if (ended && i === board.treasure) return game.status === 'won' ? CellLook.Found : CellLook.Treasure;
      if (!game.visited[i]) return CellLook.Empty;
      return dirs[i] ? CellLook.Arrow : CellLook.Nothing;
    };

    const c0 = Math.max(0, Math.floor(this.camX - this.w / 2 / p));
    const c1 = Math.min(size - 1, Math.ceil(this.camX + this.w / 2 / p));
    const r0 = Math.max(0, Math.floor(this.camY - this.h / 2 / p));
    const r1 = Math.min(size - 1, Math.ceil(this.camY + this.h / 2 / p));

    if (s < MIN_DETAIL_CELL_PX) {
      // 縮小表示（「全体を表示」で 25% を下回るとき）: 盤面を一色で塗り、薄いマス目と訪れたマスを描く
      const bw = size * p;
      ctx.fillStyle = COLORS.empty;
      this.fillVisible(ox, oy, bw, bw);
      if (p >= 4) {
        // マス目（見えている範囲だけ）
        ctx.strokeStyle = COLORS.boardBg;
        ctx.lineWidth = Math.max(0.5, p * 0.1);
        ctx.beginPath();
        const yTop = Math.max(oy, 0);
        const yBot = Math.min(oy + bw, this.h);
        const xL = Math.max(ox, 0);
        const xR = Math.min(ox + bw, this.w);
        for (let c = c0; c <= c1 + 1; c++) {
          const x = ox + c * p;
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBot);
        }
        for (let r = r0; r <= r1 + 1; r++) {
          const y = oy + r * p;
          ctx.moveTo(xL, y);
          ctx.lineTo(xR, y);
        }
        ctx.stroke();
      }
      if (this.debug) this.drawRouteSparse(ox, oy, p);
      for (const i of new Set(game.log)) {
        paintCell(ctx, ox + (i % size) * p, oy + Math.floor(i / size) * p, p, lookOf(i), 0, false);
      }
      if (ended) {
        // 宝は小さくても見えるよう、3 マス分の大きさで描く
        const t = board.treasure;
        paintCell(ctx, ox + (t % size) * p - p, oy + Math.floor(t / size) * p - p, p * 3, CellLook.Treasure, 0, false);
      }
      paintStartMark(ctx, ox + (start % size) * p + p / 2, oy + Math.floor(start / size) * p + p / 2, Math.max(p * 0.35, 2.5));
      // 現在地は小さくても見えるよう、赤い輪で示す
      const pp = game.pos;
      ctx.beginPath();
      ctx.arc(ox + (pp % size) * p + p / 2, oy + Math.floor(pp / size) * p + p / 2, Math.max(p * 0.8, 5), 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.red;
      ctx.stroke();
      this.onViewChange();
      return;
    }

    // すき間の色（盤面の下地）
    ctx.fillStyle = COLORS.boardBg;
    this.fillVisible(ox - (p - s) / 2, oy - (p - s) / 2, size * p, size * p);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * size + c;
        const look = lookOf(i);
        const isPlayer = i === game.pos;
        const showDir = look === CellLook.Arrow || (isPlayer && dirs[i] > 0 && look !== CellLook.Found);
        paintCell(ctx, ox + c * p, oy + r * p, s, look, showDir ? dirs[i] : 0, isPlayer && look !== CellLook.Found, i === start);
        if (this.debug && !game.visited[i] && dirs[i]) {
          ctx.globalAlpha = 0.25;
          paintCell(ctx, ox + c * p, oy + r * p, s, CellLook.Arrow, dirs[i], false);
          ctx.globalAlpha = 1;
        }
      }
    }
    this.onViewChange();
  }

  /**
   * 盤面の下地を塗る。大きい盤面では盤面全体の矩形が数十万 px になり、
   * そのまま塗ると描画が画面に反映されなくなることがあるので、見えている範囲に切り詰める。
   */
  private fillVisible(x: number, y: number, width: number, height: number) {
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + width, this.w);
    const y1 = Math.min(y + height, this.h);
    if (x1 > x0 && y1 > y0) this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  private drawRouteSparse(ox: number, oy: number, p: number) {
    const { size, dirs } = this.game.board;
    this.ctx.fillStyle = redAlpha(0.18);
    for (let i = 0; i < dirs.length; i++) {
      if (dirs[i]) this.ctx.fillRect(ox + (i % size) * p, oy + Math.floor(i / size) * p, p, p);
    }
  }
}
