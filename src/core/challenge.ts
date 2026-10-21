/**
 * daily / weekly / monthly チャレンジ: 期間ごとに全員が同じ盤面を遊ぶ。
 * 盤面は期間の文字列から作ったシードで決まるので、サーバーなしで全員に同じ盤面が出る。
 */

export type Period = 'daily' | 'weekly' | 'monthly';

export const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly'];

export const isPeriod = (s: string | null): s is Period => s === 'daily' || s === 'weekly' || s === 'monthly';

/** 期間ごとの N。monthly はスマホの上限（MAX_N_MOBILE）に合わせる */
export const CHALLENGE_N: Record<Period, number> = { daily: 15, weekly: 60, monthly: 200 };

export const PERIOD_NAMES: Record<Period, string> = { daily: 'デイリー', weekly: 'ウィークリー', monthly: 'マンスリー' };

/** 日本時間（UTC+9）。切り替わりは JST 0 時、週は月曜はじまり */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (x: number) => String(x).padStart(2, '0');

export interface Challenge {
  period: Period;
  n: number;
  /** 期間を表す文字列（daily:2026-10-21, weekly:2026-10-19 は週の月曜, monthly:2026-10）。シードとセーブの照合に使う */
  key: string;
  /** シェアに出す期間の表示（2026/10/21） */
  label: string;
  /** ゲーム画面の見出しに出す短い期間の表示（10/21）。スマホのヘッダーに収めるため年を省く */
  shortLabel: string;
  seed: number;
}

export function currentChallenge(period: Period, now = Date.now()): Challenge {
  // JST の日付を UTC のフィールドで読む
  let d = new Date(now + JST_OFFSET_MS);
  if (period === 'weekly') {
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    d = new Date(d.getTime() - sinceMonday * DAY_MS);
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const ymd = `${y}-${pad(m)}-${pad(day)}`;
  const key = period === 'monthly' ? `monthly:${y}-${pad(m)}` : `${period}:${ymd}`;
  const label =
    period === 'daily' ? `${y}/${m}/${day}` : period === 'weekly' ? `${y}/${m}/${day}〜` : `${y}年${m}月`;
  const shortLabel = period === 'daily' ? `${m}/${day}` : period === 'weekly' ? `${m}/${day}〜` : `${m}月`;
  return { period, n: CHALLENGE_N[period], key, label, shortLabel, seed: hashSeed(key) };
}

/** 文字列から 32bit のシードを作る（FNV-1a） */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
