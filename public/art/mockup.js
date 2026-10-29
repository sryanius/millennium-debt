// 목업 페이지 스크립트(개발 서버가 public 안의 인라인 모듈을 가로채므로 파일로 뺐다)
(async () => {

const load = src => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('이미지를 못 읽음: ' + src)); i.src = src + '?t=' + Date.now(); });
// 숨겨진 탭에서는 fonts.load 가 끝나지 않을 수 있어 1.5초만 기다린다
await Promise.race([Promise.all([document.fonts.load('11px Galmuri11'), document.fonts.load('9px Galmuri9')]), new Promise(r => setTimeout(r, 1500))]);
const [mapImg, battleImg, ports, units, icons, tiles, pal, labels] = await Promise.all([
  load('./mockup-map.png'), load('./mockup-battle.png'), load('./portraits.png'), load('./units.png'), load('./icons.png'), load('./tiles.png'), load('./palette.png'),
  fetch('./mockup-labels.json?t=' + Date.now()).then(r => r.json()),
]);
const S = 3;
function text(ctx, s, x, y, opt = {}) {
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.font = (opt.size ?? 9 * S) + 'px ' + (opt.font ?? 'Galmuri9'); ctx.textBaseline = 'top'; ctx.textAlign = opt.align ?? 'left';
  if (opt.stroke !== false) { ctx.lineWidth = 2 * S; ctx.strokeStyle = '#1a1c2c'; ctx.lineJoin = 'round'; ctx.strokeText(s, x * S, y * S); }
  ctx.fillStyle = opt.color ?? '#fbf6e8'; ctx.fillText(s, x * S, y * S); ctx.restore();
}
// 메인 화면
{
  const c = document.getElementById('map').getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(mapImg, 0, 0, 1440, 810);
  for (const l of labels) { if (l.kind !== 'castle' && l.kind !== 'gate' && l.kind !== 'port') continue; if (l.y > 212 || (l.y < 62 && l.x < 90) || (l.y < 24 && l.x > 400)) continue; /* 패널 밑 라벨은 생략 */ text(c, l.name, l.x, l.y + 2, { align: 'center', color: l.kind === 'castle' ? '#fbf6e8' : '#e6cf8d', size: (l.kind === 'castle' ? 11 : 9) * S, font: l.kind === 'castle' ? 'Galmuri11' : 'Galmuri9' }); }
  text(c, '1000/03/14', 36, 231, { font: 'Galmuri11', size: 11 * S, stroke: false });
  text(c, '다음 상환까지 7일', 36, 245, { color: '#e2654a', stroke: false }); text(c, '상환일 7·14·21·28', 36, 256, { color: '#a89f8a', stroke: false });
  text(c, '남서 곡창', 367, 230, { color: '#e0b23c', stroke: false }); text(c, '부채  9,995,000', 367, 241, { stroke: false }); text(c, '상환  5,000', 367, 250, { color: '#c9a66b', stroke: false }); text(c, '소지금 24,391', 367, 258, { font: 'Galmuri11', size: 11 * S, stroke: false });
  text(c, '● 피비 애플가드 부대가 샹파르 포도주 교역소에 도착했다.', 108, 228, { stroke: false });
  ['카엘', '브록', '피비', '엘라', '리젤', '두린'].forEach((n, i) => { text(c, (i + 1) + ' ' + n, 104 + i * 44 + 17, 260, { stroke: false, color: '#e0b23c' }); });
  text(c, '세계 지도', 38, 56, { align: 'center', color: '#e0b23c' });
  c.save(); c.scale(S, S); c.fillStyle = '#2e2a3a'; c.fillRect(1, 54, 72, 12); c.strokeStyle = '#8a6a1c'; c.strokeRect(1.5, 54.5, 71, 11); c.restore(); text(c, '세계 지도', 38, 56, { align: 'center', color: '#e0b23c', stroke: false });
}
// 전투 화면
{
  const c = document.getElementById('battle').getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(battleImg, 0, 0, 1440, 810);
  text(c, '리보른 해안 성채 도적단', 6, 12, { color: '#e2654a' });
  ['도적 24/24', '도적 8/24', '도적 궁수 20/20', '도적 24/24', '도적 궁수 20/20', '도적 24/24', '도적 15/24'].forEach((s, i) => text(c, s, 22, 25 + i * 8, { stroke: false }));
  text(c, '카엘 하임 부대  대열 횡대 · 백병전', 344, 12, { color: '#e0b23c' });
  ['★카엘 하임 40/40', '한스 30/30', '마르코 28/30', '올라 42/42', '테오 42/42', '리나 24/24', '요나 24/24', '카이 9/22', '베라 18/18'].forEach((s, i) => text(c, s, 360, 25 + i * 8, { stroke: false }));
  text(c, '전투 중', 190, 98, { color: '#fbf6e8', stroke: false });
  ['전투명령', '전체퇴각', '개별퇴각', '전투재개'].forEach((s, i) => text(c, s, 240, 112 + i * 12, { align: 'center', font: 'Galmuri11', size: 11 * S, stroke: false }));
  text(c, '카엘 하임이 도적을 쓰러뜨렸다.', 240, 216, { align: 'center' });
  text(c, '1000/03/19', 36, 231, { font: 'Galmuri11', size: 11 * S, stroke: false }); text(c, '다음 상환까지 2일', 36, 245, { color: '#e2654a', stroke: false });
  text(c, '남서 곡창', 367, 230, { color: '#e0b23c', stroke: false }); text(c, '부채  9,990,000', 367, 241, { stroke: false }); text(c, '상환  5,000', 367, 250, { color: '#c9a66b', stroke: false }); text(c, '소지금 31,870', 367, 258, { font: 'Galmuri11', size: 11 * S, stroke: false });
  ['카엘', '브록', '피비', '엘라', '리젤', '두린'].forEach((n, i) => { text(c, (i + 1) + ' ' + n, 104 + i * 44 + 17, 260, { stroke: false, color: i === 0 ? '#e2654a' : '#e0b23c' }); });
}
// 시트
{
  const c = document.getElementById('sheets').getContext('2d'); c.imageSmoothingEnabled = false;
  c.drawImage(ports, 0, 0, ports.width * 3, ports.height * 3);
  ['카엘 하임', '브록', '피비 애플가드', '엘라', '리젤', '두린', '집행관 토비아스', '검은 창 로한'].forEach((n, i) => text(c, n, i * 40 + 20, 50, { align: 'center', stroke: false }));
  c.drawImage(units, 0, 180, units.width * 4, units.height * 4);
  ['카엘', '브록', '피비', '엘라', '리젤', '두린', '검병', '중장', '석궁', '장궁', '마법', '상인', '음유', '석공', '도적', '도적궁', '잿빛', '사제', '호위', '철갑', '골렘'].forEach((n, i) => text(c, n, i * 48 / 3 + 8, 82, { align: 'center', stroke: false, color: '#a89f8a' }));
  c.drawImage(icons, 0, 270, icons.width * 4, icons.height * 4);
  c.drawImage(tiles, icons.width * 4 + 40, 270, tiles.width * 4, tiles.height * 4);
  c.drawImage(pal, 0, 360, pal.width * 4, pal.height * 4);
}

})().catch(e => { document.body.insertAdjacentHTML("beforeend", "<pre style='color:#e2654a'>" + e + "</pre>"); });
