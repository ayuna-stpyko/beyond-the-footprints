import { COLORS, redAlpha } from './constants';

/**
 * ゲーム終了時の演出（宝のマスを強調する）。タイミングはここにまとめる。
 * - クリア: 宝が跳ねる → 波紋 2 回 + きらめき → 結果へ
 * - ゲームオーバー: 少し間 → 宝までカメラ移動 → 波紋 2 回 → 結果へ
 *   カメラ移動は、遠いときは「縮小 → 移動 → 拡大」を 1 つずつ行う。
 *   縮小・拡大の長さは倍率の差で、移動の長さは（縮小したあとの）画面上の距離で決める
 *
 * カメラ移動の長さは場合によって変わるので、波紋・跳ねる・きらめき・結果は
 * 「宝に着いた時刻」（クリアは 0）からの時間で決める。
 */
export type EndKind = 'won' | 'lost';

interface FxTiming {
  /** カメラ移動を始めるまでの間（ゲームオーバーのみ） */
  panDelay: number;
  /** 移動の最短の長さ（ゲームオーバーのみ。宝が画面 1 枚分以内のとき） */
  pan: number;
  /** 宝に着いてから波紋を出し始めるまで（ms） */
  ripples: readonly number[];
  /** 波紋 1 つが広がって消えるまで */
  ripple: number;
  /** 宝が跳ねる長さ（クリアのみ。0 で跳ねない） */
  bounce: number;
  /** きらめきを出す区間（宝に着いてから。クリアのみ） */
  sparkle: readonly [number, number] | null;
  /** 宝に着いてから結果を出すまで */
  after: number;
}

export const FX: Record<EndKind, FxTiming> = {
  won: { panDelay: 0, pan: 0, ripples: [0, 600], ripple: 1400, bounce: 600, sparkle: [600, 1600], after: 2400 },
  lost: { panDelay: 400, pan: 1400, ripples: [0, 400], ripple: 1400, bounce: 0, sparkle: null, after: 1800 },
};

/** 移動の長さの上限（どんなに遠くてもこれ以上は待たせない） */
export const PAN_MAX_MS = 4500;

/**
 * 宝までの距離（画面何枚分か）に合わせた移動の長さ。
 * 画面 1 枚分までは最短の長さ、それより遠いと距離の平方根に比例して長くする（上限 PAN_MAX_MS）
 */
export function panDuration(screens: number) {
  const base = FX.lost.pan;
  if (!Number.isFinite(screens) || screens <= 1) return base;
  return Math.min(PAN_MAX_MS, base * Math.sqrt(screens));
}

/** 縮小・拡大それぞれの長さ: 倍率が半分になるごとにこの時間をかける（下限・上限つき） */
export const ZOOM_MS_PER_HALVING = 360;
export const ZOOM_MIN_MS = 800;
export const ZOOM_MAX_MS = 4000;

/** 倍率を ratio 分の 1 にする（または ratio 倍にもどす）のにかける時間。倍率が変わらなければ 0 */
export function zoomDuration(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 1) return 0;
  return Math.min(ZOOM_MAX_MS, Math.max(ZOOM_MIN_MS, ZOOM_MS_PER_HALVING * Math.log2(ratio)));
}

/**
 * 1 回の演出の時刻表。
 * zoomOut / zoomIn: 移動の前の縮小・移動のあとの拡大の長さ（0 ならしない）、move: 移動の長さ、
 * pan: カメラ移動全体（縮小 + 移動 + 拡大）、arrive: 宝に着く時刻、total: 結果を出す時刻
 */
export interface FxTimeline {
  kind: EndKind;
  panDelay: number;
  zoomOut: number;
  move: number;
  zoomIn: number;
  pan: number;
  arrive: number;
  total: number;
}

/** move を省くと最短の長さで動く（クリアは動かない）。zoomIn を省くと縮小と同じ長さ */
export function fxTimeline(kind: EndKind, move = FX[kind].pan, zoomOut = 0, zoomIn = zoomOut): FxTimeline {
  const panDelay = FX[kind].panDelay;
  const moving = move > 0;
  const out = moving ? zoomOut : 0;
  const back = moving ? zoomIn : 0;
  const pan = moving ? out + move + back : 0;
  const arrive = panDelay + pan;
  return { kind, panDelay, zoomOut: out, move, zoomIn: back, pan, arrive, total: arrive + FX[kind].after };
}

/** 演出がいちばん長くなるとき（宝が最も遠く、いちばん引くゲームオーバー）の長さ */
export const FX_MAX_MS = Math.max(fxTimeline('won').total, fxTimeline('lost', PAN_MAX_MS, ZOOM_MAX_MS).total);

/** 波紋の大きさ（画面上の px）。マスが小さくても見えるよう下限を付ける */
const RIPPLE_FROM_CELLS = 0.55;
const RIPPLE_TO_CELLS = 2.4;
const RIPPLE_FROM_MIN_PX = 12;
const RIPPLE_TO_MIN_PX = 60;
/** 跳ねるときの最大の拡大率と持ち上げ（マスに対する割合） */
const BOUNCE_SCALE = 0.2;
const BOUNCE_LIFT = 0.1;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * カメラ移動の各段階の進み具合。elapsed は演出の開始からの時間。
 * 「縮小 → 移動 → 拡大」を順に行い、同時には動かさない（縮小・拡大は長さ 0 なら飛ばす）。
 * - zoomOut: 縮小の進み具合（0 = 元の倍率、1 = いちばん引いた倍率）
 * - move: 現在地から宝への移動（0..1）
 * - zoomIn: 拡大の進み具合（0 = いちばん引いた倍率、1 = 着いたときの倍率）
 * どれも段階ごとに加速・減速する
 */
export function cameraPhase(tl: FxTimeline, elapsed: number): { zoomOut: number; move: number; zoomIn: number } {
  if (tl.pan <= 0) return { zoomOut: 0, move: 1, zoomIn: 1 };
  const t = elapsed - tl.panDelay;
  const { zoomOut, move, zoomIn } = tl;
  const progress = (from: number, len: number) => (len > 0 ? easeInOut(clamp01((t - from) / len)) : t >= from ? 1 : 0);
  return {
    zoomOut: progress(0, zoomOut),
    move: progress(zoomOut, move),
    zoomIn: progress(zoomOut + move, zoomIn),
  };
}

// 以下の since は「宝に着いてから」の時間（クリアは演出の開始から）

/** いま出ている波紋の進み具合（0..1）の一覧 */
export const rippleProgress = (kind: EndKind, since: number) =>
  FX[kind].ripples.map((at) => (since - at) / FX[kind].ripple).filter((p) => p >= 0 && p < 1);

/** 宝に着く前（カメラ移動中）に出す波紋の間隔。行き先を示す */
export const PRE_RIPPLE_INTERVAL = 700;
/** 着く前の波紋の強さ（着いてからの波紋に対する濃さ・太さの割合） */
export const PRE_RIPPLE_STRENGTH = 0.5;

/**
 * 宝に着く前の波紋の進み具合（0..1）の一覧。elapsed は演出の開始からの時間。
 * カメラが動き出してから着くまで PRE_RIPPLE_INTERVAL ごとに出す（動かないときは出さない）
 */
export function preRippleProgress(tl: FxTimeline, elapsed: number) {
  const out: number[] = [];
  const { ripple } = FX[tl.kind];
  for (let at = tl.panDelay; at < tl.arrive; at += PRE_RIPPLE_INTERVAL) {
    const p = (elapsed - at) / ripple;
    if (p >= 0 && p < 1) out.push(p);
  }
  return out;
}

/** 跳ねている宝の拡大率と持ち上げ（マスの一辺に対する割合）。跳ねていなければ null */
export function bounceAt(kind: EndKind, since: number) {
  const { bounce } = FX[kind];
  if (bounce <= 0 || since < 0 || since >= bounce) return null;
  const k = Math.sin(Math.PI * (since / bounce));
  return { scale: 1 + BOUNCE_SCALE * k, lift: BOUNCE_LIFT * k };
}

/** きらめきの濃さ（0..1）。区間の外では 0 */
export function sparkleAlpha(kind: EndKind, since: number) {
  const span = FX[kind].sparkle;
  if (!span) return 0;
  const t = (since - span[0]) / (span[1] - span[0]);
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
}

/** (cx, cy) を中心に、一辺 s のマスから広がる波紋を描く。strength で濃さと太さを弱める */
export function paintRipple(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, p: number, strength = 1) {
  const from = Math.max(s * RIPPLE_FROM_CELLS, RIPPLE_FROM_MIN_PX);
  const to = Math.max(s * RIPPLE_TO_CELLS, RIPPLE_TO_MIN_PX);
  const e = 1 - (1 - p) ** 2;
  ctx.beginPath();
  ctx.arc(cx, cy, from + (to - from) * e, 0, Math.PI * 2);
  ctx.lineWidth = (3 - 1.5 * p) * strength;
  ctx.strokeStyle = redAlpha(0.8 * (1 - p) * strength);
  ctx.stroke();
}

/** 宝のまわりのやわらかい光（同心円を薄く重ねる） */
export function paintGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, alpha: number) {
  if (alpha <= 0) return;
  const r = Math.max(s * 1.3, 24);
  ctx.save();
  ctx.fillStyle = COLORS.gold;
  for (const k of [1, 0.75, 0.5]) {
    ctx.globalAlpha = alpha * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 宝のまわりの 4 つのきらめき（4 つ角の星）。
 * bounds を渡すと、宝が画像の端にあってもきらめきが画像からはみ出さないよう内側に寄せる
 */
export function paintSparkles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  alpha: number,
  bounds?: { w: number; h: number },
) {
  if (alpha <= 0) return;
  const d = Math.max(s * 0.75, 16);
  const spots = [
    [-d, -d, 0.32],
    [d * 1.05, -d * 0.8, 0.24],
    [d * 0.95, d, 0.28],
    [-d * 1.1, d * 0.7, 0.2],
  ] as const;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.gold;
  for (const [dx, dy, k] of spots) {
    const r = Math.max(s * k, 5);
    const x = bounds ? Math.min(bounds.w - r, Math.max(r, cx + dx)) : cx + dx;
    const y = bounds ? Math.min(bounds.h - r, Math.max(r, cy + dy)) : cy + dy;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }
  ctx.restore();
}

/** 動きを減らす設定のときは演出を省く */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
