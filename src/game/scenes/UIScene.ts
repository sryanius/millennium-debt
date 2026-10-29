import Phaser from 'phaser';
import { BALANCE } from '../../core/balance';
import { CIVIL_JOB_LABEL } from '../../core/board';
import { GameClock } from '../../core/clock';
import { Game, fmt, goodName } from '../../core/game';
import { INCOME_LABEL, INCOME_SOURCES } from '../../core/ledger';
import { KIND_LABEL, hasMarket, isTown } from '../../core/world';
import { GameClock as Clock } from '../../core/clock';
import { Window, makeButton } from '../Window';
import { clearSave, hasSave, loadGame, saveGame } from '../save';
import { C, H, K, REGION_COLOR, TEXT, TEXT_SMALL, W, portraitKey } from '../theme';
import type { MapScene } from './MapScene';
import type { BattleScene } from './BattleScene';
import { openCollector as openCollector2, openContract, openEquip, openHospital, openMilitary as openMilitary2, openRoster, openShop } from '../windows2';
import { openBuild, openForts, openTavern } from '../windows3';
import { openEnding as openEnding4, openEvent } from '../windows4';
import { buttonKey, hasSkin, nine } from '../skin';
import { AUDIO } from '../audio';

/**
 * 네 귀퉁이 UI(GDD §7.1) + 하단 부대 6칸 + 지도 위 창들.
 * 창이 열리면 시계가 멈추고, 닫히면 다시 간다(GDD §7.4).
 */
export class UIScene extends Phaser.Scene {
  g!: Game;
  map!: MapScene;
  modal: Window | null = null;
  private battleScene!: BattleScene;
  private battleActive = false;
  private speedBeforeModal = 1;
  private panels: Phaser.Geom.Rectangle[] = [];
  // 갱신 대상
  private dateText!: Phaser.GameObjects.Text; private dueText!: Phaser.GameObjects.Text; private clockGfx!: Phaser.GameObjects.Graphics;
  private debtText!: Phaser.GameObjects.Text; private cashText!: Phaser.GameObjects.Text; private regionText!: Phaser.GameObjects.Text;
  private speedBtn!: Phaser.GameObjects.Container; private msgText!: Phaser.GameObjects.Text; private msgBg!: Phaser.GameObjects.Rectangle;
  private slots: { bg: Phaser.GameObjects.Rectangle; frame: Phaser.GameObjects.NineSlice | null; name: Phaser.GameObjects.Text; state: Phaser.GameObjects.Text; face: Phaser.GameObjects.Image | null; bars: Phaser.GameObjects.Graphics; lock: Phaser.GameObjects.Text; x: number; y: number }[] = [];
  private miniView!: Phaser.GameObjects.Rectangle; private miniScale = 0.2125;
  private lastSlotTap = { i: -1, t: 0 };
  private autosaveAt = 0;
  private endingShown = false;
  private lastTicker = '';
  private lastCash: number | null = null; private bellRung = false; private lastEvent: string | null = null;

  constructor() { super('ui'); }

  create(): void {
    this.g = this.registry.get('game') as Game;
    this.map = this.scene.get('map') as MapScene;
    this.cameras.main.setZoom(K).centerOn(W / 2, H / 2); // 설계 좌표 480×270 그대로, 캔버스는 ×K
    this.map.inputBlocked = () => this.modal !== null || this.g.battle !== null;
    this.scene.launch('battle'); this.battleScene = this.scene.get('battle') as BattleScene;
    this.battleScene.onResultClosed = () => { this.battleActive = false; if (!this.g.ending && !this.g.collectorVisit && this.g.clock.speed === 0) this.g.clock.speed = 1; };
    this.map.uiHit = (x, y) => this.panels.some(r => r.contains(x / K, y / K));
    this.map.events.on('site-click', (id: string) => this.openSite(id));
    this.map.events.on('squad-click', (i: number) => { this.g.selected = i; });
    this.buildMinimap(); this.buildTopRight(); this.buildClock(); this.buildFinance(); this.buildSquadBar(); this.buildTicker();
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(this.g); });
    if (this.g.messages.length <= 1) this.openIntro();
  }

  // ───── 패널들 ─────
  private panel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    this.panels.push(new Phaser.Geom.Rectangle(x, y, w, h));
    if (hasSkin(this)) nine(this, x, y, w, h, 'sk_panel', 6);
    const r = this.add.rectangle(x, y, w, h, C.panel, hasSkin(this) ? 0.001 : 0.92).setOrigin(0);
    if (!hasSkin(this)) r.setStrokeStyle(1, C.border);
    r.setInteractive(); r.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    return r;
  }
  private miniGfx!: Phaser.GameObjects.Graphics; private miniBlockedKey = '';
  private miniW = 0; private miniH = 0;
  private drawMini(): void {
    // 막힌 지역은 축소 지도에 자물쇠 점만(네모로 덮지 않는다)
    const sc = this.miniScale; const gfx = this.miniGfx; gfx.clear();
    for (const r of this.g.world.regions.values()) {
      if (!this.g.blocked.has(r.id)) continue;
      const b = this.g.world.regionBounds(r.id); const cx = 4 + (b.minX + b.maxX) / 2 * sc, cy = 4 + (b.minY + b.maxY) / 2 * sc;
      gfx.fillStyle(0x000000, 0.7).fillRect(cx - 2.5, cy - 2, 5, 4); gfx.fillStyle(0xe0b23c, 1).fillRect(cx - 1.5, cy - 1, 3, 2); gfx.lineStyle(1, 0xe0b23c, 1).strokeRect(cx - 1, cy - 3.5, 2, 2.5);
    }
    this.miniBlockedKey = [...this.g.blocked].join(',');
  }
  /** 좌상: 축소 지도(실제 도트 지도) + 세계 지도 단추 */
  private buildMinimap(): void {
    const m = this.g.world.map!; this.miniScale = (W >= 640 ? 84 : 68) / m.width; const sc = this.miniScale; const w = Math.round(m.width * sc), h = Math.round(m.height * sc);
    this.miniW = w; this.miniH = h;
    this.panel(2, 2, w + 4, h + 4);
    if (this.textures.exists('mappx')) {
      const key = 'minimap' + w;
      if (!this.textures.exists(key)) {
        const src = this.textures.get('mappx').getSourceImage() as HTMLImageElement;
        const t = this.textures.createCanvas(key, w * K, h * K)!; const ctx = t.getContext(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w * K, h * K); t.refresh();
      }
      this.add.image(4, 4, key).setOrigin(0).setScale(1 / K);
    }
    const gfx = this.add.graphics(); this.miniGfx = gfx; this.drawMini();
    this.miniView = this.add.rectangle(4, 4, 10, 10, 0xffffff, 0).setOrigin(0).setStrokeStyle(1, 0xfbf6e8, 0.9);
    const hit = this.add.rectangle(4, 4, w, h, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, lx: number, ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); if (this.modal) return;
      const wx = lx / sc, wy = ly / sc;
      let best: string | null = null, bd = Infinity;
      for (const r of this.g.world.regions.values()) { const b = this.g.world.regionBounds(r.id); const d = Math.hypot(wx - (b.minX + b.maxX) / 2, wy - (b.minY + b.maxY) / 2); if (d < bd) { bd = d; best = r.id; } }
      if (best) this.map.showRegion(best);
    });
    makeButton(this, 2, h + 8, '세계 지도', () => { if (!this.modal) (this.map.mode === 'world' ? this.map.showRegion(this.map.regionId) : this.map.showWorld()); }, { w: w + 4, h: 12, small: true });
    this.panels.push(new Phaser.Geom.Rectangle(2, h + 8, w + 4, 12));
  }
  /** 우상: 속도·부대·시스템 */
  private buildTopRight(): void {
    const x0 = W - 2 - 3 * 18;
    this.panels.push(new Phaser.Geom.Rectangle(x0, 2, 54, 14));
    this.speedBtn = makeButton(this, x0, 2, '▶1', () => this.cycleSpeed(), { w: 17, h: 13, small: true });
    makeButton(this, x0 + 18, 2, '⚑', () => this.openSquads(), { w: 17, h: 13, small: true });
    makeButton(this, x0 + 36, 2, '⚙', () => this.openSystem(), { w: 17, h: 13, small: true });
  }
  /** 좌하: 반원 시계 + 날짜 */
  private buildClock(): void {
    this.panel(2, H - 30, 92, 28);
    this.clockGfx = this.add.graphics();
    this.dateText = this.add.text(30, H - 27, '', TEXT_SMALL);
    this.dueText = this.add.text(30, H - 17, '', TEXT_SMALL);
  }
  /** 우하: 재정 */
  private buildFinance(): void {
    const w = 104; this.panel(W - w - 2, H - 30, w, 28);
    this.debtText = this.add.text(W - w + 4, H - 27, '', { ...TEXT_SMALL, color: '#e2a08a' });
    this.cashText = this.add.text(W - w + 4, H - 17, '', { ...TEXT_SMALL, color: C.white });
    this.regionText = this.add.text(W - 4, 4 + 16, '', { ...TEXT_SMALL, color: C.gold, stroke: '#1a1c2c', strokeThickness: 2 }).setOrigin(1, 0);
    const hit = this.add.rectangle(W - w - 2, H - 30, w, 28, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); this.openLedger(); });
  }
  /** 하단 가운데: 부대장 카드 6장(초상 + 이름 + HP·피로 막대). 아직 합류 안 한 칸은 자물쇠 */
  private slotX0 = 0; private slotW = 0;
  private buildSquadBar(): void {
    const left = 96, right = W - 108; const gap = 2; const sw = Math.min(54, Math.floor((right - left - 5 * gap) / 6)); const total = 6 * sw + 5 * gap; const x0 = Math.round(left + (right - left - total) / 2);
    this.slotX0 = x0; this.slotW = sw;
    this.panels.push(new Phaser.Geom.Rectangle(x0 - 1, H - 30, total + 2, 28));
    this.g.squads.forEach((sq, i) => {
      const x = x0 + i * (sw + gap), y = H - 30;
      const frame = hasSkin(this) ? nine(this, x, y, sw, 28, buttonKey(this, 0x2e241c, 'n'), 3) : null;
      const bg = this.add.rectangle(x, y, sw, 28, C.panel, frame ? 0.001 : 0.92).setOrigin(0).setInteractive({ useHandCursor: true });
      // 초상: 얼굴 부분만(48×56 도트에서 위쪽 가운데)
      let face: Phaser.GameObjects.Image | null = null;
      const fs_ = sw >= 50 ? 0.73 : 0.54; const tx = sw >= 50 ? 26 : 19;
      if (this.textures.exists('p_' + sq.id)) { face = this.add.image(0, 0, 'p_' + sq.id).setOrigin(0).setCrop(10, 4, 28, 30).setScale(fs_); face.setPosition(x + 3 - 10 * fs_, y + (sw >= 50 ? 3 : 6) - 4 * fs_); }
      const name = this.add.text(x + tx, y + 3, (sw >= 50 ? (i + 1) + ' ' : '') + sq.leader.name.split(' ')[0], { ...TEXT_SMALL, color: C.gold });
      const state = this.add.text(x + tx, y + 12, '', { ...TEXT_SMALL, color: C.paperDark });
      const bars = this.add.graphics();
      const lock = this.add.text(x + sw / 2, y + 14, '?', { ...TEXT, color: '#6a5a44' }).setOrigin(0.5);
      bg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation(); if (this.modal) return;
        if (!this.g.isActive(i)) { this.toast('아직 합류하지 않은 부대장 — 남서 곡창의 성들을 돌아보자'); return; }
        const now = this.time.now;
        if (this.lastSlotTap.i === i && now - this.lastSlotTap.t < 400) this.map.focusSquad(i);
        this.lastSlotTap = { i, t: now }; this.g.selected = i;
      });
      this.slots.push({ bg, frame, name, state, face, bars, lock, x, y });
    });
  }
  /** 상단 가운데: 소식 한 줄 */
  private buildTicker(): void {
    const x = this.miniW + 10, w = W - x - 62;
    if (hasSkin(this)) nine(this, x, 2, w, 13, buttonKey(this, 0x1e1812, 'n'), 3);
    this.msgBg = this.add.rectangle(x, 2, w, 13, C.panel, hasSkin(this) ? 0.001 : 0.8).setOrigin(0).setInteractive({ useHandCursor: true });
    this.msgText = this.add.text(x + 4, 4, '', { ...TEXT_SMALL, color: C.white });
    this.msgBg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); this.openLog(); });
    this.panels.push(new Phaser.Geom.Rectangle(x, 2, w, 13)); this.tickerW = w - 10;
  }
  private tickerW = 200;

  private cycleSpeed(): void {
    if (this.modal || this.g.ending) return;
    const c = this.g.clock; c.speed = c.speed === 0 ? 1 : c.speed === 1 ? 2 : c.speed === 2 ? 4 : 0;
  }

  // ───── 창 관리 ─────
  private open(w: Window): Window {
    if (this.g.battle || (this.g.event && !(w as any).isEvent)) { /* 이벤트 대화가 우선 */ }
    if (this.g.battle) { w.destroy(); return w; }
    if (this.modal) { const prev = this.modal; this.modal = null; prev.onClose = undefined; prev.destroy(); }
    else { this.speedBeforeModal = this.g.clock.speed || 1; }
    this.g.clock.speed = 0;
    this.modal = w; w.setDepth(100);
    w.onClose = () => { if (this.modal === w) { this.modal = null; if (!this.g.ending && !this.g.collectorVisit) this.g.clock.speed = this.speedBeforeModal; } };
    return w;
  }
  win(w: number, h: number, title: string, closable = true): Window {
    return this.open(new Window(this, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h, title, { closable }));
  }

  private openIntro(): void {
    const w = this.win(300, 142, '제국력 1000년 봄 — 샹파르');
    w.portrait(6, 6, 40, 48, 'kael', '카엘');
    w.text(52, 6, '아버지가 남긴 빚은 ' + fmt(BALANCE.startDebt) + '골.', { wordWrap: { width: 240 } });
    w.text(52, 22, '벨마르 대금고는 매달 7·14·21·28일에\n최소 ' + fmt(BALANCE.minRepayment) + '골씩 받아 간다.', { wordWrap: { width: 240 } });
    w.small(52, 54, '지금은 카엘 혼자다. 성을 눌러 용병을 고용하고, 교역소·게시판에서 돈을 벌자. 남서 곡창의 성들을 돌면 다른 부대장들을 만난다. 지도는 끌어서 움직이고 휠로 확대.', { color: C.paperDark, wordWrap: { width: 240 } });
    w.button(230, 106, '시작', () => w.close(), { w: 60, h: 16 });
  }

  /** 거점 클릭(GDD §7.1): 이동 또는 거점 명령 */
  openSite(id: string): void {
    if (this.modal) return;
    const s = this.g.world.site(id); const sq = this.g.squad; const here = sq.siteId === id;
    const region = this.g.world.regions.get(s.region)?.name ?? '';
    const w = this.win(190, here && isTown(s) ? 206 : 128, s.name + ' (' + KIND_LABEL[s.kind] + ' · ' + region + ')' + (this.g.enemyHeld.has(id) ? ' ⚑' : ''));
    const eta = this.g.eta(this.g.selected, id);
    const blocked = this.g.blocked.has(s.region);
    const items: { label: string; onClick?: () => void; disabled?: boolean }[] = [];
    if (here && isTown(s)) {
      // 원작의 거점 명령 9항목(GDD §7.1.1)
      items.push(
        { label: '용병 고용 (계약소)', onClick: () => openContract(this, id) },
        { label: '부대원 편성', onClick: () => openRoster(this) }, { label: '병기 편성', onClick: () => openEquip(this) },
        { label: '교역소에 감', onClick: () => this.openMarket(id), disabled: !hasMarket(s) },
        { label: '건축', onClick: () => openBuild(this, id) },
        { label: '상점에 감', onClick: () => this.openShops(id) },
        { label: '술집에 감', onClick: () => openTavern(this, id) }, { label: '병원에 감', onClick: () => openHospital(this, id) },
        { label: '민사게시판', onClick: () => this.openBoard(id) },
        { label: '군사게시판', onClick: () => this.openMilitary(id) },
      );
    } else if (!here && this.g.enemyHeld.has(id)) {
      items.push({ label: '⚑ 잿빛 교단 점령지 — 탈환 공성' + (eta === null ? ' (길 없음)' : ' (' + Math.ceil(eta) + '일)'), disabled: eta === null, onClick: () => { if (this.g.move(this.g.selected, id)) w.close(); } });
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
    } else if (here && this.g.bandAt(id)) {
      const band = this.g.bandAt(id)!;
      items.push({ label: band.name + ' 공격 (×' + (3 + band.tier * 2) + ')', onClick: () => { w.close(); this.g.attackBand(this.g.selected); } });
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
    } else if (here && hasMarket(s)) {
      items.push({ label: '교역소에 감', onClick: () => this.openMarket(id) });
      items.push({ label: '체재', onClick: () => { this.g.stay(this.g.selected); w.close(); } });
    } else {
      const band = this.g.bandAt(id);
      if (band) items.push({ label: '⚑ ' + band.name + ' (×' + (3 + band.tier * 2) + ')', disabled: true });
      const enter = this.g.canEnter(this.g.selected, s.region);
      const label = !enter.ok ? '이동 불가 (' + enter.reason + ')' : eta === null ? '길이 없다' : '이동 (' + Math.ceil(eta) + '일)' + (s.kind === 'port' ? ' · 항구' : '');
      items.push({ label, disabled: !enter.ok || eta === null, onClick: () => { if (this.g.move(this.g.selected, id)) { w.close(); } } }); void blocked;
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
      if (sq.order === 'move') items.push({ label: '선택 부대 정지', onClick: () => { this.g.stay(this.g.selected); w.close(); } });
    }
    w.menu(items);
    const foot = (here ? '선택 부대 ' + sq.name + ' 가 여기 있다' : sq.name + ' 가 ' + (sq.siteId ? this.g.world.site(sq.siteId).name : '이동 중') + '에서 출발');
    w.small(6, w.bh - 26, foot, { color: C.paperDark, wordWrap: { width: 178 } });
  }
  private openSiteInfo(id: string): void {
    const s = this.g.world.site(id);
    const w = this.win(260, 110, s.name);
    const owner = s.owner ? this.g.world.factions.get(s.owner)?.name ?? s.owner : '무주지';
    w.text(6, 4, KIND_LABEL[s.kind] + (s.kind === 'castle' ? ' 규모 ' + s.size : '') + ' · ' + (this.g.world.regions.get(s.region)?.name ?? ''));
    w.text(6, 18, '지배: ' + this.g.siteStatus(s)); void owner;
    if (s.population) w.text(6, 32, '인구: ' + fmt(s.population));
    w.small(6, 48, (s.specialty ?? '').slice(0, 80), { color: C.paperDark, wordWrap: { width: 246 } });
    w.small(6, 76, '시설: ' + (isTown(s) ? '교역소 · 상점 · 계약소 · 민사/군사 게시판' : hasMarket(s) ? '교역소' : '없음'), { color: C.grey });
  }

  /** 교역소(GDD §7.1.1): 표(상품·판값·재고·산값·수량·소유) */
  openMarket(siteId: string): void {
    const w = this.win(430, 230, this.g.world.site(siteId).name + ' 교역소');
    const render = () => {
      w.clearBody();
      const sq = this.g.squad; const m = this.g.market(siteId)!;
      w.small(6, 2, '소지금 ' + fmt(this.g.ledger.cash) + '골   적재 ' + sq.load + '/' + sq.capacity + '   상업력 T ' + sq.tradeSkill + ' (' + sq.leader.name + ')', { color: C.gold });
      const cols = [6, 80, 124, 164, 206, 246];
      ['상품', '판값', '재고', '산값', '소유', ''].forEach((h, i) => w.small(cols[i], 14, h, { color: C.grey }));
      const owned = Object.keys(sq.cargo).filter(gid => !m.line(gid));
      const rows = [...m.lines.map(l => l.good), ...owned].slice(0, 15);
      rows.forEach((gid, i) => {
        const y = 24 + i * 12; const l = m.line(gid);
        if (i % 2 === 0) w.rect(4, y - 1, 420, 12, C.panelLight, 0.35);
        w.small(cols[0], y, goodName(gid));
        w.small(cols[1], y, fmt(m.sellPrice(gid, sq.tradeSkill)), { color: C.green });
        w.small(cols[2], y, l ? String(l.stock) : '-');
        w.small(cols[3], y, l ? fmt(m.buyPrice(gid, sq.tradeSkill)) : '-', { color: C.red });
        w.small(cols[4], y, String(sq.cargo[gid] ?? 0), { color: C.white });
        const act = (fn: () => { ok: boolean; reason?: string }) => { const r = fn(); if (!r.ok && r.reason) this.toast(r.reason); render(); };
        if (l) {
          w.button(cols[5], y - 1, '사기1', () => act(() => this.g.buy(this.g.selected, gid, 1)), { w: 30, h: 11, small: true });
          w.button(cols[5] + 32, y - 1, '사기10', () => act(() => this.g.buy(this.g.selected, gid, 10)), { w: 34, h: 11, small: true });
          w.button(cols[5] + 68, y - 1, '가득', () => act(() => this.g.buy(this.g.selected, gid, 9999)), { w: 28, h: 11, small: true });
        }
        if ((sq.cargo[gid] ?? 0) > 0) {
          w.button(cols[5] + 100, y - 1, '팔기1', () => act(() => this.g.sell(this.g.selected, gid, 1)), { w: 30, h: 11, small: true, color: 0x3a5a3a });
          w.button(cols[5] + 132, y - 1, '팔기10', () => act(() => this.g.sell(this.g.selected, gid, 10)), { w: 34, h: 11, small: true, color: 0x3a5a3a });
          w.button(cols[5] + 168, y - 1, '전부', () => act(() => this.g.sell(this.g.selected, gid, 9999)), { w: 28, h: 11, small: true, color: 0x3a5a3a });
        }
      });
      w.small(6, w.bh - 24, '특산지에서 싸게 사서 먼 지역에 판다. 상업력은 사는 값도 파는 값도 내린다.', { color: C.grey });
    };
    render();
  }

  /** 민사 게시판(GDD §7.1.1): 일·목적지·기간·의뢰인·보수 */
  openBoard(siteId: string): void {
    const w = this.win(400, 170, this.g.world.site(siteId).name + ' 민사 게시판');
    const render = () => {
      w.clearBody();
      const b = this.g.board(siteId)!; const sq = this.g.squad;
      w.portrait(6, 4, 36, 44, 'clerk', '관리인');
      w.small(48, 4, '"' + sq.leader.name + ' 부대장님, 오늘 들어온 의뢰는 이렇습니다."', { color: C.paperDark });
      const cols = [48, 90, 180, 220, 290, 340];
      ['일', '목적지', '기간', '의뢰인', '보수', ''].forEach((h, i) => w.small(cols[i], 18, h, { color: C.grey }));
      if (!b.quests.length) w.small(48, 30, '남은 의뢰가 없다. 며칠 뒤 다시 오자.', { color: C.grey });
      b.quests.forEach((q, i) => {
        const y = 30 + i * 13; const to = this.g.world.site(q.to);
        w.small(cols[0], y, CIVIL_JOB_LABEL[q.job]);
        w.small(cols[1], y, to.name + '(' + (this.g.world.regions.get(to.region)?.name ?? '').slice(0, 2) + ')');
        w.small(cols[2], y, (q.deadline - this.g.day) + '일(' + q.travelDays + ')');
        w.small(cols[3], y, q.client);
        w.small(cols[4], y, fmt(q.reward), { color: C.gold });
        w.button(cols[5], y - 1, '수락', () => { this.g.accept(this.g.selected, q.id); render(); }, { w: 40, h: 11, small: true });
      });
      const mine = sq.quests.map(id => this.g.activeQuests.get(id)!).filter(Boolean);
      w.small(6, 78, '— ' + sq.name + '가 맡은 의뢰 —', { color: C.grey });
      if (!mine.length) w.small(6, 90, '없음', { color: C.grey });
      mine.forEach((q, i) => w.small(6, 90 + i * 11, CIVIL_JOB_LABEL[q.job] + ' → ' + this.g.world.site(q.to).name + '  기한 ' + (q.deadline - this.g.day) + '일  ' + fmt(q.reward) + '골'));
      w.small(6, w.bh - 24, '기간 = 남은 일수(괄호는 최소 이동일). 기한을 넘기면 보수의 절반만 받는다.', { color: C.grey });
    };
    render();
  }
  private openMilitary(siteId: string): void { openMilitary2(this, siteId); }
  private openShops(siteId: string): void {
    const s = this.g.world.site(siteId);
    const w = this.win(200, 150, s.name + '의 시설');
    const prefix = s.name.slice(0, 2);
    w.menu([
      { label: prefix + ' 무기점', onClick: () => openShop(this, siteId, 'weapon') }, { label: prefix + ' 방패점', onClick: () => openShop(this, siteId, 'armor') }, { label: '계약소', onClick: () => openContract(this, siteId) },
      { label: '약국', onClick: () => openShop(this, siteId, 'potion') }, { label: '도구점', onClick: () => openShop(this, siteId, 'tool') },
      { label: '교역소', onClick: () => this.openMarket(siteId), disabled: !hasMarket(s) },
    ]);
    w.small(6, 104, '도구점: 장부·저울(상업) · 류트·드레스(공연) · 해머·곡괭이(건축).', { color: C.grey });
  }

  /** 상환 대화(GDD §7.1.1). 돈이 모자라면 호위대 전투 선택(2단계) */
  private openCollector(): void {
    openCollector2(this, () => { this.g.collectorFight(this.g.selected); }, () => this.afterCollector());
  }
  private afterCollector(): void { this.g.dismissCollector(); if (this.g.collectorVisit) this.openCollector(); }

  /** 엔딩 카드(GDD §7.1.1): 돈 내역 7줄. 부대장별 후일담은 5단계에서. */
  private openEnding(): void {
    const l = this.g.ledger; const w = this.win(360, 220, '완납 — ' + INCOME_LABEL[this.g.ending!] + ' 엔딩', false);
    w.text(6, 4, '제국력 ' + Clock.format(this.g.clock.date) + ', 빚 ' + fmt(BALANCE.startDebt) + '골을 모두 갚았다.', { color: C.gold });
    w.small(6, 22, '쓴 돈', { color: C.grey });
    w.small(6, 32, '장비에 쓴 돈  ' + fmt(l.spent.equipment));
    w.small(6, 42, '급료에 쓴 돈  ' + fmt(l.spent.wages));
    w.small(6, 52, '상품 매입  ' + fmt(l.spent.goods));
    w.small(6, 66, '번 돈', { color: C.grey });
    INCOME_SOURCES.forEach((s, i) => w.small(6, 76 + i * 10, INCOME_LABEL[s] + '으로 번 돈  ' + fmt(l.earned[s]), { color: s === this.g.ending ? C.gold : C.paper }));
    w.rect(230, 22, 120, 120, C.panelLight); w.small(260, 76, '부대장 전신\n일러스트', { color: C.grey });
    w.small(6, 150, '"빚을 갚은 날, 여섯 부대장은 각자의 길을 갔다." (후일담 6×5는 5단계)', { color: C.paperDark, wordWrap: { width: 340 } });
    w.button(w.bw - 100, w.bh - 34, '새 게임', () => { clearSave(); location.reload(); }, { w: 94, h: 16 });
  }

  private openSquads(): void {
    if (this.g.ending) return;
    const w = this.win(300, 130, '부대');
    this.g.squads.forEach((sq, i) => {
      if (!this.g.isActive(i)) { w.small(6, 6 + i * 17, (i + 1) + ' ???  (아직 만나지 못한 부대장)', { color: C.grey }); return; }
      const y = 4 + i * 17;
      const where = sq.siteId ? this.g.world.site(sq.siteId).name : (this.g.world.site((sq.pos as any).to).name + '로 이동 중');
      w.button(6, y, (i + 1) + ' ' + sq.name, () => { this.g.selected = i; w.close(); this.openSquad(i); }, { w: 110, h: 14, small: true, color: i === this.g.selected ? 0x6a5a2a : undefined });
      w.small(122, y + 2, where + '  ·  ' + (sq.order === 'move' ? '이동' : sq.order === 'stay' ? '체재' : '대기') + '  ·  짐 ' + sq.load + '/' + sq.capacity + '  ·  의뢰 ' + sq.quests.length);
    });
  }
  private openSquad(i: number): void {
    const sq = this.g.squads[i]; const st = sq.leader.stats;
    const w = this.win(300, 150, sq.name + ' — ' + sq.leader.race + ' · ' + sq.leader.role);
    w.portrait(6, 4, 40, 48, sq.id, sq.leader.name);
    w.small(52, 4, 'HP ' + st.hp + '/' + st.maxHp + '  E ' + st.e + '  F ' + st.f + '  S ' + st.s + '  D ' + st.d + '  T ' + st.t + '  P ' + st.p + '  B ' + st.b);
    w.small(52, 16, '대원 ' + sq.members.length + '/8 · 급료 ' + fmt(sq.wages) + '/월 · 전투력 ' + Math.round(sq.power) + ' · 대열 ' + sq.formation, { color: C.grey });
    const cargo = Object.entries(sq.cargo); w.small(52, 30, '짐 ' + sq.load + '/' + sq.capacity + ': ' + (cargo.length ? cargo.map(([g, n]) => goodName(g) + ' ' + n).join(', ') : '없음'), { wordWrap: { width: 240 } });
    const qs = sq.quests.map(id => this.g.activeQuests.get(id)!).filter(Boolean);
    w.small(52, 56, '의뢰: ' + (qs.length ? qs.map(q => CIVIL_JOB_LABEL[q.job] + '→' + this.g.world.site(q.to).name + '(' + (q.deadline - this.g.day) + '일)').join(', ') : '없음'), { wordWrap: { width: 240 } });
    w.button(6, w.bh - 34, '지도에서 보기', () => { w.close(); this.map.focusSquad(i); }, { w: 90, h: 16 });
    w.button(100, w.bh - 34, sq.order === 'move' ? '정지' : '대기', () => { this.g.stay(i); w.close(); }, { w: 60, h: 16 });
    if (sq.work) w.small(52, 70, '건축: ' + sq.work.name + ' ' + Math.min(100, Math.round(sq.work.progress / sq.work.work * 100)) + '% (건축력 ' + sq.buildSkill + '/일)', { color: C.gold });
  }
  private openLedger(): void {
    if (this.modal) return;
    const l = this.g.ledger; const w = this.win(260, 150, '장부');
    w.text(6, 4, '부채  ' + fmt(l.debt) + '골', { color: C.red });
    w.text(6, 18, '소지금  ' + fmt(l.cash) + '골', { color: C.white });
    w.small(6, 36, '지금까지 갚은 돈 ' + fmt(l.repaid) + '  ·  미납 ' + l.missed + '회', { color: C.paperDark });
    INCOME_SOURCES.forEach((s, i) => w.small(6, 50 + i * 10, INCOME_LABEL[s] + '으로 번 돈  ' + fmt(l.earned[s]), { color: s === l.endingSource && l.earned[s] > 0 ? C.gold : C.paper }));
    w.small(140, 50, '상품 매입 ' + fmt(l.spent.goods), { color: C.grey });
    w.small(6, 104, '집행관은 상환일에 스스로 온다. 추가 상환은 그때.', { color: C.grey });
    w.button(w.bw - 90, w.bh - 32, '요새 보고', () => { w.close(); openForts(this); }, { w: 84, h: 14 });
  }
  private openLog(): void {
    if (this.modal) return;
    const w = this.win(400, 180, '소식');
    const ms = this.g.messages.slice(-13);
    ms.forEach((m, i) => w.small(6, 4 + i * 11, '[' + m.day + '일] ' + m.text, { color: m.kind === 'money' ? C.gold : m.kind === 'collector' || m.kind === 'warn' || m.kind === 'fort' ? C.red : m.kind === 'quest' ? C.green : m.kind === 'battle' ? '#e0a070' : C.paper, wordWrap: { width: 386 } }));
    w.button(w.bw - 90, w.bh - 32, '요새 보고', () => { w.close(); openForts(this); }, { w: 84, h: 14 });
    this.g.unread = 0;
  }
  private openSystem(): void {
    const w = this.win(200, 160, '시스템');
    w.menu([
      { label: '저장', onClick: () => { this.toast(saveGame(this.g) ? '저장했다.' : '저장 실패'); } },
      { label: '불러오기', disabled: !hasSave(), onClick: () => { const g = loadGame(this.g.world); if (g) { this.registry.set('game', g); location.reload(); } } },
      { label: '새 게임', onClick: () => { clearSave(); location.reload(); } },
      { label: '음악 ' + (AUDIO.musicOn ? '끄기' : '켜기'), onClick: () => { AUDIO.setMusic(!AUDIO.musicOn); w.close(); this.openSystem(); } },
      { label: '효과음 ' + (AUDIO.sfxOn ? '끄기' : '켜기'), onClick: () => { AUDIO.setSfx(!AUDIO.sfxOn); w.close(); this.openSystem(); } },
      { label: '닫기', onClick: () => w.close() },
    ]);
    w.small(6, 104, '시제품 · 설계 480×270 · 렌더 ×' + K + '\n자동 저장: 탭을 숨길 때, 30초마다', { color: C.grey });
  }
  private toastText?: Phaser.GameObjects.Text;
  toast(s: string): void {
    this.toastText?.destroy();
    this.toastText = this.add.text(W / 2, 30, s, { ...TEXT, backgroundColor: '#000a', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(200);
    this.time.delayedCall(1500, () => this.toastText?.destroy());
  }

  // ───── 매 프레임 ─────
  update(time: number): void {
    const g = this.g; const c = g.clock;
    // 시계: 반원 황금 시계 + 바늘(원작 좌하)
    const gfx = this.clockGfx; gfx.clear();
    const cx = 15, cy = H - 7, R = 11;
    gfx.fillStyle(0x3a2e1a).slice(cx, cy, R, Math.PI, 0, false).fillPath();
    gfx.lineStyle(1, C.border).beginPath().arc(cx, cy, R, Math.PI, 0, false).strokePath();
    for (let i = 0; i <= 4; i++) { const a = Math.PI + (Math.PI * i) / 4; gfx.lineStyle(1, 0xe0b23c).lineBetween(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    const a = Math.PI + Math.PI * c.frac; gfx.lineStyle(1, 0xffffff).lineBetween(cx, cy, cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
    this.dateText.setText(GameClock.format(c.date));
    const due = c.daysToRepayment;
    this.dueText.setText(due === 0 ? '오늘 상환일!' : '상환까지 ' + due + '일').setColor(due <= 1 ? C.red : C.paperDark);
    this.speedBtn.getAt<Phaser.GameObjects.Text>(1).setText(c.speed === 0 ? '⏸' : '▶' + c.speed);
    // 재정
    this.regionText.setText(g.world.regions.get(this.map.regionId)?.name ?? '');
    this.debtText.setText('부채 ' + fmt(g.ledger.debt));
    this.cashText.setText('소지 ' + fmt(g.ledger.cash) + '골');
    // 부대 카드
    g.squads.forEach((sq, i) => {
      const s = this.slots[i]; const on = g.isActive(i);
      s.lock.setVisible(!on); s.name.setVisible(on); s.state.setVisible(on); s.face?.setVisible(on);
      if (s.frame) { const k = buttonKey(this, !on ? 0x1e1a16 : i === g.selected ? 0x6a5020 : 0x2e241c, on && i === g.selected ? 'h' : 'n'); if (s.frame.texture.key !== k) s.frame.setTexture(k); }
      s.bars.clear(); if (!on) return;
      const dest = sq.destination;
      const nl = this.slotW >= 50 ? 4 : 3; const where = g.battleSquad === i ? '교전' : sq.order === 'move' && dest ? '→' + g.world.site(dest).name.slice(0, nl - 1) : sq.order === 'build' ? '공사' : (sq.siteId ? g.world.site(sq.siteId).name.slice(0, nl) : '…');
      if (s.state.text !== where) s.state.setText(where).setColor(g.battleSquad === i ? C.red : C.paperDark);
      const hp = sq.people.reduce((t, p) => t + p.stats.hp, 0) / Math.max(1, sq.people.reduce((t, p) => t + p.stats.maxHp, 0));
      const tx = this.slotW >= 50 ? 26 : 19; const bw = this.slotW - tx - 3; const bx = s.x + tx, by = s.y + 22;
      s.bars.fillStyle(0x1a1c2c).fillRect(bx, by, bw, 2).fillStyle(hp > 0.5 ? 0x5f9a3c : hp > 0.25 ? 0xd0b040 : 0xd04040).fillRect(bx, by, Math.round(bw * hp), 2);
      s.bars.fillStyle(0x1a1c2c).fillRect(bx, by + 3, bw, 1).fillStyle(0xe0b23c).fillRect(bx, by + 3, Math.round(bw * Math.min(1, sq.members.length / 8)), 1);
    });
    // 소식 한 줄
    const last = g.messages[g.messages.length - 1];
    const full = (g.unread > 0 ? '● ' : '') + (last?.text ?? '');
    if (full !== this.lastTicker) {
      this.lastTicker = full; let s = full; this.msgText.setText(s);
      while (this.msgText.width > this.tickerW && s.length > 4) { s = s.slice(0, -2) + '…'; this.msgText.setText(s); }
    }
    if (this.miniBlockedKey !== [...g.blocked].join(',')) this.drawMini();
    // 축소 지도의 현재 화면 틀
    const cam = this.map.cameras.main; const sc = this.miniScale;
    this.miniView.setPosition(4 + cam.worldView.x * sc, 4 + cam.worldView.y * sc).setSize(Math.max(2, cam.worldView.width * sc), Math.max(2, cam.worldView.height * sc));
    // 소리: 곡 고르기, 돈 들고 남, 집행관·이벤트 알림
    AUDIO.play(g.ending ? 'ending' : g.battle ? 'battle' : 'field');
    const cash = g.ledger.cash; if (this.lastCash !== null && cash !== this.lastCash) AUDIO.sfx(cash > this.lastCash ? 'coin' : 'pay', 0.15); this.lastCash = cash;
    if (g.collectorVisit && !this.bellRung) { this.bellRung = true; AUDIO.sfx('bell'); } if (!g.collectorVisit) this.bellRung = false;
    const ev = g.event?.id ?? null; if (ev && ev !== this.lastEvent) AUDIO.sfx('event'); this.lastEvent = ev;
    // 전투 시작·진행
    if (g.battle && (!this.battleActive || this.battleScene.current !== g.battle)) { this.battleActive = true; this.modal?.close(); this.battleScene.scene.wake(); this.battleScene.begin(g.battle); }
    // 집행관·엔딩
    if (g.collectorVisit && !this.modal && !g.battle && !this.battleActive && !g.event) this.openCollector();
    if (g.event && !this.modal && !g.battle && !this.battleActive) openEvent(this);
    if (g.ending && !this.endingShown && !g.event) { this.endingShown = true; openEnding4(this); }
    // 자동 저장
    if (time - this.autosaveAt > 30000 && !g.battle) { this.autosaveAt = time; saveGame(g); }
  }
}
