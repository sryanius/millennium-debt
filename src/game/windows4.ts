import { BALANCE } from '../core/balance';
import { GameClock as Clock } from '../core/clock';
import { ENDING_POEM, EPILOGUES } from '../core/events';
import { fmt } from '../core/game';
import { INCOME_LABEL, INCOME_SOURCES } from '../core/ledger';
import { clearSave } from './save';
import { C } from './theme';
import type { UIScene } from './scenes/UIScene';

/** 4·5단계 창: 이벤트 대화, 엔딩 카드(부대장마다 1장 + 시). */

/** 대화·소식 창(GDD §7.1.1: 좌상 초상 + 2~3줄 대사). 선택지는 아래. */
export function openEvent(ui: UIScene): void {
  const g = ui.g; const e = g.event; if (!e) return;
  const h = 150 + Math.min(3, Math.max(0, e.choices.length - 2)) * 18;
  const w = ui.win(360, h, e.title, false);
  w.rect(6, 6, 48, 56, C.panelLight); w.small(8, 26, e.portrait.slice(0, 7), { color: C.grey, wordWrap: { width: 44 } });
  w.text(62, 6, e.text, { wordWrap: { width: 290 } });
  e.choices.forEach((c, i) => {
    const y = h - 30 - (e.choices.length - 1 - i) * 18;
    w.button(62, y, c.label + (c.disabled ? '  — ' + c.disabled : ''), () => { w.close(); g.chooseEvent(i); }, { w: 290, h: 15, small: true, disabled: !!c.disabled });
  });
}

/** 엔딩 카드(GDD §7.1.1): 돈 내역 7줄 + 부대장 6장(이름·부대명·후일담·전신 일러스트 자리) + 마지막 시 */
export function openEnding(ui: UIScene): void {
  const g = ui.g; const l = g.ledger; const ending = g.ending!; let page = 0; // 0 = 결산, 1~6 = 부대장, 7 = 시
  const w = ui.win(380, 230, '완납 — ' + INCOME_LABEL[ending] + ' 엔딩', false);
  const render = () => {
    w.clearBody();
    if (page === 0) {
      w.text(6, 4, '제국력 ' + Clock.format(g.clock.date) + ', 빚 ' + fmt(BALANCE.startDebt) + '골을 모두 갚았다.', { color: C.gold });
      w.small(6, 22, '쓴 돈', { color: C.grey });
      w.small(6, 32, '장비에 쓴 돈  ' + fmt(l.spent.equipment)); w.small(6, 42, '급료에 쓴 돈  ' + fmt(l.spent.wages)); w.small(6, 52, '상품 매입  ' + fmt(l.spent.goods) + '   기타 ' + fmt(l.spent.other));
      w.small(6, 66, '번 돈', { color: C.grey });
      INCOME_SOURCES.forEach((s, i) => w.small(6, 76 + i * 10, INCOME_LABEL[s] + '으로 번 돈  ' + fmt(l.earned[s]), { color: s === ending ? C.gold : C.paper }));
      w.small(6, 130, '미룬 상환 ' + g.deferrals + '회 · 미납 ' + l.missed + '회 · 탈환한 점령지 ' + (9 - g.enemyHeld.size) + '곳 · 이벤트 ' + g.firedEvents.size + '건', { color: C.paperDark });
      w.rect(240, 22, 130, 110, C.panelLight); w.small(262, 70, '여섯 부대장\n단체 그림', { color: C.grey });
    } else if (page <= 6) {
      const sq = g.squads[page - 1]; const lead = sq.leader;
      w.text(6, 4, lead.name + ' — ' + sq.name, { color: C.gold });
      w.small(6, 18, lead.race + ' · ' + lead.role + ' · E ' + lead.stats.e + ' · 대원 ' + sq.members.length, { color: C.grey });
      w.text(6, 34, EPILOGUES[lead.id]?.[ending] ?? '…', { wordWrap: { width: 220 } });
      w.rect(240, 4, 130, 180, C.panelLight); w.small(262, 86, '전신 일러스트\n(6단계)', { color: C.grey });
    } else {
      w.text(60, 20, ENDING_POEM, { color: C.white, align: 'center', wordWrap: { width: 260 } });
      w.small(6, 150, '— 끝. 플레이해 주셔서 고맙습니다. (가칭 《천 년의 빚》 · 《균열의 시대》 세계관) —', { color: C.grey });
    }
    if (page > 0) w.button(6, w.bh - 32, '이전', () => { page--; render(); }, { w: 50, h: 14 });
    if (page < 7) w.button(w.bw - 56, w.bh - 32, '다음', () => { page++; render(); }, { w: 50, h: 14 });
    else w.button(w.bw - 100, w.bh - 32, '새 게임', () => { clearSave(); location.reload(); }, { w: 94, h: 14 });
    w.small(150, w.bh - 29, (page === 0 ? '결산' : page <= 6 ? '후일담 ' + page + '/6' : '시'), { color: C.grey });
  };
  render();
}
