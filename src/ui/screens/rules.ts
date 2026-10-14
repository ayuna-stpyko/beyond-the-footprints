import { icons } from '../assets';
import { h, img } from '../dom';
import { dpadButton, domCell } from './common';

let open: HTMLElement | null = null;

const rule = (icon: HTMLElement, text: string) => h('div.rule', {}, icon, h('p', {}, text));


export function openRules() {
  if (open) return;
  const close = () => {
    open?.remove();
    open = null;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const dpad = dpadButton('up');
  dpad.tabIndex = -1;
  const modal = h(
    'div.rules.paper.paper--modal',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'あそびかた' },
    h(
      'div.rules__head',
      {},
      h('div.rules__title', {}, 'あそびかた'),
      h('button.rules__close', { onclick: close, 'aria-label': '閉じる' }, img(icons.iconClose)),
    ),
    h(
      'section.story',
      {},
      h('div.story__label', {}, 'ものがたり'),
      h(
        'p',
        {},
        'むかし、ひとりの探検家がこの地で宝を見つけました。探検家は盤面のまんなかから歩きだし、同じマスを二度通らずに、探検を続け宝にたどりつきました。',
      ),
      h(
        'p',
        {},
        'その足あとは今も残っていますが、道のりが長すぎて、そのまま追いかけてはヘトヘトになってしまいます。足あとを手がかりに近道を見つけ、宝へ急ぎましょう！',
      ),
    ),
    rule(domCell('player-up', true), 'あなたも盤面のまんなか（左上に点のあるマス）から出発します。'),
    rule(dpad, '上下左右に1マスずつ移動できます。ボタンか、PCなら矢印キーで操作します。'),
    rule(domCell('arrow-up'), '探検家が通ったマスには足あと（矢印）が見えます。探検家は矢印の向きに進んでいったようです。'),
    rule(domCell('nothing'), '探検家が通らなかったマスには何もありません。'),
    rule(domCell('treasure'), '宝はたどりつくまで見えません。決められた歩数を歩いても見つからなければゲームオーバー。'),
    rule(domCell('found'), '歩数以内に宝のマスにたどりつけばクリア！'),
    h('button.btn.btn--primary.btn--full', { onclick: close }, 'わかった'),
  );
  open = h('div.overlay', {
    onclick: (e: Event) => {
      if (e.target === open) close();
    },
  }, modal);
  document.body.append(open);
  document.addEventListener('keydown', onKey);
}
