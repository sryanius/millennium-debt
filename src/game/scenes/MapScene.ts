import Phaser from 'phaser';
import type { Game } from '../../core/game';
import type { Site } from '../../core/world';
import { TERRAIN_COLOR } from '../../data/world';
import { C, H, REGION_COLOR, SITE_COLOR, TEXT, TEXT_SMALL, W } from '../theme';

const REGION_ZOOM = 4;
const WORLD_ZOOM = 1.2;
const MIN_ZOOM = WORLD_ZOOM, MAX_ZOOM = 6;

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
  private heldFlags = new Map<string, Phaser.GameObjects.Rectangle>();
  private pathGfx!: Phaser.GameObjects.Graphics;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  /** UI 장면이 창을 띄웠을 때 지도 입력을 막는다 */
  inputBlocked = () => false;
  uiHit: (x: number, y: number) => boolean = () => false;

  constructor() { super('map'); }

  create(): void {
    this.game_ = this.registry.get('game') as Game;
    const world = this.game_.world;
    this.drawTerrain();
    // 도로
    const roads = this.add.graphics();
    for (const e of world.edges) {
      if (e.sea) continue;
      const a = world.site(e.a), b = world.site(e.b);
      roads.lineStyle(1.2, C.roadDark, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const e of world.edges) {
      if (e.sea) continue;
      const a = world.site(e.a), b = world.site(e.b);
      roads.lineStyle(0.6, C.road, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    // 항로(점선, 4단계)
    for (const e of world.seaEdges) {
      const a = world.site(e.a), b = world.site(e.b); const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 0; k < n; k += 2) { const t0 = k / n, t1 = Math.min(1, (k + 1) / n); roads.lineStyle(0.7, 0x9fd0ff, 0.9).lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1); }
    }
    this.pathGfx = this.add.graphics();
    // 거점
    for (const s of world.sites.values()) this.makeSiteMarker(s);
    // 지역 이름(세계 지도용)
    for (const r of world.regions.values()) {
      const b = world.regionBounds(r.id);
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      const c = this.add.container(cx, cy);
      const bg = this.add.rectangle(0, 0, 64, 14, REGION_COLOR[r.id] ?? 0x555555, 0.85).setStrokeStyle(1, C.border);
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
      const pole = this.add.rectangle(0, -10, 1, 11, 0x222222).setOrigin(0, 0);
      const flag = this.add.rectangle(1, -10, 9, 7, C.flag).setOrigin(0, 0).setStrokeStyle(1, 0x111111);
      const num = this.add.text(5.5, -6.5, String(i + 1), { ...TEXT_SMALL, color: '#fff' }).setOrigin(0.5);
      const dot = this.add.rectangle(0, 0, 3, 3, 0x111111).setOrigin(0.5);
      c.add([dot, pole, flag, num]);
      (c as any).flag = flag;
      flag.setInteractive({ useHandCursor: true });
      flag.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        if (this.drag?.moved) return; ev.stopPropagation(); this.events.emit('squad-click', i);
      });
      this.squadMarkers.push(c);
    });
    this.setupInput();
    const startRegion = world.site(this.game_.squad.siteId ?? this.game_.squad.destination ?? 'C028').region;
    this.showRegion(startRegion);
  }

  private drawTerrain(): void {
    const m = this.game_.world.map;
    if (!m) return;
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
    const ring = this.add.rectangle(0, 0, size + 4, size + 4, owner?.color ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0x333333, 0.9).setOrigin(0.5);
    const box = this.add.rectangle(0, 0, size, size, color).setOrigin(0.5).setStrokeStyle(1, 0x111111);
    // 잿빛 교단 점령지는 빨간 깃발(GDD §7.1). 함락·탈환에 따라 켜고 끈다
    const f = this.add.rectangle(size / 2 + 1, -size / 2 - 3, 5, 4, C.enemy).setOrigin(0, 0).setVisible(this.game_.enemyHeld.has(s.id)); c.add(f); this.heldFlags.set(s.id, f);
    const label = this.add.text(0, size / 2 + 2, s.name, { ...TEXT_SMALL, color: s.kind === 'castle' ? C.white : C.paperDark, stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0);
    c.add([ring, box, label]);
    box.setInteractive({ useHandCursor: true });
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
    const vw = W / cam.zoom, vh = H / cam.zoom;
    const cx = cam.scrollX + W / 2, cy = cam.scrollY + H / 2;
    const nx = vw >= m.width ? m.width / 2 : Phaser.Math.Clamp(cx, vw / 2, m.width - vw / 2);
    const ny = vh >= m.height ? m.height / 2 : Phaser.Math.Clamp(cy, vh / 2, m.height - vh / 2);
    cam.centerOn(nx, ny);
  }

  setZoom(z: number): void {
    const cam = this.cameras.main; cam.setZoom(z);
    const inv = 1 / z;
    for (const c of this.siteMarkers.values()) c.setScale(inv);
    for (const c of this.squadMarkers) c.setScale(inv);
    for (const c of this.regionLabels) c.setScale(inv);
    for (const c of this.bandMarkers.values()) c.setScale(inv);
    const worldish = z < 2.2;
    this.mode = worldish ? 'world' : 'region';
    // 작은 거점(광산·항구·사원·교역소) 이름은 많이 확대했을 때만
    for (const [id, l] of this.siteLabels) { const k = this.game_.world.site(id).kind; l.setVisible(!worldish && (k === 'castle' || k === 'gate' || k === 'rift' || z >= 4.5)); }
    for (const c of this.regionLabels) c.setVisible(worldish);
    // 세계 지도에선 성만 보인다
    for (const [id, c] of this.siteMarkers) c.setVisible(!worldish || this.game_.world.site(id).kind === 'castle');
    this.events.emit('zoom', z);
  }

  showRegion(regionId: string): void {
    this.regionId = regionId;
    const b = this.game_.world.regionBounds(regionId);
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(Math.min(W / (b.maxX - b.minX + 30), H / (b.maxY - b.minY + 30)), 2.5, REGION_ZOOM);
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
      const p = sq.position(id => g.world.site(id));
      const c = this.squadMarkers[i];
      // 같은 자리 여러 부대는 조금씩 비껴 세운다
      const same = g.squads.filter((o, j) => j < i && o.siteId && o.siteId === sq.siteId).length;
      c.setPosition(p.x + same * 2.2, p.y - same * 0.6);
      ((c as any).flag as Phaser.GameObjects.Rectangle).setFillStyle(i === g.selected ? C.flagSel : C.flag);
    });
    // 막힌 지역은 세계 지도에서 흐리게 + 자물쇠
    for (const c of this.regionLabels) { const rid = (c as any).regionId as string; const locked = g.blocked.has(rid); const t = (c as any).label as Phaser.GameObjects.Text; const want = (locked ? '🔒 ' : '') + (g.world.regions.get(rid)?.name ?? ''); if (t.text !== want) { t.setText(want); c.setAlpha(locked ? 0.55 : 1); } }
    // 점령지 깃발
    for (const [id, f] of this.heldFlags) { const held = g.enemyHeld.has(id); if (f.visible !== held) f.setVisible(held); }
    // 적 무리(도적단) 빨간 깃발
    for (const b of g.bands) {
      if (this.bandMarkers.has(b.id)) continue;
      const site = g.world.site(b.site);
      const c = this.add.container(site.x, site.y).setDepth(25).setScale(1 / this.cameras.main.zoom);
      const pole = this.add.rectangle(3, -12, 1, 12, 0x222222).setOrigin(0, 0);
      const flag = this.add.rectangle(4, -12, 9, 7, b.kind === 'rebel' ? 0x8a3a8a : C.enemy).setOrigin(0, 0).setStrokeStyle(1, 0x111111);
      const t = this.add.text(8.5, -8.5, b.kind === 'rebel' ? '†' : '!', { ...TEXT_SMALL, color: '#fff' }).setOrigin(0.5);
      c.add([pole, flag, t]); this.bandMarkers.set(b.id, c);
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
