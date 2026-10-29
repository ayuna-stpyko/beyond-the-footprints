import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/beyond-the-footprints/',
  worker: { format: 'es' },
});
