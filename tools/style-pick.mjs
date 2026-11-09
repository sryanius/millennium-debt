/**
 * 병사 화풍 고르기(2026-11-09): 화풍 후보마다 검병·궁수·도적을 씨앗 2개씩 로컬 ComfyUI 로 뽑아 비교판을 만든다.
 *   node mercenary/tools/style-pick.mjs          → tools/.cache/style/<화풍>_<병사>_s<씨앗>.png, 비교판 docs/mercenary/art-samples/style-pick.png
 *   ONLY=A,C node ... → 그 화풍만 다시
 * 모델이 직접 도트로 그린다(Z-Image-Turbo + 도트 LoRA). 비교판의 «게임 크기» 줄만 미리보기용으로 줄여 보인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureComfy, free, run, wfZImage } from './comfy.mjs';
import { toGrid } from './sprite-grid.mjs';
import { quantize } from './pixelize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'mercenary/tools/.cache/style');
const DOC = path.join(ROOT, 'docs/mercenary/art-samples');
fs.mkdirSync(OUT, { recursive: true });

const WHO = {
  sword: 'a mercenary swordsman in chainmail and a brown leather jerkin with a steel helmet, holding a longsword and a round wooden shield',
  archer: 'a hooded archer in a green cloak and leather armor drawing a longbow',
  bandit: 'a bandit in ragged brown clothes and a red bandana holding a curved dagger',
};
const BG = 'plain flat solid magenta background, single character centered, full body from head to feet, no ground, no shadow, no text';
/** 화풍 후보: [이름, LoRA, 그림 크기, 문구] */
export const STYLES = {
  A: ['16비트 표준', 'redmond', 512, w => `16-bit SNES JRPG side-view battle sprite of ${w}, about three heads tall, standing in a battle-ready stance, side view facing right, clean pixel art with crisp square pixels, three-tone shading on every color, dark one-pixel outline, rich limited palette, ${BG}`],
  B: ['8비트 꼬마 (지금 것)', 'redmond', 512, w => `${w}, facing right, 8-bit NES RPG battle sprite, tiny chibi proportions, very low resolution, chunky pixels, 12 colors, bold dark outline, flat colors, ${BG}, standing idle`],
  C: ['거친 도트 (기록자 풍)', 'redmond', 512, w => `Retro pixel art battle sprite of a single super-deformed chibi RPG character, very low resolution, about 32 pixels tall, huge chunky square pixels, oversized head, plain simple face with only two tiny dark dot eyes and no mouth, ${w}, dynamic action pose leaning forward, side view facing right, thick dark outline, muted darker earthy colors, limited palette of about 12 colors, ${BG}`],
  D: ['정밀 도트 (어른 비율)', 'redmond', 768, w => `Detailed pixel art sprite of ${w} in the style of late 1990s tactical RPGs, realistic proportions about six heads tall, standing ready, side view facing right, careful pixel shading, muted desaturated medieval colors, dark outline, crisp square pixels, ${BG}`],
  E: ['어두운 중세 (탁한 색)', 'redmond', 512, w => `16-bit pixel art battle sprite of ${w}, gritty dark fantasy, about four heads tall, grim weathered look, desaturated browns greys and dull reds, heavy shadows with a warm rim light, side view facing right, standing ready, crisp square pixels, dark outline, ${BG}`],
  F: ['밝은 동화 (귀여운 3등신)', 'redmond', 512, w => `Cute modern indie pixel art sprite of ${w}, two and a half heads tall, big expressive eyes, bright cheerful saturated colors, soft glossy highlights, side view facing right, standing ready, crisp square pixels, clean dark outline, ${BG}`],
  G: ['16비트 표준 (다른 도트 LoRA)', 'tarn', 512, w => `16-bit SNES JRPG side-view battle sprite of ${w}, about three heads tall, standing in a battle-ready stance, side view facing right, clean pixel art, three-tone shading, dark outline, ${BG}`],
};
const SEEDS = [11, 12];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);

await ensureComfy();
for (const [sk, [, lora, size, f]] of Object.entries(STYLES)) {
  if (only.length && !only.includes(sk)) continue;
  for (const [wk, who] of Object.entries(WHO)) for (const seed of SEEDS) {
    const file = path.join(OUT, `${sk}_${wk}_s${seed}.png`);
    if (!only.length && fs.existsSync(file)) continue;
    const buf = await run(wfZImage({ prompt: f(who), lora, seed, width: size, height: size, steps: 8 }));
    fs.writeFileSync(file, buf); process.stdout.write(sk + wk[0] + seed + ' ');
  }
}
await free();
console.log('\n그림 끝, 비교판 만드는 중');

// ───── 비교판 ─────
/** 마젠타 배경을 지우고 인물 둘레만 잘라 정사각 칸(tile)에 바닥 맞춰 넣는다 */
async function crop(file, tile) {
  const img = sharp(file).ensureAlpha(); const { width: w, height: h } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  const isBg = i => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 110;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (isBg(i)) data[i + 3] = 0; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const cw = Math.max(1, x1 - x0 + 1), chh = Math.max(1, y1 - y0 + 1);
  const cut = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width: cw, height: chh }).png().toBuffer();
  const k = Math.min((tile - 8) / cw, (tile - 8) / chh);
  return sharp(cut).resize(Math.round(cw * k), Math.round(chh * k), { kernel: 'nearest' }).png().toBuffer();
}
/**
 * 게임 크기 미리보기 = 실제로 게임에 넣을 때 거치는 길:
 *  굵은 도트(격자 키 48칸 이하)는 모델이 그린 격자를 그대로 집고, 40칸 넘으면 조금만 줄인다.
 *  가는 도트(격자가 더 촘촘)는 격자를 집을 수 없어 그림째로 키 40칸으로 줄이고 24색으로 모은다(= «줄인 도트», 품질이 떨어지는 길).
 * 그 뒤 화면 배율 ×3(게임 캔버스와 같음).
 */
async function gameSize(file) {
  const g = await toGrid(fs.readFileSync(file));
  const target = 38;
  let buf, w, h, how;
  if (g.h <= 48) {
    buf = await sharp(Buffer.from(g.px), { raw: { width: g.w, height: g.h, channels: 4 } }).png().toBuffer(); w = g.w; h = g.h; how = '격자 ' + g.h + '칸';
    if (h > target) { const nw = Math.max(1, Math.round(w * target / h)); const { data } = await sharp(buf).resize(nw, target, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true }); buf = await quantRGBA(data, nw, target, 16); w = nw; h = target; how += '→' + target; }
  } else {
    const cut = await crop(file, 4096); const m = await sharp(cut).metadata();
    const nw = Math.max(1, Math.round(m.width * target / m.height));
    const { data } = await sharp(cut).resize(nw, target, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    buf = await quantRGBA(data, nw, target, 24); w = nw; h = target; how = '줄임(' + g.h + '→' + target + ')';
  }
  return { buf: await sharp(buf).resize(w * 3, h * 3, { kernel: 'nearest' }).png().toBuffer(), w: w * 3, h: h * 3, how };
}
/** RGBA 원시 자료를 n 색으로 모아 PNG 로(반투명은 반 넘게 차 있으면 칠함) */
async function quantRGBA(data, w, h, colours) {
  const rgb = new Uint8Array(w * h * 3); const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { solid[i] = data[i * 4 + 3] >= 128 ? 1 : 0; rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; }
  const q = quantize(rgb, w, h, colours); const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) if (solid[i]) { out[i * 4] = q.data[i * 3]; out[i * 4 + 1] = q.data[i * 3 + 1]; out[i * 4 + 2] = q.data[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (s, size, color, weight = 'bold') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${size + 10}"><text x="0" y="${size}" font-family="Malgun Gothic, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text></svg>`);
const TILE = 150, LABW = 210, GAMEW = 560, ROWH = TILE + 12;
const keys = Object.keys(STYLES);
const W = LABW + 6 * TILE + 20 + GAMEW + 10, H = 50 + keys.length * ROWH;
const comp = [{ input: text('병사 화풍 후보 — 줄마다 검병·궁수·도적 (씨앗 2개씩) | 오른쪽: 게임 안 크기(전장 풀밭 위)', 22, '#f0e0b0'), left: 14, top: 12 }];
for (const [r, sk] of keys.entries()) {
  const y = 50 + r * ROWH;
  comp.push({ input: text(sk, 44, '#e0b23c'), left: 14, top: y + 20 });
  comp.push({ input: text(STYLES[sk][0], 17, '#f0e0b0'), left: 14, top: y + 80 });
  let c = 0;
  for (const wk of Object.keys(WHO)) for (const seed of SEEDS) {
    const f = path.join(OUT, `${sk}_${wk}_s${seed}.png`); if (!fs.existsSync(f)) { c++; continue; }
    const t = await crop(f, TILE); const m = await sharp(t).metadata();
    comp.push({ input: { create: { width: TILE - 4, height: TILE - 4, channels: 4, background: '#3a3028' } }, left: LABW + c * TILE, top: y });
    comp.push({ input: t, left: LABW + c * TILE + Math.round((TILE - 4 - m.width) / 2), top: y + TILE - 8 - m.height });
    c++;
  }
  // 게임 크기: 풀밭 위에 셋(씨앗 11)
  const gx = LABW + 6 * TILE + 20;
  comp.push({ input: { create: { width: GAMEW, height: TILE - 4, channels: 4, background: '#9fae62' } }, left: gx, top: y });
  let x = gx + 8; let how = '';
  for (const wk of Object.keys(WHO)) for (const seed of SEEDS) {
    const f = path.join(OUT, `${sk}_${wk}_s${seed}.png`); if (!fs.existsSync(f)) continue;
    const g = await gameSize(f); how = g.how;
    comp.push({ input: g.buf, left: x, top: y + TILE - 22 - g.h }); x += g.w + 6;
  }
  comp.push({ input: text(how.startsWith('줄임') ? '가는 도트라 줄여야 함: ' + how : '모델 격자 그대로: ' + how, 13, '#1e1812', 'normal'), left: gx + 8, top: y + TILE - 24 });
}
await sharp({ create: { width: W, height: H, channels: 4, background: '#1e1812' } }).composite(comp).png().toFile(path.join(DOC, 'style-pick.png'));
console.log('비교판', path.join(DOC, 'style-pick.png'));
