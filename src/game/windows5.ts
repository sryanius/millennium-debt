import { fmt, goodName } from '../core/game';
import { C } from './theme';
import { FULL_W } from './Window';
import type { UIScene } from './scenes/UIScene';

/** 2026-11-09 추가 창들: 시세 수첩. */

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
