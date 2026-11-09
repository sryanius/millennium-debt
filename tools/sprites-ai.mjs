/**
 * 병사 도트(부대장·직업·적)를 로컬 ComfyUI(Z-Image-Turbo + 도트 LoRA)로 뽑아 한 장(units.png)으로 모은다.
 * 2026-11-09 사용자 선택: 화풍 G(16비트 표준, tarn59 LoRA) + 촘촘한 도트 — 칸 96×120 은 게임 캔버스 픽셀 1:1(설계 32×40 자리에 3배 촘촘하게).
 *   node mercenary/tools/sprites-ai.mjs            → 아직 없는 것만
 *   node mercenary/tools/sprites-ai.mjs kael axe   → 그것만 다시(씨앗을 바꾸려면 SEED=13)
 *   FORCE=1 → 전부 다시
 * 원본은 tools/.cache/sprites/raw/<키>.png, 격자(6배)는 docs/mercenary/art-samples/units/<키>.png
 * 모델이 그린 도트를 그대로 집는다(피치 추정) — 줄이거나 색을 깎지 않는다. 칸보다 1.5배 넘게 크면 그때만 2배 줄인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureComfy, run, wfZImage } from './comfy.mjs';
import { gridPng, isMagenta, toGrid } from './sprite-grid.mjs';
import { quantize } from './pixelize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'mercenary/tools/.cache/sprites/raw');
const DOC = path.join(ROOT, 'docs/mercenary/art-samples/units');
const PUB = path.join(ROOT, 'mercenary/public/art');
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(DOC, { recursive: true });
export const FW = 96, FH = 120;
/** 병사 키(캔버스 픽셀). 설계 38칸 × 3 */
const TARGET_H = 114;

const LORA = 'tarn';
const STYLE = (who) => `16-bit SNES JRPG side-view battle sprite of ${who}, about three heads tall, standing in a battle-ready stance, side view facing right, clean pixel art, three-tone shading, dark outline, plain flat solid magenta background, single character centered, full body from head to feet, no ground, no shadow, no text`;
/** 순서 = 프레임 번호(src/game/theme.ts UNIT_FRAME 과 같아야 한다) */
export const UNITS = [
  // 부대장 6
  ['kael', 'young human knight mercenary captain with short brown hair, blue cloak over steel breastplate, longsword'],
  ['brok', 'big green orc warrior with tusks, leather armor and fur, holding a great axe'],
  ['phoebe', 'small halfling merchant woman with curly brown hair, yellow vest and white blouse, holding a ledger book'],
  ['ella', 'half-elf archer woman with auburn hair and pointed ears, green hooded cloak, holding a longbow'],
  ['liesel', 'bard woman with blonde braid, red dress, holding a lute'],
  ['durin', 'dwarf engineer with long red beard, leather apron and iron helmet, holding a big hammer'],
  // 직업 19
  ['sword', 'mercenary swordsman in chainmail and brown leather, sword and round wooden shield'],
  ['heavy', 'heavy infantry soldier in full steel plate armor with closed helmet, tower shield and mace'],
  ['ironclad', 'stout dwarf soldier in thick iron plate armor, horned helmet, battle axe and iron shield'],
  ['crossbow', 'crossbowman in padded gambeson and cap, aiming a crossbow'],
  ['longbow', 'longbowman in green tunic and hood, drawing a tall longbow'],
  ['mage', 'battle mage in blue robe and pointed hat, holding a glowing staff'],
  ['merchant', 'plump merchant in purple coat with coin purse and ledger'],
  ['bard', 'bard in colorful tunic and feathered cap, playing a lute'],
  ['mason', 'stonemason craftsman in a plain cloth cap and dusty grey work apron over a brown tunic, no armor, holding a mallet and chisel'],
  ['spear', 'spearman in leather armor and kettle helmet, long spear and small shield'],
  ['axe', 'orc axeman with green skin, bare chest with straps, two hand axes'],
  ['cavalry', 'armored knight riding a brown horse, lance and shield'],
  ['horsearcher', 'desert nomad horse archer in white robes riding a tan horse, drawing a short bow'],
  ['slinger', 'poor peasant slinger in ragged tunic swinging a sling'],
  ['ranger', 'elf ranger in dark green hooded cloak with long silver hair, elven longbow'],
  ['healer', 'priestess healer in white and gold robe, holding a glowing staff'],
  ['dancer', 'desert dancer woman in red and gold veils with bells'],
  ['carpenter', 'carpenter in brown tunic and tool belt, holding a saw and plank'],
  ['scribe', 'thin scribe with round glasses, ink-stained grey robe, quill and scroll'],
  // 적 10
  ['bandit', 'bandit in ragged brown clothes and red bandana, dagger'],
  ['banditArcher', 'bandit archer in ragged clothes and hood, short bow'],
  ['banditBoss', 'tall burly bandit boss with a scarred face, black beard, fur-trimmed coat and iron pauldron, holding a big cleaver, imposing full body'],
  ['rebel', 'grey hooded cultist soldier with ash-grey robe over armor, spear'],
  ['rebelCrossbow', 'grey hooded cultist crossbowman in ash-grey robe, crossbow'],
  ['rebelCaptain', 'grey cultist captain in dark steel armor and tattered grey cape, sword and skull banner'],
  ['priest', 'sinister grey priest in ash robe with skull staff glowing purple'],
  ['escort', 'debt collector guard mercenary in dark blue tabard and steel helmet, halberd'],
  ['golem', 'stone golem with glowing blue runes, heavy rocky body'],
  ['spearman', 'black-armored spearman with black spear and black cape'],
];
export const UNIT_INDEX = Object.fromEntries(UNITS.map(([k], i) => [k, i]));

/**
 * 그림을 96×120 칸(캔버스 픽셀 1:1)에 넣는다. 모델이 그린 격자(피치 추정)가 키 ${TARGET_H}±16 이면 그 격자를 그대로 집고,
 * 아니면 인물 둘레를 잘라 키 TARGET_H 로 맞추고 32색으로 모은다(모델 격자가 더 촘촘할 때 — 실질적으로 격자 되찾기).
 */
async function fitFine(buf) {
  const g = await toGrid(buf);
  let w, h, px, how;
  if (g.h > 0 && Math.abs(g.h - TARGET_H) <= 16 && g.w <= FW - 2) { w = g.w; h = g.h; px = g.px; how = '격자 그대로(피치 ' + g.pitch + ', 키 ' + g.h + ')'; }
  else {
    const img = sharp(buf).ensureAlpha(); const { width: iw, height: ih } = await img.metadata();
    const { data } = await img.raw().toBuffer({ resolveWithObject: true }); const bg = [data[0], data[1], data[2]];
    let x0 = iw, y0 = ih, x1 = 0, y1 = 0;
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const i = (y * iw + x) * 4; if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 110 || isMagenta(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const cw = Math.max(1, x1 - x0 + 1), chh = Math.max(1, y1 - y0 + 1);
    h = TARGET_H; w = Math.max(1, Math.round(cw * h / chh)); if (w > FW - 2) { w = FW - 2; h = Math.max(1, Math.round(chh * w / cw)); }
    const cut = await sharp(Buffer.from(data), { raw: { width: iw, height: ih, channels: 4 } }).extract({ left: x0, top: y0, width: cw, height: chh }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
    const rgb = new Uint8Array(w * h * 3); const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { solid[i] = cut[i * 4 + 3] >= 128 ? 1 : 0; rgb[i * 3] = cut[i * 4]; rgb[i * 3 + 1] = cut[i * 4 + 1]; rgb[i * 3 + 2] = cut[i * 4 + 2]; }
    const q = quantize(rgb, w, h, 32); px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) if (solid[i]) { px[i * 4] = q.data[i * 3]; px[i * 4 + 1] = q.data[i * 3 + 1]; px[i * 4 + 2] = q.data[i * 3 + 2]; px[i * 4 + 3] = 255; }
    how = '키 ' + chh + 'px → ' + h + '칸(추정 격자 ' + g.h + ')';
  }
  const cell = new Uint8Array(FW * FH * 4); const ox = Math.floor((FW - w) / 2), oy = FH - h - 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= FW || ty >= FH) continue; cell.set(px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ty * FW + tx) * 4); }
  return { cell, how };
}

const args = process.argv.slice(2);
const seed = Number(process.env.SEED ?? 7);
const todo = args.length ? UNITS.filter(([k]) => args.includes(k)) : UNITS.filter(([k]) => process.env.FORCE || !fs.existsSync(path.join(RAW, k + '.png')));
if (todo.length) await ensureComfy();
for (const [k, desc] of todo) {
  const t0 = Date.now();
  const buf = await run(wfZImage({ prompt: STYLE(desc), lora: LORA, seed: seed + k.length, width: 512, height: 512, steps: 8 }));
  fs.writeFileSync(path.join(RAW, k + '.png'), buf);
  console.log('ok', k, Math.round((Date.now() - t0) / 100) / 10 + 's');
}
// 격자로 되돌려 한 장에 모은다
const sheet = new Uint8Array(FW * UNITS.length * FH * 4);
const report = [];
for (const [k] of UNITS) {
  const raw = path.join(RAW, k + '.png'); if (!fs.existsSync(raw)) { report.push(k + ': 없음'); continue; }
  const { cell, how } = await fitFine(fs.readFileSync(raw));
  const i = UNIT_INDEX[k];
  for (let y = 0; y < FH; y++) sheet.set(cell.subarray(y * FW * 4, (y + 1) * FW * 4), (y * FW * UNITS.length + i * FW) * 4);
  fs.writeFileSync(path.join(DOC, k + '.png'), await gridPng(cell, FW, FH, 2));
  report.push(k + ': ' + how);
}
fs.writeFileSync(path.join(PUB, 'units.png'), await gridPng(sheet, FW * UNITS.length, FH, 1));
fs.writeFileSync(path.join(DOC, 'sheet.png'), await gridPng(sheet, FW * UNITS.length, FH, 1));
console.log(report.join('\n'));
console.log('units.png', FW * UNITS.length + 'x' + FH, UNITS.length + ' frames');
