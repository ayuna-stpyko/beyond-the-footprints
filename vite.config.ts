import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages ではリポジトリ名がパスになる。別のパスで公開するときは BASE_PATH で上書きする
  base: process.env.BASE_PATH ?? '/beyond-footprints/',
  worker: { format: 'es' },
});
