/**
 * AI 초상(시안 B/C): Gemini 이미지 모델로 반실사 채색 초상을 뽑는다(《균열의 시대》 초상 PoC 와 같은 화풍 문장).
 *   node mercenary/tools/ai-portraits.mjs [키들...]      (키 생략 = 전부, 이미 있는 파일은 건너뜀)
 * 산출: mercenary/public/art/portraits/<key>.png (256×320) + docs/mercenary/art-samples/portraits-ai/<key>.png (512×640) + sheet.jpg
 * 키는 .secrets/gemini.key 에서만 읽고 출력하지 않는다(docs/HANDOFF.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const OUT_GAME = path.join(ROOT, 'mercenary', 'public', 'art', 'portraits');
const OUT_DOC = path.join(ROOT, 'docs', 'mercenary', 'art-samples', 'portraits-ai');
fs.mkdirSync(OUT_GAME, { recursive: true }); fs.mkdirSync(OUT_DOC, { recursive: true });
const key = fs.readFileSync(path.join(ROOT, '.secrets', 'gemini.key'), 'utf8').trim();

// 공통 화풍(초상 PoC PROMPTS.md 의 자연어 스타일 문장을 그대로)
const STYLE = 'Semi-realistic fantasy illustration, painterly digital art, upper body portrait, three-quarter view, medieval fantasy setting, detailed face, soft dramatic rim lighting, plain dark muted background. No text, no watermark, no frame.';

import { CHARACTERS } from './portrait-chars.mjs';
export { CHARACTERS };

async function generate(prompt) {
  const body = { contents: [{ parts: [{ text: prompt + ' ' + STYLE }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } } };
  const r = await fetch(`${API}/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || 'error'}`);
  const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  if (!part) throw new Error('no image (' + (j.candidates?.[0]?.finishReason || '?') + ')');
  const d = part.inlineData || part.inline_data;
  return Buffer.from(d.data, 'base64');
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHARACTERS);
for (const k of want) {
  const gameFile = path.join(OUT_GAME, k + '.png');
  if (fs.existsSync(gameFile) && !process.env.FORCE) { console.log('skip', k); continue; }
  const t0 = Date.now();
  try {
    const raw = await generate(CHARACTERS[k]);
    await sharp(raw).resize(512, 640, { fit: 'cover', position: 'attention' }).png({ compressionLevel: 9 }).toFile(path.join(OUT_DOC, k + '.png'));
    await sharp(raw).resize(256, 320, { fit: 'cover', position: 'attention' }).png({ compressionLevel: 9, palette: true, colours: 128 }).toFile(gameFile);
    console.log('ok', k, Math.round((Date.now() - t0) / 1000) + 's');
  } catch (e) { console.log('FAIL', k, String(e.message || e).slice(0, 200)); }
}
// 한 장짜리 시트(문서용)
const files = Object.keys(CHARACTERS).filter(k => fs.existsSync(path.join(OUT_DOC, k + '.png')));
if (files.length) {
  const cols = 5, w = 256, h = 320; const rows = Math.ceil(files.length / cols);
  const composite = await Promise.all(files.map(async (k, i) => ({ input: await sharp(path.join(OUT_DOC, k + '.png')).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#1a1c2c' } }).composite(composite).jpeg({ quality: 85 }).toFile(path.join(OUT_DOC, 'sheet.jpg'));
  console.log('sheet', files.length);
}
