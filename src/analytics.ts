/**
 * Google Analytics 4 への送信。
 * 測定 ID（VITE_GA_ID）がないとき・開発中・?debug のときは何もしない。
 */
import type { GameState } from './core/game';
import { movesUsed } from './core/game';

/** gen_error で送るエラーメッセージの最大文字数 */
const MAX_ERROR_MESSAGE_LEN = 100;

const GA_ID: string | undefined = import.meta.env.VITE_GA_ID;
const enabled = !!GA_ID && import.meta.env.PROD && !new URLSearchParams(location.search).has('debug');

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

if (enabled) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.append(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    // gtag.js は arguments オブジェクトそのものを要求する
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

function track(name: string, params: Record<string, string | number | boolean>) {
  if (enabled) window.gtag?.(name, params);
}

/** N の区間（レポートで見やすくするため） */
export function nRange(n: number) {
  const edges = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  let lo = 1;
  for (const hi of edges) {
    if (n <= hi) return `${lo}-${hi}`;
    lo = hi + 1;
  }
  return `${lo}-`;
}

/** 盤面を遊びはじめた（retry: 同じ盤面をやりなおし, shared: 共有リンクから） */
export function trackStart(g: GameState, opts: { retry: boolean; shared: boolean }) {
  const { n, mode } = g.board;
  track('game_start', { n, n_range: nRange(n), mode, retry: opts.retry, shared: opts.shared });
}

/** クリア・ゲームオーバーになった */
export function trackEnd(g: GameState) {
  const { n, mode } = g.board;
  track('game_end', {
    n,
    n_range: nRange(n),
    mode,
    result: g.status,
    moves_used: movesUsed(g),
  });
}

/** 盤面の生成に失敗した */
export function trackGenError(n: number, err: unknown) {
  track('gen_error', { n, n_range: nRange(n), message: (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_MESSAGE_LEN) });
}
