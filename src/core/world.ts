/** 《균열의 시대》 world 데이터를 도로 그래프로 쓴다(GDD §4.2). Phaser 의존 없음. */
export type SiteKind = 'castle' | 'gate' | 'port' | 'mine' | 'ward_tower' | 'shrine' | 'trade_post' | 'rift';

export interface RawSite {
  id: string; name: string; kind: SiteKind; size: number; region: string;
  adjacent: string[]; pos: [number, number]; owner?: string; specialty?: string; population?: number;
}
export interface RawRegion { id: string; name: string; races?: string[] }
export interface RawFaction { id: string; name: string; color?: string; capital?: string }
export interface RawMap { width: number; height: number; terrain: string[] }

export interface WorldData { sites: RawSite[]; regions: RawRegion[]; factions: RawFaction[]; map?: RawMap }

export interface Site extends RawSite { x: number; y: number }
export interface Edge { a: string; b: string; length: number; sea?: boolean }

export const KIND_LABEL: Record<SiteKind, string> = {
  castle: '성', gate: '관문', port: '항구', mine: '광산', ward_tower: '망루', shrine: '사원', trade_post: '교역소', rift: '균열',
};

/** 교역소가 있는 거점 종류 */
export function hasMarket(s: Site): boolean { return s.kind === 'castle' || s.kind === 'trade_post' || s.kind === 'port'; }
/** 게시판·상점이 있는 거점(성만) */
export function isTown(s: Site): boolean { return s.kind === 'castle'; }
/** 요새(내구를 가진 거점): 성·관문·망루 */
export function isFort(s: Site): boolean { return s.kind === 'castle' || s.kind === 'gate' || s.kind === 'ward_tower'; }
export function fortMax(s: Site): number { return s.kind === 'castle' ? 200 : isFort(s) ? 100 : 60; }

export class World {
  readonly sites = new Map<string, Site>();
  readonly regions = new Map<string, RawRegion>();
  readonly factions = new Map<string, RawFaction>();
  readonly edges: Edge[] = [];
  readonly regionAdj = new Map<string, Set<string>>();
  readonly map?: RawMap;
  private readonly edgeLen = new Map<string, number>();

  /** 항로(항구 ↔ 항구) */
  readonly seaEdges: Edge[] = [];
  constructor(data: WorldData, ferry?: { maxDistance: number; speedMul: number }) {
    for (const r of data.regions) { this.regions.set(r.id, r); this.regionAdj.set(r.id, new Set()); }
    for (const f of data.factions) this.factions.set(f.id, f);
    for (const s of data.sites) this.sites.set(s.id, { ...s, adjacent: [...s.adjacent], x: s.pos[0], y: s.pos[1] });
    for (const s of this.sites.values()) {
      for (const bId of s.adjacent) {
        const b = this.sites.get(bId);
        if (!b || s.id > bId) continue; // 대칭이므로 한 번만
        const length = Math.max(1, Math.round(Math.hypot(b.x - s.x, b.y - s.y)));
        this.edges.push({ a: s.id, b: bId, length });
        this.edgeLen.set(s.id + '|' + bId, length); this.edgeLen.set(bId + '|' + s.id, length);
        if (s.region !== b.region) { this.regionAdj.get(s.region)?.add(b.region); this.regionAdj.get(b.region)?.add(s.region); }
      }
    }
    this.map = data.map;
    // 항로: 가까운 항구끼리 배로 잇는다(GDD §3 "항구 20곳과 배편 이동"). 길이는 거리 ÷ 배 속도
    if (ferry) {
      const ports = [...this.sites.values()].filter(s => s.kind === 'port');
      for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) {
        const a = ports[i], b = ports[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > ferry.maxDistance || this.edgeLen.has(a.id + '|' + b.id)) continue;
        const length = Math.max(1, Math.round(d / ferry.speedMul));
        const e = { a: a.id, b: b.id, length, sea: true }; this.edges.push(e); this.seaEdges.push(e);
        this.edgeLen.set(a.id + '|' + b.id, length); this.edgeLen.set(b.id + '|' + a.id, length);
        a.adjacent.push(b.id); b.adjacent.push(a.id);
        if (a.region !== b.region) { this.regionAdj.get(a.region)?.add(b.region); this.regionAdj.get(b.region)?.add(a.region); }
      }
    }
  }
  isSea(a: string, b: string): boolean { return this.seaEdges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }
  site(id: string): Site {
    const s = this.sites.get(id); if (!s) throw new Error('unknown site ' + id); return s;
  }
  length(a: string, b: string): number {
    const l = this.edgeLen.get(a + '|' + b); if (l === undefined) throw new Error('no edge ' + a + '-' + b); return l;
  }
  sitesIn(regionId: string): Site[] { return [...this.sites.values()].filter(s => s.region === regionId); }
  towns(): Site[] { return [...this.sites.values()].filter(isTown); }
  /** 지역 간 거리(지역 그래프 홉 수). 같은 지역이면 0. */
  regionHops(from: string, to: string): number {
    if (from === to) return 0;
    const dist = new Map<string, number>([[from, 0]]); const q = [from];
    while (q.length) {
      const r = q.shift()!; const d = dist.get(r)!;
      for (const n of this.regionAdj.get(r) ?? []) if (!dist.has(n)) { dist.set(n, d + 1); if (n === to) return d + 1; q.push(n); }
    }
    return 99;
  }
  /**
   * 다익스트라. blockedRegions 안의 거점은 통과하지 않는다(진입 불가 지역, GDD §4.1).
   * 목적지가 막힌 지역이면 null.
   */
  path(from: string, to: string, blockedRegions: ReadonlySet<string> = new Set(), blockedSites: ReadonlySet<string> = new Set()): { nodes: string[]; length: number } | null {
    if (from === to) return { nodes: [from], length: 0 };
    if (blockedRegions.has(this.site(to).region)) return null;
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    for (;;) {
      let cur: string | null = null; let best = Infinity;
      for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; cur = id; }
      if (cur === null) return null;
      if (cur === to) break;
      done.add(cur);
      for (const n of this.site(cur).adjacent) {
        if (blockedRegions.has(this.site(n).region)) continue;
        if (blockedSites.has(n) && n !== to) continue; // 적 점령지는 목적지로만(공격)
        const nd = best + this.length(cur, n);
        if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, cur); }
      }
    }
    const nodes = [to]; while (nodes[0] !== from) nodes.unshift(prev.get(nodes[0])!);
    return { nodes, length: dist.get(to)! };
  }
  /** 지역 경계 상자(지도 그리기용) */
  regionBounds(regionId: string): { minX: number; minY: number; maxX: number; maxY: number } {
    const ss = this.sitesIn(regionId);
    return {
      minX: Math.min(...ss.map(s => s.x)), minY: Math.min(...ss.map(s => s.y)),
      maxX: Math.max(...ss.map(s => s.x)), maxY: Math.max(...ss.map(s => s.y)),
    };
  }
}
