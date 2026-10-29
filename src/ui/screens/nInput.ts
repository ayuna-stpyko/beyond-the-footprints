import { h } from '../dom';
import { brand, isMobile, MAX_N_MOBILE, maxN } from './common';

/** 入力欄の文字列を N にする。全角数字も受け付け、1〜max の整数でなければ null */
export function parseN(text: string, max: number): number | null {
  const t = text.trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= max ? n : null;
}

/** おすすめの N（初級・中級・上級・達人級） */
const PRESETS: { name: string; n: number }[] = [
  { name: '初級', n: 5 },
  { name: '中級', n: 15 },
  { name: '上級', n: 50 },
  { name: '達人級', n: 200 },
];

export function nInputScreen(initial: number, actions: { play: (n: number) => void; back: () => void }) {
  const input = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    value: String(initial),
    'aria-label': 'N の値',
  });
  const presets = h(
    'div.n-presets',
    {},
    ...PRESETS.map((p) =>
      h(
        'button.challenge-btn',
        {
          onclick: () => {
            input.value = String(p.n);
            update();
            input.focus();
          },
        },
        h('span.challenge-btn__name', {}, p.name),
        h('span.challenge-btn__size', {}, `N = ${p.n}`),
      ),
    ),
  );
  const hint = h('span.n-input__hint');
  const field = h('div.n-input', {}, input, hint);
  const error = h('p.n-card__error');
  const startBtn = h('button.btn.btn--primary.btn--full', {}, 'ゲーム開始');

  const parse = () => parseN(input.value, maxN());
  const update = () => {
    const n = parse();
    hint.textContent = n ? `→ 地図の大きさ ${2 * n + 1} × ${2 * n + 1}` : '';
    error.textContent =
      n || input.value === '' ? '' : `1〜${maxN()} の数字を入力してください${isMobile() ? `（スマホでは ${MAX_N_MOBILE} まで）` : ''}`;
    field.classList.toggle('n-input--error', !n);
    startBtn.disabled = !n;
  };
  const submit = () => {
    const n = parse();
    if (n) actions.play(n);
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  startBtn.addEventListener('click', submit);
  update();
  setTimeout(() => {
    input.focus();
    input.select();
  });

  return h(
    'main.screen.n-screen',
    {},
    brand(),
    h(
      'section.n-card.paper',
      {},
      h('div.n-card__label', {}, 'N の値を入力'),
      h('p.n-card__desc', {}, '数字を入力してください。地図の大きさは (2N+1) × (2N+1) になります。'),
      presets,
      field,
      error,
      h(
        'div.n-card__actions',
        {},
        startBtn,
        h('button.btn.btn--secondary.btn--full', { onclick: actions.back }, 'もどる'),
      ),
    ),
  );
}
