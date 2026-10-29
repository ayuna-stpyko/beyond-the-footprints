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
      h('div.story__label', {}, 'ストーリー'),
      h(
        'p',
        {},
        '古い地図を拾った。今はその真ん中にいる。昔、とある探検家もここから長い道を歩いて宝を見つけたようだが、地図には宝の位置が書かれていない。',
      ),
      h(
        'p',
        {},
        '地図の中を隅から隅まで探索する体力はない。この地に残された足跡を手がかりに近道を探して宝を見つけよう。',
      ),
    ),
    rule(domCell('player-up', true), 'あなたも地図のまんなかから出発します。'),
    rule(dpad, '上下左右に1歩ずつ移動できます。ボタンか、PCなら矢印キーで操作します。'),
    rule(domCell('arrow-up'), '探検家が通ったところに着くと、足跡（矢印）が見えるようになります。探検家は矢印の向きに進んでいったようです。'),
    rule(domCell('nothing'), '矢印がなかったところは、探検家が通らなかったようです。'),
    rule(domCell('treasure'), '宝はこの地図のどこかに1つだけ隠されています。体力が尽きるまでに見つけられなければ、ゲームオーバー。'),
    rule(domCell('found'), '体力が尽きる前に宝を見つければクリア！'),
    h('p.rules__credit', {}, '原案: ICPC 2024 Asia Yokohama Regional G問題'),
    h('p.rules__credit', {}, 'GIF の作成に gifenc（© 2017 Matt DesLauriers, MIT License）を使用しています。'),
    h('button.btn.btn--primary.btn--full', { onclick: close }, '閉じる'),
  );
  open = h('div.overlay', {
    onclick: (e: Event) => {
      if (e.target === open) close();
    },
  }, modal);
  document.body.append(open);
  document.addEventListener('keydown', onKey);
}
