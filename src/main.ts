import './styles/main.css';
import { trackGenError, trackStart } from './analytics';
import { type Challenge, currentChallenge, isPeriod, PERIOD_NAMES, PERIODS, type Period } from './core/challenge';
import { generateBoardAsync } from './core/generateAsync';
import { type GameState, movesUsed, newGame } from './core/game';
import type { GenerateOptions } from './core/generate';
import { randomSeed } from './core/rng';
import type { Board } from './core/types';
import { validateBoard } from './core/validate';
import { loadCanvasImages } from './ui/assets';
import { type ChallengeSave, encodeMoves, loadSave, restoreGame, writeSave } from './ui/challengeSave';
import { h } from './ui/dom';
import { maxN } from './ui/screens/common';
import { gameScreen } from './ui/screens/game';
import { genErrorScreen } from './ui/screens/genError';
import { nInputScreen } from './ui/screens/nInput';
import { openRules } from './ui/screens/rules';
import { type ChallengeStatus, titleScreen } from './ui/screens/title';

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
/** チャレンジを遊んでいるときの期間とセーブ */
let challenge: { ch: Challenge; save: ChallengeSave } | null = null;
let dispose: () => void = () => {};

function mount(el: HTMLElement | ((root: HTMLElement) => () => void)) {
  dispose();
  dispose = () => {};
  app.replaceChildren();
  window.scrollTo(0, 0);
  if (el instanceof HTMLElement) app.append(el);
  else dispose = el(app);
}

/** 盤面を再現できる URL（シェア用）。チャレンジは盤面ではなく「今のチャレンジ」へのリンクにする */
function boardUrl(b: Board) {
  const u = new URL(import.meta.env.BASE_URL, location.origin);
  if (challenge) {
    u.searchParams.set('c', challenge.ch.period);
  } else {
    u.searchParams.set('n', String(b.n));
    u.searchParams.set('seed', String(b.seed));
  }
  return u.toString();
}

function challengeStatus(p: Period): ChallengeStatus {
  const s = loadSave(currentChallenge(p));
  return s.won ? 'won' : s.attempt > 1 || s.moves ? 'playing' : 'new';
}

function showTitle() {
  genToken++;
  history.replaceState(null, '', import.meta.env.BASE_URL + (debug ? '?debug' : ''));
  const status = Object.fromEntries(PERIODS.map((p) => [p, challengeStatus(p)]));
  mount(titleScreen({ start: showNInput, rules: openRules, challenge: startChallenge }, status));
}

function showNInput() {
  genToken++;
  challenge = null;
  mount(nInputScreen(lastN, { play: (n) => startBoard(n, randomSeed()), back: showTitle }));
}

/** ランダムなシードで失敗したときに、別のシードで引き直す回数 */
const GEN_RETRIES = 2;
/** 生成中に別の画面へ移ったら、古い結果を捨てるための番号 */
let genToken = 0;

function startChallenge(p: Period) {
  const ch = currentChallenge(p);
  challenge = { ch, save: loadSave(ch) };
  // 再読み込みしても同じチャレンジの続きから遊べるように
  history.replaceState(null, '', `${import.meta.env.BASE_URL}?c=${p}${debug ? '&debug' : ''}`);
  void startBoard(ch.n, ch.seed, false, ch);
}

/**
 * ch を渡すとチャレンジの盤面として作る。
 * チャレンジは全員が同じ盤面になるよう、失敗したときも決まった順のシード（seed+1, seed+2）で引き直す。
 */
async function startBoard(n: number, seed: number, shared = false, ch?: Challenge) {
  if (!ch) {
    lastN = n;
    challenge = null;
  }
  const token = ++genToken;
  mount(h('main.screen.loading-screen', {}, h('p.loading', {}, '盤面を生成中…')));
  const t0 = performance.now();
  // 共有リンクの盤面はシードを変えると別の盤面になるので、引き直さない
  const attempts = shared ? 1 : 1 + GEN_RETRIES;
  for (let i = 0; i < attempts; i++) {
    const s = i === 0 ? seed : ch ? (seed + i) >>> 0 : randomSeed();
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
      retry: () => (ch ? startChallenge(ch.period) : void startBoard(n, randomSeed())),
      changeN: showNInput,
      title: showTitle,
    }),
  );
}

function playBoard(retry = true, shared = false) {
  if (!board) return showTitle();
  if (challenge) {
    const { ch, save } = challenge;
    if (retry) {
      // クリアした盤面はやりなおせない。1 歩でも動いていたら、やりなおしは次の挑戦に数える
      if (save.won) return showGame();
      if (save.moves) Object.assign(save, { attempt: save.attempt + 1, moves: '' });
      writeSave(ch, save);
    }
    game = restoreGame(board, save.moves);
    // 続きから再開したときは開始として数えない
    if (movesUsed(game) === 0) trackStart(game, { retry, shared });
  } else {
    game = newGame(board);
    trackStart(game, { retry, shared });
  }
  showGame();
}

/** 1 手ごとの自動セーブ */
function saveChallenge() {
  if (!challenge || !game) return;
  const { ch, save } = challenge;
  save.moves = encodeMoves(game);
  save.won = game.status === 'won';
  writeSave(ch, save);
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
      ...(challenge && {
        challenge: {
          title: `${PERIOD_NAMES[challenge.ch.period]} ${challenge.ch.label}`,
          heading: `${PERIOD_NAMES[challenge.ch.period]} ${challenge.ch.shortLabel}`,
          attempt: challenge.save.attempt,
        },
        onMove: saveChallenge,
      }),
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
  const period = params.get('c');
  if (isPeriod(period)) {
    startChallenge(period);
  } else if (linked && n <= maxN()) {
    void startBoard(n, seed >>> 0, true);
  } else if (linked) {
    // 共有された盤面がこの端末の上限を超えるときは、N 入力画面で理由を見せる
    lastN = n;
    showNInput();
  } else {
    showTitle();
  }
});
