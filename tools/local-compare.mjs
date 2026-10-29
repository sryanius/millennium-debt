/**
 * 로컬 도트 방식 비교(초상 2명 + 지도 1조각).
 *   node mercenary/tools/local-compare.mjs
 * 변형: Z-Image img2img + 도트 LoRA(tarn / redmond) × denoise(0.55 / 0.75), Qwen-Image-Edit "16비트 도트로 다시 그려".
 * 모든 결과는 마지막에 같은 도트 격자 맞추기(pixelize)를 거친다. 산출: docs/mercenary/art-samples/local-compare/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureComfy, putInput, run, wfQwenEdit, wfZImage, free } from './comfy.mjs';
import { pixelize } from './pixelize.mjs';
import { CHARACTERS } from './portrait-chars.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs/mercenary/art-samples/local-compare'); fs.mkdirSync(OUT, { recursive: true });
const SRC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-ai');
const PORTRAIT_STYLE = '16-bit pixel art character portrait, 1990s SNES / PC-98 Japanese RPG style, bust, three-quarter view, crisp pixels, bold dark outlines, flat shading with few tones, limited palette, plain very dark background.';
const PIXEL_EDIT = 'Redraw this exact character as a 16-bit pixel art portrait in the style of a 1990s SNES / PC-98 Japanese RPG character portrait: keep the same face, hairstyle, skin tone, expression and clothes; bust framing. Crisp hard-edged pixels, flat shading with 3-4 tones per material, bold dark outlines, limited palette, no anti-aliasing, no gradients. Plain very dark background.';

await ensureComfy();
const t = () => Date.now();
const rows = [];
async function save(name, buf) {
  fs.writeFileSync(path.join(OUT, name + '-raw.png'), await sharp(buf).resize(384, 480, { fit: 'cover' }).png().toBuffer());
  const px = await pixelize(buf, { width: 48, height: 56, colours: 32, scaleUp: 4 });
  fs.writeFileSync(path.join(OUT, name + '.png'), px); return px;
}
for (const k of ['kael', 'tobias']) {
  const src = await sharp(path.join(SRC, k + '.png')).resize(768, 960).png().toBuffer();
  const inName = putInput('merc_' + k + '.png', src);
  for (const lora of ['tarn', 'redmond']) for (const dn of [0.55, 0.75]) {
    const t0 = t();
    const buf = await run(wfZImage({ prompt: CHARACTERS[k] + ' ' + PORTRAIT_STYLE, width: 768, height: 960, lora, image: inName, denoise: dn }));
    await save(`${k}_z-${lora}-${dn}`, buf); rows.push([k, `z-${lora}-${dn}`, (t() - t0) / 1000]); console.log(rows.at(-1).join(' '));
  }
  // 텍스트만으로 처음부터(로컬 단독 품질)
  { const t0 = t(); const buf = await run(wfZImage({ prompt: CHARACTERS[k] + ' ' + PORTRAIT_STYLE, width: 768, height: 960, lora: 'tarn', seed: 2002 })); await save(`${k}_z-tarn-t2i`, buf); rows.push([k, 'z-tarn-t2i', (t() - t0) / 1000]); console.log(rows.at(-1).join(' ')); }
}
await free();
for (const k of ['kael', 'tobias']) {
  const t0 = t(); const buf = await run(wfQwenEdit({ image: 'merc_' + k + '.png', instruction: PIXEL_EDIT }));
  await save(`${k}_qwen-edit`, buf); rows.push([k, 'qwen-edit', (t() - t0) / 1000]); console.log(rows.at(-1).join(' '));
}
// 지도 조각: 샹파르 일대
const MAP = path.join(ROOT, 'strategy/Unity/Assets/Resources/MapPainted/painted_continent_8192.jpg');
const meta = await sharp(MAP).metadata(); const sx = meta.width / 320, sy = meta.height / 220;
const crop = await sharp(MAP).extract({ left: Math.round(42 * sx), top: Math.round(134 * sy), width: Math.round(120 * sx), height: Math.round(68 * sy) }).resize(1344, 768, { fit: 'fill' }).png().toBuffer();
putInput('merc_map.png', crop);
const MAP_EDIT = 'Redraw this fantasy map region as 16-bit pixel art, like the overworld map of a 1990s SNES / PC-98 strategy RPG. Keep exactly the same layout: same coastline, rivers, mountains, forests and desert in the same places. Crisp hard pixels, small pixel trees and pixel mountains with dark outlines, limited palette, rich saturated colors, no text, no labels.';
async function saveMap(name, buf) {
  const px = await pixelize(buf, { width: 480, height: 272, colours: 32, fit: 'fill' });
  fs.writeFileSync(path.join(OUT, name + '.png'), await sharp(px).resize(1440, 816, { kernel: 'nearest' }).png().toBuffer());
}
{ const t0 = t(); await saveMap('map_qwen-edit', await run(wfQwenEdit({ image: 'merc_map.png', instruction: MAP_EDIT }))); rows.push(['map', 'qwen-edit', (t() - t0) / 1000]); console.log(rows.at(-1).join(' ')); }
await free();
for (const dn of [0.45, 0.6]) { const t0 = t(); await saveMap('map_z-tarn-' + dn, await run(wfZImage({ prompt: 'fantasy overworld map, top-down oblique view, ' + MAP_EDIT, width: 1344, height: 768, lora: 'tarn', image: 'merc_map.png', denoise: dn }))); rows.push(['map', 'z-tarn-' + dn, (t() - t0) / 1000]); console.log(rows.at(-1).join(' ')); }
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(rows, null, 1));

// 비교 시트(초상): 행 = 인물, 열 = 변형
const variants = ['z-tarn-0.55', 'z-tarn-0.75', 'z-redmond-0.55', 'z-redmond-0.75', 'z-tarn-t2i', 'qwen-edit'];
const cw = 192, ch = 224, comp = [];
for (const [r, k] of ['kael', 'tobias'].entries()) for (const [c, v] of variants.entries()) {
  const f = path.join(OUT, `${k}_${v}.png`); if (fs.existsSync(f)) comp.push({ input: f, left: c * cw, top: r * ch });
}
await sharp({ create: { width: variants.length * cw, height: 2 * ch, channels: 3, background: '#1a1c2c' } }).composite(comp).png().toFile(path.join(OUT, 'sheet-portraits.png'));
console.log('done', OUT);
