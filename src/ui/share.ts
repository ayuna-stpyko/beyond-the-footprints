import { type GameState, movesUsed } from '../core/game';
import { h } from './dom';
import { makeReplayGif } from './gif';

/** ダウンロードが始まってから GIF の URL を解放するまでの待ち時間 */
const REVOKE_DELAY_MS = 1000;

export function shareText(game: GameState, url: string) {
  const { n, size } = game.board;
  const head = `BEYOND THE FOOTPRINTS N=${n}（${size}×${size}）`;
  const body =
    game.status === 'won'
      ? `${movesUsed(game)}歩で宝を発見！`
      : `宝にたどりつけず…`;
  return `${head}\n${body}\n#BeyondTheFootprints\n${url}`;
}

/** 結果カードの「Xでシェア」「GIFを保存」 */
export function shareButtons(game: GameState, url: string) {
  const shareToX = () => {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText(game, url))}`, '_blank', 'noopener');
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
