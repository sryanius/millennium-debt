// 임시 앱 아이콘(PWA·홈 화면). 도트 아트는 6단계에서 교체. 의존성 없이 PNG 를 직접 쓴다.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 16×16 도트 그림(금화 주머니 + 빚 문서)을 확대한다
const ART = [
  '................',
  '......gggg......',
  '.....g....g.....',
  '....g..yy..g....',
  '....g.yyyy.g....',
  '...g..yyyy..g...',
  '...g...yy...g...',
  '...g........g...',
  '..g..........g..',
  '..g.rrrrrrrr.g..',
  '..g.r......r.g..',
  '..g.r.wwww.r.g..',
  '..g.r......r.g..',
  '...grrrrrrrrg...',
  '....gggggggg....',
  '................',
];
const COL = { '.': [26, 20, 13, 255], g: [224, 178, 60, 255], y: [255, 235, 130, 255], r: [180, 48, 42, 255], w: [244, 239, 228, 255] };
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const buf = png(size, (x, y) => { const cx = Math.floor(x / (size / 16)), cy = Math.floor(y / (size / 16)); return COL[ART[cy][cx]] ?? COL['.']; });
  writeFileSync(new URL('../public/icons/icon-' + size + '.png', import.meta.url), buf);
}
console.log('icons written');
