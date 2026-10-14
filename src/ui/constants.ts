/** 100% のときのマスの寸法: 44px のマス + 4px のすき間 */
export const CELL_PX = 44;
export const GAP_PX = 4;
export const PITCH_PX = CELL_PX + GAP_PX;
/** 間隔に対するすき間・マスの割合 */
export const GAP_RATIO = GAP_PX / PITCH_PX;
export const CELL_RATIO = CELL_PX / PITCH_PX;

/** これより小さいマスは中身を省いて塗りだけで描く */
export const MIN_DETAIL_CELL_PX = 10;

/** ボタンやキー操作で 1 回にズームする倍率 */
export const ZOOM_STEP = 1.25;

export const COLORS = {
  empty: '#f5ebd0',
  arrow: '#e6cc8f',
  nothing: '#ead9b0',
  border: '#a07a48',
  red: '#9b2c1c',
  boardBg: '#d9c394',
  ink: '#4a2c14',
  /** 全体マップの枠 */
  mapBorder: '#b8935e',
  /** 全体マップの宝 */
  gold: '#e8a317',
  /** GIF の背景（透明にできないので紙の色で塗る） */
  gifBg: '#f3e6c4',
};

/** COLORS.red の半透明（ハイライト・影用） */
export const redAlpha = (a: number) => `rgba(155, 44, 28, ${a})`;
