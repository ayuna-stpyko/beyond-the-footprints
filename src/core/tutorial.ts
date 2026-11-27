/**
 * チュートリアルの盤面（7×7、体力 36 歩）。
 * 1: 矢印をたどれば着く / 2: 矢印どおりでは届かない / 3: 近道を自分で探す。
 * 生成器のアルゴリズムが変わっても盤面が変わらないように、シードではなく文字列で持つ。
 */
import { moveLimit } from './game';
import { generateBoard } from './generate';
import { type Board, Dir } from './types';

export type TutorialStage = 1 | 2 | 3;
export const TUTORIAL_STAGES = 3;
/** チュートリアルの盤面の大きさ（7×7） */
export const TUTORIAL_N = 3;

const CHARS: Record<string, Dir> = { '.': Dir.None, T: Dir.None, '↑': Dir.Up, '→': Dir.Right, '↓': Dir.Down, '←': Dir.Left };

/** `↑→↓←` 矢印 / `.` 何もない / `T` 宝 の格子から盤面を作る */
export function parseBoard(rows: readonly string[]): Board {
  const size = rows.length;
  const n = (size - 1) / 2;
  if (!Number.isInteger(n) || n < 1) throw new Error(`invalid board size ${size}`);
  const dirs = new Uint8Array(size * size);
  let treasure = -1;
  let arrows = 0;
  rows.forEach((row, r) => {
    // 記号はどれも 1 コードポイントなので、コードポイント単位で分ければよい
    const cells = Array.from(row);
    if (cells.length !== size) throw new Error(`row ${r} has ${cells.length} cells`);
    cells.forEach((ch, c) => {
      const d = CHARS[ch];
      if (d === undefined) throw new Error(`unknown cell "${ch}"`);
      dirs[r * size + c] = d;
      if (ch === 'T') treasure = r * size + c;
      if (d !== Dir.None) arrows++;
    });
  });
  if (treasure < 0) throw new Error('no treasure');
  return { n, size, dirs, treasure, length: arrows + 1, seed: 0, mode: 'inflate' };
}

/** ステージ1: 11 歩の短い道。矢印をたどれば宝に着く */
export const STAGE1 = ['.......', '...→→↓.', '...↑.↓.', '...↑.↓.', '.T←←←←.', '.......', '.......'] as const;
/** ステージ2: 48 歩の道。矢印どおりでは 36 歩で届かない。宝は中央から ↓↓↓← */
export const STAGE2 = ['↓←←←←←←', '↓→→→→↓↑', '↓↑←→↓↓↑', '↓→↑↑↓↓↑', '↓↑←←←↓↑', '↓→→↓↓←↑', '→↑T←→→↑'] as const;
/** ステージ3: 失敗するたびに次の地図にする（generateBoard(3, 228 / 38 / 9) と同じ盤面） */
export const STAGE3 = [
  ['→→→→→→↓', '↑↓←←←←↓', '↑→↓→→↑↓', '↑←↓↑↓←←', '.↑↓.→↓.', '.↑→↓.→↓', '.↑←←.T←'],
  ['.→↓→→→↓', '→↑→↑↓←←', '↑↓←←→↓.', '↑←.↑↓←.', '..↓←↓..', '↓←←↑←T←', '→→→→→→↑'],
  ['→→→→→→↓', '↑←↓←←↓←', '.↑↓→↑→↓', '.↑←↑↓←←', '....→→↓', '.→→→→T↓', '.↑←←←←←'],
] as const;

/**
 * ステージの盤面。attempt はステージ3で何枚目の地図か（0 はじまり）。
 * 用意した地図を使い切ったら、seed から N=3 の盤面を作る。生成器の盤面には道が
 * ちょうど 36 歩で矢印どおりに届くものがまれにあるので、届かない盤面になるまでシードを進める。
 */
export function tutorialBoard(stage: TutorialStage, attempt = 0, seed = 0): Board {
  if (stage === 1) return parseBoard(STAGE1);
  if (stage === 2) return parseBoard(STAGE2);
  const fixed = STAGE3[attempt];
  if (fixed) return parseBoard(fixed);
  for (let s = seed; ; s = (s + 1) >>> 0) {
    const b = generateBoard(TUTORIAL_N, s);
    if (b.length - 1 > moveLimit(TUTORIAL_N)) return b;
  }
}
