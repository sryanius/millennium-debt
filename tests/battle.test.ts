import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { Battle, makeBandits, makeEscort } from '../src/core/battle';
import { Game, START_SITE } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { World } from '../src/core/world';
import { WORLD_DATA } from '../src/data/world';

const world = new World(WORLD_DATA);
/** 헤드리스: 이벤트 대화는 자동으로 넘긴다 */
const mk = (seed: number): Game => { const g = new Game(world, seed); g.autoEvents = true; return g; };
BALANCE.roamSpawnDays = 1e9; BALANCE.rebelStartDay = 1e9;

/** 샹파르 계약소에서 검병·석궁병을 살 수 있을 만큼 고용 */
function hireSome(g: Game, idx: number, n: number): number {
  let hired = 0;
  for (const c of [...g.office(START_SITE)!]) { if (hired >= n) break; if (c.job === 'sword' || c.job === 'crossbow' || c.job === 'heavy' || c.job === 'longbow') { if (g.hire(idx, c.cid).ok) hired++; } }
  return hired;
}
function runBattle(b: Battle, maxSec = 300): void { let t = 0; while (!b.result && t < maxSec) { b.tick(0.1); t += 0.1; } }

describe('계약소·장비', () => {
  it('고용은 돈을 쓰고 8명까지, 해고는 매입가를 돌려준다', () => {
    const g = mk(11);
    const cands = g.office(START_SITE)!; expect(cands.length).toBeGreaterThanOrEqual(3);
    const c = cands[0]; const cash = g.ledger.cash;
    expect(g.hire(0, c.cid).ok).toBe(true);
    expect(g.ledger.cash).toBe(cash - c.hire);
    expect(g.squads[0].members.length).toBe(1);
    const refund = g.fire(0, g.squads[0].members[0].id);
    expect(refund).toBe(c.hire); expect(g.ledger.cash).toBe(cash);
    expect(g.squads[0].members.length).toBe(0);
  });
  it('장비는 사면 바로 장착, 바꾸면 헌 것은 반값 환급, 회복약은 5개까지', () => {
    const g = mk(11); const kael = g.squads[0].leader; const cash0 = g.ledger.cash;
    expect(g.shopItems(START_SITE, 'weapon').map(i => i.id)).toContain('w2'); // 규모 3 → 2단계까지
    expect(g.shopItems(START_SITE, 'weapon').map(i => i.id)).not.toContain('w3');
    expect(g.buyItem(0, kael.id, 'w1').ok).toBe(true); expect(kael.weapon).toBe('w1');
    expect(g.buyItem(0, kael.id, 'w2').ok).toBe(true); expect(kael.weapon).toBe('w2');
    expect(g.ledger.cash).toBe(cash0 - 600 - 1800 + 300);
    for (let i = 0; i < 5; i++) expect(g.buyItem(0, kael.id, 'p1').ok).toBe(true);
    expect(g.buyItem(0, kael.id, 'p1').ok).toBe(false); expect(kael.potions).toBe(5);
  });
  it('같은 거점의 부대끼리 대원을 옮긴다', () => {
    const g = mk(11); hireSome(g, 0, 2);
    const m = g.squads[0].members[0];
    expect(g.transfer(0, m.id, 1)).toBe(true); expect(g.squads[1].members[0]).toBe(m);
    g.squads[1].pos = { kind: 'at', site: 'C025' };
    expect(g.transfer(1, m.id, 0)).toBe(false);
  });
});

describe('전투', () => {
  it('부대장 혼자는 소규모 도적단에 밀려 퇴각하고, 대원을 고용·무장하면 이긴다', () => {
    const g = mk(5);
    const alone = new Battle(g.squads[1], makeBandits(2, new Rng(1)), '도적단', new Rng(2));
    runBattle(alone); expect(alone.result).not.toBe('victory');
    expect(g.squads[1].leader.stats.hp).toBeGreaterThanOrEqual(1); // 부대장은 죽지 않는다
    const g2 = mk(5); g2.ledger.cash = 60_000;
    expect(hireSome(g2, 0, 4)).toBeGreaterThanOrEqual(3);
    for (const p of g2.squads[0].people) { g2.buyItem(0, p.id, 'w1'); g2.buyItem(0, p.id, 'a1'); }
    const b = new Battle(g2.squads[0], makeBandits(1, new Rng(1)), '도적단', new Rng(2));
    runBattle(b); expect(b.result).toBe('victory'); expect(b.bounty).toBeGreaterThan(0);
    expect(g2.squads[0].leader.stats.e).toBeGreaterThan(10); // 경험치
  });
  it('전투 명령: 대열 바꾸기, 전체 퇴각, 개별 퇴각', () => {
    const g = mk(5); g.ledger.cash = 60_000; hireSome(g, 0, 3);
    const b = new Battle(g.squads[0], makeBandits(3, new Rng(1)), '도적단', new Rng(2));
    b.setFormation('square'); expect(g.squads[0].formation).toBe('square');
    b.tick(0.1); b.paused = true; b.tick(1); expect(b.time).toBeCloseTo(0.1, 5); b.resume();
    b.retreatUnit(b.allies[1].id); expect(b.allies[1].state).toBe('retreat');
    b.retreatAll(); runBattle(b, 30);
    expect(b.result).toBe('retreat');
    expect(b.allies.every(u => u.state === 'fled' || u.state === 'dead')).toBe(true);
  });
  it('호위대는 단계가 오를수록 강하다', () => {
    expect(makeEscort(1).length).toBe(4);
    expect(makeEscort(5).length).toBe(12);
    expect(makeEscort(5).some(e => e.job === '드워프 철갑보병')).toBe(true);
  });
});

describe('2단계 완료 기준: 군사 게시판 토벌 의뢰 1건 완수', () => {
  it('샹파르에서 의뢰를 받아 도적단이 있는 거점으로 가서 이기면 보수를 받는다', () => {
    const g = mk(9); g.ledger.cash = 60_000;
    expect(hireSome(g, 0, 5)).toBeGreaterThanOrEqual(4);
    for (const p of g.squads[0].people) { g.buyItem(0, p.id, p.job === 'crossbow' ? 'r1' : 'w1'); g.buyItem(0, p.id, 'a1'); g.buyItem(0, p.id, 'p1'); }
    const mb = g.militaryBoard(START_SITE)!; expect(mb.quests.length).toBeGreaterThanOrEqual(1);
    const q = mb.quests.find(x => x.tier === 1) ?? mb.quests[0];
    expect(g.acceptMilitary(0, q.id)).toBe(true);
    expect(g.bands.length).toBe(1);
    expect(g.move(0, q.target)).toBe(true);
    let guard = 0;
    while (!g.battle && guard++ < 5000) { g.tick(1); if (g.collectorVisit) g.dismissCollector(); }
    expect(g.battle).not.toBeNull();
    guard = 0;
    while (g.battle && guard++ < 5000) { g.tick(0.5); if (g.collectorVisit) g.dismissCollector(); }
    expect(g.lastBattle?.result).toBe('victory');
    expect(g.ledger.earned.battle).toBeGreaterThanOrEqual(q.reward);
    expect(g.bands.filter(b => b.kind === 'bandit').length).toBe(0); expect(g.activeMilitary.size).toBe(0);
    expect(g.ledger.endingSource).toBe('battle');
  });
  it('상환일에 돈이 없으면 호위대와 싸워 상환을 미룰 수 있다', () => {
    const g = mk(9); g.ledger.cash = 60_000;
    hireSome(g, 0, 5); for (const p of g.squads[0].people) { g.buyItem(0, p.id, 'w1'); g.buyItem(0, p.id, 'a1'); }
    g.ledger.cash = 100;
    g.clock.day = 6; g.tick(BALANCE.secondsPerDay * 1.01);
    expect(g.collectorVisit?.short).toBe(true);
    expect(g.collectorFight(0)).toBe(true); expect(g.battle?.kind).toBe('escort');
    let guard = 0; while (g.battle && guard++ < 5000) g.tick(0.5);
    expect(g.collectorVisit?.fought).toBe('victory');
    expect(g.ledger.debt).toBe(BALANCE.startDebt); // 가산금도 상환도 없음
    expect(g.escortLevel).toBe(2);
    g.dismissCollector();
    // 받아들이면 가산금
    g.ledger.cash = 100; g.clock.day = 13; g.tick(BALANCE.secondsPerDay * 1.01);
    g.collectorAccept(); expect(g.ledger.debt).toBe(BALANCE.startDebt + BALANCE.missedPenalty);
  });
  it('월초에 급료를 못 주면 장비 든 대원이 도망간다', () => {
    const g = mk(9); g.ledger.cash = 60_000; hireSome(g, 0, 4);
    for (const p of g.squads[0].members) g.buyItem(0, p.id, 'w1');
    g.ledger.cash = 10; g.clock.day = 28; g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector();
    expect(g.clock.day).toBe(1);
    expect(g.squads[0].members.length).toBeLessThan(4);
  });
  it('병원은 HP·피로를 돈 받고 되돌린다', () => {
    const g = mk(9); const k = g.squads[0].leader; k.stats.hp = 10; k.stats.f = 40;
    const cost = g.hospitalCost(0); expect(cost).toBe(30 * BALANCE.hospitalPerHp + 40 * BALANCE.hospitalPerFatigue);
    expect(g.heal(0)).toBe(true); expect(k.stats.hp).toBe(k.stats.maxHp); expect(k.stats.f).toBe(0);
  });
});
