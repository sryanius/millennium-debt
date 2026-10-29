import { BALANCE } from './balance';
import { Battle, makeBandits, makeEscort, makeGarrison, makeRebels, type EnemyDef } from './battle';
import { Board, CIVIL_JOB_LABEL, type CivilQuest } from './board';
import { GameClock } from './clock';
import { ARMORS, ARMOR_BY_ID, MAX_POTIONS, POTIONS, POTION_BY_ID, SELLBACK, TOOLS, TOOL_BY_ID, WEAPONS, WEAPON_BY_ID, itemName, itemPrice, type Armor, type Potion, type Tool, type Weapon } from './equipment';
import { GOOD_BY_ID } from './goods';
import { JOB_BY_ID, jobsAt, rollCandidate } from './jobs';
import { INCOME_LABEL, Ledger, type IncomeSource } from './ledger';
import { Market, hash } from './market';
import { MilitaryBoard, type EnemyBand, type MilitaryQuest } from './military';
import { Rng } from './rng';
import { BLACK_SPEAR_ALLIES, EVENTS, type EventCtx, type GameEvent } from './events';
import { LEADERS, MAX_MEMBERS, Squad, type Person } from './squad';
import { fortMax, hasMarket, isFort, isTown, World, type Site, type WorldData } from './world';

export type MessageKind = 'info' | 'money' | 'collector' | 'quest' | 'ending' | 'warn' | 'battle' | 'fort';
export interface GameMessage { day: number; kind: MessageKind; text: string }

/** 상환일에 집행관이 들른 결과. UI가 대화창으로 보여 주고 지운다. */
export interface CollectorVisit {
  day: number; paid: number; penalty: number; squadSite: string;
  /** 돈이 모자라 아직 결정 전(호위대와 싸운다 / 가산금을 받아들인다) */
  short: boolean; escortLevel: number;
  /** 호위대 전투 결과 */
  fought?: 'victory' | 'defeat' | 'retreat';
}
export interface Candidate extends Person { cid: string }
export interface OfficeJSON { siteId: string; day: number; candidates: Candidate[] }
/** 건축 의뢰(건축 창) */
export interface BuildJob { id: string; name: string; site: string; work: number; reward: number; kind: 'repair' | 'walls' }
/** 요새 보고 한 줄(원작: "○○가 ○○요새를 공격, 8의 피해") */
export interface FortReport { day: number; site: string; attacker: string; damage: number; durability: number }
/** 공연 결과 */
export interface ShowResult { ok: boolean; power: number; income: number; penalty: number; text: string }

export interface GameJSON {
  version: 3; seed: number; clock: ReturnType<GameClock['toJSON']>; ledger: ReturnType<Ledger['toJSON']>;
  squads: ReturnType<Squad['toJSON']>[]; markets: ReturnType<Market['toJSON']>[]; boards: ReturnType<Board['toJSON']>[];
  activeQuests: CivilQuest[]; blocked: string[]; messages: GameMessage[]; ending: IncomeSource | null; selected: number;
  offices: OfficeJSON[]; military: ReturnType<MilitaryBoard['toJSON']>[]; activeMilitary: MilitaryQuest[]; bands: EnemyBand[]; escortLevel: number; deferrals: number;
  forts: Record<string, number>; enemyHeld: string[]; lastShow: Record<string, number>; buildJobs: { siteId: string; day: number; jobs: BuildJob[] }[]; reports: FortReport[]; roamNext: number; rng: number;
  flags: string[]; firedEvents: string[]; jointTarget: string | null; lastMonth: number; startDay: number;
  recruited?: string[];
}

export const START_SITE = 'C028'; // 샹파르(GDD §4.1)
/** 초반 진입 불가: 드워프(산문 폐쇄)·엘프(경계 선언)·군도(배편) */
export const INITIAL_BLOCKED = ['reg_r02', 'reg_r03', 'reg_r08'];
export const REBEL_FACTION = 'fac_10';

/**
 * 게임 상태 전체 + 규칙. Phaser 없이 tick()만 돌리면 헤드리스로 진행된다.
 */
export class Game {
  readonly world: World;
  clock = new GameClock();
  ledger = new Ledger();
  squads: Squad[];
  markets = new Map<string, Market>();
  boards = new Map<string, Board>();
  activeQuests = new Map<string, CivilQuest>();
  offices = new Map<string, { day: number; candidates: Candidate[] }>();
  military = new Map<string, MilitaryBoard>();
  activeMilitary = new Map<string, MilitaryQuest>();
  bands: EnemyBand[] = [];
  blocked = new Set<string>(INITIAL_BLOCKED);
  /** 요새 내구(없으면 최대치) */
  forts = new Map<string, number>();
  /** 잿빛 교단 점령지 */
  enemyHeld = new Set<string>();
  lastShow: Record<string, number> = {};
  buildJobs = new Map<string, { day: number; jobs: BuildJob[] }>();
  reports: FortReport[] = [];
  /** 시작 시점의 통산 일수. 경과일 = day − startDay */
  startDay: number;
  roamNext = 0;
  /** 합류한 부대장(squad id). 새 게임은 카엘 혼자 시작하고 나머지는 이벤트로 합류한다(startStory). 테스트·옛 저장은 전원 */
  recruited = new Set<string>(LEADERS.map(l => l.id));
  /** 이벤트 플래그(인장 조각·골렘·호송 중 …) */
  flags = new Set<string>();
  firedEvents = new Set<string>();
  /** 보여 줄 이벤트 대화(UI가 선택지를 고른다). 큐 */
  eventQueue: GameEvent[] = [];
  jointTarget: string | null = null;
  /** 헤드리스(테스트·밸런스 시뮬): 이벤트를 첫 번째 가능한 선택지로 자동 처리하고 멈추지 않는다 */
  autoEvents = false;
  private lastMonth = -1;
  messages: GameMessage[] = [];
  /** UI가 아직 안 본 메시지 수 */
  unread = 0;
  collectorVisit: CollectorVisit | null = null;
  escortLevel = 1;
  deferrals = 0;
  battle: Battle | null = null;
  /** 전투 중인 부대 */
  battleSquad = -1;
  /** 끝난 전투(UI가 결과창을 보여 준 뒤 지운다) */
  lastBattle: Battle | null = null;
  ending: IncomeSource | null = null;
  selected = 0;
  protected rng: Rng;
  private battleBand: EnemyBand | null = null;
  private battleSite: string | null = null;
  private pendingCollector: CollectorVisit | null = null;

  constructor(worldData: WorldData | World, public seed = 1) {
    this.world = worldData instanceof World ? worldData : new World(worldData, { maxDistance: BALANCE.ferryMaxDistance, speedMul: BALANCE.ferrySpeedMul });
    this.rng = new Rng(seed);
    this.startDay = this.clock.dayIndex; this.roamNext = this.startDay + BALANCE.roamSpawnDays;
    this.squads = LEADERS.map(l => new Squad(l.id, { ...l, stats: { ...l.stats } }, START_SITE));
    for (const s of this.world.sites.values()) if (s.owner === REBEL_FACTION) this.enemyHeld.add(s.id);
    this.say('info', '제국력 ' + this.clock.year + '년. 아버지가 남긴 빚 ' + fmt(this.ledger.debt) + '골. 매달 7·14·21·28일에 최소 ' + fmt(BALANCE.minRepayment) + '골을 갚아야 한다.');
  }

  get day(): number { return this.clock.dayIndex; }
  /** 새 게임: 카엘 하임 부대만으로 시작 */
  startStory(): void { this.recruited = new Set(['kael']); this.selected = 0; }
  isActive(i: number): boolean { return this.recruited.has(this.squads[i].id); }
  /** 부대장 합류: 그 거점에 부대가 생긴다 */
  recruit(id: string, siteId: string): void {
    const i = this.squads.findIndex(s => s.id === id); if (i < 0 || this.recruited.has(id)) return;
    this.recruited.add(id); const s = this.squads[i]; s.pos = { kind: 'at', site: siteId }; s.path = []; s.order = 'idle';
    this.say('info', '★ ' + s.leader.name + '이(가) 용병단에 합류했다! 화면 아래 ' + (i + 1) + '번 칸.');
  }
  /** 게임 시작 뒤 지난 날 수 */
  get elapsed(): number { return this.day - this.startDay; }
  get squad(): Squad { return this.squads[this.selected]; }
  get paused(): boolean { return this.clock.speed === 0; }
  get event(): GameEvent | null { return this.eventQueue[0] ?? null; }
  /** 이벤트 안에서 쓰는 난수 */
  rngNext(): number { return this.rng.next(); }

  // ───── 이벤트 ─────
  /** 조건에 맞는 이벤트를 큐에 넣는다. 큐가 생기면 시계를 멈춘다. */
  fireEvents(ctx: EventCtx): void {
    for (const def of EVENTS) {
      if (def.once && this.firedEvents.has(def.id)) continue;
      if (this.eventQueue.some(e => e.id === def.id)) continue;
      let hit = false; try { hit = def.trigger(this, ctx); } catch { hit = false; }
      if (!hit) continue;
      this.firedEvents.add(def.id);
      this.eventQueue.push(def.build(this, ctx));
    }
    if (this.autoEvents) { let guard = 0; while (this.eventQueue.length && guard++ < 50) { const e = this.eventQueue[0]; const i = e.choices.findIndex(c => !c.disabled); if (i < 0) { this.eventQueue.shift(); continue; } this.chooseEvent(i); } return; }
    if (this.eventQueue.length && !this.battle) this.clock.speed = 0;
  }
  /** 선택지를 고른다. 다음 대사가 있으면 같은 창에 이어 보여 준다. */
  chooseEvent(i: number): void {
    const e = this.eventQueue.shift(); if (!e) return;
    const ch = e.choices[i]; if (!ch || ch.disabled) { this.eventQueue.unshift(e); return; }
    const next = ch.effect(this);
    if (typeof next === 'string') this.eventQueue.unshift({ id: e.id + ':next', title: e.title, portrait: e.portrait, text: next, choices: [{ label: '확인', effect: () => {} }] });
    else if (next && typeof next === 'object') this.eventQueue.unshift(next);
    if (!this.eventQueue.length && !this.collectorVisit && !this.ending && this.clock.speed === 0) this.clock.speed = 1;
    this.checkEnding();
  }

  say(kind: MessageKind, text: string): void { this.messages.push({ day: this.day, kind, text }); this.unread++; if (this.messages.length > 200) this.messages.shift(); }

  // ───── 시간 ─────
  /** 프레임마다 호출. 실시간 dt(초). */
  tick(dtSeconds: number): void {
    if (this.ending || this.clock.speed <= 0) return;
    const scaled = dtSeconds * this.clock.speed;
    if (this.battle) {
      this.battle.tick(scaled);
      if (this.battle.result) this.endBattle();
    }
    const dayFrac = scaled / BALANCE.secondsPerDay;
    const days = this.clock.advance(dtSeconds);
    this.moveSquads(dayFrac);
    for (let i = 0; i < days; i++) this.onNewDay();
  }
  protected onNewDay(): void {
    if (this.clock.month !== this.lastMonth) { this.lastMonth = this.clock.month; this.fireEvents({ monthStart: true }); this.lordsRetake(); }
    // 피로·회복·건축
    for (const s of this.squads) {
      const resting = s.order !== 'move' && s.order !== 'build' && s.siteId && isTown(this.world.site(s.siteId));
      const here = s.siteId ?? (s.pos.kind === 'road' ? s.pos.to : null);
      const desert = here ? this.world.site(here).region === 'reg_r05' : false;
      for (const p of s.people) {
        const df = s.order === 'move' ? BALANCE.fatigueMarchPerDay * (desert ? BALANCE.desertFatigueMul : 1) : s.order === 'build' ? BALANCE.buildFatiguePerDay : resting ? BALANCE.fatigueRestPerDay : -2;
        p.stats.f = Math.max(0, Math.min(100, p.stats.f + df));
        if (s.order !== 'move') p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + BALANCE.healRestPerDay);
      }
      if (s.order === 'build') this.buildTick(s);
    }
    if (this.clock.day === BALANCE.wageDay) this.payWages();
    if (this.clock.isRepaymentDay) this.repaymentDay();
    // 기한 지난 의뢰 경고
    for (const q of this.activeQuests.values()) if (q.deadline === this.day) this.say('warn', CIVIL_JOB_LABEL[q.job] + ' 의뢰(→' + this.world.site(q.to).name + ') 기한이 오늘까지다.');
    this.rebelTick();
    this.roamTick();
  }
  private repaymentDay(): void {
    const paid = this.ledger.payDue();
    const site = this.squad.siteId ?? this.squad.destination ?? START_SITE;
    if (paid > 0) {
      this.say('money', '상환일. 기본상환 ' + fmt(paid) + '골이 차감되었다. 남은 부채 ' + fmt(this.ledger.debt) + '골.');
      this.collectorVisit = { day: this.day, paid, penalty: 0, squadSite: site, short: false, escortLevel: this.escortLevel };
    } else {
      this.say('collector', '상환일인데 돈이 모자란다! 집행관이 호위대(' + this.escortLevel + '단계)를 데리고 왔다.');
      this.collectorVisit = { day: this.day, paid: 0, penalty: 0, squadSite: site, short: true, escortLevel: this.escortLevel };
    }
    if (!this.battle) this.clock.speed = 0; // 집행관 대화는 멈추고 본다(전투 중이면 끝난 뒤)
    this.checkEnding();
  }
  /** 돈이 모자랄 때: 가산금을 받아들인다 */
  collectorAccept(): void {
    const v = this.collectorVisit; if (!v || !v.short) return;
    v.penalty = this.ledger.penalize(); v.short = false;
    this.say('collector', '가산금 ' + fmt(v.penalty) + '골. 부채 ' + fmt(this.ledger.debt) + '골.');
  }
  /** 돈이 모자랄 때: 호위대와 싸운다. 이기면 이번 상환을 미룬다(가산금 없음), 지면 가산금. */
  collectorFight(squadIdx: number): boolean {
    const v = this.collectorVisit; if (!v || !v.short || this.battle) return false;
    const s = this.squads[squadIdx]; if (!s.siteId) return false;
    this.collectorVisit = null; // 전투가 끝나면 다시 만든다
    this.startBattle(squadIdx, makeEscort(this.escortLevel), '집행관 호위대 ' + this.escortLevel + '단계', 'escort');
    this.clock.speed = 1;
    this.pendingCollector = v;
    return true;
  }
  private payWages(): void {
    const total = this.squads.reduce((a, s) => a + s.wages, 0); if (total <= 0) return;
    if (this.ledger.spend('wages', total)) { this.say('money', '월초. 급료 ' + fmt(total) + '골을 지급했다.'); return; }
    // 못 주면 장비 든 대원이 도망간다(GDD §2.4)
    let gone = 0;
    for (const s of this.squads) {
      const stay: Person[] = [];
      for (const m of s.members) { if ((m.weapon || m.armor) && this.rng.next() < 0.7) gone++; else stay.push(m); }
      s.members = stay;
    }
    this.say('warn', '급료 ' + fmt(total) + '골을 못 줬다! 대원 ' + gone + '명이 장비를 들고 도망쳤다.');
  }
  protected checkEnding(): void {
    if (this.ledger.isPaidOff && !this.ending) {
      this.ending = this.ledger.endingSource; this.clock.speed = 0;
      this.say('ending', '부채를 모두 갚았다! ' + INCOME_LABEL[this.ending] + ' 엔딩.');
    }
  }

  // ───── 이동 ─────
  private moveSquads(dayFrac: number): void {
    const dist = BALANCE.marchSpeed * dayFrac;
    this.squads.forEach((s, i) => {
      if (s.order !== 'move' || i === this.battleSquad) return;
      let left = dist;
      while (left > 0) {
        if (s.pos.kind === 'at') {
          const next = s.path.shift();
          if (!next) { s.order = 'idle'; break; }
          if (this.world.isSea(s.pos.site, next)) {
            const fare = BALANCE.ferryFarePerHead * s.headcount;
            if (!this.ledger.spend('other', fare)) { s.path = []; s.order = 'idle'; this.say('warn', s.name + ': 뱃삯 ' + fmt(fare) + '골이 없어 배를 못 탔다.'); break; }
            this.say('info', s.name + '가 배에 올랐다(뱃삯 ' + fmt(fare) + '골).');
          }
          s.pos = { kind: 'road', from: s.pos.site, to: next, traveled: 0, length: this.world.length(s.pos.site, next) };
        }
        const p = s.pos as Extract<typeof s.pos, { kind: 'road' }>;
        const step = Math.min(left, p.length - p.traveled); p.traveled += step; left -= step;
        if (p.traveled >= p.length) {
          s.pos = { kind: 'at', site: p.to };
          if (this.onArrive(s, i, p.to)) break;
          if (s.path.length === 0) { s.order = 'idle'; this.onStop(s); break; }
        }
      }
    });
  }
  /** 목적지에 섰을 때: 건축 작업지면 작업 시작 */
  protected onStop(s: Squad): void {
    if (s.work && s.siteId === s.work.site) { s.order = 'build'; this.say('info', s.name + '가 ' + s.work.name + ' 작업을 시작했다(건축력 ' + s.buildSkill + '/일, 남은 작업 ' + (s.work.work - s.work.progress) + ').'); }
  }
  /** 도착 처리. 전투가 시작되면 true(그 자리에 멈춘다). */
  protected onArrive(s: Squad, idx: number, siteId: string): boolean {
    const site = this.world.site(siteId);
    if (s.path.length === 0) this.say('info', s.name + '가 ' + site.name + '에 도착했다.');
    // 민사 의뢰 배달
    for (const qid of [...s.quests]) {
      const q = this.activeQuests.get(qid); if (!q || q.to !== siteId) continue;
      s.quests = s.quests.filter(x => x !== qid); this.activeQuests.delete(qid);
      const late = this.day > q.deadline;
      const pay = late ? Math.round(q.reward * BALANCE.civilLatePenaltyRate) : q.reward;
      this.ledger.earn('civil', pay);
      this.say('quest', (late ? '기한을 넘겨 ' : '') + CIVIL_JOB_LABEL[q.job] + ' 배달 완료. ' + q.client + '에게서 ' + fmt(pay) + '골' + (late ? '(위약 공제)' : '') + '.');
    }
    if (this.battle) return false;
    // 적 무리가 있으면 교전
    const band = this.bands.find(b => b.site === siteId);
    if (!band && !this.enemyHeld.has(siteId) && s.path.length === 0) this.fireEvents({ site: siteId, squadIdx: idx });
    if (band) { s.path = []; s.order = 'idle'; this.engageBand(idx, band); return true; }
    // 잿빛 점령지면 공성전
    if (this.enemyHeld.has(siteId)) { s.path = []; s.order = 'idle'; this.startSiege(idx, siteId); return true; }
    return false;
  }
  /** 이동 명령. 도로 위면 지금 향하던 거점을 거쳐 간다. 막힌 지역이면 false. */
  /** 이 부대가 그 지역에 들어갈 수 있나(엘프 숲 규칙: 엘프·혼혈이 있어야) */
  canEnter(squadIdx: number, regionId: string): { ok: boolean; reason?: string } {
    if (this.blocked.has(regionId)) return { ok: false, reason: '진입 금지 지역' };
    if (regionId === 'reg_r03' && this.flags.has('elf_rule') && !this.squads[squadIdx].people.some(p => p.race === '엘프' || p.race === '혼혈')) return { ok: false, reason: '엘프 숲은 엘프·혼혈이 있는 부대만' };
    return { ok: true };
  }
  move(squadIdx: number, toSite: string): boolean {
    const s = this.squads[squadIdx]; if (squadIdx === this.battleSquad || !this.isActive(squadIdx)) return false;
    if (!this.canEnter(squadIdx, this.world.site(toSite).region).ok) return false;
    const origin = s.pos.kind === 'at' ? s.pos.site : s.pos.to;
    const p = this.world.path(origin, toSite, this.blocked, this.enemyHeld); if (!p) return false;
    s.path = p.nodes.slice(1);
    if (s.pos.kind === 'road' && s.pos.to === toSite) s.path = [];
    s.order = 'move';
    if (s.pos.kind === 'at' && s.path.length === 0) { s.order = 'idle'; this.onStop(s); }
    return true;
  }
  stay(squadIdx: number): void { const s = this.squads[squadIdx]; s.path = []; if (s.pos.kind === 'at') { s.order = 'stay'; } else s.order = 'move'; }
  /** 이동 예상 일수 */
  eta(squadIdx: number, toSite: string): number | null {
    const s = this.squads[squadIdx];
    const origin = s.pos.kind === 'at' ? s.pos.site : s.pos.to;
    const p = this.world.path(origin, toSite, this.blocked, this.enemyHeld); if (!p) return null;
    const extra = s.pos.kind === 'road' ? s.pos.length - s.pos.traveled : 0;
    return (p.length + extra) / BALANCE.marchSpeed;
  }

  // ───── 교역 ─────
  market(siteId: string): Market | null {
    const site = this.world.site(siteId); if (!hasMarket(site) || this.enemyHeld.has(siteId)) return null;
    if (siteId === 'C001' && this.flags.has('capital_sacked')) return null; // 1004년 제도 약탈
    let m = this.markets.get(siteId);
    if (!m) { m = Market.create(this.world, site, this.day, this.seed); this.markets.set(siteId, m); }
    m.settle(this.day, this.seed); return m;
  }
  buy(squadIdx: number, good: string, qty: number): { ok: boolean; reason?: string; qty?: number; cost?: number } {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site) return { ok: false, reason: '이동 중' };
    const m = this.market(site); if (!m) return { ok: false, reason: '교역소 없음' };
    qty = Math.min(qty, s.capacity - s.load); if (qty <= 0) return { ok: false, reason: '적재 한도' };
    const unit = m.buyPrice(good, s.tradeSkill);
    qty = Math.min(qty, Math.floor(this.ledger.cash / unit), m.line(good)?.stock ?? 0); if (qty <= 0) return { ok: false, reason: '돈 또는 재고 부족' };
    const cost = unit * qty;
    if (!this.ledger.spend('goods', cost)) return { ok: false, reason: '돈 부족' };
    m.takeStock(good, qty); s.addCargo(good, qty);
    return { ok: true, qty, cost };
  }
  sell(squadIdx: number, good: string, qty: number): { ok: boolean; reason?: string; qty?: number; income?: number } {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site) return { ok: false, reason: '이동 중' };
    const m = this.market(site); if (!m) return { ok: false, reason: '교역소 없음' };
    qty = Math.min(qty, s.cargo[good] ?? 0); if (qty <= 0) return { ok: false, reason: '소유 없음' };
    const unit = m.sellPrice(good, s.tradeSkill); const income = unit * qty;
    m.putStock(good, qty); s.addCargo(good, -qty); this.ledger.earn('trade', income);
    return { ok: true, qty, income };
  }
  /** 술집 소문: 이 지역 안에서 가장 남는 교역 한 줄(원작의 "수첩" 대신) */
  rumor(siteId: string): string {
    const site = this.world.site(siteId);
    const towns = this.world.towns().filter(t => t.region === site.region && !this.enemyHeld.has(t.id));
    let best: { text: string; gain: number } | null = null;
    for (const a of towns) for (const b of towns) {
      if (a === b) continue; const ma = this.market(a.id), mb = this.market(b.id); if (!ma || !mb) continue;
      for (const l of ma.lines) { const gain = mb.sellPrice(l.good, 0) - ma.buyPrice(l.good, 0); if (gain > 0 && (!best || gain > best.gain)) best = { gain, text: a.name + '의 ' + goodName(l.good) + '을(를) ' + b.name + '에 팔면 하나에 ' + fmt(gain) + '골쯤 남는다더군.' }; }
    }
    return best ? '"' + best.text + '"' : '"요즘은 어디나 값이 비슷해. 다른 지역을 알아보게."';
  }

  /** 술집 "임무": 이 거점의 이벤트를 찾는다. 없으면 false */
  tavernQuest(squadIdx: number): boolean {
    const site = this.squads[squadIdx].siteId; if (!site) return false;
    const before = this.eventQueue.length; this.fireEvents({ site, squadIdx, tavern: true }); return this.eventQueue.length > before;
  }

  // ───── 공연(술집) ─────
  canPerform(squadIdx: number): { ok: boolean; reason?: string } {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site || !isTown(this.world.site(site))) return { ok: false, reason: '성 안의 술집에서만' };
    const last = this.lastShow[s.id + '@' + site]; if (last !== undefined && this.day - last < BALANCE.showCooldownDays) return { ok: false, reason: '같은 술집은 ' + BALANCE.showCooldownDays + '일에 한 번(' + (BALANCE.showCooldownDays - (this.day - last)) + '일 뒤)' };
    if (s.performSkill <= 0) return { ok: false, reason: '공연할 사람이 없다' };
    return { ok: true };
  }
  /** 공연. 공연력이 성 규모에 못 미치면 실패하고 위약금을 문다(원작). */
  perform(squadIdx: number): ShowResult | null {
    const c = this.canPerform(squadIdx); if (!c.ok) return null;
    const s = this.squads[squadIdx]; const site = this.world.site(s.siteId!);
    const power = Math.round(s.performSkill * (0.85 + this.rng.next() * 0.3)); this.lastShow[s.id + '@' + site.id] = this.day;
    const need = site.size * BALANCE.showFailPowerPerSize;
    if (power < need) {
      const penalty = Math.min(this.ledger.cash, site.size * BALANCE.showFailPenaltyPerSize); this.ledger.spend('other', penalty);
      const r: ShowResult = { ok: false, power, income: 0, penalty, text: '야유가 쏟아졌다. 술집 주인에게 위약금 ' + fmt(penalty) + '골을 물었다. (공연력 ' + power + ' < 필요 ' + need + ')' };
      this.say('warn', s.name + ' 공연 실패. ' + r.text); return r;
    }
    const income = Math.round(power * site.size * BALANCE.showIncomePerPower * (1 + (power - need) / (need * 2)));
    this.ledger.earn('show', income); for (const p of s.people) p.stats.p += p.stats.p > 0 ? 1 : 0;
    const r: ShowResult = { ok: true, power, income, penalty: 0, text: '박수갈채! 모자에 ' + fmt(income) + '골이 모였다. (공연력 ' + power + ')' };
    this.say('money', s.name + ' 공연 성공. ' + r.text); return r;
  }

  // ───── 건축 ─────
  fortDurability(siteId: string): number { return this.forts.get(siteId) ?? fortMax(this.world.site(siteId)); }
  buildJobsAt(siteId: string): BuildJob[] | null {
    const site = this.world.site(siteId); if (!isTown(site)) return null;
    let e = this.buildJobs.get(siteId);
    if (!e || this.day - e.day >= BALANCE.buildRefreshDays) {
      const jobs: BuildJob[] = [];
      // 같은 지역의 상한 요새 보수
      for (const f of this.world.sitesIn(site.region)) {
        if (!isFort(f) || this.enemyHeld.has(f.id)) continue;
        const missing = fortMax(f) - this.fortDurability(f.id); if (missing <= 0) continue;
        jobs.push({ id: 'repair:' + f.id + ':' + this.day, name: f.name + ' 보수', site: f.id, kind: 'repair', work: missing * BALANCE.buildRepairWorkPerPoint, reward: missing * BALANCE.buildRepairRewardPerPoint });
      }
      // 이 성의 성벽 증축(항상 하나)
      jobs.push({ id: 'walls:' + siteId + ':' + this.day, name: site.name + ' 성벽 증축', site: siteId, kind: 'walls', work: BALANCE.buildWallsWork * (site.size / 3), reward: Math.round(BALANCE.buildWallsReward * (site.size / 3)) });
      e = { day: this.day, jobs }; this.buildJobs.set(siteId, e);
    }
    // 이미 다른 부대가 맡은 것은 뺀다
    const taken = new Set(this.squads.map(s => s.work?.jobId));
    return e.jobs.filter(j => !taken.has(j.id));
  }
  acceptBuild(squadIdx: number, siteId: string, jobId: string): { ok: boolean; reason?: string } {
    const s = this.squads[squadIdx]; if (!s.siteId) return { ok: false, reason: '이동 중' };
    if (s.buildSkill <= 0) return { ok: false, reason: '건축력이 있는 사람이 없다' };
    if (s.work) return { ok: false, reason: '이미 작업을 맡았다' };
    const j = this.buildJobsAt(siteId)?.find(x => x.id === jobId); if (!j) return { ok: false, reason: '없는 의뢰' };
    s.work = { jobId: j.id, site: j.site, name: j.name, work: Math.round(j.work), progress: 0, reward: j.reward };
    if (s.siteId === j.site) { s.order = 'build'; this.say('info', s.name + '가 ' + j.name + ' 작업을 시작했다(건축력 ' + s.buildSkill + '/일).'); }
    else { this.move(squadIdx, j.site); this.say('info', s.name + '가 ' + j.name + ' 작업을 맡아 ' + this.world.site(j.site).name + '으로 간다.'); }
    return { ok: true };
  }
  cancelBuild(squadIdx: number): void { const s = this.squads[squadIdx]; if (s.work) { this.say('info', s.name + '가 ' + s.work.name + ' 작업을 그만뒀다.'); s.work = null; if (s.order === 'build') s.order = 'idle'; } }
  private buildTick(s: Squad): void {
    const w = s.work; if (!w || s.siteId !== w.site) { if (s.order === 'build') s.order = 'idle'; return; }
    w.progress += s.buildSkill;
    if (w.progress >= w.work) {
      s.work = null; s.order = 'idle';
      const site = this.world.site(w.site);
      if (w.jobId.startsWith('repair')) this.forts.set(w.site, fortMax(site));
      else this.forts.set(w.site, this.fortDurability(w.site) + 50);
      this.ledger.earn('build', w.reward);
      this.say('money', w.name + ' 완공! ' + s.name + '가 보수 ' + fmt(w.reward) + '골을 받았다.');
    }
  }

  // ───── 민사 게시판 ─────
  board(siteId: string): Board | null {
    const site = this.world.site(siteId); if (!isTown(site) || this.enemyHeld.has(siteId)) return null;
    let b = this.boards.get(siteId);
    if (!b || b.stale(this.day)) {
      b = Board.generate(this.world, site, this.day, this.seed, this.blocked);
      // 1004년: 제도의 피난민 호송(총호송 보수 ×3, 목적지는 남쪽)
      if (this.flags.has('capital_sacked') && site.region === 'reg_r01') for (const q of b.quests) if (q.job === 'escort') { q.reward *= BALANCE.refugeeRewardMul; q.client = '피난민 행렬'; }
      this.boards.set(siteId, b);
    }
    return b;
  }
  accept(squadIdx: number, questId: string): boolean {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site) return false;
    const b = this.board(site); const q = b?.quests.find(x => x.id === questId); if (!b || !q) return false;
    b.remove(questId); this.activeQuests.set(q.id, q); s.quests.push(q.id);
    this.say('quest', CIVIL_JOB_LABEL[q.job] + ' 의뢰 수락: ' + this.world.site(q.to).name + '까지, 기한 ' + (q.deadline - this.day) + '일, 보수 ' + fmt(q.reward) + '골.');
    // 총호송은 길목에 도적이 노린다
    if (q.job === 'escort') {
      const p = this.world.path(site, q.to, this.blocked, this.enemyHeld);
      const mid = p?.nodes.slice(1, -1).filter(id => this.world.site(id).kind !== 'castle' && !this.bands.some(b => b.site === id));
      if (mid && mid.length) { const at = mid[Math.floor(mid.length / 2)]; this.bands.push({ id: 'R' + q.id, name: '매복 도적단', site: at, tier: 1, questId: null, kind: 'roam', nextMove: this.day + 99 }); this.say('warn', '소문: 호송길 ' + this.world.site(at).name + ' 근처에 도적이 매복했다.'); }
    }
    return true;
  }

  // ───── 군사 게시판(토벌) ─────
  militaryBoard(siteId: string): MilitaryBoard | null {
    const site = this.world.site(siteId); if (!isTown(site) || this.enemyHeld.has(siteId)) return null;
    let b = this.military.get(siteId);
    if (!b || b.stale(this.day)) {
      const taken = new Set([...this.bands.map(x => x.site), ...this.enemyHeld]);
      b = MilitaryBoard.generate(this.world, site, this.day, this.seed, this.blocked, taken); this.military.set(siteId, b);
      if (this.flags.has('crusade') && !this.flags.has('rebels_broken') && b.quests.length > 1) {
        const brok = this.squads.some(s => s.people.some(p => p.id === 'brok'));
        if (this.rng.next() < (brok ? 0.2 : 0.4)) { const top = [...b.quests].sort((x, y) => y.reward - x.reward)[0]; b.remove(top.id); this.say('warn', '검은 창이 ' + site.name + '의 "' + top.text + '" 의뢰에 먼저 입찰했다.'); }
      }
    }
    return b;
  }
  acceptMilitary(squadIdx: number, questId: string): boolean {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site) return false;
    const b = this.militaryBoard(site); const q = b?.quests.find(x => x.id === questId); if (!b || !q) return false;
    if (this.bands.some(x => x.site === q.target)) return false;
    b.remove(questId); this.activeMilitary.set(q.id, q);
    this.bands.push({ id: 'B' + q.id, name: this.world.site(q.target).name + ' 도적단', site: q.target, tier: q.tier, questId: q.id, kind: 'bandit' });
    this.say('quest', '토벌 의뢰 수락: ' + q.text + '. 보수 ' + fmt(q.reward) + '골. 도적단은 ' + this.world.site(q.target).name + '에 있다.');
    return true;
  }
  bandAt(siteId: string): EnemyBand | undefined { return this.bands.find(b => b.site === siteId); }

  // ───── 잿빛 교단(반란군): 요새 공격·함락, 탈환 ─────
  protected rebelTick(): void {
    if (this.elapsed < BALANCE.rebelStartDay || this.flags.has('rebels_broken')) return;
    // 새 전투단
    const rebels = this.bands.filter(b => b.kind === 'rebel');
    if (rebels.length < BALANCE.rebelMaxBands && this.enemyHeld.size < BALANCE.rebelMaxHeld) {
      for (const held of this.enemyHeld) {
        const h = this.world.site(held); if (h.kind !== 'castle' || this.blocked.has(h.region)) continue;
        if (this.rng.next() > BALANCE.rebelSpawnChance) continue;
        const target = this.nearestFortFrom(held); if (!target) continue;
        const p = this.world.path(held, target, this.blocked, new Set([...this.enemyHeld].filter(x => x !== held)));
        if (!p) continue;
        this.bands.push({ id: 'G' + held + ':' + this.day, name: h.name + ' 잿빛 전투단', site: held, tier: 3, questId: null, kind: 'rebel', path: p.nodes.slice(1), target, nextMove: this.day + BALANCE.rebelMoveDays });
        this.say('warn', '소식: ' + h.name + '에서 잿빛 교단 전투단이 ' + this.world.site(target).name + '을(를) 향해 나섰다.');
        break;
      }
    }
    // 이동·공성
    for (const b of [...this.bands]) {
      if (b.kind !== 'rebel' || (b.nextMove ?? 0) > this.day) continue;
      if (b.path && b.path.length) {
        const next = b.path.shift()!; b.site = next; b.nextMove = this.day + BALANCE.rebelMoveDays;
        // 지나가는 길에 아군 부대가 있으면 그 부대가 공격받는다
        const idx = this.squads.findIndex((s, j) => s.siteId === next && this.isActive(j));
        if (idx >= 0 && !this.battle) { this.say('battle', b.name + '이(가) ' + this.world.site(next).name + '의 ' + this.squads[idx].name + '를 덮쳤다!'); this.engageBand(idx, b); }
        else if (!b.path.length && b.site === b.target) this.say('fort', b.name + '이(가) ' + this.world.site(next).name + ' 앞에 진을 쳤다.');
        continue;
      }
      if (b.site === b.target) {
        const site = this.world.site(b.site); const dmg = BALANCE.rebelSiegeDamage;
        const left = Math.max(0, this.fortDurability(b.site) - dmg); this.forts.set(b.site, left); b.nextMove = this.day + 1;
        this.reports.push({ day: this.day, site: b.site, attacker: b.name, damage: dmg, durability: left }); if (this.reports.length > 30) this.reports.shift();
        this.say('fort', '요새 보고: ' + b.name + '이(가) ' + site.name + '을(를) 공격, ' + dmg + '의 피해. 내구 ' + left + '/' + fortMax(site) + '.');
        if (left <= 0) {
          this.enemyHeld.add(b.site); this.bands = this.bands.filter(x => x !== b); this.forts.set(b.site, Math.round(fortMax(site) * 0.5));
          for (const s of this.squads) if (s.work?.site === b.site) { s.work = null; if (s.order === 'build') s.order = 'idle'; }
          this.say('fort', '⚑ ' + site.name + '이(가) 잿빛 교단에 함락되었다! 길이 막혔다. 탈환하면 보수가 있다.');
        }
      }
    }
  }
  /** 달마다 영주들이 점령지 일부를 되찾는다(플레이어가 안 해도 세상이 굴러간다). 처음 점령지(역사)는 역사 이벤트가 맡는다 */
  private lordsRetake(): void {
    const k = this.flags.has('rebels_broken') ? 3 : 1;
    for (const id of [...this.enemyHeld]) {
      const s = this.world.site(id); if (s.owner === REBEL_FACTION && !this.flags.has('rebels_broken')) continue;
      if (this.rng.next() < BALANCE.lordRetakeChance * k * (s.kind === 'castle' ? 0.5 : 1)) { this.enemyHeld.delete(id); this.forts.set(id, Math.round(fortMax(s) * 0.4)); this.say('fort', '소식: ' + (this.world.factions.get(s.owner ?? '')?.name ?? '영주') + '가 ' + s.name + '을(를) 되찾았다.'); }
    }
  }
  private nearestFortFrom(held: string): string | null {
    const seen = new Set<string>([held]); let frontier = [held];
    for (let d = 0; d < 3; d++) {
      const next: string[] = [];
      for (const id of frontier) for (const n of this.world.site(id).adjacent) {
        if (seen.has(n)) continue; seen.add(n);
        const s = this.world.site(n); if (this.blocked.has(s.region)) continue;
        if (this.enemyHeld.has(n)) { next.push(n); continue; }
        if (isFort(s) && !this.bands.some(b => b.target === n)) return n;
        next.push(n);
      }
      frontier = next;
    }
    return null;
  }
  protected roamTick(): void {
    // 떠돌이 도적단 생성
    if (this.day >= this.roamNext) {
      this.roamNext = this.day + BALANCE.roamSpawnDays;
      if (this.bands.filter(b => b.kind === 'roam').length < BALANCE.roamMaxBands) {
        const pool = [...this.world.sites.values()].filter(s => s.kind !== 'castle' && !this.blocked.has(s.region) && !this.enemyHeld.has(s.id) && !this.bands.some(b => b.site === s.id) && !this.squads.some((q, j) => q.siteId === s.id && this.isActive(j)));
        if (pool.length) { const at = this.rng.pick(pool); const tier = this.rng.next() < 0.3 ? 2 : 1; this.bands.push({ id: 'W' + this.day, name: '떠돌이 도적단', site: at.id, tier, questId: null, kind: 'roam', nextMove: this.day + BALANCE.roamMoveDays }); this.say('warn', '소문: ' + this.world.regions.get(at.region)?.name + ' ' + at.name + ' 근처에 떠돌이 도적이 나타났다.'); }
      }
    }
    // 떠돌이 이동
    for (const b of this.bands) {
      if (b.kind !== 'roam' || (b.nextMove ?? 0) > this.day) continue;
      b.nextMove = this.day + BALANCE.roamMoveDays;
      const opts = this.world.site(b.site).adjacent.filter(n => { const s = this.world.site(n); return s.kind !== 'castle' && !this.enemyHeld.has(n) && !this.blocked.has(s.region) && !this.bands.some(x => x.site === n); });
      if (opts.length) { b.site = this.rng.pick(opts); const idx = this.squads.findIndex((s, j) => s.siteId === b.site && this.isActive(j)); if (idx >= 0 && !this.battle) { this.say('battle', b.name + '이(가) ' + this.squads[idx].name + '를 습격했다!'); this.engageBand(idx, b); } }
    }
  }

  // ───── 전투 ─────
  /** 선택 부대가 같은 거점의 적 무리를 공격한다 */
  attackBand(squadIdx: number): boolean {
    const s = this.squads[squadIdx]; const band = s.siteId ? this.bandAt(s.siteId) : undefined;
    if (!band || this.battle) return false;
    this.engageBand(squadIdx, band); return true;
  }
  protected engageBand(squadIdx: number, band: EnemyBand): void {
    const enemies = band.kind === 'rebel' ? makeRebels(band.tier) : makeBandits(band.tier, this.rng);
    this.startBattle(squadIdx, enemies, band.name, 'bandits', band);
  }
  /** 점령지 공성(탈환) */
  startSiege(squadIdx: number, siteId: string): boolean {
    if (this.battle || !this.enemyHeld.has(siteId)) return false;
    const site = this.world.site(siteId);
    this.battleSite = siteId;
    const joint = this.jointTarget === siteId;
    this.startBattle(squadIdx, makeGarrison(site.kind === 'castle'), site.name + ' 잿빛 수비대' + (joint ? ' (검은 창 공동 작전)' : ''), 'siege', null, joint ? BLACK_SPEAR_ALLIES : []);
    return true;
  }
  protected startBattle(squadIdx: number, enemies: EnemyDef[], name: string, kind: 'bandits' | 'escort' | 'siege', band: EnemyBand | null = null, allies: EnemyDef[] = []): void {
    const s = this.squads[squadIdx];
    this.battleSquad = squadIdx; this.battleBand = band; this.selected = squadIdx;
    this.battle = new Battle(s, enemies, name, new Rng(this.rng.int(1, 1e9)), kind, allies);
    this.say('battle', s.name + '가 ' + name + '과(와) 교전에 들어갔다!');
  }
  protected endBattle(): void {
    const b = this.battle!; const s = this.squads[this.battleSquad];
    this.battle = null; this.lastBattle = b;
    if (!this.autoEvents) this.clock.speed = 0; // 결과창을 보는 동안 멈춘다(닫으면 UI 가 다시 돌린다)
    if (b.dead.length) this.say('battle', '전사: ' + b.dead.map(p => p.name).join(', '));
    if (b.kind === 'bandits') {
      if (b.result === 'victory') {
        const bounty = b.bounty; if (bounty > 0) this.ledger.earn('battle', bounty);
        const band = this.battleBand;
        if (band) {
          this.bands = this.bands.filter(x => x !== band);
          const q = band.questId ? this.activeMilitary.get(band.questId) : undefined;
          if (q) { this.activeMilitary.delete(q.id); this.ledger.earn('battle', q.reward); this.say('money', '토벌 완수! ' + q.client + '에게서 보수 ' + fmt(q.reward) + '골. 전리품 ' + fmt(bounty) + '골.'); }
          else this.say('money', band.name + '을(를) 물리쳤다. 전리품 ' + fmt(bounty) + '골.');
        }
      } else this.say('battle', s.name + '가 ' + (b.result === 'retreat' ? '퇴각했다.' : '전멸했다…'));
    } else if (b.kind === 'siege') {
      const siteId = this.battleSite!; const site = this.world.site(siteId);
      if (b.result === 'victory') {
        this.enemyHeld.delete(siteId); this.forts.set(siteId, Math.round(fortMax(site) * 0.5));
        let reward = (site.kind === 'castle' ? BALANCE.liberateRewardCastle : BALANCE.liberateRewardMinor) + b.bounty;
        if (this.jointTarget === siteId) { reward = Math.round(reward * 0.4); this.jointTarget = null; this.flags.delete('joint_active'); this.say('info', '검은 창과 보수를 나눴다(우리 몫 40%). 로한: "다음에 또 보지."'); }
        this.ledger.earn('battle', reward);
        const lord = site.owner && site.owner !== REBEL_FACTION ? (this.world.factions.get(site.owner)?.name ?? '영주') : (this.world.factions.get(this.world.sitesIn(site.region).find(x => x.kind === 'castle' && x.owner && x.owner !== REBEL_FACTION)?.owner ?? '')?.name ?? '지역 영주');
        this.say('money', '★ ' + site.name + ' 탈환! ' + lord + '가 보수 ' + fmt(reward) + '골을 보냈다.');
      } else { this.say('battle', site.name + ' 공성 실패. ' + s.name + '가 ' + (b.result === 'retreat' ? '물러났다.' : '전멸했다…')); if (s.siteId === siteId) { const back = site.adjacent.find(a => !this.enemyHeld.has(a)); if (back) s.pos = { kind: 'at', site: back }; } }
      this.battleSite = null;
    } else if (b.kind === 'escort') {
      const v = this.pendingCollector!; this.pendingCollector = null;
      v.fought = b.result!;
      if (b.result === 'victory') { this.deferrals++; this.escortLevel = Math.min(BALANCE.escortMaxLevel, this.escortLevel + 1); this.say('collector', '호위대를 물리쳤다. 이번 상환은 미뤄진다. 다음 호위대는 더 강하다(' + this.escortLevel + '단계).'); v.short = false; }
      else { v.penalty = this.ledger.penalize(); v.short = false; this.say('collector', '호위대에 졌다. 가산금 ' + fmt(v.penalty) + '골. 부채 ' + fmt(this.ledger.debt) + '골.'); }
      this.collectorVisit = v; this.clock.speed = 0;
    }
    const idx = this.battleSquad; this.battleSquad = -1; this.battleBand = null;
    if (this.collectorVisit && !this.battle) this.clock.speed = 0;
    if (b.result === 'victory' && s.siteId) this.fireEvents({ site: s.siteId, squadIdx: idx });
    this.checkEnding();
  }

  // ───── 계약소 ─────
  office(siteId: string): Candidate[] | null {
    const site = this.world.site(siteId); if (!isTown(site) || this.enemyHeld.has(siteId)) return null;
    let o = this.offices.get(siteId);
    if (!o || this.day - o.day >= BALANCE.contractRefreshDays) {
      const rng = new Rng(this.seed ^ hash('office' + siteId) ^ (this.day * 31)); const jobs = jobsAt(siteId, site.region);
      const n = 3 + site.size; const cands: Candidate[] = [];
      for (let i = 0; i < n; i++) {
        const job = weighted(rng, jobs); const c = rollCandidate(rng, job, site.region, i);
        cands.push({ cid: siteId + ':' + this.day + ':' + i, id: 'm' + hash(siteId + this.day + i), name: c.name, race: c.race, job: job.id, role: job.name, stats: c.stats, wage: c.wage, hire: c.hire, weapon: null, armor: null, potion: null, potions: 0, tool: null, isLeader: false });
      }
      o = { day: this.day, candidates: cands }; this.offices.set(siteId, o);
    }
    return o.candidates;
  }
  hire(squadIdx: number, cid: string): { ok: boolean; reason?: string } {
    const s = this.squads[squadIdx]; const site = s.siteId; if (!site) return { ok: false, reason: '이동 중' };
    const cands = this.office(site); const c = cands?.find(x => x.cid === cid); if (!cands || !c) return { ok: false, reason: '없는 후보' };
    if (s.members.length >= MAX_MEMBERS) return { ok: false, reason: '부대가 가득(8명)' };
    if (!this.ledger.spend('wages', c.hire)) return { ok: false, reason: '돈 부족' };
    cands.splice(cands.indexOf(c), 1);
    const { cid: _c, ...person } = c; void _c;
    s.members.push(person);
    this.say('info', s.name + '에 ' + person.role + ' ' + person.name + ' 고용(' + fmt(c.hire) + '골, 급료 ' + fmt(c.wage) + ').');
    return { ok: true };
  }
  /** 해고: 매입가(고용비)를 돌려받는다(원작). 장비는 반값에 판다. */
  fire(squadIdx: number, personId: string): number {
    const s = this.squads[squadIdx]; const m = s.members.find(x => x.id === personId); if (!m || !s.siteId || m.job === 'golem') return 0;
    s.members = s.members.filter(x => x !== m);
    let refund = m.hire;
    for (const it of [m.weapon, m.armor, m.tool]) if (it) refund += Math.round(itemPrice(it) * SELLBACK);
    this.ledger.cash += refund;
    this.say('info', m.name + ' 해고. ' + fmt(refund) + '골 환급.');
    return refund;
  }
  /** 같은 거점에 있는 두 부대 사이 대원 이동 */
  transfer(fromIdx: number, personId: string, toIdx: number): boolean {
    const a = this.squads[fromIdx], b = this.squads[toIdx];
    if (a === b || !a.siteId || a.siteId !== b.siteId || b.members.length >= MAX_MEMBERS) return false;
    const m = a.members.find(x => x.id === personId); if (!m || m.job === 'golem') return false;
    a.members = a.members.filter(x => x !== m); b.members.push(m); return true;
  }

  // ───── 상점(무기점·방패점·약국·도구점) ─────
  shopItems(siteId: string, kind: 'weapon' | 'armor' | 'potion' | 'tool'): (Weapon | Armor | Potion | Tool)[] {
    const site = this.world.site(siteId); const size = site.kind === 'castle' ? site.size : 0;
    const list = kind === 'weapon' ? WEAPONS : kind === 'armor' ? ARMORS : kind === 'potion' ? POTIONS : TOOLS;
    return list.filter(i => i.minSize <= size);
  }
  /** 산 장비는 바로 장착. 쓰던 장비는 반값에 되판다. 회복약은 종류가 다르면 교체, 최대 5개. */
  buyItem(squadIdx: number, personId: string, itemId: string): { ok: boolean; reason?: string } {
    const s = this.squads[squadIdx]; const p = s.people.find(x => x.id === personId); if (!p || !s.siteId) return { ok: false, reason: '대상 없음' };
    const w = WEAPON_BY_ID.get(itemId), a = ARMOR_BY_ID.get(itemId), po = POTION_BY_ID.get(itemId), t = TOOL_BY_ID.get(itemId);
    const price = itemPrice(itemId); if (!price) return { ok: false, reason: '없는 물건' };
    if (po && p.potion === itemId && p.potions >= MAX_POTIONS) return { ok: false, reason: '회복약 5개까지' };
    if (!this.ledger.spend('equipment', price)) return { ok: false, reason: '돈 부족' };
    if (w) { if (p.weapon) this.ledger.cash += Math.round(itemPrice(p.weapon) * SELLBACK); p.weapon = itemId; }
    else if (a) { if (p.armor) this.ledger.cash += Math.round(itemPrice(p.armor) * SELLBACK); p.armor = itemId; }
    else if (t) { if (p.tool) this.ledger.cash += Math.round(itemPrice(p.tool) * SELLBACK); p.tool = itemId; }
    else if (po) { if (p.potion !== itemId) { p.potion = itemId; p.potions = 0; } p.potions++; }
    return { ok: true };
  }
  sellItem(squadIdx: number, personId: string, slot: 'weapon' | 'armor' | 'tool'): number {
    const s = this.squads[squadIdx]; const p = s.people.find(x => x.id === personId); if (!p || !s.siteId) return 0;
    const id = p[slot]; if (!id) return 0;
    const got = Math.round(itemPrice(id) * SELLBACK); p[slot] = null; this.ledger.cash += got; return got;
  }

  // ───── 병원 ─────
  hospitalCost(squadIdx: number): number {
    return this.squads[squadIdx].people.reduce((a, p) => a + (p.stats.maxHp - p.stats.hp) * BALANCE.hospitalPerHp + p.stats.f * BALANCE.hospitalPerFatigue, 0);
  }
  heal(squadIdx: number): boolean {
    const cost = this.hospitalCost(squadIdx); if (cost <= 0) return true;
    if (!this.ledger.spend('other', cost)) return false;
    for (const p of this.squads[squadIdx].people) { p.stats.hp = p.stats.maxHp; p.stats.f = 0; }
    this.say('info', this.squads[squadIdx].name + ' 치료 완료(' + fmt(cost) + '골).'); return true;
  }

  // ───── 상환 ─────
  repayExtra(amount: number): number {
    const paid = this.ledger.repayExtra(amount);
    if (paid > 0) { this.say('money', '추가 상환 ' + fmt(paid) + '골. 남은 부채 ' + fmt(this.ledger.debt) + '골.'); this.checkEnding(); }
    return paid;
  }
  dismissCollector(): void { this.collectorVisit = null; if (!this.ending && this.clock.speed === 0) this.clock.speed = 1; }

  // ───── 저장 ─────
  toJSON(): GameJSON {
    return {
      version: 3, seed: this.seed, clock: this.clock.toJSON(), ledger: this.ledger.toJSON(),
      squads: this.squads.map(s => s.toJSON()), markets: [...this.markets.values()].map(m => m.toJSON()),
      boards: [...this.boards.values()].map(b => b.toJSON()), activeQuests: [...this.activeQuests.values()],
      blocked: [...this.blocked], messages: this.messages.slice(-50), ending: this.ending, selected: this.selected,
      offices: [...this.offices.entries()].map(([siteId, o]) => ({ siteId, day: o.day, candidates: o.candidates })),
      military: [...this.military.values()].map(b => b.toJSON()), activeMilitary: [...this.activeMilitary.values()], bands: this.bands.map(b => ({ ...b, path: b.path ? [...b.path] : undefined })),
      escortLevel: this.escortLevel, deferrals: this.deferrals,
      forts: Object.fromEntries(this.forts), enemyHeld: [...this.enemyHeld], lastShow: { ...this.lastShow },
      buildJobs: [...this.buildJobs.entries()].map(([siteId, e]) => ({ siteId, day: e.day, jobs: e.jobs })), reports: this.reports.slice(-20), roamNext: this.roamNext, rng: this.rng.state,
      flags: [...this.flags], firedEvents: [...this.firedEvents], jointTarget: this.jointTarget, lastMonth: this.lastMonth, startDay: this.startDay,
      recruited: [...this.recruited],
    };
  }
  static fromJSON(world: World | WorldData, j: GameJSON): Game {
    const g = new Game(world, j.seed);
    g.clock = GameClock.fromJSON(j.clock); g.ledger = Ledger.fromJSON(j.ledger);
    g.squads = j.squads.map(Squad.fromJSON);
    g.markets = new Map(j.markets.map(m => [m.siteId, Market.fromJSON(m)]));
    g.boards = new Map(j.boards.map(b => [b.siteId, Board.fromJSON(b)]));
    g.activeQuests = new Map(j.activeQuests.map(q => [q.id, q]));
    g.offices = new Map((j.offices ?? []).map(o => [o.siteId, { day: o.day, candidates: o.candidates }]));
    g.military = new Map((j.military ?? []).map(b => [b.siteId, MilitaryBoard.fromJSON(b)]));
    g.activeMilitary = new Map((j.activeMilitary ?? []).map(q => [q.id, q]));
    g.bands = (j.bands ?? []).map(b => ({ ...b, kind: b.kind ?? 'bandit' })); g.escortLevel = j.escortLevel ?? 1; g.deferrals = j.deferrals ?? 0;
    g.forts = new Map(Object.entries(j.forts ?? {})); if (j.enemyHeld) g.enemyHeld = new Set(j.enemyHeld); g.lastShow = { ...(j.lastShow ?? {}) };
    g.buildJobs = new Map((j.buildJobs ?? []).map(e => [e.siteId, { day: e.day, jobs: e.jobs }])); g.reports = j.reports ?? []; g.roamNext = j.roamNext ?? BALANCE.roamSpawnDays;
    if (j.rng) g.rng = new Rng(j.rng);
    if (j.startDay !== undefined) g.startDay = j.startDay;
    if (j.recruited) g.recruited = new Set(j.recruited);
    g.flags = new Set(j.flags ?? []); g.firedEvents = new Set(j.firedEvents ?? []); g.jointTarget = j.jointTarget ?? null; g.lastMonth = j.lastMonth ?? g.clock.month;
    g.blocked = new Set(j.blocked); g.messages = j.messages; g.unread = 0; g.ending = j.ending; g.selected = j.selected;
    return g;
  }
  /** 거점 한 줄 상태(정보 창용) */
  /** 지역 진입 가능 여부(세계 지도 표시용) */
  regionOpen(regionId: string): boolean { return !this.blocked.has(regionId); }
  siteStatus(site: Site): string {
    const held = this.enemyHeld.has(site.id);
    const dur = isFort(site) ? ' · 내구 ' + this.fortDurability(site.id) + '/' + fortMax(site) : '';
    return (held ? '잿빛 교단 점령지' : (this.world.factions.get(site.owner ?? '')?.name ?? '무주지')) + dur;
  }
}

function weighted<T extends { weight: number }>(rng: Rng, items: T[]): T {
  const total = items.reduce((a, i) => a + i.weight, 0); let r = rng.next() * total;
  for (const i of items) { r -= i.weight; if (r <= 0) return i; }
  return items[items.length - 1];
}

export function fmt(n: number): string { return Math.round(n).toLocaleString('en-US'); }
export function goodName(id: string): string { return GOOD_BY_ID.get(id)?.name ?? id; }
export { itemName, JOB_BY_ID };
