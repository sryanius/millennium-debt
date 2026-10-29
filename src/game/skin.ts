import Phaser from 'phaser';

/**
 * UI 도트 스킨: 창·패널·제목 줄·버튼을 코드로 그린 텍스처(9분할). 설계 1px = 화면 3px(K=3).
 * 원작의 갈색 판 + 금테 느낌. 그림 파일이 없어도 되고, 색만 바꿔 버튼 변형을 만든다.
 */
type RGB = [number, number, number];
const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const INK: RGB = [20, 16, 24], GOLD0: RGB = [122, 90, 26], GOLD1: RGB = [214, 168, 58], GOLD2: RGB = [248, 226, 150], WHITE: RGB = [255, 250, 235];

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (px: (x: number, y: number, c: RGB, a?: number) => void) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h)!; const ctx = t.getContext();
  const px = (x: number, y: number, c: RGB, a = 1) => { ctx.fillStyle = css(c, a); ctx.fillRect(x, y, 1, 1); };
  draw(px); t.refresh(); t.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** 창 판(24×24, 9분할 테두리 6): 검은 윤곽 → 금테(밝은 위·왼, 어두운 아래·오른) → 안쪽 그림자 → 디더 바탕 + 모서리 징 */
function panelTex(scene: Phaser.Scene, key: string, fill: RGB, alpha: number): void {
  canvasTex(scene, key, 24, 24, px => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const e = Math.min(x, y, 23 - x, 23 - y);
      if (e === 0) px(x, y, INK);
      else if (e === 1) px(x, y, (x + y < 24 ? GOLD1 : GOLD0));
      else if (e === 2) px(x, y, (x + y < 24 ? GOLD2 : GOLD1));
      else if (e === 3) px(x, y, INK, 0.85);
      else { const d = (x + y * 3) % 7 === 0 ? 0.06 : 0; px(x, y, mix(fill, WHITE, d), alpha); }
    }
    for (const [cx, cy] of [[2, 2], [21, 2], [2, 21], [21, 21]]) { px(cx, cy, WHITE); px(cx + (cx < 12 ? 1 : -1), cy + (cy < 12 ? 1 : -1), GOLD0); }
  });
}
/** 제목 줄(8×12, 가로로 늘림): 금빛 띠 + 위 밝은 줄 + 아래 그림자 */
function titleTex(scene: Phaser.Scene): void {
  canvasTex(scene, 'sk_title', 8, 12, px => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) {
      const c = y === 0 ? GOLD2 : y === 11 ? INK : y >= 9 ? GOLD0 : mix([150, 108, 32], [196, 150, 52], 1 - y / 9);
      px(x, y, (x + y) % 4 === 0 && y > 0 && y < 9 ? mix(c, WHITE, 0.08) : c);
    }
  });
}
/** 버튼(12×12, 9분할 3): 바탕색별로 만든다. state: n 보통, h 올림, d 못 누름 */
export function buttonKey(scene: Phaser.Scene, base: number, state: 'n' | 'h' | 'd'): string {
  const key = `sk_btn_${base.toString(16)}_${state}`;
  let f = hex(base); if (state === 'h') f = mix(f, WHITE, 0.18); if (state === 'd') f = [58, 56, 60];
  const edge = state === 'd' ? [90, 88, 92] as RGB : GOLD1;
  canvasTex(scene, key, 12, 12, px => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const e = Math.min(x, y, 11 - x, 11 - y);
      if (e === 0) px(x, y, (x === 0 || x === 11) && (y === 0 || y === 11) ? [0, 0, 0] : INK, (x === 0 || x === 11) && (y === 0 || y === 11) ? 0 : 1);
      else if (e === 1) px(x, y, y === 1 || x === 1 ? mix(edge, WHITE, 0.25) : mix(edge, INK, 0.35));
      else px(x, y, y === 2 ? mix(f, WHITE, 0.22) : y >= 10 ? mix(f, INK, 0.3) : f);
    }
  });
  return key;
}

export function makeSkin(scene: Phaser.Scene): void {
  panelTex(scene, 'sk_win', [46, 34, 26], 1);
  panelTex(scene, 'sk_panel', [36, 28, 22], 0.9);
  titleTex(scene);
}
export const hasSkin = (scene: Phaser.Scene) => scene.textures.exists('sk_win');

/** 9분할 판 */
export function nine(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key: string, edge = 6): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, key, undefined, Math.max(w, edge * 2), Math.max(h, edge * 2), edge, edge, edge, edge).setOrigin(0);
}
