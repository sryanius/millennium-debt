/**
 * 지도 AI 조각의 "원본에 없는 흰 얼룩"을 원본(색 보정) 픽셀로 메운다. 조각 파일을 고치고(.orig 보관) 지도를 다시 붙인다.
 *   node tools/map-clean.mjs [조각들...]   기본: 전부 검사
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'strategy/Unity/Assets/Resources/MapPainted/painted_continent_8192.jpg');
const CACHE = path.join(ROOT, 'mercenary/tools/.cache/map-ai');
const GW = 320, GH = 220, COLS = 4, ROWS = 3, OV = 12; const tw = Math.ceil(GW / COLS), th = Math.ceil(GH / ROWS);
const meta = await sharp(SRC).metadata(); const sx = meta.width / GW, sy = meta.height / GH;
const only = process.argv.slice(2);
const white = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 185 && mx - mn < 55; };
let changed = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const name = `q${r}${c}`; if (only.length && !only.includes(name)) continue;
  const file = path.join(CACHE, name + '.png'); if (!fs.existsSync(file)) continue;
  const orig = path.join(CACHE, name + '.orig.png'); const input = fs.existsSync(orig) ? orig : file;
  const { data: ai, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const x0 = Math.max(0, c * tw - OV), y0 = Math.max(0, r * th - OV), x1 = Math.min(GW, (c + 1) * tw + OV), y1 = Math.min(GH, (r + 1) * th + OV);
  const { data: src } = await sharp(SRC).extract({ left: Math.round(x0 * sx), top: Math.round(y0 * sy), width: Math.round((x1 - x0) * sx), height: Math.round((y1 - y0) * sy) })
    .resize(W, H, { fit: 'fill' }).modulate({ saturation: 1.5, brightness: 1.02 }).linear([0.9, 1.06, 1.04], [-14, -6, -2]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // 원본 흰 영역(눈)을 넓게 잡아 둔다: 거기는 건드리지 않는다
  const R = Math.round(W / 60);
  const srcW = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) srcW[i] = white(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]) ? 1 : 0;
  const integ = new Uint32Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += srcW[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
  const near = (x, y) => { const a = Math.max(0, x - R), b = Math.max(0, y - R), cc = Math.min(W, x + R + 1), d = Math.min(H, y + R + 1); return integ[d * (W + 1) + cc] - integ[b * (W + 1) + cc] - integ[d * (W + 1) + a] + integ[b * (W + 1) + a]; };
  const mask = new Uint8Array(W * H); let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (white(ai[i * 3], ai[i * 3 + 1], ai[i * 3 + 2]) && near(x, y) === 0) { mask[i] = 1; n++; } }
  // 얼룩 둘레(밝은 회색 그림자)까지 조금 넓힌다
  const grow = new Uint8Array(mask); const G = Math.max(2, Math.round(W / 300));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) for (let dy = -G; dy <= G; dy++) for (let dx = -G; dx <= G; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) grow[yy * W + xx] = 1; }
  const frac = n / (W * H);
  console.log(name, 'white-not-in-source', (frac * 100).toFixed(2) + '%');
  if (frac < 0.002) continue;
  if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
  const out = Buffer.from(ai); for (let i = 0; i < W * H; i++) if (grow[i]) { out[i * 3] = src[i * 3]; out[i * 3 + 1] = src[i * 3 + 1]; out[i * 3 + 2] = src[i * 3 + 2]; }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file); changed++;
}
if (changed) execFileSync(process.execPath, [path.join(ROOT, 'mercenary/tools/pixel-map.mjs'), '--ai'], { stdio: 'inherit', cwd: path.join(ROOT, 'mercenary') });
console.log('cleaned tiles', changed);
