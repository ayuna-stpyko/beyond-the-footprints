/** マスの矢印。0 は矢印なし（宝マス・経路外のマス）。 */
export const Dir = { None: 0, Up: 1, Right: 2, Down: 3, Left: 4 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];

/** 盤面の値が移動方向（↑→↓←）かどうか */
export function isMoveDir(v: number): v is Exclude<Dir, 0> {
  return v === Dir.Up || v === Dir.Right || v === Dir.Down || v === Dir.Left;
}

/** Dir ごとの行・列の変化量（添字 0 は未使用） */
export const DR = [0, -1, 0, 1, 0] as const;
export const DC = [0, 0, 1, 0, -1] as const;

export type GenMode = 'inflate' | 'hamiltonian';

export interface Board {
  n: number;
  /** 一辺のマス数 = 2n+1 */
  size: number;
  /** dirs[r * size + c] = そのマスから経路が次に進む向き */
  dirs: Uint8Array;
  /** 宝マスの添字 */
  treasure: number;
  /** 経路のマス数（中央と宝を含む） */
  length: number;
  seed: number;
  mode: GenMode;
}

export const centerIndex = (n: number): number => n * (2 * n + 1) + n;

/** 隣接する 2 マス a→b の向き */
export function dirBetween(a: number, b: number, size: number): Dir {
  const d = b - a;
  if (d === -size) return Dir.Up;
  if (d === size) return Dir.Down;
  if (d === 1) return Dir.Right;
  if (d === -1) return Dir.Left;
  throw new Error(`cells ${a} and ${b} are not adjacent`);
}
