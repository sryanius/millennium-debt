/**
 * 그림 → 도트 변환(공용). 축소(lanczos) 뒤 k-means 팔레트(디더 없음)로 눌러 진짜 픽셀 격자를 만든다.
 *   quantize(rawRGB, w, h, colours) → { data(Uint8Array RGB), palette }
 *   pixelize(input, { width, height, colours, scaleUp }) → PNG Buffer
 */
import sharp from 'sharp';

export function quantize(data, w, h, colours = 32, iters = 8) {
  const n = w * h;
  // 표본으로 k-means 초기화(균등 간격)
  const step = Math.max(1, Math.floor(n / 4000));
  const samples = []; for (let i = 0; i < n; i += step) samples.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
  let pal = []; for (let k = 0; k < colours; k++) pal.push(samples[Math.floor(k * samples.length / colours)].slice());
  const nearest = (r, g, b) => { let bi = 0, bd = Infinity; for (let k = 0; k < pal.length; k++) { const p = pal[k]; const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 * 1.4 + (p[2] - b) ** 2; if (d < bd) { bd = d; bi = k; } } return bi; };
  for (let it = 0; it < iters; it++) {
    const sum = pal.map(() => [0, 0, 0, 0]);
    for (const s of samples) { const k = nearest(s[0], s[1], s[2]); sum[k][0] += s[0]; sum[k][1] += s[1]; sum[k][2] += s[2]; sum[k][3]++; }
    pal = sum.map((s, k) => s[3] ? [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])] : pal[k]);
  }
  const out = new Uint8Array(n * 3);
  // 캐시로 속도
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let k = cache.get(key); if (k === undefined) { k = nearest(r, g, b); cache.set(key, k); }
    const p = pal[k]; out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
  }
  return { data: out, palette: pal };
}

export async function pixelize(input, { width, height, colours = 32, scaleUp = 1, fit = 'cover', position = 'attention', kernel = 'lanczos3' } = {}) {
  const { data, info } = await sharp(input).resize(width, height, { fit, position, kernel }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const q = quantize(data, info.width, info.height, colours);
  let img = sharp(Buffer.from(q.data), { raw: { width: info.width, height: info.height, channels: 3 } });
  if (scaleUp > 1) img = img.resize(info.width * scaleUp, info.height * scaleUp, { kernel: 'nearest' });
  return img.png({ compressionLevel: 9 }).toBuffer();
}
