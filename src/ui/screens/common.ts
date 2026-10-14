import { arrowSrc, dpadSrc, icons, playerSrc } from '../assets';
import { h, img } from '../dom';

/** N の上限。スマホ（タッチ操作のみの端末）はメモリと生成時間を考えて 200 まで */
export const MAX_N_PC = 2000;
export const MAX_N_MOBILE = 200;
export const isMobile = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
export const maxN = () => (isMobile() ? MAX_N_MOBILE : MAX_N_PC);

export const boardLabel = (n: number, withMasu = false) =>
  `N = ${n}（${2 * n + 1} × ${2 * n + 1}${withMasu ? ' マス' : ''}）`;

export function brand() {
  return h(
    'div.brand',
    {},
    h('div.brand__title', {}, 'BEYOND THE', h('br'), 'FOOTPRINTS'),
  );
}

export type CellKind = 'empty' | 'arrow-up' | 'nothing' | 'treasure' | 'found' | 'player-up';

/** DOM 版のマス（タイトルとルールの図示用）。start でスタート地点の印を付ける */
export function domCell(kind: CellKind, start = false) {
  const el = domCellBody(kind);
  if (start) el.append(h('i.cell__start'));
  return el;
}

function domCellBody(kind: CellKind) {
  switch (kind) {
    case 'arrow-up':
      return h('div.cell.cell--arrow', {}, img(arrowSrc[1], 'arrow'));
    case 'nothing':
      return h('div.cell.cell--nothing', {}, h('i.cell__dot'));
    case 'treasure':
      return h('div.cell.cell--treasure', {}, img(icons.treasure, 'treasure'));
    case 'found':
      return h('div.cell.cell--found', {}, img(icons.treasure, 'treasure'));
    case 'player-up':
      return h('div.cell.cell--player', {}, img(playerSrc[1]));
    default:
      return h('div.cell');
  }
}

export function helpLabelButton(onclick: () => void) {
  return h('button.pill.pill--help', { onclick, 'aria-label': 'あそびかた' }, img(icons.helpLabel), 'あそびかた');
}

export function helpIconButton(onclick: () => void) {
  return h('button.icon-btn', { onclick, 'aria-label': 'あそびかた' }, img(icons.helpIcon));
}

export function dpadButton(dir: keyof typeof dpadSrc, onclick?: () => void) {
  return h('button.dpad__btn', { 'data-dir': dir, onclick, 'aria-label': dir }, img(dpadSrc[dir]));
}
