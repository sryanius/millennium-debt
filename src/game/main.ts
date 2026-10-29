import Phaser from 'phaser';
import 'galmuri/dist/galmuri.css';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { UIScene } from './scenes/UIScene';
import { BattleScene } from './scenes/BattleScene';
import { H, W } from './theme';

/**
 * 논리 해상도 480×270 을 정수 배율로 띄운다(GDD §7). 세로 모드는 index.html 에서 막는다.
 */
// ?bg : 숨겨진 탭(브라우저 창이 가려졌을 때)에서도 1초 간격으로 돌게 한다. 자동 검증용.
const bg = new URLSearchParams(location.search).has('bg');

const game = new Phaser.Game({
  fps: { forceSetTimeOut: bg },
  ...(bg ? ({ disableVisibilityChange: true } as object) : {}),
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#101010',
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [BootScene, MapScene, UIScene, BattleScene],
});

/**
 * 정수 배율은 "기기 픽셀" 기준으로 잡는다. PC(DPR 1)는 ×1·×2·×3…,
 * 폰(DPR 3, 가로 812×375 CSS px)은 CSS ×1.33 = 기기 ×4 로 화면을 거의 채운다. 도트는 여전히 또렷하다.
 */
function fit(): void {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const deviceZoom = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H) * dpr));
  game.scale.setZoom(deviceZoom / dpr);
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));
fit();

(window as any).__game = game;

// PWA(7단계): 배포 빌드에서만 서비스 워커를 등록한다(개발 서버에선 HMR 과 충돌)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* 오프라인 캐시는 선택 사항 */ }); });
}
// 폰: 전체 화면·가로 고정 시도(지원 기기에서만)
document.addEventListener('pointerdown', function once() {
  document.removeEventListener('pointerdown', once);
  const so = (screen as any).orientation; if (so && so.lock && matchMedia('(pointer: coarse)').matches) so.lock('landscape').catch(() => {});
});
