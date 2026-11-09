import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { Battle, makeBandits, makeGarrison } from '../src/core/battle';
import { Game } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { autoArrange, type Person } from '../src/core/squad';
import { World } from '../src/core/world';
import { WORLD_DATA } from '../src/data/world';

BALANCE.roamSpawnDays = 1e9; BALANCE.rebelStartDay = 1e9;
const world = () => new World(WORLD_DATA, { maxDistance: BALANCE.ferryMaxDistance, speedMul: BALANCE.ferrySpeedMul });
const teleport = (g: Game, idx: number, site: string) => { g.squads[idx].pos = { kind: 'at', site }; g.squads[idx].order = 'idle'; g.squads[idx].path = []; };
const member = (id: string, job: string, weapon: string | null = null): Person => ({ id, name: id, race: '인간', job, role: job, stats: { hp: 30, maxHp: 30, e: 0, f: 0, s: 10, d: 10, t: 0, p: 0, b: 0 }, wage: 100, hire: 1000, weapon, armor: null, potion: null, potions: 0, tool: null, isLeader: false });

describe('2026-11-09 점검에서 고친 것', () => {
  it('열려 있던 대화는 저장해도 "나온 것"으로 치지 않고, 불러오면 다시 뜬다(합류 사건이 사라지던 문제)', () => {
    const g = new Game(world(), 5); g.startStory(); g.firedEvents.clear();
    teleport(g, 0, 'C025'); g.fireEvents({ site: 'C025', squadIdx: 0 });
    expect(g.event?.id).toBe('join_brok'); expect(g.firedEvents.has('join_brok')).toBe(true);
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    expect(j.firedEvents).not.toContain('join_brok');
    const g2 = Game.fromJSON(world(), j); g2.refireArrivals();
    expect(g2.event?.id).toBe('join_brok');
    g2.chooseEvent(0); expect(g2.isActive(1)).toBe(true);
  });
  it('자동 배치: 백병은 앞자리, 사격은 뒷자리. 전투 중 대열을 바꿔도 같다', () => {
    const g = new Game(world(), 5); const sq = g.squads[0];
    sq.members = [member('a', 'longbow'), member('b', 'sword'), member('c', 'crossbow'), member('d', 'heavy')];
    sq.formation = 'archers'; autoArrange(sq);
    // 궁수 후열: 자리 1~3 이 앞줄(x −12), 자리 4 는 더 앞(−12)… 백병 둘이 먼저 앞자리
    expect(sq.members.slice(0, 2).map(m => m.job).sort()).toEqual(['heavy', 'sword']);
    const b = new Battle(sq, makeBandits(1, new Rng(1)), 'x', new Rng(2));
    b.setFormation('column');
    const front = b.allies.filter(u => u.person && !u.isLeader).sort((x, y) => x.homeX - y.homeX);
    expect(front[0].range).toBe(0); expect(front[front.length - 1].range).toBeGreaterThan(0);
  });
  it('공성전: 수비대 사수는 성벽 바로 뒤에서 쏜다(전에는 사거리 밖에서 가만히 있었다)', () => {
    const g = new Game(world(), 5); const sq = g.squads[0]; sq.members = [member('a', 'sword'), member('b', 'sword')];
    const b = new Battle(sq, makeGarrison(false), '수비대', new Rng(3), 'siege');
    const archers = b.enemies.filter(u => u.range > 0 && !u.wall); expect(archers.length).toBeGreaterThan(0);
    for (const a of archers) expect(a.x).toBe(-30);
    let t = 0; while (t < 20 && !b.result) { b.tick(0.1); t += 0.1; }
    expect(b.allies.some(u => u.hp < u.maxHp)).toBe(true); // 성벽을 치는 동안 맞는다
  });
  it('총호송 매복 도적은 배달이 끝나면 사라진다', () => {
    const g = new Game(world(), 7); g.autoEvents = true;
    const b = g.board('C028')!; const q = b.quests.find(x => x.job === 'escort');
    if (!q) return; // 이 판에 총호송이 없으면 건너뜀
    g.accept(0, q.id); expect(g.bands.some(x => x.id === 'R' + q.id)).toBe(true);
    teleport(g, 0, q.to); (g as unknown as { onArrive: (s: unknown, i: number, site: string) => boolean }).onArrive(g.squads[0], 0, q.to);
    expect(g.activeQuests.has(q.id)).toBe(false); expect(g.bands.some(x => x.id === 'R' + q.id)).toBe(false);
  });
  it('집행관: 길 위에 있어도 호위대와 싸울 수 있다', () => {
    const g = new Game(world(), 7); g.autoEvents = true; g.ledger.cash = 0;
    g.move(0, 'C001'); for (let i = 0; i < 12 * 7 && !g.collectorVisit; i++) g.tick(1);
    expect(g.collectorVisit?.short).toBe(true); expect(g.squads[0].siteId).toBeNull();
    expect(g.collectorFight(0)).toBe(true); expect(g.battle?.kind).toBe('escort');
  });
  it('다른 부대가 교전 중이면 적이 있는 거점 앞에서 멈춘다(전투가 덮어써지지 않게)', () => {
    const g = new Game(world(), 7); g.autoEvents = true;
    g.bands.push({ id: 'T', name: '시험 도적', site: 'P090', tier: 1, questId: null, kind: 'roam', nextMove: 1e9 });
    teleport(g, 1, 'P090'); g.attackBand(1); expect(g.battle).not.toBeNull(); const first = g.battle;
    g.move(0, 'P090'); for (let i = 0; i < 12 * 3; i++) g.tick(1);
    expect(g.battle).toBe(first); expect(g.squads[0].siteId).toBe('C028'); expect(g.squads[0].order).toBe('idle');
  });
  it('아델라 성지: 남자 부대장이 먼저 가도 한 번뿐인 보상 사건이 사라지지 않는다', () => {
    const g = new Game(world(), 7); g.flags.add('ev5_laundry');
    teleport(g, 0, 'P052'); g.fireEvents({ site: 'P052', squadIdx: 0 }); expect(g.event?.id).toBe('ev5_blocked'); g.chooseEvent(0);
    teleport(g, 2, 'P052'); g.fireEvents({ site: 'P052', squadIdx: 2 }); expect(g.event?.id).toBe('ev5_done');
  });
});
