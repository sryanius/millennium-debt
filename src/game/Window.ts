import Phaser from 'phaser';
import { C, FONT, FONT_SMALL, TEXT, TEXT_SMALL } from './theme';
import { buttonKey, hasSkin, nine } from './skin';

export interface ButtonOpts { w?: number; h?: number; color?: number; textColor?: string; small?: boolean; disabled?: boolean }

/** 글자 하나짜리 버튼부터 표 행까지 쓰는 네모 버튼. */
export function makeButton(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, o: ButtonOpts = {}): Phaser.GameObjects.Container {
  const w = o.w ?? 60, h = o.h ?? 14;
  const c = scene.add.container(x, y);
  const base = o.color ?? 0x5a4630;
  const skin = hasSkin(scene);
  const bg: any = skin
    ? nine(scene, 0, 0, w, h, buttonKey(scene, base, o.disabled ? 'd' : 'n'), 3)
    : scene.add.rectangle(0, 0, w, h, o.disabled ? 0x3a3a3a : (o.color ?? C.panelLight)).setOrigin(0).setStrokeStyle(1, o.disabled ? 0x555555 : C.border);
  const t = scene.add.text(w / 2, h / 2 + (skin ? 0.5 : 0), label, { ...(o.small ? TEXT_SMALL : TEXT), color: o.disabled ? '#777' : (o.textColor ?? C.paper) }).setOrigin(0.5);
  c.add([bg, t]);
  c.setSize(w, h);
  if (!o.disabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => skin ? bg.setTexture(buttonKey(scene, base, 'h')) : bg.setFillStyle(0x6a5a3a));
    bg.on('pointerout', () => skin ? bg.setTexture(buttonKey(scene, base, 'n')) : bg.setFillStyle(o.color ?? C.panelLight));
    bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); });
    bg.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); onClick(); });
  }
  (c as any).label = t; (c as any).bg = bg;
  return c;
}

/**
 * 원작처럼 지도 위에 겹쳐 뜨는 창. 제목 줄 + 닫기(×) + 내용 영역.
 * 배경 네모가 입력을 삼켜서 아래 지도가 눌리지 않는다.
 */
export class Window extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;
  readonly bw: number; readonly bh: number;
  onClose?: () => void;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, title: string, opts: { closable?: boolean } = {}) {
    super(scene, x, y);
    this.bw = w; this.bh = h;
    const shadow = scene.add.rectangle(3, 3, w, h, C.shadow, 0.55).setOrigin(0);
    const skin = hasSkin(scene);
    const bg = scene.add.rectangle(0, 0, w, h, C.panel, skin ? 0.001 : 1).setOrigin(0);
    if (!skin) bg.setStrokeStyle(1, C.border);
    const frame = skin ? nine(scene, 0, 0, w, h, 'sk_win', 6) : null;
    bg.setInteractive(); // 입력 삼키기
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    const titleBar: any = skin ? scene.add.image(3, 2, 'sk_title').setOrigin(0).setDisplaySize(w - 6, 12) : scene.add.rectangle(1, 1, w - 2, 12, 0x8a6a1c).setOrigin(0);
    const titleText = scene.add.text(4, 7, title, { ...TEXT, color: C.white }).setOrigin(0, 0.5);
    this.add(frame ? [shadow, frame, bg, titleBar, titleText] : [shadow, bg, titleBar, titleText]);
    if (opts.closable !== false) {
      const x = makeButton(scene, w - 15, 2, '×', () => this.close(), { w: 12, h: 12, color: 0xa0302a });
      this.add(x);
    }
    this.content = scene.add.container(skin ? 2 : 0, 15);
    this.add(this.content);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }
  text(x: number, y: number, s: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, { ...TEXT, ...style }); this.content.add(t); return t;
  }
  small(x: number, y: number, s: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, { ...TEXT_SMALL, ...style }); this.content.add(t); return t;
  }
  button(x: number, y: number, label: string, onClick: () => void, o: ButtonOpts = {}): Phaser.GameObjects.Container {
    const b = makeButton(this.scene, x, y, label, onClick, o); this.content.add(b); return b;
  }
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
  /** 세로 목록(거점 명령 등). 항목 높이 14. */
  menu(items: { label: string; onClick?: () => void; disabled?: boolean }[], x = 6, y = 4, w?: number): void {
    const bw = w ?? this.bw - 12;
    items.forEach((it, i) => this.button(x, y + i * 16, it.label, it.onClick ?? (() => {}), { w: bw, h: 14, disabled: it.disabled }));
  }
  clearBody(): void { this.content.removeAll(true); }
  close(): void { this.onClose?.(); this.destroy(); }
}

export { FONT, FONT_SMALL };
