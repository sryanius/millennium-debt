/**
 * 전장 배경(지형별)을 로컬 ComfyUI(Z-Image-Turbo, LoRA 없음)로 뽑는다.
 * 캔버스 픽셀 1:1 로 쓰려고 1440×672 로 뽑아 1440×660(설계 480×220) 으로 자른다. 위 1/3 은 하늘·지평선, 아래 2/3 는 병사가 서는 땅.
 *   node mercenary/tools/battlefields-ai.mjs            → 없는 것만
 *   node mercenary/tools/battlefields-ai.mjs plain snow → 그것만 다시(SEED=13 로 씨앗 바꾸기)
 * 결과: public/art/battle/<지형>.png (팔레트 PNG), 미리보기 docs/mercenary/art-samples/battlefields.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureComfy, free, run, wfZImage } from './comfy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'mercenary/tools/.cache/battle'); const PUB = path.join(ROOT, 'mercenary/public/art/battle'); const DOC = path.join(ROOT, 'docs/mercenary/art-samples');
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(PUB, { recursive: true });
export const W = 1440, H = 660;

/** 지형 글자(map.terrain) → 배경 키. 바다·강 옆은 물가로 */
export const TERRAIN_BG = { p: 'plain', R: 'farm', f: 'forest', h: 'hills', m: 'mountain', s: 'swamp', w: 'shore', W: 'shore', F: 'river', d: 'desert', n: 'snow', x: 'rift' };
const SCENES = {
  plain: "a wide grassy plain; distant low hills, a few trees and small clouds only along the horizon",
  farm: "golden wheat fields; a wooden fence, haystacks and a farmhouse only far back along the horizon",
  forest: "a forest clearing; big dark tree trunks and foliage only in the upper part behind the clearing, mossy grass ground",
  hills: "rolling brown-green hills with rocky outcrops only far back along the horizon, grassy ground",
  mountain: "a mountain pass; grey cliffs and snow-capped peaks only in the upper part, bare rocky dirt ground",
  swamp: "a misty swamp; dead trees, reeds and dark water only far back along the horizon, muddy ground with puddles",
  shore: "a beach; the sea with gentle waves only along the horizon in the upper part, wet sand ground",
  river: "a riverside; the river and a wooden footbridge only along the horizon in the upper part, stony riverbank ground",
  desert: "a desert; sand dunes and distant rock mesas only along the horizon, flat sand ground",
  snow: "a snow field; frosted pine trees and icy mountains only along the horizon, flat snow ground",
  rift: "a cursed wasteland; glowing violet crystals and a rift of light only along the horizon, cracked dark purple ground",
  siege: "outside a medieval castle; the stone wall with a tall gate, battlements and banners standing along the horizon in the upper part, trampled dirt ground in front",
};
const STYLE = (scene) => `Pixel art battle scene background in the style of a 1990s console tactical RPG, ${scene}. Three-quarter view from above: the horizon line sits at one third from the top, and the entire lower two thirds of the image is an empty, flat, open ground plane with only subtle texture and tiny details, nothing standing in it — all scenery stays in the upper third behind the horizon. Painterly dithered pixel shading, warm natural colors, no characters, no monsters, no text, no frame`;

const args = process.argv.slice(2); const seed = Number(process.env.SEED ?? 7);
const todo = Object.keys(SCENES).filter(k => args.length ? args.includes(k) : !fs.existsSync(path.join(RAW, k + '.png')));
if (todo.length) await ensureComfy();
for (const k of todo) {
  const t0 = Date.now();
  const buf = await run(wfZImage({ prompt: STYLE(SCENES[k]), lora: null, seed: seed + k.length, width: W, height: 672, steps: 8 }));
  fs.writeFileSync(path.join(RAW, k + '.png'), buf); console.log('ok', k, Math.round((Date.now() - t0) / 100) / 10 + 's');
}
if (todo.length) await free();
// 자르고 팔레트 PNG 로(용량) + 미리보기판
const keys = Object.keys(SCENES).filter(k => fs.existsSync(path.join(RAW, k + '.png')));
for (const k of keys) await sharp(path.join(RAW, k + '.png')).extract({ left: 0, top: 6, width: W, height: H }).png({ palette: true, colours: 128, compressionLevel: 9 }).toFile(path.join(PUB, k + '.png'));
const tw = 480, th = 220, cols = 3; const rows = Math.ceil(keys.length / cols);
const comp = await Promise.all(keys.map(async (k, i) => ({ input: await sharp(path.join(PUB, k + '.png')).resize(tw, th).toBuffer(), left: (i % cols) * (tw + 8), top: Math.floor(i / cols) * (th + 8) })));
await sharp({ create: { width: cols * (tw + 8), height: rows * (th + 8), channels: 3, background: '#1a1c2c' } }).composite(comp).png().toFile(path.join(DOC, 'battlefields.png'));
console.log(keys.length + '장', path.join(DOC, 'battlefields.png'));
