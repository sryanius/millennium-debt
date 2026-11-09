/**
 * 도트 촘촘함 비교(2026-11-09): 같은 그림을 «지금 방식(키 38칸을 화면에서 3배로)» 과 «촘촘한 도트(화면 픽셀 1:1, 키 114칸)» 로 나란히.
 * 화면에서 차지하는 크기는 같고, 도트 수만 9배 차이. style-pick 이 뽑아 둔 그림을 쓴다(새로 뽑지 않음).
 *   node mercenary/tools/density-pick.mjs → docs/mercenary/art-samples/density-pick.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { quantize } from './pixelize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'mercenary/tools/.cache/style');
const OUT = path.join(ROOT, 'docs/mercenary/art-samples/density-pick.png');
const H_SCREEN = 114; // 게임 화면에서 병사 키(캔버스 픽셀) = 설계 38칸 × 3

async function cut(file) {
  const img = sharp(file).ensureAlpha(); const { width: w, height: h } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 110) data[i + 3] = 0; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
}
async function quantRGBA(data, w, h, colours) {
  const rgb = new Uint8Array(w * h * 3); const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { solid[i] = data[i * 4 + 3] >= 128 ? 1 : 0; rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; }
  const q = quantize(rgb, w, h, colours); const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) if (solid[i]) { out[i * 4] = q.data[i * 3]; out[i * 4 + 1] = q.data[i * 3 + 1]; out[i * 4 + 2] = q.data[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
/** 지금 방식: 키 38칸으로 줄여 16~24색, 화면 3배 */
async function coarse(file) {
  const c = await cut(file); const m = await sharp(c).metadata(); const h = 38, w = Math.max(1, Math.round(m.width * h / m.height));
  const { data } = await sharp(c).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const q = await quantRGBA(data, w, h, 24);
  return { buf: await sharp(q).resize(w * 3, h * 3, { kernel: 'nearest' }).png().toBuffer(), w: w * 3, h: h * 3 };
}
/** 촘촘한 도트: 키 114칸(화면 픽셀 1:1), 32색 */
async function fine(file) {
  const c = await cut(file); const m = await sharp(c).metadata(); const h = H_SCREEN, w = Math.max(1, Math.round(m.width * h / m.height));
  const { data } = await sharp(c).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return { buf: await quantRGBA(data, w, h, 32), w, h };
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (s, size, color, weight = 'bold') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${size + 10}"><text x="0" y="${size}" font-family="Malgun Gothic, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text></svg>`);

const STYLES = { A: '16비트 표준', D: '정밀 도트(어른 비율)', E: '어두운 중세', G: '16비트 표준(다른 LoRA)', B: '8비트 꼬마(지금 것)', F: '밝은 동화' };
const files = sk => ['sword_s11', 'sword_s12', 'archer_s11', 'archer_s12', 'bandit_s11', 'bandit_s12'].map(n => path.join(SRC, `${sk}_${n}.png`)).filter(f => fs.existsSync(f));
const STRIP = 560, ROWH = 170, LABW = 200;
const keys = Object.keys(STYLES);
const W = LABW + STRIP * 2 + 40, H = 70 + keys.length * ROWH;
const comp = [
  { input: text('같은 그림, 같은 화면 크기 — 왼쪽: 지금 방식(키 38칸을 3배로)  |  오른쪽: 촘촘한 도트(화면 픽셀 1:1, 키 114칸)', 20, '#f0e0b0'), left: 14, top: 10 },
  { input: text('지금 방식 (38칸 ×3)', 16, '#e0b23c'), left: LABW, top: 42 },
  { input: text('촘촘한 도트 (114칸 1:1) — 도트 수 9배', 16, '#e0b23c'), left: LABW + STRIP + 20, top: 42 },
];
for (const [r, sk] of keys.entries()) {
  const y = 70 + r * ROWH;
  comp.push({ input: text(sk, 40, '#e0b23c'), left: 14, top: y + 30 });
  comp.push({ input: text(STYLES[sk], 15, '#f0e0b0'), left: 14, top: y + 86 });
  for (const [col, fn] of [[0, coarse], [1, fine]]) {
    const gx = LABW + col * (STRIP + 20);
    comp.push({ input: { create: { width: STRIP, height: ROWH - 10, channels: 4, background: '#9fae62' } }, left: gx, top: y });
    let x = gx + 10;
    for (const f of files(sk)) { const g = await fn(f); if (x + g.w > gx + STRIP - 6) break; comp.push({ input: g.buf, left: x, top: y + ROWH - 22 - g.h }); x += g.w + 10; }
  }
}
await sharp({ create: { width: W, height: H, channels: 4, background: '#1e1812' } }).composite(comp).png().toFile(OUT);
console.log('비교판', OUT);
