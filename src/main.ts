import './styles/main.css';
import { trackGenError, trackStart } from './analytics';
import { generateBoardAsync } from './core/generateAsync';
import { type GameState, newGame } from './core/game';
import type { GenerateOptions } from './core/generate';
import { randomSeed } from './core/rng';
import type { Board } from './core/types';
import { validateBoard } from './core/validate';
import { loadCanvasImages } from './ui/assets';
import { h } from './ui/dom';
import { maxN } from './ui/screens/common';
import { gameScreen } from './ui/screens/game';
import { genErrorScreen } from './ui/screens/genError';
import { nInputScreen } from './ui/screens/nInput';
import { openRules } from './ui/screens/rules';
import { titleScreen } from './ui/screens/title';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const genOptions: GenerateOptions = {};
if (params.has('density')) genOptions.density = Number(params.get('density'));

/** N 入力画面の初期値 */
const DEFAULT_N = 3;
let lastN = DEFAULT_N;
let board: Board | null = null;
let game: GameState | null = null;
let dispose: () => void = () => {};

function mount(el: HTMLElement | ((root: HTMLElement) => () => void)) {
  dispose();
  dispose = () => {};
  app.replaceChildren();
  window.scrollTo(0, 0);
  if (el instanceof HTMLElement) app.append(el);
  else dispose = el(app);
}

/** 盤面を再現できる URL（シェア用） */
function boardUrl(b: Board) {
  const u = new URL(import.meta.env.BASE_URL, location.origin);
  u.searchParams.set('n', String(b.n));
  u.searchParams.set('seed', String(b.seed));
  return u.toString();
}

function showTitle() {
  genToken++;
  history.replaceState(null, '', import.meta.env.BASE_URL + (debug ? '?debug' : ''));
  mount(titleScreen({ start: showNInput, rules: openRules }));
}

function showNInput() {
  genToken++;
  mount(nInputScreen(lastN, { play: (n) => startBoard(n, randomSeed()), back: showTitle }));
}

/** ランダムなシードで失敗したときに、別のシードで引き直す回数 */
const GEN_RETRIES = 2;
/** 生成中に別の画面へ移ったら、古い結果を捨てるための番号 */
let genToken = 0;

async function startBoard(n: number, seed: number, shared = false) {
  lastN = n;
  const token = ++genToken;
  mount(h('main.screen.loading-screen', {}, h('p.loading', {}, '盤面を生成中…')));
  const t0 = performance.now();
  // 共有リンクの盤面はシードを変えると別の盤面になるので、引き直さない
  const attempts = shared ? 1 : 1 + GEN_RETRIES;
  for (let i = 0; i < attempts; i++) {
    const s = i === 0 ? seed : randomSeed();
    try {
      // 失敗したときだけ次を試すので、順番に待つ
      // oxlint-disable-next-line no-await-in-loop
      const b = await generateBoardAsync(n, s, genOptions);
      if (token !== genToken) return;
      board = b;
      if (debug) {
        console.info('[beyond-footprints] generated in', Math.round(performance.now() - t0), 'ms');
        // 開発時だけ盤面の不変条件を確かめる
        const err = validateBoard(b);
        console.info('[beyond-footprints]', { n, seed: s, mode: b.mode, length: b.length, density: b.length / b.size ** 2, err });
      }
      playBoard(false, shared);
      return;
    } catch (err) {
      console.error('[beyond-footprints] board generation failed', { n, seed: s }, err);
      trackGenError(n, err);
    }
  }
  if (token !== genToken) return;
  mount(
    genErrorScreen(n, {
      retry: () => void startBoard(n, randomSeed()),
      changeN: showNInput,
      title: showTitle,
    }),
  );
}

function playBoard(retry = true, shared = false) {
  if (!board) return showTitle();
  game = newGame(board);
  trackStart(game, { retry, shared });
  showGame();
}

function showGame() {
  if (!game) return showTitle();
  const g = game;
  mount((root) =>
    gameScreen(root, g, {
      title: showTitle,
      restart: () => playBoard(),
      again: () => startBoard(g.board.n, randomSeed()),
      shareUrl: boardUrl(g.board),
    }, debug),
  );
}

if (debug) {
  // 開発用: コンソールから盤面と状態を見られるようにする
  Object.assign(window, { __tg: { get board() { return board; }, get game() { return game; } } });
}

void loadCanvasImages().then(() => {
  const n = Number(params.get('n'));
  const seed = Number(params.get('seed'));
  const linked = Number.isInteger(n) && n >= 1 && params.has('seed') && Number.isFinite(seed);
  if (linked && n <= maxN()) {
    void startBoard(n, seed >>> 0, true);
  } else if (linked) {
    // 共有された盤面がこの端末の上限を超えるときは、N 入力画面で理由を見せる
    lastN = n;
    showNInput();
  } else {
    showTitle();
  }
});
