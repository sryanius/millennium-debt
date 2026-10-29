/**
 * AI 도트 판이 아직 없는 초상을 채색 판에서 로컬로 도트화한다(대체품, Gemini 한도가 풀리면 ai-portraits-pixel.mjs 로 교체).
 *   node mercenary/tools/portraits-local-px.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pixelize } from './pixelize.mjs';
import { CHARACTERS } from './portrait-chars.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-ai');
const OUT = path.join(ROOT, 'mercenary/public/art/portraits-px');
const DOC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-px');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOC, { recursive: true });
const made = [];
for (const k of Object.keys(CHARACTERS)) {
  if (fs.existsSync(path.join(OUT, k + '.png')) && !fs.existsSync(path.join(OUT, k + '.local'))) continue; // AI 도트 판이 있으면 그대로
  const src = path.join(SRC, k + '.png'); if (!fs.existsSync(src)) continue;
  const pre = await sharp(src).modulate({ saturation: 1.3, brightness: 1.08 }).linear(1.2, -14).sharpen({ sigma: 1.4 }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, k + '.png'), await pixelize(pre, { width: 48, height: 56, colours: 28 }));
  fs.writeFileSync(path.join(OUT, k + '@2.png'), await pixelize(pre, { width: 96, height: 112, colours: 32 }));
  fs.writeFileSync(path.join(DOC, k + '.png'), await pixelize(pre, { width: 48, height: 56, colours: 28, scaleUp: 4 }));
  fs.writeFileSync(path.join(OUT, k + '.local'), 'local fallback\n');
  made.push(k);
}
console.log('local', made.length, made.join(' '));
// 시트 다시
const files = Object.keys(CHARACTERS).filter(k => fs.existsSync(path.join(DOC, k + '.png')));
const cols = 5, w = 192, h = 224; const rows = Math.ceil(files.length / cols);
const composite = await Promise.all(files.map(async (k, i) => ({ input: await sharp(path.join(DOC, k + '.png')).resize(w, h, { kernel: 'nearest' }).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#1a1c2c' } }).composite(composite).png().toFile(path.join(DOC, 'sheet.png'));
console.log('sheet', files.length);
