import { trackEnd } from '../../analytics';
import { type GameState, move, movesUsed, offsetFromStart } from '../../core/game';
import { Dir } from '../../core/types';
import { icons } from '../assets';
import { BoardView } from '../boardView';
import { GAP_RATIO, ZOOM_STEP } from '../constants';
import { h, img } from '../dom';
import { Minimap } from '../minimap';
import { replayPlayer } from '../replayPlayer';
import { type ChallengeInfo, shareButtons } from '../share';
import type { TutorialBubble, TutorialHooks, TutorialResult } from '../tutorial';
import { boardLabel, dpadButton, helpIconButton, helpLabelButton } from './common';
import { modalOpen, openConfirm } from './confirm';
import { openRules } from './rules';

export interface GameActions {
  title: () => void;
  /** 同じ盤面を最初から */
  restart: () => void;
  /** 同じ N の新しい盤面 */
  again: () => void;
  /** シェアする盤面のリンク */
  shareUrl: string;
  /** チャレンジとして遊んでいるとき。クリア後はやりなおせない */
  challenge?: ChallengeInfo;
  /** 1 手動くたびに呼ぶ（自動セーブ用） */
  onMove?: () => void;
  /**
   * チュートリアルとして遊んでいるとき。「やりなおす」を出さず、盤面に説明を重ね、
   * 結果はリプレイではなくチュートリアルのカードで見せる。計測もしない
   */
  tutorial?: TutorialHooks;
}

/**
 * 盤面の見出しの表示（チャレンジなら期間と挑戦回数、それ以外は N）。
 * 狭い画面では「ウィークリー」「10/19〜」「・2回目」の区切りでだけ折り返す
 */
const boardTitle = (g: GameState, actions: GameActions): (string | HTMLElement)[] => {
  if (actions.tutorial) return [actions.tutorial.heading];
  const ch = actions.challenge;
  if (!ch) return [boardLabel(g.board.n)];
  const [name, ...rest] = ch.heading.split(' ');
  return [h('span.nowrap', {}, name), ' ', h('span.nowrap', {}, rest.join(' ')), h('span.nowrap', {}, `・${ch.attempt}回目`)];
};

/**
 * 終わったら（宝が見えたら）通らなかった足跡も薄く見せるか。
 * チャレンジ（デイリーなど）は全員が同じ盤面で、負けても同じ盤面に再挑戦するので見せない
 */
const revealRoute = (actions: GameActions) => !actions.challenge;

/** チャレンジでクリアしたら、その盤面はもう遊べない */
const locked = (g: GameState, actions: GameActions) => !!actions.challenge && g.status === 'won';

/** main.css の PC レイアウトの @media と対応 */
const PC_QUERY = '(min-width: 1024px)';
const noop = () => {};
/** スマホでマスがこれ以上小さくなるなら explore 表示にする */
const MIN_FIT_PITCH = 30;
/** スマホの画面幅の上限（main.css の .game の max-width と対応） */
const MOBILE_MAX_W = 430;
/** 画面の左右余白 20px×2 */
const SCREEN_PAD_X = 40;
/** 盤面枠の縁と余白 (12 + 2)px×2 */
const PANEL_CHROME_X = 28;
/** 全体マップの一辺（px） */
const MINIMAP_PX_MOBILE = 126;
const MINIMAP_PX_PC = 264;
/** リプレイの一辺（px）。main.css の .replay__canvas の max-width と対応 */
const REPLAY_PX_MOBILE = 300;
const REPLAY_PX_PC = 258;
/** 上限歩数がこれ以上なら HUD の数字を小さくする（hud--long） */
const LONG_HUD_MOVES = 10000;

/** ゲーム画面。返り値の destroy で後片付けする */
export function gameScreen(root: HTMLElement, game: GameState, actions: GameActions, debug: boolean) {
  const pcMedia = window.matchMedia(PC_QUERY);
  let cleanup = noop;

  const render = () => {
    cleanup();
    root.replaceChildren();
    cleanup = pcMedia.matches ? renderPC(root, game, actions, debug) : renderMobile(root, game, actions, debug);
  };
  pcMedia.addEventListener('change', render);
  render();
  return () => {
    pcMedia.removeEventListener('change', render);
    cleanup();
  };
}

// ---------- 共通部品 ----------

function hud() {
  const left = h('span.hud__left');
  const max = h('span.hud__max');
  const fill = h('div.hud__fill');
  const el = h(
    'section.hud.paper',
    {},
    h('div.hud__row', {}, h('span.hud__label', {}, '残り体力'), h('span.hud__count', {}, left, max)),
    h('div.hud__bar', {}, fill),
  );
  const update = (g: GameState) => {
    el.classList.toggle('hud--long', g.maxMoves >= LONG_HUD_MOVES);
    left.textContent = String(g.movesLeft);
    max.textContent = `/ ${g.maxMoves}`;
    fill.style.width = `${(g.movesLeft / g.maxMoves) * 100}%`;
  };
  return { el, update };
}

/** マスのスタートからの相対位置（「右3・上2」など）。スタート地点なら空文字 */
function offsetLabel(board: GameState['board'], cell: number) {
  const { right, up } = offsetFromStart(board, cell);
  const parts: string[] = [];
  if (right) parts.push(`${right > 0 ? '右' : '左'}${Math.abs(right)}`);
  if (up) parts.push(`${up > 0 ? '上' : '下'}${Math.abs(up)}`);
  return parts.join('・');
}

/** 現在地の表示（スタートからの相対位置）。long で「スタートから」を付ける */
export function positionText(g: GameState, long: boolean) {
  const label = offsetLabel(g.board, g.pos);
  if (!label) return 'スタート地点';
  return (long ? 'スタートから ' : '') + label;
}

/** ゲームオーバーで見せる宝の位置（現在地バッジと同じくスタートから数える） */
export const treasureText = (g: GameState) => `宝は スタートから${offsetLabel(g.board, g.board.treasure)} にありました。`;

function positionBadge() {
  const value = h('span.pos-badge__value');
  const el = h('div.pos-badge', {}, h('span.pos-badge__label', {}, '現在地'), value);
  return { el, update: (g: GameState, long: boolean) => (value.textContent = positionText(g, long)) };
}

/** 倍率の表示。全体表示の極小倍率でも 0% にならないよう桁を増やす */
export const zoomText = (z: number) => (z >= 0.1 ? `${Math.round(z * 100)}%` : `${(z * 100).toFixed(z >= 0.01 ? 1 : 2)}%`);

function zoomControls(view: BoardView, vertical: boolean) {
  const level = h('span.zoom__level');
  const zoomIn = h('button.zoom__btn', { onclick: () => view.zoomBy(ZOOM_STEP), 'aria-label': '拡大' }, img(icons.iconZoomIn));
  const zoomOut = h('button.zoom__btn', { onclick: () => view.zoomBy(1 / ZOOM_STEP), 'aria-label': '縮小' }, img(icons.iconZoomOut));
  const divider = h('span.zoom__divider');
  let el: HTMLElement;
  if (vertical) {
    el = h(
      'div.zoom.zoom--vertical',
      {},
      zoomIn,
      level,
      zoomOut,
      divider,
      h('button.zoom__btn.zoom__btn--fit', { onclick: () => view.fitAll(), 'aria-label': '全体を表示' }, img(icons.iconFit)),
      h('button.zoom__btn.zoom__btn--dark', { onclick: () => view.recenter(), 'aria-label': '現在地へ' }, img(icons.iconRecenter)),
    );
  } else {
    el = h(
      'div.zoom.zoom--horizontal',
      {},
      zoomOut,
      level,
      zoomIn,
      divider,
      h('button.zoom__wide.zoom__wide--dark', { onclick: () => view.recenter() }, img(icons.iconRecenter), '現在地へ'),
      h('button.zoom__wide', { onclick: () => view.fitAll() }, img(icons.iconFit), '全体を表示'),
    );
  }
  // 大盤面の全体表示では 1% を切るので、小数で出す
  return { el, update: () => (level.textContent = zoomText(view.zoom)) };
}

/** 結果カード。replay を渡すと（PC 用に）カードの先頭にリプレイを入れる */
function resultCard(g: GameState, actions: GameActions, replay?: HTMLElement) {
  const won = g.status === 'won';
  const ch = actions.challenge;
  const again = ch
    ? won
      ? null
      : h('button.btn.btn--primary', { onclick: actions.restart }, 'もう一度挑戦')
    : h('button.btn.btn--primary', { onclick: actions.again }, 'もう一度');
  return h(
    'section.result-card.paper.paper--result',
    {},
    replay,
    h(`div.result-card__title${won ? '' : '.result-card__title--lost'}`, {}, won ? 'クリア！' : 'ゲームオーバー'),
    h(
      'div.result-card__msg',
      {},
      (ch ? `${ch.attempt}回目の挑戦、` : '') + (won ? `${movesUsed(g)}歩で宝を見つけました。` : '体力を使い切りました。'),
    ),
    won ? null : h('div.result-card__hint', {}, treasureText(g)),
    shareButtons(g, actions.shareUrl, ch),
    h(
      'div.result-card__actions',
      {},
      h('button.btn.btn--secondary', { onclick: actions.title }, 'タイトルへ'),
      again,
    ),
  );
}

/**
 * 「タイトルへ」: 途中まで遊んでいるときだけ確認する。label で文字付き（PC 用）にする。
 * チャレンジは自動セーブされて続きから遊べるので、確認しない
 */
function titleButton(g: GameState, actions: GameActions, label: boolean) {
  const onclick = () => {
    if (actions.challenge || g.status !== 'playing' || movesUsed(g) === 0) return actions.title();
    openConfirm({
      title: 'タイトルへもどりますか？',
      message: '遊んでいた地図は保存されません。',
      ok: 'タイトルへ',
      onOk: actions.title,
    });
  };
  return label
    ? h('button.pill.pill--title', { onclick }, img(icons.iconHome), 'タイトルへ')
    : h('button.icon-btn', { onclick, 'aria-label': 'タイトルへ' }, img(icons.iconHome));
}

/** 「やりなおす」: 途中まで遊んでいるときだけ確認する */
function resetButton(g: GameState, actions: GameActions) {
  const onclick = () => {
    if (g.status !== 'playing' || movesUsed(g) === 0) return actions.restart();
    openConfirm({
      title: 'やりなおしますか？',
      message: '同じ地図で、最初からやりなおします。',
      ok: 'やりなおす',
      onOk: actions.restart,
    });
  };
  return h('button.pill.pill--reset', { onclick }, 'やりなおす');
}

// ---------- チュートリアル ----------

/** 画面の部品を枠で囲み、真下から矢印で指す。返り値で元に戻す */
function pointAt(el: HTMLElement) {
  const pointer = h('span.tut-pointer', { 'aria-hidden': 'true' });
  el.classList.add('tut-focus');
  el.append(pointer);
  return () => {
    el.classList.remove('tut-focus');
    pointer.remove();
  };
}

/**
 * 盤面に重ねる説明（吹き出し）。次に 1 歩動くか、タップすると消える。
 * targets は focus で指す部品
 */
function bubbleLayer(host: HTMLElement, targets: { hud: HTMLElement }) {
  let el: HTMLElement | null = null;
  let unpoint = noop;
  const hide = () => {
    el?.remove();
    el = null;
    unpoint();
    unpoint = noop;
  };
  const show = (b: TutorialBubble | null) => {
    hide();
    if (!b) return;
    el = h('button.tut-bubble', { onclick: hide, 'aria-label': `${b.text}（タップで閉じる）` }, b.text);
    host.append(el);
    if (b.focus) unpoint = pointAt(targets[b.focus]);
  };
  return { show, hide };
}

/** チュートリアルの結果カード（十字キーの代わりに出す） */
function tutorialCard(r: TutorialResult, won: boolean) {
  return h(
    'section.result-card.paper.paper--result.tut-card',
    {},
    h(`div.result-card__title${won ? '' : '.result-card__title--lost'}`, {}, r.title),
    h('p.tut-card__body', {}, r.body),
    h(
      'div.result-card__actions',
      {},
      ...r.actions.map((a) => h(`button.btn.${a.primary ? 'btn--primary' : 'btn--secondary'}`, { onclick: a.onClick }, a.label)),
    ),
  );
}

/** 長押しで連続移動を始めるまでの時間 */
const REPEAT_DELAY_MS = 350;
/** 連続移動の間隔 */
const REPEAT_INTERVAL_MS = 90;

function dpad(onMove: (d: Exclude<Dir, 0>) => void) {
  const btn = (name: 'up' | 'down' | 'left' | 'right', d: Exclude<Dir, 0>) => {
    const b = dpadButton(name);
    let timer: number | undefined;
    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const repeat = () => {
      // 結果表示などでボタンが外れたら止める
      if (!b.isConnected) return stop();
      onMove(d);
      timer = window.setTimeout(repeat, REPEAT_INTERVAL_MS);
    };
    // 連打しやすいよう pointerdown で反応させ、押し続けている間は連続で動く
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
      onMove(d);
      timer = window.setTimeout(repeat, REPEAT_DELAY_MS);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(type, stop);
    return b;
  };
  return h(
    'div.dpad',
    {},
    btn('up', Dir.Up),
    btn('left', Dir.Left),
    btn('right', Dir.Right),
    btn('down', Dir.Down),
  );
}

/** キー入力に対応する操作。移動は向き、それ以外は操作名。修飾キー付きや対象外のキーは null */
export type KeyAction = Exclude<Dir, 0> | 'recenter' | 'fit' | 'zoomIn' | 'zoomOut';

const MOVE_KEYS: Record<string, Exclude<Dir, 0>> = {
  ArrowUp: Dir.Up, ArrowDown: Dir.Down, ArrowLeft: Dir.Left, ArrowRight: Dir.Right,
  w: Dir.Up, s: Dir.Down, a: Dir.Left, d: Dir.Right,
  W: Dir.Up, S: Dir.Down, A: Dir.Left, D: Dir.Right,
};

/** キーボードの割り当て（矢印・WASD で移動、Space で現在地へ、F で全体、＋ − で拡大・縮小） */
export function keyAction(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const d = MOVE_KEYS[e.key];
  if (d) return d;
  switch (e.key) {
    case ' ':
      return 'recenter';
    case 'f':
    case 'F':
      return 'fit';
    case '+':
    case '=':
    case ';':
      return 'zoomIn';
    case '-':
      return 'zoomOut';
    default:
      return null;
  }
}

/** 操作の共通処理: 移動・キー入力・終了時の表示切り替え */
function controller(
  game: GameState,
  view: BoardView,
  refresh: () => void,
  onEnd: () => void,
  onMove: () => void = noop,
  track = true,
) {
  const doMove = (d: Exclude<Dir, 0>) => {
    if (!move(game, d)) return;
    onMove();
    view.follow();
    refresh();
    if (game.status !== 'playing') {
      if (track) trackEnd(game);
      // 宝のマスを強調する演出が終わってから結果を出す（ゲームオーバーなら宝までカメラを動かす）
      view.playEndFx(game.status, onEnd);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (modalOpen() || e.target instanceof HTMLInputElement) return;
    const action = keyAction(e);
    if (action === null) return;
    if (typeof action === 'number') {
      e.preventDefault();
      doMove(action);
    } else if (action === 'recenter') {
      e.preventDefault();
      view.recenter();
    } else if (action === 'fit') {
      view.fitAll();
    } else {
      view.zoomBy(action === 'zoomIn' ? ZOOM_STEP : 1 / ZOOM_STEP);
    }
  };
  document.addEventListener('keydown', onKey);
  return { doMove, dispose: () => document.removeEventListener('keydown', onKey) };
}

// ---------- スマホ ----------

function renderMobile(root: HTMLElement, game: GameState, actions: GameActions, debug: boolean) {
  const size = game.board.size;
  const panelInner = Math.min(window.innerWidth, MOBILE_MAX_W) - SCREEN_PAD_X - PANEL_CHROME_X;
  const mode = panelInner / (size - GAP_RATIO) >= MIN_FIT_PITCH ? 'fit' : 'explore';

  const view = new BoardView(game, mode, debug);
  view.revealRoute = revealRoute(actions);
  const h1 = hud();
  const badge = positionBadge();
  const zoom = zoomControls(view, true);
  const minimap = mode === 'explore' ? new Minimap(game, view, MINIMAP_PX_MOBILE) : null;

  const tut = actions.tutorial;
  const home = titleButton(game, actions, false);
  const help = helpIconButton(openRules);
  const reset = resetButton(game, actions);
  // チュートリアルでは「やりなおす」を出さない
  const headerActions = h('div.header-actions', {}, home, help, tut ? null : reset);
  const panel = h(`section.board-panel.paper.paper--grid.board-panel--${mode}`, {}, view.el);
  panel.style.position = 'relative';
  if (mode === 'explore') panel.append(badge.el, zoom.el);
  const bubble = bubbleLayer(panel, { hud: h1.el });

  const bottom = h(`div.game__bottom${mode === 'explore' ? '.game__bottom--explore' : ''}`);
  const hint = h('p.game__hint', {}, 'PC では矢印キーでも移動できます');

  const refresh = () => {
    h1.update(game);
    badge.update(game, false);
  };
  view.onViewChange = () => {
    zoom.update();
    minimap?.draw();
  };

  let replay: ReturnType<typeof replayPlayer> | null = null;
  const showControls = (justEnded = false) => {
    bottom.replaceChildren();
    if (game.status !== 'playing' && tut) {
      // チュートリアルは盤面を残したまま、十字キーの場所にカードを出す
      bubble.hide();
      const r = tut.result(game);
      bottom.append(tutorialCard(r, game.status === 'won'));
      if (r.focus === 'help') pointAt(help);
      hint.remove();
      return;
    }
    if (game.status !== 'playing') {
      // 結果カードに「タイトルへ」と「あそびかた」の代わりがあるので、ヘッダーからは外す
      home.remove();
      help.remove();
      if (locked(game, actions)) reset.remove();
      // 盤面の枠をリプレイ（GIF と同じ絵）に差し替える。終わった直後は自動で 1 回再生する
      replay = replayPlayer(game, REPLAY_PX_MOBILE, { autoplay: justEnded, revealRoute: revealRoute(actions) });
      panel.className = 'board-panel paper paper--grid board-panel--replay';
      panel.replaceChildren(replay.el);
      bottom.append(resultCard(game, actions));
      hint.remove();
      return;
    }
    if (minimap) {
      bottom.append(
        h('div.minimap-card.paper', {}, h('div.minimap-card__title', {}, '全体マップ'), minimap.canvas),
        dpad(ctrl.doMove),
      );
    } else {
      bottom.append(dpad(ctrl.doMove));
    }
  };
  const onMove = () => {
    actions.onMove?.();
    if (tut) bubble.show(game.status === 'playing' ? tut.bubble(game) : null);
  };
  const ctrl = controller(game, view, refresh, () => showControls(true), onMove, !tut);

  root.append(
    h(
      'main.screen.game',
      {},
      h(
        'header.game__header',
        {},
        h('div.board-info', {}, h('div.board-info__title', {}, 'BEYOND THE FOOTPRINTS'), h('div.board-info__sub', {}, ...boardTitle(game, actions))),
        headerActions,
      ),
      h1.el,
      panel,
      bottom,
      mode === 'fit' ? hint : null,
    ),
  );
  showControls();
  refresh();
  view.recenter();
  if (tut && game.status === 'playing') bubble.show(tut.bubble(game));
  return () => {
    ctrl.dispose();
    view.destroy();
    replay?.dispose();
  };
}

// ---------- PC ----------

const key = (k: string, label: string) => h('div.keys__row', {}, h('span.key', {}, k), h('span', {}, label));

function renderPC(root: HTMLElement, game: GameState, actions: GameActions, debug: boolean) {
  const view = new BoardView(game, 'explore', debug);
  view.revealRoute = revealRoute(actions);
  const h1 = hud();
  const badge = positionBadge();
  const zoom = zoomControls(view, false);
  const minimap = new Minimap(game, view, MINIMAP_PX_PC);

  const panel = h('section.board-panel.paper.paper--grid', {}, view.el, badge.el, zoom.el);

  const refresh = () => {
    h1.update(game);
    badge.update(game, true);
  };
  view.onViewChange = () => {
    zoom.update();
    minimap.draw();
  };
  let replay: ReturnType<typeof replayPlayer> | null = null;
  const tut = actions.tutorial;
  const reset = resetButton(game, actions);
  const help = helpLabelButton(openRules);
  const bubble = bubbleLayer(panel, { hud: h1.el });
  const onEnd = (justEnded = false) => {
    if (tut) {
      bubble.hide();
      const r = tut.result(game);
      // 盤面に重ねると宝の位置が隠れるので、サイドバーの残り体力の下に出す
      h1.el.after(tutorialCard(r, game.status === 'won'));
      if (r.focus === 'help') pointAt(help);
      return;
    }
    if (locked(game, actions)) reset.remove();
    replay = replayPlayer(game, REPLAY_PX_PC, { autoplay: justEnded, revealRoute: revealRoute(actions) });
    panel.append(resultCard(game, actions, replay.el));
  };
  const onMove = () => {
    actions.onMove?.();
    if (tut) bubble.show(game.status === 'playing' ? tut.bubble(game) : null);
  };
  const ctrl = controller(game, view, refresh, () => onEnd(true), onMove, !tut);

  root.append(
    h(
      'main.screen.game.game--pc',
      {},
      h(
        'aside.sidebar',
        {},
        h('div', {}, h('div.sidebar__title', {}, 'BEYOND THE', h('br'), 'FOOTPRINTS'), h('div.sidebar__sub', {}, ...boardTitle(game, actions))),
        h('div.actions', {}, help, tut ? null : reset, titleButton(game, actions, true)),
        h1.el,
        h(
          'section.side-card.paper',
          {},
          h('div.side-card__head', {}, h('span', {}, '全体マップ'), h('small', {}, 'クリック・ドラッグで移動')),
          minimap.canvas,
          h(
            'div.legend',
            {},
            h('span', {}, h('i.legend__rect'), '表示中の範囲'),
            h('span', {}, h('i.legend__dot'), 'スタート'),
          ),
        ),
        h(
          'section.side-card.paper',
          {},
          h('div.side-card__head', {}, h('span', {}, '操作')),
          h(
            'div.keys',
            {},
            key('矢印キー / WASD', '移動'),
            key('ドラッグ', 'スクロール'),
            key('ホイール / ＋ −', '拡大・縮小'),
            key('Space', '現在地へもどる'),
            key('F', '全体を表示'),
          ),
        ),
      ),
      panel,
    ),
  );
  refresh();
  view.recenter();
  if (game.status !== 'playing') onEnd();
  else if (tut) bubble.show(tut.bubble(game));
  return () => {
    ctrl.dispose();
    view.destroy();
    replay?.dispose();
  };
}
