import Phaser from 'phaser';
import { C, FONT, FONT_SMALL, H, K, TEXT, TEXT_SMALL, W } from './theme';
import { buttonKey, hasSkin, nine } from './skin';
import { AUDIO } from './audio';

/**
 * 손가락 기준 크기(설계 좌표, 2026-11-09). 폰 가로 화면에서 설계 1px ≈ 0.26mm.
 * 보이는 단추는 20(≈5mm), 누르는 범위는 그보다 작으면 위아래·좌우로 넓혀 준다.
 */
export const TOUCH = 20;
/** 보통 단추 높이 */
export const BTN_H = 20;
/** 단추가 든 목록 줄 간격 */
export const ROW = 24;
/** 창 제목 띠 높이(본문은 그 아래에서 시작) */
export const TITLE_H = 16;
/** 화면을 거의 채우는 창 크기. PC 큰 화면(640×360)에서도 이 크기로 가운데에 뜬다 */
export const FULL_W = Math.min(W - 8, 472);
export const FULL_H = Math.min(H - 6, 262);

/** 누른 채 끈 손가락(목록 넘기기·지도 끌기)은 누름으로 치지 않는다 */
export function isTap(p: Phaser.Input.Pointer): boolean {
  return Math.hypot(p.upX - p.downX, p.upY - p.downY) <= 7 * K;
}

export interface ButtonOpts { w?: number; h?: number; color?: number; textColor?: string; small?: boolean; disabled?: boolean; selected?: boolean }

const SEL = 0x6a5a2a;

/** 네모 단추. 보이는 크기가 TOUCH 보다 작으면 누르는 범위만 넓힌다. */
export function makeButton(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, o: ButtonOpts = {}): Phaser.GameObjects.Container {
  const w = o.w ?? 60, h = o.h ?? BTN_H;
  const c = scene.add.container(x, y);
  const base = o.selected ? SEL : (o.color ?? 0x5a4630);
  const skin = hasSkin(scene);
  const bg: any = skin
    ? nine(scene, 0, 0, w, h, buttonKey(scene, base, o.disabled ? 'd' : 'n'), 3)
    : scene.add.rectangle(0, 0, w, h, o.disabled ? 0x3a3a3a : (o.selected ? SEL : o.color ?? C.panelLight)).setOrigin(0).setStrokeStyle(1, o.disabled ? 0x555555 : C.border);
  const small = o.small ?? h < 18;
  const t = scene.add.text(w / 2, h / 2 + (skin ? 0.5 : 0), label, { ...(small ? TEXT_SMALL : TEXT), color: o.disabled ? '#777' : (o.textColor ?? C.paper) }).setOrigin(0.5);
  c.add([bg, t]);
  c.setSize(w, h);
  const px = Math.max(0, (TOUCH - w) / 2), py = Math.max(0, (TOUCH - h) / 2);
  // 못 누르는 단추도 입력은 삼킨다(아래 지도·창 바깥으로 새지 않게)
  bg.setInteractive(new Phaser.Geom.Rectangle(-px, -py, w + px * 2, h + py * 2), Phaser.Geom.Rectangle.Contains);
  if (bg.input) bg.input.cursor = o.disabled ? 'default' : 'pointer';
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); });
  if (!o.disabled) {
    bg.on('pointerover', () => skin ? bg.setTexture(buttonKey(scene, base, 'h')) : bg.setFillStyle(0x6a5a3a));
    bg.on('pointerout', () => skin ? bg.setTexture(buttonKey(scene, base, 'n')) : bg.setFillStyle(o.selected ? SEL : o.color ?? C.panelLight));
    bg.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (!isTap(p)) return; AUDIO.sfx('click'); onClick(); });
  } else {
    bg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
  }
  (c as any).label = t; (c as any).bg = bg;
  return c;
}

interface ScrollCfg { x: number; y: number; w: number; h: number; rowH: number; count: number; rows: number; get: () => number; set: (v: number) => void; redraw: () => void }

/**
 * 지도 위에 겹쳐 뜨는 창. 제목 줄 + 닫기(×) + 내용 영역.
 * 뒤를 어둡게 덮는 판이 입력을 삼키고, 닫을 수 있는 창은 바깥을 누르면 닫힌다.
 */
export class Window extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;
  readonly bw: number; readonly bh: number; readonly titleStr: string; readonly closable: boolean;
  onClose?: () => void;
  /** 튜토리얼이 가리킬 자리(본문 좌표): menu 항목, 고용·수락 단추 등 */
  readonly marks = new Map<string, { x: number; y: number }>();
  /** 본문 높이(제목 아래) */
  get bodyH(): number { return this.bh - TITLE_H - 2; }
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, title: string, opts: { closable?: boolean } = {}) {
    super(scene, x, y);
    this.bw = w; this.bh = h; this.titleStr = title; this.closable = opts.closable !== false;
    const skin = hasSkin(scene);
    // 뒤 판: 화면 전체를 살짝 어둡게. 닫을 수 있는 창은 바깥을 누르면 닫힌다
    const back = scene.add.rectangle(-x, -y, W, H, 0x000000, 0.3).setOrigin(0).setInteractive();
    back.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    back.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (this.closable && isTap(p)) this.close(); });
    // 금테(6px) 만큼 아래로 늘려 그린다: 창마다 "bh - 24" 같은 아래쪽 글이 테두리에 잘리지 않게
    const fh = skin ? h + 8 : h;
    const shadow = scene.add.rectangle(3, 3, w, fh, C.shadow, 0.55).setOrigin(0);
    const bg = scene.add.rectangle(0, 0, w, fh, C.panel, 1).setOrigin(0); if (skin) bg.setFillStyle(); // 누르기만 받는 판(그리지 않음)
    if (!skin) bg.setStrokeStyle(1, C.border);
    const frame = skin ? nine(scene, 0, 0, w, fh, 'sk_win', 6) : null;
    bg.setInteractive(); // 입력 삼키기
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    bg.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    const titleBar: any = skin ? scene.add.image(3, 2, 'sk_title').setOrigin(0).setDisplaySize(w - 6, TITLE_H - 2) : scene.add.rectangle(1, 1, w - 2, TITLE_H - 1, 0x8a6a1c).setOrigin(0);
    const titleText = scene.add.text(5, 2 + (TITLE_H - 2) / 2, title, { ...TEXT, color: C.white }).setOrigin(0, 0.5);
    this.add(frame ? [back, shadow, frame, bg, titleBar, titleText] : [back, shadow, bg, titleBar, titleText]);
    if (this.closable) {
      const x = makeButton(scene, w - 27, 2, '×', () => this.close(), { w: 24, h: TITLE_H - 2, color: 0xa0302a });
      // 귀퉁이라 바깥쪽으로 크게 넓혀도 겹칠 것이 없다
      (x as any).bg.input.hitArea.setTo(-6, -8, 36, TITLE_H + 12);
      this.add(x);
    }
    this.content = scene.add.container(skin ? 2 : 0, TITLE_H + 2);
    this.add(this.content);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }
  /** 닫기(×) 단추 가운데(화면 설계 좌표) */
  closeCenter(): { x: number; y: number } { return { x: this.x + this.bw - 15, y: this.y + 2 + (TITLE_H - 2) / 2 }; }
  text(x: number, y: number, s: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, { ...TEXT, ...style }); this.content.add(t); return t;
  }
  small(x: number, y: number, s: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, { ...TEXT_SMALL, ...style }); this.content.add(t); return t;
  }
  button(x: number, y: number, label: string, onClick: () => void, o: ButtonOpts = {}): Phaser.GameObjects.Container {
    const b = makeButton(this.scene, x, y, label, onClick, o); this.content.add(b); return b;
  }
  /** 튜토리얼용 자리 표시(본문 좌표) */
  mark(key: string, x: number, y: number): void { this.marks.set(key, { x, y }); }
  /** 초상(그림이 있으면 그림, 없으면 네모 + 이름). key 는 theme.portraitKey 로 고른다 */
  portrait(x: number, y: number, w: number, h: number, key: string | null, fallback = ''): void {
    // 작은 칸은 48×56, 큰 칸(엔딩 카드)은 96×112 도트. 정수 배율이 아니어도 NEAREST 라 도트가 유지된다
    const tex = key ? (w >= 80 && this.scene.textures.exists('P_' + key) ? 'P_' : 'p_') + key : '';
    if (tex && this.scene.textures.exists(tex)) {
      const img = this.scene.add.image(x + w / 2, y + h / 2, tex);
      const sc = Math.max(w / img.width, h / img.height); img.setScale(sc);
      img.setCrop((img.width - w / sc) / 2, (img.height - h / sc) / 2, w / sc, h / sc);
      this.content.add(img);
      const f = this.scene.add.rectangle(x, y, w, h, 0, 0).setOrigin(0).setStrokeStyle(1, C.border); this.content.add(f);
      return;
    }
    this.rect(x, y, w, h, C.panelLight);
    if (fallback) this.small(x + 2, y + h / 2 - 5, fallback, { color: C.grey, wordWrap: { width: w - 4 } });
  }
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): Phaser.GameObjects.Rectangle {
    const r = this.scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0); this.content.add(r); return r;
  }
  /** 눌러서 고르는 목록 줄(배경판). 고른 줄은 밝게 */
  row(x: number, y: number, w: number, h: number, selected: boolean, onTap: () => void, zebra = false): Phaser.GameObjects.Rectangle {
    const r = this.rect(x, y, w, h, selected ? SEL : C.panelLight, selected ? 0.9 : zebra ? 0.45 : 0.25);
    if (selected) r.setStrokeStyle(1, C.border);
    r.setInteractive({ useHandCursor: true });
    r.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    r.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); if (isTap(p)) { AUDIO.sfx('click'); onTap(); } });
    return r;
  }
  /**
   * 단추 목록(거점 명령 등). cols 칸으로 나눠 놓고, 각 항목 가운데를 marks 'menu0'… 에 남긴다.
   * 돌려주는 값은 목록 아래 끝 y.
   */
  menu(items: { label: string; onClick?: () => void; disabled?: boolean }[], o: { x?: number; y?: number; w?: number; cols?: number; h?: number; gap?: number } = {}): number {
    const x = o.x ?? 6, y = o.y ?? 4, cols = o.cols ?? 1, h = o.h ?? 22, gap = o.gap ?? 4;
    const full = o.w ?? this.bw - 12 - (hasSkin(this.scene) ? 4 : 0);
    const bw = Math.floor((full - gap * (cols - 1)) / cols);
    items.forEach((it, i) => {
      const bx = x + (i % cols) * (bw + gap), by = y + Math.floor(i / cols) * (h + gap);
      this.button(bx, by, it.label, it.onClick ?? (() => {}), { w: bw, h, disabled: it.disabled });
      this.mark('menu' + i, bx + bw / 2, by + h / 2); this.mark('menu:' + it.label, bx + bw / 2, by + h / 2);
    });
    return y + Math.ceil(items.length / cols) * (h + gap);
  }
  clearBody(): void { this.content.removeAll(true); this.marks.clear(); }
  close(): void { this.onClose?.(); this.destroy(); }

  // ───── 손가락으로 밀어 넘기는 목록 ─────
  private sc?: ScrollCfg;
  private drag: { t: number; y: number; off: number; on: boolean } | null = null;
  private scHooked = false;
  /**
   * 목록 영역을 등록한다(render 할 때마다 부른다). 영역 안에서 위아래로 끌면 줄 단위로 넘기고,
   * PC 는 휠로 넘긴다. 줄이 더 있으면 오른쪽에 막대와 ▲▼ 를 그린다.
   */
  scroll(cfg: ScrollCfg): void {
    this.sc = cfg;
    const max = Math.max(0, cfg.count - cfg.rows);
    if (max > 0) {
      const off = Math.min(cfg.get(), max);
      this.rect(cfg.x + cfg.w - 3, cfg.y, 3, cfg.h, 0x000000, 0.35);
      const th = Math.max(10, cfg.h * cfg.rows / cfg.count); const ty = cfg.y + (cfg.h - th) * off / max;
      this.rect(cfg.x + cfg.w - 3, ty, 3, th, C.border, 0.9);
    }
    if (this.scHooked) return;
    this.scHooked = true;
    const inp = this.scene.input; const cam = this.scene.cameras.main;
    const inside = (wx: number, wy: number) => { const s = this.sc; if (!s) return false; const x = wx - this.x - this.content.x, y = wy - this.y - this.content.y; return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h; };
    const step = (nv: number) => { const s = this.sc!; const v = Phaser.Math.Clamp(nv, 0, Math.max(0, s.count - s.rows)); if (v !== s.get()) { s.set(v); s.redraw(); } };
    // 줄·단추가 누름을 삼키므로(장면의 pointerdown 이 안 온다) 움직일 때 "어디서 눌렀나"로 끌기를 시작한다
    const move = (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.sc) { this.drag = null; return; }
      let d = this.drag;
      if (!d || d.t !== p.downTime) { const w = cam.getWorldPoint(p.downX, p.downY); d = this.drag = inside(w.x, w.y) ? { t: p.downTime, y: w.y, off: this.sc.get(), on: false } : { t: p.downTime, y: 0, off: -1, on: false }; }
      if (d.off < 0) return;
      const dy = p.worldY - d.y; if (!d.on && Math.abs(dy) > 5) d.on = true;
      if (d.on) step(d.off - Math.round(dy / this.sc.rowH));
    };
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => { if (inside(p.worldX, p.worldY) && this.sc) step(this.sc.get() + Math.sign(dy)); };
    inp.on('pointermove', move); inp.on('wheel', wheel);
    this.once('destroy', () => { inp.off('pointermove', move); inp.off('wheel', wheel); });
  }
}

export { FONT, FONT_SMALL };
