import Phaser from 'phaser';
import '../fonts.css'; // 쓰는 글꼴 두 개(Galmuri 11·9)만. 패키지 전체 CSS 는 글꼴 파일 50MB 를 끌고 온다
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { UIScene } from './scenes/UIScene';
import { BattleScene } from './scenes/BattleScene';
import { H, K, W } from './theme';

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
  width: W * K,
  height: H * K,
  pixelArt: true,
  roundPixels: false,
  backgroundColor: '#101010',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [BootScene, MapScene, UIScene, BattleScene],
});

/**
 * 정수 배율은 "기기 픽셀" 기준으로 잡는다. PC(DPR 1)는 ×1·×2·×3…,
 * 폰(DPR 3, 가로 812×375 CSS px)은 CSS ×1.33 = 기기 ×4 로 화면을 거의 채운다. 도트는 여전히 또렷하다.
 */
// HD(1440×810) 캔버스를 화면에 맞춰 띄운다(Scale.FIT). 채색 지도·그림 초상이 선명하고, 도트 글꼴·UI 는 ×3 정수 배율이다.
window.addEventListener('orientationchange', () => setTimeout(() => game.scale.refresh(), 100));

/**
 * 폰 손가락 끌기 가볍게(2026-11-08). Phaser 는 손가락이 움직일 때마다
 *  ① document.elementFromPoint 로 "손가락이 캔버스 위인지" 페이지 전체를 다시 따지고
 *  ② 지나가는 단추·거점마다 마우스 모양(canvas.style.cursor)을 바꿔 페이지 스타일을 다시 계산하게 했다.
 * 우리 캔버스는 화면을 꽉 채우고 터치 화면엔 마우스 모양이 없으니 둘 다 뺀다.
 */
if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) { // 에뮬레이터 WebView 는 coarse 를 안 알려 줘서 손가락 수로도 본다
  type P = Phaser.Input.Pointer & { identifier: number; touchmove: (t: Touch, e: TouchEvent) => void };
  const im = game.input as unknown as { pointers: P[]; activePointer: P; isOver: boolean; setCursor: () => void; resetCursor: () => void; onTouchMove: (e: TouchEvent) => void; updateInputPlugins: (type: number, ps: P[]) => void };
  im.setCursor = () => {}; im.resetCursor = () => {};
  im.onTouchMove = function (event: TouchEvent) {
    const changed: P[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const t = event.changedTouches[c];
      for (let i = 1; i < this.pointers.length; i++) {
        const p = this.pointers[i];
        if (p.active && p.identifier === t.identifier) { p.touchmove(t, event); this.activePointer = p; changed.push(p); break; }
      }
    }
    this.isOver = true;
    this.updateInputPlugins(Phaser.Input.TOUCH_MOVE, changed);
  };
}

(window as any).__game = game;
import('./audio').then(m => { (window as any).__audio = m.AUDIO; (window as any).__renderSong = m.renderSongWav; });

// PWA(7단계): 배포 빌드에서만 서비스 워커를 등록한다(개발 서버에선 HMR 과 충돌)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !navigator.userAgent.includes('MillenniumDebtApp')) { // 앱(APK)은 파일이 이미 안에 있어 캐시가 필요 없다
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* 오프라인 캐시는 선택 사항 */ }); });
}
// 폰: 전체 화면·가로 고정 시도(지원 기기에서만)
document.addEventListener('pointerdown', function once() {
  document.removeEventListener('pointerdown', once);
  const so = (screen as any).orientation; if (so && so.lock && matchMedia('(pointer: coarse)').matches) so.lock('landscape').catch(() => {});
});

// ?perf : 3초마다 프레임 수·한 프레임 걸린 시간(계산/그리기)을 콘솔에 찍는다. 앱(APK)에서는 adb 로 `am start ... -e q perf`.
if (new URLSearchParams(location.search).has('perf')) {
  const T = { upd: 0, ren: 0, n: 0 }; const dts: number[] = []; let last = performance.now();
  game.events.once('ready', () => {
    // 실험: ?perf&exp=noroads,nosites,noui — 하나씩 끄고 재 본다
    const exp = (new URLSearchParams(location.search).get('exp') ?? '').split(',');
    setTimeout(() => {
      const map = game.scene.getScene('map'); const ui = game.scene.getScene('ui');
      if (exp.includes('noroads')) map.children.list.filter(o => o.type === 'Graphics').forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(false));
      if (exp.includes('nosites')) map.children.list.filter(o => o.type === 'Container').forEach(o => (o as Phaser.GameObjects.Container).setVisible(false));
      if (exp.includes('noui')) ui.sys.setVisible(false);
      console.log('[perf] 실험 ' + exp.join(','));
    }, 3000);
    const step = game.step.bind(game);
    game.step = (time: number, delta: number) => { const t0 = performance.now(); step(time, delta); T.upd += performance.now() - t0; T.n++; dts.push(time - last); last = time; };
    const r = game.renderer as unknown as { render: (...a: unknown[]) => void }; const render = r.render.bind(r);
    r.render = (...a: unknown[]) => { const t0 = performance.now(); render(...a); T.ren += performance.now() - t0; };
    setInterval(() => {
      if (!T.n) return; const s = dts.slice().sort((a, b) => a - b);
      console.log(`[perf] fps ${game.loop.actualFps.toFixed(1)} · 프레임 간격 중앙 ${s[s.length >> 1].toFixed(1)}ms·95% ${s[Math.floor(s.length * 0.95)].toFixed(1)}ms · 한 프레임 JS ${(T.upd / T.n).toFixed(2)}ms(그중 그리기 ${(T.ren / T.n).toFixed(2)}ms) · 캔버스 ${game.canvas.width}×${game.canvas.height} · dpr ${devicePixelRatio}`);
      T.upd = T.ren = T.n = 0; dts.length = 0;
    }, 3000);
  });
}
