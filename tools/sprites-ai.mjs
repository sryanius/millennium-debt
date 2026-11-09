/**
 * 병사 도트(부대장·직업·적)를 로컬 ComfyUI(Z-Image-Turbo + 도트 LoRA Redmond)로 뽑아 격자로 되돌리고 한 장(units.png, 칸 32×40)으로 모은다.
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
import { fitFrame, gridPng, toGrid } from './sprite-grid.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'mercenary/tools/.cache/sprites/raw');
const DOC = path.join(ROOT, 'docs/mercenary/art-samples/units');
const PUB = path.join(ROOT, 'mercenary/public/art');
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(DOC, { recursive: true });
export const FW = 32, FH = 40;

const STYLE = ', 8-bit NES RPG battle sprite, tiny chibi proportions, very low resolution, chunky pixels, 12 colors, bold dark outline, flat colors, plain solid magenta background, single small character centered, full body, standing idle, no text';
/** 순서 = 프레임 번호(src/game/theme.ts UNIT_FRAME 과 같아야 한다) */
export const UNITS = [
  // 부대장 6
  ['kael', 'young human knight mercenary captain with short brown hair, blue cloak over steel breastplate, longsword, facing right'],
  ['brok', 'big green orc warrior with tusks, leather armor and fur, holding a great axe, facing right'],
  ['phoebe', 'small halfling merchant woman with curly brown hair, yellow vest and white blouse, holding a ledger book, facing right'],
  ['ella', 'half-elf archer woman with auburn hair and pointed ears, green hooded cloak, holding a longbow, facing right'],
  ['liesel', 'bard woman with blonde braid, red dress, holding a lute, facing right'],
  ['durin', 'dwarf engineer with long red beard, leather apron and iron helmet, holding a big hammer, facing right'],
  // 직업 19
  ['sword', 'mercenary swordsman in chainmail and brown leather, sword and round wooden shield, facing right'],
  ['heavy', 'heavy infantry soldier in full steel plate armor with closed helmet, tower shield and mace, facing right'],
  ['ironclad', 'stout dwarf soldier in thick iron plate armor, horned helmet, battle axe and iron shield, facing right'],
  ['crossbow', 'crossbowman in padded gambeson and cap, aiming a crossbow, facing right'],
  ['longbow', 'longbowman in green tunic and hood, drawing a tall longbow, facing right'],
  ['mage', 'battle mage in blue robe and pointed hat, holding a glowing staff, facing right'],
  ['merchant', 'plump merchant in purple coat with coin purse and ledger, facing right'],
  ['bard', 'bard in colorful tunic and feathered cap, playing a lute, facing right'],
  ['mason', 'stonemason in grey apron with hammer and chisel, facing right'],
  ['spear', 'spearman in leather armor and kettle helmet, long spear and small shield, facing right'],
  ['axe', 'orc axeman with green skin, bare chest with straps, two hand axes, facing right'],
  ['cavalry', 'armored knight riding a brown horse, lance and shield, facing right'],
  ['horsearcher', 'desert nomad horse archer in white robes riding a tan horse, drawing a short bow, facing right'],
  ['slinger', 'poor peasant slinger in ragged tunic swinging a sling, facing right'],
  ['ranger', 'elf ranger in dark green hooded cloak with long silver hair, elven longbow, facing right'],
  ['healer', 'priestess healer in white and gold robe, holding a glowing staff, facing right'],
  ['dancer', 'desert dancer woman in red and gold veils with bells, facing right'],
  ['carpenter', 'carpenter in brown tunic and tool belt, holding a saw and plank, facing right'],
  ['scribe', 'thin scribe with round glasses, ink-stained grey robe, quill and scroll, facing right'],
  // 적 10
  ['bandit', 'bandit in ragged brown clothes and red bandana, dagger, facing left'],
  ['banditArcher', 'bandit archer in ragged clothes and hood, short bow, facing left'],
  ['banditBoss', 'burly bandit boss with scar and fur coat, big cleaver, facing left'],
  ['rebel', 'grey hooded cultist soldier with ash-grey robe over armor, spear, facing left'],
  ['rebelCrossbow', 'grey hooded cultist crossbowman in ash-grey robe, crossbow, facing left'],
  ['rebelCaptain', 'grey cultist captain in dark steel armor and tattered grey cape, sword and skull banner, facing left'],
  ['priest', 'sinister grey priest in ash robe with skull staff glowing purple, facing left'],
  ['escort', 'debt collector guard mercenary in dark blue tabard and steel helmet, halberd, facing left'],
  ['golem', 'stone golem with glowing blue runes, heavy rocky body, facing right'],
  ['spearman', 'black-armored spearman with black spear and black cape, facing right'],
];
export const UNIT_INDEX = Object.fromEntries(UNITS.map(([k], i) => [k, i]));

const args = process.argv.slice(2);
const seed = Number(process.env.SEED ?? 7);
const todo = args.length ? UNITS.filter(([k]) => args.includes(k)) : UNITS.filter(([k]) => process.env.FORCE || !fs.existsSync(path.join(RAW, k + '.png')));
if (todo.length) await ensureComfy();
for (const [k, desc] of todo) {
  const t0 = Date.now();
  const buf = await run(wfZImage({ prompt: desc + STYLE, lora: 'redmond', seed: seed + k.length, width: 512, height: 512, steps: 8 }));
  fs.writeFileSync(path.join(RAW, k + '.png'), buf);
  console.log('ok', k, Math.round((Date.now() - t0) / 100) / 10 + 's');
}
// 격자로 되돌려 한 장에 모은다
const sheet = new Uint8Array(FW * UNITS.length * FH * 4);
const report = [];
for (const [k] of UNITS) {
  const raw = path.join(RAW, k + '.png'); if (!fs.existsSync(raw)) { report.push(k + ': 없음'); continue; }
  const g = await toGrid(fs.readFileSync(raw));
  const cell = await fitFrame(g, FW, FH);
  const i = UNIT_INDEX[k];
  for (let y = 0; y < FH; y++) sheet.set(cell.subarray(y * FW * 4, (y + 1) * FW * 4), (y * FW * UNITS.length + i * FW) * 4);
  fs.writeFileSync(path.join(DOC, k + '.png'), await gridPng(cell, FW, FH, 6));
  report.push(`${k}: 피치 ${g.pitch} 격자 ${g.grid.join('x')} 인물 ${g.w}x${g.h}${g.w > FW - 2 || g.h > FH - 2 ? ' → 칸에 맞춤' : ''}`);
}
fs.writeFileSync(path.join(PUB, 'units.png'), await gridPng(sheet, FW * UNITS.length, FH, 1));
fs.writeFileSync(path.join(DOC, 'sheet.png'), await gridPng(sheet, FW * UNITS.length, FH, 4));
console.log(report.join('\n'));
console.log('units.png', FW * UNITS.length + 'x' + FH, UNITS.length + ' frames');
