import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { Battle, makeBandits, makeGarrison } from '../src/core/battle';
import { Game } from '../src/core/game';
import { JOBS } from '../src/core/jobs';
import { Rng } from '../src/core/rng';
import { autoArrange, expToNext, gainExp, levelOf, type Person } from '../src/core/squad';
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
    for (const a of archers) { expect(a.x).toBeLessThanOrEqual(-30); expect(a.x).toBeGreaterThanOrEqual(-40); } // 성벽(-20) 바로 뒤, 두 줄로 어긋나도 사거리 안
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

describe('2026-11-09 새 기능', () => {
  it('경험이 쌓이면 단계가 오르고 공격·방어 +1, 체력 +2', () => {
    const p = member('a', 'sword'); const s0 = p.stats.s;
    expect(levelOf(0)).toBe(0); expect(levelOf(10)).toBe(1); expect(levelOf(30)).toBe(2); expect(levelOf(29)).toBe(1); expect(expToNext(10)).toBe(20);
    expect(gainExp(p, 10)).toBe(1); expect(p.stats.s).toBe(s0 + 1); expect(p.stats.maxHp).toBe(32);
    expect(gainExp(p, 50)).toBe(2); expect(p.stats.s).toBe(s0 + 3); // 60 → 3단계
  });
  it('전투가 끝나면 산 대원은 경험 +1(처치 +2), 전투 결과에 단계 상승이 적힌다', () => {
    const g = new Game(world(), 5); const sq = g.squads[0]; sq.members = [member('a', 'heavy'), member('b', 'heavy')]; sq.members.forEach(m => { m.stats.e = 9; m.stats.hp = m.stats.maxHp = 60; m.stats.d = 30; });
    const b = new Battle(sq, [{ name: '허수아비', job: '도적', hp: 5, s: 1, d: 0, range: 0, cooldown: 1, speed: 20, bounty: 0 }], 'x', new Rng(2));
    let t = 0; while (!b.result && t < 100) { b.tick(0.1); t += 0.1; }
    expect(b.result).toBe('victory'); expect(sq.members.every(m => m.stats.e >= 10)).toBe(true); expect(b.grown.length).toBe(2);
  });
  it('대원 이름은 이름+성 꼴이고, 좁은 칸에서는 이름만 남는다', () => {
    const g = new Game(world(), 5); const c = g.office('C028')!; expect(c.length).toBeGreaterThan(0);
    for (const x of c) expect(x.name.split(' ').length).toBe(2);
  });
  it('시세 수첩: 교역소에 들르면 값이 적히고, 상품별로 비싼 순으로 본다', () => {
    const g = new Game(world(), 5); g.autoEvents = true;
    expect(g.notebook.size).toBe(0);
    g.noteMarket('C028'); g.noteMarket('C025');
    const goods = g.notedGoods; expect(goods.length).toBeGreaterThan(0);
    const rows = g.noteSellers(goods[0]); expect(rows.length).toBeGreaterThan(0); for (let i = 1; i < rows.length; i++) expect(rows[i - 1].sell).toBeGreaterThanOrEqual(rows[i].sell);
    const j = JSON.parse(JSON.stringify(g.toJSON())); const g2 = Game.fromJSON(world(), j); expect(g2.notebook.size).toBe(2);
  });
  it('의뢰 포기: 위약금 20%, 매복 도적도 함께 사라진다', () => {
    const g = new Game(world(), 7); g.autoEvents = true; const b = g.board('C028')!; const q = b.quests[0];
    g.accept(0, q.id); const cash = g.ledger.cash;
    const fee = g.abandon(q.id); expect(fee).toBe(Math.round(q.reward * BALANCE.civilAbandonFeeRate)); expect(g.ledger.cash).toBe(cash - fee);
    expect(g.activeQuests.has(q.id)).toBe(false); expect(g.squads[0].quests).not.toContain(q.id); expect(g.bands.some(x => x.id === 'R' + q.id)).toBe(false);
  });
  it('연속 6번 미납이면 해산 결말, 갚으면 연속이 끊긴다', () => {
    const g = new Game(world(), 7); g.autoEvents = true; g.ledger.cash = 0;
    for (let i = 0; i < 5; i++) { g.ledger.penalize(); } expect(g.ledger.missedStreak).toBe(5);
    g.ledger.cash = 5000; expect(g.ledger.payDue()).toBe(5000); expect(g.ledger.missedStreak).toBe(0);
    for (let i = 0; i < BALANCE.bankruptMisses - 1; i++) g.ledger.penalize();
    g.collectorVisit = { day: g.day, paid: 0, penalty: 0, squadSite: 'C028', short: true, escortLevel: 1 }; g.collectorAccept();
    expect(g.ending).toBe('bankrupt'); expect(g.paused).toBe(true);
  });
  it('왕복 교역: 사서 떠나고, 도착하면 팔고 돌아온다. «대기»면 멈춘다', () => {
    const g = new Game(world(), 7); g.autoEvents = true; g.ledger.cash = 50_000;
    g.noteMarket('C028'); g.noteMarket('C025'); const good = g.market('C028')!.lines[0].good;
    const r = g.setAutoTrade(0, 'C025', good); expect(r.ok).toBe(true);
    expect(g.squads[0].load).toBeGreaterThan(0); expect(g.squads[0].order).toBe('move'); expect(g.squads[0].destination).toBe('C025');
    for (let i = 0; i < 12 * 3 && g.squads[0].siteId !== 'C025'; i++) { g.tick(1); if (g.collectorVisit) g.dismissCollector(); }
    // 도착 → 팔고 바로 돌아간다
    expect(g.squads[0].auto!.trips).toBe(1); expect(g.squads[0].load).toBe(0); expect(g.squads[0].destination).toBe('C028');
    g.stay(0); expect(g.squads[0].auto).toBeNull();
  });
});

describe('부대장 대화', () => {
  it('같은 거점에서 만나면 한 줄, 같은 쌍은 28일 안에 다시 안 나온다. 저장에 남는다', () => {
    const g = new Game(world(), 5); g.autoEvents = true;
    teleport(g, 1, 'P090'); teleport(g, 0, 'P090');
    (g as unknown as { meet: (i: number, s: string) => void }).meet(0, 'P090');
    const talks = g.messages.filter(m => m.kind === 'talk'); expect(talks.length).toBe(1); expect(talks[0].text).toContain('브록');
    (g as unknown as { meet: (i: number, s: string) => void }).meet(0, 'P090');
    expect(g.messages.filter(m => m.kind === 'talk').length).toBe(1);
    const g2 = Game.fromJSON(world(), JSON.parse(JSON.stringify(g.toJSON()))); expect(Object.keys(g2.talks).length).toBe(1);
  });
});

describe('새 직업', () => {
  it('직업 19개, 치유사는 싸우지 않고 다친 아군을 고친다', () => {
    expect(JOBS.length).toBe(19); expect(new Set(JOBS.map(j => j.id)).size).toBe(19);
    const g = new Game(world(), 5); const sq = g.squads[0];
    const tank = member('t', 'heavy'); tank.stats.maxHp = 80; tank.stats.hp = 40; tank.stats.d = 60;
    sq.members = [tank, member('h', 'healer')];
    const b = new Battle(sq, [{ name: '허수아비', job: '도적', hp: 400, s: 1, d: 60, range: 0, cooldown: 9, speed: 0, bounty: 0 }], 'x', new Rng(2));
    const healer = b.allies.find(u => u.name === 'h')!; expect(healer.heal).toBe(8); expect(healer.range).toBe(0);
    let t = 0; while (t < 12 && !b.result) { b.tick(0.1); t += 0.1; }
    const tankU = b.allies.find(u => u.name === 't')!; expect(tankU.hp).toBeGreaterThan(40); expect(healer.kills).toBe(0);
  });
  it('자동 배치: 치유사는 사격처럼 뒷줄', () => {
    const g = new Game(world(), 5); const sq = g.squads[0];
    sq.members = [member('h', 'healer'), member('a', 'sword'), member('b', 'spear')]; sq.formation = 'archers'; autoArrange(sq);
    expect(sq.members[sq.members.length - 1].job === 'healer' || sq.members.findIndex(m => m.job === 'healer') >= 2).toBe(true);
  });
});
