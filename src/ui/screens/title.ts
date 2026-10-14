import { h } from '../dom';
import { brand, domCell, helpLabelButton } from './common';

export function titleScreen(actions: { start: () => void; rules: () => void }) {
  // Figma 01 の 5×5 の飾り盤面: 右上に宝、中央に現在地
  const grid = h('div.mini-grid.paper.paper--grid');
  for (let r = 0; r < 5; r++) {
    const row = h('div.mini-grid__row');
    for (let c = 0; c < 5; c++) {
      row.append(domCell(r === 0 && c === 4 ? 'treasure' : r === 2 && c === 2 ? 'player-up' : 'empty', r === 2 && c === 2));
    }
    grid.append(row);
  }
  return h(
    'main.screen.title-screen',
    {},
    brand(),
    grid,
    h('button.btn.btn--primary.btn--wide', { onclick: actions.start }, 'スタート'),
    helpLabelButton(actions.rules),
  );
}
