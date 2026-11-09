/**
 * 도트 LoRA 가 뽑은 그림(큰 픽셀로 그려진 작은 병사)을 진짜 픽셀 격자로 되돌린다.
 *  - 배경(네 귀퉁이 색, 마젠타)을 투명으로
 *  - 픽셀 피치(한 도트가 몇 px 인가)를 재서 격자 가운데 색만 집는다(줄이는 게 아니라 모델이 그린 도트를 그대로 집는 것)
 *  - 병사 둘레를 잘라 정해진 칸(frameW×frameH)에 바닥 맞춰 넣는다
 */
import sharp from 'sharp';
import { quantize } from './pixelize.mjs';

/** 배경과의 거리: 네 귀퉁이 평균색 */
function bgOf(data, w, h, ch) {
  const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [0, h >> 1], [w - 1, h >> 1], [w >> 1, h - 1]];
  const s = [0, 0, 0]; for (const [x, y] of pts) { const i = (y * w + x) * ch; s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; }
  return s.map(v => v / pts.length);
}
const dist = (data, i, c) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]);
/** 마젠타 계열(배경색)인가 — 모델이 배경 안에 조금 다른 마젠타 상자를 그릴 때도 지우려고 색조로 본다 */
export const isMagenta = (r, g, b) => r > 140 && g < 110 && b > 70 && r - g > 60 && b - g > 20;

/**
 * 피치 추정: 색이 바뀌는 자리(모서리)를 모아, 모서리에서 p 만큼 간 곳에도 모서리가 있는 비율이 높은 p 를 고른다.
 * 2p·3p 도 비율이 높으므로, 최고치의 85% 이상인 가장 작은 p 를 택한다(4~12).
 */
export function estimatePitch(data, w, h, ch, bg) {
  const edgesX = new Uint8Array(w * h), edgesY = new Uint8Array(w * h); let nx = 0, ny = 0;
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) { const i = (y * w + x) * ch; if (dist(data, i, [data[i - ch], data[i - ch + 1], data[i - ch + 2]]) > 60) { edgesX[y * w + x] = 1; nx++; } }
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * ch, j = ((y - 1) * w + x) * ch; if (dist(data, i, [data[j], data[j + 1], data[j + 2]]) > 60) { edgesY[y * w + x] = 1; ny++; } }
  const score = (p) => {
    let hit = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w - p - 1; x++) if (edgesX[y * w + x] && (edgesX[y * w + x + p] || edgesX[y * w + x + p + 1] || edgesX[y * w + x + p - 1])) hit++;
    for (let y = 0; y < h - p - 1; y++) for (let x = 0; x < w; x++) if (edgesY[y * w + x] && (edgesY[(y + p) * w + x] || edgesY[(y + p + 1) * w + x] || edgesY[(y + p - 1) * w + x])) hit++;
    return hit / Math.max(1, nx + ny);
  };
  const cands = []; for (let p = 4; p <= 12; p++) cands.push([p, score(p)]);
  const max = Math.max(...cands.map(c => c[1]));
  const pick = cands.find(([, s]) => s >= max * 0.85) ?? cands[0];
  void bg; return pick[0];
}

/**
 * @returns {{ w:number, h:number, px: Uint8Array }} RGBA 격자(투명 배경), 둘레 잘라낸 것
 */
export async function toGrid(buf, { tol = 110, pitch = null } = {}) {
  const img = sharp(buf).ensureAlpha(); const { width: w, height: h } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true }); const ch = 4;
  const bg = bgOf(data, w, h, ch);
  const p = pitch ?? estimatePitch(data, w, h, ch, bg);
  const gw = Math.round(w / p), gh = Math.round(h / p);
  const out = new Uint8Array(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    // 칸 가운데 3×3 점의 중앙값에 가까운 색(테두리 번짐 피함)
    const cx = Math.min(w - 1, Math.floor((gx + 0.5) * p)), cy = Math.min(h - 1, Math.floor((gy + 0.5) * p));
    const samples = [];
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) { const x = Math.min(w - 1, Math.max(0, cx + dx)), y = Math.min(h - 1, Math.max(0, cy + dy)); const i = (y * w + x) * ch; samples.push([data[i], data[i + 1], data[i + 2]]); }
    samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])); const c = samples[2];
    const o = (gy * gw + gx) * 4;
    const isBg = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < tol || isMagenta(c[0], c[1], c[2]);
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = isBg ? 0 : 255;
  }
  // 둘레 잘라내기 + 배경 섬(그림자 바닥 등) 유지
  let x0 = gw, y0 = gh, x1 = -1, y1 = -1;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (out[(y * gw + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { w: 0, h: 0, px: new Uint8Array(0), pitch: p, grid: [gw, gh] };
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1; const px = new Uint8Array(cw * chh * 4);
  for (let y = 0; y < chh; y++) px.set(out.subarray(((y + y0) * gw + x0) * 4, ((y + y0) * gw + x1 + 1) * 4), y * cw * 4);
  return { w: cw, h: chh, px, pitch: p, grid: [gw, gh] };
}

/**
 * 격자 그림을 frameW×frameH 칸에 넣는다(바닥 맞춤, 가운데).
 * 칸보다 크면(모델이 그린 격자가 더 촘촘하면) 칸 안에 들어가게 비율을 지켜 줄이고 색을 16색으로 모은다
 * — 큰 도트를 작은 도트로 다시 찍는 셈(area 평균 + 팔레트). 칸 안에 들면 그대로.
 */
export async function fitFrame(g, frameW, frameH, { maxW = frameW - 2, maxH = frameH - 2, colours = 16 } = {}) {
  let { w, h, px } = g;
  const out = new Uint8Array(frameW * frameH * 4);
  if (w === 0) return out;
  if (w > maxW || h > maxH) {
    const k = Math.min(maxW / w, maxH / h); const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    const { data } = await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 4 } }).resize(nw, nh, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    // 반투명(테두리 번짐)은 반 넘게 차 있으면 칠하고, 아니면 비운다. 색은 k-means 로 모은다
    const rgb = new Uint8Array(nw * nh * 3); const solid = new Uint8Array(nw * nh);
    for (let i = 0; i < nw * nh; i++) { solid[i] = data[i * 4 + 3] >= 128 ? 1 : 0; rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; }
    const q = quantize(rgb, nw, nh, colours);
    const np = new Uint8Array(nw * nh * 4);
    for (let i = 0; i < nw * nh; i++) if (solid[i]) { np[i * 4] = q.data[i * 3]; np[i * 4 + 1] = q.data[i * 3 + 1]; np[i * 4 + 2] = q.data[i * 3 + 2]; np[i * 4 + 3] = 255; }
    w = nw; h = nh; px = np;
  }
  const ox = Math.floor((frameW - w) / 2), oy = frameH - h - 1; // 바닥 맞춤(한 칸 띄움)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= frameW || ty >= frameH) continue;
    out.set(px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ty * frameW + tx) * 4);
  }
  return out;
}

export async function gridPng(px, w, h, scale = 1) {
  const img = sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 4 } });
  return scale === 1 ? img.png().toBuffer() : img.resize(w * scale, h * scale, { kernel: 'nearest' }).png().toBuffer();
}
