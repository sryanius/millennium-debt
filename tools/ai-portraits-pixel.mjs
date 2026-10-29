/**
 * 채색 초상(ai-portraits.mjs 결과) → 같은 인물의 16비트 도트 초상.
 * Gemini 에 "이 인물을 SNES 풍 도트 초상으로" 다시 그리게 한 뒤(그림→그림이라 얼굴이 유지된다),
 * 48×56 과 96×112 격자·32색으로 눌러 담는다. 창의 초상 칸이 48×56(HD ×3 = 144×168) 이라 1 도트 = 3 캔버스 px 로 또렷하다.
 *   node mercenary/tools/ai-portraits-pixel.mjs [키들...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pixelize } from './pixelize.mjs';
import { CHARACTERS } from './portrait-chars.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const SRC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-ai');
const OUT_GAME = path.join(ROOT, 'mercenary/public/art/portraits-px');
const OUT_DOC = path.join(ROOT, 'docs/mercenary/art-samples/portraits-px');
fs.mkdirSync(OUT_GAME, { recursive: true }); fs.mkdirSync(OUT_DOC, { recursive: true });
const key = fs.readFileSync(path.join(ROOT, '.secrets', 'gemini.key'), 'utf8').trim();

const PROMPT = 'Redraw this exact character as a 16-bit pixel art portrait in the style of a 1990s SNES / PC-98 Japanese RPG character portrait: '
  + 'keep the same face, hairstyle, skin tone, expression and clothes; bust framing, three-quarter view, looking slightly toward the viewer. '
  + 'Crisp hard-edged pixels, flat shading with 3-4 tones per material, bold dark outlines, limited palette of about 24 colors, no anti-aliasing, no gradients, no dithering noise. '
  + 'Plain very dark background. No text, no frame.';

async function redraw(bytes) {
  const body = { contents: [{ parts: [{ inline_data: { mime_type: 'image/png', data: bytes.toString('base64') } }, { text: PROMPT }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } } };
  const r = await fetch(`${API}/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || 'error'}`);
  const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  if (!part) throw new Error('no image (' + (j.candidates?.[0]?.finishReason || '?') + ')');
  const d = part.inlineData || part.inline_data; return Buffer.from(d.data, 'base64');
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHARACTERS);
for (const k of want) {
  const src = path.join(SRC, k + '.png'); if (!fs.existsSync(src)) { console.log('no source', k); continue; }
  const out = path.join(OUT_GAME, k + '.png'); const local = path.join(OUT_GAME, k + '.local');
  if (fs.existsSync(out) && !fs.existsSync(local) && !process.env.FORCE) { console.log('skip', k); continue; } // 로컬 대체품(.local)은 AI 판으로 갈아 끼운다
  const t0 = Date.now();
  try {
    const raw = await redraw(fs.readFileSync(src));
    fs.writeFileSync(path.join(OUT_DOC, k + '-ai.png'), await sharp(raw).resize(384, 480).png().toBuffer());
    fs.writeFileSync(out, await pixelize(raw, { width: 48, height: 56, colours: 32 }));
    fs.writeFileSync(path.join(OUT_GAME, k + '@2.png'), await pixelize(raw, { width: 96, height: 112, colours: 32 }));
    fs.writeFileSync(path.join(OUT_DOC, k + '.png'), await pixelize(raw, { width: 48, height: 56, colours: 32, scaleUp: 4 }));
    if (fs.existsSync(local)) fs.unlinkSync(local);
    console.log('ok', k, Math.round((Date.now() - t0) / 1000) + 's');
  } catch (e) { console.log('FAIL', k, String(e.message || e).slice(0, 200)); }
}
// 시트: 도트(×4) 20장
const files = Object.keys(CHARACTERS).filter(k => fs.existsSync(path.join(OUT_DOC, k + '.png')));
if (files.length) {
  const cols = 5, w = 192, h = 224; const rows = Math.ceil(files.length / cols);
  const composite = await Promise.all(files.map(async (k, i) => ({ input: await sharp(path.join(OUT_DOC, k + '.png')).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#1a1c2c' } }).composite(composite).png().toFile(path.join(OUT_DOC, 'sheet.png'));
  console.log('sheet', files.length);
}
