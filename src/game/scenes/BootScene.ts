import Phaser from 'phaser';
import { Game } from '../../core/game';
import { World } from '../../core/world';
import { WORLD_DATA } from '../../data/world';
import { loadGame } from '../save';
import { makeSkin } from '../skin';
import { FONT, FONT_SMALL, K, PORTRAIT_KEYS, TEXT, W, H } from '../theme';

/** 글꼴을 기다렸다가 게임 상태를 만들고(저장이 있으면 복원) 지도·UI 장면을 띄운다. */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  preload(): void {
    this.cameras.main.setZoom(K).centerOn(W / 2, H / 2);
    this.load.image('mappx', 'art/map-pixel.png');
    this.load.spritesheet('icons', 'art/icons.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('sites', 'art/sites.png', { frameWidth: 48, frameHeight: 48 }); // AI 도트 거점(tools/ai-icons.mjs)
    this.load.spritesheet('units', 'art/units.png', { frameWidth: 12, frameHeight: 16 });
    for (const k of PORTRAIT_KEYS) { this.load.image('p_' + k, 'art/portraits-px/' + k + '.png'); this.load.image('P_' + k, 'art/portraits-px/' + k + '@2.png'); }
    this.load.on('loaderror', (f: { key: string }) => { /* 없는 초상은 네모로 대신한다 */ void f; });
  }
  async create(): Promise<void> {
    const t = this.add.text(W / 2, H / 2, '불러오는 중…', TEXT).setOrigin(0.5);
    try {
      await Promise.all([document.fonts.load('11px ' + FONT), document.fonts.load('9px ' + FONT_SMALL)]);
    } catch { /* 글꼴이 없으면 기본 글꼴로 간다 */ }
    makeSkin(this);
    const world = new World(WORLD_DATA);
    // ?new : 저장을 무시하고 새로 시작(검증용)
    const fresh = new URLSearchParams(location.search).has('new');
    const game = (fresh ? null : loadGame(world)) ?? (() => { const g = new Game(world, Date.now() % 100000); g.startStory(); return g; })();
    this.registry.set('game', game);
    t.destroy();
    this.scene.start('map');
    this.scene.launch('ui');
  }
}
