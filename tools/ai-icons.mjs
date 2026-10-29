/**
 * 거점 아이콘 AI 도트(로컬 ComfyUI, Z-Image-Turbo + 도트 LoRA).
 *   node tools/ai-icons.mjs gen      → tools/.cache/icons-ai/<kind>_<seed>.png (원본) + contact.png(고르기용)
 *   node tools/ai-icons.mjs build k=seed ...  → public/art/sites.png (48×48 × 9칸, 순서는 theme ICON 과 같다)
 * 배경은 단색(모서리 색)으로 그리게 하고 뽑아낸 뒤 → 자르고 → 46px 로 줄이고 → 24색 팔레트 → 검은 윤곽 1px.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { ensureComfy, run, wfZImage } from './comfy.mjs';
import { quantize } from './pixelize.mjs';

const DIR = 'tools/.cache/icons-ai';
const BG = 'isolated on a flat solid pure magenta background, no ground, no shadow, no text, single object centered, game map marker icon, three-quarter top-down view, bold readable silhouette';
const BG_G = BG.replace('magenta', 'green');
export const KINDS = [
  ['castleL', 'a grand medieval royal castle city with high stone walls, many towers and blue conical roofs, golden banners'],
  ['castleM', 'a medieval stone castle keep with two towers, red roofs and a curtain wall'],
  ['castleS', 'a small square wooden fort with tall log palisade walls, a wooden gate, one wooden watchtower with a small red flag'],
  ['gate', 'a fortified stone mountain pass gatehouse with a big arched gate between two rocky cliffs'],
  ['port', 'a small harbour with a wooden pier, a stone lighthouse and a moored sailing ship'],
  ['mine', 'a mine entrance dug into a grey rocky hill with wooden beams and a minecart of ore'],
  ['shrine', 'a small white marble temple shrine with a golden dome and columns'],
  ['trade', 'a merchant caravan market stall with a striped awning, crates, sacks and barrels'],
  ['rift', 'a glowing violet magical rift crack in the earth with floating dark crystals'],
];
const SEEDS = [11, 22, 33];
const EXTRA = { castleS: [44, 55, 66] };
const S = 48;

async function gen() {
  await ensureComfy(); fs.mkdirSync(DIR, { recursive: true });
  for (const [k, p] of KINDS) for (const seed of [...SEEDS, ...(EXTRA[k] ?? [])]) {
    const f = `${DIR}/${k}_${seed}.png`; if (fs.existsSync(f)) continue;
    const buf = await run(wfZImage({ prompt: p + ', ' + (k === 'rift' ? BG_G : BG), seed, width: 768, height: 768, lora: 'tarn', loraStrength: 0.9 }));
    fs.writeFileSync(f, buf); console.log('gen', f);
  }
  await contact();
}

/** 배경색(모서리 평균)과 가까운 칸을 투명하게 → 물체 상자로 자른 RGBA(raw) */
async function cutout(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height; const px = (x, y) => (y * w + x) * 3;
  const cs = [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]].map(([x, y]) => [data[px(x, y)], data[px(x, y) + 1], data[px(x, y) + 2]]);
  const bg = [0, 1, 2].map(c => cs.reduce((t, v) => t + v[c], 0) / 4);
  const out = Buffer.alloc(w * h * 4); let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = px(x, y); const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    const a = d < 70 ? 0 : d < 110 ? Math.round((d - 70) / 40 * 255) : 255;
    out[(y * w + x) * 4] = data[i]; out[(y * w + x) * 4 + 1] = data[i + 1]; out[(y * w + x) * 4 + 2] = data[i + 2]; out[(y * w + x) * 4 + 3] = a;
    if (a > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  // 배경색이 번진 가장자리: 색을 배경에서 멀어지게(분홍 테 제거)
  for (let i = 0; i < w * h; i++) { const a = out[i * 4 + 3]; if (a > 0 && a < 255) out[i * 4 + 3] = 0; }
  return { img: sharp(out, { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }) };
}

/** 48×48 도트 아이콘(RGBA raw) */
async function icon(file) {
  const { img } = await cutout(file);
  const inner = S - 2; // 윤곽 자리
  const { data, info } = await sharp(await img.png().toBuffer()).resize(inner, inner, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height; const rgb = Buffer.alloc(n * 3); const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) { rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; alpha[i] = data[i * 4 + 3] > 110 ? 1 : 0; }
  const q = quantize(rgb, info.width, info.height, 24);
  const out = Buffer.alloc(S * S * 4);
  const on = (x, y) => x >= 0 && y >= 0 && x < inner && y < inner && alpha[y * inner + x];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = x - 1, sy = y - 1; const o = (y * S + x) * 4;
    if (on(sx, sy)) { const i = sy * inner + sx; out[o] = q.data[i * 3]; out[o + 1] = q.data[i * 3 + 1]; out[o + 2] = q.data[i * 3 + 2]; out[o + 3] = 255; }
    else if (on(sx - 1, sy) || on(sx + 1, sy) || on(sx, sy - 1) || on(sx, sy + 1)) { out[o] = 20; out[o + 1] = 16; out[o + 2] = 24; out[o + 3] = 255; }
  }
  return out;
}

async function contact() {
  const cell = 96, cols = SEEDS.length + 3; const comps = [];
  for (let r = 0; r < KINDS.length; r++) for (let c = 0; c < cols; c++) {
    const f = `${DIR}/${KINDS[r][0]}_${[...SEEDS, 44, 55, 66][c]}.png`; if (!fs.existsSync(f)) continue;
    const raw = await icon(f);
    const big = await sharp(raw, { raw: { width: S, height: S, channels: 4 } }).resize(96, 96, { kernel: 'nearest' }).png().toBuffer();
    const orig = await sharp(f).resize(cell, cell).png().toBuffer();
    comps.push({ input: orig, left: c * cell * 2, top: r * cell }, { input: big, left: c * cell * 2 + cell, top: r * cell });
  }
  await sharp({ create: { width: cols * cell * 2, height: KINDS.length * cell, channels: 4, background: { r: 120, g: 140, b: 70, alpha: 1 } } }).composite(comps).png().toFile(`${DIR}/contact.png`);
  console.log('contact', `${DIR}/contact.png`);
}

async function build(picks) {
  const comps = [];
  for (let i = 0; i < KINDS.length; i++) {
    const k = KINDS[i][0]; const seed = picks[k] ?? SEEDS[0];
    const raw = await icon(`${DIR}/${k}_${seed}.png`);
    comps.push({ input: await sharp(raw, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer(), left: i * S, top: 0 });
  }
  await sharp({ create: { width: KINDS.length * S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile('public/art/sites.png');
  console.log('built public/art/sites.png', picks);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'gen') await gen();
else if (cmd === 'contact') await contact();
else if (cmd === 'build') await build(Object.fromEntries(rest.map(a => a.split('=')).map(([k, v]) => [k, Number(v)])));
else console.log('usage: gen | contact | build kind=seed ...');
