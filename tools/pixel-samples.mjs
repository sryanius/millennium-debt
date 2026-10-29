/**
 * 6단계 도트 아트 샘플 생성기. 의존성 없이 PNG 를 직접 쓴다.
 *   node mercenary/tools/pixel-samples.mjs  →  docs/mercenary/art-samples/*.png + mercenary/public/art/*.png
 * 팔레트 32색 고정(원작 하이리워드의 16색 느낌을 살리되 지형 단계를 위해 32색).
 * 산출물: palette, tiles(지형 4×4 + 장식), icons(거점 12×12), units(12×16), portraits(40×48), ui(틀·버튼·시계), mockup-map, mockup-battle
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const OUT = join(ROOT, 'docs', 'mercenary', 'art-samples');
const PUB = join(ROOT, 'mercenary', 'public', 'art');
mkdirSync(OUT, { recursive: true }); mkdirSync(PUB, { recursive: true });

// ───────── PNG ─────────
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); }
  set(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return; const o = (y * this.w + x) * 4; this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = c.length > 3 ? c[3] : 255; }
  get(x, y) { const o = (y * this.w + x) * 4; return [this.d[o], this.d[o + 1], this.d[o + 2], this.d[o + 3]]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  frame(x, y, w, h, c) { for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); } }
  blit(src, x, y, sx = 0, sy = 0, sw = src.w, sh = src.h, scale = 1) { for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const c = src.get(sx + i, sy + j); if (c[3] === 0) continue; if (scale === 1) this.set(x + i, y + j, c); else this.rect(x + i * scale, y + j * scale, scale, scale, c); } }
  /** 문자열 그림(글자 → 팔레트 키) */
  draw(x, y, rows, map) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const k = r[i]; if (k === '.' || k === ' ') continue; this.set(x + i, y + j, map[k]); } }); }
  line(x0, y0, x1, y1, c) { const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0); let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy; for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } }
  ellipse(cx, cy, rx, ry, fill, stroke) { for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) { const k = (x / rx) ** 2 + (y / ry) ** 2; if (k <= 1) this.set(cx + x, cy + y, fill); } if (stroke) for (let a = 0; a < 360; a += 0.5) { const r = a * Math.PI / 180; this.set(Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry), stroke); } }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 4 + 1)] = 0; raw.set(this.d.subarray(y * this.w * 4, (y + 1) * this.w * 4), y * (this.w * 4 + 1) + 1); }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
  save(name, scale = 1) { let img = this; if (scale > 1) { img = new Img(this.w * scale, this.h * scale); img.blit(this, 0, 0, 0, 0, this.w, this.h, scale); } const buf = img.png(); writeFileSync(join(OUT, name), buf); return buf; }
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

// ───────── 팔레트 32색 ─────────
export const PAL = {
  ink: '#1a1c2c', shadow: '#2e2a3a', stone0: '#4a4a56', stone1: '#7a7a86', stone2: '#aaaab4', snow: '#e8edf2', white: '#fbf6e8',
  earth0: '#3b2a1a', earth1: '#5c3f2a', earth2: '#8a6a3c', earth3: '#c9a66b', sand: '#e6cf8d', sand2: '#f3e3ad',
  grass0: '#243d20', grass1: '#3a6b2e', grass2: '#5f9a3c', grass3: '#9cc45a', grass4: '#d3e08f',
  water0: '#142c45', water1: '#1f4f7a', water2: '#3f7fbf', water3: '#8fc3e8',
  gold0: '#8a6a1c', gold1: '#e0b23c', gold2: '#f6e39a', red: '#b4302a', red2: '#e2654a', purple: '#6b3fa0', violet: '#a86fd1',
  skin0: '#8d5524', skin1: '#d9a066', skin2: '#f1c9a5', orc: '#6f9a4a', hair0: '#2b1b10', hair1: '#c8a44a', hair2: '#d9d2c2',
};
const P = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));
const T = [0, 0, 0, 0];

// ───────── 1. 팔레트표 ─────────
{
  const keys = Object.keys(P); const img = new Img(keys.length * 10, 12);
  keys.forEach((k, i) => { img.rect(i * 10, 0, 10, 12, P[k]); });
  img.save('palette.png', 4); writeFileSync(join(PUB, 'palette.png'), img.png());
}

// ───────── 2. 지형 타일 4×4 (지도 1칸 = 4px) + 장식 ─────────
// 각 지형 4변형: 디더링으로 단색 덩어리를 깨뜨린다
const TERRAIN = {
  p: ['grass2', 'grass3'], R: ['earth3', 'sand'], f: ['grass1', 'grass0'], h: ['earth3', 'grass3'], m: ['stone1', 'stone0'],
  s: ['grass1', 'water1'], w: ['water2', 'water3'], d: ['sand', 'sand2'], n: ['snow', 'white'], W: ['water1', 'water2'], x: ['purple', 'shadow'], F: ['water3', 'sand'],
};
const PATTERNS = [
  ['aaaa', 'aaaa', 'aaaa', 'aaaa'], ['aaaa', 'abaa', 'aaaa', 'aaab'], ['abaa', 'aaaa', 'aaba', 'aaaa'], ['aaaa', 'aaab', 'abaa', 'aaaa'],
];
const tiles = new Img(4 * 4 * 12, 4 + 8 + 8);
const tileKeys = Object.keys(TERRAIN);
tileKeys.forEach((k, ti) => PATTERNS.forEach((pat, v) => tiles.draw(ti * 16 + v * 4, 0, pat, { a: P[TERRAIN[k][0]], b: P[TERRAIN[k][1]] })));
// 장식 8×8: 나무, 침엽수, 산봉우리, 언덕, 갈대, 균열, 눈 바위, 야자
const DECO = {
  tree: ['...gg...', '..gggg..', '.gGGGGg.', '.gGGGgg.', '..gGgg..', '...tt...', '...tt...', '........'],
  pine: ['...g....', '..gGg...', '..gGg...', '.gGGGg..', '.gGgGg..', 'gGGGGGg.', '...tt...', '...tt...'],
  peak: ['...W....', '..WsS...', '..WsSS..', '.WssSSS.', '.WsSSSs.', 'WssSSSSs', 'sSSSSSss', '........'],
  hill: ['........', '........', '...hhh..', '..hHHHh.', '.hHHHHhh', 'hhHHhhhh', '........', '........'],
  reed: ['..g.g...', '..g.g.g.', '.gg.gg..', '..g.g.g.', '..g.g...', '........', '........', '........'],
  rift: ['...v....', '..vV....', '..vVv...', '.vVVv...', '..vVv...', '..vV....', '...v....', '........'],
  rock: ['........', '...ss...', '..sSSs..', '..sSSss.', '.ssSsss.', '........', '........', '........'],
  dune: ['........', '........', '..ddd...', '.dDDDdd.', 'dDDddddd', '........', '........', '........'],
};
const DM = { g: P.grass1, G: P.grass2, t: P.earth1, W: P.white, s: P.stone1, S: P.stone2, h: P.earth2, H: P.earth3, v: P.violet, V: P.purple, d: P.sand2, D: P.white };
Object.keys(DECO).forEach((k, i) => tiles.draw(i * 8, 4, DECO[k], DM));
tiles.save('tiles.png', 4); writeFileSync(join(PUB, 'tiles.png'), tiles.png());

// ───────── 3. 거점 아이콘 12×12 ─────────
const ICON = {
  castleL: ['......oyo.......', '......oyyo......', '..o...oyo...o...', '.oro..oGo..oro..', '.orro.oGo.orro..', '.oGGooGGGooGGo..', '.oGGGGGGGGGGGo..', '.oGWGGrrrGGGWGo.', '.oGGGGrrrGGGGGo.', '.oGGWGGGGGGWGGo.', 'oGGGGGdddGGGGGGo', 'oGGGGGdDdGGGGGGo', 'oGGGGGdDdGGGGGGo', 'oooooooooooooooo', '................', '................'],
  castleM: ['................', '......oyo.......', '......oyyo......', '......oGo.......', '..o.o.oGo.o.o...', '..oGoooGoooGo...', '..oGGGGrrGGGo...', '..oGWGGrrGGWo...', '..oGGGGGGGGGo...', '.ooGGGdDdGGGoo..', '.oGGGGdDdGGGGo..', '.oooooooooooo...', '................', '................', '................', '................'],
  castleS: ['................', '................', '......oyo.......', '......oGo.......', '....o.oGo.o.....', '....oGoGoGo.....', '....oGGrrGo.....', '....oGGrrGo.....', '...ooGGGGGoo....', '...oGGdDdGGo....', '...oooooooooo...', '................', '................', '................', '................', '................'],
  gate: ['................', '................', '................', '....oo....oo....', '....oSo..oSo....', '....oSoooooSo...', '....oSSSSSSSo...', '....oSSSddSSo...', '....oSSSdDSSo...', '....oSSSdDSSo...', '....oooooooo....', '................', '................', '................', '................', '................'],
  port: ['................', '................', '.......o........', '.......oW.......', '.......oWW......', '.......oWWW.....', '.......o........', '.....ooooooo....', '......oeeeeo....', '..wwwwooooowww..', '..WwWwWwWwWwWw..', '................', '................', '................', '................', '................'],
  mine: ['................', '................', '................', '......oooo......', '.....oSSSSo.....', '....oSSooSSo....', '....oSo..oSo....', '....oSo..oSo....', '...ooooooooooo..', '...oeeeeeeeeeo..', '...ooooooooooo..', '................', '................', '................', '................', '................'],
  shrine: ['.......o........', '......oyo.......', '.......o........', '......ooo.......', '.....oWWWo......', '....oWWWWWo.....', '....oWoWoWo.....', '....oWoWoWo.....', '...oooooooooo...', '................', '................', '................', '................', '................', '................', '................'],
  trade: ['................', '................', '................', '.....oooooo.....', '....oeeeeeeo....', '...oeeyyyyeeo...', '...oeeyyyyeeo...', '...oeeeeeeeeo...', '...oee.oo.eeo...', '...oee.oo.eeo...', '...oooooooooo...', '................', '................', '................', '................', '................'],
  rift: ['................', '.......v........', '......vVv.......', '.....vVVVv......', '.....vVVVv......', '....vVVVVVv.....', '.....vVVVv......', '......vVv.......', '.......v........', '................', '................', '................', '................', '................', '................', '................'],
  flagBlue: ['o...............', 'oBBBBB..........', 'oBBBBBB.........', 'oBBBBB..........', 'o...............', 'o...............', 'o...............', 'o...............', 'oo..............', '................', '................', '................', '................', '................', '................', '................'],
  flagRed: ['o...............', 'oRRRRR..........', 'oRRRRRR.........', 'oRRRRR..........', 'o...............', 'o...............', 'o...............', 'o...............', 'oo..............', '................', '................', '................', '................', '................', '................', '................'],
  flagPurple: ['o...............', 'oVVVVV..........', 'oVVVVVV.........', 'oVVVVV..........', 'o...............', 'o...............', 'o...............', 'o...............', 'oo..............', '................', '................', '................', '................', '................', '................', '................'],
  flagGold: ['o...............', 'oyyyyy..........', 'oyyyyyy.........', 'oyyyyy..........', 'o...............', 'o...............', 'o...............', 'o...............', 'oo..............', '................', '................', '................', '................', '................', '................', '................'],
};
const IM = { o: P.ink, G: P.stone2, g: P.stone1, S: P.stone1, y: P.gold1, W: P.white, w: P.water3, d: P.earth1, D: P.earth2, e: P.earth2, B: P.water2, R: P.red, V: P.violet, v: P.purple, r: P.red };
const ICON_W = 16;
const icons = new Img(ICON_W * Object.keys(ICON).length, ICON_W);
Object.keys(ICON).forEach((k, i) => icons.draw(i * ICON_W, 0, ICON[k], IM));
icons.save('icons.png', 4); writeFileSync(join(PUB, 'icons.png'), icons.png());

// ───────── 4. 병사·부대장 도트 12×16 ─────────
// 기본 틀 + 장비 차이. s=피부 h=머리 b=몸 a=갑옷 w=무기 c=망토
function unit(opts) {
  const { skin = 'skin2', hair = 'hair0', body = 'earth1', armor = null, weapon = 'sword', cape = null, big = false, helm = false, beard = false, hat = null } = opts;
  const M = { o: P.ink, s: P[skin], h: P[hair], b: P[body], a: armor ? P[armor] : P[body], w: P.stone2, W: P.gold1, c: cape ? P[cape] : T, e: P.white, m: P.earth0, r: P.red, p: P.purple, g: P.grass1, k: P.stone0 };
  const rows = [
    helm ? '....kkkk....' : hat === 'wizard' ? '.....pp.....' : hat === 'cap' ? '....rrrr....' : '....hhhh....',
    helm ? '...kkkkkk...' : hat === 'wizard' ? '....pppp....' : '...hhhhhh...',
    helm ? '...ksskkk...' : hat === 'wizard' ? '..pppppppp..' : '...hsshsh...',
    '...ssossos..',
    beard ? '...shhhhss..' : '...ssssss...',
    beard ? '....hhhh....' : '....ssss....',
    '..caaaaaac..',
    '.caaaaaaaac.',
    '.c.aaaaaa.c.',
    'ss.bbbbbb.ss',
    '...bbbbbb...',
    '...bb..bb...',
    '...bb..bb...',
    '...oo..oo...',
    '..ooo..ooo..',
    '............',
  ];
  const img = new Img(12, 16); img.draw(0, 0, rows, M);
  // 무기
  if (weapon === 'sword') { img.line(10, 5, 10, 11, P.stone2); img.set(10, 11, P.gold1); img.set(9, 11, P.gold1); img.set(11, 11, P.gold1); }
  if (weapon === 'spear') { img.line(10, 1, 10, 13, P.earth2); img.set(10, 0, P.stone2); img.set(10, 1, P.stone2); }
  if (weapon === 'bow') { img.line(10, 4, 10, 12, P.earth2); img.set(9, 5, P.earth2); img.set(9, 11, P.earth2); img.set(11, 8, P.stone2); }
  if (weapon === 'crossbow') { img.rect(8, 8, 4, 1, P.earth2); img.rect(9, 7, 1, 3, P.stone0); img.set(11, 8, P.stone2); }
  if (weapon === 'staff') { img.line(10, 2, 10, 13, P.earth2); img.set(10, 1, P.violet); img.set(10, 2, P.violet); }
  if (weapon === 'hammer') { img.line(10, 5, 10, 12, P.earth2); img.rect(9, 4, 3, 2, P.stone0); }
  if (weapon === 'lute') { img.rect(8, 8, 3, 3, P.earth3); img.line(10, 4, 10, 8, P.earth1); }
  if (weapon === 'ledger') { img.rect(8, 8, 3, 3, P.white); img.frame(8, 8, 3, 3, P.earth1); }
  if (weapon === 'axe') { img.line(10, 5, 10, 12, P.earth2); img.rect(9, 4, 3, 3, P.stone2); img.set(9, 5, P.stone0); }
  if (weapon === 'club') { img.line(10, 5, 10, 12, P.earth1); img.rect(9, 3, 3, 3, P.earth0); }
  if (big) { img.rect(2, 6, 8, 5, P[armor ?? body]); img.frame(2, 6, 8, 5, P.ink); }
  return img;
}
const UNITS = {
  kael: { skin: 'skin2', hair: 'hair0', armor: 'stone1', weapon: 'sword', cape: 'water2' },
  brok: { skin: 'orc', hair: 'hair0', armor: 'earth1', weapon: 'axe', big: true },
  phoebe: { skin: 'skin2', hair: 'hair1', body: 'grass1', weapon: 'ledger' },
  ella: { skin: 'skin2', hair: 'hair2', body: 'grass1', armor: 'grass1', weapon: 'bow', cape: 'grass2' },
  liesel: { skin: 'skin1', hair: 'hair0', body: 'red', weapon: 'lute', cape: 'red2' },
  durin: { skin: 'skin1', hair: 'hair1', armor: 'stone0', weapon: 'hammer', beard: true, helm: true },
  sword: { skin: 'skin2', hair: 'hair0', armor: 'stone1', weapon: 'sword' },
  heavy: { skin: 'skin2', hair: 'hair0', armor: 'stone0', weapon: 'sword', helm: true, big: true },
  crossbow: { skin: 'skin2', hair: 'hair0', body: 'earth1', weapon: 'crossbow', hat: 'cap' },
  longbow: { skin: 'skin2', hair: 'hair1', body: 'grass1', weapon: 'bow' },
  mage: { skin: 'skin2', hair: 'hair2', body: 'purple', weapon: 'staff', hat: 'wizard' },
  merchant: { skin: 'skin2', hair: 'hair1', body: 'earth2', weapon: 'ledger' },
  bard: { skin: 'skin1', hair: 'hair0', body: 'red', weapon: 'lute' },
  mason: { skin: 'skin1', hair: 'hair0', body: 'earth1', weapon: 'hammer' },
  bandit: { skin: 'skin1', hair: 'hair0', body: 'earth0', weapon: 'club', hat: 'cap' },
  banditArcher: { skin: 'skin1', hair: 'hair0', body: 'earth0', weapon: 'bow' },
  rebel: { skin: 'skin2', hair: 'hair2', body: 'stone0', armor: 'stone0', weapon: 'sword', cape: 'purple' },
  priest: { skin: 'skin2', hair: 'hair2', body: 'purple', weapon: 'staff' },
  escort: { skin: 'skin2', hair: 'hair0', armor: 'gold0', weapon: 'spear' },
  ironclad: { skin: 'skin1', hair: 'hair1', armor: 'stone2', weapon: 'axe', helm: true, big: true, beard: true },
  golem: { skin: 'stone1', hair: 'stone0', armor: 'stone0', weapon: 'none', big: true, helm: true },
};
const units = new Img(12 * Object.keys(UNITS).length, 16);
Object.keys(UNITS).forEach((k, i) => units.blit(unit(UNITS[k]), i * 12, 0));
units.save('units.png', 4); writeFileSync(join(PUB, 'units.png'), units.png());

// ───────── 5. 초상 40×48 ─────────
function portrait(o) {
  const { skin = 'skin2', hair = 'hair0', eyes = 'ink', bg = 'earth0', style = 'short', race = 'human', cloth = 'earth1', trim = 'gold1', beard = false, scar = false, smile = false } = o;
  const img = new Img(40, 48); img.rect(0, 0, 40, 48, P[bg]);
  // 배경 질감(대각 디더)
  for (let y = 0; y < 48; y++) for (let x = 0; x < 40; x++) if ((x + y) % 6 === 0) img.set(x, y, P.shadow);
  const S = P[skin], Sd = mix(P[skin], P.ink, 0.35), Sl = mix(P[skin], P.white, 0.35), H = P[hair], Hd = mix(P[hair], P.ink, 0.4);
  // 어깨·옷
  img.rect(4, 38, 32, 10, P[cloth]); img.rect(4, 38, 32, 1, mix(P[cloth], P.white, 0.3)); img.rect(16, 38, 8, 10, P[trim]); img.rect(18, 40, 4, 8, P[cloth]);
  // 목
  img.rect(16, 32, 8, 7, Sd); img.rect(17, 32, 6, 6, S);
  // 얼굴 타원
  const fw = race === 'halfling' ? 11 : race === 'orc' ? 13 : 12, fh = race === 'dwarf' ? 12 : 13;
  img.ellipse(20, 22, fw, fh, S);
  for (let y = 10; y < 36; y++) for (let x = 8; x < 33; x++) { const c = img.get(x, y); if (c[0] === S[0] && c[1] === S[1] && c[2] === S[2] && x > 26) img.set(x, y, Sd); }
  img.ellipse(20, 22, fw, fh, null, Sd);
  // 귀
  if (race === 'elf' || race === 'half') { img.draw(5, 16, ['...s', '..ss', '.sss', 'ssss', '.ss.'], { s: S }); img.draw(31, 16, ['s...', 'ss..', 'sss.', 'ssss', '.ss.'], { s: Sd }); }
  else { img.rect(7, 20, 2, 5, S); img.rect(31, 20, 2, 5, Sd); }
  // 머리
  if (style === 'short') { img.ellipse(20, 14, fw + 1, 7, H); img.rect(8, 14, 25, 3, H); img.rect(8, 11, 3, 8, H); img.rect(30, 11, 3, 8, H); }
  if (style === 'long') { img.ellipse(20, 14, fw + 1, 7, H); img.rect(7, 14, 4, 20, H); img.rect(29, 14, 4, 20, H); img.rect(8, 30, 3, 6, Hd); img.rect(29, 30, 3, 6, Hd); }
  if (style === 'curly') { img.ellipse(20, 13, fw + 2, 8, H); for (let i = 0; i < 14; i++) img.set(7 + i * 2, 9 + (i % 3), Hd); img.rect(7, 13, 3, 9, H); img.rect(30, 13, 3, 9, H); }
  if (style === 'mohawk') { img.rect(17, 4, 6, 10, H); img.rect(18, 3, 4, 2, Hd); }
  if (style === 'braid') { img.ellipse(20, 14, fw + 1, 7, H); img.rect(8, 14, 25, 3, H); img.rect(29, 14, 4, 22, H); for (let y = 16; y < 36; y += 3) img.rect(29, y, 4, 1, Hd); }
  if (style === 'hood') { img.ellipse(20, 15, fw + 3, 10, P[cloth]); img.rect(5, 15, 30, 6, P[cloth]); img.ellipse(20, 20, fw - 1, 9, S); }
  // 눈썹·눈
  const ey = race === 'dwarf' ? 21 : 20;
  img.rect(13, ey - 3, 5, 1, Hd); img.rect(22, ey - 3, 5, 1, Hd);
  img.rect(14, ey, 3, 2, P.white); img.rect(23, ey, 3, 2, P.white); img.set(15, ey, P[eyes]); img.set(15, ey + 1, P[eyes]); img.set(24, ey, P[eyes]); img.set(24, ey + 1, P[eyes]);
  // 코·입
  img.set(20, ey + 4, Sd); img.set(20, ey + 5, Sd); img.set(21, ey + 5, Sd);
  if (smile) { img.rect(17, ey + 8, 7, 1, Sd); img.set(16, ey + 7, Sd); img.set(24, ey + 7, Sd); } else img.rect(17, ey + 8, 6, 1, Sd);
  if (race === 'orc') { img.set(17, ey + 7, P.white); img.set(23, ey + 7, P.white); img.set(17, ey + 6, P.white); img.set(23, ey + 6, P.white); }
  if (beard) { img.rect(11, ey + 6, 18, 10, H); img.rect(13, ey + 16, 14, 3, H); img.rect(17, ey + 8, 6, 1, Sd); for (let y = ey + 7; y < ey + 19; y += 2) img.rect(12 + (y % 4), y, 1, 1, Hd); }
  if (scar) { img.line(24, ey - 4, 27, ey + 4, P.red2); }
  // 볼 하이라이트
  img.set(12, ey + 4, Sl); img.set(13, ey + 4, Sl);
  // 테두리
  img.frame(0, 0, 40, 48, P.gold0); img.frame(1, 1, 38, 46, P.gold1);
  return img;
}
function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), 255]; }
const PORTRAITS = {
  kael: { skin: 'skin2', hair: 'hair0', style: 'short', cloth: 'stone1', trim: 'water2', scar: true, bg: 'water0' },
  brok: { skin: 'orc', hair: 'hair0', style: 'mohawk', race: 'orc', cloth: 'earth1', trim: 'red', bg: 'earth0' },
  phoebe: { skin: 'skin2', hair: 'hair1', style: 'curly', race: 'halfling', cloth: 'grass1', trim: 'gold1', smile: true, bg: 'grass0' },
  ella: { skin: 'skin2', hair: 'hair2', style: 'long', race: 'half', cloth: 'grass1', trim: 'grass3', eyes: 'water1', bg: 'grass0' },
  liesel: { skin: 'skin1', hair: 'hair0', style: 'braid', cloth: 'red', trim: 'gold2', smile: true, bg: 'purple' },
  durin: { skin: 'skin1', hair: 'hair1', style: 'short', race: 'dwarf', cloth: 'stone0', trim: 'gold1', beard: true, bg: 'stone0' },
  tobias: { skin: 'skin2', hair: 'hair2', style: 'short', race: 'halfling', cloth: 'earth0', trim: 'gold1', bg: 'gold0' },
  rohan: { skin: 'skin1', hair: 'hair0', style: 'hood', cloth: 'ink', trim: 'red', scar: true, bg: 'shadow' },
};
const ports = new Img(40 * Object.keys(PORTRAITS).length, 48);
Object.keys(PORTRAITS).forEach((k, i) => ports.blit(portrait(PORTRAITS[k]), i * 40, 0));
ports.save('portraits.png', 3); writeFileSync(join(PUB, 'portraits.png'), ports.png());

// ───────── 6. UI: 창 틀(9분할 8px), 버튼, 시계, 깃발 칸 ─────────
const ui = new Img(64, 48);
// 창 틀 24×24 (9분할용)
ui.rect(0, 0, 24, 24, P.earth0); ui.frame(0, 0, 24, 24, P.gold0); ui.frame(1, 1, 22, 22, P.gold1); ui.frame(2, 2, 20, 20, P.earth1);
[[0, 0], [21, 0], [0, 21], [21, 21]].forEach(([x, y]) => { ui.rect(x, y, 3, 3, P.gold2); ui.set(x + 1, y + 1, P.gold0); });
// 제목 줄 24×6
ui.rect(24, 0, 24, 6, P.gold0); ui.rect(24, 0, 24, 1, P.gold1); ui.rect(24, 5, 24, 1, P.shadow);
// 버튼 16×8 보통/눌림
ui.rect(24, 8, 16, 8, P.earth1); ui.frame(24, 8, 16, 8, P.gold1); ui.rect(25, 9, 14, 1, P.gold2);
ui.rect(40, 8, 16, 8, P.earth0); ui.frame(40, 8, 16, 8, P.gold0);
// 반원 시계 24×12
for (let y = 0; y <= 12; y++) for (let x = -12; x <= 12; x++) { const d = Math.hypot(x, y); if (d <= 12 && y >= 0) ui.set(12 + x, 36 + 11 - y, d > 11 ? P.gold1 : d > 10 ? P.gold0 : P.earth0); }
for (let a = 0; a <= 4; a++) { const r = Math.PI + a * Math.PI / 4; ui.set(Math.round(12 + Math.cos(r) * 9), Math.round(47 + Math.sin(r) * 9), P.gold2); }
ui.line(12, 47, 12 + Math.round(Math.cos(Math.PI * 1.3) * 8), 47 + Math.round(Math.sin(Math.PI * 1.3) * 8), P.white);
// 부대 칸 22×11
ui.rect(26, 20, 22, 11, P.earth0); ui.frame(26, 20, 22, 11, P.gold0); ui.rect(27, 21, 20, 1, P.gold1);
ui.save('ui.png', 4); writeFileSync(join(PUB, 'ui.png'), ui.png());

// ───────── 7. 메인 화면 목업 480×270 (실제 지도 데이터, 남서 곡창 샹파르 근처) ─────────
const map = JSON.parse(readFileSync(join(ROOT, 'docs/grand-strategy/data/world/map.json'), 'utf8'));
const sites = JSON.parse(readFileSync(join(ROOT, 'docs/grand-strategy/data/world/sites.json'), 'utf8'));
const byId = Object.fromEntries(sites.map(s => [s.id, s]));
function seeded(n) { let t = n >>> 0; return () => { t = (t + 0x6d2b79f5) | 0; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function renderMap(ox, oy, cellsW, cellsH, scale = 4) {
  const img = new Img(cellsW * scale, cellsH * scale); const rnd = seeded(7);
  for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
    const ch = (map.terrain[oy + cy] ?? '')[ox + cx] ?? 'W'; const k = tileKeys.indexOf(ch); const v = Math.floor(rnd() * 4);
    img.blit(tiles, cx * scale, cy * scale, (k < 0 ? 0 : k) * 16 + v * 4, 0, 4, 4);
  }
  // 해안선: 물 옆 땅에 밝은 모래 1픽셀
  for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
    const ch = (map.terrain[oy + cy] ?? '')[ox + cx]; if (ch !== 'W') continue;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const n = (map.terrain[oy + cy + dy] ?? '')[ox + cx + dx]; if (n && n !== 'W' && n !== 'w' && n !== 'F') { for (let i = 0; i < 4; i++) img.set((cx + dx) * scale + (dx === 1 ? 0 : dx === -1 ? 3 : i), (cy + dy) * scale + (dy === 1 ? 0 : dy === -1 ? 3 : i), P.sand2); } });
  }
  // 장식(숲·산·언덕·늪·균열·설원 바위·사막 언덕): 듬성듬성
  for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
    const ch = (map.terrain[oy + cy] ?? '')[ox + cx]; const r = rnd();
    const deco = ch === 'f' ? (r < 0.22 ? 'tree' : r < 0.3 ? 'pine' : null) : ch === 'm' ? (r < 0.2 ? 'peak' : null) : ch === 'h' ? (r < 0.12 ? 'hill' : null) : ch === 's' ? (r < 0.2 ? 'reed' : null) : ch === 'x' ? (r < 0.5 ? 'rift' : null) : ch === 'n' ? (r < 0.06 ? 'rock' : null) : ch === 'd' ? (r < 0.08 ? 'dune' : null) : null;
    if (deco) img.blit(tiles, cx * scale - 2, cy * scale - 4, Object.keys(DECO).indexOf(deco) * 8, 4, 8, 8);
  }
  return img;
}
{
  const ox = 42, oy = 134, cw = 120, chh = 68; // 샹파르(70,170) 근처 120×68칸 → 480×272
  const m = renderMap(ox, oy, cw, chh);
  const img = new Img(480, 270); img.blit(m, 0, 0, 0, 0, 480, 270);
  const labels = [];
  const toS = s => [(s.pos[0] - ox) * 4 + 2, (s.pos[1] - oy) * 4 + 2];
  // 도로(어두운 선 + 밝은 선)
  const drawn = new Set();
  for (const s of sites) for (const a of s.adjacent) { const k = [s.id, a].sort().join('|'); if (drawn.has(k) || !byId[a]) continue; drawn.add(k); const [x0, y0] = toS(s), [x1, y1] = toS(byId[a]); img.line(x0, y0 + 1, x1, y1 + 1, P.earth0); img.line(x0, y0, x1, y1, P.earth3); }
  // 거점 아이콘
  const iconIdx = Object.keys(ICON);
  for (const s of sites) { const [x, y] = toS(s); if (x < -12 || y < -12 || x > 492 || y > 282) continue; const kind = s.kind === 'castle' ? (s.size >= 5 ? 'castleL' : s.size >= 3 ? 'castleM' : 'castleS') : s.kind === 'gate' || s.kind === 'ward_tower' ? 'gate' : s.kind === 'port' ? 'port' : s.kind === 'mine' ? 'mine' : s.kind === 'shrine' ? 'shrine' : s.kind === 'trade_post' ? 'trade' : 'rift'; img.blit(icons, x - 8, y - 13, iconIdx.indexOf(kind) * 16, 0, 16, 16); if (s.owner === 'fac_10') img.blit(icons, x + 6, y - 20, iconIdx.indexOf('flagRed') * 16, 0, 16, 16); labels.push({ name: s.name, x, y: y + 4, kind: s.kind, size: s.size }); }
  // 부대 깃발 + 부대장 도트(샹파르에 6, 오르블랑 쪽 길에 1)
  const [cx, cy] = toS(byId.C028); const unitIdx = Object.keys(UNITS);
  ['kael', 'brok', 'phoebe', 'ella', 'liesel', 'durin'].forEach((k, i) => { img.blit(icons, cx - 8 + i * 5, cy - 22 - (i % 2) * 2, iconIdx.indexOf(i === 0 ? 'flagGold' : 'flagBlue') * 16, 0, 16, 16); });
  img.blit(units, cx - 4, cy - 20, unitIdx.indexOf('kael') * 12, 0, 12, 16);
  const [ox2, oy2] = toS(byId.P090); img.blit(units, ox2 + 6, oy2 - 18, unitIdx.indexOf('phoebe') * 12, 0, 12, 16); img.blit(icons, ox2 + 10, oy2 - 24, iconIdx.indexOf('flagBlue') * 16, 0, 16, 16);
  // 떠돌이 도적 깃발
  const [bx, by] = toS(byId.P076); img.blit(icons, bx + 4, by - 20, iconIdx.indexOf('flagRed') * 16, 0, 16, 16); img.blit(units, bx - 2, by - 18, unitIdx.indexOf('bandit') * 12, 0, 12, 16);
  // UI 틀
  const panel = (x, y, w, h) => { img.rect(x, y, w, h, P.earth0); img.frame(x, y, w, h, P.gold0); img.frame(x + 1, y + 1, w - 2, h - 2, P.gold1); [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]].forEach(([a, b]) => { img.rect(a, b, 3, 3, P.gold2); img.set(a + 1, b + 1, P.gold0); }); };
  panel(2, 2, 72, 52); // 세계 축소 지도
  { const mini = renderMap(0, 0, 320, 220, 1); for (let y = 0; y < 46; y++) for (let x = 0; x < 66; x++) { const c = mini.get(Math.floor(x * 320 / 66), Math.floor(y * 220 / 46)); img.set(5 + x, 5 + y, c); } img.frame(5 + Math.round(ox * 66 / 320), 5 + Math.round(oy * 46 / 220), Math.round(cw * 66 / 320), Math.round(chh * 46 / 220), P.white); }
  panel(408, 2, 70, 18); [0, 1, 2].forEach(i => { img.rect(412 + i * 22, 5, 18, 12, P.earth1); img.frame(412 + i * 22, 5, 18, 12, P.gold1); });
  img.draw(417, 8, ['oo.oo', 'oo.oo', 'oo.oo', 'oo.oo', 'oo.oo', 'oo.oo'], { o: P.white }); // ⏸
  img.draw(440, 7, ['o.....', 'oyyyy.', 'oyyyyy', 'oyyyy.', 'o.....', 'o.....', 'o.....', 'oo....'], { o: P.ink, y: P.gold1 });
  img.draw(461, 7, ['..oo..', '.oooo.', 'oo..oo', 'oo..oo', '.oooo.', '..oo..'], { o: P.white });
  panel(2, 226, 100, 42); img.blit(ui, 6, 232, 0, 36, 24, 12, 1); // 시계
  panel(362, 226, 116, 42);
  // 부대 6칸
  for (let i = 0; i < 6; i++) { const x = 104 + i * 44; img.rect(x, 246, 42, 22, P.earth0); img.frame(x, 246, 42, 22, i === 0 ? P.gold1 : P.gold0); img.blit(ports, x + 2, 248, i * 40, 0, 40, 48, 1); img.rect(x + 2, 248, 14, 18, T); for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 14; xx++) img.set(x + 2 + xx, y2(yy) , null); }
  function y2(v) { return v; }
  for (let i = 0; i < 6; i++) { const x = 104 + i * 44; img.rect(x + 1, 247, 40, 20, P.earth0); img.frame(x, 246, 42, 22, i === 0 ? P.gold1 : P.gold0); const pimg = new Img(14, 18); pimg.blit(ports, -13 - 0, -10, i * 40 + 0, 0, 40, 48); img.blit(pimg, x + 2, 248); img.rect(x + 18, 249, 20, 3, P.red); img.rect(x + 18, 249, 14, 3, P.grass2); img.rect(x + 18, 253, 20, 3, P.earth1); img.rect(x + 18, 253, 6, 3, P.gold1); }
  // 소식 줄
  img.rect(104, 226, 256, 12, P.earth0); img.frame(104, 226, 256, 12, P.gold0);
  img.save('mockup-map.png', 3); writeFileSync(join(PUB, 'mockup-map.png'), img.png());
  writeFileSync(join(PUB, 'mockup-labels.json'), JSON.stringify(labels));
}

// ───────── 8. 전투 화면 목업 ─────────
{
  const ox = 42, oy = 134; const img = new Img(480, 270); img.blit(renderMap(ox, oy, 120, 68), 0, 0, 0, 0, 480, 270);
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) { const c = img.get(x, y); img.set(x, y, mix(c, P.ink, 0.35)); }
  // 타원 전장: 흙 바닥 + 디더
  img.ellipse(240, 127, 196, 96, P.earth3, P.gold0); for (let y = 31; y < 224; y++) for (let x = 44; x < 436; x++) { if (((x / 196 - 240 / 196) ** 2 + (y / 96 - 127 / 96) ** 2) <= 1 && (x * 7 + y * 13) % 11 === 0) img.set(x, y, P.earth2); }
  img.ellipse(240, 127, 196, 96, null, P.gold1); img.ellipse(240, 127, 197, 97, null, P.gold0);
  const unitIdx = Object.keys(UNITS);
  const stamp = (k, x, y, hp = 1) => { img.rect(x + 2, y + 15, 8, 2, P.shadow); img.blit(units, x, y, unitIdx.indexOf(k) * 12, 0, 12, 16); img.rect(x + 2, y - 3, 8, 1, P.ink); img.rect(x + 2, y - 3, Math.round(8 * hp), 1, hp > 0.5 ? P.grass2 : P.red); };
  // 아군 횡대(오른쪽) 부대장 + 대원 8
  stamp('kael', 300, 120); [['sword', 272, 88], ['sword', 272, 104], ['heavy', 272, 120], ['heavy', 272, 136], ['crossbow', 320, 96], ['crossbow', 320, 112], ['longbow', 320, 128, 0.4], ['mage', 320, 144]].forEach(([k, x, y, hp]) => stamp(k, x, y, hp ?? 1));
  // 적(왼쪽) 도적단
  [['bandit', 160, 92], ['bandit', 150, 110, 0.3], ['banditArcher', 130, 100], ['bandit', 170, 128], ['banditArcher', 128, 134], ['bandit', 158, 148], ['bandit', 176, 160, 0.6]].forEach(([k, x, y, hp]) => stamp(k, x, y, hp ?? 1));
  // 섬광·화살
  img.line(331, 100, 182, 96, P.gold2); img.line(331, 116, 164, 116, P.white); img.set(163, 116, P.red2); img.set(162, 117, P.red2);
  img.line(331, 148, 140, 140, P.violet); img.rect(136, 136, 5, 5, P.violet); img.rect(137, 137, 3, 3, P.white);
  // 좌상 적 패널 / 우상 아군 패널
  const panel = (x, y, w, h) => { img.rect(x, y, w, h, P.earth0); img.frame(x, y, w, h, P.gold0); img.frame(x + 1, y + 1, w - 2, h - 2, P.gold1); };
  panel(2, 20, 126, 62); for (let r = 0; r < 7; r++) { img.blit(units, 6, 24 + r * 8 - 4, unitIdx.indexOf(r % 3 === 2 ? 'banditArcher' : 'bandit') * 12, 0, 12, 8); img.rect(96, 26 + r * 8, 28, 4, P.ink); img.rect(96, 26 + r * 8, Math.round(28 * (0.3 + (r * 37 % 70) / 100)), 4, P.red2); }
  panel(340, 20, 138, 76); for (let r = 0; r < 9; r++) { img.blit(units, 344, 24 + r * 8 - 4, unitIdx.indexOf(['kael', 'sword', 'sword', 'heavy', 'heavy', 'crossbow', 'crossbow', 'longbow', 'mage'][r]) * 12, 0, 12, 8); img.rect(446, 26 + r * 8, 28, 4, P.ink); img.rect(446, 26 + r * 8, Math.round(28 * (r === 7 ? 0.4 : 0.9)), 4, P.grass2); }
  // 하단 UI(시계·재정·부대)
  panel(2, 226, 100, 42); img.blit(ui, 6, 232, 0, 36, 24, 12, 1); panel(362, 226, 116, 42);
  for (let i = 0; i < 6; i++) { const x = 104 + i * 44; img.rect(x, 246, 42, 22, P.earth0); img.frame(x, 246, 42, 22, i === 0 ? P.gold1 : P.gold0); const pimg = new Img(14, 18); pimg.blit(ports, -13, -10, i * 40, 0, 40, 48); img.blit(pimg, x + 2, 248); img.rect(x + 18, 249, 20, 3, P.red); img.rect(x + 18, 249, 14, 3, P.grass2); img.rect(x + 18, 253, 20, 3, P.earth1); img.rect(x + 18, 253, 6, 3, P.gold1); }
  // 전투 명령 팝업
  panel(185, 96, 110, 66); img.rect(187, 98, 106, 8, P.gold0); for (let r = 0; r < 4; r++) { img.rect(191, 110 + r * 12, 98, 10, P.earth1); img.frame(191, 110 + r * 12, 98, 10, P.gold1); }
  img.save('mockup-battle.png', 3); writeFileSync(join(PUB, 'mockup-battle.png'), img.png());
}
console.log('art samples written to', OUT);
