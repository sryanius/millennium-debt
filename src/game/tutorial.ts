import Phaser from 'phaser';
import { BALANCE } from '../core/balance';
import { fmt } from '../core/game';
import { START_SITE } from '../core/game';
import { C, H, K, TEXT_SMALL, W } from './theme';
import { makeButton } from './Window';
import type { UIScene } from './scenes/UIScene';

/**
 * 처음 하는 사람을 위한 안내(2026-11-08, 사용자: «어디 있는지도, 뭘 해야 할지도 모르겠다»).
 * 위쪽 소식 줄 자리에 안내 상자, 눌러야 할 곳에 튀는 화살표. 단계는 game.tutorial 에 저장된다.
 * 앞 단계(성 누르기 → 고용 → 의뢰 맡기)까지는 시간을 멈춰 둔다.
 */
/** side: 목록 줄처럼 위아래가 붙은 단추는 오른쪽에서 왼쪽으로 가리킨다(x 는 단추 오른쪽 끝) */
type Pt = { x: number; y: number; side?: boolean } | null;
interface Step {
  text: (t: Tutorial) => string;
  /** 화살표가 가리킬 곳(설계 좌표). null 이면 화살표 없음 */
  target?: (t: Tutorial) => Pt;
  /** 다 했는지(참이면 다음 단계로) */
  done?: (t: Tutorial) => boolean;
  /** «다음» 단추로 넘기는 단계 */
  next?: string;
  /** 이 단계 동안 시간을 멈춘다 */
  hold?: boolean;
  /** 단계에 들어설 때 한 번 */
  enter?: (t: Tutorial) => void;
}

export const TUTORIAL_DONE = 99;

export class Tutorial {
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private nextBtn: Phaser.GameObjects.Container | null = null;
  private skipBtn: Phaser.GameObjects.Container;
  private arrow: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private shown = -2;
  private enteredAt = 0;
  /** 단계 시작 때 대원 수(고용했는지 보려고) */
  members0 = 0;
  focused = false;
  private x0: number; private bw: number;

  constructor(readonly ui: UIScene, left: number, right: number) {
    this.x0 = left; this.bw = right - left;
    this.box = ui.add.container(this.x0, 2).setDepth(250);
    this.bg = ui.add.rectangle(0, 0, this.bw, 30, 0x1a140e, 0.96).setOrigin(0).setStrokeStyle(1, 0xe0b23c);
    this.bg.setInteractive(); this.bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    this.label = ui.add.text(5, 3, '', { ...TEXT_SMALL, color: C.white, wordWrap: { width: this.bw - 56 }, lineSpacing: 1 });
    this.skipBtn = makeButton(ui, this.bw - 47, 3, '건너뛰기', () => this.finish(), { w: 44, h: 11, small: true, color: 0x3a3028 });
    this.box.add([this.bg, this.label, this.skipBtn]);
    this.arrow = ui.add.graphics().setDepth(260);
    this.ring = ui.add.graphics().setDepth(259);
  }

  get g() { return this.ui.g; }
  get step(): number { return this.g.tutorial; }
  get active(): boolean { return this.step >= 0 && this.step < STEPS.length; }
  get modalTitle(): string { return this.ui.modal?.titleStr ?? ''; }
  get startName(): string { return this.g.world.site(START_SITE).name; }

  /** 지도 좌표 → 화면(설계) 좌표 */
  fromMap(x: number, y: number): Pt {
    const cam = this.ui.map.cameras.main; const v = cam.worldView;
    return { x: (x - v.x) * cam.zoom / K, y: (y - v.y) * cam.zoom / K };
  }
  /** 거점 그림 가운데(그림은 거점 점보다 6px 위) */
  site(id: string): Pt { const s = this.g.world.site(id); const p = this.fromMap(s.x, s.y)!; return { x: p.x, y: p.y - 6 }; }
  /** 열린 창 안의 점(창 본문 좌표) */
  inModal(x: number, y: number): Pt {
    const m = this.ui.modal; if (!m) return null;
    return { x: m.x + 2 + x, y: m.y + 15 + y };
  }
  menuItem(i: number): Pt { const m = this.ui.modal; return m ? this.inModal(m.bw / 2 - 2, 4 + i * 16 + 7) : null; }
  /** 닫기(×) 단추. 이벤트 창처럼 × 가 없으면 화살표를 안 띄운다 */
  closeBtn(): Pt { const m = this.ui.modal; return m && m.closable ? { x: m.x + m.bw - 9, y: m.y + 8 } : null; }
  /** 게시판에서 가장 가까운(이동일이 짧은) 의뢰 줄 */
  nearestQuestRow(): number { const b = this.g.board(START_SITE); if (!b || !b.quests.length) return 0; let bi = 0; b.quests.forEach((q, i) => { if (q.travelDays < b.quests[bi].travelDays) bi = i; }); return bi; }

  go(n: number): void {
    const wasHold = !!STEPS[this.g.tutorial]?.hold;
    this.g.tutorial = n; this.enteredAt = this.ui.time.now;
    if (wasHold && !STEPS[n]?.hold && !this.ui.modal && this.g.clock.speed === 0) this.g.clock.speed = 1; // 멈춰 둔 시간을 다시 흐르게
    STEPS[n]?.enter?.(this);
  }
  finish(): void {
    this.g.tutorial = TUTORIAL_DONE;
    if (!this.ui.modal && this.g.clock.speed === 0) this.g.clock.speed = 1;
  }

  update(time: number): void {
    const on = this.active && !this.g.ending && !this.g.battle && !(this.ui.modal && this.modalTitle.includes('제국력'));
    this.box.setVisible(on); this.ui.setTickerVisible(!on);
    if (!on) { this.arrow.clear(); this.ring.clear(); this.shown = -2; return; }
    const st = STEPS[this.step];
    if (this.shown !== this.step) {
      this.shown = this.step;
      this.label.setText(st.text(this));
      this.nextBtn?.destroy(); this.nextBtn = null;
      if (st.next) { this.nextBtn = makeButton(this.ui, this.bw - 47, 16, st.next, () => this.go(this.step + 1 >= STEPS.length ? TUTORIAL_DONE : this.step + 1), { w: 44, h: 12, small: true, color: 0x6a5020 }); this.box.add(this.nextBtn); }
      const h = Math.max(30, this.label.height + 7); this.bg.height = h; this.bg.setSize(this.bw, h);
    } else {
      const t = st.text(this); if (t !== this.label.text) this.label.setText(t); // 목적지 이름처럼 바뀌는 글
    }
    // 창이 위쪽까지 덮으면 상자를 아래로
    const m = this.ui.modal; const low = !!m && m.y < 40;
    this.box.setY(low ? H - this.bg.height - 2 : 2);
    // 다 했는지 먼저 본다(시간 멈춤을 먼저 걸면 출발한 순간 다시 멈춰 버렸다)
    if (st.done && time - this.enteredAt > 250 && st.done(this)) { this.go(this.step + 1); return; }
    if (st.hold && !this.ui.modal && this.g.clock.speed !== 0) this.g.clock.speed = 0;
    // 화살표
    this.arrow.clear(); this.ring.clear();
    const p = st.target?.(this) ?? null;
    if (!p) return;
    const inside = p.x > -4 && p.x < W + 4 && p.y > -4 && p.y < H + 4;
    const x = Phaser.Math.Clamp(p.x, 8, W - 8), y = Phaser.Math.Clamp(p.y, 8, H - 8);
    const bob = Math.sin(time / 160) * 2.5;
    if (p.side) { // ◀ 모양
      const tx = x + 2 + bob;
      this.arrow.fillStyle(0x1a1c2c, 1).fillTriangle(tx + 9, y - 6, tx + 9, y + 6, tx - 1, y);
      this.arrow.fillStyle(0xffd65a, 1).fillTriangle(tx + 8, y - 4.5, tx + 8, y + 4.5, tx, y);
      this.arrow.fillStyle(0xffd65a, 1).fillRect(tx + 8, y - 1.5, 6, 3);
      return;
    }
    const up = y < 46; // 위쪽이면 아래에서 위로 가리킨다
    const ty = up ? y + 7 + bob : y - 7 - bob;
    this.arrow.fillStyle(0x1a1c2c, 1).fillTriangle(x - 6, ty + (up ? 9 : -9), x + 6, ty + (up ? 9 : -9), x, ty + (up ? -1 : 1));
    this.arrow.fillStyle(0xffd65a, 1).fillTriangle(x - 4.5, ty + (up ? 8 : -8), x + 4.5, ty + (up ? 8 : -8), x, ty);
    this.arrow.fillStyle(0xffd65a, 1).fillRect(x - 1.5, up ? ty + 8 : ty - 14, 3, 6);
    if (inside) { const r = 6 + (time / 120 % 6); this.ring.lineStyle(1, 0xffd65a, 1 - (r - 6) / 6).strokeCircle(p.x, p.y, r); }
  }
}

const atCastleWindow = (t: Tutorial) => t.modalTitle.startsWith(t.startName + ' (');

const STEPS: Step[] = [
  { // 0
    text: t => '이 사람이 카엘, 바로 당신이에요. 지금 ' + t.startName + ' 성에 있어요. 아래 칸에도 카엘이 보여요.',
    target: t => { const sq = t.g.squads[0]; const w = sq.position(id => t.g.world.site(id)); const p = t.fromMap(w.x, w.y)!; return { x: p.x - 11, y: p.y - 6 }; }, // 부대 표식은 거점 왼쪽 아래(MapScene)
    next: '다음', hold: true,
    enter: t => t.ui.map.focusSquad(0),
  },
  { // 1
    text: t => t.startName + ' 성을 눌러 보세요. 성에서 용병을 고용하고 일을 얻어요.',
    target: t => t.ui.modal ? t.closeBtn() : t.site(START_SITE),
    done: atCastleWindow, hold: true,
  },
  { // 2
    text: () => '맨 위 «용병 고용 (계약소)»를 누르세요. 혼자서는 도적도 못 이겨요.',
    target: t => atCastleWindow(t) ? t.menuItem(0) : t.ui.modal ? t.closeBtn() : t.site(START_SITE),
    done: t => t.modalTitle.endsWith('계약소'),
    hold: true,
  },
  { // 3
    text: () => '«고용»을 눌러 용병을 한 명 뽑으세요. 고용비는 한 번, 급료는 매달 1일에 나가요.',
    target: t => t.modalTitle.endsWith('계약소') ? { ...t.inModal(321, 44)!, side: true } : t.ui.modal ? t.closeBtn() : t.site(START_SITE),
    done: t => t.g.squads[0].members.length > t.members0,
    hold: true,
    enter: t => { t.members0 = t.g.squads[0].members.length; },
  },
  { // 4
    text: t => t.modalTitle.endsWith('민사 게시판') ? '화살표가 가리키는 «수락»을 눌러 의뢰를 맡으세요. 가장 가까운 곳에 가는 일이에요.' : '잘했어요! 이제 돈을 벌 차례예요. 창을 닫고 성을 다시 눌러 «민사게시판»에서 의뢰를 하나 «수락»하세요.',
    target: t => {
      if (t.modalTitle.endsWith('민사 게시판')) { const q = t.inModal(381, 34 + t.nearestQuestRow() * 13); return q && { ...q, side: true }; }
      if (atCastleWindow(t)) return t.menuItem(8);
      if (t.ui.modal) return t.closeBtn();
      return t.site(START_SITE);
    },
    done: t => t.g.squads[0].quests.length > 0,
    hold: true,
  },
  { // 5
    text: t => {
      const q = questOf(t); const name = q ? t.g.world.site(q.to).name : '';
      if (q && t.g.enemyHeld.has(q.to)) return '목적지 ' + ga(name) + ' 잿빛 교단에 넘어갔어요! 지금은 위험해요. 지도에서 가까운 다른 성을 눌러 «이동»해 보세요.';
      return '의뢰를 맡았어요. 목적지 ' + ro(name) + ' 가면 보수를 받아요. ' + (t.ui.modal ? '창을 닫고 지도에서 그 거점을 눌러 «이동»하세요.' : '화살표가 가리키는 거점을 눌러 «이동»하세요.');
    },
    target: t => {
      const q = questOf(t); if (!q) return null;
      if (t.g.enemyHeld.has(q.to)) return t.ui.modal ? (t.modalTitle.includes(' (') && !t.modalTitle.startsWith(t.startName + ' (') ? t.menuItem(0) : t.closeBtn()) : null;
      const dest = t.g.world.site(q.to);
      if (t.modalTitle.startsWith(dest.name + ' (')) return t.menuItem(0);
      if (t.ui.modal) return t.closeBtn();
      if (!t.focused) { t.focused = true; t.ui.map.focusSite(q.to); } // 창을 닫으면 목적지로 지도를 옮긴다
      return t.site(q.to);
    },
    done: t => t.g.squads[0].order === 'move',
    hold: true, // 출발 전까지 시간을 멈춘다(그새 사건이 터져 목적지가 함락되기도 했다)
    enter: t => { t.focused = false; },
  },
  { // 6
    text: () => '출발! 이동하는 동안 시간이 흘러요. 오른쪽 위 ▶ 단추를 누를 때마다 빨라지고, 한 바퀴 돌면 멈춰요(⏸).',
    target: () => ({ x: W - 2 - 54 + 8, y: 9 }),
    next: '다음',
  },
  { // 7
    text: () => '오른쪽 아래는 빚과 가진 돈, 왼쪽 아래는 날짜와 다음 상환일이에요. 매달 7·14·21·28일마다 최소 ' + fmt(BALANCE.minRepayment) + '골을 갚아요.',
    target: () => ({ x: W - 56, y: H - 30 }),
    next: '다음',
  },
  { // 8
    text: () => '교역소에서 싸게 사서 다른 성에서 비싸게 팔아도 벌어요. 남서 곡창의 성들을 돌면 동료 부대장들이 합류해요. 행운을 빌어요!',
    next: '끝',
  },
];

function questOf(t: Tutorial) {
  const id = t.g.squads[0].quests[0]; return id ? t.g.activeQuests.get(id) : undefined;
}

/** 받침에 맞춰 «으로/로» */
function ro(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00; if (c < 0 || c > 11171) return name + '(으)로';
  const jong = c % 28; return name + (jong === 0 || jong === 8 ? '로' : '으로');
}
/** 받침에 맞춰 «이/가» */
function ga(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00; if (c < 0 || c > 11171) return name + '이(가)';
  return name + (c % 28 === 0 ? '가' : '이');
}
