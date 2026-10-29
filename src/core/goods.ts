/** 교역 상품. home = 특산 지역(GDD §4.1 표). base = 기준가(골/단위). */
export interface Good { id: string; name: string; base: number; home: string[] }
export const GOODS: readonly Good[] = [
  { id: 'wine', name: '포도주', base: 120, home: ['reg_r06'] },
  { id: 'wheat', name: '밀', base: 40, home: ['reg_r06'] },
  { id: 'limestone', name: '석회암', base: 30, home: ['reg_r06'] },
  { id: 'grain', name: '곡물', base: 45, home: ['reg_r01'] },
  { id: 'books', name: '서적', base: 300, home: ['reg_r01'] },
  { id: 'craft', name: '황실 공예품', base: 800, home: ['reg_r01'] },
  { id: 'iron', name: '철', base: 150, home: ['reg_r02', 'reg_r11'] },
  { id: 'mithril', name: '미스릴', base: 2000, home: ['reg_r02'] },
  { id: 'powder', name: '화약', base: 400, home: ['reg_r02'] },
  { id: 'timber', name: '목재', base: 60, home: ['reg_r03'] },
  { id: 'herbs', name: '약초', base: 180, home: ['reg_r03'] },
  { id: 'mana', name: '마석', base: 1500, home: ['reg_r03', 'reg_r09'] },
  { id: 'salt', name: '소금', base: 90, home: ['reg_r04', 'reg_r05'] },
  { id: 'spice', name: '향신료', base: 500, home: ['reg_r04', 'reg_r08'] },
  { id: 'horse', name: '말', base: 900, home: ['reg_r05', 'reg_r07'] },
  { id: 'glass', name: '유리', base: 350, home: ['reg_r05'] },
  { id: 'wool', name: '양모', base: 70, home: ['reg_r07', 'reg_r11'] },
  { id: 'silver', name: '은', base: 1200, home: ['reg_r07', 'reg_r11'] },
  { id: 'pearl', name: '진주', base: 1600, home: ['reg_r08', 'reg_r10'] },
  { id: 'sulfur', name: '유황', base: 220, home: ['reg_r08'] },
  { id: 'fur', name: '모피', base: 260, home: ['reg_r09'] },
  { id: 'fish', name: '어류', base: 35, home: ['reg_r10'] },
  { id: 'paper', name: '갈대 종이', base: 110, home: ['reg_r10'] },
];
export const GOOD_BY_ID: ReadonlyMap<string, Good> = new Map(GOODS.map(g => [g.id, g]));
