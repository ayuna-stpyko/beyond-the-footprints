import { readFile } from 'node:fs/promises';
import { type Page, test as base, expect } from '@playwright/test';
import { generateBoard } from '../src/core/generate';
import { moveLimit } from '../src/core/game';
import type { Board } from '../src/core/types';
import { GameInteractor, type Interactor, solve } from '../scripts/solve';

/** Dir（1↑ 2→ 3↓ 4←）に対応するキー */
const KEYS = ['', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] as const;

/**
 * 盤面をブラウザと同じ (n, seed) で Node 側でも作り、ソルバーで勝ち筋を求める。
 * ブラウザでこの手順どおりに動いて勝てれば、共有リンクの盤面が再現できていることにもなる。
 */
function winningMoves(n: number, seed: number): { board: Board; dirs: (1 | 2 | 3 | 4)[] } {
  const board = generateBoard(n, seed);
  const game = new GameInteractor(board);
  const dirs: (1 | 2 | 3 | 4)[] = [];
  const recorder: Interactor = {
    n,
    move: (d) => {
      dirs.push(d);
      return game.move(d);
    },
  };
  const r = solve(recorder, { maxMoves: moveLimit(n) });
  if (!r.won) throw new Error(`solver cannot win n=${n} seed=${seed}; pick another seed`);
  return { board, dirs };
}

/** 盤面の生成が終わってゲーム画面が出るまで待つ */
async function openBoard(page: Page, n: number, seed: number) {
  await page.goto(`?n=${n}&seed=${seed}`);
  await expect(page.locator('.hud__left')).toHaveText(String(moveLimit(n)), { timeout: 30_000 });
}

const hudLeft = (page: Page) => page.locator('.hud__left');

// どのテストでも、ページ内の未処理の例外やコンソールエラーがないこと
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await use(page);
    expect(errors).toEqual([]);
  },
});

test('starts a game from the title screen', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'スタート' }).click();
  const input = page.getByRole('textbox', { name: 'N の値' });
  await input.fill('4');
  await expect(page.getByText('→ 9 × 9 マス')).toBeVisible();
  await page.getByRole('button', { name: 'ゲーム開始' }).click();
  await expect(hudLeft(page)).toHaveText('48', { timeout: 30_000 });
  await expect(page.getByText('N = 4（9 × 9')).toBeVisible();
});

test('wins a shared board by following the solver, then shares and saves a GIF', async ({ page }) => {
  const n = 5;
  const seed = 1;
  const { dirs } = winningMoves(n, seed);
  await openBoard(page, n, seed);

  // キー入力は順番どおりに送る必要がある
  // oxlint-disable-next-line no-await-in-loop
  for (const d of dirs) await page.keyboard.press(KEYS[d]);

  await expect(page.locator('.result-card__title')).toHaveText('クリア！');
  await expect(page.getByText(`${dirs.length}歩で宝を見つけました。`)).toBeVisible();
  // 終わった直後はリプレイが自動再生される（約 6 秒）
  await expect(page.locator('.playback__label')).toHaveText(`${dirs.length} / ${dirs.length}歩`, { timeout: 10_000 });

  // 共有リンクは同じ盤面を指す
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Xでシェア' }).click();
  const popup = await popupPromise;
  const text = new URL(popup.url()).searchParams.get('text') ?? '';
  expect(text).toContain(`${dirs.length}歩で宝を発見！`);
  expect(text).toContain(`?n=${n}&seed=${seed}`);
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GIFを保存' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`beyond-footprints-n${n}.gif`);
  const gif = await readFile(await download.path());
  expect(gif.subarray(0, 6).toString('latin1')).toBe('GIF89a');
});

test('loses after using every move', async ({ page }) => {
  const n = 5;
  const seed = 1;
  const { board } = winningMoves(n, seed);
  // 宝が中央の行にない盤面なので、中央の行を左右に往復すれば必ず負ける
  expect(Math.floor(board.treasure / board.size)).not.toBe(n);
  await openBoard(page, n, seed);

  // oxlint-disable-next-line no-await-in-loop
  for (let i = 0; i < moveLimit(n); i++) await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');

  await expect(page.locator('.result-card__title')).toHaveText('ゲームオーバー');
  await expect(page.getByText('歩数を使い切りました。')).toBeVisible();
  // 終わったあとのキー入力では何も変わらない
  await page.keyboard.press('ArrowUp');
  await expect(hudLeft(page)).toHaveText('0');
});

test('restarting after a move asks for confirmation', async ({ page }) => {
  await openBoard(page, 5, 1);
  await page.keyboard.press('ArrowUp');
  await expect(hudLeft(page)).toHaveText('59');
  await page.getByRole('button', { name: 'やりなおす' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'やりなおしますか？' });
  await expect(dialog).toBeVisible();
  // ダイアログが開いている間はキーでは動かない
  await page.keyboard.press('ArrowUp');
  await expect(hudLeft(page)).toHaveText('59');
  await dialog.getByRole('button', { name: 'やりなおす' }).click();
  await expect(dialog).toBeHidden();
  await expect(hudLeft(page)).toHaveText('60');
});

test.describe('pc layout', () => {
  test.skip(({ isMobile }) => isMobile, 'PC only');

  test('shows the sidebar, minimap and position badge', async ({ page }) => {
    await openBoard(page, 5, 1);
    await expect(page.locator('.game--pc .sidebar')).toBeVisible();
    await expect(page.locator('.side-card canvas')).toBeVisible();
    await expect(page.locator('.dpad')).toHaveCount(0);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.pos-badge__value')).toHaveText('スタートから 上1');
  });

  test('generates a large board in the worker without freezing the page', async ({ page }) => {
    await openBoard(page, 500, 7);
    await expect(page.getByText('N = 500（1001 × 1001 マス）')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(hudLeft(page)).toHaveText(String(moveLimit(500) - 1));
  });
});

test.describe('mobile layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('small boards fit the panel and move with the d-pad', async ({ page }) => {
    await openBoard(page, 5, 1);
    await expect(page.locator('.board-panel--fit')).toBeVisible();
    await expect(page.locator('.minimap-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'up', exact: true }).tap();
    await expect(hudLeft(page)).toHaveText('59');
  });

  test('large boards switch to explore mode with a minimap', async ({ page }) => {
    await openBoard(page, 50, 1);
    await expect(page.locator('.board-panel--explore')).toBeVisible();
    await expect(page.locator('.minimap-card')).toBeVisible();
    await page.getByRole('button', { name: 'right', exact: true }).tap();
    await expect(page.locator('.pos-badge__value')).toHaveText('右1');
  });

  test('limits N to 200 on phones', async ({ page }) => {
    await page.goto('');
    await page.getByRole('button', { name: 'スタート' }).click();
    await page.getByRole('textbox', { name: 'N の値' }).fill('201');
    await expect(page.getByText('（スマホでは 200 まで）')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ゲーム開始' })).toBeDisabled();
  });
});
