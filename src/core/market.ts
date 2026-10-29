import { BALANCE } from './balance';
import { GOODS, GOOD_BY_ID } from './goods';
import { Rng } from './rng';
import type { World, Site } from './world';

export interface MarketLine {
  good: string;
  /** 기준 재고(이 값으로 되돌아간다) */
  baseStock: number;
  stock: number;
  /** 지역 거리 배율 × 일일 잡음 × 재고 효과가 반영된 단가 */
  price: number;
}
export interface MarketJSON { siteId: string; day: number; lines: MarketLine[] }

/**
 * 거점 교역소. 특산지는 싸고 재고가 많고, 멀어질수록 비싸다(지역 홉당 +25%).
 * 사면 재고가 줄어 값이 오르고, 팔면 재고가 늘어 값이 내린다. 하루마다 기준치로 되돌아간다.
 */
export class Market {
  lines: MarketLine[];
  day: number;
  constructor(public readonly siteId: string, lines: MarketLine[], day: number) { this.lines = lines; this.day = day; }

  static create(world: World, site: Site, day: number, seed: number): Market {
    const rng = new Rng(seed ^ hash(site.id));
    const sizeMul = site.kind === 'castle' ? site.size : 1;
    const lines: MarketLine[] = [];
    for (const g of GOODS) {
      const hops = Math.min(...g.home.map(h => world.regionHops(site.region, h)));
      const isHome = hops === 0;
      // 특산이 아닌 상품은 이웃 지역 것이거나, 큰 성(5)에서는 2홉까지 취급
      if (!isHome && hops > 1 && site.size < 5) continue;
      if (!isHome && hops > 2) continue;
      const baseStock = isHome ? 30 * sizeMul : 6 * sizeMul;
      const mult = isHome ? 0.6 : 1 + 0.25 * hops;
      // 거점 고유 편차: 같은 지역 안에서도 거점마다 값이 달라 지역 안 왕복 교역이 성립한다
      const siteMul = 1 + (new Rng(hash(site.id + ':' + g.id)).next() - 0.5) * 2 * BALANCE.siteVariance;
      const price = Math.max(1, Math.round(g.base * mult * siteMul * (1 + (rng.next() - 0.5) * 2 * BALANCE.priceNoise)));
      lines.push({ good: g.id, baseStock, stock: baseStock, price });
    }
    return new Market(site.id, lines, day);
  }
  line(good: string): MarketLine | undefined { return this.lines.find(l => l.good === good); }

  /** 날이 바뀌었으면 재고를 기준치로 되돌리고 값도 그만큼 되돌린다. */
  settle(day: number, seed: number): void {
    const days = day - this.day; if (days <= 0) return;
    const rng = new Rng(seed ^ hash(this.siteId) ^ (day * 7919));
    for (const l of this.lines) {
      const g = GOOD_BY_ID.get(l.good)!;
      const basePrice = l.price / this.stockFactor(l); // 현재 값에서 재고 효과를 벗긴 바탕값
      for (let i = 0; i < days; i++) l.stock += (l.baseStock - l.stock) * BALANCE.stockRegenPerDay;
      l.stock = Math.round(l.stock);
      const noisy = basePrice * (1 + (rng.next() - 0.5) * BALANCE.priceNoise);
      l.price = Math.max(1, Math.round(clamp(noisy, g.base * 0.3, g.base * 3) * this.stockFactor(l)));
    }
    this.day = day;
  }
  private stockFactor(l: MarketLine): number {
    if (l.baseStock <= 0) return 1;
    const r = Math.max(0.1, l.stock / l.baseStock);
    return clamp(Math.pow(r, -0.4), 0.6, 2.0);
  }
  /** T(상업력)는 사는 값·파는 값을 둘 다 내린다(GDD §2.4). */
  static skillMod(tradeSkill: number): number { return 1 - 0.5 * clamp(tradeSkill, 0, BALANCE.tradeSkillMax) / BALANCE.tradeSkillMax; }
  buyPrice(good: string, tradeSkill: number): number {
    const l = this.line(good); if (!l) return Infinity;
    return Math.max(1, Math.round(l.price * BALANCE.buySpread * Market.skillMod(tradeSkill)));
  }
  sellPrice(good: string, tradeSkill: number): number {
    const l = this.line(good);
    const g = GOOD_BY_ID.get(good)!;
    // 취급하지 않는 상품도 사 주지만 헐값(기준가의 반)
    const unit = l ? l.price : g.base * 0.5;
    return Math.max(1, Math.round(unit * BALANCE.sellSpread * Market.skillMod(tradeSkill)));
  }
  /** 재고를 빼고 값을 올린다. 실제로 뺀 수량을 돌려준다. */
  takeStock(good: string, qty: number): number {
    const l = this.line(good); if (!l) return 0;
    const n = Math.min(qty, l.stock); if (n <= 0) return 0;
    const before = this.stockFactor(l); l.stock -= n; l.price = Math.max(1, Math.round(l.price / before * this.stockFactor(l))); return n;
  }
  /** 재고를 넣고 값을 내린다. */
  putStock(good: string, qty: number): void {
    let l = this.line(good);
    if (!l) { const g = GOOD_BY_ID.get(good)!; l = { good, baseStock: 0, stock: 0, price: Math.round(g.base * 0.5) }; this.lines.push(l); }
    const before = this.stockFactor(l); l.stock += qty; l.price = Math.max(1, Math.round(l.price / before * this.stockFactor(l)));
  }
  toJSON(): MarketJSON { return { siteId: this.siteId, day: this.day, lines: this.lines.map(l => ({ ...l })) }; }
  static fromJSON(j: MarketJSON): Market { return new Market(j.siteId, j.lines.map(l => ({ ...l })), j.day); }
}

export function hash(s: string): number {
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0;
}
export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
