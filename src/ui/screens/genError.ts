import { h } from '../dom';
import { boardLabel, brand } from './common';

/** 盤面の生成に失敗したときの画面 */
export function genErrorScreen(n: number, actions: { retry: () => void; changeN: () => void; title: () => void }) {
  return h(
    'main.screen.n-screen',
    {},
    brand(),
    h(
      'section.n-card.paper',
      { role: 'alert' },
      h('div.n-card__label', {}, '盤面を作れませんでした'),
      h('p.n-card__desc', {}, `${boardLabel(n)} の盤面の生成に失敗しました。もう一度試すか、N を変えてみてください。`),
      h(
        'div.n-card__actions',
        {},
        h('button.btn.btn--primary.btn--full', { onclick: actions.retry }, 'もう一度'),
        h('button.btn.btn--secondary.btn--full', { onclick: actions.changeN }, 'N を変える'),
        h('button.btn.btn--secondary.btn--full', { onclick: actions.title }, 'タイトルへ'),
      ),
    ),
  );
}
