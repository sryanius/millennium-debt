import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/** 개발 서버 전용: 브라우저에서 만든 파일(음악 WAV 등)을 docs/mercenary/audio-samples 에 저장. 배포 빌드에는 없다 */
function devSave(): Plugin {
  return {
    name: 'dev-save', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const name = path.basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'x.bin').replace(/[^a-z0-9_.-]/gi, '');
        const dir = path.resolve(__dirname, '../docs/mercenary/audio-samples'); fs.mkdirSync(dir, { recursive: true });
        const chunks: Buffer[] = []; req.on('data', c => chunks.push(c)); req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('ok'); });
      });
    },
  };
}

// base './' : GitHub Pages(/millennium-debt/)와 로컬 어디서든 같은 빌드가 돈다.
export default defineConfig({
  base: './',
  server: { host: true },
  plugins: [devSave()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
