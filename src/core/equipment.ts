/** 장비(GDD §2.5): 무기 4단계 × 백병/사격, 갑옷 3단계, 회복약 4단계. */
export interface Weapon { id: string; name: string; tier: number; ranged: boolean; attack: number; price: number; minSize: number }
export interface Armor { id: string; name: string; tier: number; defense: number; price: number; minSize: number }
export interface Potion { id: string; name: string; tier: number; heal: number; price: number; minSize: number }

export const WEAPONS: readonly Weapon[] = [
  { id: 'w1', name: '쇠검', tier: 1, ranged: false, attack: 4, price: 600, minSize: 2 },
  { id: 'w2', name: '강철검', tier: 2, ranged: false, attack: 8, price: 1_800, minSize: 3 },
  { id: 'w3', name: '룬 검', tier: 3, ranged: false, attack: 13, price: 5_500, minSize: 5 },
  { id: 'w4', name: '미스릴 검', tier: 4, ranged: false, attack: 20, price: 16_000, minSize: 5 },
  { id: 'r1', name: '사냥활', tier: 1, ranged: true, attack: 3, price: 700, minSize: 2 },
  { id: 'r2', name: '합성궁', tier: 2, ranged: true, attack: 7, price: 2_100, minSize: 3 },
  { id: 'r3', name: '엘프 장궁', tier: 3, ranged: true, attack: 12, price: 6_500, minSize: 5 },
  { id: 'r4', name: '마도 석궁', tier: 4, ranged: true, attack: 19, price: 18_000, minSize: 5 },
];
export const ARMORS: readonly Armor[] = [
  { id: 'a1', name: '가죽 갑옷', tier: 1, defense: 4, price: 500, minSize: 2 },
  { id: 'a2', name: '사슬 갑옷', tier: 2, defense: 9, price: 2_400, minSize: 3 },
  { id: 'a3', name: '판금 갑옷', tier: 3, defense: 16, price: 8_000, minSize: 5 },
];
export const POTIONS: readonly Potion[] = [
  { id: 'p1', name: '약초즙', tier: 1, heal: 10, price: 60, minSize: 2 },
  { id: 'p2', name: '회복약', tier: 2, heal: 20, price: 180, minSize: 3 },
  { id: 'p3', name: '고급 회복약', tier: 3, heal: 35, price: 500, minSize: 3 },
  { id: 'p4', name: '비약', tier: 4, heal: 60, price: 1_400, minSize: 5 },
];
/** 직업 도구(GDD §2.5): 상인 장부·저울 / 공연 악기·드레스 / 기술자 해머·곡괭이 */
export interface Tool { id: string; name: string; tier: number; skill: 't' | 'p' | 'b'; bonus: number; price: number; minSize: number }
export const TOOLS: readonly Tool[] = [
  { id: 't1', name: '장부', tier: 1, skill: 't', bonus: 8, price: 1_200, minSize: 2 },
  { id: 't2', name: '저울', tier: 2, skill: 't', bonus: 16, price: 4_000, minSize: 3 },
  { id: 'm1', name: '류트', tier: 1, skill: 'p', bonus: 8, price: 1_000, minSize: 2 },
  { id: 'm2', name: '무희의 드레스', tier: 2, skill: 'p', bonus: 16, price: 3_500, minSize: 3 },
  { id: 'b1', name: '해머', tier: 1, skill: 'b', bonus: 8, price: 900, minSize: 2 },
  { id: 'b2', name: '곡괭이', tier: 2, skill: 'b', bonus: 16, price: 3_000, minSize: 3 },
];
export const TOOL_BY_ID: ReadonlyMap<string, Tool> = new Map(TOOLS.map(t => [t.id, t]));
export const WEAPON_BY_ID: ReadonlyMap<string, Weapon> = new Map(WEAPONS.map(w => [w.id, w]));
export const ARMOR_BY_ID: ReadonlyMap<string, Armor> = new Map(ARMORS.map(a => [a.id, a]));
export const POTION_BY_ID: ReadonlyMap<string, Potion> = new Map(POTIONS.map(p => [p.id, p]));
export const MAX_POTIONS = 5;
/** 되팔 때 받는 비율 */
export const SELLBACK = 0.5;

export function itemName(id: string | null | undefined): string {
  if (!id) return '-';
  return WEAPON_BY_ID.get(id)?.name ?? ARMOR_BY_ID.get(id)?.name ?? POTION_BY_ID.get(id)?.name ?? TOOL_BY_ID.get(id)?.name ?? id;
}
export function itemPrice(id: string): number {
  return WEAPON_BY_ID.get(id)?.price ?? ARMOR_BY_ID.get(id)?.price ?? POTION_BY_ID.get(id)?.price ?? TOOL_BY_ID.get(id)?.price ?? 0;
}
