/**
 * チャレンジの自動セーブ（localStorage）。
 * 盤面はシードから作り直せるので、保存するのは挑戦回数と今回の手順だけ。
 */
import type { Challenge, Period } from '../core/challenge';
import { type GameState, move, newGame } from '../core/game';
import { type Board, dirBetween, isMoveDir } from '../core/types';

export interface ChallengeSave {
  /** 何回目の挑戦か（1 はじまり） */
  attempt: number;
  /** 今回の挑戦の手順。1 文字が 1 手で、Dir の数字（1↑ 2→ 3↓ 4←） */
  moves: string;
  /** クリアしたか（タイトル画面の表示用。盤面を作らずにわかるように持っておく） */
  won: boolean;
}

const storageKey = (p: Period) => `beyond-footprints:challenge:${p}`;
const EMPTY: ChallengeSave = { attempt: 1, moves: '', won: false };

/** その期間のセーブ。期間が変わっていたり読めなかったりしたら、まっさらな状態を返す */
export function loadSave(ch: Challenge): ChallengeSave {
  try {
    const raw = localStorage.getItem(storageKey(ch.period));
    if (!raw) return { ...EMPTY };
    const s: unknown = JSON.parse(raw);
    if (typeof s !== 'object' || s === null || !('key' in s) || s.key !== ch.key) return { ...EMPTY };
    const attempt = 'attempt' in s ? s.attempt : null;
    const moves = 'moves' in s ? s.moves : null;
    if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 1) return { ...EMPTY };
    if (typeof moves !== 'string' || !/^[1-4]*$/.test(moves)) return { ...EMPTY };
    return { attempt, moves, won: 'won' in s && s.won === true };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSave(ch: Challenge, save: ChallengeSave) {
  try {
    localStorage.setItem(storageKey(ch.period), JSON.stringify({ key: ch.key, ...save }));
  } catch {
    // 保存できない環境（プライベートモードなど）では、セーブなしで遊べればよい
  }
}

/** 遊んだ手順を 1 手 1 文字にする */
export function encodeMoves(g: GameState): string {
  let s = '';
  for (let i = 1; i < g.log.length; i++) s += String(dirBetween(g.log[i - 1], g.log[i], g.board.size));
  return s;
}

/** 保存した手順を盤面の上で再生して、続きから遊べる状態にする */
export function restoreGame(board: Board, moves: string): GameState {
  const g = newGame(board);
  for (const ch of moves) {
    // 盤面と合わない手順（壊れたセーブ）は、そこまでで止める
    const d = Number(ch);
    if (!isMoveDir(d) || !move(g, d)) break;
  }
  return g;
}
