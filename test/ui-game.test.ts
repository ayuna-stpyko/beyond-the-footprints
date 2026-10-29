// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GameState, newGame } from '../src/core/game';
import { generateBoard } from '../src/core/generate';
import { DC, DR, Dir, isMoveDir } from '../src/core/types';
import { makeReplayGif } from '../src/ui/gif';
import { type GameActions, gameScreen } from '../src/ui/screens/game';
import { openConfirm } from '../src/ui/screens/confirm';
import { pressKey, setupDom } from './helpers/dom';

// GIF の生成は重く、canvas の実装も要るので差し替える
vi.mock('../src/ui/gif', () => ({ makeReplayGif: vi.fn(() => new Blob(['gif'])) }));

type MoveDir = Exclude<Dir, 0>;
const ARROW: Record<MoveDir, string> = { [Dir.Up]: 'ArrowUp', [Dir.Right]: 'ArrowRight', [Dir.Down]: 'ArrowDown', [Dir.Left]: 'ArrowLeft' };
const DPAD: Record<MoveDir, string> = { [Dir.Up]: 'up', [Dir.Right]: 'right', [Dir.Down]: 'down', [Dir.Left]: 'left' };

/** d に 1 歩動いた先のマス。盤外なら -1 */
function neighbor(g: GameState, d: MoveDir) {
  const { size } = g.board;
  const r = ((g.pos / size) | 0) + DR[d];
  const c = (g.pos % size) + DC[d];
  return r < 0 || c < 0 || r >= size || c >= size ? -1 : r * size + c;
}

/** 宝にも盤外にも当たらない向き（右を優先） */
function safeDir(g: GameState): MoveDir {
  const d = ([Dir.Right, Dir.Left, Dir.Up, Dir.Down] as const).find((dir) => {
    const next = neighbor(g, dir);
    return next >= 0 && next !== g.board.treasure;
  });
  if (!d) throw new Error('no safe move');
  return d;
}

/** 矢印をたどれば 12N 歩以内に宝に着く盤面（test/game.test.ts と同じ） */
const winnableGame = () => newGame(generateBoard(1, 5));

/** 矢印をたどってキー入力で宝まで歩く */
function walkToTreasure(g: GameState) {
  while (g.status === 'playing') {
    const d = g.board.dirs[g.pos];
    if (!isMoveDir(d)) throw new Error('walked off the route');
    pressKey(ARROW[d]);
  }
}

/** 中央から真上の列に宝がない盤面（上端まで行って盤外へ動ける） */
function topReachableGame() {
  let seed = 0;
  let b = generateBoard(2, seed);
  while (b.treasure % b.size === 2 && b.treasure < 2 * b.size) b = generateBoard(2, ++seed);
  return newGame(b);
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const text = (sel: string) => q(sel)?.textContent ?? null;
const hudLeft = () => Number(text('.hud__left'));

function buttonByText(label: string) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`button not found: ${label}`);
  return btn;
}

/** モバイルはアイコン、PC は文字付きの「タイトルへ」ボタン */
const titleBtn = () => q('button[aria-label="タイトルへ"], .pill--title')!;

let disposers: (() => void)[] = [];

function mount(game: GameState, extra: Partial<GameActions> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const actions = {
    title: vi.fn(),
    restart: vi.fn(),
    again: vi.fn(),
    shareUrl: 'https://example.com/beyond-footprints/?n=1&seed=5',
    ...extra,
  } satisfies GameActions;
  const dispose = gameScreen(root, game, actions, false);
  disposers.push(dispose);
  return { root, actions, dispose };
}

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  { name: 'mobile', media: {} },
  { name: 'pc', media: { pc: true } },
])('gameScreen ($name)', ({ media }) => {
  beforeEach(() => setupDom(media));

  it('moves with arrow keys and updates the HUD', () => {
    const g = newGame(generateBoard(3, 1));
    mount(g);
    expect(hudLeft()).toBe(36);
    expect(text('.hud__max')).toBe('/ 36');
    const d = safeDir(g);
    const target = neighbor(g, d);
    const e = pressKey(ARROW[d]);
    expect(e.defaultPrevented).toBe(true);
    expect(g.pos).toBe(target);
    expect(g.movesLeft).toBe(35);
    expect(hudLeft()).toBe(35);
  });

  it('moves with WASD keys (lower and upper case)', () => {
    const g = topReachableGame();
    mount(g);
    const start = g.pos;
    pressKey('w');
    expect(g.pos).toBe(start - g.board.size);
    pressKey('S');
    expect(g.pos).toBe(start);
    expect(hudLeft()).toBe(g.maxMoves - 2);
  });

  it('does nothing when moving off the board', () => {
    const g = topReachableGame();
    mount(g);
    pressKey('ArrowUp');
    pressKey('ArrowUp');
    expect(g.pos).toBe(2);
    const left = hudLeft();
    pressKey('ArrowUp');
    expect(g.pos).toBe(2);
    expect(g.movesLeft).toBe(left);
    expect(hudLeft()).toBe(left);
    expect(g.log.length).toBe(3);
  });

  it('ignores keys while a modal is open', () => {
    const g = newGame(generateBoard(3, 1));
    mount(g);
    openConfirm({ title: 't', message: 'm', ok: 'OK', onOk: () => {} });
    const start = g.pos;
    pressKey(ARROW[safeDir(g)]);
    expect(g.pos).toBe(start);
    expect(hudLeft()).toBe(g.maxMoves);
    // Esc で閉じれば（確認モーダルのキー監視も外れて）また動ける
    pressKey('Escape');
    expect(q('.overlay')).toBeNull();
    pressKey(ARROW[safeDir(g)]);
    expect(g.pos).not.toBe(start);
  });

  it('ignores keys typed into an input and keys with modifiers', () => {
    const g = newGame(generateBoard(3, 1));
    mount(g);
    const input = document.createElement('input');
    document.body.append(input);
    const start = g.pos;
    const key = ARROW[safeDir(g)];
    pressKey(key, {}, input);
    pressKey(key, { ctrlKey: true });
    pressKey(key, { metaKey: true });
    pressKey(key, { altKey: true });
    expect(g.pos).toBe(start);
    expect(g.movesLeft).toBe(g.maxMoves);
  });

  it('shows the result card after winning and ignores further keys', () => {
    const g = winnableGame();
    mount(g);
    expect(q('.result-card')).toBeNull();
    walkToTreasure(g);
    expect(g.status).toBe('won');
    expect(text('.result-card__title')).toBe('クリア！');
    expect(text('.result-card__msg')).toBe(`${g.maxMoves - g.movesLeft}歩で宝を見つけました。`);
    expect(q('.replay')).not.toBeNull();

    const { pos, movesLeft } = g;
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) pressKey(k);
    expect(g.pos).toBe(pos);
    expect(g.movesLeft).toBe(movesLeft);
    expect(document.querySelectorAll('.result-card').length).toBe(1);
  });

  it('shows game over after running out of moves', () => {
    const g = newGame(generateBoard(1, 5));
    // 残り 1 歩にして、宝のない向きへ動く
    g.movesLeft = 1;
    mount(g);
    pressKey(ARROW[safeDir(g)]);
    expect(g.status).toBe('lost');
    expect(text('.result-card__title')).toBe('ゲームオーバー');
    expect(q('.result-card__title--lost')).not.toBeNull();
    expect(text('.result-card__msg')).toBe('体力を使い切りました。');
  });

  it('result card buttons call title and again', () => {
    const g = winnableGame();
    const { actions } = mount(g);
    walkToTreasure(g);
    buttonByText('タイトルへ').click();
    expect(actions.title).toHaveBeenCalledTimes(1);
    buttonByText('もう一度').click();
    expect(actions.again).toHaveBeenCalledTimes(1);
  });

  it('locks a cleared challenge', () => {
    const g = winnableGame();
    const onMove = vi.fn();
    mount(g, { challenge: { title: 'デイリー 2026/10/21', heading: 'デイリー 10/21', attempt: 2 }, onMove });
    walkToTreasure(g);
    expect(onMove).toHaveBeenCalledTimes(g.log.length - 1);
    expect(text('.result-card__msg')).toBe(`2回目の挑戦、${g.log.length - 1}歩で宝を見つけました。`);
    expect(q('.pill--reset')).toBeNull();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'もう一度')).toBe(false);
  });

  it('goes to the title without confirmation during a challenge (it is autosaved)', () => {
    const g = newGame(generateBoard(3, 1));
    const { actions } = mount(g, { challenge: { title: 'デイリー 2026/10/21', heading: 'デイリー 10/21', attempt: 1 } });
    pressKey(ARROW[safeDir(g)]);
    titleBtn().click();
    expect(q('.overlay')).toBeNull();
    expect(actions.title).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation with the same message during a challenge', () => {
    const g = newGame(generateBoard(3, 1));
    mount(g, { challenge: { title: 'デイリー 2026/10/21', heading: 'デイリー 10/21', attempt: 2 } });
    pressKey(ARROW[safeDir(g)]);
    q('.pill--reset')!.click();
    expect(text('.confirm__msg')).toBe('同じ地図で、最初からやりなおします。');
    // 開いたままだと次のテストのキー操作が効かなくなる
    buttonByText('キャンセル').click();
  });

  it('retries a lost challenge on the same board', () => {
    const g = newGame(generateBoard(1, 5));
    g.movesLeft = 1;
    const { actions } = mount(g, { challenge: { title: 'デイリー 2026/10/21', heading: 'デイリー 10/21', attempt: 1 } });
    pressKey(ARROW[safeDir(g)]);
    buttonByText('もう一度挑戦').click();
    expect(actions.restart).toHaveBeenCalledTimes(1);
    expect(actions.again).not.toHaveBeenCalled();
  });

  it('restarts immediately when no move has been made', () => {
    const { actions } = mount(newGame(generateBoard(3, 1)));
    q('.pill--reset')!.click();
    expect(actions.restart).toHaveBeenCalledTimes(1);
    expect(q('.overlay')).toBeNull();
  });

  it('asks for confirmation before restarting after a move', () => {
    const g = newGame(generateBoard(3, 1));
    const { actions } = mount(g);
    pressKey(ARROW[safeDir(g)]);
    q('.pill--reset')!.click();
    expect(q('.overlay')).not.toBeNull();
    expect(actions.restart).not.toHaveBeenCalled();

    // キャンセルでは呼ばれない
    buttonByText('キャンセル').click();
    expect(q('.overlay')).toBeNull();
    expect(actions.restart).not.toHaveBeenCalled();

    q('.pill--reset')!.click();
    q('.overlay .btn--primary')!.click();
    expect(q('.overlay')).toBeNull();
    expect(actions.restart).toHaveBeenCalledTimes(1);
  });

  it('goes to the title immediately when no move has been made', () => {
    const { actions } = mount(newGame(generateBoard(3, 1)));
    titleBtn().click();
    expect(actions.title).toHaveBeenCalledTimes(1);
    expect(q('.overlay')).toBeNull();
  });

  it('asks for confirmation before going to the title after a move', () => {
    const g = newGame(generateBoard(3, 1));
    const { actions } = mount(g);
    pressKey(ARROW[safeDir(g)]);
    titleBtn().click();
    expect(q('.overlay')).not.toBeNull();
    expect(actions.title).not.toHaveBeenCalled();

    buttonByText('キャンセル').click();
    expect(q('.overlay')).toBeNull();
    expect(actions.title).not.toHaveBeenCalled();

    titleBtn().click();
    q('.overlay .btn--primary')!.click();
    expect(q('.overlay')).toBeNull();
    expect(actions.title).toHaveBeenCalledTimes(1);
  });

  it('stops handling keys after dispose', () => {
    const g = newGame(generateBoard(3, 1));
    const { dispose } = mount(g);
    dispose();
    const start = g.pos;
    pressKey(ARROW[safeDir(g)]);
    expect(g.pos).toBe(start);
    expect(g.movesLeft).toBe(g.maxMoves);
  });

  it('opens an X intent with the share URL', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const g = winnableGame();
    const { actions } = mount(g);
    walkToTreasure(g);
    buttonByText('Xでシェア').click();
    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
    const textParam = new URL(url).searchParams.get('text') ?? '';
    expect(textParam).toContain(actions.shareUrl);
    expect(textParam).toContain('N=1');
  });

  it('downloads the GIF and generates it only once', () => {
    vi.useFakeTimers();
    vi.mocked(makeReplayGif).mockClear();
    const createUrl = vi.fn(() => 'blob:gif');
    const revokeUrl = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    const g = winnableGame();
    mount(g);
    walkToTreasure(g);
    buttonByText('GIFを保存').click();
    buttonByText('GIFを保存').click();
    expect(downloads).toEqual(['beyond-footprints-n1.gif', 'beyond-footprints-n1.gif']);
    expect(makeReplayGif).toHaveBeenCalledTimes(1);
    expect(makeReplayGif).toHaveBeenCalledWith(g);
    expect(createUrl).toHaveBeenCalledTimes(2);
    // 少し待ってから URL を解放する
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('shows the result card when mounted with a finished game', () => {
    const g = winnableGame();
    while (g.status === 'playing') {
      const d = g.board.dirs[g.pos];
      if (!isMoveDir(d)) throw new Error('walked off the route');
      // キー操作なしで終わらせる
      g.pos = neighbor(g, d);
      g.log.push(g.pos);
      g.movesLeft--;
      if (g.pos === g.board.treasure) g.status = 'won';
    }
    mount(g);
    expect(text('.result-card__title')).toBe('クリア！');
    expect(q('.replay')).not.toBeNull();
  });
});

describe('gameScreen (mobile)', () => {
  beforeEach(() => setupDom());

  it('uses fit mode with a d-pad for small boards', () => {
    mount(newGame(generateBoard(3, 1)));
    expect(q('.board-panel--fit')).not.toBeNull();
    expect(q('.dpad')).not.toBeNull();
    expect(q('.pos-badge')).toBeNull();
    expect(q('.game__hint')).not.toBeNull();
  });

  it('moves with the d-pad on pointerdown', () => {
    const g = newGame(generateBoard(3, 1));
    mount(g);
    const d = safeDir(g);
    const target = neighbor(g, d);
    const btn = q(`.dpad__btn[data-dir="${DPAD[d]}"]`)!;
    // click では動かない（pointerdown で反応する）
    btn.click();
    expect(g.pos).not.toBe(target);
    const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(g.pos).toBe(target);
    expect(hudLeft()).toBe(g.maxMoves - 1);
  });

  it('replaces the board and d-pad with the replay after the end', () => {
    const g = winnableGame();
    mount(g);
    walkToTreasure(g);
    expect(q('.board-panel--replay .replay')).not.toBeNull();
    expect(q('.dpad')).toBeNull();
    expect(q('.game__hint')).toBeNull();
    // タイトルへ・あそびかたのアイコンは消え（結果カードにある）、やりなおすだけ残る
    expect(q('.header-actions .icon-btn')).toBeNull();
    expect(q('.header-actions .pill--reset')).not.toBeNull();
  });

  it('shows the position badge in explore mode for large boards', () => {
    const g = newGame(generateBoard(50, 1));
    mount(g);
    expect(q('.board-panel--explore')).not.toBeNull();
    expect(q('.minimap-card')).not.toBeNull();
    expect(text('.pos-badge__value')).toBe('スタート地点');
    const d = safeDir(g);
    pressKey(ARROW[d]);
    const label = { [Dir.Up]: '上1', [Dir.Right]: '右1', [Dir.Down]: '下1', [Dir.Left]: '左1' }[d];
    expect(text('.pos-badge__value')).toBe(label);
  });
});

describe('gameScreen (pc)', () => {
  beforeEach(() => setupDom({ pc: true }));

  it('shows the position relative to the start with a prefix', () => {
    const g = topReachableGame();
    mount(g);
    expect(q('.game--pc')).not.toBeNull();
    expect(text('.pos-badge__value')).toBe('スタート地点');
    pressKey('ArrowUp');
    expect(text('.pos-badge__value')).toBe('スタートから 上1');
    // 斜め方向は「・」でつなぐ
    const d = neighbor(g, Dir.Right) !== g.board.treasure ? Dir.Right : Dir.Left;
    pressKey(ARROW[d]);
    expect(text('.pos-badge__value')).toBe(`スタートから ${d === Dir.Right ? '右' : '左'}1・上1`);
  });

});

/** PC 判定の MediaQueryList を差し替え、change リスナーを記録する */
function mockPcMedia(initial: boolean) {
  const listeners = new Set<EventListener>();
  const mql = {
    matches: initial,
    media: '(min-width: 1024px)',
    addEventListener: vi.fn((_: string, fn: EventListener) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: EventListener) => listeners.delete(fn)),
  };
  const other = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    (query.includes('min-width: 1024px') ? mql : other) as unknown as MediaQueryList,
  );
  const fire = () => {
    for (const fn of listeners) fn(new Event('change'));
  };
  return { mql, listeners, fire };
}

describe('gameScreen media query', () => {
  beforeEach(() => setupDom());

  it('re-renders with the other layout when the media query changes', () => {
    const media = mockPcMedia(false);
    const g = newGame(generateBoard(3, 1));
    mount(g);
    expect(q('.game--pc')).toBeNull();
    pressKey(ARROW[safeDir(g)]);

    media.mql.matches = true;
    media.fire();
    expect(document.querySelectorAll('main').length).toBe(1);
    expect(q('.game--pc')).not.toBeNull();
    expect(hudLeft()).toBe(g.maxMoves - 1);

    // 前のレイアウトのキー操作が残っていないこと（1 回の入力で 1 歩だけ動く）
    pressKey(ARROW[safeDir(g)]);
    expect(g.movesLeft).toBe(g.maxMoves - 2);
  });

  it('removes the media query listener on dispose', () => {
    const media = mockPcMedia(true);
    const { dispose } = mount(newGame(generateBoard(3, 1)));
    expect(media.listeners.size).toBe(1);
    dispose();
    expect(media.mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(media.listeners.size).toBe(0);
  });
});
