import { type GameState, movesUsed } from '../core/game';
import { h } from './dom';
import { makeReplayGif } from './gif';

/** ダウンロードが始まってから GIF の URL を解放するまでの待ち時間 */
const REVOKE_DELAY_MS = 1000;

/** チャレンジの表示情報 */
export interface ChallengeInfo {
  /** 「デイリー 2026/10/21」のような期間の名前（シェア用） */
  title: string;
  /** 「デイリー 10/21」のような短い期間の名前（ゲーム画面の見出し用） */
  heading: string;
  /** 何回目の挑戦か */
  attempt: number;
}

export function shareText(game: GameState, url: string, challenge?: ChallengeInfo) {
  const { n, size } = game.board;
  const won = game.status === 'won';
  let head: string;
  let body: string;
  if (challenge) {
    head = `BEYOND THE FOOTPRINTS ${challenge.title}`;
    body = won
      ? `${challenge.attempt}回目で発見！ ${movesUsed(game)}/${game.maxMoves}歩`
      : `${challenge.attempt}回目の挑戦、宝にたどりつけず…`;
  } else {
    head = `BEYOND THE FOOTPRINTS N=${n}（${size}×${size}）`;
    body = won ? `${movesUsed(game)}歩で宝を発見！` : `宝にたどりつけず…`;
  }
  return `${head}\n${body}\n#BeyondTheFootprints\n${url}`;
}

/** 結果カードの「Xでシェア」「GIFを保存」 */
export function shareButtons(game: GameState, url: string, challenge?: ChallengeInfo) {
  const shareToX = () => {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText(game, url, challenge))}`, '_blank', 'noopener');
  };
  let gifCache: Blob | null = null;
  const saveGif = () => {
    gifCache ??= makeReplayGif(game);
    const a = h('a', { href: URL.createObjectURL(gifCache), download: `beyond-footprints-n${game.board.n}.gif` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), REVOKE_DELAY_MS);
  };
  return h(
    'div.share-row',
    {},
    h('button.btn.btn--primary.btn--small', { onclick: shareToX }, 'Xでシェア'),
    h('button.btn.btn--secondary.btn--small', { onclick: saveGif }, 'GIFを保存'),
  );
}
