import { defineConfig } from 'vite';

// 저장소 루트의 docs/grand-strategy/data/world/*.json 을 그대로 import 하므로 상위 폴더 접근을 허용한다.
export default defineConfig({
  base: './',
  server: { host: true, fs: { allow: ['..'] } },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
