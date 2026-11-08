import { BALANCE } from '../core/balance';
import { GameClock as Clock } from '../core/clock';
import { ARMOR_BY_ID, POTION_BY_ID, WEAPON_BY_ID, itemName, itemPrice, SELLBACK, type Armor, type Potion, type Tool, type Weapon } from '../core/equipment';
import { FORMATIONS, FORMATION_BY_ID, STANCE_LABEL, ATTACK_MODE_LABEL } from '../core/formation';
import { fmt, JOB_BY_ID } from '../core/game';
import { MAX_MEMBERS, type Person } from '../core/squad';
import { FULL_W, type Window } from './Window';
import { C } from './theme';
import type { UIScene } from './scenes/UIScene';

/** 2단계 창들(계약소·상점·병원·군사 게시판·부대원/병기 편성·호위대 집행관). UIScene 에서 호출. */

const statLine = (p: Person) => 'HP ' + p.stats.hp + '/' + p.stats.maxHp + ' E' + p.stats.e + ' F' + p.stats.f + ' S' + p.stats.s + ' D' + p.stats.d + ' T' + p.stats.t + ' P' + p.stats.p + ' B' + p.stats.b;

/**
 * 오른쪽 부대원 칸(원작 상점 창 공통): 3×3 큰 칸, 칸마다 이름과 한 줄 정보.
 * 칸 하나가 48×30(손가락으로 누를 만한 크기).
 */
function memberGrid(ui: UIScene, w: Window, x: number, y: number, selected: string | null, onPick: (id: string) => void, extra?: (p: Person) => string): number {
  const sq = ui.g.squad;
  w.small(x, y - 12, sq.name + ' (' + sq.headcount + '/9)', { color: C.grey });
  sq.people.forEach((p, i) => {
    const bx = x + (i % 3) * 51, by = y + Math.floor(i / 3) * 33;
    w.button(bx, by, (p.isLeader ? '★' : '') + p.name.slice(0, 3) + '\n' + (extra ? extra(p) : 'HP' + p.stats.hp), () => onPick(p.id), { w: 48, h: 30, small: true, selected: p.id === selected, color: p.isLeader ? 0x4a3b2a : undefined });
  });
  return y + 3 * 33;
}

/** 계약소(원작 확인: 직업·HP·급료·능력치·고용비 + 우측 부대원 칸 + 해고 = 매입가 환급) */
export function openContract(ui: UIScene, siteId: string): void {
  const w = ui.full(ui.g.world.site(siteId).name + ' 계약소');
  let picked: string | null = null; let off = 0;
  const ROWH = 24, VIS = 7, LY = 42;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const cands = g.office(siteId)!;
    w.portrait(6, 2, 30, 26, 'shopkeeper', '계약소');
    w.small(42, 3, '"' + sq.leader.name + ' 부대장, 쓸 만한 사람들입니다. 급료는 매달 1일."', { color: C.paperDark });
    w.small(42, 15, '소지금 ' + fmt(g.ledger.cash) + '골   부대 급료 합계 ' + fmt(sq.wages) + '/월', { color: C.gold });
    const cols = [8, 96, 122, 156, 222];
    ['직업 / 이름', 'HP', '급료', 'S D T P B', '고용비'].forEach((h, i) => w.small(cols[i], 30, h, { color: C.grey }));
    if (!cands.length) w.small(8, LY + 4, '지금은 사람이 없다. 며칠 뒤에.', { color: C.grey });
    off = Math.min(off, Math.max(0, cands.length - VIS));
    cands.slice(off, off + VIS).forEach((c, k) => {
      const y = LY + k * ROWH;
      w.rect(4, y, 300, ROWH - 2, C.panelLight, (off + k) % 2 === 0 ? 0.45 : 0.25);
      w.small(cols[0], y + 1, c.name.slice(0, 6) + '(' + c.race[0] + ')');
      w.small(cols[0], y + 11, c.role, { color: C.paperDark });
      w.small(cols[1], y + 6, String(c.stats.maxHp));
      w.small(cols[2], y + 6, fmt(c.wage));
      w.small(cols[3], y + 6, c.stats.s + ' ' + c.stats.d + ' ' + c.stats.t + ' ' + c.stats.p + ' ' + c.stats.b);
      w.small(cols[4], y + 6, fmt(c.hire), { color: C.gold });
      w.button(256, y + 1, '고용', () => { const r = g.hire(g.selected, c.cid); if (!r.ok) ui.toast(r.reason ?? ''); render(); }, { w: 46, h: 20, disabled: sq.members.length >= MAX_MEMBERS || g.ledger.cash < c.hire });
      if (k === 0) w.mark('hire0', 302, y + 11);
    });
    w.scroll({ x: 4, y: LY, w: 304, h: VIS * ROWH, rowH: ROWH, count: cands.length, rows: VIS, get: () => off, set: v => { off = v; }, redraw: render });
    const gy = memberGrid(ui, w, 312, LY, picked, id => { picked = picked === id ? null : id; render(); }, p => p.isLeader ? '부대장' : '급료' + p.wage);
    const p = picked ? sq.people.find(x => x.id === picked) : undefined;
    if (p && !p.isLeader) {
      const refund = p.hire + [p.weapon, p.armor].reduce((a, it) => a + (it ? Math.round(itemPrice(it) * SELLBACK) : 0), 0);
      w.small(312, gy + 2, p.name + ' · ' + p.role + ' · HP ' + p.stats.maxHp, { color: C.white });
      w.button(312, gy + 16, '해고 (환급 ' + fmt(refund) + ')', () => { g.fire(g.selected, p.id); picked = null; render(); }, { w: 150, h: 22, color: 0x5a3a2a });
    } else w.small(312, gy + 4, '대원을 누르면 해고할 수 있다.', { color: C.grey, wordWrap: { width: 150 } });
    w.small(6, LY + VIS * ROWH + 6, '해고하면 고용비를 그대로 돌려받는다(원작). 급료를 못 주면 장비 든 대원이 도망간다. 목록은 위아래로 밀어 넘긴다.', { color: C.grey, wordWrap: { width: 456 } });
  };
  render();
}

/** 무기점·방패점·약국·도구점(원작 확인: 좌 점주 / 중 품목 / 우 부대원 칸 / "장비를 판다") */
export function openShop(ui: UIScene, siteId: string, kind: 'weapon' | 'armor' | 'potion' | 'tool'): void {
  const title = { weapon: '무기점', armor: '방패점', potion: '약국', tool: '도구점' }[kind];
  const w = ui.full(ui.g.world.site(siteId).name + ' ' + title);
  let picked: string | null = ui.g.squad.leader.id; let off = 0;
  const ROWH = 24, VIS = 7, LY = 42;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const items = g.shopItems(siteId, kind);
    w.portrait(6, 2, 30, 26, 'shopkeeper', '점주');
    const p = sq.people.find(x => x.id === picked) ?? sq.leader; picked = p.id;
    w.small(42, 3, '"' + p.name + '에게 맞춰 드리지요. 쓰던 건 반값에 받습니다."', { color: C.paperDark });
    w.small(42, 15, '소지금 ' + fmt(g.ledger.cash) + '골', { color: C.gold });
    w.small(8, 30, '품목', { color: C.grey }); w.small(150, 30, kind === 'weapon' ? '공격' : kind === 'armor' ? '방어' : kind === 'tool' ? '기술' : '회복', { color: C.grey }); w.small(186, 30, '값', { color: C.grey });
    if (!items.length) w.small(8, LY + 4, '이 성 규모로는 파는 물건이 없다.', { color: C.grey });
    off = Math.min(off, Math.max(0, items.length - VIS));
    items.slice(off, off + VIS).forEach((it, k) => {
      const y = LY + k * ROWH;
      const val = (it as Weapon).attack ?? (it as Armor).defense ?? (it as Potion).heal ?? (it as Tool).bonus;
      const ranged = (it as Weapon).ranged; const skill = (it as Tool).skill;
      w.rect(4, y, 300, ROWH - 2, C.panelLight, (off + k) % 2 === 0 ? 0.45 : 0.25);
      w.small(8, y + 1, it.name + '  ' + it.tier + '단계');
      w.small(8, y + 11, kind === 'weapon' ? (ranged ? '사격' : '백병') : kind === 'tool' ? ({ t: '상업 T', p: '공연 P', b: '건축 B' } as const)[skill] : kind === 'armor' ? '갑옷' : '회복약', { color: C.paperDark });
      w.small(150, y + 6, '+' + val); w.small(186, y + 6, fmt(it.price) + '골', { color: C.gold });
      w.button(250, y + 1, '산다', () => { const r = g.buyItem(g.selected, p.id, it.id); if (!r.ok) ui.toast(r.reason ?? ''); render(); }, { w: 52, h: 20, disabled: g.ledger.cash < it.price });
    });
    w.scroll({ x: 4, y: LY, w: 304, h: VIS * ROWH, rowH: ROWH, count: items.length, rows: VIS, get: () => off, set: v => { off = v; }, redraw: render });
    const gy = memberGrid(ui, w, 312, LY, picked, id => { picked = id; render(); }, q => kind === 'weapon' ? itemName(q.weapon).slice(0, 4) : kind === 'armor' ? itemName(q.armor).slice(0, 4) : kind === 'tool' ? itemName(q.tool).slice(0, 4) : (q.potion ? itemName(q.potion).slice(0, 2) + '×' + q.potions : '-'));
    // 고른 대원의 장비
    w.small(312, gy + 1, p.name + ': 무기 ' + itemName(p.weapon) + ' · 갑옷 ' + itemName(p.armor) + ' · 도구 ' + itemName(p.tool) + ' · 약 ' + (p.potion ? itemName(p.potion) + '×' + p.potions : '-'), { color: C.white, wordWrap: { width: 150 } });
    if (kind !== 'potion') {
      const slot = kind; const cur = p[slot];
      if (cur) w.button(312, LY + VIS * ROWH - 22, '장비를 판다 (' + fmt(Math.round(itemPrice(cur) * SELLBACK)) + ')', () => { g.sellItem(g.selected, p.id, slot); render(); }, { w: 150, h: 22, color: 0x5a3a2a });
    }
    w.small(6, LY + VIS * ROWH + 6, kind === 'weapon' ? '사는 장비는 오른쪽에서 고른 대원이 바로 든다. 사격 무기를 들면 사격 대원이 된다.' : kind === 'armor' ? '사는 갑옷은 오른쪽에서 고른 대원이 바로 입는다. 갑옷은 이동 페널티가 없다(원작).' : kind === 'tool' ? '도구는 그 직업 기술만 올린다. 상인에게 장부, 음유시인에게 류트, 석공에게 해머.' : '회복약은 1인 5개, 전투 중 HP 35% 밑이면 자동 사용.', { color: C.grey, wordWrap: { width: 456 } });
  };
  render();
}

/** 병원 */
export function openHospital(ui: UIScene, siteId: string): void {
  const w = ui.win(320, 170, ui.g.world.site(siteId).name + ' 병원(사원)');
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const cost = g.hospitalCost(g.selected);
    w.portrait(6, 4, 36, 44, 'healer', '치유사');
    w.small(48, 4, cost > 0 ? '"다친 분들이군요. 전부 돌봐 드리면 ' + fmt(cost) + '골입니다."' : '"모두 건강합니다. 또 오십시오."', { color: C.paperDark, wordWrap: { width: 260 } });
    sq.people.slice(0, 9).forEach((p, i) => w.small(6 + (i % 3) * 104, 52 + Math.floor(i / 3) * 12, p.name.slice(0, 3) + ' ' + p.stats.hp + '/' + p.stats.maxHp + ' 피' + p.stats.f, { color: p.stats.hp < p.stats.maxHp / 2 ? C.red : C.paper }));
    w.button(6, w.bodyH - 30, '치료 (' + fmt(cost) + '골)', () => { if (!g.heal(g.selected)) ui.toast('돈 부족'); render(); }, { w: 130, h: 24, disabled: cost <= 0 || g.ledger.cash < cost });
    w.small(144, w.bodyH - 30, 'HP 1당 ' + BALANCE.hospitalPerHp + '골, 피로 1당 ' + BALANCE.hospitalPerFatigue + '골. 성에서 쉬면 조금씩 낫는다.', { color: C.grey, wordWrap: { width: 166 } });
  };
  render();
}

/** 군사 게시판(원작 확인: 작전내용·의뢰인·보수, 기한 없음) */
export function openMilitary(ui: UIScene, siteId: string): void {
  const w = ui.win(FULL_W, 200, ui.g.world.site(siteId).name + ' 군사 게시판');
  const render = () => {
    w.clearBody(); const g = ui.g; const b = g.militaryBoard(siteId)!;
    w.portrait(6, 2, 30, 26, 'officer', '사관');
    w.small(42, 4, '"토벌령이다. 도적단을 치면 보수를 준다. 기한은 없다."', { color: C.paperDark });
    w.small(42, 15, '도적단은 지도에 빨간 깃발로 보인다. 그 거점에 도착하면 바로 교전, 이기면 보수.', { color: C.grey });
    const cols = [8, 190, 232, 310];
    ['작전 내용', '규모', '의뢰인', '보수'].forEach((h, i) => w.small(cols[i], 32, h, { color: C.grey }));
    if (!b.quests.length) w.small(8, 46, '지금은 의뢰가 없다.', { color: C.grey });
    b.quests.forEach((q, i) => {
      const y = 44 + i * 26;
      w.rect(4, y, 458, 24, C.panelLight, i % 2 === 0 ? 0.45 : 0.25);
      w.small(cols[0], y + 7, q.text.slice(0, 20)); w.small(cols[1], y + 7, '×' + (3 + q.tier * 2)); w.small(cols[2], y + 7, q.client); w.small(cols[3], y + 7, fmt(q.reward) + '골', { color: C.gold });
      w.button(392, y + 2, '수락', () => { if (!g.acceptMilitary(g.selected, q.id)) ui.toast('수락 불가'); render(); }, { w: 66, h: 20 });
    });
    const mine = [...g.activeMilitary.values()];
    const my = 44 + 2 * 26 + 6;
    w.small(6, my, '— 진행 중인 토벌 (전부 보기: 오른쪽 위 «의뢰») —', { color: C.grey });
    if (!mine.length) w.small(6, my + 12, '없음', { color: C.grey });
    mine.slice(0, 5).forEach((q, i) => w.small(6, my + 12 + i * 11, q.text + '  →  ' + g.world.site(q.target).name + '으로 가서 공격  ' + fmt(q.reward) + '골'));
  };
  render();
}

/**
 * 부대원 편성(원작: 6열 × 9칸 격자). 폰에 맞춰: 위 부대 단추로 볼 부대를 고르고, 가운데 3×3 칸에서 대원을 누르면
 * 오른쪽에 정보와 «→ 옮길 부대» 단추가 뜬다. 같은 거점의 부대끼리만 옮긴다. 아래는 대열·태세·공격 방식.
 */
export function openRoster(ui: UIScene): void {
  const w = ui.full('부대원 편성');
  let picked: string | null = null;
  const render = () => {
    w.clearBody(); const g = ui.g; const here = g.squad.siteId; const sq = g.squad;
    g.squads.forEach((s, si) => {
      const same = s.siteId === here && g.isActive(si);
      w.button(4 + si * 77, 0, (si + 1) + ' ' + (g.isActive(si) ? s.leader.name.slice(0, 3) : '???'), () => { g.selected = si; picked = null; render(); }, { w: 74, h: 22, selected: si === g.selected, disabled: !same });
    });
    w.small(6, 26, sq.name + ' — 대원을 누르면 오른쪽에서 다른 부대로 옮길 수 있다', { color: C.grey });
    for (let r = 0; r < 9; r++) {
      const p = sq.people[r]; const x = 4 + (r % 3) * 76, y = 38 + Math.floor(r / 3) * 34;
      if (p) w.button(x, y, (p.isLeader ? '★' : '') + p.name.slice(0, 5) + '\nHP ' + p.stats.hp + '/' + p.stats.maxHp, () => { picked = picked === p.id ? null : p.id; render(); }, { w: 72, h: 30, small: true, selected: picked === p.id, color: p.isLeader ? 0x4a3b2a : undefined });
      else w.rect(x, y, 72, 30, C.panelLight, 0.25);
    }
    const p = picked ? sq.people.find(x => x.id === picked) : undefined;
    const RX = 240;
    if (p) {
      w.small(RX, 38, p.name + ' (' + p.race + ' ' + (JOB_BY_ID.get(p.job)?.name ?? p.role) + ')', { color: C.white });
      w.small(RX, 50, statLine(p), { color: C.paperDark, wordWrap: { width: 220 } });
      w.small(RX, 72, '무기 ' + itemName(p.weapon) + ' · 갑옷 ' + itemName(p.armor) + ' · 약 ' + (p.potion ? itemName(p.potion) + '×' + p.potions : '-') + ' · 급료 ' + fmt(p.wage), { color: C.paperDark, wordWrap: { width: 220 } });
      const targets = g.squads.map((s, si) => ({ s, si })).filter(({ s, si }) => si !== g.selected && g.isActive(si) && s.siteId === here);
      if (p.isLeader) w.small(RX, 100, '부대장은 옮길 수 없다.', { color: C.grey });
      else if (!targets.length) w.small(RX, 100, '같은 거점에 다른 부대가 없다.', { color: C.grey });
      else {
        w.small(RX, 96, '옮길 부대:', { color: C.gold });
        targets.forEach(({ s, si }, i) => w.button(RX + (i % 3) * 74, 108 + Math.floor(i / 3) * 24, '→ ' + (si + 1) + ' ' + s.leader.name.slice(0, 2), () => { if (!g.transfer(g.selected, p.id, si)) ui.toast('옮길 수 없다(가득 또는 다른 거점)'); picked = null; render(); }, { w: 70, h: 20 }));
      }
    } else w.small(RX, 40, '대원을 누르면 능력치와 장비가 보인다.', { color: C.grey, wordWrap: { width: 220 } });
    const f = FORMATION_BY_ID.get(sq.formation)!;
    w.small(6, 144, '대열 ' + f.name + ' — ' + f.desc, { color: C.gold, wordWrap: { width: 456 } });
    FORMATIONS.forEach((fo, i) => w.button(4 + i * 57, 160, fo.name, () => { sq.formation = fo.id; render(); }, { w: 55, h: 22, small: true, selected: sq.formation === fo.id }));
    w.small(6, 194, '태세', { color: C.grey });
    (['alert', 'normal', 'search'] as const).forEach((st, i) => w.button(34 + i * 64, 188, STANCE_LABEL[st], () => { sq.stance = st; render(); }, { w: 60, h: 22, selected: sq.stance === st }));
    w.small(240, 194, '공격', { color: C.grey });
    (['melee', 'ranged'] as const).forEach((m, i) => w.button(268 + i * 64, 188, ATTACK_MODE_LABEL[m], () => { sq.attackMode = m; render(); }, { w: 60, h: 22, selected: sq.attackMode === m }));
    w.small(6, 218, '위 부대 단추: 볼 부대 고르기(다른 거점에 있는 부대는 흐리게).', { color: C.grey });
  };
  render();
}

/** 병기 편성: 선택 부대 대원별 장비 보기·되팔기 */
export function openEquip(ui: UIScene): void {
  const w = ui.full('병기 편성 — ' + ui.g.squad.name);
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad;
    ['이름', '무기', '갑옷', '회복약 · 도구'].forEach((h, i) => w.small([8, 78, 170, 262][i], 2, h, { color: C.grey }));
    sq.people.forEach((p, i) => {
      const y = 14 + i * 23;
      w.rect(4, y, 458, 21, C.panelLight, i % 2 === 0 ? 0.45 : 0.25);
      w.small(8, y + 5, (p.isLeader ? '★' : '') + p.name.slice(0, 6));
      w.small(78, y + 5, itemName(p.weapon).slice(0, 7) + (p.weapon ? ' +' + WEAPON_BY_ID.get(p.weapon)!.attack : ''));
      w.small(170, y + 5, itemName(p.armor).slice(0, 7) + (p.armor ? ' +' + ARMOR_BY_ID.get(p.armor)!.defense : ''));
      w.small(262, y + 5, ((p.potion ? itemName(p.potion).slice(0, 4) + '×' + p.potions : '-') + (p.tool ? ' · ' + itemName(p.tool) : '')).slice(0, 12));
      if (p.weapon && sq.siteId) w.button(338, y + 1, '무기 팔기', () => { g.sellItem(g.selected, p.id, 'weapon'); render(); }, { w: 60, h: 19, small: true });
      if (p.armor && sq.siteId) w.button(400, y + 1, '갑옷 팔기', () => { g.sellItem(g.selected, p.id, 'armor'); render(); }, { w: 60, h: 19, small: true });
    });
    w.small(6, 14 + 9 * 23 + 4, '장비는 상점에서 사면 바로 장착된다. 되팔면 반값. 부대 전투력 ' + Math.round(sq.power), { color: C.grey });
  };
  render();
}

/** 상환 대화(2단계): 돈이 모자라면 호위대와 싸우거나 가산금을 받아들인다 */
export function openCollector(ui: UIScene, onFight: () => void, onDone: () => void): void {
  const g = ui.g; const v = g.collectorVisit!; const l = g.ledger;
  const w = ui.win(360, 210, '벨마르 대금고 집행관 — ' + Clock.format(g.clock.date), false);
  w.portrait(6, 6, 44, 56, 'tobias', '토비아스');
  let line: string; let color: string = C.paper;
  if (v.short) { line = '"상환액 ' + fmt(l.minRepayment) + '골이 없으시군요. 뒤에 호위대 ' + v.escortLevel + '단계가 있습니다. 싸워 이기면 이번 주는 봐 드리죠. 아니면 계약대로 가산금 ' + fmt(BALANCE.missedPenalty) + '골입니다."'; color = C.red; }
  else if (v.fought === 'victory') line = '"…졌군요. 좋습니다, 이번 주는 미룹니다. 다음엔 더 센 사람들을 데려오죠."';
  else if (v.fought) { line = '"보셨죠? 가산금 ' + fmt(v.penalty) + '골을 올립니다. 부채 ' + fmt(l.debt) + '골."'; color = C.red; }
  else if (v.paid > 0) line = '"기본상환 ' + fmt(v.paid) + '골, 확실히 받았습니다. 남은 빚은 ' + fmt(l.debt) + '골이군요. 더 내시겠습니까?"';
  else { line = '"계약대로 가산금 ' + fmt(v.penalty) + '골을 올립니다. 부채 ' + fmt(l.debt) + '골."'; color = C.red; }
  w.text(58, 6, line, { wordWrap: { width: 290 }, color });
  w.small(58, 66, '소지금 ' + fmt(l.cash) + '골  /  부채 ' + fmt(l.debt) + '골  /  미룬 횟수 ' + g.deferrals, { color: C.gold });
  if (v.short) {
    w.button(58, 82, '호위대와 싸운다 (' + g.squad.name + ')', () => { w.close(); onFight(); }, { w: 240, h: 24, color: 0x5a3a2a, disabled: !g.squad.siteId });
    w.button(58, 110, '가산금을 받아들인다 (+' + fmt(BALANCE.missedPenalty) + ')', () => { g.collectorAccept(); w.close(); onDone(); }, { w: 240, h: 24 });
    w.small(58, 140, '싸우는 부대는 지금 선택한 부대. 부대장이 쓰러지면 패배.', { color: C.grey });
    return;
  }
  w.small(58, 80, '추가로 갚기', { color: C.grey });
  BALANCE.extraRepaymentChoices.forEach((a, i) => {
    const x = 58 + (i % 4) * 72, y = 92 + Math.floor(i / 4) * 26;
    w.button(x, y, fmt(a), () => { g.repayExtra(a); w.close(); onDone(); }, { w: 68, h: 22, small: true, disabled: l.cash < a || l.debt <= 0 });
  });
  w.button(w.bw - 96, w.bodyH - 30, '다음에', () => { w.close(); onDone(); }, { w: 84, h: 24 });
}
