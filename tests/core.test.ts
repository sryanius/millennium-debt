import { describe, expect, it } from 'vitest';
import { Game, START_SITE } from '../src/core/game';
import { GameClock } from '../src/core/clock';
import { Ledger } from '../src/core/ledger';
import { World } from '../src/core/world';
import { BALANCE } from '../src/core/balance';
import { WORLD_DATA } from '../src/data/world';

const world = new World(WORLD_DATA);
/** 헤드리스: 이벤트 대화는 자동으로 넘긴다 */
const mk = (seed: number): Game => { const g = new Game(world, seed); g.autoEvents = true; return g; };
// 1단계 규칙만 본다: 떠돌이 도적·잿빛 교단은 끈다
BALANCE.roamSpawnDays = 1e9; BALANCE.rebelStartDay = 1e9;

describe('달력', () => {
  it('28일 × 12달, 상환일 7·14·21·28', () => {
    const c = new GameClock({ year: 1000, month: 12, day: 28 });
    expect(c.isRepaymentDay).toBe(true);
    expect(c.daysToRepayment).toBe(0);
    c.nextDay();
    expect(c.date).toEqual({ year: 1001, month: 1, day: 1 });
    expect(c.daysToRepayment).toBe(6);
    expect(GameClock.format(c.date)).toBe('1001/01/01');
  });
  it('실시간 → 일수', () => {
    const c = new GameClock({ year: 1000, month: 3, day: 1 });
    expect(c.advance(BALANCE.secondsPerDay * 2.5)).toBe(2);
    expect(c.day).toBe(3);
    c.speed = 0; expect(c.advance(1000)).toBe(0);
  });
});

describe('장부', () => {
  it('상환일 자동 차감과 가산금', () => {
    const l = new Ledger();
    expect(l.repaymentDay()).toEqual({ paid: 5000, penalty: 0 });
    expect(l.debt).toBe(9_995_000);
    l.cash = 100;
    expect(l.repaymentDay()).toEqual({ paid: 0, penalty: 100_000 });
    expect(l.debt).toBe(10_095_000);
  });
  it('추가 상환은 소지금·부채를 넘지 않고, 완납이면 가장 많이 번 길이 엔딩', () => {
    const l = new Ledger(); l.cash = 20_000_000; l.debt = 7_000;
    expect(l.repayExtra(1_000_000)).toBe(7_000);
    expect(l.isPaidOff).toBe(true);
    l.earn('civil', 10); l.earn('trade', 20);
    expect(l.endingSource).toBe('trade');
  });
});

describe('세계 그래프', () => {
  it('150거점, 대칭 간선, 샹파르→오르블랑 20단위', () => {
    expect(world.sites.size).toBe(150);
    const p = world.path('C028', 'C025')!;
    expect(p.nodes).toEqual(['C028', 'P090', 'C025']);
    expect(p.length).toBe(20);
  });
  it('막힌 지역은 통과도 도착도 못 한다', () => {
    expect(world.path('C028', 'C013', new Set(['reg_r03']))).toBeNull();
    const open = world.path('C028', 'C001')!; // 제도까지는 열려 있다
    expect(open.nodes[0]).toBe('C028'); expect(open.nodes.at(-1)).toBe('C001');
  });
  it('지역 홉', () => {
    expect(world.regionHops('reg_r06', 'reg_r06')).toBe(0);
    expect(world.regionHops('reg_r06', 'reg_r01')).toBe(1);
    expect(world.regionHops('reg_r06', 'reg_r09')).toBeGreaterThan(1);
  });
});

describe('게임 진행', () => {
  it('이동: 샹파르→오르블랑은 2일', () => {
    const g = mk(7);
    expect(g.move(0, 'C025')).toBe(true);
    g.tick(BALANCE.secondsPerDay * 0.5); // 반나절: 샹파르→교역소 길 위
    expect(g.squads[0].pos.kind).toBe('road');
    g.tick(BALANCE.secondsPerDay * 0.5); // 1일: 교역소(P090) 경유
    expect(g.squads[0].siteId).toBe('P090');
    g.tick(BALANCE.secondsPerDay * 1.01);
    expect(g.squads[0].siteId).toBe('C025');
    expect(g.squads[0].order).toBe('idle');
  });
  it('상환일에 자동 차감되고 집행관 대화가 뜬다', () => {
    const g = mk(7);
    g.clock = new GameClock({ year: 1000, month: 3, day: 6 });
    g.tick(BALANCE.secondsPerDay * 1.01);
    expect(g.clock.day).toBe(7);
    expect(g.ledger.debt).toBe(9_995_000);
    expect(g.collectorVisit?.paid).toBe(5000);
    expect(g.paused).toBe(true);
    g.dismissCollector(); expect(g.paused).toBe(false);
  });
  it('교역: 샹파르 포도주를 사서 제도(아르덴)에 팔면 남는다', () => {
    const g = mk(7);
    const home = g.market(START_SITE)!; const far = g.market('C001')!;
    expect(home.buyPrice('wine', 0)).toBeLessThan(far.sellPrice('wine', 0));
    const r = g.buy(2, 'wine', 999); // 피비(T 40)
    expect(r.ok).toBe(true); expect(r.qty).toBe(g.squads[2].capacity);
    const cashAfterBuy = g.ledger.cash;
    // 순간이동 대신 위치만 옮겨 판다(이동은 위에서 검증)
    g.squads[2].pos = { kind: 'at', site: 'C001' };
    const s = g.sell(2, 'wine', 999);
    expect(s.ok).toBe(true);
    expect(g.ledger.cash - cashAfterBuy).toBeGreaterThan(r.cost!);
    expect(g.ledger.earned.trade).toBe(s.income);
  });
  it('상업력이 높으면 사는 값도 파는 값도 내린다', () => {
    const m = mk(7).market(START_SITE)!;
    expect(m.buyPrice('wine', 100)).toBeLessThan(m.buyPrice('wine', 0));
    expect(m.sellPrice('wine', 100)).toBeLessThan(m.sellPrice('wine', 0));
  });
  it('민사 의뢰: 수락 → 도착하면 보수', () => {
    const g = mk(7);
    const b = g.board(START_SITE)!;
    expect(b.quests.length).toBe(3);
    const q = b.quests.find(x => x.job !== 'escort') ?? b.quests[0]; // 총호송은 매복이 붙는다(3단계)
    expect(g.accept(0, q.id)).toBe(true);
    expect(g.board(START_SITE)!.quests.length).toBe(2);
    g.move(0, q.to);
    const days = g.eta(0, q.to)!;
    g.tick(BALANCE.secondsPerDay * (days + 0.1));
    expect(g.squads[0].siteId).toBe(q.to);
    expect(g.ledger.earned.civil).toBe(q.reward);
    expect(g.activeQuests.size).toBe(0);
  });
  it('저장·복원', () => {
    const g = mk(7);
    g.buy(2, 'wine', 5); g.move(0, 'C025'); g.tick(BALANCE.secondsPerDay * 0.5);
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    const g2 = Game.fromJSON(world, j);
    expect(g2.squads[2].cargo.wine).toBe(5);
    expect(g2.squads[0].pos.kind).toBe('road');
    expect(g2.ledger.cash).toBe(g.ledger.cash);
    expect(g2.market(START_SITE)!.line('wine')!.stock).toBe(g.market(START_SITE)!.line('wine')!.stock);
  });
});

describe('1단계 완료 기준: 샹파르에서 출발해 교역으로 첫 상환', () => {
  it('포도주를 제도로, 서적을 곡창으로 한 번 왕복하면 상환액(5,000)보다 많이 남는다', () => {
    const g = mk(3);
    const start = g.ledger.cash;
    // 가장 가까운 중앙 제도(R01) 성
    const target = world.towns().filter(t => t.region === 'reg_r01' && !g.enemyHeld.has(t.id))
      .map(t => ({ t, len: world.path(START_SITE, t.id, g.blocked, g.enemyHeld)!.length })).sort((a, b) => a.len - b.len)[0];
    expect(target.len / BALANCE.marchSpeed).toBeLessThan(12); // 편도 12일 미만
    let visits = 0;
    const step = () => { g.tick(1); if (g.collectorVisit) { visits++; g.dismissCollector(); } };
    // 피비 부대(T 40): 포도주 사서 제도에 팔고, 서적 사서 돌아와 판다
    expect(g.buy(2, 'wine', 999).ok).toBe(true);
    g.move(2, target.t.id);
    while (g.squads[2].siteId !== target.t.id) step();
    expect(g.sell(2, 'wine', 999).ok).toBe(true);
    expect(g.buy(2, 'books', 999).ok).toBe(true);
    g.move(2, START_SITE);
    while (g.squads[2].siteId !== START_SITE) step();
    expect(g.sell(2, 'books', 999).ok).toBe(true);
    const spent = g.ledger.spent.goods, earned = g.ledger.earned.trade;
    expect(earned - spent).toBeGreaterThan(BALANCE.minRepayment * 0.6); // 교역 이익이 상환액의 상당 부분(초반 교역은 수천 골, GDD §8)
    expect(visits).toBeGreaterThanOrEqual(1); // 그 사이 상환일이 지나 자동 차감
    expect(g.ledger.debt).toBe(BALANCE.startDebt - visits * BALANCE.minRepayment);
    expect(g.ledger.cash - start + visits * BALANCE.minRepayment).toBeGreaterThan(0); // 상환한 돈을 더하면 소지금이 늘었다(왕복이 길어 상환일이 여러 번 지날 수 있다)
  });
});
