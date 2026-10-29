/** 1단계 "네모 그래픽" 팔레트와 글꼴. 6단계에서 도트로 바뀌어도 이름은 유지. */
export const W = 480;
export const H = 270;

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

export const TEXT = { fontFamily: FONT, fontSize: '11px', color: C.paper, resolution: 1 } as const;
export const TEXT_SMALL = { fontFamily: FONT_SMALL, fontSize: '9px', color: C.paper, resolution: 1 } as const;
