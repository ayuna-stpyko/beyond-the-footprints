/**
 * チュートリアルの文言と進行（Figma「チュートリアル遷移」ページ）。
 * 解き方は教えない。ルールの事実だけを伝えて、近道は自分で見つけてもらう。
 */
import { type GameState, movesUsed } from '../core/game';
import { TUTORIAL_STAGES, type TutorialStage } from '../core/tutorial';
import { Dir } from '../core/types';

/** 盤面に重ねる説明。focus で画面の部品を矢印で指す */
export interface TutorialBubble {
  text: string;
  focus?: 'hud';
}

export interface TutorialResult {
  title: string;
  body: string;
  /** 結果カードを出している間、画面の部品を矢印で指す */
  focus?: 'help';
  actions: { label: string; primary: boolean; onClick: () => void }[];
}

/** ゲーム画面に渡すチュートリアルの中身 */
export interface TutorialHooks {
  heading: string;
  /**
   * 盤面に重ねる説明。開始時と 1 歩ごとに呼ぶ。null なら出さない。
   * 出した説明は、次に 1 歩動くか、タップすると消える
   */
  bubble: (g: GameState) => TutorialBubble | null;
  /** クリア・ゲームオーバーで十字キーの代わりに出すカード */
  result: (g: GameState) => TutorialResult;
}

export interface TutorialNav {
  /** 次のステージへ */
  next: () => void;
  /** 同じステージを（ステージ3なら別の地図で）もう一度 */
  retry: () => void;
  title: () => void;
  /** 通常のゲームへ（サイズ選択） */
  play: () => void;
}

/** 体力が残りこれだけになったら一言出す（ステージ2） */
const LOW_MOVES = 10;

const LOST_TITLE = '体力が尽きた';
const FOUND_TITLE = '宝を見つけた！';

export function tutorialHooks(stage: TutorialStage, nav: TutorialNav): TutorialHooks {
  const heading = `チュートリアル ${stage} / ${TUTORIAL_STAGES}`;
  const next = { label: '次へ', primary: true, onClick: nav.next };
  switch (stage) {
    case 1: {
      let nothingShown = false;
      return {
        heading,
        bubble: (g) => {
          const used = movesUsed(g);
          if (used === 0) return { text: '古い地図のまんなかに立っています。むかしの探検家も、ここから上へ歩き出したようです。上へ 1 歩進んでみよう。' };
          if (used === 1 && g.board.dirs[g.pos] !== Dir.None) {
            return { text: '踏んだマスに、探検家の足跡（矢印）が見えました。探検家はこの向きに進んだようです。宝が見つかるまで足跡をたどってみよう。' };
          }
          if (!nothingShown && g.board.dirs[g.pos] === Dir.None) {
            nothingShown = true;
            return { text: 'ここには足跡がありません。探検家はここを通らなかったようです。' };
          }
          return null;
        },
        result: (g) =>
          g.status === 'won'
            ? {
                title: FOUND_TITLE,
                // PC では ？ が左上（「あそびかた」）にあるので、場所は言わずに矢印で指す
                body: '探検家の足跡は宝まで続いています。\nルールを忘れたときは、？ のボタンからいつでも確かめられます。',
                focus: 'help',
                actions: [next],
              }
            : { title: LOST_TITLE, body: 'もう一度、足跡をたどってみよう。', actions: [{ label: 'もう一度', primary: true, onClick: nav.retry }] },
      };
    }
    case 2:
      return {
        heading,
        bubble: (g) => {
          if (movesUsed(g) === 0) return { text: `別の地図を見つけました。今度は残り体力に注意しましょう。あと${g.maxMoves}回移動することができます。`, focus: 'hud' };
          if (g.movesLeft === LOW_MOVES) return { text: '体力が残り少なくなってきた……' };
          return null;
        },
        result: (g) =>
          g.status === 'won'
            ? {
                title: FOUND_TITLE,
                body: `じつは探検家の足跡どおりに歩くと ${g.board.length - 1} 歩かかる道でした。足跡どおりに歩いていては間に合いません。`,
                actions: [next],
              }
            : {
                title: LOST_TITLE,
                body: `探検家は ${g.board.length - 1} 歩もかけて遠回りしていたようです。足跡に従って歩いても間に合いません。近道を探そう。`,
                actions: [next],
              },
      };
    default:
      // ステージ3
      return {
        heading,
        bubble: (g) =>
          movesUsed(g) === 0
            ? { text: `別の地図を見つけました。足跡を手がかりに、今度は足跡通りに通らなくてもいいので${g.maxMoves} 歩以内で宝を見つけよう。` }
            : null,
        result: (g) =>
          g.status === 'won'
            ? {
                title: '近道を見つけた！',
                body: 'もっと大きい地図でもやってみよう！',
                actions: [
                  { label: 'タイトルへ', primary: false, onClick: nav.title },
                  { label: '遊んでみる', primary: true, onClick: nav.play },
                ],
              }
            : { title: LOST_TITLE, body: '別の地図でもう一度挑戦しよう。', actions: [{ label: '別の地図で挑戦', primary: true, onClick: nav.retry }] },
      };
  }
}
