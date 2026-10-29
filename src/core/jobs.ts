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
}
export const JOBS: readonly Job[] = [
  { id: 'sword', name: '검병', hp: 30, s: 18, d: 12, t: 0, p: 0, b: 2, wage: 300, hire: 1_200, range: 0, cooldown: 1.0, speed: 22, weight: 5 },
  { id: 'heavy', name: '중장보병', hp: 42, s: 16, d: 24, t: 0, p: 0, b: 4, wage: 500, hire: 2_600, range: 0, cooldown: 1.3, speed: 16, weight: 2 },
  { id: 'ironclad', name: '드워프 철갑보병', hp: 52, s: 20, d: 32, t: 0, p: 0, b: 8, wage: 800, hire: 5_000, range: 0, cooldown: 1.3, speed: 14, where: { regions: ['reg_r02'] }, weight: 2 },
  { id: 'crossbow', name: '석궁병', hp: 24, s: 14, d: 8, t: 0, p: 0, b: 0, wage: 400, hire: 1_800, range: 26, cooldown: 0.6, speed: 20, weight: 3 },
  { id: 'longbow', name: '장궁병', hp: 22, s: 22, d: 6, t: 0, p: 0, b: 0, wage: 450, hire: 2_200, range: 42, cooldown: 1.6, speed: 20, weight: 2 },
  { id: 'mage', name: '마법병', hp: 18, s: 34, d: 4, t: 0, p: 4, b: 0, wage: 1_200, hire: 8_000, range: 36, cooldown: 2.0, speed: 18, where: { sites: ['C050', 'C007'], regions: ['reg_r03'] }, weight: 1 },
  { id: 'merchant', name: '상인', hp: 16, s: 4, d: 4, t: 28, p: 2, b: 0, wage: 350, hire: 1_500, range: 0, cooldown: 1.5, speed: 18, weight: 2 },
  { id: 'bard', name: '음유시인', hp: 16, s: 4, d: 4, t: 2, p: 26, b: 0, wage: 350, hire: 1_500, range: 0, cooldown: 1.5, speed: 20, weight: 1 },
  { id: 'mason', name: '석공', hp: 22, s: 8, d: 8, t: 0, p: 0, b: 26, wage: 350, hire: 1_500, range: 0, cooldown: 1.4, speed: 18, weight: 1 },
];
export const JOB_BY_ID: ReadonlyMap<string, Job> = new Map(JOBS.map(j => [j.id, j]));

const FIRST = ['한스', '이보', '마르코', '브렌', '올라', '테오', '리나', '요나', '카이', '밀라', '울프', '그레타', '도르', '핀', '사샤', '엘로', '구스', '베라', '티모', '라르스'];
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
  const name = rng.pick(FIRST) + (seq % 2 ? ' ' + rng.pick(['의 아들', '', '', '']) : '');
  return { name: name.trim(), race, stats, wage: job.wage, hire: Math.round(job.hire * (0.8 + quality * 0.3) / 10) * 10 };
}

/** 이 거점에서 고용할 수 있는 직업 */
export function jobsAt(siteId: string, region: string): Job[] {
  return JOBS.filter(j => !j.where || j.where.sites?.includes(siteId) || j.where.regions?.includes(region));
}
