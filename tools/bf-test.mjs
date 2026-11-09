/** 전장 배경 방식 시험: LoRA·크기·문구를 바꿔 평원·숲 두 장씩 → tools/.cache/battle/test-*.png + 비교판 */
import fs from 'node:fs';
import sharp from 'sharp';
import { ensureComfy, free, run, wfZImage } from './comfy.mjs';
const OUT = 'tools/.cache/battle'; fs.mkdirSync(OUT, { recursive: true });
const SCENE = {
  plain: 'a wide open grassy plain with a few scattered trees and distant low hills under a clear blue sky with small clouds',
  forest: 'a clearing at the edge of a dense dark green forest, big tree trunks in the background, mossy ground, soft light between the trees',
};
const P1 = s => `16-bit SNES JRPG battle background, ${s}, seen from slightly above so the open ground stretches toward the horizon, horizon in the upper third, wide empty battlefield ground in the lower two thirds for characters to stand on, no platforms, no ledges, not a side-scrolling level, clean pixel art with crisp square pixels, rich limited palette, no characters, no monsters, no text, no frame`;
const P2 = s => `Pixel art battle scene background in the style of a 1990s console tactical RPG, ${s}, three-quarter view from slightly above, open flat ground filling the lower part, horizon and sky in the upper part, painterly dithered pixel shading, warm natural colors, no characters, no monsters, no text, no frame`;
const V = [
  ['A-tarn-1440', 'tarn', 1440, 672, P1],
  ['B-redmond-1024', 'redmond', 1024, 480, P1],
  ['C-tarn-1024', 'tarn', 1024, 480, P2],
  ['D-nolora-1440', null, 1440, 672, P2],
  ['E-tarn-768x2', 'tarn', 768, 352, P2],
];
await ensureComfy();
for (const [k, lora, w, h, f] of V) for (const [sk, s] of Object.entries(SCENE)) {
  const file = `${OUT}/test-${k}-${sk}.png`; if (fs.existsSync(file)) continue;
  const buf = await run(wfZImage({ prompt: f(s), lora, seed: 21, width: w, height: h, steps: 8 }));
  fs.writeFileSync(file, buf); process.stdout.write(k + ' ' + sk + '\n');
}
await free();
const tw = 480, th = 220; const comp = []; let r = 0;
for (const [k] of V) { for (const [c, sk] of Object.keys(SCENE).entries()) comp.push({ input: await sharp(`${OUT}/test-${k}-${sk}.png`).resize(tw, th, { fit: 'cover' }).toBuffer(), left: c * (tw + 8), top: r * (th + 8) }); r++; }
await sharp({ create: { width: 2 * (tw + 8), height: r * (th + 8), channels: 3, background: '#1a1c2c' } }).composite(comp).png().toFile(`${OUT}/test-sheet.png`);
console.log('sheet', V.map(v => v[0]).join(' / '));
