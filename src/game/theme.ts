/** 1단계 "네모 그래픽" 팔레트와 글꼴. 6단계에서 도트로 바뀌어도 이름은 유지. */
export const W = 480;
export const H = 270;
/** HD 렌더 배율: 설계는 480×270, 캔버스는 ×K(1440×810). UI 카메라를 K배로 두어 좌표는 그대로 쓴다. */
export const K = 3;
/** 초상 파일 키(public/art/portraits/<key>.png) */
export const PORTRAIT_KEYS = ['kael', 'brok', 'phoebe', 'ella', 'liesel', 'durin', 'tobias', 'rohan', 'oswin', 'shopkeeper', 'innkeeper', 'officer', 'clerk', 'guildmaster', 'healer', 'herald', 'alaric', 'isolde', 'leon', 'empress'];
/** 대사 창의 초상 이름 → 파일 키 */
export function portraitKey(label: string): string | null {
  const t = label;
  const table: [RegExp, string][] = [[/로한/, 'rohan'], [/알라릭/, 'alaric'], [/이졸데/, 'isolde'], [/레온/, 'leon'], [/황태후|시녀/, 'empress'], [/전령/, 'herald'], [/토비아스/, 'tobias'], [/오스윈/, 'oswin'], [/수녀|사제|치유/, 'healer'], [/장수|점주|상인/, 'shopkeeper'], [/술집/, 'innkeeper'], [/선장|문지기|경비|심판|사절|사관|수비/, 'officer'], [/길드/, 'guildmaster'], [/게시판|학자|서기/, 'clerk'], [/베라/, 'healer'], [/석문|상자/, 'kael']];
  for (const [re, k] of table) if (re.test(t)) return k;
  return null;
}

/** art/icons.png 프레임(16×16) — tools/pixel-samples.mjs 의 ICON 순서 */
export const ICON = { castleL: 0, castleM: 1, castleS: 2, gate: 3, port: 4, mine: 5, shrine: 6, trade: 7, rift: 8, flagBlue: 9, flagRed: 10, flagPurple: 11, flagGold: 12 } as const;
export function siteIcon(kind: string, size: number): number {
  if (kind === 'castle') return size >= 5 ? ICON.castleL : size >= 3 ? ICON.castleM : ICON.castleS;
  return ({ gate: ICON.gate, ward_tower: ICON.gate, port: ICON.port, mine: ICON.mine, shrine: ICON.shrine, trade_post: ICON.trade, rift: ICON.rift } as Record<string, number>)[kind] ?? ICON.trade;
}
/** art/units.png 프레임(12×16) — tools/pixel-samples.mjs 의 UNITS 순서 */
export const UNIT_FRAME: Record<string, number> = {
  kael: 0, brok: 1, phoebe: 2, ella: 3, liesel: 4, durin: 5, sword: 6, heavy: 7, crossbow: 8, longbow: 9, mage: 10, merchant: 11, bard: 12, mason: 13,
  bandit: 14, banditArcher: 15, rebel: 16, priest: 17, escort: 18, ironclad: 19, golem: 20,
};
/** 전투 대원 → 프레임. 적은 직업 이름으로 */
export function unitFrame(job: string, side: 'ally' | 'enemy', leaderId?: string, ranged = false): number {
  if (leaderId && UNIT_FRAME[leaderId] !== undefined) return UNIT_FRAME[leaderId];
  if (side === 'ally') return UNIT_FRAME[job] ?? (ranged ? UNIT_FRAME.crossbow : UNIT_FRAME.sword);
  if (/철갑/.test(job)) return UNIT_FRAME.ironclad;
  if (/사제/.test(job)) return UNIT_FRAME.priest;
  if (/교단|대장/.test(job)) return UNIT_FRAME.rebel;
  if (/용병|창병/.test(job)) return UNIT_FRAME.escort;
  if (/석궁/.test(job)) return UNIT_FRAME.crossbow;
  if (/궁수/.test(job)) return UNIT_FRAME.banditArcher;
  return UNIT_FRAME.bandit;
}

export const FONT = 'Galmuri11';
export const FONT_SMALL = 'Galmuri9';

export const C = {
  ink: '#1a140d',
  paper: '#e8dcc0',
  paperDark: '#cdbd98',
  gold: '#e0b23c',
  goldDark: '#8a6a1c',
  red: '#b4302a',
  green: '#4f8a3a',
  blue: '#3f6fa8',
  grey: '#7a7268',
  white: '#f4efe4',
  panel: 0x2a2219,
  panelLight: 0x4a3b2a,
  border: 0xe0b23c,
  shadow: 0x000000,
  road: 0x8a6a3c,
  roadDark: 0x5a4424,
  castle: 0xe0b23c,
  gate: 0xb4b4b4,
  port: 0x6fa8e0,
  mine: 0x9a7a5a,
  shrine: 0xf0e0f0,
  tradePost: 0xd0a060,
  rift: 0xa050d0,
  flag: 0x3f6fa8,
  flagSel: 0xe0b23c,
  enemy: 0xb4302a,
};

export const SITE_COLOR: Record<string, number> = {
  castle: C.castle, gate: C.gate, port: C.port, mine: C.mine, ward_tower: C.gate, shrine: C.shrine, trade_post: C.tradePost, rift: C.rift,
};

export const REGION_COLOR: Record<string, number> = {
  reg_r01: 0x9b2335, reg_r02: 0x8a6d3b, reg_r03: 0x3f7f4f, reg_r04: 0xc08a1e, reg_r05: 0xd6a85a, reg_r06: 0x6b3fa0,
  reg_r07: 0x7a8a9a, reg_r08: 0x2a7a8a, reg_r09: 0x2f5d8a, reg_r10: 0x4a8ab0, reg_r11: 0x8a5a3a,
};

/** 글자는 렌더 배율(K)만큼 고해상도로 굽는다. 1 이면 11px 로 구운 뒤 늘려서 계단이 고르지 않다 */
export const TEXT = { fontFamily: FONT, fontSize: '11px', color: C.paper, resolution: K } as const;
export const TEXT_SMALL = { fontFamily: FONT_SMALL, fontSize: '9px', color: C.paper, resolution: K } as const;
