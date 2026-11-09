import { Rng } from './rng';
import type { Stats } from './squad';

/** 고용 용병 직업(GDD §5.1). range 0 = 백병, 그 외 = 사격 사거리(전장 단위). */
export interface Job {
  id: string; name: string;
  hp: number; s: number; d: number; t: number; p: number; b: number;
  wage: number; hire: number;
  range: number; cooldown: number; speed: number;
  /** 고용 가능 조건: 지역 또는 거점 id. 없으면 어디서나 */
  where?: { regions?: string[]; sites?: string[] };
  weight: number;
  /** 치유량(>0 이면 싸우지 않고 다친 아군을 고친다, cooldown 마다) */
  heal?: number;
  /** 한 줄 설명(도감·계약소) */
  desc?: string;
}
export const JOBS: readonly Job[] = [
  // 백병
  { id: 'sword', name: '검병', hp: 30, s: 18, d: 12, t: 0, p: 0, b: 2, wage: 300, hire: 1_200, range: 0, cooldown: 1.0, speed: 22, weight: 5, desc: '어디서나 뽑는 기본 백병. 값싸고 고르다' },
  { id: 'spear', name: '창병', hp: 32, s: 17, d: 15, t: 0, p: 0, b: 2, wage: 320, hire: 1_400, range: 0, cooldown: 1.1, speed: 21, weight: 4, desc: '검병보다 조금 단단하다. 앞줄에 세우기 좋다' },
  { id: 'heavy', name: '중장보병', hp: 42, s: 16, d: 24, t: 0, p: 0, b: 4, wage: 500, hire: 2_600, range: 0, cooldown: 1.3, speed: 16, weight: 2, desc: '느리지만 방어가 높다. 벽 노릇' },
  { id: 'axe', name: '도끼병', hp: 34, s: 24, d: 8, t: 0, p: 0, b: 4, wage: 380, hire: 1_700, range: 0, cooldown: 1.3, speed: 20, where: { regions: ['reg_r05', 'reg_r07'] }, weight: 3, desc: '오크 땅의 도끼잡이. 공격은 세고 방어는 얇다' },
  { id: 'ironclad', name: '드워프 철갑보병', hp: 52, s: 20, d: 32, t: 0, p: 0, b: 8, wage: 800, hire: 5_000, range: 0, cooldown: 1.3, speed: 14, where: { regions: ['reg_r02'] }, weight: 2, desc: '가장 단단한 보병. 북부 철산에서만' },
  { id: 'cavalry', name: '기병', hp: 38, s: 21, d: 14, t: 0, p: 0, b: 0, wage: 650, hire: 3_400, range: 0, cooldown: 1.0, speed: 34, where: { regions: ['reg_r05', 'reg_r07', 'reg_r01'] }, weight: 2, desc: '말을 탄 백병. 걸음이 빨라 적 사수에게 먼저 닿는다' },
  // 사격
  { id: 'slinger', name: '투석병', hp: 20, s: 10, d: 5, t: 0, p: 0, b: 0, wage: 220, hire: 800, range: 18, cooldown: 0.9, speed: 22, weight: 3, desc: '가장 싼 사격 대원. 사거리가 짧다' },
  { id: 'crossbow', name: '석궁병', hp: 24, s: 14, d: 8, t: 0, p: 0, b: 0, wage: 400, hire: 1_800, range: 26, cooldown: 0.6, speed: 20, weight: 3, desc: '빠르게 쏘는 사수' },
  { id: 'longbow', name: '장궁병', hp: 22, s: 22, d: 6, t: 0, p: 0, b: 0, wage: 450, hire: 2_200, range: 42, cooldown: 1.6, speed: 20, weight: 2, desc: '멀리, 세게, 천천히' },
  { id: 'horsearcher', name: '궁기병', hp: 30, s: 16, d: 9, t: 0, p: 0, b: 0, wage: 700, hire: 3_600, range: 24, cooldown: 1.0, speed: 32, where: { regions: ['reg_r05'] }, weight: 1, desc: '사막의 말 탄 사수. 빠르고 질기다' },
  { id: 'ranger', name: '엘프 순찰대', hp: 26, s: 24, d: 9, t: 0, p: 0, b: 0, wage: 750, hire: 4_200, range: 44, cooldown: 1.4, speed: 24, where: { regions: ['reg_r03'] }, weight: 2, desc: '가장 먼 사거리. 서부 대삼림에서만' },
  { id: 'mage', name: '마법병', hp: 18, s: 34, d: 4, t: 0, p: 4, b: 0, wage: 1_200, hire: 8_000, range: 36, cooldown: 2.0, speed: 18, where: { sites: ['C050', 'C007'], regions: ['reg_r03'] }, weight: 1, desc: '한 방이 가장 세다. 상아탑·에스펠·엘프 숲' },
  // 지원
  { id: 'healer', name: '치유사', hp: 20, s: 4, d: 6, t: 0, p: 6, b: 0, wage: 600, hire: 3_000, range: 0, cooldown: 2.5, speed: 19, heal: 8, where: { sites: ['C004', 'C030', 'C001'], regions: ['reg_r09'] }, weight: 1, desc: '싸우지 않고 다친 아군을 고친다(2.5초마다 8). 대성당·수도원·제도' },
  // 비전투
  { id: 'merchant', name: '상인', hp: 16, s: 4, d: 4, t: 28, p: 2, b: 0, wage: 350, hire: 1_500, range: 0, cooldown: 1.5, speed: 18, weight: 2, desc: '상업력으로 사고파는 값을 내린다' },
  { id: 'scribe', name: '서기', hp: 16, s: 3, d: 4, t: 18, p: 0, b: 4, wage: 280, hire: 1_100, range: 0, cooldown: 1.5, speed: 18, weight: 1, desc: '값싼 상업 대원' },
  { id: 'bard', name: '음유시인', hp: 16, s: 4, d: 4, t: 2, p: 26, b: 0, wage: 350, hire: 1_500, range: 0, cooldown: 1.5, speed: 20, weight: 1, desc: '공연력. 술집 공연으로 돈을 번다' },
  { id: 'dancer', name: '무희', hp: 16, s: 3, d: 4, t: 4, p: 30, b: 0, wage: 400, hire: 1_800, range: 0, cooldown: 1.5, speed: 22, where: { regions: ['reg_r05', 'reg_r04'] }, weight: 1, desc: '공연력이 가장 높다. 사막·동부 해안' },
  { id: 'mason', name: '석공', hp: 22, s: 8, d: 8, t: 0, p: 0, b: 26, wage: 350, hire: 1_500, range: 0, cooldown: 1.4, speed: 18, weight: 1, desc: '건축력. 보수·증축 공사' },
  { id: 'carpenter', name: '목수', hp: 24, s: 9, d: 8, t: 0, p: 0, b: 20, wage: 300, hire: 1_200, range: 0, cooldown: 1.4, speed: 19, weight: 2, desc: '값싼 건축 대원' },
];
export const JOB_BY_ID: ReadonlyMap<string, Job> = new Map(JOBS.map(j => [j.id, j]));

const FIRST = ['한스', '이보', '마르코', '브렌', '올라', '테오', '리나', '요나', '카이', '밀라', '울프', '그레타', '도르', '핀', '사샤', '엘로', '구스', '베라', '티모', '라르스'];
/** 성(짧게 1~2자): 이름이 겹치지 않게 뒤에 붙인다(테오 벨 / 테오 란) */
const LAST = ['벨', '린', '콜', '란', '하트', '모어', '그란', '로웰', '핀', '카일', '도른', '브릭', '셀', '요크', '마르', '보른', '텐', '윌', '가르', '레인'];
const RACES_BY_REGION: Record<string, string[]> = {
  reg_r02: ['드워프', '드워프', '인간'], reg_r03: ['엘프', '혼혈'], reg_r05: ['오크', '인간'], reg_r07: ['인간', '오크'], reg_r04: ['인간', '하프링'],
};

/** 계약소 후보 한 명 */
export function rollCandidate(rng: Rng, job: Job, region: string, seq: number): { name: string; race: string; stats: Stats; wage: number; hire: number } {
  const races = RACES_BY_REGION[region] ?? ['인간'];
  const race = job.id === 'ironclad' ? '드워프' : rng.pick(races);
  const v = () => 0.85 + rng.next() * 0.3;
  const stats: Stats = {
    maxHp: Math.round(job.hp * v()), hp: 0, e: rng.int(0, 6), f: rng.int(0, 10),
    s: Math.round(job.s * v() * (race === '오크' && job.range === 0 ? 1.1 : race === '엘프' && job.range > 0 ? 1.1 : 1)),
    d: Math.round(job.d * v()), t: Math.round(job.t * v() * (race === '하프링' ? 1.15 : 1)), p: Math.round(job.p * v()), b: Math.round(job.b * v() * (race === '드워프' ? 1.15 : 1)),
  };
  stats.hp = stats.maxHp;
  const quality = (stats.s + stats.d + stats.t + stats.p + stats.b) / (job.s + job.d + job.t + job.p + job.b || 1);
  void seq;
  const name = rng.pick(FIRST) + ' ' + rng.pick(LAST);
  return { name, race, stats, wage: job.wage, hire: Math.round(job.hire * (0.8 + quality * 0.3) / 10) * 10 };
}

/** 이 거점에서 고용할 수 있는 직업 */
export function jobsAt(siteId: string, region: string): Job[] {
  return JOBS.filter(j => !j.where || j.where.sites?.includes(siteId) || j.where.regions?.includes(region));
}
