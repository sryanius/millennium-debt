import { BALANCE } from '../core/balance';
import { GameClock as Clock } from '../core/clock';
import { ARMOR_BY_ID, POTION_BY_ID, WEAPON_BY_ID, itemName, itemPrice, SELLBACK, type Armor, type Potion, type Tool, type Weapon } from '../core/equipment';
import { FORMATIONS, FORMATION_BY_ID, STANCE_LABEL, ATTACK_MODE_LABEL } from '../core/formation';
import { fmt, JOB_BY_ID } from '../core/game';
import { MAX_MEMBERS, type Person } from '../core/squad';
import type { Window } from './Window';
import { C } from './theme';
import type { UIScene } from './scenes/UIScene';

/** 2단계 창들(계약소·상점·병원·군사 게시판·부대원/병기 편성·호위대 집행관). UIScene 에서 호출. */

const statLine = (p: Person) => 'HP ' + p.stats.hp + '/' + p.stats.maxHp + ' E' + p.stats.e + ' F' + p.stats.f + ' S' + p.stats.s + ' D' + p.stats.d + ' T' + p.stats.t + ' P' + p.stats.p + ' B' + p.stats.b;

/** 우측 부대원 초상 격자(원작 상점 창 공통). 선택한 사람 id 를 돌려준다. */
function memberGrid(ui: UIScene, w: Window, x: number, y: number, selected: string | null, onPick: (id: string) => void, extra?: (p: Person) => string): void {
  const sq = ui.g.squad;
  w.small(x, y - 10, sq.name + ' (' + sq.headcount + '/9)', { color: C.grey });
  sq.people.forEach((p, i) => {
    const bx = x + (i % 3) * 36, by = y + Math.floor(i / 3) * 30;
    w.button(bx, by, (p.isLeader ? '★' : '') + p.name.slice(0, 3), () => onPick(p.id), { w: 34, h: 16, small: true, color: p.id === selected ? 0x6a5a2a : (p.isLeader ? 0x4a3b2a : undefined) });
    w.small(bx, by + 17, extra ? extra(p) : 'HP' + p.stats.hp, { color: C.paperDark });
  });
}

/** 계약소(원작 확인: 직업·HP·급료·능력치·고용비 + 우측 부대원 격자 + 해고 = 매입가 환급) */
export function openContract(ui: UIScene, siteId: string): void {
  const w = ui.win(440, 236, ui.g.world.site(siteId).name + ' 계약소');
  let picked: string | null = null;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const cands = g.office(siteId)!;
    w.portrait(6, 2, 36, 24, 'shopkeeper', '계약소');
    w.small(48, 4, '"' + sq.leader.name + ' 부대장, 쓸 만한 사람들입니다. 급료는 매달 1일."', { color: C.paperDark });
    w.small(48, 14, '소지금 ' + fmt(g.ledger.cash) + '골   부대 급료 합계 ' + fmt(sq.wages) + '/월', { color: C.gold });
    const cols = [6, 70, 100, 134, 258, 300];
    ['직업 / 이름', 'HP', '급료', '능력치 S D T P B', '고용비', ''].forEach((h, i) => w.small(cols[i], 28, h, { color: C.grey }));
    if (!cands.length) w.small(6, 40, '지금은 사람이 없다. 며칠 뒤에.', { color: C.grey });
    cands.slice(0, 8).forEach((c, i) => {
      const y = 40 + i * 13;
      w.small(cols[0], y, c.role + ' ' + c.name.slice(0, 5) + '(' + c.race[0] + ')');
      w.small(cols[1], y, String(c.stats.maxHp));
      w.small(cols[2], y, fmt(c.wage));
      w.small(cols[3], y, c.stats.s + ' ' + c.stats.d + ' ' + c.stats.t + ' ' + c.stats.p + ' ' + c.stats.b + '  경' + c.stats.e);
      w.small(cols[4], y, fmt(c.hire), { color: C.gold });
      w.button(cols[5], y - 1, '고용', () => { const r = g.hire(g.selected, c.cid); if (!r.ok) ui.toast(r.reason ?? ''); render(); }, { w: 34, h: 11, small: true, disabled: sq.members.length >= MAX_MEMBERS || g.ledger.cash < c.hire });
    });
    memberGrid(ui, w, 326, 40, picked, id => { picked = picked === id ? null : id; render(); }, p => p.isLeader ? '급료 0' : '급료 ' + p.wage);
    const p = picked ? sq.people.find(x => x.id === picked) : undefined;
    if (p && !p.isLeader) {
      const refund = p.hire + [p.weapon, p.armor].reduce((a, it) => a + (it ? Math.round(itemPrice(it) * SELLBACK) : 0), 0);
      w.button(326, 160, '해고 (환급 ' + fmt(refund) + ')', () => { g.fire(g.selected, p.id); picked = null; render(); }, { w: 108, h: 14, small: true, color: 0x5a3a2a });
    }
    w.small(6, w.bh - 28, '해고하면 고용비를 그대로 돌려받는다(원작). 급료를 못 주면 장비 든 대원이 도망간다.', { color: C.grey, wordWrap: { width: 420 } });
  };
  render();
}

/** 무기점·방패점·약국(원작 확인: 좌 점주 / 중 품목 / 우 부대원 격자 / "장비를 판다") */
export function openShop(ui: UIScene, siteId: string, kind: 'weapon' | 'armor' | 'potion' | 'tool'): void {
  const title = { weapon: '무기점', armor: '방패점', potion: '약국', tool: '도구점' }[kind];
  const w = ui.win(440, 236, ui.g.world.site(siteId).name + ' ' + title);
  let picked: string | null = ui.g.squad.leader.id;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const items = g.shopItems(siteId, kind);
    w.portrait(6, 2, 36, 24, 'shopkeeper', '점주');
    const p = sq.people.find(x => x.id === picked) ?? sq.leader; picked = p.id;
    w.small(48, 4, '"' + p.name + '에게 맞춰 드리지요. 쓰던 건 반값에 받습니다."', { color: C.paperDark });
    w.small(48, 14, '소지금 ' + fmt(g.ledger.cash) + '골', { color: C.gold });
    w.small(48, 28, '품목', { color: C.grey }); w.small(170, 28, kind === 'weapon' ? '공격' : kind === 'armor' ? '방어' : kind === 'tool' ? '기술' : '회복', { color: C.grey }); w.small(210, 28, '값', { color: C.grey });
    if (!items.length) w.small(48, 40, '이 성 규모로는 파는 물건이 없다.', { color: C.grey });
    items.forEach((it, i) => {
      const y = 40 + i * 14;
      const val = (it as Weapon).attack ?? (it as Armor).defense ?? (it as Potion).heal ?? (it as Tool).bonus;
      const ranged = (it as Weapon).ranged; const skill = (it as Tool).skill;
      w.small(48, y, it.name + (kind === 'weapon' ? (ranged ? ' (사격)' : ' (백병)') : kind === 'tool' ? ' (' + ({ t: '상업 T', p: '공연 P', b: '건축 B' } as const)[skill] + ')' : '') + '  ' + it.tier + '단계');
      w.small(170, y, '+' + val); w.small(210, y, fmt(it.price), { color: C.gold });
      w.button(258, y - 1, '산다', () => { const r = g.buyItem(g.selected, p.id, it.id); if (!r.ok) ui.toast(r.reason ?? ''); render(); }, { w: 40, h: 11, small: true, disabled: g.ledger.cash < it.price });
    });
    memberGrid(ui, w, 326, 40, picked, id => { picked = id; render(); }, q => kind === 'weapon' ? itemName(q.weapon).slice(0, 5) : kind === 'armor' ? itemName(q.armor).slice(0, 5) : kind === 'tool' ? itemName(q.tool).slice(0, 5) : (q.potion ? itemName(q.potion).slice(0, 3) + '×' + q.potions : '-'));
    // 선택 대원의 장비
    w.small(6, 150, p.name + ': 무기 ' + itemName(p.weapon) + ' · 갑옷 ' + itemName(p.armor) + ' · 도구 ' + itemName(p.tool) + ' · 약 ' + (p.potion ? itemName(p.potion) + '×' + p.potions : '-'), { color: C.white, wordWrap: { width: 330 } });
    if (kind !== 'potion') {
      const slot = kind; const cur = p[slot];
      if (cur) w.button(6, 166, '장비를 판다 (' + fmt(Math.round(itemPrice(cur) * SELLBACK)) + ')', () => { g.sellItem(g.selected, p.id, slot); render(); }, { w: 120, h: 14, small: true, color: 0x5a3a2a });
    }
    w.small(6, w.bh - 28, kind === 'weapon' ? '사격 무기를 들면 사격 대원이 된다. 단계가 높을수록 공격이 세다.' : kind === 'armor' ? '갑옷은 이동 페널티가 없다(원작).' : kind === 'tool' ? '도구는 그 직업 기술만 올린다. 상인에게 장부, 음유시인에게 류트, 석공에게 해머.' : '회복약은 1인 5개, 전투 중 HP 35% 밑이면 자동 사용.', { color: C.grey });
  };
  render();
}

/** 병원 */
export function openHospital(ui: UIScene, siteId: string): void {
  const w = ui.win(300, 150, ui.g.world.site(siteId).name + ' 병원(사원)');
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const cost = g.hospitalCost(g.selected);
    w.portrait(6, 4, 36, 44, 'healer', '치유사');
    w.small(48, 4, cost > 0 ? '"다친 분들이군요. 전부 돌봐 드리면 ' + fmt(cost) + '골입니다."' : '"모두 건강합니다. 또 오십시오."', { color: C.paperDark, wordWrap: { width: 240 } });
    sq.people.slice(0, 9).forEach((p, i) => w.small(6 + (i % 3) * 98, 48 + Math.floor(i / 3) * 12, p.name.slice(0, 5) + ' ' + p.stats.hp + '/' + p.stats.maxHp + ' 피로' + p.stats.f, { color: p.stats.hp < p.stats.maxHp / 2 ? C.red : C.paper }));
    w.button(6, w.bh - 32, '치료 (' + fmt(cost) + '골)', () => { if (!g.heal(g.selected)) ui.toast('돈 부족'); render(); }, { w: 120, h: 16, disabled: cost <= 0 || g.ledger.cash < cost });
    w.small(132, w.bh - 30, 'HP 1당 ' + BALANCE.hospitalPerHp + '골, 피로 1당 ' + BALANCE.hospitalPerFatigue + '골. 성에서 쉬면 조금씩 낫는다.', { color: C.grey, wordWrap: { width: 160 } });
  };
  render();
}

/** 군사 게시판(원작 확인: 작전내용·의뢰인·보수, 기한 없음) */
export function openMilitary(ui: UIScene, siteId: string): void {
  const w = ui.win(400, 160, ui.g.world.site(siteId).name + ' 군사 게시판');
  const render = () => {
    w.clearBody(); const g = ui.g; const b = g.militaryBoard(siteId)!;
    w.portrait(6, 4, 36, 44, 'officer', '사관');
    w.small(48, 4, '"토벌령이다. 도적단을 치면 보수를 준다. 기한은 없다."', { color: C.paperDark });
    ['작전 내용', '규모', '의뢰인', '보수', ''].forEach((h, i) => w.small([48, 220, 262, 320, 356][i], 18, h, { color: C.grey }));
    if (!b.quests.length) w.small(48, 30, '지금은 의뢰가 없다.', { color: C.grey });
    b.quests.forEach((q, i) => {
      const y = 30 + i * 13;
      w.small(48, y, q.text.slice(0, 20)); w.small(220, y, '×' + (3 + q.tier * 2)); w.small(262, y, q.client); w.small(320, y, fmt(q.reward), { color: C.gold });
      w.button(356, y - 1, '수락', () => { if (!g.acceptMilitary(g.selected, q.id)) ui.toast('수락 불가'); render(); }, { w: 36, h: 11, small: true });
    });
    const mine = [...g.activeMilitary.values()];
    w.small(6, 70, '— 진행 중인 토벌 —', { color: C.grey });
    if (!mine.length) w.small(6, 82, '없음', { color: C.grey });
    mine.forEach((q, i) => w.small(6, 82 + i * 11, q.text + '  →  ' + g.world.site(q.target).name + '으로 가서 공격  ' + fmt(q.reward) + '골'));
    w.small(6, w.bh - 24, '도적단은 지도에 빨간 깃발로 보인다. 그 거점에 도착하면 바로 교전. 보수는 이기면 즉시.', { color: C.grey });
  };
  render();
}

/** 부대원 편성(원작 확인: 6열 × 9칸 격자 + 하단 선택 대원 이름·HP·능력치·장비). 같은 거점의 부대끼리만 옮긴다. */
export function openRoster(ui: UIScene): void {
  const w = ui.win(460, 250, '부대원 편성');
  let picked: { s: number; id: string } | null = null;
  const render = () => {
    w.clearBody(); const g = ui.g; const here = g.squad.siteId;
    g.squads.forEach((sq, si) => {
      const x = 6 + si * 76; const same = sq.siteId === here;
      w.button(x, 2, (si + 1) + ' ' + sq.leader.name.slice(0, 3) + (same ? '' : ' (타지)'), () => { if (picked && same && picked.s !== si) { if (!g.transfer(picked.s, picked.id, si)) ui.toast('옮길 수 없다(가득 또는 다른 거점)'); picked = null; render(); } else { g.selected = si; render(); } }, { w: 72, h: 13, small: true, color: si === g.selected ? 0x6a5a2a : undefined, disabled: !same });
      for (let r = 0; r < 9; r++) {
        const p = sq.people[r]; const y = 18 + r * 15;
        if (p) w.button(x, y, (p.isLeader ? '★' : '') + p.name.slice(0, 5) + ' ' + p.stats.hp, () => { picked = picked?.id === p.id ? null : { s: si, id: p.id }; render(); }, { w: 72, h: 13, small: true, color: picked?.id === p.id ? 0x6a5a2a : p.isLeader ? 0x4a3b2a : undefined, disabled: p.isLeader || !same });
        else w.rect(x, y, 72, 13, C.panelLight, 0.3);
      }
    });
    const p = picked ? g.squads[picked.s].people.find(x => x.id === picked!.id) : undefined;
    const sq = g.squad; const f = FORMATION_BY_ID.get(sq.formation)!;
    if (p) w.small(6, 156, p.name + ' (' + p.race + ' ' + (JOB_BY_ID.get(p.job)?.name ?? p.role) + ')  ' + statLine(p) + '\n무기 ' + itemName(p.weapon) + ' · 갑옷 ' + itemName(p.armor) + ' · 약 ' + (p.potion ? itemName(p.potion) + '×' + p.potions : '-') + '   급료 ' + fmt(p.wage) + '  →  옮길 부대 번호를 누른다', { color: C.white, wordWrap: { width: 448 } });
    else w.small(6, 156, '대원을 누르고 옮길 부대 번호를 누른다. 부대장은 옮길 수 없다. (' + sq.name + ' 선택 중)', { color: C.grey });
    w.small(6, 184, '대열 ' + f.name + ' — ' + f.desc + '   태세 ' + STANCE_LABEL[sq.stance] + '   공격 ' + ATTACK_MODE_LABEL[sq.attackMode], { color: C.gold });
    FORMATIONS.forEach((fo, i) => w.button(6 + i * 56, 196, fo.name, () => { sq.formation = fo.id; render(); }, { w: 54, h: 12, small: true, color: sq.formation === fo.id ? 0x6a5a2a : undefined }));
    (['alert', 'normal', 'search'] as const).forEach((st, i) => w.button(6 + i * 56, 212, STANCE_LABEL[st], () => { sq.stance = st; render(); }, { w: 54, h: 12, small: true, color: sq.stance === st ? 0x6a5a2a : undefined }));
    (['melee', 'ranged'] as const).forEach((m, i) => w.button(200 + i * 56, 212, ATTACK_MODE_LABEL[m], () => { sq.attackMode = m; render(); }, { w: 54, h: 12, small: true, color: sq.attackMode === m ? 0x6a5a2a : undefined }));
  };
  render();
}

/** 병기 편성: 선택 부대 대원별 장비 보기·되팔기 */
export function openEquip(ui: UIScene): void {
  const w = ui.win(400, 180, '병기 편성 — ' + ui.g.squad.name);
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad;
    ['이름', '무기', '갑옷', '회복약', ''].forEach((h, i) => w.small([6, 90, 180, 270, 330][i], 2, h, { color: C.grey }));
    sq.people.forEach((p, i) => {
      const y = 14 + i * 14;
      w.small(6, y, (p.isLeader ? '★' : '') + p.name.slice(0, 6));
      w.small(90, y, itemName(p.weapon) + (p.weapon ? ' +' + WEAPON_BY_ID.get(p.weapon)!.attack : ''));
      w.small(180, y, itemName(p.armor) + (p.armor ? ' +' + ARMOR_BY_ID.get(p.armor)!.defense : ''));
      w.small(270, y, (p.potion ? itemName(p.potion) + '×' + p.potions : '-') + (p.tool ? ' · ' + itemName(p.tool) : ''));
      if (p.weapon && sq.siteId) w.button(330, y - 1, '무기 팔기', () => { g.sellItem(g.selected, p.id, 'weapon'); render(); }, { w: 34, h: 11, small: true });
      if (p.armor && sq.siteId) w.button(366, y - 1, '갑옷 팔기', () => { g.sellItem(g.selected, p.id, 'armor'); render(); }, { w: 34, h: 11, small: true });
    });
    w.small(6, w.bh - 24, '장비는 상점에서 사면 바로 장착된다. 되팔면 반값. 부대 전투력 ' + Math.round(sq.power), { color: C.grey });
  };
  render();
}

/** 상환 대화(2단계): 돈이 모자라면 호위대와 싸우거나 가산금을 받아들인다 */
export function openCollector(ui: UIScene, onFight: () => void, onDone: () => void): void {
  const g = ui.g; const v = g.collectorVisit!; const l = g.ledger;
  const w = ui.win(340, 176, '벨마르 대금고 집행관 — ' + Clock.format(g.clock.date), false);
  w.portrait(6, 6, 44, 56, 'tobias', '토비아스');
  let line: string; let color: string = C.paper;
  if (v.short) { line = '"상환액 ' + fmt(l.minRepayment) + '골이 없으시군요. 뒤에 호위대 ' + v.escortLevel + '단계가 있습니다. 싸워 이기면 이번 주는 봐 드리죠. 아니면 계약대로 가산금 ' + fmt(BALANCE.missedPenalty) + '골입니다."'; color = C.red; }
  else if (v.fought === 'victory') line = '"…졌군요. 좋습니다, 이번 주는 미룹니다. 다음엔 더 센 사람들을 데려오죠."';
  else if (v.fought) { line = '"보셨죠? 가산금 ' + fmt(v.penalty) + '골을 올립니다. 부채 ' + fmt(l.debt) + '골."'; color = C.red; }
  else if (v.paid > 0) line = '"기본상환 ' + fmt(v.paid) + '골, 확실히 받았습니다. 남은 빚은 ' + fmt(l.debt) + '골이군요. 더 내시겠습니까?"';
  else { line = '"계약대로 가산금 ' + fmt(v.penalty) + '골을 올립니다. 부채 ' + fmt(l.debt) + '골."'; color = C.red; }
  w.text(58, 6, line, { wordWrap: { width: 272 }, color });
  w.small(58, 60, '소지금 ' + fmt(l.cash) + '골  /  부채 ' + fmt(l.debt) + '골  /  미룬 횟수 ' + g.deferrals, { color: C.gold });
  if (v.short) {
    w.button(58, 76, '호위대와 싸운다 (' + g.squad.name + ')', () => { w.close(); onFight(); }, { w: 200, h: 16, color: 0x5a3a2a, disabled: !g.squad.siteId });
    w.button(58, 96, '가산금을 받아들인다 (+' + fmt(BALANCE.missedPenalty) + ')', () => { g.collectorAccept(); w.close(); onDone(); }, { w: 200, h: 16 });
    w.small(58, 116, '싸우는 부대는 지금 선택한 부대. 부대장이 쓰러지면 패배.', { color: C.grey });
    return;
  }
  BALANCE.extraRepaymentChoices.forEach((a, i) => {
    const x = 58 + (i % 4) * 68, y = 76 + Math.floor(i / 4) * 16;
    w.button(x, y, fmt(a), () => { g.repayExtra(a); w.close(); onDone(); }, { w: 64, h: 14, small: true, disabled: l.cash < a || l.debt <= 0 });
  });
  w.button(w.bw - 70, w.bh - 34, '다음에', () => { w.close(); onDone(); }, { w: 64, h: 16 });
}
