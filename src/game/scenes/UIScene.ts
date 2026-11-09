import Phaser from 'phaser';
import { FORMATION_BY_ID } from '../../core/formation';
import { BALANCE } from '../../core/balance';
import { CIVIL_JOB_LABEL } from '../../core/board';
import { GameClock } from '../../core/clock';
import { Game, fmt, goodName, type GameMessage } from '../../core/game';
import { INCOME_LABEL, INCOME_SOURCES } from '../../core/ledger';
import { KIND_LABEL, hasMarket, isTown } from '../../core/world';
import { attackOf, defenseOf, levelOf } from '../../core/squad';
import { shortName } from '../formationView';
import { GameClock as Clock } from '../../core/clock';
import { FULL_H, FULL_W, TITLE_H, Window, makeButton } from '../Window';
import { saveGame, startNewGame } from '../save';
import { C, H, K, REGION_COLOR, TEXT, TEXT_SMALL, W, portraitKey } from '../theme';
import type { MapScene } from './MapScene';
import type { BattleScene } from './BattleScene';
import { openCollector as openCollector2, openContract, openEquip, openHospital, openMilitary as openMilitary2, openRoster, openShop } from '../windows2';
import { openBuild, openForts, openTavern } from '../windows3';
import { openEnding as openEnding4, openEvent } from '../windows4';
import { openAutoTrade, openHelp, openNotebook, openSlots } from '../windows5';
import { buttonKey, hasSkin, nine } from '../skin';
import { AUDIO } from '../audio';
import { Tutorial } from '../tutorial';
/** 위 오른쪽 단추 줄(의뢰·속도·부대·시스템): 손가락으로 누를 수 있게 22×18 + 틈 2 */
const TR_BTN = 22, TR_Q = 28, TR_GAP = 2, TR_H = 18;
/** 위 오른쪽 단추 줄 전체 폭(소식 줄·튜토리얼 상자가 그 왼쪽까지 쓴다) */
const TR_W = TR_Q + 3 * TR_BTN + 4 * TR_GAP;

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
  private slots: { bg: Phaser.GameObjects.Rectangle; frame: Phaser.GameObjects.NineSlice | null; name: Phaser.GameObjects.Text; state: Phaser.GameObjects.Text; face: Phaser.GameObjects.Image | null; bars: Phaser.GameObjects.Graphics; lock: Phaser.GameObjects.Text; x: number; y: number; barKey: string; stateKey?: string }[] = [];
  private clockKey = -1;
  private miniView!: Phaser.GameObjects.Rectangle; private miniScale = 0.2125;
  private slotHints = 0;
  private autosaveAt = 0;
  private endingShown = false;
  private lastTicker = '';
  private lastCash: number | null = null; private bellRung = false; private lastEvent: string | null = null;

  constructor() { super('ui'); }

  create(): void {
    this.g = this.registry.get('game') as Game; this.seenMsgs = this.g.messages.length;
    this.map = this.scene.get('map') as MapScene;
    this.cameras.main.setZoom(K).centerOn(W / 2, H / 2); // 설계 좌표 480×270 그대로, 캔버스는 ×K
    this.map.inputBlocked = () => this.modal !== null || this.g.battle !== null;
    this.scene.launch('battle'); this.battleScene = this.scene.get('battle') as BattleScene;
    this.battleScene.onResultClosed = () => { this.battleActive = false; if (!this.g.ending && !this.g.collectorVisit && this.g.clock.speed === 0) this.g.clock.speed = 1; };
    this.map.uiHit = (x, y) => this.panels.some(r => r.contains(x / K, y / K));
    this.map.events.on('site-click', (id: string) => this.openSite(id));
    this.map.events.on('squad-click', (i: number) => { this.g.selected = i; });
    this.buildMinimap(); this.buildTopRight(); this.buildClock(); this.buildFinance(); this.buildSquadBar(); this.buildTicker();
    this.tutorial = new Tutorial(this, this.miniW + 10, W - TR_W - 6);
    try { if (localStorage.getItem('md-perf')) this.setPerf(true); } catch { /* 없으면 꺼 둔다 */ }
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(this.g); });
    (window as unknown as { __saveNow?: () => boolean }).__saveNow = () => saveGame(this.g); // 앱(APK)이 백그라운드로 갈 때 부른다
    if (this.g.messages.length <= 1) this.openIntro();
  }

  // ───── 패널들 ─────
  private panel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    this.panels.push(new Phaser.Geom.Rectangle(x, y, w, h));
    if (hasSkin(this)) nine(this, x, y, w, h, 'sk_panel', 6);
    const r = this.add.rectangle(x, y, w, h, C.panel, hasSkin(this) ? 0.001 : 0.92).setOrigin(0);
    if (!hasSkin(this)) r.setStrokeStyle(1, C.border); else r.setFillStyle(); // 칠하지 않으면 그리지도 않는다(누르기만 받는 판). 투명하게 칠하면 그리기 명령이 나간다
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
    const hit = this.add.rectangle(4, 4, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, lx: number, ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); if (this.busy) return;
      const wx = lx / sc, wy = ly / sc;
      let best: string | null = null, bd = Infinity;
      for (const r of this.g.world.regions.values()) { const b = this.g.world.regionBounds(r.id); const d = Math.hypot(wx - (b.minX + b.maxX) / 2, wy - (b.minY + b.maxY) / 2); if (d < bd) { bd = d; best = r.id; } }
      if (best) this.map.showRegion(best);
    });
    makeButton(this, 2, h + 8, '세계 지도', () => { if (!this.busy) (this.map.mode === 'world' ? this.map.showRegion(this.map.regionId) : this.map.showWorld()); }, { w: w + 4, h: 16, small: true });
    this.panels.push(new Phaser.Geom.Rectangle(2, h + 6, w + 4, 20));
  }
  /** 우상: 속도·부대·시스템 */
  private buildTopRight(): void {
    const x0 = W - TR_W; const y = 2;
    this.panels.push(new Phaser.Geom.Rectangle(x0, 0, TR_W, TR_H + 4));
    const o = { w: TR_BTN, h: TR_H, small: true };
    makeButton(this, x0, y, '의뢰', () => { if (!this.busy) this.openQuests(); }, { ...o, w: TR_Q });
    const sx = x0 + TR_Q + TR_GAP;
    this.speedBtn = makeButton(this, sx, y, '▶1', () => this.cycleSpeed(), o);
    this.speedBtnAt = { x: sx + TR_BTN / 2, y: y + TR_H / 2 };
    makeButton(this, sx + TR_BTN + TR_GAP, y, '⚑', () => { if (!this.busy) this.openSquads(); }, o);
    makeButton(this, sx + 2 * (TR_BTN + TR_GAP), y, '⚙', () => { if (!this.busy) this.openSystem(); }, o);
  }
  /** 속도 단추 가운데(튜토리얼이 가리킨다) */
  speedBtnAt = { x: 0, y: 0 };
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
    this.regionText = this.add.text(W - 4, TR_H + 6, '', { ...TEXT_SMALL, color: C.gold, stroke: '#1a1c2c', strokeThickness: 2 }).setOrigin(1, 0);
    const hit = this.add.rectangle(W - w - 2, H - 30, w, 28).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (!this.busy) this.openLedger(); });
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
      const bg = this.add.rectangle(x, y, sw, 28, C.panel, 0.92).setOrigin(0).setInteractive({ useHandCursor: true }); if (frame) bg.setFillStyle();
      // 초상: 얼굴 부분만(48×56 도트에서 위쪽 가운데)
      let face: Phaser.GameObjects.Image | null = null;
      const fs_ = sw >= 50 ? 0.73 : 0.54; const tx = sw >= 50 ? 26 : 19;
      if (this.textures.exists('p_' + sq.id)) { face = this.add.image(0, 0, 'p_' + sq.id).setOrigin(0).setCrop(10, 4, 28, 30).setScale(fs_); face.setPosition(x + 3 - 10 * fs_, y + (sw >= 50 ? 3 : 6) - 4 * fs_); }
      const name = this.add.text(x + tx, y + 3, (sw >= 50 ? (i + 1) + ' ' : '') + sq.leader.name.split(' ')[0], { ...TEXT_SMALL, color: C.gold });
      const state = this.add.text(x + tx, y + 12, '', { ...TEXT_SMALL, color: C.paperDark });
      const bars = this.add.graphics();
      const lock = this.add.text(x + sw / 2, y + 14, '?', { ...TEXT, color: '#6a5a44' }).setOrigin(0.5);
      bg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation(); if (this.modal || this.g.battle) return;
        if (!this.g.isActive(i)) { this.toast('아직 합류하지 않은 부대장 — 남서 곡창의 성들을 돌아보자'); return; }
        // 처음 누르면 고르고 지도를 그 부대로 옮긴다. 이미 고른 부대를 또 누르면 부대 정보 창
        if (this.g.selected === i) { this.openSquad(i); return; }
        this.g.selected = i; this.map.focusSquad(i);
        if (this.slotHints < 3) { this.slotHints++; this.toast(this.g.squads[i].name + ' 부대를 골랐다 — 한 번 더 누르면 부대 정보'); }
      });
      this.slots.push({ bg, frame, name, state, face, bars, lock, x, y, barKey: '-' });
    });
  }
  /** 상단 가운데: 소식 한 줄 */
  private buildTicker(): void {
    const x = this.miniW + 10, w = W - x - TR_W - 6;
    if (hasSkin(this)) this.tickerFrame = nine(this, x, 2, w, 13, buttonKey(this, 0x1e1812, 'n'), 3);
    this.msgBg = this.add.rectangle(x, 2, w, 13, C.panel, 0.8).setOrigin(0).setInteractive({ useHandCursor: true }); if (hasSkin(this)) this.msgBg.setFillStyle();
    this.msgText = this.add.text(x + 4, 4, '', { ...TEXT_SMALL, color: C.white });
    this.msgBg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (!this.busy) this.openLog(); });
    this.panels.push(new Phaser.Geom.Rectangle(x, 2, w, 13)); this.tickerW = w - 10;
  }
  private tickerW = 200;
  tutorial!: Tutorial;
  /** 튜토리얼 상자가 소식 줄 자리를 쓰는 동안 숨긴다 */
  setTickerVisible(v: boolean): void { if (this.msgText.visible !== v) { this.msgText.setVisible(v); this.msgBg.setVisible(v); this.tickerFrame?.setVisible(v); } }
  private tickerFrame: Phaser.GameObjects.NineSlice | null = null;

  private cycleSpeed(): void {
    if (this.modal || this.g.ending) return;
    const c = this.g.clock; c.speed = c.speed === 0 ? 1 : c.speed === 1 ? 2 : c.speed === 2 ? 4 : 0;
  }

  // ───── 창 관리 ─────
  /** 전투 중에는 지도 위 창을 열지 않는다(전투 화면이 덮고 있다). 단추들이 먼저 이걸 본다 */
  get busy(): boolean { return this.modal !== null || this.g.battle !== null; }
  private open(w: Window): Window {
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

  /** 화면을 거의 채우는 창(목록이 긴 창) */
  full(title: string, closable = true): Window { return this.win(FULL_W, FULL_H, title, closable); }

  private openIntro(): void {
    const w = this.win(300, 150, '제국력 1000년 봄 — 샹파르');
    w.portrait(6, 6, 40, 48, 'kael', '카엘');
    w.text(52, 6, '아버지가 남긴 빚은 ' + fmt(BALANCE.startDebt) + '골.', { wordWrap: { width: 240 } });
    w.text(52, 22, '벨마르 대금고는 매달 7·14·21·28일에\n최소 ' + fmt(BALANCE.minRepayment) + '골씩 받아 간다.', { wordWrap: { width: 240 } });
    w.small(52, 54, (this.g.tutorial === 0 ? '지금은 카엘 혼자다. 처음이라면 위쪽 노란 안내를 따라가 보자(언제든 건너뛸 수 있다). ' : '지금은 카엘 혼자다. ') + '지도는 끌어서 움직이고, 두 손가락으로 확대.', { color: C.paperDark, wordWrap: { width: 240 } });
    w.button(w.bw - 92, w.bodyH - 28, '시작', () => w.close(), { w: 80, h: 22 });
  }

  /** 거점 클릭(GDD §7.1): 이동 또는 거점 명령. 성 안 명령은 두 줄로 큼직하게 */
  openSite(id: string): void {
    if (this.modal) return;
    const s = this.g.world.site(id); const sq = this.g.squad; const here = sq.siteId === id;
    const region = this.g.world.regions.get(s.region)?.name ?? '';
    const eta = this.g.eta(this.g.selected, id);
    const items: { label: string; onClick?: () => void; disabled?: boolean }[] = [];
    let close = () => {};
    const town = here && isTown(s);
    if (town) {
      // 성 안까지 들어온 적 무리(지나가던 잿빛 전투단 등)가 있으면 맨 위에 공격
      const band = this.g.bandAt(id);
      if (band) items.push({ label: band.name + ' 공격 (×' + (3 + band.tier * 2) + ')', onClick: () => { close(); this.g.attackBand(this.g.selected); } }, { label: '거점 정보', onClick: () => this.openSiteInfo(id) });
      // 원작의 거점 명령(GDD §7.1.1)
      items.push(
        { label: '용병 고용 (계약소)', onClick: () => openContract(this, id) },
        { label: '민사게시판', onClick: () => this.openBoard(id) },
        { label: '부대원 편성', onClick: () => openRoster(this) },
        { label: '군사게시판', onClick: () => this.openMilitary(id) },
        { label: '병기 편성', onClick: () => openEquip(this) },
        { label: '교역소에 감', onClick: () => this.openMarket(id), disabled: !hasMarket(s) },
        { label: '상점에 감', onClick: () => this.openShops(id) },
        { label: '건축', onClick: () => openBuild(this, id) },
        { label: '술집에 감', onClick: () => openTavern(this, id) },
        { label: '병원에 감', onClick: () => openHospital(this, id) },
      );
    } else if (!here && this.g.enemyHeld.has(id)) {
      items.push({ label: '탈환 공성' + (eta === null ? ' (길 없음)' : ' (' + Math.ceil(eta) + '일)'), disabled: eta === null, onClick: () => { if (this.g.move(this.g.selected, id)) close(); } });
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
    } else if (here && this.g.bandAt(id)) {
      const band = this.g.bandAt(id)!;
      items.push({ label: band.name + ' 공격 (×' + (3 + band.tier * 2) + ')', onClick: () => { close(); this.g.attackBand(this.g.selected); } });
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
    } else if (here && hasMarket(s)) {
      items.push({ label: '교역소에 감', onClick: () => this.openMarket(id) });
      items.push({ label: '체재', onClick: () => { this.g.stay(this.g.selected); close(); } });
    } else {
      const band = this.g.bandAt(id);
      if (band) items.push({ label: '⚑ ' + band.name + ' (×' + (3 + band.tier * 2) + ')', disabled: true });
      const enter = this.g.canEnter(this.g.selected, s.region);
      const label = !enter.ok ? '이동 불가 (' + enter.reason + ')' : eta === null ? '길이 없다' : '이동 (' + Math.ceil(eta) + '일)' + (s.kind === 'port' ? ' · 항구' : '');
      items.push({ label, disabled: !enter.ok || eta === null, onClick: () => { if (this.g.move(this.g.selected, id)) close(); } });
      items.push({ label: '거점 정보', onClick: () => this.openSiteInfo(id) });
      if (sq.order === 'move') items.push({ label: '선택 부대 정지', onClick: () => { this.g.stay(this.g.selected); close(); } });
    }
    const cols = town ? 2 : 1; const rows = Math.ceil(items.length / cols);
    const ww = town ? 320 : 250; const hh = TITLE_H + 2 + 4 + rows * 26 + 30;
    const enemy = this.g.enemyHeld.has(id) ? ' ⚑' : '';
    const w = this.win(ww, hh, s.name + ' (' + KIND_LABEL[s.kind] + ' · ' + region + ')' + enemy);
    close = () => w.close();
    const end = w.menu(items, { cols, h: 22 });
    const foot = (here ? '선택 부대 ' + sq.name + '가 여기 있다' : sq.name + '가 ' + (sq.siteId ? this.g.world.site(sq.siteId).name : '이동 중') + '에서 출발');
    w.small(6, end + 2, foot, { color: C.paperDark, wordWrap: { width: ww - 16 } });
  }
  private openSiteInfo(id: string): void {
    const s = this.g.world.site(id);
    const w = this.win(280, 130, s.name);
    w.text(6, 4, KIND_LABEL[s.kind] + (s.kind === 'castle' ? ' 규모 ' + s.size : '') + ' · ' + (this.g.world.regions.get(s.region)?.name ?? ''));
    w.text(6, 20, '지배: ' + this.g.siteStatus(s));
    if (s.population) w.text(6, 36, '인구: ' + fmt(s.population));
    w.small(6, 54, (s.specialty ?? '').slice(0, 80), { color: C.paperDark, wordWrap: { width: 264 } });
    w.small(6, 84, '시설: ' + (isTown(s) ? '교역소 · 상점 · 계약소 · 민사/군사 게시판' : hasMarket(s) ? '교역소' : '없음'), { color: C.grey, wordWrap: { width: 264 } });
  }

  /**
   * 교역소(GDD §7.1.1): 왼쪽 상품 목록(줄을 눌러 고름, 위아래로 밀어 넘김) + 오른쪽 고른 상품 사기·팔기 큰 단추
   */
  openMarket(siteId: string): void {
    const w = this.full(this.g.world.site(siteId).name + ' 교역소');
    let sel: string | null = null; let off = 0;
    const ROWH = 22, VIS = 8, LX = 4, LW = 300, LY = 30;
    const render = () => {
      w.clearBody();
      const sq = this.g.squad; const m = this.g.market(siteId)!; this.g.noteMarket(siteId);
      w.small(6, 2, '소지금 ' + fmt(this.g.ledger.cash) + '골   적재 ' + sq.load + '/' + sq.capacity + '   상업력 ' + sq.tradeSkill + ' (' + sq.leader.name + ')', { color: C.gold });
      w.button(FULL_W - 96, 0, '시세 수첩', () => openNotebook(this, sel), { w: 88, h: 20, small: true });
      const cols = [8, 104, 154, 196, 250];
      ['상품', '판값', '재고', '산값', '소유'].forEach((h, i) => w.small(cols[i], 17, h, { color: C.grey }));
      const owned = Object.keys(sq.cargo).filter(gid => !m.line(gid));
      const rows = [...m.lines.map(l => l.good), ...owned];
      if (!sel || !rows.includes(sel)) sel = rows[0] ?? null;
      off = Math.min(off, Math.max(0, rows.length - VIS));
      rows.slice(off, off + VIS).forEach((gid, k) => {
        const i = off + k; const y = LY + k * ROWH; const l = m.line(gid);
        w.row(LX, y, LW - 6, ROWH - 2, gid === sel, () => { sel = gid; render(); }, i % 2 === 0);
        w.text(cols[0], y + 3, goodName(gid).slice(0, 7), { color: gid === sel ? C.white : C.paper });
        w.small(cols[1], y + 5, fmt(m.sellPrice(gid, sq.tradeSkill)), { color: '#8fd07a' });
        w.small(cols[2], y + 5, l ? String(l.stock) : '-');
        w.small(cols[3], y + 5, l ? fmt(m.buyPrice(gid, sq.tradeSkill)) : '-', { color: '#e2a08a' });
        w.small(cols[4], y + 5, String(sq.cargo[gid] ?? 0), { color: C.white });
      });
      w.scroll({ x: LX, y: LY, w: LW, h: VIS * ROWH, rowH: ROWH, count: rows.length, rows: VIS, get: () => off, set: v => { off = v; }, redraw: render });
      // 오른쪽: 고른 상품
      const RX = 312, RW = 150;
      if (sel) {
        const l = m.line(sel); const have = sq.cargo[sel] ?? 0;
        w.text(RX, LY, goodName(sel), { color: C.gold });
        w.small(RX, LY + 18, '산값 ' + (l ? fmt(m.buyPrice(sel, sq.tradeSkill)) : '-') + '  ·  판값 ' + fmt(m.sellPrice(sel, sq.tradeSkill)), { color: C.paper });
        w.small(RX, LY + 30, '재고 ' + (l ? l.stock : '-') + '  ·  가진 것 ' + have + '  ·  빈칸 ' + Math.max(0, sq.capacity - sq.load), { color: C.paperDark });
        const act = (fn: () => { ok: boolean; reason?: string }) => { const r = fn(); if (!r.ok && r.reason) this.toast(r.reason); render(); };
        const bw = Math.floor((RW - 8) / 3); const g = this.g; const id = sel;
        w.small(RX, LY + 48, '사기', { color: C.grey });
        [['1개', 1], ['10개', 10], ['가득', 9999]].forEach(([lb, n], i) => w.button(RX + i * (bw + 4), LY + 60, lb as string, () => act(() => g.buy(g.selected, id, n as number)), { w: bw, h: 24, disabled: !l || l.stock <= 0 || sq.load >= sq.capacity }));
        w.small(RX, LY + 92, '팔기', { color: C.grey });
        [['1개', 1], ['10개', 10], ['전부', 9999]].forEach(([lb, n], i) => w.button(RX + i * (bw + 4), LY + 104, lb as string, () => act(() => g.sell(g.selected, id, n as number)), { w: bw, h: 24, color: 0x3a5a3a, disabled: have <= 0 }));
        if (l && !sq.auto) w.button(RX, LY + 148, '이 상품 왕복 교역…', () => openAutoTrade(this, siteId, id), { w: RW - 4, h: 20, small: true });
        // 수첩: 다른 곳에서 본 가장 비싼 판값
        const best = g.noteSellers(id).find(r => r.site !== siteId);
        if (best) { const gain = best.sell - m.buyPrice(id, 0); w.small(RX, LY + 134, '수첩: ' + g.world.site(best.site).name + ' 판값 ' + fmt(best.sell) + ' (' + (g.day - best.day === 0 ? '오늘' : (g.day - best.day) + '일 전') + ')' + (l ? ' → 하나에 ' + (gain > 0 ? '+' : '') + fmt(gain) : ''), { color: gain > 0 ? '#8fd07a' : C.grey, wordWrap: { width: RW } }); }
      }
      w.small(6, LY + VIS * ROWH + 8, '특산지에서 싸게 사서 먼 지역에 판다. 상업력은 사는 값도 파는 값도 내린다. 목록은 위아래로 밀어 넘긴다.', { color: C.grey, wordWrap: { width: 456 } });
    };
    render();
  }

  /** 민사 게시판(GDD §7.1.1): 일·목적지·기간·의뢰인·보수 + 줄마다 큰 «수락» */
  openBoard(siteId: string): void {
    const w = this.win(FULL_W, 236, this.g.world.site(siteId).name + ' 민사 게시판');
    const render = () => {
      w.clearBody();
      const b = this.g.board(siteId)!; const sq = this.g.squad;
      w.portrait(6, 2, 30, 26, 'clerk', '관리인');
      w.small(42, 4, '"' + sq.leader.name + ' 부대장님, 오늘 들어온 의뢰는 이렇습니다."', { color: C.paperDark });
      w.small(42, 15, '기간 = 남은 일수(괄호는 최소 이동일). 기한을 넘기면 보수의 절반만.', { color: C.grey });
      const cols = [8, 50, 160, 214, 316];
      ['일', '목적지', '기간', '의뢰인', '보수'].forEach((h, i) => w.small(cols[i], 32, h, { color: C.grey }));
      if (!b.quests.length) w.small(8, 46, '남은 의뢰가 없다. 며칠 뒤 다시 오자.', { color: C.grey });
      b.quests.forEach((q, i) => {
        const y = 44 + i * 26; const to = this.g.world.site(q.to);
        w.rect(4, y, 458, 24, C.panelLight, i % 2 === 0 ? 0.45 : 0.25);
        w.text(cols[0], y + 5, CIVIL_JOB_LABEL[q.job]);
        w.small(cols[1], y + 7, to.name + '(' + (this.g.world.regions.get(to.region)?.name ?? '').slice(0, 2) + ')');
        w.small(cols[2], y + 7, (q.deadline - this.g.day) + '일(' + q.travelDays + ')');
        w.small(cols[3], y + 7, q.client);
        w.small(cols[4], y + 7, fmt(q.reward) + '골', { color: C.gold });
        w.button(392, y + 2, '수락', () => { this.g.accept(this.g.selected, q.id); render(); }, { w: 66, h: 20 });
        w.mark('accept' + i, 458, y + 12);
      });
      const mine = sq.quests.map(id => this.g.activeQuests.get(id)!).filter(Boolean);
      const my = 44 + 3 * 26 + 6;
      w.small(6, my, '— ' + sq.name + '가 맡은 의뢰 (전부 보기: 오른쪽 위 «의뢰») —', { color: C.grey });
      if (!mine.length) w.small(6, my + 12, '없음', { color: C.grey });
      mine.slice(0, 7).forEach((q, i) => w.small(6, my + 12 + i * 11, CIVIL_JOB_LABEL[q.job] + ' → ' + this.g.world.site(q.to).name + '  기한 ' + (q.deadline - this.g.day) + '일  ' + fmt(q.reward) + '골'));
    };
    render();
  }
  private openMilitary(siteId: string): void { openMilitary2(this, siteId); }
  private openShops(siteId: string): void {
    const s = this.g.world.site(siteId);
    const w = this.win(300, 150, s.name + '의 시설');
    const prefix = s.name.slice(0, 2);
    const end = w.menu([
      { label: prefix + ' 무기점', onClick: () => openShop(this, siteId, 'weapon') }, { label: prefix + ' 방패점', onClick: () => openShop(this, siteId, 'armor') },
      { label: '약국', onClick: () => openShop(this, siteId, 'potion') }, { label: '도구점', onClick: () => openShop(this, siteId, 'tool') },
      { label: '계약소', onClick: () => openContract(this, siteId) },
      { label: '교역소', onClick: () => this.openMarket(siteId), disabled: !hasMarket(s) },
    ], { cols: 2 });
    w.small(6, end + 2, '도구점: 장부·저울(상업) · 류트·드레스(공연) · 해머·곡괭이(건축).', { color: C.grey, wordWrap: { width: 284 } });
  }

  /** 상환 대화(GDD §7.1.1). 돈이 모자라면 호위대 전투 선택(2단계) */
  private openCollector(): void {
    openCollector2(this, () => { this.g.collectorFight(this.g.selected); }, () => this.afterCollector());
  }
  private afterCollector(): void { this.g.dismissCollector(); if (this.g.collectorVisit) this.openCollector(); }

  /** 엔딩 카드(옛 판, 지금은 windows4.openEnding 을 쓴다) */
  private openEnding(): void { openEnding4(this); }

  /** 맡은 의뢰 전부(민사: 부대별 · 군사: 토벌). 줄마다 «보기»로 목적지를 지도에서 보여 준다 */
  openQuests(): void {
    const g = this.g; type Row = { who: string; what: string; where: string; left: string; red: boolean; reward: number; site: string; drop: () => void; fee: number };
    const build = (): Row[] => {
      const rows: Row[] = [];
      g.squads.forEach((sq, i) => { if (!g.isActive(i)) return; for (const id of sq.quests) { const q = g.activeQuests.get(id); if (!q) continue; const d = q.deadline - g.day; const to = g.world.site(q.to);
        rows.push({ who: sq.leader.name.split(' ')[0], what: CIVIL_JOB_LABEL[q.job], where: to.name + '(' + (g.world.regions.get(to.region)?.name ?? '').slice(0, 2) + ')', left: d >= 0 ? d + '일' : '지남', red: d < 2, reward: q.reward, site: q.to, drop: () => g.abandon(q.id), fee: Math.round(q.reward * BALANCE.civilAbandonFeeRate) }); } });
      for (const q of g.activeMilitary.values()) { const band = g.bands.find(b => b.questId === q.id); const at = band?.site ?? q.target;
        rows.push({ who: '토벌', what: '도적단', where: g.world.site(at).name, left: '-', red: false, reward: q.reward, site: at, drop: () => g.abandonMilitary(q.id), fee: 0 }); }
      return rows;
    };
    let rows = build();
    const VIS = 8, ROWH = 24, LY = 16;
    const w = this.win(FULL_W, TITLE_H + 2 + LY + Math.max(2, Math.min(VIS, rows.length)) * ROWH + 26, '맡은 의뢰 ' + rows.length + '개');
    let off = 0; let confirm: Row | null = null;
    const render = () => {
      w.clearBody(); rows = build();
      const cols = [8, 56, 100, 232, 278];
      ['누가', '일', '목적지', '기한', '보수'].forEach((h, i) => w.small(cols[i], 3, h, { color: C.grey }));
      if (!rows.length) w.small(8, LY + 4, '맡은 의뢰가 없다. 성의 «민사게시판»·«군사게시판»에서 «수락»하자.', { color: C.grey, wordWrap: { width: 440 } });
      off = Math.min(off, Math.max(0, rows.length - VIS));
      rows.slice(off, off + VIS).forEach((r, k) => {
        const y = LY + k * ROWH;
        w.rect(4, y, 454, ROWH - 2, C.panelLight, (off + k) % 2 === 0 ? 0.45 : 0.25);
        if (confirm === r) { // 포기 확인
          w.small(cols[0], y + 6, r.what + ' → ' + r.where + ' 의뢰를 포기할까? ' + (r.fee ? '위약금 ' + fmt(r.fee) + '골' : '위약금 없음'), { color: C.red });
          w.button(336, y + 1, '포기한다', () => { r.drop(); confirm = null; render(); }, { w: 60, h: 20, color: 0x5a3a2a });
          w.button(400, y + 1, '아니오', () => { confirm = null; render(); }, { w: 54, h: 20 });
          return;
        }
        w.small(cols[0], y + 6, r.who, { color: C.gold }); w.small(cols[1], y + 6, r.what); w.small(cols[2], y + 6, r.where);
        w.small(cols[3], y + 6, r.left, { color: r.red ? '#e2a08a' : C.paper }); w.small(cols[4], y + 6, fmt(r.reward), { color: C.gold });
        w.button(346, y + 1, '보기', () => { w.close(); this.map.focusSite(r.site); }, { w: 52, h: 20 });
        w.button(402, y + 1, '포기', () => { confirm = r; render(); }, { w: 52, h: 20, color: 0x5a3a2a });
      });
      w.scroll({ x: 4, y: LY, w: 458, h: VIS * ROWH, rowH: ROWH, count: rows.length, rows: VIS, get: () => off, set: v => { off = v; }, redraw: render });
      w.small(6, w.bodyH - 16, '목적지에 도착하면 보수를 받는다. 기한을 넘기면 절반만. 포기하면 보수의 20%를 위약금으로 문다(토벌은 없음).', { color: C.grey, wordWrap: { width: 456 } });
    };
    render();
  }

  private openSquads(): void {
    if (this.g.ending) return;
    const w = this.win(420, TITLE_H + 2 + 6 * 26 + 10, '부대');
    this.g.squads.forEach((sq, i) => {
      const y = 4 + i * 26;
      if (!this.g.isActive(i)) { w.small(8, y + 6, (i + 1) + ' ???  (아직 만나지 못한 부대장)', { color: C.grey }); return; }
      const where = sq.siteId ? this.g.world.site(sq.siteId).name : (this.g.world.site((sq.pos as any).to).name + '로 이동 중');
      w.button(6, y, (i + 1) + ' ' + sq.name, () => { this.g.selected = i; w.close(); this.openSquad(i); }, { w: 130, h: 22, selected: i === this.g.selected });
      w.small(144, y + 6, where + '  ·  ' + (sq.order === 'move' ? '이동' : sq.order === 'stay' ? '체재' : sq.order === 'build' ? '공사' : '대기') + '  ·  짐 ' + sq.load + '/' + sq.capacity + '  ·  의뢰 ' + sq.quests.length);
    });
  }
  private openSquad(i: number): void {
    if (this.modal) return;
    this.g.selected = i;
    const sq = this.g.squads[i]; const st = sq.leader.stats;
    const w = this.win(400, 226, sq.name + ' — ' + sq.leader.race + ' · ' + sq.leader.role);
    w.portrait(6, 4, 40, 48, sq.id, sq.leader.name);
    const where = sq.siteId ? this.g.world.site(sq.siteId).name : (this.g.world.site((sq.pos as any).to).name + '로 이동 중');
    w.small(52, 4, where + '  ·  ' + (sq.order === 'move' ? '이동' : sq.order === 'stay' ? '체재' : sq.order === 'build' ? '공사' : '대기') + '  ·  대열 ' + (FORMATION_BY_ID.get(sq.formation)?.name ?? sq.formation), { color: C.gold });
    w.small(52, 16, 'HP ' + st.hp + '/' + st.maxHp + ' · 공격 ' + attackOf(sq.leader) + ' · 방어 ' + defenseOf(sq.leader) + ' · ' + levelOf(st.e) + '단계 · 피로 ' + st.f + ' · 상업 ' + st.t + ' · 공연 ' + st.p + ' · 건축 ' + st.b);
    w.small(52, 28, '대원 ' + sq.members.length + '/8 · 급료 ' + fmt(sq.wages) + '/월 · 전투력 ' + Math.round(sq.power), { color: C.grey });
    const cargo = Object.entries(sq.cargo);
    let y = 40 + w.small(52, 40, '짐 ' + sq.load + '/' + sq.capacity + ': ' + (cargo.length ? cargo.map(([g, n]) => goodName(g) + ' ' + n).join(', ') : '없음'), { wordWrap: { width: 336 } }).height + 2;
    const qs = sq.quests.map(id => this.g.activeQuests.get(id)!).filter(Boolean);
    y += w.small(52, y, '의뢰: ' + (qs.length ? qs.map(q => CIVIL_JOB_LABEL[q.job] + '→' + this.g.world.site(q.to).name + '(' + (q.deadline - this.g.day) + '일)').join(', ') : '없음'), { wordWrap: { width: 336 } }).height + 2;
    if (sq.auto) y += w.small(52, y, '왕복 교역: ' + this.g.world.site(sq.auto.from).name + ' ↔ ' + this.g.world.site(sq.auto.to).name + ' ' + goodName(sq.auto.good) + ' · ' + sq.auto.trips + '회 · 판 돈 ' + fmt(sq.auto.earned) + '골', { color: C.gold, wordWrap: { width: 336 } }).height + 2;
    if (sq.work) y += w.small(52, y, '건축: ' + sq.work.name + ' ' + Math.min(100, Math.round(sq.work.progress / sq.work.work * 100)) + '% (건축력 ' + sq.buildSkill + '/일)', { color: C.gold }).height + 2;
    // 대원 목록: 3줄 × 3칸 (이름 · HP · 피로)
    y = Math.max(y + 4, 58);
    w.small(6, y, '대원', { color: C.gold }); y += 12;
    if (!sq.members.length) w.small(6, y, '아직 대원이 없다 — 마을의 «용병 고용»에서 뽑는다', { color: C.grey });
    sq.members.slice(0, 8).forEach((p, k) => {
      const hurt = p.stats.hp < p.stats.maxHp * 0.5;
      w.small(6 + (k % 3) * 130, y + Math.floor(k / 3) * 12, shortName(p.name, 5) + ' ' + p.role.slice(0, 3) + levelOf(p.stats.e) + ' ' + p.stats.hp + '/' + p.stats.maxHp + ' 피로' + p.stats.f, { color: hurt ? C.red : C.paper });
    });
    const by = w.bodyH - 28;
    w.button(6, by, '지도에서 보기', () => { w.close(); this.map.focusSquad(i); }, { w: 110, h: 24 });
    w.button(122, by, sq.auto ? '왕복 그만' : sq.order === 'move' ? '정지' : '대기', () => { this.g.stay(i); w.close(); }, { w: 80, h: 24 });
    w.button(208, by, '부대원 편성', () => { w.close(); openRoster(this); }, { w: 110, h: 24, disabled: !sq.siteId });
  }
  private openLedger(): void {
    if (this.modal) return;
    const l = this.g.ledger; const w = this.win(280, 170, '장부');
    w.text(6, 4, '부채  ' + fmt(l.debt) + '골', { color: C.red });
    w.text(6, 18, '소지금  ' + fmt(l.cash) + '골', { color: C.white });
    w.small(6, 36, '지금까지 갚은 돈 ' + fmt(l.repaid) + '  ·  미납 ' + l.missed + '회', { color: C.paperDark });
    INCOME_SOURCES.forEach((s, i) => w.small(6, 50 + i * 10, INCOME_LABEL[s] + '으로 번 돈  ' + fmt(l.earned[s]), { color: s === l.endingSource && l.earned[s] > 0 ? C.gold : C.paper }));
    w.small(150, 50, '상품 매입 ' + fmt(l.spent.goods), { color: C.grey });
    const wages = this.g.squads.reduce((a, s) => a + s.wages, 0); const toWage = this.g.clock.day === 1 ? 0 : BALANCE.daysPerMonth - this.g.clock.day + 1;
    w.small(150, 60, '급료 ' + fmt(wages) + '/월 (' + (toWage ? toWage + '일 뒤' : '오늘') + ')', { color: wages > l.cash ? C.red : C.grey });
    w.small(6, 106, '집행관은 상환일에 스스로 온다. 추가 상환은 그때. 급료는 매달 1일.', { color: C.grey });
    w.button(w.bw - 104, w.bodyH - 28, '요새 보고', () => { w.close(); openForts(this); }, { w: 92, h: 22 });
    w.button(w.bw - 200, w.bodyH - 28, '시세 수첩', () => openNotebook(this), { w: 92, h: 22 });
  }
  /** 소식: 최근 것부터 아래에 쌓이고, 위로 밀면 지난 소식 */
  private openLog(): void {
    if (this.modal) return;
    const w = this.full('소식');
    const all = this.g.messages.slice(-80);
    const style = (m: (typeof all)[number]) => ({ color: m.kind === 'money' ? C.gold : m.kind === 'collector' || m.kind === 'warn' || m.kind === 'fort' ? C.red : m.kind === 'quest' ? C.green : m.kind === 'battle' ? '#e0a070' : C.paper, wordWrap: { width: 446 } });
    const AREA = w.bodyH - 34;
    // 끝(가장 최근)에서 거슬러 한 화면에 드는 개수
    const fitFrom = (end: number) => { let h = 0, n = 0; for (let i = end - 1; i >= 0; i--) { const t = this.make.text({ text: '[' + all[i].day + '일] ' + all[i].text, style: { ...TEXT_SMALL, ...style(all[i]) }, add: false }); h += t.height + 2; t.destroy(); if (h > AREA) break; n++; } return Math.max(1, n); };
    const vis = fitFrom(all.length);
    let top = Math.max(0, all.length - vis);
    const render = () => {
      w.clearBody();
      let y = 4;
      for (let i = top; i < all.length; i++) {
        const t = w.small(6, y, '[' + all[i].day + '일] ' + all[i].text, style(all[i]));
        if (y + t.height > AREA) { t.destroy(); break; }
        y += t.height + 2;
      }
      w.scroll({ x: 4, y: 2, w: 458, h: AREA, rowH: 14, count: all.length, rows: vis, get: () => top, set: v => { top = v; }, redraw: render });
      w.button(w.bw - 112, w.bodyH - 28, '요새 보고', () => { w.close(); openForts(this); }, { w: 96, h: 22 });
      w.small(6, w.bodyH - 22, '위아래로 밀면 지난 소식', { color: C.grey });
    };
    render();
    this.g.unread = 0;
  }
  private openSystem(): void {
    const w = this.win(300, 212, '시스템');
    const end = w.menu([
      { label: '지금 저장', onClick: () => { this.toast(saveGame(this.g) ? '저장했다.' : '저장 실패'); } },
      { label: '저장 칸 (3)', onClick: () => openSlots(this) },
      { label: '도움말', onClick: () => openHelp(this) },
      { label: '음악 ' + (AUDIO.musicOn ? '끄기' : '켜기'), onClick: () => { AUDIO.setMusic(!AUDIO.musicOn); w.close(); this.openSystem(); } },
      { label: '효과음 ' + (AUDIO.sfxOn ? '끄기' : '켜기'), onClick: () => { AUDIO.setSfx(!AUDIO.sfxOn); w.close(); this.openSystem(); } },
      { label: '속도 측정 ' + (this.perfOn ? '끄기' : '켜기'), onClick: () => { this.setPerf(!this.perfOn); w.close(); this.openSystem(); } },
      { label: '새 게임', onClick: () => startNewGame() },
      { label: '닫기', onClick: () => w.close() },
    ], { cols: 2 });
    w.small(6, end + 2, '시제품 · 설계 ' + W + '×' + H + ' · 렌더 ×' + K + '\n자동 저장: 탭을 숨길 때, 30초마다', { color: C.grey });
  }
  /**
   * 속도 측정(시스템 창에서 켬): 왼쪽에 1초당 화면 수·한 화면 계산 시간·그래픽 칩 이름을 띄운다.
   * 실제 폰에서 어디가 느린지 사용자가 숫자로 알려 줄 수 있게(2026-11-08).
   */
  perfOn = false;
  private perfText?: Phaser.GameObjects.Text;
  private perfAcc = { n: 0, js: 0, worst: 0, last: 0, t0: 0 };
  private gpuName = '';
  setPerf(on: boolean): void {
    this.perfOn = on; try { localStorage.setItem('md-perf', on ? '1' : ''); } catch { /* 저장 못 해도 이번 판엔 켜진다 */ }
    if (!on) { this.perfText?.destroy(); this.perfText = undefined; return; }
    if (this.perfText) return;
    this.perfText = this.add.text(2, H - 33, '측정 중…', { ...TEXT_SMALL, color: '#7cff7c', backgroundColor: '#000c', padding: { x: 2, y: 1 } }).setOrigin(0, 1).setDepth(500);
    // game.step 은 시작할 때 묶여 버려 바꿔 끼워도 소용없다 → 엔진의 단계 신호로 잰다
    const acc = this.perfAcc; const game = this.game as Phaser.Game & { __perfHooked?: boolean };
    if (!game.__perfHooked) {
      game.__perfHooked = true; let t0 = 0;
      game.events.on(Phaser.Core.Events.PRE_STEP, (time: number) => { t0 = performance.now(); if (acc.last) acc.worst = Math.max(acc.worst, time - acc.last); acc.last = time; });
      game.events.on(Phaser.Core.Events.POST_RENDER, () => { if (t0) { acc.n++; acc.js += performance.now() - t0; } });
    }
    acc.t0 = performance.now(); acc.n = acc.js = acc.worst = 0;
    try { const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl; const ext = gl?.getExtension('WEBGL_debug_renderer_info'); this.gpuName = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 40) : ''; } catch { this.gpuName = ''; }
  }
  private perfTick(): void {
    if (!this.perfText) return; const a = this.perfAcc; const now = performance.now(); if (now - a.t0 < 1000 || !a.n) return;
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    this.perfText.setText(`${(a.n * 1000 / (now - a.t0)).toFixed(0)}화면/초 · 계산 ${(a.js / a.n).toFixed(1)}ms · 가장 긴 틈 ${a.worst.toFixed(0)}ms
${webgl ? 'WebGL' : '캔버스'} ${this.game.canvas.width}×${this.game.canvas.height}` + (this.gpuName ? ' · ' + this.gpuName : ''));
    a.t0 = now; a.n = a.js = a.worst = 0;
  }
  private toastText?: Phaser.GameObjects.Text;
  toast(s: string): void {
    this.toastText?.destroy();
    this.toastText = this.add.text(W / 2, 30, s, { ...TEXT, backgroundColor: '#000a', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(200);
    this.time.delayedCall(1500, () => this.toastText?.destroy());
  }
  /** 중요한 소식(함락·습격·급료·단계 상승 …)은 한 줄 띠로 지나가지 않고 화면 위에 잠깐 큼직하게 띄운다 */
  private alertBox?: Phaser.GameObjects.Container; private seenMsgs = 0;
  private alert(m: GameMessage): void {
    this.alertBox?.destroy();
    const red = m.kind === 'fort' || m.kind === 'warn' || m.kind === 'collector'; const gold = m.kind === 'money' || m.text.startsWith('★') || m.text.startsWith('단계');
    const t = this.add.text(0, 0, m.text, { ...TEXT_SMALL, color: C.white, wordWrap: { width: 300 } });
    const bw = t.width + 14, bh = t.height + 10;
    const bg = this.add.rectangle(0, 0, bw, bh, 0x1a140e, 0.95).setOrigin(0).setStrokeStyle(1, red ? 0xd0584c : gold ? 0xe0b23c : 0x8a7a64);
    t.setPosition(7, 5);
    const c = this.add.container(Math.round((W - bw) / 2), 46, [bg, t]).setDepth(240).setAlpha(0);
    this.alertBox = c;
    this.tweens.add({ targets: c, alpha: 1, y: 44, duration: 150 });
    this.time.delayedCall(3800, () => { if (this.alertBox === c) this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => { c.destroy(); if (this.alertBox === c) this.alertBox = undefined; } }); });
    AUDIO.sfx(red ? 'deny' : 'event', 0.3);
  }
  private isAlert(m: GameMessage): boolean {
    if (m.kind === 'warn' || m.kind === 'ending') return true;
    if (m.kind === 'fort') return /함락|되찾|진을 쳤다/.test(m.text);
    if (m.kind === 'battle') return /덮쳤다|습격|전사:/.test(m.text);
    if (m.kind === 'money') return /완공|탈환|토벌 완수/.test(m.text);
    return m.text.startsWith('★') || m.text.startsWith('단계 상승');
  }

  // ───── 매 프레임 ─────
  update(time: number): void {
    const g = this.g; const c = g.clock;
    this.tutorial.update(time);
    this.perfTick();
    // 시계: 반원 황금 시계 + 바늘(원작 좌하)
    const clockKey = Math.round(c.frac * 64); if (clockKey !== this.clockKey) { this.clockKey = clockKey;
    const gfx = this.clockGfx; gfx.clear();
    const cx = 15, cy = H - 7, R = 11;
    gfx.fillStyle(0x3a2e1a).slice(cx, cy, R, Math.PI, 0, false).fillPath();
    gfx.lineStyle(1, C.border).beginPath().arc(cx, cy, R, Math.PI, 0, false).strokePath();
    for (let i = 0; i <= 4; i++) { const a = Math.PI + (Math.PI * i) / 4; gfx.lineStyle(1, 0xe0b23c).lineBetween(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    const a = Math.PI + Math.PI * c.frac; gfx.lineStyle(1, 0xffffff).lineBetween(cx, cy, cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); }
    this.dateText.setText(GameClock.format(c.date));
    const due = c.daysToRepayment;
    // setColor 는 같은 색이어도 글자 그림을 새로 만들어 그래픽 칩에 다시 올린다 → 바뀔 때만(폰 버벅임 원인, 2026-11-08)
    const dueCol = due <= 1 ? C.red : C.paperDark;
    this.dueText.setText(due === 0 ? '오늘 상환일!' : '상환까지 ' + due + '일'); if (this.dueText.style.color !== dueCol) this.dueText.setColor(dueCol);
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
      if (!on) { if (s.barKey !== '') { s.bars.clear(); s.barKey = ''; } return; }
      const dest = sq.destination;
      const nl = this.slotW >= 50 ? 4 : 3; const where = g.battleSquad === i ? '교전' : sq.order === 'move' && dest ? (sq.auto ? '↔' : '→') + g.world.site(dest).name.slice(0, nl - 1) : sq.order === 'build' ? '공사' : (sq.siteId ? g.world.site(sq.siteId).name.slice(0, nl) : '…');
      if (s.stateKey !== where) { // 칸 폭에 맞춰 뒤를 자른다(이름이 칸 테두리를 넘지 않게)
        s.stateKey = where; const room = this.slotW - (this.slotW >= 50 ? 26 : 19) - 2; let t = where; s.state.setText(t);
        while (s.state.width > room && t.length > 1) { t = t.slice(0, -1); s.state.setText(t); }
        s.state.setColor(g.battleSquad === i ? C.red : C.paperDark);
      }
      const hp = sq.people.reduce((t, p) => t + p.stats.hp, 0) / Math.max(1, sq.people.reduce((t, p) => t + p.stats.maxHp, 0));
      const tx = this.slotW >= 50 ? 26 : 19; const bw = this.slotW - tx - 3; const bx = s.x + tx, by = s.y + 22;
      const barKey = Math.round(bw * hp) + ':' + sq.members.length; if (barKey === s.barKey) return; s.barKey = barKey; s.bars.clear();
      s.bars.fillStyle(0x1a1c2c).fillRect(bx, by, bw, 2).fillStyle(hp > 0.5 ? 0x5f9a3c : hp > 0.25 ? 0xd0b040 : 0xd04040).fillRect(bx, by, Math.round(bw * hp), 2);
      s.bars.fillStyle(0x1a1c2c).fillRect(bx, by + 3, bw, 1).fillStyle(0xe0b23c).fillRect(bx, by + 3, Math.round(bw * Math.min(1, sq.members.length / 8)), 1);
    });
    // 새 소식 가운데 중요한 것은 위에 띄운다(전투 화면·대화창이 떠 있을 때는 띄우지 않고 넘긴다)
    if (this.seenMsgs > g.messages.length) this.seenMsgs = g.messages.length; // 200개 넘어 앞이 잘렸을 때
    while (this.seenMsgs < g.messages.length) { const m = g.messages[this.seenMsgs++]; if (!g.battle && !g.event && this.isAlert(m)) this.alert(m); }
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
