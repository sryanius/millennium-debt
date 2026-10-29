/**
 * 대열 8종(GDD §3: 원작 16종을 역할이 분명한 8종으로). 9칸(0 = 부대장) 의 전장 상대 좌표.
 * x 는 적 쪽(−)이 앞, y 는 위아래. 아군은 전장 오른쪽에 서므로 x 가 작을수록 앞줄.
 */
export interface Formation {
  id: string; name: string; desc: string;
  slots: [number, number][];
  /** 배율: 공격·방어·명중 */
  atk: number; def: number; hit: number;
}
const row = (x: number, n: number, gap = 9): [number, number][] => Array.from({ length: n }, (_, i) => [x, (i - (n - 1) / 2) * gap]);

export const FORMATIONS: readonly Formation[] = [
  { id: 'line', name: '횡대', desc: '한 줄로 넓게. 기본', slots: [[0, 0], ...row(-6, 8)], atk: 1, def: 1, hit: 1 },
  { id: 'column', name: '종대', desc: '좁고 길게. 행군·좁은 길', slots: [[0, 0], [-8, -4], [-8, 4], [-16, -4], [-16, 4], [-24, -4], [-24, 4], [8, -4], [8, 4]], atk: 0.9, def: 1.1, hit: 1 },
  { id: 'wedge', name: '쐐기', desc: '앞으로 뾰족하게. 돌격 공격 +', slots: [[0, 0], [-10, 0], [-6, -8], [-6, 8], [-2, -16], [-2, 16], [2, -24], [2, 24], [6, 0]], atk: 1.2, def: 0.9, hit: 1 },
  { id: 'square', name: '방진', desc: '네모로 뭉쳐 방어 +', slots: [[0, 0], [-8, -8], [-8, 8], [8, -8], [8, 8], [-8, 0], [8, 0], [0, -8], [0, 8]], atk: 0.9, def: 1.25, hit: 0.95 },
  { id: 'spread', name: '산개', desc: '흩어져 사격 피해 −, 명중 −', slots: [[0, 0], [-10, -24], [-10, -12], [-10, 12], [-10, 24], [4, -20], [4, 20], [12, -8], [12, 8]], atk: 1, def: 1.1, hit: 0.9 },
  { id: 'archers', name: '궁수 후열', desc: '백병 앞, 사격 뒤. 사격 명중 +', slots: [[6, 0], [-12, -12], [-12, 0], [-12, 12], [-12, -24], [-12, 24], [10, -10], [10, 10], [14, 0]], atk: 1, def: 1, hit: 1.15 },
  { id: 'envelop', name: '포위', desc: '양 날개를 앞으로. 공격 +, 방어 −', slots: [[0, 0], [-14, -26], [-14, 26], [-10, -16], [-10, 16], [-2, -8], [-2, 8], [6, -4], [6, 4]], atk: 1.15, def: 0.85, hit: 1.05 },
  { id: 'guard', name: '수비', desc: '부대장을 가운데 두고 지킨다. 부대장 피해 −', slots: [[6, 0], [-6, -12], [-6, 0], [-6, 12], [0, -18], [0, 18], [10, -10], [10, 10], [14, 0]], atk: 0.85, def: 1.2, hit: 1 },
];
export const FORMATION_BY_ID: ReadonlyMap<string, Formation> = new Map(FORMATIONS.map(f => [f.id, f]));

/** 경계 태세(원작: 경계/보통/색적). 교전 시작 거리와 피로에 영향. */
export type Stance = 'alert' | 'normal' | 'search';
export const STANCE_LABEL: Record<Stance, string> = { alert: '경계', normal: '보통', search: '색적' };

/** 공격 방식(원작: 백병전·포격·전차포 → 우리는 백병전·사격·공성) */
export type AttackMode = 'melee' | 'ranged' | 'siege';
export const ATTACK_MODE_LABEL: Record<AttackMode, string> = { melee: '백병전', ranged: '사격', siege: '공성' };
