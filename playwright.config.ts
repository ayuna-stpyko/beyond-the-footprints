import { defineConfig, devices } from '@playwright/test';

/** E2E 用のプレビューサーバーのポート（開発サーバーとぶつからない番号） */
const PORT = 4179;
/** vite.config.ts の base と同じ（GitHub Pages のリポジトリ名） */
const BASE_PATH = '/beyond-the-footprints/';

export default defineConfig({
  testDir: 'e2e',
  // Vitest に拾われないよう、*.test.ts / *.spec.ts ではなく *.e2e.ts にする
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pc', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Pixel 7 は Chromium で動く。hover: none / pointer: coarse になるのでスマホ判定（N の上限 200）も効く
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // 本番と同じビルドを相手にする
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
