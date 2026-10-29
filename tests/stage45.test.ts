import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/balance';
import { ENDING_POEM, EPILOGUES, EVENTS } from '../src/core/events';
import { Game, START_SITE } from '../src/core/game';
import { INCOME_SOURCES } from '../src/core/ledger';
import { LEADERS } from '../src/core/squad';
import { World } from '../src/core/world';
import { WORLD_DATA } from '../src/data/world';

BALANCE.roamSpawnDays = 1e9; BALANCE.rebelStartDay = 1e9;
const run = (g: Game, until: () => boolean, max = 20000) => { let n = 0; while (!until() && n++ < max) { g.tick(0.5); if (g.collectorVisit) g.dismissCollector(); } };
const teleport = (g: Game, idx: number, site: string) => { g.squads[idx].pos = { kind: 'at', site }; g.squads[idx].order = 'idle'; g.squads[idx].path = []; };

describe('4단계: 세계', () => {
  it('항구끼리 항로가 있고, 배를 타면 뱃삯을 낸다', () => {
    const g = new Game(world(), 31);
    expect(g.world.seaEdges.length).toBeGreaterThan(5);
    const sea = g.world.seaEdges[0]; teleport(g, 0, sea.a); const cash = g.ledger.cash;
    expect(g.move(0, sea.b)).toBe(true);
    g.tick(1);
    expect(g.ledger.cash).toBe(cash - BALANCE.ferryFarePerHead);
  });
  it('드워프 산문: 두린이 철산 대문에 오면 통행세 이벤트, 내면 북부 철산이 열린다', () => {
    const g = new Game(world(), 31);
    expect(g.blocked.has('reg_r02')).toBe(true);
    teleport(g, 5, 'C039'); g.selected = 5; g.fireEvents({ site: 'C039', squadIdx: 5 });
    expect(g.event?.id).toBe('dwarf_gate'); expect(g.paused).toBe(true);
    g.chooseEvent(0); // 통행세
    expect(g.blocked.has('reg_r02')).toBe(false);
    expect(g.event?.text).toContain('들어가라'); g.chooseEvent(0); expect(g.event).toBeNull(); expect(g.paused).toBe(false);
    // 다시는 안 뜬다
    g.fireEvents({ site: 'C039', squadIdx: 5 }); expect(g.event).toBeNull();
  });
  it('엘프 숲: 혼혈 엘라가 열고, 그 뒤로는 엘프·혼혈이 있는 부대만 들어간다', () => {
    const g = new Game(world(), 31);
    teleport(g, 3, 'C003'); g.fireEvents({ site: 'C003', squadIdx: 3 }); expect(g.event?.id).toBe('elf_border'); g.chooseEvent(0); g.chooseEvent(0);
    expect(g.blocked.has('reg_r03')).toBe(false);
    expect(g.canEnter(3, 'reg_r03').ok).toBe(true);
    expect(g.canEnter(0, 'reg_r03').ok).toBe(false); // 카엘 부대(인간만)
    teleport(g, 0, 'C003'); expect(g.move(0, 'C013')).toBe(false);
  });
  it('배경 역사: 달이 바뀌면 전령 이벤트, 1001년 6월 오토가 도른을 탈환한다', () => {
    const g = new Game(world(), 31);
    g.clock.day = 28; g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector();
    expect(g.event?.id).toBe('h_100002'); g.chooseEvent(0); expect(g.event?.id).toBe('h_100003'); g.chooseEvent(0);
    expect(g.flags.has('crusade')).toBe(true);
    g.clock.year = 1001; g.clock.month = 5; g.clock.day = 28; g.tick(BALANCE.secondsPerDay * 1.01); if (g.collectorVisit) g.dismissCollector();
    expect(g.event?.id).toBe('h_100106'); g.chooseEvent(0);
    expect(g.enemyHeld.has('C006')).toBe(false);
  });
  it('검은 창은 토벌령 뒤 고수익 의뢰를 먼저 채간다(확률)', () => {
    let stolen = 0;
    for (let seed = 1; seed <= 12; seed++) { const g = new Game(world(), seed); g.flags.add('crusade'); g.militaryBoard('C025'); if (g.messages.some(m => m.text.includes('검은 창'))) stolen++; }
    expect(stolen).toBeGreaterThan(0); expect(stolen).toBeLessThan(12);
  });
});

describe('5단계: 대형 이벤트와 엔딩', () => {
  it('무희의 호송: 세레나 술집에서 받아 리보른에 닿으면 보수와 단원', () => {
    const g = new Game(world(), 32); teleport(g, 4, 'C021'); g.selected = 4;
    expect(g.tavernQuest(4)).toBe(true); expect(g.event?.id).toBe('ev2_offer'); g.chooseEvent(0); g.chooseEvent(0);
    expect(g.flags.has('ev2_escorting')).toBe(true); expect(g.bands.some(b => b.id === 'ev2band')).toBe(true);
    g.bands = g.bands.filter(b => b.id !== 'ev2band'); // 매복은 전투 테스트에서 봤다
    teleport(g, 4, 'C029'); g.fireEvents({ site: 'C029', squadIdx: 4 }); expect(g.event?.id).toBe('ev2_done'); g.chooseEvent(0); g.chooseEvent(0);
    expect(g.ledger.earned.civil).toBe(20_000); expect(g.squads[4].members.some(m => m.id === 'isolde')).toBe(true);
  });
  it('유적 지도 → 인장 조각 3 → 그레이홀로 상자를 열면 1,000만 → 완납 엔딩', () => {
    const g = new Game(world(), 33); g.ledger.cash = 50_000;
    teleport(g, 0, 'C025'); expect(g.tavernQuest(0)).toBe(true); expect(g.event?.id).toBe('ev3_map'); g.chooseEvent(0); g.chooseEvent(0);
    for (const site of ['P096', 'P093', 'P097']) { teleport(g, 0, site); g.fireEvents({ site, squadIdx: 0 }); expect(g.event?.id.startsWith('ev3_seal')).toBe(true); g.chooseEvent(0); g.chooseEvent(0); }
    expect(g.flags.has('seal3')).toBe(true);
    g.enemyHeld.delete('C048'); teleport(g, 0, 'C048'); g.fireEvents({ site: 'C048', squadIdx: 0 });
    expect(g.event?.id).toBe('ev10_box'); expect(g.event?.choices[1].disabled).toBeNull();
    g.chooseEvent(1); g.chooseEvent(0);
    expect(g.ledger.earned.battle).toBe(10_000_000);
    expect(g.ending).toBeNull(); // 돈은 들어왔지만 상환은 집행관에게
    g.clock.day = 6; g.tick(BALANCE.secondsPerDay * 1.01); expect(g.collectorVisit).not.toBeNull();
    g.repayExtra(10_000_000); expect(g.ending).toBe('battle');
  });
  it('황태후의 밀서: 1003년, 강한 부대로 아르덴에서 받으면 근위대 3진이 길을 막고, 오르블랑에 닿으면 250만', () => {
    const g = new Game(world(), 34); g.flags.add('regency_crisis'); g.ledger.cash = 300_000;
    teleport(g, 0, 'C001'); g.fireEvents({ site: 'C001', squadIdx: 0 }); expect(g.event?.id).toBe('ev9_letter'); expect(g.event?.choices[0].disabled).toContain('약하다'); g.chooseEvent(1);
    for (const c of [...g.office('C001')!]) if (['sword', 'heavy', 'crossbow', 'longbow'].includes(c.job)) g.hire(0, c.cid);
    for (const p of g.squads[0].people) { g.buyItem(0, p.id, 'w3'); g.buyItem(0, p.id, 'a3'); }
    g.firedEvents.delete('ev9_letter'); g.fireEvents({ site: 'C001', squadIdx: 0 }); expect(g.event?.choices[0].disabled).toBeNull(); g.chooseEvent(0); g.chooseEvent(0);
    expect(g.bands.filter(b => b.id.startsWith('ev9band')).length).toBeGreaterThanOrEqual(2);
    g.bands = g.bands.filter(b => !b.id.startsWith('ev9band'));
    teleport(g, 0, 'C025'); g.fireEvents({ site: 'C025', squadIdx: 0 }); expect(g.event?.id).toBe('ev9_done'); g.chooseEvent(0);
    expect(g.ledger.earned.battle).toBe(2_500_000); expect(g.flags.has('ev9_hero')).toBe(true);
  });
  it('세탁물은 여성 부대장 부대만, 골렘은 해고·이동 불가', () => {
    const g = new Game(world(), 35); g.ledger.cash = 100_000;
    teleport(g, 0, 'C004'); g.tavernQuest(0); expect(g.event?.id).toBe('ev5_offer'); g.chooseEvent(0);
    teleport(g, 0, 'P052'); g.fireEvents({ site: 'P052', squadIdx: 0 }); expect(g.event?.id).toBe('ev5_blocked'); g.chooseEvent(0);
    g.firedEvents.delete('ev5_done'); teleport(g, 2, 'P052'); g.fireEvents({ site: 'P052', squadIdx: 2 }); expect(g.event?.id).toBe('ev5_done'); g.chooseEvent(0);
    expect(g.ledger.earned.civil).toBe(20_000);
    teleport(g, 0, 'C050'); g.selected = 0; g.fireEvents({ site: 'C050', squadIdx: 0 }); expect(g.event?.id).toBe('ev4_golem'); g.chooseEvent(0); g.chooseEvent(0);
    const golem = g.squads[0].members.find(m => m.job === 'golem')!; expect(golem).toBeTruthy();
    expect(g.fire(0, golem.id)).toBe(0); expect(g.transfer(0, golem.id, 1)).toBe(false);
  });
  it('이벤트 정의는 id 가 겹치지 않고, 후일담은 6부대장 × 5엔딩이 모두 있다', () => {
    const ids = EVENTS.map(e => e.id); expect(new Set(ids).size).toBe(ids.length);
    for (const l of LEADERS) for (const s of INCOME_SOURCES) expect(EPILOGUES[l.id][s].length).toBeGreaterThan(10);
    expect(ENDING_POEM.split('\n').length).toBeGreaterThanOrEqual(4);
  });
  it('저장·복원에 플래그·발동 기록이 남는다', () => {
    const g = new Game(world(), 36); g.flags.add('trophy'); g.firedEvents.add('ev6_tourney');
    const g2 = Game.fromJSON(g.world, JSON.parse(JSON.stringify(g.toJSON())));
    expect(g2.flags.has('trophy')).toBe(true); expect(g2.firedEvents.has('ev6_tourney')).toBe(true);
    expect(g2.world.seaEdges.length).toBe(g.world.seaEdges.length);
  });
});

let cached: World | null = null;
function world(): World { return cached ??= new World(WORLD_DATA, { maxDistance: BALANCE.ferryMaxDistance, speedMul: BALANCE.ferrySpeedMul }); }
void START_SITE; void run;

describe('이야기 시작: 카엘 혼자, 부대장은 합류 이벤트로', () => {
  it('새 이야기에서는 카엘만 움직이고, 브록은 그의 성에서 "함께 가자" 로 합류한다', () => {
    const g = new Game(world(), 31); g.startStory();
    expect(g.isActive(0)).toBe(true); expect(g.isActive(1)).toBe(false);
    expect(g.move(1, 'C028')).toBe(false);
    teleport(g, 0, 'C025'); g.fireEvents({ site: 'C025', squadIdx: 0 });
    expect(g.event?.id).toBe('join_brok');
    g.chooseEvent(1); // 아직은 됐다 → 다음에 다시 온다
    expect(g.isActive(1)).toBe(false); while (g.event) g.chooseEvent(0);
    g.fireEvents({ site: 'C025', squadIdx: 0 }); expect((g as Game).event?.id).toBe('join_brok');
    g.chooseEvent(0); while (g.event) g.chooseEvent(0);
    expect(g.isActive(1)).toBe(true); expect(g.squads[1].siteId).toBe('C025');
    const back = Game.fromJSON(world(), JSON.parse(JSON.stringify(g.toJSON())));
    expect(back.isActive(1)).toBe(true); expect(back.isActive(2)).toBe(false);
  });
});
