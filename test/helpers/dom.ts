import { vi } from 'vitest';

/**
 * DOM テスト用の共通の下準備。各テストファイルの先頭で
 * `// @vitest-environment happy-dom` を書き、beforeEach で setupDom() を呼ぶ。
 */

/** happy-dom は canvas 2D を実装していないので、何もしない描画コンテキストを返す */
export function stubCanvas() {
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => (key === 'canvas' ? undefined : () => ({ data: new Uint8ClampedArray(4) })),
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => ctx as unknown as CanvasRenderingContext2D,
  );
}

/** matchMedia を固定する。mobile: スマホ判定（hover: none / pointer: coarse）、pc: 幅 1024px 以上 */
export function mockMedia(opts: { mobile?: boolean; pc?: boolean } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const matches = query.includes('pointer: coarse') ? !!opts.mobile : query.includes('min-width: 1024px') ? !!opts.pc : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

export function setupDom(media: { mobile?: boolean; pc?: boolean } = {}) {
  document.body.replaceChildren();
  stubCanvas();
  mockMedia(media);
}

/** document にキー入力を送る */
export function pressKey(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}
