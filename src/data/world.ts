/** 《균열의 시대》 world 데이터. 게임이 혼자 빌드되도록 src/data/world/ 에 사본을 둔다(원본: docs/grand-strategy/data/world, 갱신: node tools/sync-world.mjs). */
import sites from './world/sites.json';
import regions from './world/regions.json';
import factions from './world/factions.json';
import map from './world/map.json';
import type { WorldData, RawSite, RawRegion, RawFaction, RawMap } from '../core/world';

export const WORLD_DATA: WorldData = {
  sites: sites as unknown as RawSite[],
  regions: regions as unknown as RawRegion[],
  factions: factions as unknown as RawFaction[],
  map: map as unknown as RawMap,
};

/** 지형 글자 → 색(strategy/tools/map-editor.html 과 같은 팔레트, 조금 어둡게) */
export const TERRAIN_COLOR: Record<string, number> = {
  p: 0xb9c48c, R: 0xc9b27d, f: 0x4f7a42, h: 0x9c8c5e, m: 0x6e675d, s: 0x5f7d65,
  w: 0x5f8bc0, d: 0xd6c287, n: 0xdfe3e6, W: 0x3c6a9e, x: 0x4f3360, F: 0x7fa3c9,
};
