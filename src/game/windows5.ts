import { fmt, goodName } from '../core/game';
import { SLOTS, clearSlot, loadSlot, saveSlot, slotInfo } from './save';
import { C } from './theme';
import { FULL_W } from './Window';
import type { UIScene } from './scenes/UIScene';

/** 2026-11-09 추가 창들: 시세 수첩·저장 칸·도움말. */

/**
 * 시세 수첩(원작의 수첩): 부대가 들른 교역소의 값을 상품별로 모아 본다.
 * 왼쪽 상품 목록 → 오른쪽에 그 상품을 사 주는 거점들(판값 비싼 순)과 적은 날, 선택 부대에서 가는 날수.
 */
export function openNotebook(ui: UIScene, good: string | null = null): void {
  const w = ui.full('시세 수첩');
  let sel = good; let off = 0; let roff = 0;
  const ROWH = 20, VIS = 9, LX = 4, LW = 120, LY = 16, RX = 130, RW = FULL_W - RX - 8, RVIS = 8;
  const render = () => {
    w.clearBody(); const g = ui.g; const sq = g.squad;
    const goods = g.notedGoods.sort((a, b) => goodName(a).localeCompare(goodName(b), 'ko'));
    if (!goods.length) { w.small(6, 6, '아직 적힌 값이 없다. 교역소가 있는 거점에 들르면 그곳 값이 자동으로 적힌다.', { color: C.grey, wordWrap: { width: 440 } }); return; }
    if (!sel || !goods.includes(sel)) sel = goods[0];
    w.small(LX + 4, 3, '상품 (' + goods.length + ')', { color: C.grey });
    off = Math.min(off, Math.max(0, goods.length - VIS));
    goods.slice(off, off + VIS).forEach((gid, k) => {
      const y = LY + k * ROWH;
      w.row(LX, y, LW - 6, ROWH - 2, gid === sel, () => { sel = gid; roff = 0; render(); }, (off + k) % 2 === 0);
      w.small(LX + 4, y + 5, goodName(gid) + ((sq.cargo[gid] ?? 0) > 0 ? ' ·' + sq.cargo[gid] : ''), { color: gid === sel ? C.white : C.paper });
    });
    w.scroll({ x: LX, y: LY, w: LW, h: VIS * ROWH, rowH: ROWH, count: goods.length, rows: VIS, get: () => off, set: v => { off = v; }, redraw: render });
    // 오른쪽: 거점별 값
    const rows = g.noteSellers(sel!);
    w.text(RX, 2, goodName(sel!), { color: C.gold });
    w.small(RX + 90, 5, '가진 것 ' + (sq.cargo[sel!] ?? 0) + ' · 값은 상업력 0 기준, 실제로는 상업력만큼 싸진다', { color: C.grey });
    const cols = [RX + 4, RX + 120, RX + 170, RX + 220, RX + 272];
    ['거점', '산값', '판값', '적은 날', '거리'].forEach((h, i) => w.small(cols[i], LY + 1, h, { color: C.grey }));
    roff = Math.min(roff, Math.max(0, rows.length - RVIS));
    rows.slice(roff, roff + RVIS).forEach((r, k) => {
      const y = LY + 12 + k * ROWH; const site = g.world.site(r.site); const eta = g.eta(g.selected, r.site); const here = sq.siteId === r.site;
      w.rect(RX, y, RW - 6, ROWH - 2, C.panelLight, (roff + k) % 2 === 0 ? 0.45 : 0.25);
      w.small(cols[0], y + 5, site.name.slice(0, 7) + '(' + (g.world.regions.get(site.region)?.name ?? '').slice(0, 2) + ')' + (here ? ' ◀' : ''), { color: here ? C.gold : C.paper });
      w.small(cols[1], y + 5, fmt(r.buy), { color: '#e2a08a' });
      w.small(cols[2], y + 5, fmt(r.sell), { color: k === 0 && roff === 0 ? '#8fd07a' : C.paper });
      w.small(cols[3], y + 5, g.day - r.day === 0 ? '오늘' : (g.day - r.day) + '일 전', { color: g.day - r.day > 14 ? C.grey : C.paperDark });
      w.small(cols[4], y + 5, here ? '여기' : eta === null ? '길 없음' : Math.ceil(eta) + '일');
      w.button(RX + RW - 54, y + 1, '보기', () => { w.close(); ui.map.focusSite(r.site); }, { w: 44, h: 18, small: true });
    });
    w.scroll({ x: RX, y: LY + 12, w: RW, h: RVIS * ROWH, rowH: ROWH, count: rows.length, rows: RVIS, get: () => roff, set: v => { roff = v; }, redraw: render });
    // 맨 아래: 지금 자리 기준 가장 남는 곳 한 줄
    const hereP = sq.siteId ? g.notebook.get(sq.siteId)?.prices[sel!] : undefined; const best = rows.find(r => r.site !== sq.siteId);
    const tip = hereP && best ? (best.sell - hereP.buy > 0 ? '여기서 ' + fmt(hereP.buy) + '에 사서 ' + g.world.site(best.site).name + '에 팔면 하나에 ' + fmt(best.sell - hereP.buy) + '골쯤 남는다(적힌 값 기준).' : '여기서 사서 적힌 곳에 팔아도 남지 않는다.') : '교역소에 서 있으면 여기 값과 견준 한 줄이 나온다.';
    w.small(6, w.bodyH - 16, tip, { color: C.gold, wordWrap: { width: 456 } });
  };
  render();
}

/** 저장 칸 3개: 칸마다 날짜·부대장·소지금·부채. 저장은 덮어쓰기 확인, 불러오기는 바로 다시 연다 */
export function openSlots(ui: UIScene): void {
  const w = ui.win(380, 170, '저장 칸');
  let confirm: { i: number; what: 'save' | 'load' | 'clear' } | null = null;
  const render = () => {
    w.clearBody(); const g = ui.g;
    w.small(6, 2, '자동 저장은 따로 돌아간다(30초마다·앱을 숨길 때). 여기는 손으로 남겨 두는 칸.', { color: C.grey, wordWrap: { width: 368 } });
    for (let i = 0; i < SLOTS; i++) {
      const y = 24 + i * 34; const info = slotInfo(i);
      w.rect(4, y, 372, 32, C.panelLight, i % 2 === 0 ? 0.45 : 0.25);
      w.small(8, y + 4, (i + 1) + '번', { color: C.gold });
      if (confirm && confirm.i === i) {
        w.small(30, y + 4, confirm.what === 'save' ? '이 칸을 덮어쓸까?' : confirm.what === 'load' ? '지금 판을 버리고 이 칸을 불러올까? (자동 저장도 이 칸으로 바뀐다)' : '이 칸을 지울까?', { color: C.red, wordWrap: { width: 230 } });
        w.button(268, y + 5, '예', () => { if (confirm!.what === 'save') { ui.toast(saveSlot(g, i) ? '저장했다.' : '저장 실패(전투 중?)'); } else if (confirm!.what === 'load') { if (!loadSlot(i)) ui.toast('불러오기 실패'); return; } else clearSlot(i); confirm = null; render(); }, { w: 48, h: 22, color: 0x5a3a2a });
        w.button(322, y + 5, '아니오', () => { confirm = null; render(); }, { w: 50, h: 22 });
        continue;
      }
      if (info) {
        w.small(30, y + 4, info.date + ' · ' + info.leader.split(' ')[0] + ' 부대 · 소지 ' + fmt(info.cash) + '골', { color: C.paper });
        w.small(30, y + 16, '부채 ' + fmt(info.debt) + '골' + (info.savedAt ? ' · ' + new Date(info.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''), { color: C.grey });
        w.button(214, y + 5, '저장', () => { confirm = { i, what: 'save' }; render(); }, { w: 48, h: 22 });
        w.button(268, y + 5, '불러오기', () => { confirm = { i, what: 'load' }; render(); }, { w: 64, h: 22 });
        w.button(338, y + 5, '×', () => { confirm = { i, what: 'clear' }; render(); }, { w: 34, h: 22, color: 0x5a3a2a });
      } else {
        w.small(30, y + 10, '비어 있음', { color: C.grey });
        w.button(214, y + 5, '여기에 저장', () => { ui.toast(saveSlot(g, i) ? '저장했다.' : '저장 실패(전투 중?)'); render(); }, { w: 118, h: 22 });
      }
    }
  };
  render();
}

/** 도움말: 규칙을 한 장씩. 튜토리얼이 다루지 않는 집행관·공성·대열·급료 등 */
const HELP: { title: string; body: string }[] = [
  { title: '목표와 상환', body: '아버지가 남긴 빚 1,000만 골을 다 갚으면 끝. 매달 7·14·21·28일에 집행관 토비아스가 와서 최소 5,000골을 가져간다(소지금에서 저절로). 그때 «추가로 갚기»로 더 낼 수 있다.\n\n돈이 없으면 둘 중 하나: 호위대와 싸워 이기면 이번 주는 미뤄진다(다음 호위대는 더 세다). 지거나 받아들이면 가산금 100,000골이 빚에 붙는다.\n\n연속 6번 못 갚으면 계약이 끊기고 용병단은 해산(나쁜 결말). 2번 남았을 때부터 경고가 온다.' },
  { title: '돈 버는 다섯 길', body: '전투: 군사게시판 토벌 의뢰, 떠돌이 도적, 잿빛 교단 점령지 탈환(보수 큼).\n교역: 교역소에서 특산품을 싸게 사서 먼 지역에 판다. 시세 수첩에 들른 곳 값이 적힌다. 상업력이 높으면 사는 값·파는 값이 모두 내린다.\n공연: 술집에서 공연력(공연 합계 + 악기)이 손님 눈높이를 넘으면 돈이 모인다. 모자라면 야유와 위약금.\n건축: 건축 길드의 보수·증축 공사. 건축력(건축 합계 + 해머) 만큼 날마다 진행.\n민사: 민사게시판의 편지·소포·서류·총호송 배달. 기한을 넘기면 보수 절반.\n\n가장 많이 번 길이 결말을 정한다.' },
  { title: '부대와 대원', body: '부대장 6명은 성을 돌다 보면 합류한다(샹파르·오르블랑·발리스·리보른·세인트 아르노). 부대마다 대원 8명까지. 계약소에서 고용하고, 급료는 매달 1일에 한꺼번에 나간다. 못 주면 장비 든 대원이 도망간다.\n\n대원은 전투마다 경험 +1, 처치마다 +2. 단계가 오르면 공격·방어 +1, 체력 +2. 해고하면 고용비를 그대로 돌려받는다.\n\n피로는 행군에 쌓이고 성에서 쉬면 준다. 피로가 높으면 명중이 떨어진다. 병원에서 돈 주고 한 번에 고친다.' },
  { title: '전투와 대열', body: '적이 있는 거점에 들어가면 자동 전투. 전장을 누르면 멈추고 명령창: 전투명령(대열·공격 방식), 전체퇴각, 개별퇴각.\n\n대열은 8종. 그림의 왼쪽(빨간 화살표)이 적 쪽. 백병은 앞, 사격은 뒤에 서야 한다 — 편성 창의 «자동 배치»나 대열을 바꾸면 저절로. 쐐기·포위는 공격 +, 방진·수비는 방어 +, 궁수 후열은 사격 명중 +.\n\n공격 방식 «사격»이면 사격 대원이 자리를 지키고 쏜다. 부대장이 쓰러지면 부대 전체가 퇴각한다(부대장은 죽지 않는다). 대원은 체력 0이면 죽는다. 회복약은 체력 35% 밑이면 저절로 쓴다.' },
  { title: '잿빛 교단과 공성', body: '제국력 1000년 2월 하이펠트에서 잿빛 교단이 봉기한다. 점령지(빨간 깃발)에서 전투단이 나와 가까운 요새를 친다. 내구가 0이 되면 함락되고 길이 막힌다. 달마다 영주들이 일부를 되찾는다.\n\n부대를 점령지로 보내면 공성전. 전투명령에서 «공성»을 고르면 성벽에 피해 ×3. 성벽이 선 동안 수비대는 방어 ×1.5 이고 사수가 성벽 뒤에서 쏜다. 탈환하면 성 150,000골, 요충지 40,000골.\n\n상한 요새는 건축 길드에 보수 공사가 생긴다.' },
  { title: '지도와 이동', body: '거점을 누르면 이동(예상 일수). 지도는 끌어서 움직이고 두 손가락으로 확대. 왼쪽 위 축소 지도를 누르면 그 지역으로, «세계 지도»로 전체.\n\n처음엔 드워프 산문·엘프 숲·남동 군도가 막혀 있다. 두린이 철산 대문에, 혼혈·엘프가 안개 관문에, 아무나 남쪽 항구에 가면 여는 사건이 생긴다. 항구끼리는 배로 간다(뱃삯 1인당 40골). 사막은 행군 피로 두 배.\n\n아래 부대 칸: 한 번 누르면 고르고 지도가 그 부대로, 다시 누르면 부대 정보.' },
  { title: '저장', body: '자동 저장: 30초마다, 앱을 뒤로 보낼 때. 전투 중에는 저장하지 않는다.\n⚙ → «저장 칸»에 손으로 3개까지 남길 수 있다. 불러오면 지금 판을 버리고 그 칸으로 돌아간다(자동 저장도 그 칸으로 바뀐다).\n«새 게임»은 자동 저장을 지운다(저장 칸은 남는다).' },
];
export function openHelp(ui: UIScene): void {
  const w = ui.full('도움말');
  let page = 0;
  const render = () => {
    w.clearBody();
    HELP.forEach((h, i) => w.button(4 + (i % 4) * 116, Math.floor(i / 4) * 24, h.title, () => { page = i; render(); }, { w: 112, h: 22, small: true, selected: i === page }));
    const h = HELP[page];
    w.text(6, 52, h.title, { color: C.gold });
    w.small(6, 68, h.body, { color: C.paper, wordWrap: { width: 456 }, lineSpacing: 2 });
  };
  render();
}
