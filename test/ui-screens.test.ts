// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modalOpen, openConfirm } from '../src/ui/screens/confirm';
import { genErrorScreen } from '../src/ui/screens/genError';
import { nInputScreen } from '../src/ui/screens/nInput';
import { openRules } from '../src/ui/screens/rules';
import { titleScreen } from '../src/ui/screens/title';
import { pressKey, setupDom } from './helpers/dom';

/** セレクタに一致する要素を取り出す。なければテスト失敗 */
function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`not found: ${sel}`);
  return el;
}

/** 表示テキストでボタンを探す */
function button(text: string, root: ParentNode = document): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`button not found: ${text}`);
  return b;
}

afterEach(() => {
  // 開いたままのモーダルを閉じる（rules.ts はモジュール内に開閉状態を持つため）
  while (modalOpen()) {
    const before = document.querySelectorAll('.overlay').length;
    pressKey('Escape');
    if (document.querySelectorAll('.overlay').length === before) break;
  }
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('nInputScreen', () => {
  let play: ReturnType<typeof vi.fn<(n: number) => void>>;
  let back: ReturnType<typeof vi.fn<() => void>>;

  /** 画面を作って body に置き、入力欄などを返す */
  function mount(initial = 3) {
    play = vi.fn<(n: number) => void>();
    back = vi.fn<() => void>();
    const screen = nInputScreen(initial, { play, back });
    document.body.append(screen);
    const input = screen.querySelector('input');
    if (!input) throw new Error('input not found');
    const start = button('ゲーム開始', screen);
    const type = (v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    return {
      screen,
      input,
      start,
      type,
      hint: () => $('.n-input__hint', screen).textContent,
      error: () => $('.n-card__error', screen).textContent,
      field: $('.n-input', screen),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setupDom({ pc: true });
  });

  it('shows the initial value and the board size hint', () => {
    const s = mount(3);
    expect(s.input.value).toBe('3');
    expect(s.hint()).toBe('→ 7 × 7 マス');
    expect(s.error()).toBe('');
    expect(s.start.disabled).toBe(false);
    expect(s.field.classList.contains('n-input--error')).toBe(false);
  });

  it('updates the hint as the value changes', () => {
    const s = mount(3);
    s.type('10');
    expect(s.hint()).toBe('→ 21 × 21 マス');
  });

  it.each(['0', 'abc', '2001', '-1', '1.5'])('rejects %j', (v) => {
    const s = mount(3);
    s.type(v);
    expect(s.start.disabled).toBe(true);
    expect(s.error()).toBe('1〜2000 の整数を入力してください');
    expect(s.field.classList.contains('n-input--error')).toBe(true);
    expect(s.hint()).toBe('');
  });

  it('accepts the PC upper bound 2000', () => {
    const s = mount(3);
    s.type('2000');
    expect(s.start.disabled).toBe(false);
    expect(s.error()).toBe('');
  });

  it('disables the button without an error message when empty', () => {
    const s = mount(3);
    s.type('');
    expect(s.start.disabled).toBe(true);
    expect(s.error()).toBe('');
    expect(s.hint()).toBe('');
  });

  it('accepts full-width digits', () => {
    const s = mount(3);
    s.type('５');
    expect(s.start.disabled).toBe(false);
    expect(s.hint()).toBe('→ 11 × 11 マス');
    s.start.click();
    expect(play).toHaveBeenCalledWith(5);
  });

  it('calls play with the parsed number on Enter', () => {
    const s = mount(3);
    s.type(' 12 ');
    pressKey('Enter', {}, s.input);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(12);
  });

  it('calls play when the start button is clicked', () => {
    const s = mount(4);
    s.start.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(4);
  });

  it('ignores keys other than Enter', () => {
    const s = mount(3);
    pressKey('a', {}, s.input);
    expect(play).not.toHaveBeenCalled();
  });

  it('never calls play with invalid input', () => {
    const s = mount(3);
    for (const v of ['', '0', 'abc', '2001']) {
      s.type(v);
      pressKey('Enter', {}, s.input);
      // disabled でも click() は呼べてしまうので、submit 側の検証も確かめる
      s.start.disabled = false;
      s.start.click();
    }
    expect(play).not.toHaveBeenCalled();
  });

  it('calls back from the もどる button', () => {
    const s = mount(3);
    button('もどる', s.screen).click();
    expect(back).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('focuses the input after timers run', () => {
    const s = mount(3);
    expect(document.activeElement).not.toBe(s.input);
    vi.runAllTimers();
    expect(document.activeElement).toBe(s.input);
  });

  it('limits N to 200 on mobile', () => {
    vi.restoreAllMocks();
    setupDom({ mobile: true });
    const s = mount(3);
    s.type('200');
    expect(s.start.disabled).toBe(false);
    s.type('201');
    expect(s.start.disabled).toBe(true);
    expect(s.error()).toContain('スマホ');
    expect(s.error()).toContain('200');
    expect(s.error()).toBe('1〜200 の整数を入力してください（スマホでは 200 まで）');
    pressKey('Enter', {}, s.input);
    expect(play).not.toHaveBeenCalled();
  });
});

describe('openConfirm', () => {
  let onOk: ReturnType<typeof vi.fn<() => void>>;

  const open = (cancel?: string) => {
    onOk = vi.fn<() => void>();
    openConfirm({ title: '確認', message: 'やめますか？', ok: 'やめる', cancel, onOk });
  };

  beforeEach(() => {
    setupDom();
  });

  it('opens an alertdialog and focuses the OK button', () => {
    expect(modalOpen()).toBe(false);
    open();
    expect(modalOpen()).toBe(true);
    const overlay = $('.overlay');
    const dialog = $('[role="alertdialog"]', overlay);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('確認');
    expect($('.confirm__msg', dialog).textContent).toBe('やめますか？');
    expect(document.activeElement).toBe(button('やめる'));
    expect(button('キャンセル')).toBeTruthy();
  });

  it('closes and calls onOk once on OK', () => {
    open();
    button('やめる').click();
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(modalOpen()).toBe(false);
  });

  it('closes without onOk on cancel', () => {
    open();
    button('キャンセル').click();
    expect(onOk).not.toHaveBeenCalled();
    expect(modalOpen()).toBe(false);
  });

  it('closes without onOk on Escape', () => {
    open();
    pressKey('Escape', {}, document.body);
    expect(onOk).not.toHaveBeenCalled();
    expect(modalOpen()).toBe(false);
  });

  it('closes on a background click but not on a click inside the modal', () => {
    open();
    $('.confirm__msg').click();
    $('.confirm').click();
    expect(modalOpen()).toBe(true);
    $('.overlay').click();
    expect(modalOpen()).toBe(false);
    expect(onOk).not.toHaveBeenCalled();
  });

  it('ignores a second openConfirm while one is open', () => {
    open();
    const second = vi.fn<() => void>();
    openConfirm({ title: '2つ目', message: '', ok: 'OK2', onOk: second });
    expect(document.querySelectorAll('.overlay').length).toBe(1);
    expect($('[role="alertdialog"]').getAttribute('aria-label')).toBe('確認');
    button('やめる').click();
    expect(second).not.toHaveBeenCalled();
  });

  it('uses a custom cancel label', () => {
    open('つづける');
    expect(button('つづける')).toBeTruthy();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'キャンセル')).toBe(false);
    button('つづける').click();
    expect(modalOpen()).toBe(false);
  });

  it('keeps keys from the game while open and lets them through after closing', () => {
    // ゲームと同じく document のバブリング段階で聞くリスナー
    const gameKeys: string[] = [];
    const listener = (e: KeyboardEvent) => gameKeys.push(e.key);
    document.addEventListener('keydown', listener);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    try {
      open();
      // 実際のキー入力はフォーカス中の要素（ここでは OK ボタン）か body に届く
      pressKey('ArrowUp', {}, document.body);
      pressKey('ArrowLeft', {}, button('やめる'));
      expect(gameKeys).toEqual([]);
      expect(modalOpen()).toBe(true);

      pressKey('Escape', {}, document.body);
      expect(gameKeys).toEqual([]);
      expect(modalOpen()).toBe(false);
      // capture 付きで登録したリスナーが外れている
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

      pressKey('ArrowDown', {}, document.body);
      pressKey('ArrowRight');
      expect(gameKeys).toEqual(['ArrowDown', 'ArrowRight']);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('removes its key listener so later Escapes do nothing', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    open();
    const added = addSpy.mock.calls.find((c) => c[0] === 'keydown');
    expect(added?.[2]).toBe(true);
    button('キャンセル').click();
    const removed = removeSpy.mock.calls.find((c) => c[0] === 'keydown');
    expect(removed?.[1]).toBe(added?.[1]);
    expect(removed?.[2]).toBe(true);
  });
});

describe('openRules', () => {
  beforeEach(() => {
    setupDom();
  });

  it('opens a dialog and reflects it in modalOpen', () => {
    openRules();
    expect(modalOpen()).toBe(true);
    const dialog = $('.overlay [role="dialog"]');
    expect(dialog.getAttribute('aria-label')).toBe('あそびかた');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('opens only once while open', () => {
    openRules();
    openRules();
    expect(document.querySelectorAll('.overlay').length).toBe(1);
  });

  it('closes on Escape', () => {
    openRules();
    pressKey('Escape');
    expect(modalOpen()).toBe(false);
  });

  it('ignores keys other than Escape', () => {
    openRules();
    pressKey('Enter');
    pressKey('ArrowUp');
    expect(modalOpen()).toBe(true);
  });

  it('closes from the close button', () => {
    openRules();
    $('.rules__close').click();
    expect(modalOpen()).toBe(false);
  });

  it('closes from the わかった button', () => {
    openRules();
    button('わかった').click();
    expect(modalOpen()).toBe(false);
  });

  it('closes on a background click but not on a click inside', () => {
    openRules();
    $('.rules').click();
    $('.story').click();
    expect(modalOpen()).toBe(true);
    $('.overlay').click();
    expect(modalOpen()).toBe(false);
  });

  it('can be reopened after closing and removes its key listener', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    openRules();
    const added = addSpy.mock.calls.find((c) => c[0] === 'keydown');
    pressKey('Escape');
    const removed = removeSpy.mock.calls.find((c) => c[0] === 'keydown');
    expect(added).toBeDefined();
    expect(removed?.[1]).toBe(added?.[1]);

    // 閉じたあとに開き直せる
    openRules();
    expect(modalOpen()).toBe(true);
    expect(document.querySelectorAll('.overlay').length).toBe(1);
  });

  it('prevents openConfirm from opening on top of it', () => {
    openRules();
    const onOk = vi.fn<() => void>();
    // あそびかたが開いている間は確認モーダルを開かない
    openConfirm({ title: 't', message: 'm', ok: 'ok', onOk });
    expect(document.querySelectorAll('.overlay').length).toBe(1);
    expect(document.querySelector('.confirm')).toBeNull();
  });
});

describe('titleScreen', () => {
  beforeEach(() => {
    setupDom();
  });

  it('wires スタート and あそびかた to their actions', () => {
    const start = vi.fn<() => void>();
    const rules = vi.fn<() => void>();
    const screen = titleScreen({ start, rules, challenge: () => {} });
    document.body.append(screen);
    button('スタート', screen).click();
    expect(start).toHaveBeenCalledTimes(1);
    expect(rules).not.toHaveBeenCalled();
    $('button[aria-label="あそびかた"]', screen).click();
    expect(rules).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('draws a 5x5 decorative grid with one treasure and one player', () => {
    const screen = titleScreen({ start: () => {}, rules: () => {}, challenge: () => {} });
    expect(screen.querySelectorAll('.mini-grid__row').length).toBe(5);
    expect(screen.querySelectorAll('.mini-grid .cell').length).toBe(25);
    expect(screen.querySelectorAll('.cell--treasure').length).toBe(1);
    expect(screen.querySelectorAll('.cell--player').length).toBe(1);
  });
});

describe('genErrorScreen', () => {
  beforeEach(() => {
    setupDom();
  });

  it('shows N and the board size in its message', () => {
    const screen = genErrorScreen(5, { retry: () => {}, changeN: () => {}, title: () => {} });
    expect($('[role="alert"]', screen)).toBeTruthy();
    expect($('.n-card__desc', screen).textContent).toContain('N = 5（11 × 11）');
  });

  it.each([
    ['もう一度', 'retry'],
    ['N を変える', 'changeN'],
    ['タイトルへ', 'title'],
  ] as const)('%s calls %s', (label, key) => {
    const actions = { retry: vi.fn<() => void>(), changeN: vi.fn<() => void>(), title: vi.fn<() => void>() };
    const screen = genErrorScreen(5, actions);
    document.body.append(screen);
    button(label, screen).click();
    for (const k of ['retry', 'changeN', 'title'] as const) {
      expect(actions[k]).toHaveBeenCalledTimes(k === key ? 1 : 0);
    }
  });
});
