// 《균열의 시대》 세계 데이터 사본 갱신(원본이 있는 작업 폴더에서만). node tools/sync-world.mjs
import fs from 'node:fs';
const SRC = new URL('../../docs/grand-strategy/data/world/', import.meta.url), DST = new URL('../src/data/world/', import.meta.url);
for (const f of ['sites.json', 'regions.json', 'factions.json', 'map.json']) { fs.copyFileSync(new URL(f, SRC), new URL(f, DST)); console.log('copied', f); }
