import Phaser from 'phaser';
import { ARENA, type Battle, type BattleUnit } from '../../core/battle';
import { ATTACK_MODE_LABEL, FORMATIONS } from '../../core/formation';
import type { Game } from '../../core/game';
import { Window, makeButton } from '../Window';
import { C, H, TEXT, TEXT_SMALL, W } from '../theme';

/**
 * 전투 화면(GDD §7.3): 별도 화면이 아니라 지도 위에 타원 전장이 겹쳐 뜬다.
 * 좌상 적 부대 패널, 우상 아군 패널, 클릭하면 멈추고 전투 명령 팝업.
 */
export class BattleScene extends Phaser.Scene {
  g!: Game;
  private battle: Battle | null = null;
  private gfx!: Phaser.GameObjects.Graphics;
  private dots = new Map<string, Phaser.GameObjects.Container>();
  private enemyPanel!: Phaser.GameObjects.Text; private allyPanel!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private popup: Window | null = null;
  private cx = W / 2; private cy = H / 2 - 8; private sx = 1.9; private sy = 1.9;
  private resultShown = false;
  onResultClosed?: () => void;

  constructor() { super('battle'); }
  create(): void {
    this.g = this.registry.get('game') as Game;
    this.gfx = this.add.graphics();
    this.enemyPanel = this.add.text(4, 20, '', { ...TEXT_SMALL, backgroundColor: '#1a140dcc', padding: { x: 3, y: 2 } });
    this.allyPanel = this.add.text(W - 4, 20, '', { ...TEXT_SMALL, backgroundColor: '#1a140dcc', padding: { x: 3, y: 2 } }).setOrigin(1, 0);
    this.logText = this.add.text(W / 2, H - 56, '', { ...TEXT_SMALL, color: C.white, backgroundColor: '#1a140dcc', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1);
    // 전장 클릭 = 멈춤 + 명령 팝업
    const hit = this.add.rectangle(this.cx, this.cy, ARENA.rx * 2 * this.sx, ARENA.ry * 2 * this.sy, 0, 0).setInteractive();
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (this.battle && !this.battle.result && !this.popup) this.openCommands(); });
    this.scene.sleep();
  }
  get current(): Battle | null { return this.battle; }
  /** UIScene 이 전투 시작을 알리면 깨운다 */
  begin(b: Battle): void {
    this.battle = b; this.resultShown = false;
    for (const d of this.dots.values()) d.destroy(); this.dots.clear();
    for (const u of b.units) this.makeDot(u);
    this.popup?.destroy(); this.popup = null;
  }
  private toScreen(u: BattleUnit): { x: number; y: number } { return { x: this.cx + u.x * this.sx, y: this.cy + u.y * this.sy }; }
  private makeDot(u: BattleUnit): void {
    const c = this.add.container(0, 0);
    const ally = u.side === 'ally';
    const body = u.wall
      ? this.add.rectangle(0, 0, 10, 70, 0x6a6a6a).setStrokeStyle(1, 0x222222)
      : this.add.rectangle(0, 0, u.isLeader ? 8 : 6, u.isLeader ? 10 : 8, ally ? (u.isLeader ? C.flagSel : C.flag) : (u.job === '두목' || u.job === '대장' ? 0xd04040 : u.job.startsWith('교단') || u.job === '사제' ? 0x8a3a8a : C.enemy)).setStrokeStyle(1, 0x111111);
    const bar = this.add.rectangle(u.wall ? -5 : -4, u.wall ? -38 : -8, u.wall ? 10 : 8, 2, 0x44cc44).setOrigin(0, 0.5);
    const mark = this.add.text(0, 0, u.range > 0 ? '↑' : '', { ...TEXT_SMALL, color: '#000' }).setOrigin(0.5);
    c.add([body, bar, mark]); c.setDepth(5);
    body.setInteractive({ useHandCursor: true });
    body.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (this.battle && !this.battle.result) this.openUnit(u); });
    (c as any).body = body; (c as any).bar = bar;
    this.dots.set(u.id, c);
  }

  // ───── 명령 팝업(원작: 전투명령 / 전체퇴각 / 개별퇴각 / 전투재개) ─────
  private openPopup(w: number, h: number, title: string): Window {
    this.popup?.destroy();
    const win = new Window(this, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h, title, { closable: false });
    win.setDepth(50); this.popup = win; this.battle!.paused = true; return win;
  }
  private closePopup(resume = true): void { this.popup?.destroy(); this.popup = null; if (resume && this.battle) this.battle.resume(); }
  private openCommands(): void {
    const w = this.openPopup(150, 86, '전투 중');
    w.menu([
      { label: '전투명령', onClick: () => this.openOrders() },
      { label: '전체퇴각', onClick: () => { this.battle!.retreatAll(); this.closePopup(); } },
      { label: '개별퇴각', onClick: () => { this.closePopup(false); this.hint('후퇴시킬 대원을 클릭'); } },
      { label: '전투재개', onClick: () => this.closePopup() },
    ]);
  }
  /** 전투명령 하위 메뉴(원작 미확인 → 우리 설계): 대열 8종 + 공격 방식 */
  private openOrders(): void {
    const b = this.battle!;
    const w = this.openPopup(300, 150, '전투명령 — 대열 / 공격 방식');
    FORMATIONS.forEach((f, i) => {
      const x = 6 + (i % 4) * 72, y = 4 + Math.floor(i / 4) * 16;
      w.button(x, y, f.name, () => { b.setFormation(f.id); this.openOrders(); }, { w: 68, h: 14, small: true, color: b.formation.id === f.id ? 0x6a5a2a : undefined });
    });
    w.small(6, 38, '▶ ' + b.formation.name + ': ' + b.formation.desc + ' (공격 ×' + b.formation.atk + ' 방어 ×' + b.formation.def + ' 명중 ×' + b.formation.hit + ')', { color: C.gold, wordWrap: { width: 288 } });
    (['melee', 'ranged', 'siege'] as const).forEach((m, i) => w.button(6 + i * 70, 64, ATTACK_MODE_LABEL[m], () => { b.setAttackMode(m); this.openOrders(); }, { w: 66, h: 14, small: true, disabled: m === 'siege' && b.kind !== 'siege', color: b.attackMode === m ? 0x6a5a2a : undefined }));
    w.small(6, 82, '사격: 사격 대원이 자리를 지키며 쏜다 · 백병전: 전원 돌격 · 공성: 성벽에 피해 ×3(점령지 탈환전에서만). 성벽이 선 동안 수비대는 방어 ×1.5.', { color: C.grey, wordWrap: { width: 288 } });
    w.button(w.bw - 70, w.bh - 32, '전투재개', () => this.closePopup(), { w: 64, h: 14 });
  }
  /** 대원 정보 팝업(원작 확인: 이름·HP·능력치 + 후퇴. 적도 클릭 가능) */
  private openUnit(u: BattleUnit): void {
    const w = this.openPopup(200, 92, u.name + ' (' + u.job + ')');
    w.text(6, 4, 'HP ' + Math.max(0, Math.round(u.hp)) + '/' + u.maxHp + '   공격 ' + u.atk + '   방어 ' + u.def);
    w.small(6, 20, (u.range > 0 ? '사격 사거리 ' + u.range : '백병') + '   피로 ' + u.fatigue + '   회복약 ' + u.potions + '   상태 ' + ({ fight: '교전', retreat: '후퇴 중', fled: '이탈', dead: '전사' } as const)[u.state], { color: C.paperDark });
    if (u.person) w.small(6, 32, 'E ' + u.person.stats.e + '  S ' + u.person.stats.s + '  D ' + u.person.stats.d + '  T ' + u.person.stats.t + '  P ' + u.person.stats.p + '  B ' + u.person.stats.b, { color: C.grey });
    if (u.side === 'ally' && u.state === 'fight') w.button(6, w.bh - 32, '후퇴', () => { this.battle!.retreatUnit(u.id); this.closePopup(); }, { w: 60, h: 14, color: 0x5a3a2a });
    w.button(w.bw - 70, w.bh - 32, '전투재개', () => this.closePopup(), { w: 64, h: 14 });
  }
  private hintText?: Phaser.GameObjects.Text;
  private hint(s: string): void { this.hintText?.destroy(); this.hintText = this.add.text(W / 2, 8, s, { ...TEXT, backgroundColor: '#000a', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setDepth(60); this.time.delayedCall(1500, () => this.hintText?.destroy()); }

  private openResult(): void {
    const b = this.battle!; this.resultShown = true;
    const w = this.openPopup(240, 110, b.result === 'victory' ? '승리' : b.result === 'retreat' ? '퇴각' : '패배');
    w.text(6, 4, b.squad.name + ' 대 ' + b.enemyName, { color: C.gold });
    const dead = b.dead.length ? '전사 ' + b.dead.map(p => p.name).join(', ') : '전사자 없음';
    w.small(6, 20, dead + (b.bounty ? '   전리품 ' + b.bounty.toLocaleString('en-US') + '골' : ''));
    const kills = b.allies.filter(u => u.kills > 0).map(u => u.name + ' ' + u.kills).join(', ');
    w.small(6, 32, '전과: ' + (kills || '없음'), { wordWrap: { width: 228 }, color: C.paperDark });
    w.small(6, 56, b.events.slice(-2).map(e => e.text).join('\n'), { color: C.grey, wordWrap: { width: 228 } });
    w.button(w.bw - 64, w.bh - 32, '닫기', () => { this.closePopup(false); this.battle = null; for (const d of this.dots.values()) d.destroy(); this.dots.clear(); this.scene.sleep(); this.onResultClosed?.(); }, { w: 58, h: 14 });
  }

  update(): void {
    const b = this.battle; if (!b) return;
    const gfx = this.gfx; gfx.clear();
    // 타원 전장(지형별 바닥은 6단계) + 반투명 어둠
    gfx.fillStyle(0x000000, 0.25).fillRect(0, 0, W, H);
    gfx.fillStyle(0x8a7a52, 0.95).fillEllipse(this.cx, this.cy, ARENA.rx * 2 * this.sx, ARENA.ry * 2 * this.sy);
    gfx.lineStyle(2, C.border, 1).strokeEllipse(this.cx, this.cy, ARENA.rx * 2 * this.sx, ARENA.ry * 2 * this.sy);
    gfx.lineStyle(1, 0x6a5a3a, 0.6).lineBetween(this.cx, this.cy - ARENA.ry * this.sy, this.cx, this.cy + ARENA.ry * this.sy);
    for (const u of b.units) {
      const c = this.dots.get(u.id)!; const p = this.toScreen(u);
      c.setPosition(Math.round(p.x), Math.round(p.y)).setVisible(u.state !== 'fled');
      const body = (c as any).body as Phaser.GameObjects.Rectangle; const bar = (c as any).bar as Phaser.GameObjects.Rectangle;
      body.setAlpha(u.state === 'dead' ? 0.35 : 1);
      bar.width = Math.max(0, (u.wall ? 10 : 8) * u.hp / u.maxHp); bar.setFillStyle(u.hp / u.maxHp > 0.5 ? 0x44cc44 : u.hp / u.maxHp > 0.25 ? 0xd0b040 : 0xd04040);
      // 공격 섬광·피격 표시
      if (u.flash < 0.12 && u.targetId) {
        const t = b.unit(u.targetId); if (t) { const q = this.toScreen(t); gfx.lineStyle(1, u.range > 0 ? 0xfff0a0 : 0xffffff, 1 - u.flash / 0.12).lineBetween(p.x, p.y, q.x, q.y); }
      }
      if (u.hitFlash < 0.15) gfx.fillStyle(0xff4040, 0.8).fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    const line = (u: BattleUnit) => (u.isLeader ? '★' : ' ') + u.name.slice(0, 6).padEnd(6, ' ') + ' ' + (u.state === 'dead' ? '전사' : u.state === 'fled' ? '이탈' : Math.max(0, Math.round(u.hp)) + '/' + u.maxHp);
    this.enemyPanel.setText(b.enemyName + (b.kind === 'siege' ? ' [공성전]' : '') + '\n' + b.enemies.map(line).join('\n'));
    this.allyPanel.setText(b.squad.name + '  대열 ' + b.formation.name + ' · ' + ATTACK_MODE_LABEL[b.attackMode] + '\n' + b.allies.map(line).join('\n'));
    const last = b.events[b.events.length - 1]; this.logText.setText(last ? last.text : '');
    if (b.result && !this.resultShown) this.openResult();
  }
}

export { makeButton };
