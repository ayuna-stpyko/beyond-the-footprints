import { CHALLENGE_N, PERIOD_NAMES, PERIODS, type Period } from '../../core/challenge';
import { h } from '../dom';
import { brand, domCell, helpLabelButton } from './common';

/** チャレンジの進み具合（タイトルのボタンに出す） */
export type ChallengeStatus = 'new' | 'playing' | 'won';

export interface TitleActions {
  start: () => void;
  rules: () => void;
  challenge: (p: Period) => void;
}

const STATUS_TEXT: Record<ChallengeStatus, string> = { new: '', playing: '挑戦中', won: 'クリア済み' };

export function titleScreen(actions: TitleActions, status: Partial<Record<Period, ChallengeStatus>> = {}) {
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
    h(
      'section.challenges',
      {},
      h('div.challenges__label', {}, '今日の地図に挑戦'),
      h(
        'div.challenges__row',
        {},
        ...PERIODS.map((p) => {
          const st = status[p] ?? 'new';
          const n = CHALLENGE_N[p];
          return h(
            `button.challenge-btn${st === 'won' ? '.challenge-btn--won' : ''}`,
            { onclick: () => actions.challenge(p) },
            h('span.challenge-btn__name', {}, PERIOD_NAMES[p]),
            h('span.challenge-btn__size', {}, `${2 * n + 1}×${2 * n + 1}`),
            h('span.challenge-btn__status', {}, STATUS_TEXT[st]),
          );
        }),
      ),
    ),
    helpLabelButton(actions.rules),
  );
}
