import { defineConfig } from 'vite';

// base './' : GitHub Pages(/millennium-debt/)와 로컬 어디서든 같은 빌드가 돈다.
export default defineConfig({
  base: './',
  server: { host: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
