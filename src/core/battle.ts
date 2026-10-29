import { BALANCE } from './balance';
import { POTION_BY_ID } from './equipment';
import { FORMATION_BY_ID, type AttackMode, type Formation } from './formation';
import { JOB_BY_ID } from './jobs';
import { Rng } from './rng';
import { attackOf, defenseOf, isRanged, type Person, type Squad } from './squad';

/** 전장: 타원 가로 ±100, 세로 ±50. 아군은 오른쪽(+x), 적은 왼쪽(−x). */
export const ARENA = { rx: 100, ry: 50 };
const MELEE_RANGE = 7;
const EXIT_X = 108;

export interface EnemyDef { name: string; job: string; hp: number; s: number; d: number; range: number; cooldown: number; speed: number; bounty: number; wall?: boolean }

export type UnitState = 'fight' | 'retreat' | 'fled' | 'dead';
export interface BattleUnit {
  id: string; side: 'ally' | 'enemy'; name: string; job: string; isLeader: boolean;
  /** 공성전의 성벽: 공격하지 않고, 살아 있는 동안 수비대 방어 ×1.5 */
  wall?: boolean;
  /** 아군이면 원래 인물(전투 뒤 HP·경험·약 반영) */
  person?: Person;
  hp: number; maxHp: number; atk: number; def: number; range: number; cooldown: number; speed: number; fatigue: number;
  potions: number; potionHeal: number; bounty: number;
  x: number; y: number; homeX: number; homeY: number;
  state: UnitState; cd: number; potionCd: number; targetId: string | null;
  /** UI 효과용: 마지막 공격 뒤 경과(초), 마지막 피해 */
  flash: number; hitFlash: number; kills: number;
}
export type BattleResult = 'victory' | 'defeat' | 'retreat';
export interface BattleEvent { t: number; text: string }

/** 실시간 자동 전투(GDD §7.3). tick() 만 돌리면 헤드리스로 끝까지 간다. */
export class Battle {
  units: BattleUnit[] = [];
  time = 0;
  result: BattleResult | null = null;
  paused = false;
  formation: Formation;
  attackMode: AttackMode;
  events: BattleEvent[] = [];
  private seq = 0;

  constructor(public readonly squad: Squad, enemies: EnemyDef[], public readonly enemyName: string, private rng: Rng, public readonly kind: 'bandits' | 'escort' | 'siege' | 'other' = 'bandits', allies: EnemyDef[] = []) {
    this.formation = FORMATION_BY_ID.get(squad.formation) ?? FORMATION_BY_ID.get('line')!;
    this.attackMode = squad.attackMode;
    squad.people.forEach((p, i) => {
      const job = JOB_BY_ID.get(p.job);
      const ranged = isRanged(p, job?.range ?? 0);
      const u: BattleUnit = {
        id: 'a' + this.seq++, side: 'ally', name: p.name, job: p.isLeader ? '부대장' : (job?.name ?? p.role), isLeader: p.isLeader, person: p,
        hp: p.stats.hp, maxHp: p.stats.maxHp, atk: attackOf(p), def: defenseOf(p),
        range: ranged ? (job?.range || 24) : 0, cooldown: job?.cooldown ?? 1.0, speed: job?.speed ?? 20, fatigue: p.stats.f,
        potions: p.potions, potionHeal: p.potion ? POTION_BY_ID.get(p.potion)?.heal ?? 0 : 0, bounty: 0,
        x: 0, y: 0, homeX: 0, homeY: 0, state: p.stats.hp > 0 ? 'fight' : 'fled', cd: this.rng.next() * 0.5, potionCd: 0, targetId: null, flash: 9, hitFlash: 9, kills: 0,
      };
      this.units.push(u);
    });
    enemies.forEach((e, i) => {
      const n = enemies.length; const y = (i - (n - 1) / 2) * 9;
      this.units.push({
        id: 'e' + this.seq++, side: 'enemy', name: e.name, job: e.job, isLeader: false, wall: e.wall,
        hp: e.hp, maxHp: e.hp, atk: e.s, def: e.d, range: e.range, cooldown: e.cooldown, speed: e.speed, fatigue: 0,
        potions: 0, potionHeal: 0, bounty: e.bounty, x: e.wall ? -20 : -45 + (e.range > 0 ? -12 : 0), y: e.wall ? 0 : y, homeX: e.wall ? -20 : -45, homeY: e.wall ? 0 : y,
        state: 'fight', cd: this.rng.next() * 0.5, potionCd: 0, targetId: null, flash: 9, hitFlash: 9, kills: 0,
      });
    });
    allies.forEach((e, i) => this.units.push({
      id: 'x' + this.seq++, side: 'ally', name: e.name, job: e.job, isLeader: false,
      hp: e.hp, maxHp: e.hp, atk: e.s, def: e.d, range: e.range, cooldown: e.cooldown, speed: e.speed, fatigue: 0,
      potions: 0, potionHeal: 0, bounty: 0, x: 70, y: (i - (allies.length - 1) / 2) * 10, homeX: 70, homeY: (i - (allies.length - 1) / 2) * 10,
      state: 'fight', cd: this.rng.next() * 0.5, potionCd: 0, targetId: null, flash: 9, hitFlash: 9, kills: 0,
    }));
    this.placeAllies();
    this.say(squad.name + ' 대 ' + enemyName + ' — 교전 시작');
  }
  get allies(): BattleUnit[] { return this.units.filter(u => u.side === 'ally'); }
  get enemies(): BattleUnit[] { return this.units.filter(u => u.side === 'enemy'); }
  get leader(): BattleUnit { return this.allies[0]; }
  unit(id: string): BattleUnit | undefined { return this.units.find(u => u.id === id); }
  private say(text: string): void { this.events.push({ t: this.time, text }); if (this.events.length > 60) this.events.shift(); }

  private placeAllies(): void {
    this.allies.filter(u => u.person).forEach((u, i) => {
      const [dx, dy] = this.formation.slots[Math.min(i, this.formation.slots.length - 1)];
      u.homeX = 45 + dx; u.homeY = dy;
      if (this.time === 0) { u.x = u.homeX; u.y = u.homeY; }
    });
  }

  // ───── 명령(전투명령 / 전체퇴각 / 개별퇴각 / 전투재개) ─────
  setFormation(id: string): void {
    const f = FORMATION_BY_ID.get(id); if (!f) return;
    this.formation = f; this.squad.formation = id; this.placeAllies(); this.say('대열을 ' + f.name + '(으)로 바꾼다.');
  }
  setAttackMode(m: AttackMode): void { if (m === 'siege' && this.kind !== 'siege') return; this.attackMode = m; this.squad.attackMode = m === 'siege' ? 'melee' : m; }
  get wallAlive(): boolean { return this.units.some(u => u.wall && u.state === 'fight'); }
  retreatAll(): void { for (const u of this.allies) if (u.state === 'fight') u.state = 'retreat'; this.say('전체 퇴각!'); }
  retreatUnit(id: string): void { const u = this.unit(id); if (u && u.side === 'ally' && u.state === 'fight') { u.state = 'retreat'; this.say(u.name + ' 후퇴.'); } }
  resume(): void { this.paused = false; }

  // ───── 진행 ─────
  tick(dt: number): void {
    if (this.result || this.paused) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const u of this.units) {
      u.flash += dt; u.hitFlash += dt; u.potionCd -= dt;
      if (u.state === 'dead' || u.state === 'fled' || u.wall) continue;
      if (u.state === 'retreat') { this.moveRetreat(u, dt); continue; }
      this.act(u, dt);
    }
    this.checkEnd();
  }
  private moveRetreat(u: BattleUnit, dt: number): void {
    const dir = u.side === 'ally' ? 1 : -1;
    u.x += dir * BALANCE.battleRetreatSpeed * dt;
    if (Math.abs(u.x) >= EXIT_X) { u.state = 'fled'; u.x = dir * EXIT_X; }
  }
  private nearestFoe(u: BattleUnit): BattleUnit | null {
    let best: BattleUnit | null = null, bd = Infinity;
    for (const v of this.units) {
      if (v.side === u.side || v.state === 'dead' || v.state === 'fled') continue;
      const d = Math.hypot(v.x - u.x, v.y - u.y); if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  private act(u: BattleUnit, dt: number): void {
    // 회복약 자동 사용(GDD §2.5)
    if (u.potions > 0 && u.potionCd <= 0 && u.hp / u.maxHp < BALANCE.battlePotionAt) {
      u.potions--; u.hp = Math.min(u.maxHp, u.hp + u.potionHeal); u.potionCd = 2; if (u.person) u.person.potions = u.potions;
    }
    const foe = this.nearestFoe(u); if (!foe) return;
    u.targetId = foe.id;
    const d = Math.hypot(foe.x - u.x, foe.y - u.y);
    const reach = u.range > 0 ? u.range : MELEE_RANGE;
    u.cd -= dt;
    if (d <= reach) { if (u.cd <= 0) { u.cd = u.cooldown; this.attack(u, foe); } return; }
    // 성벽 뒤 수비대는 성벽이 설 동안 나오지 않는다
    if (u.side === 'enemy' && this.wallAlive && d > reach) return;
    // 이동: 사격 부대가 "사격" 방식이면 자리를 지키고 적이 오길 기다린다
    const hold = u.side === 'ally' && u.range > 0 && this.attackMode === 'ranged';
    const tx = hold ? u.homeX : foe.x, ty = hold ? u.homeY : foe.y;
    const dd = Math.hypot(tx - u.x, ty - u.y);
    if (dd > 1) {
      const step = Math.min(dd, u.speed * dt);
      u.x += (tx - u.x) / dd * step; u.y += (ty - u.y) / dd * step;
      // 타원 밖으로 나가지 않게
      const k = (u.x / ARENA.rx) ** 2 + (u.y / ARENA.ry) ** 2; if (k > 1) { const s = 1 / Math.sqrt(k); u.x *= s; u.y *= s; }
    }
  }
  private attack(u: BattleUnit, v: BattleUnit): void {
    const f = u.side === 'ally' ? this.formation : null;
    const hit = Math.min(0.97, Math.max(0.35, (BALANCE.battleHitBase - u.fatigue * BALANCE.battleFatigueHitLoss) * (f ? f.hit : 1)));
    u.flash = 0;
    if (this.rng.next() > hit) return;
    const fAtk = f ? f.atk : 1; const fDef = v.side === 'ally' ? this.formation.def * (v.isLeader && this.formation.id === 'guard' ? 1.3 : 1) : (this.wallAlive && !v.wall ? 1.5 : 1);
    const raw = u.atk * (0.75 + this.rng.next() * 0.5) * fAtk - v.def * 0.5 * fDef;
    let dmg = Math.max(1, Math.round(raw));
    if (v.wall) dmg = this.attackMode === 'siege' ? dmg * 3 : Math.max(1, Math.round(dmg * 0.5)); // 공성 방식이면 성벽에 ×3, 아니면 ×0.5
    v.hp -= dmg; v.hitFlash = 0;
    if (v.hp <= 0) {
      if (v.isLeader) { v.hp = 1; v.state = 'retreat'; this.say(v.name + ' 부대장이 쓰러져 부대 전체가 퇴각한다!'); this.retreatAll(); }
      else if (v.wall) { v.hp = 0; v.state = 'dead'; this.say('성벽이 무너졌다! 수비대가 뛰쳐나온다.'); }
      else { v.hp = 0; v.state = 'dead'; u.kills++; this.say((u.side === 'ally' ? u.name : v.name) + (u.side === 'ally' ? '가 ' + v.name + '을(를) 쓰러뜨렸다.' : '이(가) 쓰러졌다.')); }
    }
  }
  private checkEnd(): void {
    const alive = (s: 'ally' | 'enemy') => this.units.some(u => u.side === s && u.state === 'fight');
    const retreating = this.allies.some(u => u.state === 'retreat');
    if (!alive('enemy') && !this.enemies.some(u => u.state === 'retreat')) { this.result = 'victory'; this.say('승리!'); }
    else if (!alive('ally') && !retreating) { this.result = this.allies.some(u => u.state === 'fled') ? 'retreat' : 'defeat'; this.say(this.result === 'retreat' ? '퇴각했다.' : '전멸…'); }
    if (this.result) this.applyToPersons();
  }
  /** 전투 결과를 인물에 반영: HP·경험·피로·회복약. 사망 대원은 명단에서 뺀다. */
  private applyToPersons(): void {
    const dead: Person[] = [];
    for (const u of this.allies) {
      if (!u.person) continue;
      const p = u.person; p.stats.hp = Math.max(u.state === 'dead' ? 0 : 1, Math.round(u.hp)); p.stats.e += u.kills * 2 + 1; p.stats.f = Math.min(100, p.stats.f + BALANCE.fatigueBattle); p.potions = u.potions;
      if (u.state === 'dead' && !p.isLeader) dead.push(p);
    }
    this.squad.members = this.squad.members.filter(m => !dead.includes(m));
    this.dead = dead;
  }
  dead: Person[] = [];
  /** 승리 시 전리품 */
  get bounty(): number { return this.result === 'victory' ? this.enemies.reduce((a, e) => a + (e.state === 'dead' ? e.bounty : 0), 0) : 0; }
}

/** 도적단(토벌 의뢰·떠돌이). tier 1~3. */
export function makeBandits(tier: number, rng: Rng): EnemyDef[] {
  const n = 3 + tier * 2; const out: EnemyDef[] = []; const k = 1 + (tier - 1) * 0.35;
  for (let i = 0; i < n; i++) {
    const archer = i % 3 === 2;
    out.push(archer
      ? { name: '도적 궁수', job: '궁수', hp: Math.round(20 * k), s: Math.round(13 * k), d: Math.round(5 * k), range: 24, cooldown: 1.4, speed: 20, bounty: BALANCE.banditBountyPerUnit * tier }
      : { name: '도적', job: '도적', hp: Math.round(24 * k), s: Math.round(14 * k), d: Math.round(7 * k), range: 0, cooldown: 1.1, speed: 21, bounty: BALANCE.banditBountyPerUnit * tier });
  }
  if (tier >= 2) out[0] = { name: '도적 두목', job: '두목', hp: Math.round(45 * k), s: Math.round(22 * k), d: Math.round(14 * k), range: 0, cooldown: 1.0, speed: 20, bounty: BALANCE.banditBountyPerUnit * tier * 3 };
  void rng;
  return out;
}

/** 잿빛 교단 수비대(점령지 탈환 = 공성전). 성이면 성벽이 두껍고 수가 많다. */
export function makeGarrison(isCastle: boolean): EnemyDef[] {
  const out: EnemyDef[] = [{ name: isCastle ? '성벽' : '목책', job: '성벽', hp: isCastle ? 220 : 110, s: 0, d: 20, range: 0, cooldown: 9, speed: 0, bounty: 0, wall: true }];
  const n = isCastle ? 9 : 6;
  for (let i = 0; i < n; i++) {
    out.push(i % 3 === 1
      ? { name: '잿빛 석궁수', job: '석궁수', hp: 26, s: 16, d: 9, range: 26, cooldown: 0.7, speed: 20, bounty: 400 }
      : { name: '잿빛 교단병', job: '교단병', hp: 32, s: 18, d: 12, range: 0, cooldown: 1.0, speed: 20, bounty: 400 });
  }
  if (isCastle) out.push({ name: '잿빛 사제', job: '사제', hp: 40, s: 30, d: 10, range: 34, cooldown: 1.8, speed: 18, bounty: 1_500 });
  return out;
}
/** 잿빛 교단 전투단(요새를 치러 나온 무리) */
export function makeRebels(tier: number): EnemyDef[] {
  const out: EnemyDef[] = []; const n = 5 + tier * 2;
  for (let i = 0; i < n; i++) out.push(i % 3 === 2
    ? { name: '잿빛 석궁수', job: '석궁수', hp: 26, s: 16, d: 9, range: 26, cooldown: 0.7, speed: 20, bounty: 350 }
    : { name: '잿빛 교단병', job: '교단병', hp: 32, s: 18, d: 12, range: 0, cooldown: 1.0, speed: 20, bounty: 350 });
  out[0] = { name: '잿빛 대장', job: '대장', hp: 60, s: 26, d: 18, range: 0, cooldown: 1.0, speed: 20, bounty: 2_000 };
  return out;
}

/** 집행관 호위대. level 1(용병 4) → 5(드워프 철갑보병 + 석궁수). */
export function makeEscort(level: number): EnemyDef[] {
  const out: EnemyDef[] = [];
  const n = 2 + level * 2; const k = 1 + (level - 1) * 0.3;
  for (let i = 0; i < n; i++) {
    if (level >= 5 && i % 2 === 0) out.push({ name: '철갑보병', job: '드워프 철갑보병', hp: 52, s: 20, d: 32, range: 0, cooldown: 1.3, speed: 14, bounty: 0 });
    else if (level >= 3 && i % 3 === 2) out.push({ name: '호위 석궁수', job: '석궁수', hp: Math.round(24 * k), s: Math.round(14 * k), d: Math.round(8 * k), range: 26, cooldown: 0.6, speed: 20, bounty: 0 });
    else out.push({ name: '호위 용병', job: '용병', hp: Math.round(28 * k), s: Math.round(16 * k), d: Math.round(10 * k), range: 0, cooldown: 1.0, speed: 21, bounty: 0 });
  }
  return out;
}
