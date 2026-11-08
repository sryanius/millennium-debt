import Phaser from 'phaser';
import { FORMATIONS, type Formation } from '../core/formation';
import { JOB_BY_ID } from '../core/game';
import { isRanged, type Person } from '../core/squad';
import { isTap, type Window } from './Window';
import { C } from './theme';

/** 모든 대열 자리를 담는 범위(같은 배율로 그려서 대열끼리 크기 비교가 되게) */
const all = FORMATIONS.flatMap(f => f.slots);
const X0 = Math.min(...all.map(p => p[0])) - 3, X1 = Math.max(...all.map(p => p[0])) + 3;
const Y0 = Math.min(...all.map(p => p[1])) - 3, Y1 = Math.max(...all.map(p => p[1])) + 3;

export type Kind = 'leader' | 'melee' | 'ranged';
export const KIND_COLOR: Record<Kind, number> = { leader: 0xe0b040, melee: 0xc8604a, ranged: 0x4a9ad0 };
export const KIND_TEXT: Record<Kind, string> = { leader: '#e0b040', melee: '#e07a62', ranged: '#6ab4e8' };
export const KIND_LABEL: Record<Kind, string> = { leader: '부대장', melee: '백병', ranged: '사격' };
export function kindOf(p: Person): Kind { return p.isLeader ? 'leader' : isRanged(p, JOB_BY_ID.get(p.job)?.range ?? 0) ? 'ranged' : 'melee'; }
export function jobName(p: Person): string { return p.isLeader ? '부대장' : (JOB_BY_ID.get(p.job)?.name ?? p.role); }

/**
 * 대열 그림: 왼쪽이 적 쪽(전장에서 아군은 오른쪽에 선다). 자리마다 번호 동그라미 —
 * 번호는 편성 칸의 번호와 같고, 색은 부대장(금)·백병(빨강)·사격(파랑). 빈 동그라미는 비어 있는 자리.
 * onSlot 을 주면 자리를 누를 수 있다.
 */
export function drawFormation(w: Window, x: number, y: number, bw: number, bh: number, f: Formation, people: readonly Person[], o: { picked?: string | null; onSlot?: (i: number) => void } = {}): void {
  w.rect(x, y, bw, bh, 0x000000, 0.28).setStrokeStyle(1, C.border);
  const g = w.scene.add.graphics(); w.content.add(g);
  const arrowW = 18, legendW = 46, pad = 7;
  const aw = bw - arrowW - legendW - pad * 2, ah = bh - pad * 2;
  // 세로는 실제 비율, 가로는 최대 2배까지 늘려 앞뒤 차이가 잘 보이게
  const s = Math.min(aw / (X1 - X0), ah / (Y1 - Y0)); const sx = Math.min(aw / (X1 - X0), s * 2);
  const ox = x + arrowW + pad + (aw - (X1 - X0) * sx) / 2, oy = y + pad + (ah - (Y1 - Y0) * s) / 2;
  const px = (v: number) => ox + (v - X0) * sx, py = (v: number) => oy + (v - Y0) * s;
  // 적 쪽 화살표
  g.fillStyle(0xb4302a, 0.9); const ay = y + bh / 2;
  g.fillTriangle(x + 4, ay, x + 11, ay - 5, x + 11, ay + 5); g.fillRect(x + 11, ay - 1.5, 5, 3);
  w.small(x + 3, ay + 6, '적', { color: '#b4302a' });
  // 색 뜻
  const lx = x + bw - legendW, lc = C.paperDark;
  (['leader', 'melee', 'ranged'] as const).forEach((k, i) => { g.fillStyle(KIND_COLOR[k], 1); g.fillCircle(lx + 4, y + 9 + i * 12, 3); w.small(lx + 10, y + 3 + i * 12, KIND_LABEL[k], { color: lc }); });
  g.lineStyle(1, 0x8a7a64, 1); g.strokeCircle(lx + 4, y + 45, 3); w.small(lx + 10, y + 39, '빈 자리', { color: lc });
  const r = Math.max(4, Math.min(6, s * 4));
  f.slots.forEach(([fx, fy], i) => {
    const cx = px(fx), cy = py(fy); const p = people[i];
    if (p) {
      const picked = o.picked === p.id;
      g.fillStyle(KIND_COLOR[kindOf(p)], 1); g.fillCircle(cx, cy, r);
      g.lineStyle(picked ? 2 : 1, picked ? 0xffffff : 0x1a1008, 1); g.strokeCircle(cx, cy, r + (picked ? 1 : 0));
      w.small(cx, cy + 0.5, String(i + 1), { color: '#1a1008' }).setOrigin(0.5);
    } else { g.lineStyle(1, 0x8a7a64, 1); g.strokeCircle(cx, cy, r - 1); }
    if (o.onSlot) {
      const hr = r + 3; const z = w.rect(cx - hr, cy - hr, hr * 2, hr * 2, 0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
      z.on('pointerup', (pp: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (isTap(pp)) o.onSlot!(i); });
    }
  });
}

/** 공격·방어·명중 배율을 % 로. 오르면 초록, 내리면 빨강 */
export function formationMods(w: Window, x: number, y: number, f: Formation): number {
  let cx = x;
  ([['공격', f.atk], ['방어', f.def], ['명중', f.hit]] as const).forEach(([lb, v], i) => {
    const t = w.small(cx, y, (i ? '· ' : '') + lb + ' ' + Math.round(v * 100) + '%', { color: v > 1 ? '#7ac25a' : v < 1 ? '#d0584c' : C.paperDark });
    cx += t.width + 4;
  });
  return cx;
}
