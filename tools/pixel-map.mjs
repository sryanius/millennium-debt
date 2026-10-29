/**
 * 도트 지도 만들기.
 *   node mercenary/tools/pixel-map.mjs          로컬 변환(채색 대륙 지도 → 색 보정 → 4px/칸 · 40색)
 *   node mercenary/tools/pixel-map.mjs --ai     Gemini 로 조각마다 16비트 도트로 다시 그린 뒤 이어 붙임(월 한도 필요)
 * 원본: 《균열의 시대》 strategy/Unity/Assets/Resources/MapPainted/painted_continent_8192.jpg (같은 지도 자료에서 칠한 그림).
 * 격자 320×220 에 맞춰 늘린다(원본은 2:1 — 물 마스크 IoU 0.92 로 확인).
 * 산출: mercenary/public/art/map-pixel.png (1280×880), docs/mercenary/art-samples/map-pixel-preview.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pixelize, quantize } from './pixelize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'strategy/Unity/Assets/Resources/MapPainted/painted_continent_8192.jpg');
const PUB = path.join(ROOT, 'mercenary/public/art');
const DOC = path.join(ROOT, 'docs/mercenary/art-samples');
const CACHE = path.join(ROOT, 'mercenary/tools/.cache/map-ai'); // AI 조각(재생성 비용이 들어 보관, git 제외)
const CELL = 4, GW = 320, GH = 220, OW = GW * CELL, OH = GH * CELL;
const AI = process.argv.includes('--ai');

/** 색 보정: 채색 지도는 노랗고 탁해서 16비트 느낌이 안 난다 → 녹색·청색을 살리고 대비를 올린다 */
const grade = img => img.modulate({ saturation: 1.4, brightness: 1.03 }).linear([0.9, 1.06, 1.04], [-14, -6, -2]).sharpen({ sigma: 1.1 });

let full;
if (!AI) {
  full = await grade(sharp(SRC).resize(OW * 2, OH * 2, { fit: 'fill', kernel: 'lanczos3' })).png().toBuffer();
} else {
  // 4×3 조각(겹침 12칸)을 다시 그린 뒤 가중 평균으로 잇는다
  fs.mkdirSync(CACHE, { recursive: true });
  const key = fs.readFileSync(path.join(ROOT, '.secrets', 'gemini.key'), 'utf8').trim();
  const meta = await sharp(SRC).metadata(); const sx = meta.width / GW, sy = meta.height / GH;
  const COLS = 4, ROWS = 3, OV = 12; const tw = Math.ceil(GW / COLS), th = Math.ceil(GH / ROWS);
  const acc = new Float32Array(OW * OH * 3), wsum = new Float32Array(OW * OH);
  const prompt = 'Redraw this fantasy map region as 16-bit pixel art, like the overworld map of a 1990s SNES / PC-98 strategy RPG. '
    + 'Keep exactly the same layout: same coastline, same rivers, same mountains, forests, desert, snow, lakes and their positions. Top-down oblique view. '
    + 'Crisp hard pixels, small pixel trees and pixel mountains with dark outlines, limited palette of about 32 colors, rich saturated but tasteful colors, no anti-aliasing, no text, no labels, no frame.';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x0 = Math.max(0, c * tw - OV), y0 = Math.max(0, r * th - OV), x1 = Math.min(GW, (c + 1) * tw + OV), y1 = Math.min(GH, (r + 1) * th + OV);
    const file = path.join(CACHE, `t${r}${c}.png`);
    if (!fs.existsSync(file)) {
      const crop = await sharp(SRC).extract({ left: Math.round(x0 * sx), top: Math.round(y0 * sy), width: Math.round((x1 - x0) * sx), height: Math.round((y1 - y0) * sy) }).resize(1400, Math.round(1400 * (y1 - y0) / (x1 - x0) / 1.0)).png().toBuffer();
      const body = { contents: [{ parts: [{ inline_data: { mime_type: 'image/png', data: crop.toString('base64') } }, { text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent', { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (j?.error?.message ?? ''));
      const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data); const d = part.inlineData || part.inline_data;
      fs.writeFileSync(file, Buffer.from(d.data, 'base64')); console.log('tile', r, c);
    }
    const w = (x1 - x0) * CELL, h = (y1 - y0) * CELL;
    const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = Math.min(x, w - 1 - x) / (OV * CELL), fy = Math.min(y, h - 1 - y) / (OV * CELL);
      const wt = Math.max(0.02, Math.min(1, c === 0 && x < w / 2 ? 1 : fx, 1) * Math.min(1, r === 0 && y < h / 2 ? 1 : fy, 1));
      const gx = x0 * CELL + x, gy = y0 * CELL + y, o = gy * OW + gx;
      acc[o * 3] += data[(y * w + x) * 3] * wt; acc[o * 3 + 1] += data[(y * w + x) * 3 + 1] * wt; acc[o * 3 + 2] += data[(y * w + x) * 3 + 2] * wt; wsum[o] += wt;
    }
  }
  const buf = Buffer.alloc(OW * OH * 3); for (let i = 0; i < OW * OH; i++) for (let k = 0; k < 3; k++) buf[i * 3 + k] = Math.round(acc[i * 3 + k] / Math.max(1e-6, wsum[i]));
  full = await sharp(buf, { raw: { width: OW, height: OH, channels: 3 } }).png().toBuffer();
}
const px = await pixelize(full, { width: OW, height: OH, colours: 40, fit: 'fill' });
fs.writeFileSync(path.join(PUB, 'map-pixel.png'), px);
await sharp(px).extract({ left: 42 * CELL, top: 134 * CELL, width: 120 * CELL, height: 68 * CELL }).resize(120 * CELL * 3, 68 * CELL * 3, { kernel: 'nearest' }).png().toFile(path.join(DOC, 'map-pixel-preview.png'));
await sharp(px).resize(OW, OH, { kernel: 'nearest' }).png().toFile(path.join(DOC, 'map-pixel-full.png'));
console.log('map-pixel.png', OW + '×' + OH, AI ? '(AI)' : '(local)', px.length);
void quantize;
