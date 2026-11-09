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
  plain: 'a wide open grassy plain with a few scattered trees and distant low hills under a clear blue sky with small clouds',
  farm: 'golden wheat fields with a wooden fence, haystacks and a distant farmhouse under a warm afternoon sky',
  forest: 'the edge of a dense dark green forest, big tree trunks on both sides, mossy ground, soft light between the trees',
  hills: 'rolling brown and green hills with rocky outcrops and sparse bushes under a pale sky',
  mountain: 'a rocky mountain pass with grey cliffs, scattered boulders and snow-capped peaks behind, cold sky',
  swamp: 'a misty swamp with dark shallow water, reeds, dead trees and fog hanging low under a grey-green sky',
  shore: 'a sandy beach with the sea and gentle waves on the horizon, some rocks and driftwood, bright sky',
  river: 'a shallow river ford with a stony riverbank, reeds and a wooden footbridge in the distance under a soft sky',
  desert: 'a sun-baked desert with sand dunes, a few dry shrubs and distant rock mesas under a hot hazy sky',
  snow: 'a snow-covered field with frosted pine trees and icy mountains behind under a pale winter sky',
  rift: 'a cursed wasteland with cracked dark purple ground, glowing violet crystals and an eerie dark sky with a rift of light',
  siege: 'the outside of a medieval castle wall with a tall stone gate, battlements and banners, trampled ground in front, dramatic cloudy sky',
};
// 2026-11-09 시험(tools/bf-test.mjs): 도트 LoRA 를 얹으면 옆으로 흐르는 발판 게임 배경이 되어 버려, LoRA 없이 Z-Image 에 «도트 그림» 문구만 준 것이 가장 자연스러웠다
const STYLE = (scene) => `Pixel art battle scene background in the style of a 1990s console tactical RPG, ${scene}, three-quarter view from slightly above, open flat ground filling the lower part, horizon and sky in the upper part, painterly dithered pixel shading, warm natural colors, no characters, no monsters, no text, no frame`;

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
