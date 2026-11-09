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
  private siteMarkers = new Map<string, Marker>();
  private siteLabels = new Map<string, Part>();
  private squadMarkers: Phaser.GameObjects.Container[] = [];
  private regionLabels: Phaser.GameObjects.Container[] = [];
  private bandMarkers = new Map<string, Phaser.GameObjects.Container>();
  private heldFlags = new Map<string, Part>();
  private pathGfx!: Phaser.GameObjects.Graphics;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  private vel = { x: 0, y: 0, t: 0, px: 0, py: 0 };
  /** 손을 뗀 뒤 미끄러지는 속도(세계 단위/ms) */
  private fling: { x: number; y: number } | null = null;
  /** UI 장면이 창을 띄웠을 때 지도 입력을 막는다 */
  inputBlocked = () => false;
  private inv = 1;
  uiHit: (x: number, y: number) => boolean = () => false;

  constructor() { super('map'); }

  create(): void {
    this.game_ = this.registry.get('game') as Game;
    const world = this.game_.world;
    this.drawTerrain();
    this.drawRoads();
    this.pathGfx = this.add.graphics();
    // 거점
    this.bakeLabels([...world.sites.values()]);
    for (const s of world.sites.values()) this.makeSiteMarker(s);
    // 지역 이름(세계 지도용)
    // 세계 지도에서 성 그림(약 18 세계 단위)과 겹치지 않는 자리를 고른다: 가운데부터 아래·위·옆 순으로 시험
    const castles = [...world.sites.values()].filter(st => st.kind === 'castle');
    const placed: [number, number][] = []; // 먼저 놓인 이름표(56×12 세계 단위)
    const labelSpot = (cx0: number, cy0: number): [number, number] => {
      const cands: [number, number][] = [];
      for (const dy of [0, 14, -14, 26, -26, 38]) for (const dx of [0, 28, -28, 56, -56]) cands.push([dx, dy]);
      let best: [number, number] = [cx0, cy0], bestN = Infinity;
      for (const [dx, dy] of cands) {
        const cx = cx0 + dx, cy = cy0 + dy;
        const n = castles.filter(st => Math.abs(st.x - cx) < 28 + 10 && Math.abs(st.y - cy) < 6 + 10).length * 1
          + placed.filter(([px, py]) => Math.abs(px - cx) < 58 && Math.abs(py - cy) < 13).length * 3;
        if (n < bestN) { bestN = n; best = [cx, cy]; if (n === 0) break; }
      }
      placed.push(best); return best;
    };
    for (const r of world.regions.values()) {
      const b = world.regionBounds(r.id);
      const [cx, cy] = labelSpot((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      const c = this.add.container(cx, cy);
      const bg = this.add.image(0, 0, this.tagTex(REGION_COLOR[r.id] ?? C.border)).setDisplaySize(66, 13);
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
        const ring = this.shadow(0, 0, 14, 6, 0.9).setTint(0xe0b23c); (c as any).ring = ring; c.add(ring); // 고른 부대 표시
        const shadow = this.shadow(0, 0, 8, 3, 0.45);
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

  /**
   * 길·항로 점선. 처음 한 번만 캔버스 그림(지도 1칸 = 6px)으로 구워 이미지 하나로 얹는다.
   * Graphics 로 두면 선 조각 수천 개를 매 프레임 다시 계산해서 폰에서 버벅였다(2026-11-08 측정).
   */
  private drawRoads(): void {
    const world = this.game_.world; const m = world.map; if (!m) return;
    const S = 6; const key = 'roads';
    if (!this.textures.exists(key)) {
      // 그림판은 CPU 캔버스로(willReadFrequently). GPU 가속 캔버스를 그대로 텍스처로 올리면
      // 안드로이드 WebView 에서 두 번째 실행부터 화면 전체가 검게 나왔다(2026-11-08 에뮬레이터 확인)
      const cv = document.createElement('canvas'); cv.width = m.width * S; cv.height = m.height * S;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.lineCap = 'butt';
      const line = (ax: number, ay: number, bx: number, by: number, w: number, color: string, dash: number[]) => {
        ctx.beginPath(); ctx.setLineDash(dash.map(d => d * S)); ctx.lineWidth = w * S; ctx.strokeStyle = color;
        ctx.moveTo(ax * S, ay * S); ctx.lineTo(bx * S, by * S); ctx.stroke();
      };
      for (const e of world.edges) {
        if (e.sea) continue;
        const a = world.site(e.a), b = world.site(e.b);
        line(a.x, a.y + 0.25, b.x, b.y + 0.25, 0.8, 'rgba(42,30,20,0.55)', [1.9, 1.3]);
        line(a.x, a.y, b.x, b.y, 0.5, 'rgba(250,236,190,0.95)', [1.9, 1.3]);
      }
      for (const e of world.seaEdges) {
        const a = world.site(e.a), b = world.site(e.b);
        line(a.x, a.y, b.x, b.y, 0.5, 'rgba(207,232,255,0.6)', [4, 4]);
      }
      this.textures.addCanvas(key, cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.add.image(0, 0, key).setOrigin(0).setDisplaySize(m.width, m.height).setDepth(-9);
  }

  /**
   * 지도 위 표식은 그림·글자로만 만든다(도형을 섞지 않는다).
   * 그림자 타원을 도형(Ellipse)으로 그리면 거점마다 "도형 그리기 ↔ 그림 그리기"를 오가며
   * 그래픽 칩에 명령이 거점당 2~3번씩, 한 화면에 100번 가까이 나갔다. 그림끼리는 한 번에 몰아 그린다(2026-11-08).
   * 캔버스는 CPU 캔버스로(drawRoads 주석 참고).
   */
  private shadow(x: number, y: number, w: number, h: number, alpha: number): Phaser.GameObjects.Image {
    const key = 'mshadow';
    if (!this.textures.exists(key)) {
      const cv = document.createElement('canvas'); cv.width = 36; cv.height = 12;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(18, 6, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
      this.textures.addCanvas(key, cv);
    }
    return this.add.image(x, y, key).setDisplaySize(w, h).setAlpha(alpha);
  }
  /** 세계 지도의 지역 이름표 바탕(어두운 판 + 지역색 테두리) */
  private tagTex(color: number): string {
    const key = 'mtag' + color.toString(16);
    if (!this.textures.exists(key)) {
      const S = K; const cv = document.createElement('canvas'); cv.width = 66 * S; cv.height = 13 * S;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = 'rgba(30,24,18,0.78)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0'); ctx.lineWidth = S; ctx.strokeRect(S / 2, S / 2, cv.width - S, cv.height - S);
      this.textures.addCanvas(key, cv);
    }
    return key;
  }

  /**
   * 화면 밖 거점 표식은 그리지 않는다(거점 150여 개 × 그림·이름·깃발). 폰에서 가장 무거운 부분이었다.
   * siteWant = 배율로 정한 "보여야 함", 실제 visible = siteWant && 화면 안.
   */
  private siteWant = new Map<string, boolean>();
  private cullKey = '';
  private cullSites(force = false): void {
    const cam = this.cameras.main; const v = cam.worldView;
    const key = Math.round(v.x * 4) + ',' + Math.round(v.y * 4) + ',' + Math.round(cam.zoom * 100);
    if (!force && key === this.cullKey) return; this.cullKey = key;
    const mx = 26 * this.inv, my = 30 * this.inv; // 표식 크기(설계 px)만큼 여유
    for (const [id, c] of this.siteMarkers) {
      const st = this.game_.world.site(id);
      const on = (this.siteWant.get(id) ?? true) && st.x > v.x - mx && st.x < v.right + mx && st.y > v.y - my && st.y < v.bottom + my;
      if (c.visible !== on) c.setVisible(on);
    }
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

  /**
   * 거점 이름을 처음 한 번 그림 한 장(글자 모음판)에 모아 굽는다. 이름마다 따로 된 글자 그림이면
   * 폰(엔진이 한 번에 그림 한 장만 묶는다)에서 이름 하나당 그리기 명령이 하나씩 나간다(2026-11-08).
   */
  private bakeLabels(sites: Site[]): void {
    const key = 'mlabels'; if (this.textures.exists(key)) return;
    const tmp = sites.map(s => this.make.text({ x: 0, y: 0, text: s.name, style: { ...TEXT_SMALL, color: s.kind === 'castle' ? '#fbf3dc' : '#e4d6b4', stroke: '#21180f', strokeThickness: 2 }, add: false }));
    const AW = 2048; let x = 0, y = 0, rowH = 0; const pos: [number, number, number, number][] = [];
    for (const t of tmp) {
      const cw = t.canvas.width, ch = t.canvas.height;
      if (x + cw > AW) { x = 0; y += rowH + 2; rowH = 0; }
      pos.push([x, y, cw, ch]); x += cw + 2; rowH = Math.max(rowH, ch);
    }
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = Math.max(1, y + rowH);
    const ctx = cv.getContext('2d', { willReadFrequently: true })!; // CPU 캔버스(drawRoads 주석)
    tmp.forEach((t, i) => ctx.drawImage(t.canvas, pos[i][0], pos[i][1]));
    const tex = this.textures.addCanvas(key, cv)!;
    sites.forEach((s, i) => tex.add(s.id, 0, ...pos[i]));
    tmp.forEach(t => t.destroy());
  }

  /**
   * 거점 표식 = 그림자·그림·깃발·이름. 거점마다 한 덩어리(Container)로 두지 않고 종류별 층(depth)으로 나눠
   * "그림자 전부 → 거점 그림 전부 → 깃발 → 이름 전부" 순으로 그린다. 같은 그림끼리 붙어 있어야 몰아 그린다.
   * 깊이: 그림자 9.6 · 거점 10.5(성 10.6, 겹치면 성이 눌림) · 깃발 10.7 · 이름 10.8 — 부대(30)·지역 이름표(20) 아래.
   */
  private makeSiteMarker(s: Site): void {
    const m = new Marker(s.x, s.y);
    const size = s.kind === 'castle' ? 5 + s.size : s.kind === 'gate' ? 5 : 4;
    const color = SITE_COLOR[s.kind] ?? 0xffffff;
    const owner = s.owner ? this.game_.world.factions.get(s.owner) : undefined;
    const ownerColor = owner?.color ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0x333333;
    const sprite = this.textures.exists('icons');
    m.add(sprite ? this.shadow(0, 1, 12, 4, 0.35) : this.add.rectangle(0, 0, size + 4, size + 4, ownerColor, 0.9).setOrigin(0.5), 9.6);
    const box: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = sprite
      ? (this.textures.exists('sites')
        ? this.add.image(0, 3, 'sites', siteIcon(s.kind, s.size)).setOrigin(0.5, 1).setScale(s.kind !== 'castle' ? 0.31 : s.size >= 5 ? 0.46 : s.size >= 3 ? 0.39 : 0.34)
        : this.add.image(0, -5, 'icons', siteIcon(s.kind, s.size)).setOrigin(0.5))
      : this.add.rectangle(0, 0, size, size, color).setOrigin(0.5).setStrokeStyle(1, 0x111111);
    m.add(box, s.kind === 'castle' ? 10.6 : 10.5);
    // 잿빛 교단 점령지는 빨간 깃발(GDD §7.1). 함락·탈환에 따라 켜고 끈다
    const f = sprite
      ? this.add.image(7, -14, 'icons', ICON.flagRed).setOrigin(0.5)
      : this.add.rectangle(size / 2 + 1, -size / 2 - 3, 5, 4, C.enemy).setOrigin(0, 0);
    const flag = m.add(f, 10.7, this.game_.enemyHeld.has(s.id));
    this.heldFlags.set(s.id, flag);
    const label = m.add(this.add.image(0, sprite ? 3 : size / 2 + 2, 'mlabels', s.id).setOrigin(0.5, 0).setScale(1 / K), 10.8);
    (label as any).baseOy = label.oy;
    const big = box instanceof Phaser.GameObjects.Image && box.texture.key === 'sites';
    if (sprite) box.setInteractive({ hitArea: big ? new Phaser.Geom.Rectangle(-8, 0, 64, 80) : new Phaser.Geom.Rectangle(-6, -2, 28, 30), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    else box.setInteractive({ useHandCursor: true });
    box.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      if (this.drag?.moved) return; ev.stopPropagation(); this.events.emit('site-click', s.id);
    });
    this.siteMarkers.set(s.id, m); this.siteLabels.set(s.id, label);
  }

  private setupInput(): void {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.fling = null; // 미끄러지던 지도는 손가락을 대면 멈춘다
      if (this.inputBlocked() || this.uiHit(p.x, p.y)) return;
      this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
      this.vel = { x: 0, y: 0, t: performance.now(), px: p.x, py: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved) { cam.scrollX = this.drag.sx - dx / cam.zoom; cam.scrollY = this.drag.sy - dy / cam.zoom; this.clampCamera(); }
      // 손가락 속도(화면 px/ms, 최근 움직임에 무게)
      const now = performance.now(), v = this.vel, dt = Math.max(1, now - v.t);
      const k = Math.min(1, dt / 50);
      v.x = v.x * (1 - k) + ((p.x - v.px) / dt) * k; v.y = v.y * (1 - k) + ((p.y - v.py) / dt) * k;
      v.t = now; v.px = p.x; v.py = p.y;
    });
    this.input.on('pointerup', () => {
      const d = this.drag; this.time.delayedCall(0, () => { if (this.drag === d) this.drag = null; });
      // 휙 밀고 놓으면 조금 더 미끄러진다(폰 지도처럼). 멈췄다 놓으면(80ms) 그대로
      const v = this.vel;
      if (d?.moved && performance.now() - v.t < 80 && Math.hypot(v.x, v.y) > 0.25) this.fling = { x: -v.x / cam.zoom, y: -v.y / cam.zoom };
    });
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
    const cam = this.cameras.main; cam.setZoom(z); this.fling = null;
    const inv = K / z; // 표식은 화면에서 항상 같은 크기(설계 px × K)
    for (const c of this.siteMarkers.values()) c.setScale(inv);
    for (const c of this.squadMarkers) c.setScale(inv * 0.8);
    this.inv = inv;
    for (const c of this.regionLabels) c.setScale(inv);
    for (const c of this.bandMarkers.values()) c.setScale(inv);
    const worldish = z < 2.2 * K;
    this.mode = worldish ? 'world' : 'region';
    // 작은 거점(광산·항구·사원·교역소) 이름은 많이 확대했을 때만
    for (const [id, l] of this.siteLabels) { const k = this.game_.world.site(id).kind; l.m.setOn(l, !worldish && (k === 'castle' || k === 'gate' || k === 'rift' || z >= 4.5 * K)); }
    for (const c of this.regionLabels) c.setVisible(worldish);
    this.unstackLabels(z);
    // 세계 지도에선 성만 보인다
    for (const id of this.siteMarkers.keys()) this.siteWant.set(id, !worldish || this.game_.world.site(id).kind === 'castle');
    this.cullSites(true);
    this.events.emit('zoom', z);
  }

  /**
   * 보이는 거점 이름이 서로 겹치면 뒤쪽 것을 한 줄(8px) 아래로 내린다. 배율이 바뀔 때마다 다시 계산.
   * 이름 폭은 구운 글자판의 조각 폭(K 배)에서 얻는다.
   */
  private unstackLabels(z: number): void {
    const inv = K / z;
    const on = [...this.siteLabels.entries()].filter(([, l]) => l.on).map(([id, l]) => { const st = this.game_.world.site(id); const img = l.o as Phaser.GameObjects.Image; const base = (l as any).baseOy as number; return { l, w: img.width / K, x: st.x / inv, y: st.y / inv + base, base }; });
    // 성(이름이 중요한 곳)부터, 그다음 왼쪽부터 놓는다
    on.sort((a, b) => a.x - b.x);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const e of on) {
      let row = 0;
      for (; row < 4; row++) {
        const y0 = e.y + row * 8, y1 = y0 + 9, x0 = e.x - e.w / 2, x1 = e.x + e.w / 2;
        if (!placed.some(p => x0 < p.x1 && x1 > p.x0 && y0 < p.y1 && y1 > p.y0)) break;
      }
      if (row === 4) row = 0;
      e.l.oy = e.base + row * 8;
      placed.push({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y + row * 8, y1: e.y + row * 8 + 9 });
    }
    for (const e of on) e.l.m.setScale(inv);
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
    this.fling = null;
    const sq = this.game_.squads[i];
    const p = sq.position(id => this.game_.world.site(id));
    const r = this.game_.world.site(sq.siteId ?? (sq.pos as any).to).region;
    if (this.mode === 'world' || this.regionId !== r) { this.regionId = r; this.setZoom(REGION_ZOOM); this.events.emit('region', r); }
    this.cameras.main.centerOn(p.x, p.y); this.clampCamera();
  }
  focusSite(id: string): void {
    this.fling = null;
    const s = this.game_.world.site(id);
    if (this.mode === 'world') { this.setZoom(REGION_ZOOM); }
    this.regionId = s.region; this.events.emit('region', s.region);
    this.cameras.main.centerOn(s.x, s.y); this.clampCamera();
  }

  update(_t: number, delta: number): void {
    const g = this.game_;
    g.tick(Math.min(delta, 100) / 1000);
    if (this.fling) {
      const cam = this.cameras.main; const f = this.fling; const dt = Math.min(delta, 50);
      const bx = cam.scrollX, by = cam.scrollY;
      cam.scrollX += f.x * dt; cam.scrollY += f.y * dt; this.clampCamera();
      const decay = Math.exp(-dt / 220); f.x *= decay; f.y *= decay;
      // 지도 끝에 막혔거나 거의 멈췄으면 끝
      if ((cam.scrollX === bx && cam.scrollY === by) || Math.hypot(f.x, f.y) * cam.zoom < 0.02) this.fling = null;
    }
    this.cullSites();
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
      const off = sq.siteId ? 14 * this.inv : 0;
      c.setPosition(p.x - off, p.y + off * 0.45);
      const ring = (c as any).ring as Phaser.GameObjects.Image | undefined; if (ring) { const on = i === g.selected; if (ring.visible !== on) ring.setVisible(on); if (on) ring.setAlpha(0.55 + Math.sin(_t / 250) * 0.3); }
      const fl = (c as any).flag; if ((c as any).sprite) (fl as Phaser.GameObjects.Image).setFrame(i === g.selected ? ICON.flagGold : ICON.flagBlue); else (fl as Phaser.GameObjects.Rectangle).setFillStyle(i === g.selected ? C.flagSel : C.flag);
    });
    // 막힌 지역은 세계 지도에서 흐리게 + 자물쇠
    for (const c of this.regionLabels) { const rid = (c as any).regionId as string; const locked = g.blocked.has(rid); const t = (c as any).label as Phaser.GameObjects.Text; const want = (locked ? '🔒 ' : '') + (g.world.regions.get(rid)?.name ?? ''); if (t.text !== want) { t.setText(want); c.setAlpha(locked ? 0.55 : 1); } }
    // 점령지 깃발
    for (const [id, f] of this.heldFlags) { const held = g.enemyHeld.has(id); if (f.on !== held) f.m.setOn(f, held); }
    // 적 무리(도적단) 빨간 깃발
    for (const b of g.bands) {
      if (this.bandMarkers.has(b.id)) continue;
      const site = g.world.site(b.site);
      const c = this.add.container(site.x, site.y).setDepth(25).setScale(K / this.cameras.main.zoom);
      if (this.textures.exists('units')) {
        const sh = this.shadow(4, 0, 8, 3, 0.45);
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
      this.pathGfx.lineStyle(0.9, 0x1a1008, 0.7);
      for (let k = 1; k < pts.length; k++) this.pathGfx.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
      this.pathGfx.lineStyle(0.5, 0xe0b23c, 0.95);
      for (let k = 1; k < pts.length; k++) this.pathGfx.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
    }
  }
}

type MarkerObj = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
interface Part { o: MarkerObj; ox: number; oy: number; sx: number; sy: number; on: boolean; m: Marker }
/**
 * 거점 표식 한 벌(그림자·그림·깃발·이름). Container 처럼 위치·배율·보이기를 한꺼번에 다루지만
 * 조각들은 장면에 따로 놓여 종류별 깊이로 그려진다(makeSiteMarker 주석).
 */
class Marker {
  visible = true;
  private parts: Part[] = [];
  constructor(readonly x: number, readonly y: number) {}
  add(o: MarkerObj, depth: number, on = true): Part {
    const p: Part = { o, ox: o.x, oy: o.y, sx: o.scaleX, sy: o.scaleY, on, m: this };
    o.setDepth(depth).setPosition(this.x + p.ox, this.y + p.oy).setVisible(this.visible && on);
    this.parts.push(p); return p;
  }
  setScale(inv: number): void { for (const p of this.parts) p.o.setPosition(this.x + p.ox * inv, this.y + p.oy * inv).setScale(p.sx * inv, p.sy * inv); }
  setVisible(v: boolean): void { this.visible = v; for (const p of this.parts) { const want = v && p.on; if (p.o.visible !== want) p.o.setVisible(want); } }
  setOn(p: Part, on: boolean): void { p.on = on; const want = this.visible && on; if (p.o.visible !== want) p.o.setVisible(want); }
}

function clamp8(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }
