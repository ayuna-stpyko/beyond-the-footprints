import { h } from '../dom';

/** モーダル（あそびかた・確認）が開いているか。開いている間はゲームのキー操作を止める */
export const modalOpen = () => document.querySelector('.overlay') !== null;

/** 確認モーダル。OK なら onOk を呼ぶ。Esc・背景クリック・キャンセルで閉じる */
export function openConfirm(opts: { title: string; message: string; ok: string; cancel?: string; onOk: () => void }) {
  if (modalOpen()) return;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    // ゲームの矢印キー操作などに渡さない
    e.stopPropagation();
    if (e.key === 'Escape') close();
  };
  const okBtn = h('button.btn.btn--primary', {
    onclick: () => {
      close();
      opts.onOk();
    },
  }, opts.ok);
  const modal = h(
    'div.confirm.paper.paper--modal',
    { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': opts.title },
    h('div.confirm__title', {}, opts.title),
    h('p.confirm__msg', {}, opts.message),
    h(
      'div.confirm__actions',
      {},
      h('button.btn.btn--secondary', { onclick: close }, opts.cancel ?? 'キャンセル'),
      okBtn,
    ),
  );
  const overlay = h('div.overlay', {
    onclick: (e: Event) => {
      if (e.target === overlay) close();
    },
  }, modal);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  okBtn.focus();
}
