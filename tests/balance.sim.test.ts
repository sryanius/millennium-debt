/**
 * 밸런스 시뮬(평소 테스트에서는 건너뜀): 단순한 욕심쟁이 봇이 여섯 부대를 굴려 빚을 얼마 만에 갚는지 잰다.
 *   SIM=1 npx vitest run tests/balance.sim.test.ts
 * 봇: 피비 = 교역 왕복(3일 안 최고 이익), 카엘·브록 = 고용 후 토벌/탈환, 엘라 = 민사 배달, 리젤 = 공연, 두린 = 건축.
 *     상환일마다 소지금 중 여유분(급료·장비 예비 제외)을 추가 상환.
 */
import { describe, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { Game, START_SITE } from '../src/core/game';
import { GOOD_BY_ID } from '../src/core/goods';
import { INCOME_SOURCES } from '../src/core/ledger';
import { World, isTown } from '../src/core/world';
import { WORLD_DATA } from '../src/data/world';

const env = (globalThis as any).process?.env ?? {};
const RUN = !!env.SIM;
const YEARS = Number(env.SIM_YEARS ?? 5);
const SEEDS = (env.SIM_SEEDS ?? '1,2,3').split(',').map(Number);

function bot(seed: number) {
  const world = new World(WORLD_DATA, { maxDistance: BALANCE.ferryMaxDistance, speedMul: BALANCE.ferrySpeedMul });
  const g = new Game(world, seed); g.autoEvents = true;
  const days = YEARS * 12 * 28; const log: string[] = [];
  const reserve = () => 20_000 + g.squads.reduce((a, s) => a + s.wages, 0) * 2;
  let cur = 0; // near() 를 부르는 부대
  const near = (_from: string, maxDays: number, pred: (id: string) => boolean) => [...world.sites.values()].filter(s => pred(s.id)).map(s => ({ id: s.id, d: g.eta(cur, s.id) ?? 99 })).filter(x => x.d <= maxDays).sort((a, b) => a.d - b.d);
  let paidOff = -1;
  const armed = new Set<number>();
  const arm = (i: number) => {
    const s = g.squads[i]; if (!s.siteId || !isTown(world.site(s.siteId))) return;
    for (const c of [...(g.office(s.siteId) ?? [])]) { if (s.members.length >= 6) break; if (['sword', 'heavy', 'crossbow', 'longbow'].includes(c.job) && g.ledger.cash - c.hire > reserve()) g.hire(i, c.cid); }
    for (const p of s.people) { const best = p.job === 'crossbow' || p.job === 'longbow' ? ['r3', 'r2', 'r1'] : ['w3', 'w2', 'w1']; for (const w of best) if (!p.weapon && g.ledger.cash - 5000 > reserve() && g.buyItem(i, p.id, w).ok) break; for (const a of ['a2', 'a1']) if (!p.armor && g.ledger.cash - 3000 > reserve() && g.buyItem(i, p.id, a).ok) break; while (p.potions < 3 && g.ledger.cash > reserve() && g.buyItem(i, p.id, 'p1').ok) { /* 약 */ } }
    if (s.members.length >= 3) armed.add(i);
  };
  const think = () => {
    g.squads.forEach((s, i) => {
      if (i === g.battleSquad || s.order === 'move' || s.order === 'build' || !s.siteId) return;
      cur = i;
      const here = s.siteId; const town = isTown(world.site(here));
      if (i === 2) { // 교역
        for (const good of Object.keys(s.cargo)) g.sell(i, good, 9999);
        const m = g.market(here); if (!m) { const t = near(here, 6, id => !!g.market(id))[0]; if (t) g.move(i, t.id); return; }
        let best: { to: string; good: string; per: number } | null = null;
        for (const t of near(here, 4, id => id !== here && !!g.market(id))) {
          const mt = g.market(t.id)!;
          for (const l of m.lines) { const gain = mt.sellPrice(l.good, s.tradeSkill) - m.buyPrice(l.good, s.tradeSkill); const per = gain * Math.min(s.capacity, l.stock) / Math.max(0.5, t.d); if (gain > 0 && (!best || per > best.per)) best = { to: t.id, good: l.good, per }; }
        }
        if (best) { g.buy(i, best.good, 9999); g.move(i, best.to); }
        return;
      }
      if (i === 0 || i === 1) { // 전투
        if (!armed.has(i)) { if (town) arm(i); else { const t = near(here, 6, id => isTown(world.site(id)))[0]; if (t) g.move(i, t.id); } if (!armed.has(i)) return; }
        if (town && s.people.some(p => p.stats.hp < p.stats.maxHp * 0.5)) g.heal(i);
        if (town) arm(i);
        const band = g.bands.find(b => b.kind !== 'rebel' && (g.eta(i, b.site) ?? 99) < 6);
        if (band) { g.move(i, band.site); return; }
        if (town) { const mb = g.militaryBoard(here); const q = mb?.quests[0]; if (q && g.acceptMilitary(i, q.id)) { g.move(i, q.target); return; } }
        if (s.members.length >= 6) { const held = [...g.enemyHeld].map(id => ({ id, d: g.eta(i, id) ?? 99 })).filter(x => x.d < 8 && world.site(x.id).kind !== 'castle').sort((a, b) => a.d - b.d)[0]; if (held) { g.move(i, held.id); return; } }
        const t = near(here, 5, id => isTown(world.site(id)) && id !== here).sort(() => g.rngNext() - 0.5)[0]; if (t) g.move(i, t.id);
        return;
      }
      if (i === 3) { // 민사
        if (!town) { const t = near(here, 6, id => isTown(world.site(id)))[0]; if (t) g.move(i, t.id); return; }
        const b = g.board(here); const q = b?.quests.filter(x => x.job !== 'escort' || armed.size > 0).sort((a, b2) => b2.reward / b2.travelDays - a.reward / a.travelDays)[0];
        if (q && g.accept(i, q.id)) { g.move(i, q.to); return; }
        const t = near(here, 4, id => isTown(world.site(id)) && id !== here)[0]; if (t) g.move(i, t.id); return;
      }
      if (i === 4) { // 공연
        if (town && g.canPerform(i).ok) { if (s.performSkill < world.site(here).size * BALANCE.showFailPowerPerSize) { for (const c of [...(g.office(here) ?? [])]) if (c.job === 'bard' && s.members.length < 6 && g.ledger.cash - c.hire > reserve()) g.hire(i, c.cid); if (!s.leader.tool && g.ledger.cash > reserve() + 4000) g.buyItem(i, s.leader.id, 'm2'); } if (s.performSkill >= world.site(here).size * BALANCE.showFailPowerPerSize) g.perform(i); }
        const t = near(here, 3, id => isTown(world.site(id)) && id !== here && world.site(id).size * BALANCE.showFailPowerPerSize <= s.performSkill + 5).sort(() => g.rngNext() - 0.5)[0] ?? near(here, 4, id => isTown(world.site(id)) && id !== here)[0];
        if (t) g.move(i, t.id); return;
      }
      if (i === 5) { // 건축
        if (!town) { const t = near(here, 6, id => isTown(world.site(id)))[0]; if (t) g.move(i, t.id); return; }
        if (!s.leader.tool && g.ledger.cash > reserve() + 4000) g.buyItem(i, s.leader.id, 'b2');
        for (const c of [...(g.office(here) ?? [])]) if (c.job === 'mason' && s.members.length < 4 && g.ledger.cash - c.hire > reserve()) g.hire(i, c.cid);
        const jobs = g.buildJobsAt(here) ?? []; const j = jobs.sort((a, b) => b.reward / b.work - a.reward / a.work)[0];
        if (j) g.acceptBuild(i, here, j.id); else { const t = near(here, 4, id => isTown(world.site(id)) && id !== here)[0]; if (t) g.move(i, t.id); }
      }
    });
  };
  let lastMonth = -1;
  for (let d = 0; d < days && !g.ending; ) {
    const before = g.day;
    g.tick(1);
    if (g.collectorVisit) {
      if (g.collectorVisit.short) { if (armed.size && g.squads[0].siteId) g.collectorFight(0); else g.collectorAccept(); }
      const extra = g.ledger.cash - reserve(); if (extra > 5000) g.repayExtra(Math.floor(extra / 1000) * 1000);
      g.dismissCollector();
    }
    if (g.clock.speed === 0 && !g.ending) g.clock.speed = 1;
    if (g.day !== before) { d++; think(); }
    const m = g.clock.year * 12 + g.clock.month;
    if (m !== lastMonth && g.clock.day === 1) { lastMonth = m; if ((m - 12000) % 6 === 2) log.push(`${g.clock.year}.${String(g.clock.month).padStart(2, '0')}  부채 ${(g.ledger.debt / 1e6).toFixed(2)}M  소지 ${(g.ledger.cash / 1e3).toFixed(0)}k  번 돈 ` + INCOME_SOURCES.map(s => s[0] + (g.ledger.earned[s] / 1e3).toFixed(0) + 'k').join(' ')); }
    if (g.ending && paidOff < 0) paidOff = g.elapsed;
  }
  return { seed, paidOff, debt: g.ledger.debt, earned: { ...g.ledger.earned }, ending: g.ending, log, held: g.enemyHeld.size, missed: g.ledger.missed, members: g.squads.map(s => s.members.length) };
}

describe.skipIf(!RUN)('밸런스 시뮬', () => {
  it('봇이 빚을 갚는 데 걸리는 시간', () => {
    for (const seed of SEEDS) {
      const r = bot(seed);
      console.log(`\n== seed ${r.seed}: ${r.paidOff >= 0 ? '완납 ' + (r.paidOff / 336).toFixed(2) + '년 (' + r.paidOff + '일)' : '미완납, 남은 부채 ' + (r.debt / 1e6).toFixed(2) + 'M'}  엔딩 ${r.ending ?? '-'}  미납 ${r.missed}  점령지 ${r.held}  대원 ${r.members.join('/')}`);
      console.log('   번 돈 ' + INCOME_SOURCES.map(s => s + ' ' + (r.earned[s] / 1e3).toFixed(0) + 'k').join(' · '));
      for (const l of r.log) console.log('   ' + l);
    }
  }, 600_000);
});
void START_SITE; void GOOD_BY_ID;
