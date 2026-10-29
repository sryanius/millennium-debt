import { BALANCE } from '../core/balance';
import { fmt } from '../core/game';
import { fortMax, isFort } from '../core/world';
import { C } from './theme';
import type { UIScene } from './scenes/UIScene';

/** 3단계 창들: 술집(소문·공연), 건축, 요새 보고. */

/** 술집(원작: 소문·공연·임무). 임무는 5단계 이벤트에서. */
export function openTavern(ui: UIScene, siteId: string): void {
  const w = ui.win(340, 170, ui.g.world.site(siteId).name + ' 술집');
  let line = '"어서 오게. 소문을 듣겠나, 한 곡 뽑겠나?"'; let color: string = C.paperDark;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const site = g.world.site(siteId);
    w.rect(6, 4, 40, 48, C.panelLight); w.small(10, 22, '술집\n주인', { color: C.grey });
    w.text(52, 4, line, { wordWrap: { width: 280 }, color });
    const can = g.canPerform(g.selected); const need = site.size * BALANCE.showFailPowerPerSize;
    w.small(52, 52, sq.name + ' 공연력 ' + sq.performSkill + '  /  이 술집 손님 눈높이 ' + need + '  /  실패 위약금 ' + fmt(site.size * BALANCE.showFailPenaltyPerSize), { color: sq.performSkill >= need ? C.gold : C.red, wordWrap: { width: 280 } });
    w.button(6, 76, '소문을 듣는다', () => { line = g.rumor(siteId); color = C.paper; render(); }, { w: 100, h: 16 });
    w.button(110, 76, '공연한다', () => { const r = g.perform(g.selected); if (r) { line = '"' + r.text + '"'; color = r.ok ? C.gold : C.red; } render(); }, { w: 100, h: 16, disabled: !can.ok });
    w.button(214, 76, '임무를 찾는다', () => { if (g.tavernQuest(g.selected)) w.close(); else { line = '"지금은 특별한 일거리가 없네. 게시판을 보게."'; color = C.paperDark; render(); } }, { w: 100, h: 16 });
    if (!can.ok) w.small(6, 98, '공연 불가: ' + can.reason, { color: C.grey });
    w.small(6, w.bh - 40, '공연력은 P 합계 + 악기·드레스(도구점). 공연력이 눈높이보다 낮으면 야유와 위약금(원작). 같은 술집은 ' + BALANCE.showCooldownDays + '일에 한 번.', { color: C.grey, wordWrap: { width: 328 } });
  };
  render();
}

/** 건축(GDD §8: 요새 보수 1만 → 성벽 증축 10만). 작업은 부대가 그 자리에 머물며 날마다 건축력만큼 진행. */
export function openBuild(ui: UIScene, siteId: string): void {
  const w = ui.win(400, 180, ui.g.world.site(siteId).name + ' 건축 길드');
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad; const jobs = g.buildJobsAt(siteId) ?? [];
    w.rect(6, 4, 36, 36, C.panelLight); w.small(10, 16, '길드장', { color: C.grey });
    w.small(48, 4, '"' + sq.name + ' 건축력 ' + sq.buildSkill + '/일. 맡기면 그 자리에서 끝날 때까지 일한다."', { color: C.paperDark, wordWrap: { width: 340 } });
    ['공사', '장소', '작업량(예상 일수)', '보수', ''].forEach((h, i) => w.small([48, 170, 230, 320, 356][i], 24, h, { color: C.grey }));
    if (!jobs.length) w.small(48, 36, '지금은 공사가 없다.', { color: C.grey });
    jobs.slice(0, 5).forEach((j, i) => {
      const y = 36 + i * 13; const days = sq.buildSkill > 0 ? Math.ceil(j.work / sq.buildSkill) : 0;
      w.small(48, y, j.name.slice(0, 14)); w.small(170, y, g.world.site(j.site).name.slice(0, 6)); w.small(230, y, Math.round(j.work) + (days ? ' (' + days + '일)' : ' (-)')); w.small(320, y, fmt(j.reward), { color: C.gold });
      w.button(356, y - 1, '맡는다', () => { const r = g.acceptBuild(g.selected, siteId, j.id); if (!r.ok) ui.toast(r.reason ?? ''); else w.close(); }, { w: 38, h: 11, small: true, disabled: sq.buildSkill <= 0 || !!sq.work });
    });
    const working = g.squads.filter(s => s.work);
    w.small(6, 106, '— 진행 중 —', { color: C.grey });
    if (!working.length) w.small(6, 118, '없음', { color: C.grey });
    working.forEach((s, i) => { w.small(6, 118 + i * 11, s.name + ': ' + s.work!.name + ' ' + Math.min(100, Math.round(s.work!.progress / s.work!.work * 100)) + '%  (' + (s.order === 'build' ? '작업 중' : '이동 중') + ')'); if (s === sq) w.button(300, 117 + i * 11, '그만둔다', () => { g.cancelBuild(g.selected); render(); }, { w: 60, h: 11, small: true, color: 0x5a3a2a }); });
    w.small(6, w.bh - 24, '요새가 상하면(잿빛 교단의 공격) 보수 공사가 생긴다. 건축력은 B 합계 + 해머·곡괭이(도구점).', { color: C.grey });
  };
  render();
}

/** 요새 보고(원작: 좌상 요새 그림 창 + 한 줄 보고). 점령지·내구·최근 보고 목록. */
export function openForts(ui: UIScene): void {
  const g = ui.g; const w = ui.win(400, 190, '요새 보고');
  w.rect(6, 4, 60, 44, C.panelLight); w.small(14, 20, '요새 그림', { color: C.grey });
  const last = g.reports[g.reports.length - 1];
  w.text(72, 4, last ? last.attacker + '이(가) ' + g.world.site(last.site).name + '을(를) 공격, ' + last.damage + '의 피해.' : '최근 공격 보고가 없다.', { wordWrap: { width: 320 } });
  if (last) w.small(72, 30, g.world.site(last.site).name + ' 내구 ' + last.durability + '/' + fortMax(g.world.site(last.site)), { color: last.durability < 30 ? C.red : C.gold });
  const held = [...g.enemyHeld].map(id => g.world.site(id));
  w.small(6, 54, '잿빛 교단 점령지 ' + held.length + '곳: ' + held.map(s => s.name).join(', '), { color: C.red, wordWrap: { width: 388 } });
  const damaged = [...g.world.sites.values()].filter(s => isFort(s) && !g.enemyHeld.has(s.id) && g.fortDurability(s.id) < fortMax(s));
  w.small(6, 80, '상한 요새: ' + (damaged.length ? damaged.map(s => s.name + ' ' + g.fortDurability(s.id) + '/' + fortMax(s)).join(', ') : '없음'), { color: C.paperDark, wordWrap: { width: 388 } });
  const bands = g.bands.filter(b => b.kind === 'rebel');
  w.small(6, 106, '움직이는 전투단: ' + (bands.length ? bands.map(b => b.name + ' → ' + (b.target ? g.world.site(b.target).name : '?') + '(' + g.world.site(b.site).name + ')').join(', ') : '없음'), { color: C.paperDark, wordWrap: { width: 388 } });
  w.small(6, w.bh - 36, '점령지는 지나갈 수 없다. 부대를 점령지로 보내면 공성전(전투명령 → 공성). 탈환 보수: 성 ' + fmt(BALANCE.liberateRewardCastle) + ', 요충지 ' + fmt(BALANCE.liberateRewardMinor) + '.', { color: C.grey, wordWrap: { width: 388 } });
}
