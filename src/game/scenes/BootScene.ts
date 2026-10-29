import Phaser from 'phaser';
import { Game } from '../../core/game';
import { World } from '../../core/world';
import { WORLD_DATA } from '../../data/world';
import { loadGame } from '../save';
import { FONT, FONT_SMALL, TEXT, W, H } from '../theme';

/** 글꼴을 기다렸다가 게임 상태를 만들고(저장이 있으면 복원) 지도·UI 장면을 띄운다. */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  async create(): Promise<void> {
    const t = this.add.text(W / 2, H / 2, '불러오는 중…', TEXT).setOrigin(0.5);
    try {
      await Promise.all([document.fonts.load('11px ' + FONT), document.fonts.load('9px ' + FONT_SMALL)]);
    } catch { /* 글꼴이 없으면 기본 글꼴로 간다 */ }
    const world = new World(WORLD_DATA);
    // ?new : 저장을 무시하고 새로 시작(검증용)
    const fresh = new URLSearchParams(location.search).has('new');
    const game = (fresh ? null : loadGame(world)) ?? new Game(world, Date.now() % 100000);
    this.registry.set('game', game);
    t.destroy();
    this.scene.start('map');
    this.scene.launch('ui');
  }
}
