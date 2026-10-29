import { BALANCE } from './balance';
import type { EnemyDef } from './battle';
import type { Game } from './game';
import { fmt } from './game';
import type { Person } from './squad';

/**
 * 이벤트 시스템(4·5단계). 대화창 하나 = GameEvent. 선택지의 effect 가 상태를 바꾸고 다음 대사를 돌려준다.
 * 발동: 부대가 거점에 도착할 때(site·squadIdx), 달이 바뀔 때(monthStart), 술집 "임무".
 */
export interface EventCtx { site?: string; squadIdx?: number; monthStart?: boolean; tavern?: boolean }
export interface EventChoice { label: string; disabled?: string | null; effect: (g: Game) => GameEvent | string | void }
export interface GameEvent { id: string; title: string; portrait: string; text: string; choices: EventChoice[] }
export interface EventDef { id: string; once: boolean; trigger: (g: Game, c: EventCtx) => boolean; build: (g: Game, c: EventCtx) => GameEvent }

const ok = (id: string, title: string, portrait: string, text: string): GameEvent => ({ id, title, portrait, text, choices: [{ label: '확인', effect: () => {} }] });
const person = (id: string, name: string, race: string, role: string, job: string, st: Partial<Person['stats']>): Person => ({
  id, name, race, role, job, stats: { hp: 30, maxHp: 30, e: 10, f: 0, s: 10, d: 10, t: 0, p: 0, b: 0, ...st }, wage: 0, hire: 0, weapon: null, armor: null, potion: null, potions: 0, tool: null, isLeader: false,
});
const sq = (g: Game, c: EventCtx) => g.squads[c.squadIdx ?? g.selected];
const at = (c: EventCtx, ...sites: string[]) => !!c.site && sites.includes(c.site);
const hasRace = (g: Game, c: EventCtx, ...races: string[]) => sq(g, c).people.some(p => races.includes(p.race));
const FEMALE = new Set(['phoebe', 'ella', 'liesel']);
const ymd = (g: Game) => g.clock.year * 100 + g.clock.month;

/** 4단계: 지역 진입 해제 ───────────────────────────── */
const UNLOCKS: EventDef[] = [
  {
    id: 'dwarf_gate', once: true,
    trigger: (g, c) => g.blocked.has('reg_r02') && at(c, 'P086', 'P079', 'P078', 'C039', 'C012') && sq(g, c).people.some(p => p.id === 'durin' || p.race === '드워프'),
    build: (g, c) => ({
      id: 'dwarf_gate', title: '산문 폐쇄 — 철산 대문', portrait: '드워프 문지기',
      text: '"산문은 닫혔다. 돌아가라." 문지기가 두린을 알아본다. "…그람둔 포병 학교의 ' + sq(g, c).people.find(p => p.race === '드워프')!.name + '? 보른 영감의 제자라면 얘기가 다르지. 통행세 ' + fmt(5_000) + '골을 내면 산왕의 이름으로 길을 열겠다."',
      choices: [
        { label: '통행세를 낸다 (' + fmt(5_000) + ')', disabled: g.ledger.cash < 5_000 ? '돈 부족' : null, effect: g => { g.ledger.spend('other', 5_000); g.blocked.delete('reg_r02'); g.say('info', '★ 북부 철산(드워프 산왕국)에 들어갈 수 있게 되었다. 철·미스릴·화약을 사자.'); return '"들어가라. 그람둔의 투석기 공방이 자네를 기다릴 거다."'; } },
        { label: '다음에', effect: () => {} },
      ],
    }),
  },
  {
    id: 'elf_border', once: true,
    trigger: (g, c) => g.blocked.has('reg_r03') && at(c, 'P084', 'P077', 'P016', 'C049', 'C050', 'C003', 'C014') && hasRace(g, c, '혼혈', '엘프'),
    build: (g, c) => ({
      id: 'elf_border', title: '경계 선언 — 안개 관문', portrait: '엘프 경비대장',
      text: '"인간은 숲에 들어올 수 없다." 경비대장이 ' + sq(g, c).people.find(p => p.race === '혼혈' || p.race === '엘프')!.name + '을(를) 본다. "…아엘라스의 피로군. 추방된 집안이지만 피는 피다. 혼혈이나 엘프가 이끄는 부대만 숲길을 쓸 수 있다. 그 조건으로 문을 연다."',
      choices: [{ label: '받아들인다', effect: g => { g.blocked.delete('reg_r03'); g.flags.add('elf_rule'); g.say('info', '★ 서부 대삼림(엘프 삼림왕국)이 열렸다. 단, 엘프·혼혈이 있는 부대만 들어갈 수 있다(이벤트 1 "이벤트 부대 선택").'); return '"세라핀 님이 네 소식을 궁금해하실 거다."'; } }],
    }),
  },
  {
    id: 'islands_ferry', once: true,
    trigger: (g, c) => g.blocked.has('reg_r08') && at(c, 'P024', 'P021', 'P025', 'P033', 'P028'),
    build: g => ({
      id: 'islands_ferry', title: '배편 — 남동 군도', portrait: '선장',
      text: '"군도로 가는 배라면 내가 띄우지. 해적 연맹 바다라 보험료가 붙어." 항구끼리는 배로 오갈 수 있다(항구 → 항구 이동, 뱃삯 1인당 ' + fmt(BALANCE.ferryFarePerHead) + '골). 군도 항로를 트려면 선금 ' + fmt(8_000) + '골.',
      choices: [
        { label: '선금을 낸다 (' + fmt(8_000) + ')', disabled: g.ledger.cash < 8_000 ? '돈 부족' : null, effect: g => { g.ledger.spend('other', 8_000); g.blocked.delete('reg_r08'); g.say('info', '★ 남동 군도(해적 연맹) 항로가 열렸다. 항구를 눌러 배로 건너자(향신료·진주·유황).'); return '"바람이 좋을 때 떠나게."'; } },
        { label: '다음에', effect: () => {} },
      ],
    }),
  },
];

/** 4단계: 배경 역사(GDD §4.3). 달이 바뀔 때 한 번. 플레이어가 막지 못한다. */
const HISTORY: EventDef[] = [
  { id: 'h_100002', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100002, build: () => ok('h_100002', '1000년 2월 — 하이펠트 봉기', '전령', '하이펠트에서 잿빛 교단이 봉기했다. 도른이 함락되었고, 밤마다 걷는 시체가 목격된다. 제도 북부 길이 막혔다.') },
  { id: 'h_100003', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100003, build: g => { g.flags.add('crusade'); return ok('h_100003', '1000년 3월 — 토벌령과 성전 선포', '전령', '섭정 발두르가 토벌령을 내리고 교황이 성전을 선포했다. 군사 게시판에 의뢰가 쏟아진다. 용병단 "검은 창"이 모든 고수익 의뢰에 동시에 입찰하고 있다 — 이제부터 경쟁이다.'); } },
  { id: 'h_100106', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100106, build: g => { const mine = !g.enemyHeld.has('C006'); if (!mine) { g.enemyHeld.delete('C006'); g.forts.set('C006', 100); } return ok('h_100106', '1001년 6월 — 오토의 도른 탈환', '전령', mine ? '오토 폰 하임이 도른에 입성했으나 성은 이미 당신들이 되찾은 뒤였다. 오토가 먼 친척 카엘의 이름을 기억해 두겠다고 했다.' : '오토 폰 하임이 공작령 군을 이끌고 도른을 탈환했다. 도른 길이 다시 열렸다. 당신들은 참가하지 못했다 — 전투 엔딩 재료 하나를 놓쳤다.'); } },
  { id: 'h_100206', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100206, build: g => { g.flags.add('rebels_broken'); if (g.enemyHeld.has('C005')) { g.enemyHeld.delete('C005'); g.forts.set('C005', 100); } return ok('h_100206', '1002년 6월 — 하이펠트 함락, 잿빛 교단 와해', '전령', '제국군이 하이펠트를 되찾았다. 잿빛 교단은 흩어져 산적이 되었다. 군사 의뢰는 줄고, 교역과 민사 의뢰의 비중이 커진다.'); } },
  { id: 'h_100301', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100301, build: g => { g.flags.add('regency_crisis'); return ok('h_100301', '1003년 1월 — 발두르의 황제 폐위 시도', '전령', '섭정 발두르가 어린 황제 레온을 폐위하려 한다는 소문. 황태후가 믿을 만한 용병을 찾는다고 한다 — 아르덴으로 가 보자(대형 이벤트).'); } },
  { id: 'h_100401', once: true, trigger: (g, c) => !!c.monthStart && ymd(g) >= 100401, build: g => { g.flags.add('capital_sacked'); return ok('h_100401', '1004년 1월 — 섭정 참살, 제도 약탈', '전령', '섭정이 살해되고 아르덴이 약탈당했다. 제도 교역소가 닫히고(아르덴), 피난민 호송 의뢰가 민사 게시판에 넘친다(보수 3배). 제도 재건 공사도 시작된다.'); } },
];

/** 5단계: 대형 이벤트 10(GDD §9) ───────────────────── */
const BIG: EventDef[] = [
  // 2. 무희의 호송 → 세레나 경연 우승 음유시인을 리보른까지
  {
    id: 'ev2_offer', once: true, trigger: (g, c) => at(c, 'C021') && !!c.tavern,
    build: () => ({
      id: 'ev2_offer', title: '세레나 경연의 우승자', portrait: '음유시인 이졸데',
      text: '"리보른 영주의 혼례에 초대받았어요. 길이 험하다던데… 호송해 주시면 ' + fmt(20_000) + '골, 그리고 마음에 들면 당신들과 함께 다닐게요."',
      choices: [
        { label: '호송을 맡는다', effect: g => { g.flags.add('ev2_escorting'); g.say('quest', '이졸데를 리보른(C029)까지 호송한다. 도적이 노린다.'); const p = g.world.path('C021', 'C029', g.blocked, g.enemyHeld); const mid = p?.nodes.slice(1, -1).filter(id => g.world.site(id).kind !== 'castle'); if (mid?.length) g.bands.push({ id: 'ev2band', name: '이졸데를 노리는 도적', site: mid[Math.floor(mid.length / 2)], tier: 2, questId: null, kind: 'roam', nextMove: 1e9 }); return '"고마워요. 노래로 갚을게요."'; } },
        { label: '거절한다', effect: () => {} },
      ],
    }),
  },
  {
    id: 'ev2_done', once: true, trigger: (g, c) => at(c, 'C029') && g.flags.has('ev2_escorting'),
    build: (g, c) => ({
      id: 'ev2_done', title: '리보른 도착', portrait: '음유시인 이졸데',
      text: '"무사히 왔네요!" 영주의 집사가 ' + fmt(20_000) + '골을 건넨다. 이졸데: "정말 괜찮다면… 당신들 부대에 들어가고 싶어요."',
      choices: [
        { label: '단원으로 맞는다', disabled: sq(g, c).members.length >= 8 ? '부대가 가득' : null, effect: g => { g.flags.delete('ev2_escorting'); g.ledger.earn('civil', 20_000); sq(g, c).members.push(person('isolde', '이졸데', '인간', '음유시인', 'bard', { maxHp: 22, hp: 22, p: 38, t: 6 })); return '이졸데(P 38)가 합류했다. 공연 엔딩의 든든한 재료.'; } },
        { label: '보수만 받는다', effect: g => { g.flags.delete('ev2_escorting'); g.ledger.earn('civil', 20_000); } },
      ],
    }),
  },
  // 3. 고문서·보물지도 → 유적 R-시리즈, 일곱 영웅의 인장 조각
  {
    id: 'ev3_map', once: true, trigger: (g, c) => at(c, 'C001', 'C017', 'C025', 'C013', 'C008') && !!c.tavern,
    build: () => ({
      id: 'ev3_map', title: '고문서 장수', portrait: '수상한 장수',
      text: '"대균열기 유적의 지도요. 일곱 영웅의 인장이 셋으로 쪼개져 묻혔다지. 모래 균열·대균열·유황 구멍… ' + fmt(5_000) + '골이면 지도를 넘기리다."',
      choices: [
        { label: '지도를 산다 (' + fmt(5_000) + ')', disabled: null, effect: g => { if (!g.ledger.spend('other', 5_000)) return '돈이 모자란다.'; g.flags.add('ev3_map'); g.say('quest', '유적 지도: 모래 균열(P096)·대균열(P093)·유황 구멍(P097)에 인장 조각이 하나씩. 각 2,000골의 발굴비.'); return '"행운을 비오. 균열 근처는 마물이 많으니."'; } },
        { label: '사기꾼이다', effect: () => {} },
      ],
    }),
  },
  ...['P096', 'P093', 'P097'].map((site, i): EventDef => ({
    id: 'ev3_seal' + i, once: true, trigger: (g, c) => at(c, site) && g.flags.has('ev3_map'),
    build: g => ({
      id: 'ev3_seal' + i, title: '유적 발굴', portrait: '무너진 석문',
      text: '지도의 표시대로 석문이 있다. 발굴에 ' + fmt(2_000) + '골(인부·횃불). 안쪽에서 낮은 울음소리가 난다.',
      choices: [
        { label: '발굴한다 (' + fmt(2_000) + ')', disabled: g.ledger.cash < 2_000 ? '돈 부족' : null, effect: g => { g.ledger.spend('other', 2_000); const n = (g.flags.has('seal1') ? 1 : 0) + (g.flags.has('seal2') ? 1 : 0) + (g.flags.has('seal3') ? 1 : 0) + 1; g.flags.add('seal' + n); g.say('quest', '일곱 영웅의 인장 조각 ' + n + '/3 을 얻었다.' + (n === 3 ? ' 인장이 완성되었다 — 그레이홀로의 상자를 열 수 있다.' : '')); return '목각인형 대신 인장 조각이 나왔다. (' + n + '/3)'; } },
        { label: '그냥 간다', effect: () => {} },
      ],
    }),
  })),
  // 4. 다라광 전차 → 저주받은 골렘(상아탑)
  {
    id: 'ev4_golem', once: true, trigger: (g, c) => at(c, 'C050'),
    build: g => ({
      id: 'ev4_golem', title: '상아탑의 지하', portrait: '마법사 알라릭',
      text: '"이 골렘은 저주받았네. 최강이지만 한 부대에 귀속되어 떠나지 못하고, 매달 마석 값 ' + fmt(1_500) + '골을 먹지. 그래도 가져가겠나? ' + fmt(30_000) + '골."',
      choices: [
        { label: '골렘을 산다 (' + fmt(30_000) + ')', disabled: g.ledger.cash < 30_000 ? '돈 부족' : sq(g, {}).members.length >= 8 ? '부대가 가득' : null, effect: g => { g.ledger.spend('equipment', 30_000); g.flags.add('golem'); const p = person('golem', '저주받은 골렘', '골렘', '골렘', 'golem', { maxHp: 120, hp: 120, s: 40, d: 40, b: 20 }); p.wage = 1_500; g.squad.members.push(p); return '골렘이 ' + g.squad.name + '에 귀속되었다. 해고·이동 불가, 급료 1,500.'; } },
        { label: '사양한다', effect: () => {} },
      ],
    }),
  },
  // 5. 미디리티의 세탁물 → 아델라 성지(여성 단원만)
  {
    id: 'ev5_offer', once: true, trigger: (g, c) => at(c, 'C004') && !!c.tavern,
    build: () => ({
      id: 'ev5_offer', title: '대성당의 세탁물', portrait: '수녀원장',
      text: '"아델라 성지(북동 균열변경 P052)에 제의 꾸러미를 보내야 해요. 성지는 여자만 들어갈 수 있답니다. 보수 ' + fmt(20_000) + '골."',
      choices: [{ label: '맡는다', effect: g => { g.flags.add('ev5_laundry'); g.say('quest', '세탁물을 아델라 성지(P052)로. 여성 부대장(피비·엘라·리젤) 부대만 들어갈 수 있다.'); } }, { label: '거절', effect: () => {} }],
    }),
  },
  {
    id: 'ev5_done', once: true, trigger: (g, c) => at(c, 'P052') && g.flags.has('ev5_laundry'),
    build: (g, c) => FEMALE.has(sq(g, c).id)
      ? { id: 'ev5_done', title: '아델라 성지', portrait: '성지의 수녀', text: '"고맙습니다, ' + sq(g, c).leader.name + ' 님." 보수 ' + fmt(20_000) + '골과 치유의 기적 — 부대 전원이 회복되었다.', choices: [{ label: '확인', effect: g => { g.flags.delete('ev5_laundry'); g.ledger.earn('civil', 20_000); for (const p of sq(g, c).people) { p.stats.hp = p.stats.maxHp; p.stats.f = 0; } } }] }
      : { id: 'ev5_blocked', title: '아델라 성지', portrait: '성지의 수녀', text: '"남자는 들어올 수 없습니다." 피비·엘라·리젤 부대로 다시 오자.', choices: [{ label: '확인', effect: () => {} }] },
  },
  // 6. 총술 대회 → 라엘린 궁술 대회(1001년 4월 이후), 토너먼트 3회전
  {
    id: 'ev6_tourney', once: true, trigger: (g, c) => at(c, 'C014') && ymd(g) >= 100104,
    build: g => ({
      id: 'ev6_tourney', title: '라엘린 궁술 대회', portrait: '엘프 심판',
      text: '"세 번의 과녁 대결. 참가비 ' + fmt(2_000) + '골. 우승 트로피는 후일 쓸모가 있을 거요." 부대의 사격 대원이 많을수록 유리하다.',
      choices: [
        { label: '참가한다 (' + fmt(2_000) + ')', disabled: g.ledger.cash < 2_000 ? '돈 부족' : null, effect: g => { g.ledger.spend('other', 2_000); const ranged = g.squad.people.filter(p => p.weapon && ['r1', 'r2', 'r3', 'r4'].includes(p.weapon)).length; const score = ranged * 20 + g.squad.leader.stats.s + g.rngNext() * 40; if (score >= 70) { g.flags.add('trophy'); g.ledger.earn('battle', 15_000); return '우승! 트로피와 상금 ' + fmt(15_000) + '골. (점수 ' + Math.round(score) + ')'; } return '준결승에서 떨어졌다. (점수 ' + Math.round(score) + ' < 70) 사격 대원을 더 데려오자 — 내년에 다시.'; } },
        { label: '구경만 한다', effect: () => {} },
      ],
    }),
  },
  // 7. 영주의 신부감 → 고원 씨족 사절(하이크래그)
  {
    id: 'ev7_envoy', once: true, trigger: (g, c) => at(c, 'C031'),
    build: g => ({
      id: 'ev7_envoy', title: '고원 씨족의 사절', portrait: '족장 울프릭의 사절',
      text: '"족장께서 남부 왕국에 혼인을 청하셨소. 사절단을 오르블랑까지 호위해 주면 은 ' + fmt(50_000) + '골. 다만 씨족의 예법대로 환대의 잔치(' + fmt(3_000) + '골)를 먼저 베풀어야 하오."',
      choices: [
        { label: '잔치를 베풀고 호위한다 (' + fmt(3_000) + ')', disabled: g.ledger.cash < 3_000 ? '돈 부족' : null, effect: g => { g.ledger.spend('other', 3_000); g.flags.add('ev7_escort'); g.say('quest', '고원 사절단을 오르블랑(C025)까지 호위한다. 보수 ' + fmt(50_000) + '골.'); return '"씨족은 은혜를 잊지 않소."'; } },
        { label: '잔치 없이 호위하겠다', effect: g => { g.flags.add('ev7_insulted'); g.say('warn', '사절이 모욕을 느끼고 떠났다. 며칠 뒤 사절단이 산적에게 붙잡혔다는 소식 — 구출하면 체면을 세울 수 있다(하이크래그 북쪽 관문).'); const near = g.world.site('C031').adjacent.find(a => g.world.site(a).kind !== 'castle'); if (near) g.bands.push({ id: 'ev7band', name: '사절단을 붙잡은 산적', site: near, tier: 2, questId: null, kind: 'roam', nextMove: 1e9 }); } },
      ],
    }),
  },
  { id: 'ev7_done', once: true, trigger: (g, c) => at(c, 'C025') && g.flags.has('ev7_escort'), build: () => ({ id: 'ev7_done', title: '오르블랑 — 사절단 도착', portrait: '사절', text: '혼담은 거절당했지만 사절은 약속대로 ' + fmt(50_000) + '골을 내놓았다. "울프릭 족장은 당신들을 기억할 것이오."', choices: [{ label: '확인', effect: g => { g.flags.delete('ev7_escort'); g.ledger.earn('civil', 50_000); } }] }) },
  { id: 'ev7_rescued', once: true, trigger: g => g.flags.has('ev7_insulted') && !g.bands.some(b => b.id === 'ev7band') && g.lastBattle?.enemyName === '사절단을 붙잡은 산적', build: () => ({ id: 'ev7_rescued', title: '사절단 구출', portrait: '사절', text: '"…목숨을 빚졌소." 사절이 은 ' + fmt(50_000) + '골을 내놓는다. 모욕은 잊기로 했다.', choices: [{ label: '확인', effect: g => { g.flags.delete('ev7_insulted'); g.ledger.earn('battle', 50_000); } }] }) },
  // 8. 아레임의 과학자 → 결계 부품(에스펠 → 상아탑)
  {
    id: 'ev8_part', once: true, trigger: (g, c) => at(c, 'C007') && !!c.tavern,
    build: () => ({
      id: 'ev8_part', title: '에스펠 지하의 결계 부품', portrait: '학자 베라',
      text: '"에스펠 유적에서 나온 결계 부품이에요. 상아탑의 알라릭에게 전해야 하는데, 잿빛 교단이 노리고 있어요. 보수 ' + fmt(100_000) + '골, 알라릭이 지불할 거예요."',
      choices: [{ label: '맡는다', effect: g => { g.flags.add('ev8_part'); g.say('quest', '결계 부품을 상아탑(C050)으로. 길목에 잿빛 교단 전투단이 둘 나타났다.'); const p = g.world.path('C007', 'C050', g.blocked, g.enemyHeld); const mid = p?.nodes.slice(1, -1).filter(id => g.world.site(id).kind !== 'castle' && !g.bands.some(b => b.site === id)) ?? []; mid.slice(0, 2).forEach((site, i) => g.bands.push({ id: 'ev8band' + i, name: '결계 부품을 노리는 잿빛 전투단', site, tier: 2, questId: null, kind: 'rebel', path: [], target: undefined, nextMove: 1e9 })); } }, { label: '거절', effect: () => {} }],
    }),
  },
  { id: 'ev8_done', once: true, trigger: (g, c) => at(c, 'C050') && g.flags.has('ev8_part'), build: () => ({ id: 'ev8_done', title: '상아탑', portrait: '마법사 알라릭', text: '"이것만 있으면 결계를 다시 세울 수 있네." 약속한 ' + fmt(100_000) + '골.', choices: [{ label: '확인', effect: g => { g.flags.delete('ev8_part'); g.ledger.earn('civil', 100_000); } }] }) },
  // 9. 바이어런스의 공주 → 황태후의 밀서(1003년), 황제 탈출 대작전
  {
    id: 'ev9_letter', once: true, trigger: (g, c) => at(c, 'C001') && g.flags.has('regency_crisis'),
    build: g => ({
      id: 'ev9_letter', title: '황태후의 밀서', portrait: '황태후의 시녀',
      text: '"폐하를 제도에서 남쪽으로 빼내야 합니다. 섭정부 근위대가 세 번은 길을 막을 거예요. 오르블랑까지 모셔 주시면 ' + fmt(2_500_000) + '골. 역사에는 남지 않을 겁니다."',
      choices: [
        { label: '폐하를 모신다', disabled: g.squad.power < 250 ? '부대가 너무 약하다(전투력 250 필요)' : null, effect: g => { g.flags.add('ev9_escort'); g.say('quest', '어린 황제 레온을 오르블랑(C025)까지. 근위대 세 부대가 길을 막는다.'); const p = g.world.path('C001', 'C025', g.blocked, g.enemyHeld); const mid = p?.nodes.slice(1, -1) ?? []; const picks = [mid[Math.floor(mid.length * 0.25)], mid[Math.floor(mid.length * 0.5)], mid[Math.floor(mid.length * 0.75)]].filter((x, i, a) => x && a.indexOf(x) === i); picks.forEach((site, i) => g.bands.push({ id: 'ev9band' + i, name: '섭정부 근위대 ' + (i + 1) + '진', site, tier: 3 + i, questId: null, kind: 'roam', nextMove: 1e9 })); return '"폐하는 당신들 마차 안에 계십니다. 서두르세요."'; } },
        { label: '너무 위험하다', effect: () => {} },
      ],
    }),
  },
  { id: 'ev9_done', once: true, trigger: (g, c) => at(c, 'C025') && g.flags.has('ev9_escort'), build: () => ({ id: 'ev9_done', title: '오르블랑 — 황제 도착', portrait: '어린 황제 레온', text: '"고맙다, 용병들아. 언젠가 갚겠다." 남부 왕국이 황제를 맞았다. 황태후의 약속 ' + fmt(2_500_000) + '골이 벨마르 대금고를 통해 들어왔다. 당신들은 "황제 친위파"의 숨은 공신이다.', choices: [{ label: '확인', effect: g => { g.flags.delete('ev9_escort'); g.flags.add('ev9_hero'); g.ledger.earn('battle', 2_500_000); } }] }) },
  // 10. 수수께끼의 상자 → 그레이홀로 지하(탈환 뒤)
  {
    id: 'ev10_box', once: true, trigger: (g, c) => at(c, 'C048') && !g.enemyHeld.has('C048') && sq(g, c).id === 'kael',
    build: g => {
      const sealed = g.flags.has('seal3');
      return {
        id: 'ev10_box', title: '그레이홀로 지하 — 아버지의 유품', portrait: '녹슨 상자',
        text: '아버지가 전사한 자리에서 인장 문양이 새겨진 상자가 나왔다. 집행관 토비아스가 어느새 뒤에 서 있다. "그 상자, 대금고가 ' + fmt(5_000_000) + '골에 사지요. 열지 마시고."' + (sealed ? ' 당신 손에는 완성된 일곱 영웅의 인장이 있다.' : ' 상자는 인장 없이는 열리지 않을 것 같다.'),
        choices: [
          { label: '집행관에게 넘긴다 (' + fmt(5_000_000) + ')', effect: g => { g.flags.add('box_sold'); g.ledger.earn('battle', 5_000_000); g.say('money', '상자를 넘기고 ' + fmt(5_000_000) + '골을 받았다. 추가 상환은 다음 상환일에.'); return '토비아스: "현명하십니다."'; } },
          { label: '인장으로 연다', disabled: sealed ? null : '인장 조각 3개가 필요하다', effect: g => { g.flags.add('box_opened'); g.ledger.earn('battle', 10_000_000); g.say('money', '대균열기의 보물! ' + fmt(10_000_000) + '골 — 빚을 한 번에 갚을 수 있다.'); return '상자 안에는 일곱 영웅이 숨긴 보물이 있었다. 토비아스가 입을 다물지 못한다.'; } },
          { label: '나중에', effect: () => {} },
        ],
      };
    },
  },
  // 검은 창: 공동 작전 제안(토벌령 뒤, 브록이 있으면 더 자주)
  {
    id: 'blackspear_joint', once: false, trigger: (g, c) => g.flags.has('crusade') && !g.flags.has('rebels_broken') && at(c, 'C025', 'C001', 'C004', 'C045', 'C017') && !!c.tavern && g.rngNext() < (g.squad.people.some(p => p.id === 'brok') ? 0.5 : 0.25) && !g.flags.has('joint_active'),
    build: g => ({
      id: 'blackspear_joint', title: '검은 창의 로한', portrait: '용병대장 로한',
      text: (g.squad.people.some(p => p.id === 'brok') ? '"브록! 그락의 조카가 이런 데서 뭘 하나." ' : '') + '"잿빛 전투단 하나를 같이 치자. 보수는 6:4, 우리가 6. 대신 우리 창병 셋을 붙여 주지."',
      choices: [
        { label: '공동 작전을 받는다', effect: g => { const held = [...g.enemyHeld].map(id => g.world.site(id)).find(s => s.kind !== 'castle' && !g.blocked.has(s.region)); if (!held) return '"지금은 칠 만한 데가 없군."'; g.flags.add('joint_active'); g.jointTarget = held.id; g.say('quest', '공동 작전: ' + held.name + '을(를) 탈환하면 검은 창 창병 3이 함께 싸운다. 보수의 40%.'); return '"' + held.name + '에서 보지."'; } },
        { label: '우리끼리 한다', effect: () => {} },
      ],
    }),
  },
];

/** 부대장 합류(새 게임은 카엘 혼자 시작). 남서 곡창 안에서 하나씩 만난다 */
const join = (id: string, site: string, title: string, portrait: string, text: string, cond: (g: Game) => boolean = () => true): EventDef => ({
  id: 'join_' + id, once: true,
  trigger: (g, c) => !g.recruited.has(id) && at(c, site) && cond(g),
  build: () => ({ id: 'join_' + id, title, portrait, text, choices: [{ label: '함께 가자', effect: g => { g.recruit(id, site); return undefined; } }, { label: '아직은 됐다', effect: g => { g.firedEvents.delete('join_' + id); } }] }),
});
const JOINS: EventDef[] = [
  join('phoebe', 'C028', '대금고의 감시인', '피비 애플가드', '"벨마르 대금고 애플가드 가문의 피비예요. 숙부님(토비아스)이 당신 장부를 지켜보라고 보냈죠. 어차피 따라다닐 거, 장사 수완이라도 빌려 드릴게요." 상업력이 높아 교역에 강하다.', g => g.elapsed >= 3),
  join('brok', 'C025', '오크 병법가', '브록', '"제도 대학 병법과에서 쫓겨난 오크, 브록이다. 삼촌 그락은 검은 창에 있지만 나는 내 이름으로 싸우고 싶다." 오르블랑 술집 구석의 오크가 자리에서 일어선다. 전투에 강하다.'),
  join('liesel', 'C026', '떠돌이 음유시인', '리젤', '"발리스 광장에서 노래하는 리젤이에요. 용병단엔 사기를 올릴 노래가 필요하잖아요?" 공연으로 돈을 번다(술집).'),
  join('ella', 'C029', '숲에서 쫓겨난 혼혈', '엘라', '"아엘라스에서 쫓겨난 혼혈, 엘라. 엘프 숲은 혼혈이나 엘프가 있어야 들어갈 수 있어. 언젠가 쓸모가 있을 거야." 활을 잘 쏜다.'),
  join('durin', 'C030', '수도원의 드워프 공병', '두린', '"세인트 아르노 수도원 지붕을 고치던 두린이오. 포병 학교는 중퇴했지만 성벽은 잘 쌓지." 건축·공성에 강하고, 드워프 산문을 여는 열쇠다.'),
];

export const EVENTS: EventDef[] = [...JOINS, ...UNLOCKS, ...HISTORY, ...BIG];

/** 검은 창 공동 작전 때 붙는 아군 */
export const BLACK_SPEAR_ALLIES: EnemyDef[] = [1, 2, 3].map(i => ({ name: '검은 창 창병 ' + i, job: '창병', hp: 36, s: 20, d: 14, range: 0, cooldown: 1.0, speed: 21, bounty: 0 }));

/** 엔딩 후일담 5 × 6(GDD §2.6). 짧게. */
export const EPILOGUES: Record<string, Record<string, string>> = {
  kael: { battle: '카엘 하임은 오토의 추천으로 공작령 기사단장이 되었다. 하임 가의 이름이 복권되었다.', trade: '카엘은 벨마르 대금고의 호위대장이 되었다. 빚쟁이가 채권자의 칼이 된 셈이다.', show: '카엘은 리젤의 극단에서 "검무"를 맡았다. 본인은 아직도 쑥스러워한다.', build: '카엘은 그레이홀로 재건의 감독관이 되어 아버지의 전사지를 성으로 바꿨다.', civil: '카엘은 제국 역참의 총감이 되어 1004년 피난민 수만을 남쪽으로 옮겼다.' },
  brok: { battle: '브록은 검은 창의 부대장이 되어 그락과 나란히 섰다.', trade: '브록은 사막 대상단의 호위대장이 되었다. "싸울 일이 없어 심심하다"고 편지했다.', show: '브록은 무대 위에서 통나무를 쪼개는 역을 맡았다. 아이들이 가장 좋아했다.', build: '브록은 드워프 공방에서 투석기를 배웠다. 두린이 "소질 있다"고 했다.', civil: '브록은 제도 대학 병법과의 첫 오크 교수가 되었다.' },
  phoebe: { battle: '피비는 대금고 이사회에서 "전비 채권 폐지"를 통과시켰다. 집안의 반역자라 불린다.', trade: '피비 애플가드는 동부 상인 공화국 평의원이 되었다. 집행관 토비아스는 그녀의 비서다.', show: '피비는 극단의 회계를 맡아 처음으로 흑자를 냈다.', build: '피비는 재건 채권을 발행해 제도 복구 자금을 댔다.', civil: '피비는 배달 길드 "은빛 발"을 세웠다. 11개 지역 어디든 7일 안에.' },
  ella: { battle: '엘라는 엘프 삼림의 경계 대장이 되었다. 혼혈이 그 자리에 오른 것은 처음이다.', trade: '엘라는 삼림과 평원을 잇는 중개상이 되어 약초 값을 반으로 내렸다.', show: '엘라는 세라핀 앞에서 노래했고, 추방령이 풀렸다.', build: '엘라는 아엘라스에 혼혈 아이들의 학교를 지었다.', civil: '엘라는 황제 친위파의 밀사가 되었다. 어디에나 있고 어디에도 없다.' },
  liesel: { battle: '리젤은 전장의 음유시인으로 남아 하임 용병단의 노래를 지었다.', trade: '리젤은 향신료 상인과 결혼했다. 노래는 그만두지 않았다.', show: '리젤은 세레나 극장을 사들여 평생의 꿈을 이뤘다. 매년 경연을 연다.', build: '리젤은 극장 건축을 후원했다. 음향이 대륙 최고라 한다.', civil: '리젤은 피난민 아이들에게 노래를 가르쳤다.' },
  durin: { battle: '두린은 그람둔 포병 학교를 졸업했다. 중퇴자 중 유일하게.', trade: '두린은 철산과 곡창 사이 미스릴 길을 열었다.', show: '두린은 무대 장치 기술자가 되었다. 불꽃이 전문이다.', build: '두린은 보른의 뒤를 이어 드워프 건축 장인이 되었다. 제도 재건의 설계자.', civil: '두린은 산문을 지키는 문지기가 되었다. 통행세는 받지 않는다.' },
};
export const ENDING_POEM = '빚은 갚았다.\n천 년의 제국은 기울고\n여섯 사람은 각자의 길로.\n길 위에서 번 돈은\n길 위에 남았다.';
