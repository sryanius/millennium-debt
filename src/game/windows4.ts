import { BALANCE } from '../core/balance';
import { GameClock as Clock } from '../core/clock';
import { ENDING_POEM, EPILOGUES } from '../core/events';
import { fmt } from '../core/game';
import { INCOME_LABEL, INCOME_SOURCES } from '../core/ledger';
import { startNewGame } from './save';
import { C, TEXT, portraitKey } from './theme';
import { FULL_H } from './Window';
import type { UIScene } from './scenes/UIScene';

/** 4·5단계 창: 이벤트 대화, 엔딩 카드(부대장마다 1장 + 시). */

/** 대화·소식 창(GDD §7.1.1: 좌상 초상 + 2~3줄 대사). 선택지는 아래. */
export function openEvent(ui: UIScene): void {
  const g = ui.g; const e = g.event; if (!e) return;
  // 본문 높이를 재서 창 높이를 정한다(선택지는 손가락으로 누를 수 있게 24 + 틈 4)
  const probe = ui.make.text({ text: e.text, style: { ...TEXT, wordWrap: { width: 300 } }, add: false }); const th = probe.height; probe.destroy();
  const n = e.choices.length; const h = Math.min(FULL_H, Math.max(150, 18 + 8 + Math.max(60, th) + 8 + n * 28 + 8));
  const w = ui.win(380, h, e.title, false);
  w.portrait(6, 6, 48, 56, portraitKey(e.portrait), e.portrait.slice(0, 7));
  w.text(62, 6, e.text, { wordWrap: { width: 300 } });
  e.choices.forEach((c, i) => {
    const y = w.bodyH - 6 - (n - i) * 28;
    w.button(62, y, c.label + (c.disabled ? '  — ' + c.disabled : ''), () => { w.close(); g.chooseEvent(i); }, { w: 306, h: 24, small: true, disabled: !!c.disabled });
  });
}

/** 엔딩 카드(GDD §7.1.1): 돈 내역 7줄 + 부대장 6장(이름·부대명·후일담·전신 일러스트 자리) + 마지막 시 */
export function openEnding(ui: UIScene): void {
  const g = ui.g; const l = g.ledger; const ending = g.ending!; let page = 0; // 0 = 결산, 1~6 = 부대장, 7 = 시
  const w = ui.win(390, 246, '완납 — ' + INCOME_LABEL[ending] + ' 엔딩', false);
  const render = () => {
    w.clearBody();
    if (page === 0) {
      w.text(6, 4, '제국력 ' + Clock.format(g.clock.date) + ', 빚 ' + fmt(BALANCE.startDebt) + '골을 모두 갚았다.', { color: C.gold });
      w.small(6, 22, '쓴 돈', { color: C.grey });
      w.small(6, 32, '장비에 쓴 돈  ' + fmt(l.spent.equipment)); w.small(6, 42, '급료에 쓴 돈  ' + fmt(l.spent.wages)); w.small(6, 52, '상품 매입  ' + fmt(l.spent.goods) + '   기타 ' + fmt(l.spent.other));
      w.small(6, 66, '번 돈', { color: C.grey });
      INCOME_SOURCES.forEach((s, i) => w.small(6, 76 + i * 10, INCOME_LABEL[s] + '으로 번 돈  ' + fmt(l.earned[s]), { color: s === ending ? C.gold : C.paper }));
      w.small(6, 130, '미룬 상환 ' + g.deferrals + '회 · 미납 ' + l.missed + '회 · 탈환한 점령지 ' + (9 - g.enemyHeld.size) + '곳 · 이벤트 ' + g.firedEvents.size + '건', { color: C.paperDark });
      ['kael', 'brok', 'phoebe', 'ella', 'liesel', 'durin'].forEach((k, i) => w.portrait(240 + (i % 3) * 44, 22 + Math.floor(i / 3) * 56, 42, 52, k, k));
    } else if (page <= 6) {
      const sq = g.squads[page - 1]; const lead = sq.leader;
      w.text(6, 4, lead.name + ' — ' + sq.name, { color: C.gold });
      w.small(6, 18, lead.race + ' · ' + lead.role + ' · E ' + lead.stats.e + ' · 대원 ' + sq.members.length, { color: C.grey });
      w.text(6, 34, EPILOGUES[lead.id]?.[ending] ?? '…', { wordWrap: { width: 220 } });
      w.portrait(240, 4, 130, 180, sq.id, lead.name);
    } else {
      w.text(60, 20, ENDING_POEM, { color: C.white, align: 'center', wordWrap: { width: 260 } });
      w.small(6, 150, '— 끝. 플레이해 주셔서 고맙습니다. (가칭 《천 년의 빚》 · 《균열의 시대》 세계관) —', { color: C.grey });
    }
    if (page > 0) w.button(6, w.bodyH - 30, '이전', () => { page--; render(); }, { w: 70, h: 24 });
    if (page < 7) w.button(w.bw - 86, w.bodyH - 30, '다음', () => { page++; render(); }, { w: 70, h: 24 });
    else w.button(w.bw - 112, w.bodyH - 30, '새 게임', () => startNewGame(), { w: 96, h: 24 });
    w.small(160, w.bodyH - 24, (page === 0 ? '결산' : page <= 6 ? '후일담 ' + page + '/6' : '시'), { color: C.grey });
  };
  render();
}
