# BEYOND THE FOOTPRINTS

探検家の足あとを手がかりに、宝への近道を見つけるパズルゲーム。

## 遊び方

- 盤面のまんなかから出発し、上下左右に1マスずつ動くことができる（PCは矢印キーでも操作できる）。
- 探検家が宝箱に辿り着くまでに通ったマスには足跡(矢印)が残っている。探検家は中央から同じマスを二度通らずに歩き、宝にたどりついた。
- 矢印をそのまま追うと歩数が足りない。近道を見つけて、決められた歩数以内に宝のマスへ着けばクリア。

盤面は `?n=<サイズ>&seed=<シード>` で決まるので、URL を送れば同じ盤面を共有できる。

## 開発

```sh
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run test:e2e  # E2E テスト（初回は npx playwright install chromium）
npm run build   # 型チェック + ビルド
npm run stats   # 盤面生成の統計
```

- main への push と PR で、CI が型チェック・lint・テスト・E2E を実行する。
