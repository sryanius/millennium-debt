/**
 * 로컬 도트 초상: 채색 초상(portraits-ai) → 로컬 Qwen-Image-Edit-2511 + Lightning 으로 "16비트 도트 초상으로 다시 그려"
 * → 48×56·96×112 격자·32색. (2026-10-29 비교에서 LoRA img2img 보다 얼굴 유지·선명도가 좋았다: art-samples/local-compare)
 *   node mercenary/tools/local-portraits-pixel.mjs [키들...]   키 생략 = .local 대체품만, FORCE=1 = 전부
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureComfy, putInput, run, wfQwenEdit } from './comfy.mjs';
import { pixelize } from './pixelize.mjs';
import { CHARACTERS } from './portrait-chars.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-ai');
const OUT_GAME = path.join(ROOT, 'mercenary/public/art/portraits-px');
const OUT_DOC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-px');
export const PIXEL_EDIT = 'Redraw this exact character as a 16-bit pixel art portrait in the style of a 1990s SNES / PC-98 Japanese RPG character portrait: keep the same face, hairstyle, skin tone, expression and clothes; bust framing. Crisp hard-edged pixels, flat shading with 3-4 tones per material, bold dark outlines, limited palette, no anti-aliasing, no gradients. Plain very dark background.';

const args = process.argv.slice(2);
const keys = args.length ? args : Object.keys(CHARACTERS).filter(k => process.env.FORCE || fs.existsSync(path.join(OUT_GAME, k + '.local')) || !fs.existsSync(path.join(OUT_GAME, k + '.png')));
await ensureComfy();
for (const k of keys) {
  const t0 = Date.now();
  const src = await sharp(path.join(SRC, k + '.png')).resize(768, 960).png().toBuffer();
  const raw = await run(wfQwenEdit({ image: putInput('merc_' + k + '.png', src), instruction: PIXEL_EDIT, seed: 1001 }));
  fs.writeFileSync(path.join(OUT_DOC, k + '-ai.png'), await sharp(raw).resize(384, 480, { fit: 'cover' }).png().toBuffer());
  fs.writeFileSync(path.join(OUT_GAME, k + '.png'), await pixelize(raw, { width: 48, height: 56, colours: 32 }));
  fs.writeFileSync(path.join(OUT_GAME, k + '@2.png'), await pixelize(raw, { width: 96, height: 112, colours: 32 }));
  fs.writeFileSync(path.join(OUT_DOC, k + '.png'), await pixelize(raw, { width: 48, height: 56, colours: 32, scaleUp: 4 }));
  const local = path.join(OUT_GAME, k + '.local'); if (fs.existsSync(local)) fs.unlinkSync(local);
  fs.writeFileSync(path.join(OUT_GAME, k + '.src'), 'local qwen-image-edit-2511 lightning\n');
  console.log('ok', k, Math.round((Date.now() - t0) / 100) / 10 + 's');
}
const files = Object.keys(CHARACTERS).filter(k => fs.existsSync(path.join(OUT_DOC, k + '.png')));
const cols = 5, w = 192, h = 224; const rows = Math.ceil(files.length / cols);
const composite = await Promise.all(files.map(async (k, i) => ({ input: await sharp(path.join(OUT_DOC, k + '.png')).resize(w, h, { kernel: 'nearest' }).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#1a1c2c' } }).composite(composite).png().toFile(path.join(OUT_DOC, 'sheet.png'));
console.log('sheet', files.length);
