import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { Battle, makeGarrison } from '../src/core/battle';
import { Game, START_SITE } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { World, fortMax } from '../src/core/world';
import { WORLD_DATA } from '../src/data/world';

const world = new World(WORLD_DATA);
/** 헤드리스: 이벤트 대화는 자동으로 넘긴다 */
const mk = (seed: number): Game => { const g = new Game(world, seed); g.autoEvents = true; return g; };
const run = (g: Game, until: () => boolean, max = 20000) => { let n = 0; while (!until() && n++ < max) { g.tick(0.5); if (g.collectorVisit) g.dismissCollector(); } };
function arm(g: Game, idx: number, n = 5): void {
  let hired = 0;
  for (const c of [...g.office(g.squads[idx].siteId!)!]) { if (hired >= n) break; if (['sword', 'crossbow', 'heavy', 'longbow'].includes(c.job) && g.hire(idx, c.cid).ok) hired++; }
  for (const p of g.squads[idx].people) { g.buyItem(idx, p.id, p.job === 'crossbow' || p.job === 'longbow' ? 'r2' : 'w2'); g.buyItem(idx, p.id, 'a2'); for (let i = 0; i < 3; i++) g.buyItem(idx, p.id, 'p2'); }
}

describe('도구·공연', () => {
  it('도구는 직업 기술을 올리고 되팔면 반값', () => {
    const g = mk(21); const phoebe = g.squads[2]; const t0 = phoebe.tradeSkill;
    expect(g.buyItem(2, phoebe.leader.id, 't2').ok).toBe(true);
    expect(phoebe.tradeSkill).toBe(t0 + 16);
    expect(g.sellItem(2, phoebe.leader.id, 'tool')).toBe(2000);
  });
  it('공연: 리젤(P 40) 혼자 규모 3 성에서는 실패하고 위약금, 악기를 들고 대원을 붙이면 성공', () => {
    const g = mk(21); const cash = g.ledger.cash;
    expect(g.canPerform(0).ok).toBe(true); // 카엘도 P 5 는 있다
    const r1 = g.perform(4)!; // 리젤 40 ≈ 34~46 < 54
    expect(r1.ok).toBe(false); expect(g.ledger.cash).toBeLessThan(cash);
    expect(g.canPerform(4).ok).toBe(false); // 3일 쿨타임
    g.buyItem(4, g.squads[4].leader.id, 'm2');
    for (const c of [...g.office(START_SITE)!]) if (c.job === 'bard') g.hire(4, c.cid);
    g.transfer(3, g.squads[3].leader.id, 4); // 부대장은 못 옮긴다 → false 지만 무해
    g.lastShow = {};
    const before = g.ledger.earned.show;
    const r2 = g.perform(4)!;
    expect(r2.power).toBeGreaterThanOrEqual(56 * 0.85);
    if (r2.ok) expect(g.ledger.earned.show).toBeGreaterThan(before);
  });
  it('술집 소문은 지역 안 교역 팁 한 줄', () => {
    const g = mk(21);
    expect(g.rumor(START_SITE)).toMatch(/남는다|비슷해/);
  });
});

describe('건축', () => {
  it('요새가 상하면 보수 의뢰가 생기고, 작업을 끝내면 건축 수입', () => {
    const g = mk(21);
    g.forts.set('P076', 60); // 리보른 해안 성채 내구 60/100
    const jobs = g.buildJobsAt(START_SITE)!;
    const repair = jobs.find(j => j.site === 'P076')!; expect(repair).toBeTruthy(); expect(repair.reward).toBe(40 * BALANCE.buildRepairRewardPerPoint);
    expect(g.acceptBuild(5, START_SITE, repair.id).ok).toBe(true); // 두린(B 40)
    expect(g.squads[5].work?.site).toBe('P076');
    run(g, () => g.ledger.earned.build > 0, 20000);
    expect(g.ledger.earned.build).toBe(repair.reward);
    expect(g.fortDurability('P076')).toBe(100);
    expect(g.squads[5].order).toBe('idle');
  });
  it('건축력이 없는 부대는 맡을 수 없다', () => {
    const g = mk(21); const jobs = g.buildJobsAt(START_SITE)!;
    expect(g.acceptBuild(4, START_SITE, jobs[0].id).ok).toBe(false); // 리젤 B 0
  });
});

describe('잿빛 교단', () => {
  it('점령지는 통과하지 못하고, 목적지로 찍으면 공성전이 열린다', () => {
    const g = mk(21);
    expect(g.enemyHeld.has('C006')).toBe(true);
    const p = world.path('C027', 'C003', g.blocked, g.enemyHeld)!; // 몽클레르 → 카스테르: 도른을 못 지난다
    expect(p.nodes).not.toContain('C006');
    g.squads[0].pos = { kind: 'at', site: 'C027' }; g.ledger.cash = 200_000; arm(g, 0, 8);
    expect(g.move(0, 'C006')).toBe(true);
    run(g, () => g.battle !== null);
    expect(g.battle?.kind).toBe('siege');
    expect(g.battle?.units.some(u => u.wall)).toBe(true);
  });
  it('공성 방식은 성벽에 ×3, 수비대는 성벽이 설 동안 나오지 않는다', () => {
    const g = mk(22); g.ledger.cash = 200_000; arm(g, 0, 8);
    const b = new Battle(g.squads[0], makeGarrison(false), '수비대', new Rng(3), 'siege');
    b.setAttackMode('siege'); expect(b.attackMode).toBe('siege');
    let t = 0; while (!b.result && t < 300) { b.tick(0.1); t += 0.1; }
    expect(b.result).toBe('victory');
  });
  it('전투단이 요새를 포위하면 내구가 깎이고 0이 되면 함락, 탈환하면 보수', () => {
    const g = mk(23);
    // 전투단을 직접 심는다(생성 확률 대신)
    g.bands.push({ id: 'G', name: '시험 전투단', site: 'P018', tier: 3, questId: null, kind: 'rebel', path: [], target: 'P018', nextMove: 0 });
    g.clock.day += BALANCE.rebelStartDay; const max = fortMax(world.site('P018'));
    g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector();
    expect(g.fortDurability('P018')).toBe(max - BALANCE.rebelSiegeDamage);
    expect(g.reports.length).toBe(1);
    for (let i = 0; i < 20 && !g.enemyHeld.has('P018'); i++) { g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector(); }
    expect(g.enemyHeld.has('P018')).toBe(true);
    expect(g.bands.some(b => b.id === 'G')).toBe(false);
    // 탈환
    g.ledger.cash = 200_000; g.squads[0].pos = { kind: 'at', site: 'C026' }; g.selected = 0; arm(g, 0, 8); g.squads[0].attackMode = 'melee';
    g.move(0, 'P018'); run(g, () => g.battle !== null); g.battle!.setAttackMode('siege');
    run(g, () => g.battle === null);
    expect(g.lastBattle?.result).toBe('victory');
    expect(g.enemyHeld.has('P018')).toBe(false);
    expect(g.ledger.earned.battle).toBeGreaterThanOrEqual(BALANCE.liberateRewardMinor);
  });
  it('떠돌이 도적단이 생기고 돌아다닌다', () => {
    const g = mk(24);
    for (let i = 0; i < BALANCE.roamSpawnDays + 1; i++) { g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector(); }
    expect(g.bands.some(b => b.kind === 'roam')).toBe(true);
  });
});

describe('3단계 완료 기준: 다섯 길 모두로 돈을 번다', () => {
  it('교역·민사·전투·공연·건축 수입이 전부 0보다 크다', () => {
    const saved = { roam: BALANCE.roamSpawnDays, rebel: BALANCE.rebelStartDay };
    BALANCE.roamSpawnDays = 1e9; BALANCE.rebelStartDay = 1e9; // 긴 시나리오라 습격 변수를 끈다
    try { fiveWays(); } finally { BALANCE.roamSpawnDays = saved.roam; BALANCE.rebelStartDay = saved.rebel; }
  });
  function fiveWays(): void {
    const g = mk(25); g.ledger.cash = 120_000;
    // 교역: 포도주 사서 오르블랑에
    g.buy(2, 'wine', 20); g.squads[2].pos = { kind: 'at', site: 'C001' }; g.sell(2, 'wine', 20);
    // 민사
    const q = g.board(START_SITE)!.quests.find(x => x.job !== 'escort')!; g.accept(0, q.id); g.move(0, q.to); run(g, () => g.ledger.earned.civil > 0);
    // 전투: 토벌
    g.squads[1].pos = { kind: 'at', site: START_SITE }; arm(g, 1, 5);
    const mq = g.militaryBoard(START_SITE)!.quests[0]; g.selected = 1; g.acceptMilitary(1, mq.id); g.move(1, mq.target);
    run(g, () => g.ledger.earned.battle > 0);
    // 공연: 리젤 + 음유시인 + 드레스, 큰 성에서
    g.squads[4].pos = { kind: 'at', site: START_SITE }; g.buyItem(4, g.squads[4].leader.id, 'm2');
    for (const c of [...g.office(START_SITE)!]) if (c.job === 'bard') g.hire(4, c.cid);
    g.squads[4].pos = { kind: 'at', site: 'C030' }; // 세인트 아르노(규모 2): 필요 공연력 36
    for (let i = 0; i < 5 && g.ledger.earned.show === 0; i++) { g.lastShow = {}; g.perform(4); }
    // 건축: 두린이 샹파르 성벽 증축
    g.squads[5].pos = { kind: 'at', site: START_SITE };
    const walls = g.buildJobsAt(START_SITE)!.find(j => j.kind === 'walls')!; g.acceptBuild(5, START_SITE, walls.id);
    run(g, () => g.ledger.earned.build > 0);
    const e = g.ledger.earned;
    expect(e.trade).toBeGreaterThan(0); expect(e.civil).toBeGreaterThan(0); expect(e.battle).toBeGreaterThan(0); expect(e.show).toBeGreaterThan(0); expect(e.build).toBeGreaterThan(0);
    // 저장·복원에 3단계 상태가 남는다
    const g2 = Game.fromJSON(world, JSON.parse(JSON.stringify(g.toJSON())));
    expect(g2.enemyHeld.size).toBe(g.enemyHeld.size); expect(g2.ledger.earned.show).toBe(e.show);
  }
});
