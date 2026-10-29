import Phaser from 'phaser';
import type { Game } from '../../core/game';
import type { Site } from '../../core/world';
import { TERRAIN_COLOR } from '../../data/world';
import { C, H, ICON, K, REGION_COLOR, SITE_COLOR, TEXT, TEXT_SMALL, UNIT_FRAME, W, siteIcon } from '../theme';

// 카메라 배율은 캔버스(×K) 기준. 설계값 ×K
const REGION_ZOOM = 4 * K;
const WORLD_ZOOM = 1.2 * K;
const MIN_ZOOM = WORLD_ZOOM, MAX_ZOOM = 6 * K;
const CW = W * K, CH = H * K;

/**
 * 지역 지도 = 화면 전체(GDD §7.1). 세계 지도는 같은 장면에서 카메라를 빼는 것뿐이다.
 * 거점·부대 표시는 카메라 배율의 역수로 스케일해 화면에서 항상 같은 크기로 보인다.
 */
export class MapScene extends Phaser.Scene {
  game_!: Game;
  mode: 'region' | 'world' = 'region';
  regionId = 'reg_r06';
  private siteMarkers = new Map<string, Phaser.GameObjects.Container>();
  private siteLabels = new Map<string, Phaser.GameObjects.Text>();
  private squadMarkers: Phaser.GameObjects.Container[] = [];
  private regionLabels: Phaser.GameObjects.Container[] = [];
  private bandMarkers = new Map<string, Phaser.GameObjects.Container>();
  private heldFlags = new Map<string, Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image>();
  private pathGfx!: Phaser.GameObjects.Graphics;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  /** UI 장면이 창을 띄웠을 때 지도 입력을 막는다 */
  inputBlocked = () => false;
  private inv = 1;
  uiHit: (x: number, y: number) => boolean = () => false;

  constructor() { super('map'); }

  create(): void {
    this.game_ = this.registry.get('game') as Game;
    const world = this.game_.world;
    this.drawTerrain();
    // 도로
    const roads = this.add.graphics();
    const dashed = (ax: number, ay: number, bx: number, by: number, step: number, w: number, col: number, al: number) => {
      const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k += 2) { const t0 = k / n, t1 = Math.min(1, (k + 1.2) / n); roads.lineStyle(w, col, al).lineBetween(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1); }
    };
    for (const e of world.edges) {
      if (e.sea) continue;
      const a = world.site(e.a), b = world.site(e.b);
      dashed(a.x, a.y + 0.25, b.x, b.y + 0.25, 1.6, 0.6, 0x2a1e14, 0.45);
      dashed(a.x, a.y, b.x, b.y, 1.6, 0.4, 0xf0dca8, 0.8);
    }
    // 항로(점선, 4단계)
    for (const e of world.seaEdges) {
      const a = world.site(e.a), b = world.site(e.b); const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 0; k < n; k += 2) { const t0 = k / n, t1 = Math.min(1, (k + 1) / n); roads.lineStyle(0.5, 0xcfe8ff, 0.6).lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1); }
    }
    this.pathGfx = this.add.graphics();
    // 거점
    for (const s of world.sites.values()) this.makeSiteMarker(s);
    // 지역 이름(세계 지도용)
    for (const r of world.regions.values()) {
      const b = world.regionBounds(r.id);
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      const c = this.add.container(cx, cy);
      const bg = this.add.rectangle(0, 0, 66, 13, 0x1e1812, 0.78).setStrokeStyle(1, REGION_COLOR[r.id] ?? C.border);
      const t = this.add.text(0, 0, r.name, TEXT).setOrigin(0.5);
      c.add([bg, t]); c.setDepth(20); (c as any).regionId = r.id; (c as any).label = t;
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        if (this.drag?.moved) return; ev.stopPropagation(); this.showRegion(r.id);
      });
      this.regionLabels.push(c);
    }
    // 부대
    this.game_.squads.forEach((sq, i) => {
      const c = this.add.container(0, 0).setDepth(30);
      if (this.textures.exists('units')) {
        const shadow = this.add.ellipse(0, 0, 8, 3, 0x000000, 0.45);
        const body = this.add.image(0, -7, 'units', UNIT_FRAME[sq.id] ?? 0).setOrigin(0.5);
        const flag = this.add.image(5, -18, 'icons', ICON.flagBlue).setOrigin(0, 0.5);
        const num = this.add.text(9, -18.5, String(i + 1), { ...TEXT_SMALL, color: '#fff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5);
        c.add([shadow, body, flag, num]);
        (c as any).flag = flag; (c as any).sprite = true;
        (c as any).num = num;
      } else {
        const pole = this.add.rectangle(0, -10, 1, 11, 0x222222).setOrigin(0, 0);
        const flag = this.add.rectangle(1, -10, 9, 7, C.flag).setOrigin(0, 0).setStrokeStyle(1, 0x111111);
        const num = this.add.text(5.5, -6.5, String(i + 1), { ...TEXT_SMALL, color: '#fff' }).setOrigin(0.5);
        const dot = this.add.rectangle(0, 0, 3, 3, 0x111111).setOrigin(0.5);
        c.add([dot, pole, flag, num]);
        (c as any).flag = flag;
      }
      if (!(c as any).num) (c as any).num = c.list[3];
      this.squadMarkers.push(c);
    });
    this.setupInput();
    const startRegion = world.site(this.game_.squad.siteId ?? this.game_.squad.destination ?? 'C028').region;
    this.showRegion(startRegion);
  }

  private drawTerrain(): void {
    const m = this.game_.world.map;
    if (!m) return;
    // 도트 대륙 지도(《균열의 시대》 손그림 지도를 4px/칸 도트로, tools/pixel-map.mjs). 격자 320×220 에 맞춘다.
    if (this.textures.exists('mappx')) {
      this.textures.get('mappx').setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.add.image(0, 0, 'mappx').setOrigin(0).setDisplaySize(m.width, m.height).setDepth(-10);
      return;
    }
    const tex = this.textures.createCanvas('terrain', m.width, m.height)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(m.width, m.height);
    for (let y = 0; y < m.height; y++) {
      const row = m.terrain[y];
      for (let x = 0; x < m.width; x++) {
        const col = TERRAIN_COLOR[row[x]] ?? 0xff00ff;
        // 살짝 잡음을 섞어 단색 덩어리로 보이지 않게
        const n = ((x * 7 + y * 13) % 5) - 2;
        const i = (y * m.width + x) * 4;
        img.data[i] = clamp8(((col >> 16) & 255) + n * 3); img.data[i + 1] = clamp8(((col >> 8) & 255) + n * 3); img.data[i + 2] = clamp8((col & 255) + n * 3); img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    this.add.image(0, 0, 'terrain').setOrigin(0).setDepth(-10);
  }

  private makeSiteMarker(s: Site): void {
    const c = this.add.container(s.x, s.y).setDepth(10);
    const size = s.kind === 'castle' ? 5 + s.size : s.kind === 'gate' ? 5 : 4;
    const color = SITE_COLOR[s.kind] ?? 0xffffff;
    const owner = s.owner ? this.game_.world.factions.get(s.owner) : undefined;
    const ownerColor = owner?.color ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0x333333;
    const sprite = this.textures.exists('icons');
    const ring = sprite ? this.add.ellipse(0, 1, 12, 4, 0x000000, 0.35) : this.add.rectangle(0, 0, size + 4, size + 4, ownerColor, 0.9).setOrigin(0.5);
    const box: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = sprite
      ? (this.textures.exists('sites')
        ? this.add.image(0, 3, 'sites', siteIcon(s.kind, s.size)).setOrigin(0.5, 1).setScale(s.kind !== 'castle' ? 0.31 : s.size >= 5 ? 0.46 : s.size >= 3 ? 0.39 : 0.34)
        : this.add.image(0, -5, 'icons', siteIcon(s.kind, s.size)).setOrigin(0.5))
      : this.add.rectangle(0, 0, size, size, color).setOrigin(0.5).setStrokeStyle(1, 0x111111);
    // 잿빛 교단 점령지는 빨간 깃발(GDD §7.1). 함락·탈환에 따라 켜고 끈다
    const f = sprite
      ? this.add.image(7, -14, 'icons', ICON.flagRed).setOrigin(0.5).setVisible(this.game_.enemyHeld.has(s.id))
      : this.add.rectangle(size / 2 + 1, -size / 2 - 3, 5, 4, C.enemy).setOrigin(0, 0).setVisible(this.game_.enemyHeld.has(s.id));
    this.heldFlags.set(s.id, f as Phaser.GameObjects.Rectangle);
    const label = this.add.text(0, sprite ? 3 : size / 2 + 2, s.name, { ...TEXT_SMALL, color: s.kind === 'castle' ? '#fbf3dc' : '#e4d6b4', stroke: '#21180f', strokeThickness: 2 }).setOrigin(0.5, 0);
    c.add([ring, box, f, label]);
    const big = box instanceof Phaser.GameObjects.Image && box.texture.key === 'sites';
    if (sprite) box.setInteractive({ hitArea: big ? new Phaser.Geom.Rectangle(-8, 0, 64, 80) : new Phaser.Geom.Rectangle(-6, -2, 28, 30), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    else box.setInteractive({ useHandCursor: true });
    box.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      if (this.drag?.moved) return; ev.stopPropagation(); this.events.emit('site-click', s.id);
    });
    this.siteMarkers.set(s.id, c); this.siteLabels.set(s.id, label);
  }

  private setupInput(): void {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.inputBlocked() || this.uiHit(p.x, p.y)) return;
      this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved) { cam.scrollX = this.drag.sx - dx / cam.zoom; cam.scrollY = this.drag.sy - dy / cam.zoom; this.clampCamera(); }
    });
    this.input.on('pointerup', () => { const d = this.drag; this.time.delayedCall(0, () => { if (this.drag === d) this.drag = null; }); });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inputBlocked()) return;
      const before = cam.getWorldPoint(p.x, p.y);
      this.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.8 : 1.25), MIN_ZOOM, MAX_ZOOM));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y; this.clampCamera();
    });
    // 두 손가락 확대(폰)
    let pinch: number | null = null;
    this.input.on('pointermove', () => {
      const ps = this.input.manager.pointers.filter(q => q.isDown && q.id > 0);
      if (ps.length >= 2) {
        const d = Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
        if (pinch) this.setZoom(Phaser.Math.Clamp(cam.zoom * (d / pinch), MIN_ZOOM, MAX_ZOOM));
        pinch = d; this.drag = null;
      } else pinch = null;
    });
  }

  /** 카메라 중심이 지도 밖으로 나가지 않게. Phaser 의 scroll 은 배율과 무관하게 "중심 = scroll + 화면/2" 다. */
  private clampCamera(): void {
    const cam = this.cameras.main; const m = this.game_.world.map; if (!m) return;
    const vw = CW / cam.zoom, vh = CH / cam.zoom;
    const cx = cam.scrollX + CW / 2, cy = cam.scrollY + CH / 2;
    const nx = vw >= m.width ? m.width / 2 : Phaser.Math.Clamp(cx, vw / 2, m.width - vw / 2);
    const ny = vh >= m.height ? m.height / 2 : Phaser.Math.Clamp(cy, vh / 2, m.height - vh / 2);
    cam.centerOn(nx, ny);
  }

  setZoom(z: number): void {
    const cam = this.cameras.main; cam.setZoom(z);
    const inv = K / z; // 표식은 화면에서 항상 같은 크기(설계 px × K)
    for (const c of this.siteMarkers.values()) c.setScale(inv);
    for (const c of this.squadMarkers) c.setScale(inv * 0.8);
    this.inv = inv;
    for (const c of this.regionLabels) c.setScale(inv);
    for (const c of this.bandMarkers.values()) c.setScale(inv);
    const worldish = z < 2.2 * K;
    this.mode = worldish ? 'world' : 'region';
    // 작은 거점(광산·항구·사원·교역소) 이름은 많이 확대했을 때만
    for (const [id, l] of this.siteLabels) { const k = this.game_.world.site(id).kind; l.setVisible(!worldish && (k === 'castle' || k === 'gate' || k === 'rift' || z >= 4.5 * K)); }
    for (const c of this.regionLabels) c.setVisible(worldish);
    // 세계 지도에선 성만 보인다
    for (const [id, c] of this.siteMarkers) c.setVisible(!worldish || this.game_.world.site(id).kind === 'castle');
    this.events.emit('zoom', z);
  }

  showRegion(regionId: string): void {
    this.regionId = regionId;
    const b = this.game_.world.regionBounds(regionId);
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(Math.min(CW / (b.maxX - b.minX + 30), CH / (b.maxY - b.minY + 30)), 2.5 * K, REGION_ZOOM);
    this.setZoom(z);
    cam.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2); this.clampCamera();
    this.events.emit('region', regionId);
  }
  showWorld(): void {
    const m = this.game_.world.map!;
    this.setZoom(WORLD_ZOOM); this.cameras.main.centerOn(m.width / 2, m.height / 2); this.clampCamera();
  }
  focusSquad(i: number): void {
    const sq = this.game_.squads[i];
    const p = sq.position(id => this.game_.world.site(id));
    const r = this.game_.world.site(sq.siteId ?? (sq.pos as any).to).region;
    if (this.mode === 'world' || this.regionId !== r) { this.regionId = r; this.setZoom(REGION_ZOOM); this.events.emit('region', r); }
    this.cameras.main.centerOn(p.x, p.y); this.clampCamera();
  }
  focusSite(id: string): void {
    const s = this.game_.world.site(id);
    if (this.mode === 'world') { this.setZoom(REGION_ZOOM); }
    this.regionId = s.region; this.events.emit('region', s.region);
    this.cameras.main.centerOn(s.x, s.y); this.clampCamera();
  }

  update(_t: number, delta: number): void {
    const g = this.game_;
    g.tick(Math.min(delta, 100) / 1000);
    // 부대 위치·선택 표시
    g.squads.forEach((sq, i) => {
      const c = this.squadMarkers[i];
      if (!g.isActive(i)) { if (c.visible) c.setVisible(false); return; }
      const p = sq.position(id => g.world.site(id));
      // 같은 거점의 부대는 표식 하나(번호를 모아 적는다). 선택된 부대가 있으면 그 부대가 대표
      const here = sq.siteId ? g.squads.map((o, j) => j).filter(j => g.isActive(j) && g.squads[j].siteId === sq.siteId) : [i];
      const lead = here.includes(g.selected) ? g.selected : here[0];
      c.setVisible(lead === i);
      if (lead !== i) return;
      const numT = (c as any).num as Phaser.GameObjects.Text | undefined; const want = here.map(j => j + 1).join('·');
      if (numT && numT.text !== want) numT.setText(want).setOrigin(0, 0.5).setX(6);
      // 거점 위에 있으면 성 그림 왼쪽 아래에 비켜 선다(성을 누를 수 있게)
      const off = sq.siteId ? 11 * this.inv : 0;
      c.setPosition(p.x - off, p.y + off * 0.35);
      const fl = (c as any).flag; if ((c as any).sprite) (fl as Phaser.GameObjects.Image).setFrame(i === g.selected ? ICON.flagGold : ICON.flagBlue); else (fl as Phaser.GameObjects.Rectangle).setFillStyle(i === g.selected ? C.flagSel : C.flag);
    });
    // 막힌 지역은 세계 지도에서 흐리게 + 자물쇠
    for (const c of this.regionLabels) { const rid = (c as any).regionId as string; const locked = g.blocked.has(rid); const t = (c as any).label as Phaser.GameObjects.Text; const want = (locked ? '🔒 ' : '') + (g.world.regions.get(rid)?.name ?? ''); if (t.text !== want) { t.setText(want); c.setAlpha(locked ? 0.55 : 1); } }
    // 점령지 깃발
    for (const [id, f] of this.heldFlags) { const held = g.enemyHeld.has(id); if (f.visible !== held) f.setVisible(held); }
    // 적 무리(도적단) 빨간 깃발
    for (const b of g.bands) {
      if (this.bandMarkers.has(b.id)) continue;
      const site = g.world.site(b.site);
      const c = this.add.container(site.x, site.y).setDepth(25).setScale(K / this.cameras.main.zoom);
      if (this.textures.exists('units')) {
        const sh = this.add.ellipse(4, 0, 8, 3, 0x000000, 0.45);
        const body = this.add.image(4, -7, 'units', b.kind === 'rebel' ? UNIT_FRAME.rebel : UNIT_FRAME.bandit).setOrigin(0.5);
        const flag = this.add.image(8, -19, 'icons', b.kind === 'rebel' ? ICON.flagPurple : ICON.flagRed).setOrigin(0, 0.5);
        c.add([sh, body, flag]);
      } else {
        const pole = this.add.rectangle(3, -12, 1, 12, 0x222222).setOrigin(0, 0);
        const flag = this.add.rectangle(4, -12, 9, 7, b.kind === 'rebel' ? 0x8a3a8a : C.enemy).setOrigin(0, 0).setStrokeStyle(1, 0x111111);
        const t = this.add.text(8.5, -8.5, b.kind === 'rebel' ? '†' : '!', { ...TEXT_SMALL, color: '#fff' }).setOrigin(0.5);
        c.add([pole, flag, t]);
      }
      this.bandMarkers.set(b.id, c);
    }
    for (const [id, c] of this.bandMarkers) { const b = g.bands.find(x => x.id === id); if (!b) { c.destroy(); this.bandMarkers.delete(id); } else { const st = g.world.site(b.site); if (c.x !== st.x || c.y !== st.y) c.setPosition(st.x, st.y); } }
    // 선택 부대의 경로
    this.pathGfx.clear();
    const sq = g.squad;
    if (sq.order === 'move') {
      const pts = [sq.position(id => g.world.site(id))];
      if (sq.pos.kind === 'road') pts.push(g.world.site(sq.pos.to));
      for (const id of sq.path) pts.push(g.world.site(id));
      this.pathGfx.lineStyle(0.8, 0xffffff, 0.8);
      for (let k = 1; k < pts.length; k++) this.pathGfx.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
    }
  }
}

function clamp8(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }
