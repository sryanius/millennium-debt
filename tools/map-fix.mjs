/**
 * 지도 AI 조각 검사·재생성: 원본에 없는 흰 얼룩(눈·소금밭처럼 보이는 것)이 생긴 조각을 찾아 다른 시드로 다시 그린다.
 *   node tools/map-fix.mjs            검사만
 *   node tools/map-fix.mjs --fix      나쁜 조각을 다시 뽑고 지도를 다시 붙인다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { ensureComfy, putInput, run, wfQwenEdit } from './comfy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'strategy/Unity/Assets/Resources/MapPainted/painted_continent_8192.jpg');
const CACHE = path.join(ROOT, 'mercenary/tools/.cache/map-ai');
const GW = 320, GH = 220, COLS = 4, ROWS = 3, OV = 12; const tw = Math.ceil(GW / COLS), th = Math.ceil(GH / ROWS);
const meta = await sharp(SRC).metadata(); const sx = meta.width / GW, sy = meta.height / GH;
const prompt = 'Redraw this fantasy map region as 16-bit pixel art, like the overworld map of a 1990s SNES / PC-98 strategy RPG. '
  + 'Keep exactly the same layout: same coastline, same rivers, same mountains, forests, desert, snow, lakes and their positions. Top-down oblique view. '
  + 'Only put snow where the original has snow; do not add white patches, salt flats, clouds or fog. '
  + 'Crisp hard pixels, small pixel trees and pixel mountains with dark outlines, limited palette of about 32 colors, rich saturated but tasteful colors, no anti-aliasing, no text, no labels, no frame.';
/** 밝고 채도 낮은 픽셀 비율(흰 얼룩) — 64×64 칸으로 나눠 원본보다 크게 늘어난 칸 수를 센다 */
async function whiteGrid(buf, w, h) {
  const { data } = await sharp(buf).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) { const r = data[i * 3], gg = data[i * 3 + 1], b = data[i * 3 + 2]; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); g[i] = mx > 200 && mx - mn < 40 ? 1 : 0; }
  return g;
}
async function score(r, c, file) {
  const x0 = Math.max(0, c * tw - OV), y0 = Math.max(0, r * th - OV), x1 = Math.min(GW, (c + 1) * tw + OV), y1 = Math.min(GH, (r + 1) * th + OV);
  const crop = await sharp(SRC).extract({ left: Math.round(x0 * sx), top: Math.round(y0 * sy), width: Math.round((x1 - x0) * sx), height: Math.round((y1 - y0) * sy) }).png().toBuffer();
  const W = 64, H = Math.round(64 * (y1 - y0) / (x1 - x0)); const a = await whiteGrid(crop, W, H), b = await whiteGrid(fs.readFileSync(file), W, H);
  let bad = 0; for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let sa = 0, sb = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { sa += a[(y + dy) * W + x + dx]; sb += b[(y + dy) * W + x + dx]; } if (sb >= 12 && sa <= 3) bad++; }
  return { bad, crop, x0, y0, x1, y1 };
}
const fix = process.argv.includes('--fix');
if (fix) await ensureComfy();
let changed = false;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const file = path.join(CACHE, `q${r}${c}.png`); if (!fs.existsSync(file)) continue;
  let s = await score(r, c, file); console.log(`tile ${r}${c} white-spots ${s.bad}`);
  for (let tryN = 0; fix && s.bad > 2 && tryN < 4; tryN++) {
    const crop = await sharp(s.crop).resize(1344, Math.round(1344 * (s.y1 - s.y0) / (s.x1 - s.x0)), { fit: 'fill' }).png().toBuffer();
    const out = await run(wfQwenEdit({ image: putInput(`merc_fix${r}${c}.png`, crop), instruction: prompt, seed: 2002 + tryN * 1111 }));
    const tmp = file + '.try.png'; fs.writeFileSync(tmp, out); const s2 = await score(r, c, tmp);
    console.log(`  retry ${tryN + 1}: ${s2.bad}`);
    if (s2.bad < s.bad) { fs.renameSync(tmp, file); s = s2; changed = true; } else fs.unlinkSync(tmp);
  }
}
if (changed) { execFileSync(process.execPath, [path.join(ROOT, 'mercenary/tools/pixel-map.mjs'), '--ai'], { stdio: 'inherit', cwd: path.join(ROOT, 'mercenary') }); }
