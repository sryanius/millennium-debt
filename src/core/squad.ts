import { BALANCE } from './balance';
import { WEAPON_BY_ID, ARMOR_BY_ID, TOOL_BY_ID } from './equipment';
import { FORMATION_BY_ID, type AttackMode, type Stance } from './formation';
import { JOB_BY_ID } from './jobs';

/** 능력치(GDD §2.4): HP·E 경험·F 피로·S 사격(우리는 공격)·D 방어·T 상업·P 공연·B 건축 */
export interface Stats { hp: number; maxHp: number; e: number; f: number; s: number; d: number; t: number; p: number; b: number }

/** 부대장과 대원 공통. 부대장은 isLeader, 급료 0, 해고 불가. */
export interface Person {
  id: string; name: string; race: string;
  /** 직업 id(jobs.ts) 또는 'leader' */
  job: string; role: string;
  stats: Stats;
  wage: number; hire: number;
  weapon: string | null; armor: string | null; potion: string | null; potions: number;
  /** 직업 도구(장부·악기·해머 …) */
  tool: string | null;
  isLeader: boolean;
}
export type Leader = Person;

const P = (id: string, name: string, race: string, role: string, st: Omit<Stats, 'hp'>): Person => ({
  id, name, race, job: 'leader', role, stats: { ...st, hp: st.maxHp }, wage: 0, hire: 0, weapon: null, armor: null, potion: null, potions: 0, tool: null, isLeader: true,
});

/** 부대장 6명(GDD §5). 교체·통합 불가, 월급 0. */
export const LEADERS: readonly Person[] = [
  P('kael', '카엘 하임', '인간', '전투', { maxHp: 40, e: 10, f: 0, s: 30, d: 25, t: 5, p: 5, b: 5 }),
  P('brok', '브록', '오크', '전투', { maxHp: 55, e: 12, f: 0, s: 35, d: 30, t: 0, p: 0, b: 10 }),
  P('phoebe', '피비 애플가드', '하프링', '교역', { maxHp: 24, e: 8, f: 0, s: 8, d: 10, t: 40, p: 10, b: 5 }),
  P('ella', '엘라', '혼혈', '다목적', { maxHp: 32, e: 8, f: 0, s: 20, d: 15, t: 15, p: 20, b: 10 }),
  P('liesel', '리젤', '인간', '공연', { maxHp: 26, e: 6, f: 0, s: 10, d: 10, t: 10, p: 40, b: 0 }),
  P('durin', '두린', '드워프', '건축·전투', { maxHp: 45, e: 10, f: 0, s: 22, d: 32, t: 5, p: 0, b: 40 }),
];

export const MAX_MEMBERS = 8;

export type SquadPos =
  | { kind: 'at'; site: string }
  | { kind: 'road'; from: string; to: string; traveled: number; length: number };

export interface SquadJSON {
  id: string; leader: Person; members: Person[]; pos: SquadPos; path: string[]; order: 'idle' | 'move' | 'stay' | 'build';
  cargo: Record<string, number>; quests: string[]; formation: string; stance: Stance; attackMode: AttackMode;
  work: BuildWork | null; auto?: AutoTrade | null;
}
/** 왕복 교역 명령: from 에서 good 을 가득 사서 to 에 팔고 돌아오기를 반복 */
export interface AutoTrade { from: string; to: string; good: string; trips: number; earned: number; spent: number }
/** 건축 작업 중(3단계) */
export interface BuildWork { jobId: string; site: string; name: string; work: number; progress: number; reward: number }

/** 부대 = 부대장 1 + 대원 8(GDD §2.1). */
export class Squad {
  pos: SquadPos;
  /** 남은 경로(현재 위치 다음 거점부터) */
  path: string[] = [];
  order: 'idle' | 'move' | 'stay' | 'build' = 'idle';
  work: BuildWork | null = null;
  auto: AutoTrade | null = null;
  cargo: Record<string, number> = {};
  quests: string[] = [];
  members: Person[] = [];
  formation = 'line';
  stance: Stance = 'normal';
  attackMode: AttackMode = 'melee';
  constructor(public readonly id: string, public leader: Person, startSite: string) {
    this.pos = { kind: 'at', site: startSite };
  }
  get index(): number { return LEADERS.findIndex(l => l.id === this.id); }
  get name(): string { return this.leader.name + ' 부대'; }
  get people(): Person[] { return [this.leader, ...this.members]; }
  get headcount(): number { return 1 + this.members.length; }
  get capacity(): number { return BALANCE.carryPerMember * this.headcount; }
  get load(): number { return Object.values(this.cargo).reduce((a, b) => a + b, 0); }
  /** 부대에서 가장 높은 상업력(도구 포함) */
  get tradeSkill(): number { return Math.max(...this.people.map(tradeOf)); }
  /** 공연력 합계 */
  get performSkill(): number { return this.people.reduce((a, m) => a + performOf(m), 0); }
  /** 건축력 합계 */
  get buildSkill(): number { return this.people.reduce((a, m) => a + buildOf(m), 0); }
  get wages(): number { return this.members.reduce((a, m) => a + m.wage, 0); }
  get siteId(): string | null { return this.pos.kind === 'at' ? this.pos.site : null; }
  get moving(): boolean { return this.order === 'move' && (this.path.length > 0 || this.pos.kind === 'road'); }
  get destination(): string | null {
    if (this.path.length) return this.path[this.path.length - 1];
    return this.pos.kind === 'road' ? this.pos.to : null;
  }
  /** 대략의 전투력(표시용) */
  get power(): number { return this.people.reduce((a, m) => a + attackOf(m) + defenseOf(m) + m.stats.hp / 2, 0); }
  /** 지도 위 좌표(보간) */
  position(siteXY: (id: string) => { x: number; y: number }): { x: number; y: number } {
    if (this.pos.kind === 'at') return siteXY(this.pos.site);
    const a = siteXY(this.pos.from), b = siteXY(this.pos.to); const t = this.pos.traveled / this.pos.length;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  addCargo(good: string, qty: number): void { this.cargo[good] = (this.cargo[good] ?? 0) + qty; if (this.cargo[good] <= 0) delete this.cargo[good]; }
  toJSON(): SquadJSON {
    return { id: this.id, leader: this.leader, members: this.members, pos: this.pos, path: [...this.path], order: this.order, cargo: { ...this.cargo }, quests: [...this.quests], formation: this.formation, stance: this.stance, attackMode: this.attackMode, work: this.work, auto: this.auto };
  }
  static fromJSON(j: SquadJSON): Squad {
    const s = new Squad(j.id, j.leader, ''); s.pos = j.pos; s.path = [...j.path]; s.order = j.order; s.cargo = { ...j.cargo }; s.quests = [...j.quests]; s.members = j.members;
    s.formation = j.formation ?? 'line'; s.stance = j.stance ?? 'normal'; s.attackMode = j.attackMode ?? 'melee'; s.work = j.work ?? null; s.auto = j.auto ?? null;
    for (const m of s.people) if (m.tool === undefined) m.tool = null;
    return s;
  }
}

function toolBonus(p: Person, skill: 't' | 'p' | 'b'): number { const t = p.tool ? TOOL_BY_ID.get(p.tool) : undefined; return t && t.skill === skill ? t.bonus : 0; }
export function tradeOf(p: Person): number { return p.stats.t + toolBonus(p, 't'); }
export function performOf(p: Person): number { return p.stats.p + toolBonus(p, 'p'); }
export function buildOf(p: Person): number { return p.stats.b + toolBonus(p, 'b'); }
export function attackOf(p: Person): number { return p.stats.s + (p.weapon ? WEAPON_BY_ID.get(p.weapon)?.attack ?? 0 : 0); }
export function defenseOf(p: Person): number { return p.stats.d + (p.armor ? ARMOR_BY_ID.get(p.armor)?.defense ?? 0 : 0); }
export function isRanged(p: Person, jobRange: number): boolean {
  const w = p.weapon ? WEAPON_BY_ID.get(p.weapon) : undefined;
  return w ? w.ranged : jobRange > 0;
}
/**
 * 경험 → 단계. 단계 n 은 경험 10·n(n+1)/2 부터: 1단계 10, 2단계 30, 3단계 60, 4단계 100, 5단계 150 …(최대 10).
 * 단계가 오를 때마다 공격·방어 +1, 최대 체력 +2(growOnLevel). 전투마다 +1, 처치마다 +2 가 쌓인다.
 */
export const MAX_LEVEL = 10;
export function levelOf(e: number): number { return Math.min(MAX_LEVEL, Math.floor((Math.sqrt(1 + 0.8 * Math.max(0, e)) - 1) / 2)); }
/** 다음 단계까지 남은 경험(최고 단계면 0) */
export function expToNext(e: number): number { const n = levelOf(e); if (n >= MAX_LEVEL) return 0; return 10 * (n + 1) * (n + 2) / 2 - e; }
/** 경험을 더하고, 단계가 올랐으면 능력치를 올린 뒤 오른 단계 수를 돌려준다 */
export function gainExp(p: Person, amount: number): number {
  const before = levelOf(p.stats.e); p.stats.e += amount; const after = levelOf(p.stats.e); const up = after - before;
  if (up > 0) { p.stats.s += up; p.stats.d += up; p.stats.maxHp += 2 * up; p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + 2 * up); }
  return up;
}
/** 대원이 사격 대원인가(무기가 있으면 무기, 없으면 직업으로) */
export function isRangedPerson(p: Person): boolean { return isRanged(p, JOB_BY_ID.get(p.job)?.range ?? 0); }
/**
 * 대원 순서 = 대열 자리(1번부터). 백병 대원을 앞쪽(적 쪽, x 가 작은) 자리부터, 사격 대원을 뒤쪽 자리부터 세운다.
 * 같은 종류끼리는 지금 순서를 지킨다. 편성 창의 «자동 배치»와 대열을 바꿀 때(편성 창·전투 중) 쓴다.
 */
export function autoArrange(sq: { formation: string; members: Person[] }): void {
  const f = FORMATION_BY_ID.get(sq.formation); const n = sq.members.length; if (!f || n === 0) return;
  const slots = Array.from({ length: n }, (_, k) => k + 1).sort((a, b) => f.slots[a][0] - f.slots[b][0]);
  const order = [...sq.members.filter(m => !isRangedPerson(m)), ...sq.members.filter(m => isRangedPerson(m))];
  const next: Person[] = new Array(n); slots.forEach((si, k) => { next[si - 1] = order[k]; }); sq.members = next;
}
