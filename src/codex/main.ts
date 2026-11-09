/**
 * 도감 쪽(codex.html): 게임 자료(src/core·src/data)를 그대로 읽어 그린다. 자료가 늘면 도감도 저절로 늘어난다.
 * 짜임은 길드 연대기 도감(town/src/codex)과 같다: 탭·검색·펼치는 카드·화면 밝기.
 */
import './codex.css';
import { BALANCE } from '../core/balance';
import { makeBandits, makeEscort, makeGarrison, makeRebels, type EnemyDef } from '../core/battle';
import { ARMORS, POTIONS, TOOLS, WEAPONS } from '../core/equipment';
import { EPILOGUES } from '../core/events';
import { FORMATIONS, type Formation } from '../core/formation';
import { GOODS } from '../core/goods';
import { JOBS, type Job } from '../core/jobs';
import { INCOME_LABEL } from '../core/ledger';
import { Rng } from '../core/rng';
import { LEADERS, MAX_LEVEL, type Person } from '../core/squad';
import { KIND_LABEL, World, fortMax, hasMarket, isFort, isTown, type Site } from '../core/world';
import { WORLD_DATA } from '../data/world';
import { ICON, UNIT_FRAME, siteIcon } from '../game/theme';

const world = new World(WORLD_DATA, { maxDistance: BALANCE.ferryMaxDistance, speedMul: BALANCE.ferrySpeedMul });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const regionName = (id: string) => world.regions.get(id)?.name ?? id;
const factionName = (id?: string) => (id ? world.factions.get(id)?.name ?? id : '무주지');
const unitPx = (frame: number) => `<span class="px unit" style="background-image:url(art/units.png);background-position:${-frame * 96}px 0"></span>`;
const sitePx = (frame: number) => `<span class="px site" style="background-image:url(art/sites.png);background-position:${-frame * 48}px 0"></span>`;
const tag = (t: string, cls = '') => `<i class="tag ${cls}">${esc(t)}</i>`;

type ViewId = 'leader' | 'job' | 'item' | 'form' | 'good' | 'foe' | 'world' | 'event' | 'rule';
interface Filter { q: string; reg: string }
interface View { id: ViewId; label: string; group: 'band' | 'world'; note: string; render(f: Filter): { html: string; count: number } }

type Cell = string | number | { html: string };
const cellHtml = (c: Cell) => (typeof c === 'object' ? c.html : esc(c));
const dcell = (k: string, v: Cell, wide = false) => `<div class="dcell${wide ? ' wide' : ''}"><dt>${esc(k)}</dt><dd>${cellHtml(v)}</dd></div>`;
const grid = (...cells: string[]) => `<dl class="dgrid">${cells.join('')}</dl>`;
const blk = (title: string, body: string) => `<div class="blk"><h4>${esc(title)}</h4>${body}</div>`;
const ul = (items: string[]) => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const table = (head: string[], rows: Cell[][]) => `<div class="minwrap"><table class="mini"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${cellHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const note = (html: string) => `<p class="dropnote">${html}</p>`;
const terms = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const hit = (find: string, f: Filter) => terms(f.q).every(t => find.toLowerCase().includes(t));

interface RowOpt { view: ViewId; id: string; name: string; tags?: string; sub?: string; thumb?: string; nums: [string, Cell][]; detail: string }
function row(o: RowOpt) {
  const nums = o.nums.map(([k, v]) => `<span class="num"><i>${esc(k)}</i>${cellHtml(v)}</span>`).join('');
  return `<details class="item" data-key="${o.view}/${esc(o.id)}"><summary class="row">`
    + `<span class="nm">${o.thumb ?? ''}<span class="nt"><b>${o.tags ?? ''}${esc(o.name)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</span></span>${nums}`
    + `</summary><div class="detail">${o.detail}</div></details>`;
}
function groups<T>(rows: T[], key: (r: T) => string, draw: (r: T) => string, sub: (rs: T[]) => string = rs => rs.length + '개') {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return [...m].map(([k, rs]) => `<section class="group"><div class="ghead"><h2>${esc(k)}</h2><span class="sub">${esc(sub(rs))}</span><span class="rule"></span></div><div class="list">${rs.map(draw).join('')}</div></section>`).join('');
}
const EMPTY = '<div class="empty">맞는 것이 없습니다. 검색어나 지역을 바꿔 보세요.</div>';
const out = (html: string, count: number) => ({ html: count ? html : EMPTY, count });

// ───────── 부대장 ─────────
const JOIN_AT: Record<string, string> = { kael: '시작부터(샹파르)', phoebe: '샹파르 — 시작 3일 뒤', brok: '오르블랑', liesel: '발리스', ella: '리보른', durin: '세인트 아르노' };
const statGrid = (p: Person) => grid(dcell('체력', p.stats.maxHp), dcell('공격', p.stats.s), dcell('방어', p.stats.d), dcell('상업', p.stats.t), dcell('공연', p.stats.p), dcell('건축', p.stats.b), dcell('경험', p.stats.e));
const leaderView: View = {
  id: 'leader', label: '부대장', group: 'band', note: '여섯 부대장은 성을 돌다 보면 합류한다. 교체·통합할 수 없고 급료도 없다. 전투에서 쓰러져도 죽지 않고 부대가 퇴각한다.',
  render(f) {
    const rows = LEADERS.filter(p => hit(p.name + p.race + p.role, f));
    return out(`<div class="list">${rows.map(p => row({
      view: 'leader', id: p.id, name: p.name, sub: `${p.race} · ${p.role} · 합류: ${JOIN_AT[p.id]}`,
      thumb: `<img class="portrait" src="art/portraits-px/${p.id}.png" alt="" loading="lazy">`,
      nums: [['체력', p.stats.maxHp], ['공격', p.stats.s], ['방어', p.stats.d]],
      detail: statGrid(p) + blk('후일담(완납 결말마다)', ul(Object.entries(EPILOGUES[p.id] ?? {}).map(([k, v]) => `<b>${esc(INCOME_LABEL[k as keyof typeof INCOME_LABEL] ?? k)}</b> — ${esc(v)}`))),
    })).join('')}</div>`, rows.length);
  },
};

// ───────── 직업 ─────────
const whereText = (j: Job) => !j.where ? '어느 성에서나' : [...(j.where.regions ?? []).map(regionName), ...(j.where.sites ?? []).map(id => world.site(id).name)].join(' · ') + '에서만';
const jobView: View = {
  id: 'job', label: '직업', group: 'band', note: '계약소에서 고용한다. 능력치는 표의 기준값에 ±15% 가 붙고, 종족에 따라 조금 더 오른다(오크 백병 공격·엘프 사격 공격·하프링 상업·드워프 건축 +10~15%).',
  render(f) {
    const rows = JOBS.filter(j => hit(j.name + whereText(j), f) && (!f.reg || !j.where || (j.where.regions ?? []).includes(f.reg) || (j.where.sites ?? []).some(id => world.site(id).region === f.reg)));
    return out(`<div class="list">${rows.map(j => row({
      view: 'job', id: j.id, name: j.name, tags: tag(j.heal ? '지원' : j.range > 0 ? '사격' : j.s >= 14 ? '백병' : '비전투', j.heal ? 'k-item' : j.range > 0 ? 'k-freq' : j.s >= 14 ? 'k-battle' : 'k-text'), sub: (j.desc ? j.desc + ' · ' : '') + whereText(j),
      thumb: unitPx(UNIT_FRAME[j.id] ?? 6),
      nums: [['체력', j.hp], ['공격', j.s], ['방어', j.d], ['급료/월', fmt(j.wage)], ['고용비', fmt(j.hire)]],
      detail: grid(dcell('상업', j.t), dcell('공연', j.p), dcell('건축', j.b), dcell('사거리', j.heal ? '치유 ' + j.heal + '/' + j.cooldown + '초' : j.range > 0 ? j.range + ' (사격)' : '백병'), dcell('공격 간격', j.cooldown + '초'), dcell('걸음', j.speed), dcell('고용 가능', whereText(j), true))
        + note('무기를 들면 무기 쪽이 우선이다: 활·석궁을 들면 사격 대원, 검을 들면 백병 대원이 된다. 해고하면 고용비를 그대로 돌려받는다.'),
    })).join('')}</div>`, rows.length);
  },
};

// ───────── 장비 ─────────
interface ItemRow { kind: string; id: string; name: string; tier: number; val: string; price: number; minSize: number; sub: string }
const items = (): ItemRow[] => [
  ...WEAPONS.map(w => ({ kind: '무기', id: w.id, name: w.name, tier: w.tier, val: '공격 +' + w.attack, price: w.price, minSize: w.minSize, sub: w.ranged ? '사격 무기 — 들면 사격 대원' : '백병 무기' })),
  ...ARMORS.map(a => ({ kind: '갑옷', id: a.id, name: a.name, tier: a.tier, val: '방어 +' + a.defense, price: a.price, minSize: a.minSize, sub: '이동 페널티 없음' })),
  ...POTIONS.map(p => ({ kind: '회복약', id: p.id, name: p.name, tier: p.tier, val: '회복 ' + p.heal, price: p.price, minSize: p.minSize, sub: '1인 5개까지, 체력 35% 밑이면 저절로 쓴다' })),
  ...TOOLS.map(t => ({ kind: '도구', id: t.id, name: t.name, tier: t.tier, val: ({ t: '상업', p: '공연', b: '건축' } as const)[t.skill] + ' +' + t.bonus, price: t.price, minSize: t.minSize, sub: '그 기술만 올린다(한 사람 하나)' })),
];
const itemView: View = {
  id: 'item', label: '장비', group: 'band', note: '성의 무기점·방패점·약국·도구점에서 산다. 큰 성일수록 높은 단계를 판다. 사면 고른 대원이 바로 장착하고, 쓰던 것은 반값에 되판다.',
  render(f) {
    const rows = items().filter(i => hit(i.kind + i.name + i.sub, f));
    return out(groups(rows, i => i.kind, i => row({
      view: 'item', id: i.id, name: i.name, tags: tag(i.tier + '단계', 'k-item'), sub: i.sub,
      nums: [['효과', i.val], ['값', fmt(i.price)], ['파는 성', '규모 ' + i.minSize + '+']],
      detail: grid(dcell('효과', i.val), dcell('값', fmt(i.price) + '골'), dcell('되팔 때', fmt(i.price / 2) + '골'), dcell('파는 곳', '규모 ' + i.minSize + ' 이상의 성')),
    })), rows.length);
  },
};

// ───────── 대열 ─────────
function formSvg(fo: Formation) {
  const all = FORMATIONS.flatMap(x => x.slots); const X0 = Math.min(...all.map(p => p[0])) - 4, X1 = Math.max(...all.map(p => p[0])) + 4, Y0 = Math.min(...all.map(p => p[1])) - 4, Y1 = Math.max(...all.map(p => p[1])) + 4;
  const W = 420, H = 150, sx = (W - 60) / (X1 - X0), sy = (H - 20) / (Y1 - Y0); const px = (v: number) => 50 + (v - X0) * sx, py = (v: number) => 10 + (v - Y0) * sy;
  const dots = fo.slots.map(([x, y], i) => `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="9" fill="${i === 0 ? '#e0b040' : '#c8a070'}" stroke="#1a1008"/><text x="${px(x).toFixed(1)}" y="${(py(y) + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-family="monospace" fill="#1a1008">${i + 1}</text>`).join('');
  return `<svg class="formsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(fo.name)} 대열 그림"><polygon points="8,${H / 2} 24,${H / 2 - 7} 24,${H / 2 + 7}" fill="#b4302a"/><text x="10" y="${H / 2 + 22}" font-size="11" fill="#b4302a" font-family="sans-serif">적</text>${dots}</svg>`;
}
const pct = (v: number) => Math.round(v * 100) + '%';
const formView: View = {
  id: 'form', label: '대열', group: 'band', note: '편성 창과 전투 중 «전투명령»에서 고른다. 그림의 왼쪽(빨간 화살표)이 적 쪽. 1번은 부대장, 2번부터 대원 순서. 백병은 앞, 사격은 뒤 — «자동 배치»나 대열을 바꾸면 저절로 선다.',
  render(f) {
    const rows = FORMATIONS.filter(fo => hit(fo.name + fo.desc, f));
    return out(`<div class="list">${rows.map(fo => row({
      view: 'form', id: fo.id, name: fo.name, sub: fo.desc,
      nums: [['공격', pct(fo.atk)], ['방어', pct(fo.def)], ['명중', pct(fo.hit)]],
      detail: formSvg(fo) + grid(dcell('공격 배율', pct(fo.atk)), dcell('방어 배율', pct(fo.def)), dcell('명중 배율', pct(fo.hit)), dcell('앞줄(적 쪽) 자리', fo.slots.map((s, i) => [s[0], i + 1] as const).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1] + '번').join(' · ')))
        + (fo.id === 'guard' ? note('수비 대열에서는 부대장이 받는 피해가 더 줄어든다(방어 ×1.3 추가).') : ''),
    })).join('')}</div>`, rows.length);
  },
};

// ───────── 상품 ─────────
const goodView: View = {
  id: 'good', label: '상품', group: 'world', note: `교역소(성·교역소·항구)에서 사고판다. 특산지에서는 기준가의 ${pct(BALANCE.homePriceMul)}, 지역이 하나 멀어질 때마다 +${pct(BALANCE.hopPriceMul)}. 비싼 상품일수록 재고가 적다. 상업력은 사는 값·파는 값을 둘 다 내린다(100이면 반값).`,
  render(f) {
    const rows = GOODS.filter(g => hit(g.name + g.home.map(regionName).join(' '), f) && (!f.reg || g.home.includes(f.reg)));
    return out(`<div class="list">${rows.map(g => row({
      view: 'good', id: g.id, name: g.name, sub: '특산지: ' + g.home.map(regionName).join(' · '),
      nums: [['기준가', fmt(g.base)], ['특산지 값', fmt(g.base * BALANCE.homePriceMul)]],
      detail: grid(dcell('기준가', fmt(g.base) + '골'), dcell('특산지에서', '약 ' + fmt(g.base * BALANCE.homePriceMul) + '골'), dcell('1지역 멀리', '약 ' + fmt(g.base * (1 + BALANCE.hopPriceMul)) + '골'), dcell('2지역 멀리', '약 ' + fmt(g.base * (1 + 2 * BALANCE.hopPriceMul)) + '골(규모 5 성만 취급)'))
        + note('실제 값은 거점마다 ±15% 가 더 붙고 날마다 조금씩 흔들린다. 들른 교역소의 값은 게임 안 «시세 수첩»에 적힌다.'),
    })).join('')}</div>`, rows.length);
  },
};

// ───────── 적 ─────────
interface FoeGroup { id: string; name: string; where: string; units: EnemyDef[] }
const foeGroups = (): FoeGroup[] => {
  const rng = new Rng(1);
  return [
    ...[1, 2, 3].map(t => ({ id: 'bandit' + t, name: '도적단 ' + ['소규모', '중규모', '대규모'][t - 1], where: '군사 게시판 토벌 의뢰 · 떠돌이 도적(소규모·중규모)', units: makeBandits(t, rng) })),
    ...[1, 2, 3].map(t => ({ id: 'rebel' + t, name: '잿빛 전투단 ' + t + '단계', where: '잿빛 교단 점령지에서 나와 요새를 친다(길에서 만나면 교전)', units: makeRebels(t) })),
    { id: 'garrison0', name: '잿빛 수비대(요충지)', where: '점령된 관문·망루·항구 등을 탈환할 때(공성전)', units: makeGarrison(false) },
    { id: 'garrison1', name: '잿빛 수비대(성)', where: '점령된 성을 탈환할 때(공성전)', units: makeGarrison(true) },
    ...[1, 2, 3, 4, 5].map(l => ({ id: 'escort' + l, name: '집행관 호위대 ' + l + '단계', where: '상환일에 돈이 없을 때 싸우기를 고르면. 이길 때마다 다음 단계', units: makeEscort(l) })),
  ];
};
const foeView: View = {
  id: 'foe', label: '적', group: 'world', note: '적이 있는 거점에 들어가면 자동 전투. 이기면 전리품(쓰러뜨린 적의 현상금 합)과 의뢰 보수. 성벽은 «공성» 방식으로 쳐야 빨리 무너진다(×3).',
  render(f) {
    const rows = foeGroups().filter(g => hit(g.name + g.where + g.units.map(u => u.name).join(' '), f));
    return out(`<div class="list">${rows.map(g => {
      const hp = g.units.reduce((a, u) => a + u.hp, 0), bounty = g.units.reduce((a, u) => a + u.bounty, 0);
      const byName = new Map<string, { u: EnemyDef; n: number }>(); for (const u of g.units) { const e = byName.get(u.name); if (e) e.n++; else byName.set(u.name, { u, n: 1 }); }
      return row({
        view: 'foe', id: g.id, name: g.name, tags: g.units.some(u => u.wall) ? tag('공성', 'k-trap') : '', sub: g.where,
        thumb: unitPx(g.id.startsWith('rebel') || g.id.startsWith('garrison') ? UNIT_FRAME.rebel : g.id.startsWith('escort') ? UNIT_FRAME.escort : UNIT_FRAME.bandit),
        nums: [['머릿수', g.units.length], ['체력 합', fmt(hp)], ['공격 합', fmt(g.units.reduce((a, u) => a + u.s, 0))], ['전리품', fmt(bounty)], ['사격', g.units.filter(u => u.range > 0).length + '명']],
        detail: table(['이름', '수', '체력', '공격', '방어', '사거리', '간격', '현상금'], [...byName.values()].map(({ u, n }) => [u.name + (u.wall ? ' (성벽)' : ''), n, u.hp, u.s, u.d, u.range || '백병', u.cooldown + '초', fmt(u.bounty)])),
      });
    }).join('')}</div>`, rows.length);
  },
};

// ───────── 세계(지역·거점) ─────────
const INITIAL_BLOCKED = new Set(['reg_r02', 'reg_r03', 'reg_r08']);
const siteSub = (s: Site) => `${KIND_LABEL[s.kind]}${s.kind === 'castle' ? ' 규모 ' + s.size : ''} · ${factionName(s.owner)}${s.owner === 'fac_10' ? ' (처음부터 점령지)' : ''}`;
const worldView: View = {
  id: 'world', label: '세계', group: 'world', note: '11개 지역, 150개 거점. 성에는 계약소·게시판·상점·술집·병원·건축 길드가 있고, 교역소는 성·교역소·항구에 있다. 북부 철산·서부 대삼림·남동 군도는 처음엔 닫혀 있다(사건으로 연다).',
  render(f) {
    const sites = [...world.sites.values()].filter(s => hit(s.name + KIND_LABEL[s.kind] + factionName(s.owner) + (s.specialty ?? '') + regionName(s.region), f) && (!f.reg || s.region === f.reg))
      .sort((a, b) => a.region.localeCompare(b.region) || (a.kind === 'castle' ? 0 : 1) - (b.kind === 'castle' ? 0 : 1) || b.size - a.size);
    return out(groups(sites, s => regionName(s.region) + (INITIAL_BLOCKED.has(s.region) ? ' 🔒' : ''), s => row({
      view: 'world', id: s.id, name: s.name, tags: s.owner === 'fac_10' ? tag('잿빛 교단', 'k-battle') : '', sub: siteSub(s),
      thumb: sitePx(siteIcon(s.kind, s.size)),
      nums: [['이웃', s.adjacent.length], ['내구', isFort(s) ? fortMax(s) : '-'], ['시설', isTown(s) ? '성 전부' : hasMarket(s) ? '교역소' : '없음']],
      detail: grid(dcell('지역', regionName(s.region)), dcell('종류', KIND_LABEL[s.kind]), dcell('지배', factionName(s.owner)), dcell('인구', s.population ? fmt(s.population) : '-'), dcell('이웃 거점', s.adjacent.map(id => world.sites.get(id)?.name ?? id).join(' · '), true), dcell('특색', s.specialty ?? '-', true)),
    }), rs => `${rs.length}곳 · 성 ${rs.filter(s => s.kind === 'castle').length}`), sites.length);
  },
};

// ───────── 사건 ─────────
interface Ev { id: string; title: string; where: string; when: string; what: string; kind: '합류' | '관문' | '역사' | '큰 사건' | '검은 창' }
const EVENTS: Ev[] = [
  { id: 'join_phoebe', kind: '합류', title: '대금고의 감시인 — 피비', where: '샹파르', when: '시작 3일 뒤 도착하면', what: '하프링 교역 부대장이 합류한다.' },
  { id: 'join_brok', kind: '합류', title: '오크 병법가 — 브록', where: '오르블랑', when: '도착하면', what: '전투에 강한 부대장이 합류한다.' },
  { id: 'join_liesel', kind: '합류', title: '떠돌이 음유시인 — 리젤', where: '발리스', when: '도착하면', what: '공연 부대장이 합류한다.' },
  { id: 'join_ella', kind: '합류', title: '숲에서 쫓겨난 혼혈 — 엘라', where: '리보른', when: '도착하면', what: '활을 잘 쏘는 혼혈 부대장. 엘프 숲을 여는 열쇠.' },
  { id: 'join_durin', kind: '합류', title: '수도원의 드워프 공병 — 두린', where: '세인트 아르노', when: '도착하면', what: '건축·공성에 강한 드워프. 산문을 여는 열쇠.' },
  { id: 'dwarf_gate', kind: '관문', title: '산문 폐쇄 — 철산 대문', where: '북부 철산 입구 관문·성 5곳', when: '두린이나 드워프 대원이 있는 부대가 가면', what: '통행세 5,000골을 내면 북부 철산이 열린다(철·미스릴·화약).' },
  { id: 'elf_border', kind: '관문', title: '경계 선언 — 안개 관문', where: '서부 대삼림 입구 7곳', when: '혼혈·엘프가 있는 부대가 가면', what: '서부 대삼림이 열린다. 단, 혼혈·엘프가 있는 부대만 들어갈 수 있다.' },
  { id: 'islands_ferry', kind: '관문', title: '배편 — 남동 군도', where: '남쪽 항구 5곳', when: '도착하면', what: '선금 8,000골을 내면 남동 군도 항로가 열린다(향신료·진주·유황).' },
  { id: 'h_100002', kind: '역사', title: '1000년 2월 — 하이펠트 봉기', where: '어디서나', when: '달이 바뀔 때', what: '잿빛 교단이 봉기한다. 전투단이 요새를 치기 시작한다.' },
  { id: 'h_100003', kind: '역사', title: '1000년 3월 — 토벌령과 성전 선포', where: '어디서나', when: '달이 바뀔 때', what: '군사 의뢰가 늘고, 용병단 «검은 창»이 좋은 의뢰를 가로채기 시작한다.' },
  { id: 'h_100106', kind: '역사', title: '1001년 6월 — 오토의 도른 탈환', where: '어디서나', when: '달이 바뀔 때', what: '도른이 되돌아온다. 먼저 탈환했으면 오토가 카엘을 기억한다.' },
  { id: 'h_100206', kind: '역사', title: '1002년 6월 — 하이펠트 함락, 교단 와해', where: '어디서나', when: '달이 바뀔 때', what: '잿빛 교단이 흩어진다. 영주들이 점령지를 더 빨리 되찾는다.' },
  { id: 'h_100301', kind: '역사', title: '1003년 1월 — 발두르의 폐위 시도', where: '어디서나', when: '달이 바뀔 때', what: '황태후의 밀서 사건이 아르덴에서 열린다.' },
  { id: 'h_100401', kind: '역사', title: '1004년 1월 — 섭정 참살, 제도 약탈', where: '어디서나', when: '달이 바뀔 때', what: '아르덴 교역소가 닫히고, 중앙 제도의 총호송 보수가 3배가 된다.' },
  { id: 'ev2', kind: '큰 사건', title: '세레나 경연의 우승자 — 이졸데', where: '세레나(C021) 술집 «임무»', when: '언제나', what: '리보른까지 호송하면 20,000골. 이졸데(공연 38)를 대원으로 맞을 수 있다.' },
  { id: 'ev3', kind: '큰 사건', title: '고문서 장수 — 일곱 영웅의 인장', where: '아르덴·… 큰 성 5곳 술집 «임무»', when: '언제나', what: '지도 5,000골. 모래 균열·대균열·유황 구멍에서 발굴비 2,000골씩 내면 인장 조각 3개.' },
  { id: 'ev4', kind: '큰 사건', title: '상아탑의 지하 — 저주받은 골렘', where: '상아탑(C050)', when: '도착하면', what: '30,000골. 체력 120·공격 40·방어 40, 급료 1,500. 해고·이동 불가.' },
  { id: 'ev5', kind: '큰 사건', title: '대성당의 세탁물 — 아델라 성지', where: '세인트 발드릭(C004) 술집 «임무» → 아델라 성지(P052)', when: '여성 부대장(피비·엘라·리젤) 부대로', what: '20,000골과 부대 전원 회복.' },
  { id: 'ev6', kind: '큰 사건', title: '라엘린 궁술 대회', where: '라엘린(C014)', when: '1001년 4월 이후', what: '참가비 2,000골. 사격 대원이 많으면 우승 — 15,000골과 트로피.' },
  { id: 'ev7', kind: '큰 사건', title: '고원 씨족의 사절', where: '하이크래그(C031)', when: '도착하면', what: '잔치 3,000골을 베풀고 오르블랑까지 호위하면 50,000골. 모욕하면 산적에게 붙잡힌다(구출해도 50,000골).' },
  { id: 'ev8', kind: '큰 사건', title: '에스펠 지하의 결계 부품', where: '에스펠(C007) 술집 «임무» → 상아탑(C050)', when: '언제나', what: '길목에 잿빛 전투단 둘. 전하면 100,000골.' },
  { id: 'ev9', kind: '큰 사건', title: '황태후의 밀서 — 황제 탈출', where: '아르덴(C001)', when: '1003년 1월 이후, 전투력 250 이상', what: '근위대 세 부대를 뚫고 오르블랑까지 모시면 2,500,000골.' },
  { id: 'ev10', kind: '큰 사건', title: '그레이홀로 지하 — 아버지의 유품', where: '그레이홀로(C048) 탈환 뒤, 카엘 부대로', when: '도착하면', what: '집행관에게 넘기면 5,000,000골. 인장 3개로 열면 10,000,000골 — 빚을 한 번에.' },
  { id: 'blackspear', kind: '검은 창', title: '검은 창의 로한 — 공동 작전', where: '큰 성 5곳 술집 «임무»', when: '토벌령 뒤, 브록이 있으면 더 자주', what: '점령지 하나를 창병 3과 함께 탈환. 보수는 40%.' },
];
const eventView: View = {
  id: 'event', label: '사건', group: 'world', note: '대화창으로 나오는 사건들. 한 번뿐인 것이 대부분이고, 술집 «임무를 찾는다»로 여는 것도 있다. 대화가 열린 채 저장되어도 사라지지 않는다.',
  render(f) {
    const rows = EVENTS.filter(e => hit(e.title + e.where + e.when + e.what + e.kind, f));
    return out(groups(rows, e => e.kind, e => row({ view: 'event', id: e.id, name: e.title, sub: e.where, nums: [['언제', e.when]], detail: grid(dcell('어디서', e.where), dcell('언제', e.when), dcell('무슨 일', e.what, true)) })), rows.length);
  },
};

// ───────── 규칙(숫자) ─────────
const RULES: [string, string, string][] = [
  ['달력', '한 달 28일 · 1년 12달', `상환일 매달 ${BALANCE.repaymentDays.join('·')}일 · 급료일 매달 ${BALANCE.wageDay}일 · 속도 ×1 에서 하루 ${BALANCE.secondsPerDay}초`],
  ['빚', `${fmt(BALANCE.startDebt)}골`, `시작 소지금 ${fmt(BALANCE.startCash)}골 · 기본 상환 ${fmt(BALANCE.minRepayment)}골 · 미납 가산금 ${fmt(BALANCE.missedPenalty)}골 · 연속 ${BALANCE.bankruptMisses}회 미납이면 해산`],
  ['호위대', `최대 ${BALANCE.escortMaxLevel}단계`, '돈이 없을 때 싸워 이기면 그 주 상환을 미루고 다음 호위대가 한 단계 세진다'],
  ['이동', `하루 ${BALANCE.marchSpeed}단위`, `행군 피로 하루 +${BALANCE.fatigueMarchPerDay}(사막 ×${BALANCE.desertFatigueMul}) · 성에서 쉬면 ${-BALANCE.fatigueRestPerDay} · 뱃삯 1인 ${BALANCE.ferryFarePerHead}골`],
  ['대원 성장', `최고 ${MAX_LEVEL}단계`, '전투마다 경험 +1, 처치마다 +2. 단계가 오르면 공격·방어 +1, 체력 +2. 단계 n 은 경험 10·n(n+1)/2 부터'],
  ['전투', `명중 ${pct(BALANCE.battleHitBase)}`, `피로 1당 명중 −${BALANCE.battleFatigueHitLoss * 100}% · 전투 뒤 피로 +${BALANCE.fatigueBattle} · 회복약은 체력 ${pct(BALANCE.battlePotionAt)} 밑에서 자동 · 도적 1명 현상금 ${fmt(BALANCE.banditBountyPerUnit)}골×규모`],
  ['교역', `사는 값 ×${BALANCE.buySpread} / 파는 값 ×${BALANCE.sellSpread}`, `1인 적재 ${BALANCE.carryPerMember} · 재고는 하루 ${pct(BALANCE.stockRegenPerDay)}씩 기준으로 · 상업력 ${BALANCE.tradeSkillMax}이면 값 반`],
  ['민사 의뢰', `기본 ${fmt(BALANCE.civilBaseReward)}골 + 거리당 ${BALANCE.civilRewardPerUnit}`, `게시판 ${BALANCE.boardRefreshDays}일마다 ${BALANCE.boardSlots}개 · 기한 = 이동일 + ${BALANCE.civilDeadlineSlack} · 늦으면 ${pct(BALANCE.civilLatePenaltyRate)} · 포기 위약금 ${pct(BALANCE.civilAbandonFeeRate)}`],
  ['토벌 의뢰', `기본 ${fmt(BALANCE.militaryBaseReward)}골 + 규모당 ${fmt(BALANCE.militaryRewardPerTier)}`, `${BALANCE.militaryRefreshDays}일마다 새로. 기한 없음`],
  ['공연', `손님 눈높이 = 성 규모 × ${BALANCE.showFailPowerPerSize}`, `수입 = 공연력 × 규모 × ${BALANCE.showIncomePerPower} · 실패 위약금 규모 × ${fmt(BALANCE.showFailPenaltyPerSize)} · 같은 술집 ${BALANCE.showCooldownDays}일에 한 번`],
  ['건축', `성벽 증축 보수 ${fmt(BALANCE.buildWallsReward)}골`, `작업량 ${BALANCE.buildWallsWork}×(규모/3) · 요새 보수는 내구 1당 작업 ${BALANCE.buildRepairWorkPerPoint}·보수 ${BALANCE.buildRepairRewardPerPoint}골 · 하루 피로 +${BALANCE.buildFatiguePerDay}`],
  ['잿빛 교단', `${BALANCE.rebelStartDay}일째부터`, `전투단 최대 ${BALANCE.rebelMaxBands} · 하루 요새 피해 ${BALANCE.rebelSiegeDamage} · 탈환 보수 성 ${fmt(BALANCE.liberateRewardCastle)} / 요충지 ${fmt(BALANCE.liberateRewardMinor)} · 영주가 달마다 ${pct(BALANCE.lordRetakeChance)}로 되찾음`],
  ['병원', `체력 1당 ${BALANCE.hospitalPerHp}골`, `피로 1당 ${BALANCE.hospitalPerFatigue}골 · 성에서 쉬면 하루 체력 +${BALANCE.healRestPerDay}`],
  ['계약소', `${BALANCE.contractRefreshDays}일마다 새 후보`, '후보 수 = 3 + 성 규모 · 급료를 못 주면 장비 든 대원이 70% 로 도망'],
];
const ruleView: View = {
  id: 'rule', label: '규칙', group: 'world', note: '게임 안 숫자들(src/core/balance.ts). 밸런스를 바꾸면 여기도 같이 바뀐다.',
  render(f) {
    const rows = RULES.filter(r => hit(r.join(' '), f));
    return out(`<div class="list">${rows.map(([k, v, d]) => `<div class="row static"><span class="nm"><span class="nt"><b>${esc(k)}</b><span>${esc(d)}</span></span></span><span class="num">${esc(v)}</span></div>`).join('')}</div>`, rows.length);
  },
};

const VIEWS: View[] = [leaderView, jobView, itemView, formView, goodView, foeView, worldView, eventView, ruleView];

// ───────── 쪽 짜기 ─────────
const outEl = $('out'), qIn = $<HTMLInputElement>('q'), regSel = $<HTMLSelectElement>('reg');
const state: Filter & { view: ViewId } = { view: 'leader', q: '', reg: '' };
const opened = new Set<string>();
for (const v of VIEWS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = v.label; b.dataset.view = v.id; b.setAttribute('aria-pressed', 'false'); $(v.group === 'band' ? 'seg-band' : 'seg-world').append(b); }
regSel.insertAdjacentHTML('beforeend', [...world.regions.values()].map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join(''));
$('stats').innerHTML = ([['부대장', LEADERS.length], ['직업', JOBS.length], ['장비', items().length], ['대열', FORMATIONS.length], ['상품', GOODS.length], ['거점', world.sites.size], ['사건', EVENTS.length]] as [string, number][]).map(([k, n]) => `<div class="stat"><b>${n}</b><span>${esc(k)}</span></div>`).join('');

function render() {
  const v = VIEWS.find(x => x.id === state.view) ?? VIEWS[0];
  const { html, count } = v.render(state);
  outEl.className = `v-${v.id}`; outEl.innerHTML = html;
  for (const d of outEl.querySelectorAll<HTMLDetailsElement>('details.item')) if (opened.has(d.dataset.key ?? '')) d.open = true;
  $('count').textContent = `${count}개`; $('tabnote').textContent = v.note;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.view === v.id));
  regSel.hidden = !(v.id === 'world' || v.id === 'good' || v.id === 'job');
  document.title = `${v.label} · 제국의 마지막 용병 도감`;
}
function setView(view: ViewId, push = true) {
  state.view = view; render();
  const top = document.querySelector<HTMLElement>('.bar')!.offsetTop; if (window.scrollY > top) window.scrollTo({ top });
  if (push) history.pushState(null, '', `#${view}`);
}
function applyHash() {
  const [v, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  const view = VIEWS.find(x => x.id === v)?.id ?? 'leader'; state.view = view;
  if (id) opened.add(`${view}/${id}`);
  render();
  if (id) outEl.querySelector(`[data-key="${CSS.escape(`${view}/${id}`)}"]`)?.scrollIntoView({ block: 'start' });
}
document.querySelector('.bar')!.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg button'); if (b?.dataset.view) setView(b.dataset.view as ViewId); });
qIn.addEventListener('input', () => { state.q = qIn.value; render(); });
regSel.addEventListener('change', () => { state.reg = regSel.value; render(); });
outEl.addEventListener('toggle', e => { const d = e.target as HTMLDetailsElement; const k = d.dataset?.key; if (!k) return; if (d.open) opened.add(k); else opened.delete(k); }, true);
window.addEventListener('popstate', applyHash);
// 게임으로: 새 창으로 열렸으면 닫고, 아니면 게임 첫 화면으로(앱 안에서는 늘 이쪽)
$('back').addEventListener('click', e => { if (window.opener && !window.opener.closed) { e.preventDefault(); window.close(); setTimeout(() => { location.href = 'index.html'; }, 300); } });

// ───────── 화면 밝기 ─────────
const THEME_KEY = 'md.codex.theme'; const THEMES = ['auto', 'light', 'dark'] as const; const THEME_NAME = { auto: '자동', light: '밝게', dark: '어둡게' } as const;
type Theme = typeof THEMES[number]; const themeBtn = $<HTMLButtonElement>('theme');
function setTheme(t: Theme) { if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; themeBtn.textContent = `화면: ${THEME_NAME[t]}`; try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* 막힌 창 */ } }
let theme: Theme = 'auto'; try { const v = localStorage.getItem(THEME_KEY); if (v === 'light' || v === 'dark') theme = v; } catch { /* 위와 같음 */ }
setTheme(theme); themeBtn.addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; setTheme(theme); });
void ICON;
applyHash();
