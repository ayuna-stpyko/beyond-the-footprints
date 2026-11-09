import type { GameState } from '../core/game';
import { CellLook, paintCell, paintStartMark } from './cellPainter';
import { COLORS, GAP_RATIO, MIN_DETAIL_CELL_PX, PITCH_PX, redAlpha } from './constants';
import { centerIndex } from '../core/types';
import { h } from './dom';
import {
  type EndKind,
  type FxTimeline,
  bounceAt,
  cameraPhase,
  fxTimeline,
  paintGlow,
  paintRipple,
  paintSparkles,
  PRE_RIPPLE_STRENGTH,
  panDuration,
  preRippleProgress,
  reducedMotion,
  zoomDuration,
  rippleProgress,
  sparkleAlpha,
} from './endFx';

const FIT_PAD = 8;
/** 拡大の上限。縮小は盤面全体が収まる倍率まで */
const MAX_ZOOM = 2;
/** ホイール 1px あたりのズームの強さ */
const WHEEL_ZOOM_SPEED = 0.015;
/** 現在地を追いかけるとき、画面の端から空けておくマス数（狭い画面では画面幅の 1/4 まで） */
const FOLLOW_MARGIN_CELLS = 2.5;
const FOLLOW_MARGIN_MAX_RATIO = 1 / 4;
/**
 * 宝まで遠いときは、移動の前に（現在地を画面の中央にしたまま）縮小して、
 * 宝が画面の中央から端までのこの割合以内に見えるようにする
 */
const PAN_KEEP_RATIO = 0.8;
/**
 * 演出中に引ける下限（「全体を表示」の倍率に対する割合）。
 * 現在地が盤面の端にあると、全体を表示する倍率では反対側の宝が画面に入らないため
 */
const FX_MIN_ZOOM_OF_FIT = 0.4;
/** 宝に着いたときの倍率の下限（これより引いて見ていたら、ここまで寄る） */
const FX_ARRIVE_ZOOM = 1;
/** 宝が画面に見えているとみなすには、画面の端からこのマス数以上内側にあること */
const IN_VIEW_MARGIN_CELLS = 1;
/** 宝の光がはっきりするまでの時間 */
const GLOW_IN_MS = 300;

export type ViewMode = 'fit' | 'explore';

/** 終了演出の状態。カメラは zMid まで縮小 → from から to へ移動 → zEnd まで拡大 */
interface EndFxState {
  timeline: FxTimeline;
  start: number;
  from: { x: number; y: number; zoom: number };
  to: { x: number; y: number };
  zMid: number;
  zEnd: number;
  panDone: boolean;
}

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
  private fx: EndFxState | null = null;
  private fxTimer = 0;
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
    window.clearTimeout(this.fxTimer);
    this.fx = null;
  }

  // ---------- 終了演出 ----------

  /**
   * 宝のマスを強調する演出を流し、終わったら onDone を呼ぶ。
   * ゲームオーバーで見回しているときは、先に宝の位置までカメラを動かす。
   * 動きを減らす設定のときは、カメラだけ宝へ移してすぐ onDone を呼ぶ。
   */
  playEndFx(kind: EndKind, onDone: () => void) {
    const { size, treasure } = this.game.board;
    const tx = (treasure % size) + 0.5;
    const ty = Math.floor(treasure / size) + 0.5;
    // 「全体を表示」中も、宝へ動いて寄る（宝は見えているので縮小はしない）
    const pan = kind === 'lost' && this.mode === 'explore';
    if (reducedMotion()) {
      if (pan) this.centerOn(tx, ty);
      else this.requestDraw();
      onDone();
      return;
    }
    const from = { x: this.camX, y: this.camY, zoom: this.zoom };
    const to = pan ? { x: tx, y: ty } : { x: this.camX, y: this.camY };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const view = Math.min(this.w, this.h);
    const fitDist = ((view / 2) * PAN_KEEP_RATIO) / PITCH_PX;
    // 宝がもう画面に見えていれば縮小しない。見えていなければ、現在地を中央にしたまま宝まで見えるよう縮小する
    // （演出中だけは「全体を表示」より引いてもよい。画面の大きさがまだ分からないときは縮小しない）
    const zMid =
      dist > 0 && view > 0 && !this.inView(tx, ty)
        ? Math.max(this.fitZoom * FX_MIN_ZOOM_OF_FIT, Math.min(from.zoom, fitDist / dist))
        : from.zoom;
    // 着いたら宝がよく見えるよう、元の倍率が小さければ 100% まで寄る
    const zEnd = Math.max(from.zoom, FX_ARRIVE_ZOOM);
    // 縮小・拡大は倍率の差（何段階引く・寄るか）で、移動は縮小したあとの倍率で宝が画面何枚分かで長さを決める
    // （まだ画面の大きさが分からないときは最短）
    const screens = view > 0 ? (dist * PITCH_PX * zMid) / view : 0;
    const timeline = pan
      ? fxTimeline(kind, panDuration(screens), zoomDuration(from.zoom / zMid), zoomDuration(zEnd / zMid))
      : fxTimeline(kind, 0);
    this.fx = { timeline, start: performance.now(), from, to, zMid, zEnd, panDone: !pan };
    this.fxTimer = window.setTimeout(() => {
      this.fxTimer = 0;
      this.fx = null;
      this.requestDraw();
      onDone();
    }, timeline.total);
    this.requestDraw();
  }

  /**
   * 演出中のカメラを動かす。遠いときは「縮小 → 移動 → 拡大」の順に 1 つずつ行う。
   * 終わったら、あとはドラッグなどで自由に動かせる
   */
  private stepFxCamera(fx: EndFxState, elapsed: number) {
    if (fx.panDone) return;
    const { from, to, zMid, zEnd, timeline } = fx;
    const { zoomOut, move, zoomIn } = cameraPhase(timeline, elapsed);
    this.camX = from.x + (to.x - from.x) * move;
    this.camY = from.y + (to.y - from.y) * move;
    // 倍率は比で変える（等比）と、縮小・拡大の速さが均一に見える
    this.zoom = zoomIn > 0 ? zMid * (zEnd / zMid) ** zoomIn : from.zoom * (zMid / from.zoom) ** zoomOut;
    if (elapsed >= timeline.arrive) {
      this.camX = to.x;
      this.camY = to.y;
      this.zoom = zEnd;
      // 寄ったので「全体を表示」の状態ではなくなる（リサイズで全体に戻さない）
      this.fitted = this.zoom === this.fitZoom;
      fx.panDone = true;
    }
    this.clampCamera();
  }

  /** 宝のマスの上に、光・跳ねる宝・波紋・きらめきを重ねる */
  private drawFx(fx: EndFxState, elapsed: number, ox: number, oy: number, p: number, s: number) {
    const { ctx } = this;
    const { kind } = fx.timeline;
    const { size, treasure } = this.game.board;
    const x = ox + (treasure % size) * p;
    const y = oy + Math.floor(treasure / size) * p;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const detailed = s >= MIN_DETAIL_CELL_PX;
    const look = kind === 'won' ? CellLook.Found : CellLook.Treasure;

    // 宝に着いてからの時間（クリアは最初から着いている）。光・波紋などはこれで決める
    const since = elapsed - fx.timeline.arrive;
    const glow = Math.min(1, Math.max(0, since / GLOW_IN_MS)) * (kind === 'won' ? 1 : 0.5);
    paintGlow(ctx, cx, cy, s, glow);
    if (detailed) {
      // 光の上に宝のマスを描き直す（跳ねている間は大きく、少し上に）
      const b = bounceAt(kind, since);
      const k = b?.scale ?? 1;
      const big = s * k;
      paintCell(ctx, x - (big - s) / 2, y - (big - s) / 2 - (b?.lift ?? 0) * s, big, look, 0, false);
    }
    // 着く前（カメラ移動中）は細く薄い波紋で行き先を示し、着いてからの波紋で強調する
    for (const r of preRippleProgress(fx.timeline, elapsed)) paintRipple(ctx, cx, cy, s, r, PRE_RIPPLE_STRENGTH);
    for (const r of rippleProgress(kind, since)) paintRipple(ctx, cx, cy, s, r);
    paintSparkles(ctx, cx, cy, s, sparkleAlpha(kind, since));
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

  /** マス座標 (x, y) が、画面の端から少し内側の範囲に見えているか */
  private inView(x: number, y: number) {
    const r = this.visibleRect();
    const m = IN_VIEW_MARGIN_CELLS;
    return x >= r.x + m && x <= r.x + r.w - m && y >= r.y + m && y <= r.y + r.h - m;
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
    const { ctx, game, fx } = this;
    const elapsed = fx ? performance.now() - fx.start : 0;
    if (fx) this.stepFxCamera(fx, elapsed);
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
      this.endFrame(elapsed, ox, oy, p, s);
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
    this.endFrame(elapsed, ox, oy, p, s);
  }

  /** 盤面を描いたあと: 演出中なら重ねて描き、次のフレームも描く */
  private endFrame(elapsed: number, ox: number, oy: number, p: number, s: number) {
    if (this.fx) {
      this.drawFx(this.fx, elapsed, ox, oy, p, s);
      this.requestDraw();
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
