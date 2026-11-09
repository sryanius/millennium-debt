import Phaser from 'phaser';
import { ARENA, type Battle, type BattleUnit } from '../../core/battle';
import { ATTACK_MODE_LABEL, FORMATIONS } from '../../core/formation';
import type { Game } from '../../core/game';
import { levelOf } from '../../core/squad';
import { hash } from '../../core/market';
import { Window, makeButton } from '../Window';
import { drawFormation, formationMods } from '../formationView';
import { AUDIO } from '../audio';
import { C, H, K, TEXT, TEXT_SMALL, W, unitFrame } from '../theme';

/**
 * 전투 화면(GDD §7.3): 별도 화면이 아니라 지도 위에 타원 전장이 겹쳐 뜬다.
 * 좌상 적 부대 패널, 우상 아군 패널, 클릭하면 멈추고 전투 명령 팝업.
 */
export class BattleScene extends Phaser.Scene {
  g!: Game;
  private battle: Battle | null = null;
  private gfx!: Phaser.GameObjects.Graphics;
  /** 전장 바닥(전투 시작 때 한 번만 그린다 — 매 화면 다시 그리면 폰에서 무겁다) */
  private floor!: Phaser.GameObjects.Graphics;
  private dots = new Map<string, Dot>();
  /** 날아가는 화살·마법탄 */
  private shots: { x0: number; y0: number; x1: number; y1: number; t0: number; magic: boolean }[] = [];
  private now = 0;
  private enemyPanel!: Phaser.GameObjects.Text; private allyPanel!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private popup: Window | null = null;
  private cx = W / 2; private cy = H / 2 - 4; private sx = 2.3; private sy = 2.1;
  private resultShown = false;
  onResultClosed?: () => void;

  constructor() { super('battle'); }
  create(): void {
    this.g = this.registry.get('game') as Game;
    this.cameras.main.setZoom(K).centerOn(W / 2, H / 2);
    this.floor = this.add.graphics(); this.gfx = this.add.graphics().setDepth(6); // 섬광·화살은 병사 위에
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
    this.battle = b; this.resultShown = false; this.shots = [];
    for (const d of this.dots.values()) d.c.destroy(); this.dots.clear();
    for (const u of b.units) this.makeDot(u);
    this.popup?.destroy(); this.popup = null;
    this.drawFloor();
  }
  /** 싸우는 거점의 지형 색으로 바닥을 칠한다(숲은 초록, 사막은 모래, 설원은 흰색 …) */
  private drawFloor(): void {
    const g = this.g; const sq = g.squads[g.battleSquad] ?? g.squad; const siteId = sq.siteId ?? (sq.pos.kind === 'road' ? sq.pos.to : null);
    let ch = 'p';
    if (siteId && g.world.map) { const st = g.world.site(siteId); const row = g.world.map.terrain[Math.max(0, Math.min(g.world.map.height - 1, Math.round(st.y)))]; ch = row?.[Math.max(0, Math.min(g.world.map.width - 1, Math.round(st.x)))] ?? 'p'; }
    // [테두리, 바닥, 안쪽 밝은 바닥, 점]
    const PAL: Record<string, [number, number, number, number]> = {
      p: [0x6e7a3c, 0x9fae62, 0xb3c176, 0x7f8c48], R: [0x8a6a3c, 0xc9a66b, 0xd4b57c, 0xb08a52], f: [0x2e4a28, 0x4f7a42, 0x5c8a4c, 0x3c6232], h: [0x6a5a36, 0x9c8c5e, 0xaa9a6a, 0x7e6e44],
      m: [0x4a443c, 0x7a7268, 0x8a8278, 0x5e5850], s: [0x3a5240, 0x5f7d65, 0x6c8a72, 0x4a6650], d: [0x9a8650, 0xd6c287, 0xe0cf98, 0xb8a66c], n: [0x9aa4ac, 0xdfe3e6, 0xeef0f2, 0xb8c2ca],
      x: [0x33203c, 0x5a4068, 0x6a4a78, 0x3f2a4a], w: [0x8a6a3c, 0xc9a66b, 0xd4b57c, 0xb08a52], W: [0x8a6a3c, 0xc9a66b, 0xd4b57c, 0xb08a52], F: [0x6e7a3c, 0x9fae62, 0xb3c176, 0x7f8c48],
    };
    const [rim, base, inner, dot] = PAL[ch] ?? PAL.p;
    const gfx = this.floor; gfx.clear();
    gfx.fillStyle(0x000000, 0.25).fillRect(0, 0, W, H); // 뒤 지도를 살짝 어둡게
    gfx.fillStyle(rim, 0.96).fillEllipse(this.cx, this.cy, ARENA.rx * 2 * this.sx, ARENA.ry * 2 * this.sy);
    gfx.fillStyle(base, 0.95).fillEllipse(this.cx, this.cy - 1, ARENA.rx * 2 * this.sx - 6, ARENA.ry * 2 * this.sy - 8);
    gfx.fillStyle(inner, 0.6).fillEllipse(this.cx, this.cy - 4, ARENA.rx * 2 * this.sx * 0.7, ARENA.ry * 2 * this.sy * 0.6);
    // 풀·돌·눈 점: 지형마다 모양을 조금 다르게
    for (let i = 0; i < 110; i++) {
      const a = (i * 137.5) % 360 * Math.PI / 180, r = Math.sqrt(((i * 53) % 97) / 97);
      const x = Math.round(this.cx + Math.cos(a) * r * ARENA.rx * this.sx * 0.95), y = Math.round(this.cy + Math.sin(a) * r * ARENA.ry * this.sy * 0.9);
      gfx.fillStyle(i % 3 === 0 ? inner : dot, 0.7);
      if (ch === 'f' || ch === 'p' || ch === 's' || ch === 'F') { gfx.fillRect(x, y - 1, 1, 2); gfx.fillRect(x + 1, y, 1, 1); } // 풀
      else if (ch === 'n') gfx.fillRect(x, y, 2, 2); // 눈 덩이
      else gfx.fillRect(x, y, 2, 1); // 자갈·모래
    }
    gfx.lineStyle(2, C.border, 1).strokeEllipse(this.cx, this.cy, ARENA.rx * 2 * this.sx, ARENA.ry * 2 * this.sy);
    gfx.lineStyle(1, rim, 0.5).lineBetween(this.cx, this.cy - ARENA.ry * this.sy, this.cx, this.cy + ARENA.ry * this.sy);
  }
  private toScreen(u: BattleUnit): { x: number; y: number } { return { x: this.cx + u.x * this.sx, y: this.cy + u.y * this.sy }; }
  private makeDot(u: BattleUnit): void {
    const c = this.add.container(0, 0);
    const ally = u.side === 'ally';
    const sprite = this.textures.exists('units') && !u.wall;
    const leaderId = u.isLeader ? this.battle!.squad.id : u.person?.job === 'golem' ? 'golem' : undefined;
    const body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = u.wall
      ? this.add.rectangle(0, 0, 10, 70, 0x6a6a6a).setStrokeStyle(1, 0x222222)
      : sprite
        ? this.add.image(0, 5, 'units', unitFrame(u.person?.job ?? u.job, u.side, leaderId, u.range > 0)).setOrigin(0.5, 1).setFlipX(ally) // 그림은 오른쪽을 본다 → 아군(오른쪽에 섬)은 뒤집어 적을 본다
        : this.add.rectangle(0, 0, u.isLeader ? 8 : 6, u.isLeader ? 10 : 8, ally ? (u.isLeader ? C.flagSel : C.flag) : (u.job === '두목' || u.job === '대장' ? 0xd04040 : u.job.startsWith('교단') || u.job === '사제' ? 0x8a3a8a : C.enemy)).setStrokeStyle(1, 0x111111);
    const shadow = this.add.ellipse(0, 4, sprite ? 18 : 9, sprite ? 6 : 3, 0x000000, 0.4).setVisible(!u.wall);
    // 체력 막대: 테두리 있는 12×3(전에는 8×2 라 폰에서 안 보였다)
    const bw = 14, by = u.wall ? -40 : sprite ? -38 : -16;
    const barBg = this.add.rectangle(-bw / 2 - 1, by, bw + 2, 5, 0x1a1008, 0.9).setOrigin(0, 0.5);
    const bar = this.add.rectangle(-bw / 2, by, bw, 3, 0x44cc44).setOrigin(0, 0.5);
    // 같은 직업끼리 구분되게 대원마다 옷 색을 살짝 다르게(이름으로 정해져 늘 같은 색). 부대장·적은 그대로
    if (sprite && ally && !u.isLeader && u.person) { const TINTS = [0xffffff, 0xffe2c8, 0xd8f0ff, 0xe4ffd8, 0xfff2b8, 0xf0d8ff, 0xffd8d8, 0xd8fff4]; (body as Phaser.GameObjects.Image).setTint(TINTS[hash(u.person.id) % TINTS.length]); }
    const lv = u.person && !u.isLeader ? levelOf(u.person.stats.e) : 0;
    const mark = this.add.text(0, by - 6, !sprite && u.range > 0 ? '↑' : lv >= 6 ? '★★' : lv >= 3 ? '★' : '', { ...TEXT_SMALL, color: '#ffd65a', stroke: '#1a1008', strokeThickness: 2 }).setOrigin(0.5);
    c.add([shadow, body, barBg, bar, mark]); c.setDepth(5);
    body.setInteractive({ useHandCursor: true });
    body.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (this.battle && !this.battle.result) this.openUnit(u); });
    this.dots.set(u.id, { c, body, bar, bw, px: u.x, py: u.y, prevFlash: u.flash, prevHit: u.hitFlash, deadAt: 0, walk: 0 });
  }

  // ───── 명령 팝업(원작: 전투명령 / 전체퇴각 / 개별퇴각 / 전투재개) ─────
  private openPopup(w: number, h: number, title: string): Window {
    this.popup?.destroy();
    const win = new Window(this, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h, title, { closable: false });
    win.setDepth(50); this.popup = win; this.battle!.paused = true; return win;
  }
  private closePopup(resume = true): void { this.popup?.destroy(); this.popup = null; if (resume && this.battle) this.battle.resume(); }
  private openCommands(): void {
    const w = this.openPopup(180, 18 + 4 + 4 * 28 + 6, '전투 중');
    w.menu([
      { label: '전투명령', onClick: () => this.openOrders() },
      { label: '전체퇴각', onClick: () => { this.battle!.retreatAll(); this.closePopup(); } },
      { label: '개별퇴각', onClick: () => { this.closePopup(false); this.hint('후퇴시킬 대원을 클릭'); } },
      { label: '전투재개', onClick: () => this.closePopup() },
    ], { h: 24 });
  }
  /** 전투명령 하위 메뉴(원작 미확인 → 우리 설계): 대열 8종 + 공격 방식 */
  private openOrders(): void {
    const b = this.battle!;
    const w = this.openPopup(470, 214, '전투명령 — 대열 / 공격 방식');
    FORMATIONS.forEach((f, i) => {
      const x = 6 + (i % 4) * 76, y = 4 + Math.floor(i / 4) * 26;
      w.button(x, y, f.name, () => { b.setFormation(f.id); this.openOrders(); }, { w: 72, h: 22, small: true, selected: b.formation.id === f.id });
    });
    const desc = w.small(6, 56, '▶ ' + b.formation.name + ': ' + b.formation.desc, { color: C.gold, wordWrap: { width: 300 } });
    formationMods(w, 6, Math.min(72, 56 + desc.height), b.formation);
    drawFormation(w, 312, 4, 148, 102, b.formation, b.squad.people);
    (['melee', 'ranged', 'siege'] as const).forEach((m, i) => w.button(6 + i * 76, 84, ATTACK_MODE_LABEL[m], () => { b.setAttackMode(m); this.openOrders(); }, { w: 72, h: 22, disabled: m === 'siege' && b.kind !== 'siege', selected: b.attackMode === m }));
    w.small(6, 112, '사격: 사격 대원이 자리를 지키며 쏜다 · 백병전: 전원 돌격 · 공성: 성벽에 피해 ×3(점령지 탈환전에서만). 성벽이 선 동안 수비대는 방어 ×1.5.', { color: C.grey, wordWrap: { width: 300 } });
    w.button(w.bw - 96, w.bodyH - 30, '전투재개', () => this.closePopup(), { w: 84, h: 24 });
  }
  /** 대원 정보 팝업(원작 확인: 이름·HP·능력치 + 후퇴. 적도 클릭 가능) */
  private openUnit(u: BattleUnit): void {
    const w = this.openPopup(230, 120, u.name + ' (' + u.job + ')');
    w.text(6, 4, 'HP ' + Math.max(0, Math.round(u.hp)) + '/' + u.maxHp + '   공격 ' + u.atk + '   방어 ' + u.def);
    w.small(6, 20, (u.range > 0 ? '사격 사거리 ' + u.range : '백병') + '   피로 ' + u.fatigue + '   회복약 ' + u.potions + '   상태 ' + ({ fight: '교전', retreat: '후퇴 중', fled: '이탈', dead: '전사' } as const)[u.state], { color: C.paperDark });
    if (u.person) { const s = u.person.stats; w.small(6, 32, levelOf(s.e) + '단계(경험 ' + s.e + ') · 상업 ' + s.t + ' · 공연 ' + s.p + ' · 건축 ' + s.b, { color: C.grey }); }
    if (u.side === 'ally' && u.state === 'fight') w.button(6, w.bodyH - 30, '후퇴', () => { this.battle!.retreatUnit(u.id); this.closePopup(); }, { w: 70, h: 24, color: 0x5a3a2a });
    w.button(w.bw - 96, w.bodyH - 30, '전투재개', () => this.closePopup(), { w: 84, h: 24 });
  }
  private hintText?: Phaser.GameObjects.Text;
  private hint(s: string): void { this.hintText?.destroy(); this.hintText = this.add.text(W / 2, 8, s, { ...TEXT, backgroundColor: '#000a', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setDepth(60); this.time.delayedCall(1500, () => this.hintText?.destroy()); }

  private openResult(): void {
    const b = this.battle!; this.resultShown = true; AUDIO.sfx(b.result === 'victory' ? 'win' : 'lose', 1);
    const w = this.openPopup(260, 140, b.result === 'victory' ? '승리' : b.result === 'retreat' ? '퇴각' : '패배');
    w.text(6, 4, b.squad.name + ' 대 ' + b.enemyName, { color: C.gold });
    const dead = b.dead.length ? '전사 ' + b.dead.map(p => p.name).join(', ') : '전사자 없음';
    w.small(6, 20, dead + (b.bounty ? '   전리품 ' + b.bounty.toLocaleString('en-US') + '골' : ''));
    const kills = b.allies.filter(u => u.kills > 0).map(u => u.name + ' ' + u.kills).join(', ');
    w.small(6, 32, '전과: ' + (kills || '없음'), { wordWrap: { width: 244 }, color: C.paperDark });
    if (b.grown.length) w.small(6, 44, '★ 단계 상승: ' + b.grown.map(x => x.name + ' ' + x.level + '단계').join(', '), { wordWrap: { width: 244 }, color: C.gold });
    w.small(6, 58, b.events.slice(-2).map(e => e.text).join('\n'), { color: C.grey, wordWrap: { width: 244 } });
    w.button(w.bw - 84, w.bodyH - 30, '닫기', () => { this.closePopup(false); this.battle = null; for (const d of this.dots.values()) d.c.destroy(); this.dots.clear(); this.floor.clear(); this.scene.sleep(); this.onResultClosed?.(); }, { w: 72, h: 24 });
  }

  update(_t: number, delta: number): void {
    const b = this.battle; if (!b) return;
    const dt = Math.min(0.1, delta / 1000); this.now += dt;
    const gfx = this.gfx; gfx.clear();
    for (const u of b.units) {
      const d = this.dots.get(u.id)!; const c = d.c; const p = this.toScreen(u);
      c.setVisible(u.state !== 'fled');
      // 걷기: 자리가 바뀌었으면 위아래로 까딱
      const moved = Math.abs(u.x - d.px) + Math.abs(u.y - d.py) > 0.01; d.px = u.x; d.py = u.y;
      d.walk = moved ? d.walk + dt : 0;
      let ox = 0, oy = moved && !u.wall ? -Math.abs(Math.sin(d.walk * 14)) * 1.5 : 0;
      // 공격: 상대 쪽으로 몸을 튕긴다(처음 0.15초)
      if (u.flash < 0.15 && u.targetId && !u.wall) { const t = b.unit(u.targetId); if (t) { const q = this.toScreen(t); const len = Math.hypot(q.x - p.x, q.y - p.y) || 1; const k = (u.range > 0 ? 2 : 4) * (1 - u.flash / 0.15); ox += (q.x - p.x) / len * k; oy += (q.y - p.y) / len * k; } }
      // 맞음: 좌우로 흔들
      if (u.hitFlash < 0.15 && !u.wall) ox += Math.sin(u.hitFlash * 80) * 1.5 * (1 - u.hitFlash / 0.15);
      c.setPosition(Math.round(p.x + ox), Math.round(p.y + oy));
      const body = d.body as Phaser.GameObjects.Image;
      if (u.state === 'dead') {
        if (!d.deadAt) { d.deadAt = this.now; if (!u.wall) { body.setAngle(u.side === 'ally' ? 80 : -80); body.setY(-6); } }
        const since = this.now - d.deadAt; const alpha = since < 1.2 ? 0.6 : Math.max(0, 0.6 - (since - 1.2) / 1.5);
        c.setAlpha(alpha); if (alpha <= 0) c.setVisible(false);
      }
      c.setDepth(5 + p.y / 1000);
      d.bar.width = Math.max(0, d.bw * u.hp / u.maxHp); d.bar.setFillStyle(u.hp / u.maxHp > 0.5 ? 0x44cc44 : u.hp / u.maxHp > 0.25 ? 0xd0b040 : 0xd04040);
      // 새 공격(flash 가 작아졌다) → 사격이면 화살을 띄운다, 백병이면 흰 섬광
      if (u.flash < d.prevFlash && u.targetId) {
        const t = b.unit(u.targetId);
        if (t) { const q = this.toScreen(t); if (u.range > 0) { this.shots.push({ x0: p.x, y0: p.y - 6, x1: q.x, y1: q.y - 4, t0: this.now, magic: /마법|사제/.test(u.job) }); AUDIO.sfx('shoot', 0.09); } else gfx.lineStyle(1, 0xffffff, 0.9).lineBetween(p.x, p.y - 4, (p.x + q.x) / 2, (p.y + q.y) / 2 - 4); }
      }
      d.prevFlash = u.flash;
      if (u.hitFlash < d.prevHit) { gfx.fillStyle(0xff4040, 0.85).fillRect(p.x - 3, p.y - 7, 6, 6); AUDIO.sfx('hit', 0.07); }
      d.prevHit = u.hitFlash;
    }
    // 화살: 0.22초 동안 날아가는 짧은 막대(그림자 포함)
    const FLY = 0.22;
    this.shots = this.shots.filter(sh => this.now - sh.t0 < FLY);
    for (const sh of this.shots) {
      const k = (this.now - sh.t0) / FLY; const x = sh.x0 + (sh.x1 - sh.x0) * k, y = sh.y0 + (sh.y1 - sh.y0) * k - Math.sin(k * Math.PI) * 6;
      const ang = Math.atan2(sh.y1 - sh.y0, sh.x1 - sh.x0); const dx = Math.cos(ang) * 3, dy = Math.sin(ang) * 3;
      if (sh.magic) { gfx.fillStyle(0xc080ff, 0.9).fillCircle(x, y, 2); gfx.fillStyle(0xffffff, 0.9).fillCircle(x, y, 1); }
      else { gfx.lineStyle(2, 0x1a1008, 0.8).lineBetween(x - dx, y - dy + 1, x + dx, y + dy + 1); gfx.lineStyle(1, 0xf0e0b0, 1).lineBetween(x - dx, y - dy, x + dx, y + dy); }
    }
    const line = (u: BattleUnit) => (u.isLeader ? '★' : ' ') + u.name.slice(0, 6).padEnd(6, ' ') + ' ' + (u.state === 'dead' ? '전사' : u.state === 'fled' ? '이탈' : Math.max(0, Math.round(u.hp)) + '/' + u.maxHp);
    this.enemyPanel.setText(b.enemyName + (b.kind === 'siege' ? ' [공성전]' : '') + '\n' + b.enemies.map(line).join('\n'));
    this.allyPanel.setText(b.squad.name + '  대열 ' + b.formation.name + ' · ' + ATTACK_MODE_LABEL[b.attackMode] + '\n' + b.allies.map(line).join('\n'));
    const last = b.events[b.events.length - 1]; this.logText.setText(last ? last.text : '');
    if (b.result && !this.resultShown) this.openResult();
  }
}

/** 전장 위 병사 하나의 그림과 움직임 상태 */
interface Dot { c: Phaser.GameObjects.Container; body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; bw: number; px: number; py: number; prevFlash: number; prevHit: number; deadAt: number; walk: number }

export { makeButton };
