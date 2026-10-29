import { BALANCE } from './balance';
import { Rng } from './rng';
import { hash } from './market';
import type { World, Site } from './world';

/** 민사 게시판 의뢰 종류(원작: 총호송·편지·소포·서류) */
export type CivilJob = 'letter' | 'parcel' | 'papers' | 'escort';
export const CIVIL_JOB_LABEL: Record<CivilJob, string> = { letter: '편지', parcel: '소포', papers: '서류', escort: '총호송' };
const JOB_FACTOR: Record<CivilJob, number> = { letter: 0.8, parcel: 1.0, papers: 1.3, escort: 2.2 };

export interface CivilQuest {
  id: string; job: CivilJob;
  from: string; to: string;
  /** 절대 일수(dayIndex) 기한 */
  deadline: number;
  client: string; reward: number;
  /** 최소 이동 일수(표시용) */
  travelDays: number;
}
export interface BoardJSON { siteId: string; day: number; quests: CivilQuest[] }

const CLIENTS = ['상인 조합', '영주 서기', '수도원장', '포도원 주인', '길드 장인', '마을 촌장', '여관 주인', '궁정 사자', '학자', '과부 마르타'];

/** 거점 하나의 민사 게시판. 며칠마다 새 의뢰 3개로 갈아 끼운다. */
export class Board {
  constructor(public readonly siteId: string, public day: number, public quests: CivilQuest[]) {}

  static generate(world: World, site: Site, day: number, seed: number, blocked: ReadonlySet<string>): Board {
    const rng = new Rng(seed ^ hash(site.id) ^ (day * 104729));
    const towns = world.towns().filter(t => t.id !== site.id && !blocked.has(t.region));
    const quests: CivilQuest[] = [];
    const n = Math.min(BALANCE.boardSlots, towns.length);
    for (let i = 0; i < n; i++) {
      // 가까운 곳 2 : 먼 곳 1 정도. 거리 가중 무작위
      const pool = towns.filter(t => !quests.some(q => q.to === t.id));
      const scored = pool.map(t => ({ t, len: world.path(site.id, t.id, blocked)?.length ?? Infinity })).filter(x => isFinite(x.len));
      if (!scored.length) break;
      scored.sort((a, b) => a.len - b.len);
      const far = i === n - 1;
      const slice = far ? scored.slice(Math.floor(scored.length / 2)) : scored.slice(0, Math.max(3, Math.ceil(scored.length / 3)));
      const pick = rng.pick(slice);
      const job: CivilJob = rng.pick(['letter', 'letter', 'parcel', 'parcel', 'papers', 'escort']);
      const travelDays = Math.max(1, Math.ceil(pick.len / BALANCE.marchSpeed));
      const reward = Math.round((BALANCE.civilBaseReward + BALANCE.civilRewardPerUnit * pick.len) * JOB_FACTOR[job] * (0.85 + rng.next() * 0.3) / 10) * 10;
      quests.push({
        id: site.id + ':' + day + ':' + i, job, from: site.id, to: pick.t.id,
        deadline: day + travelDays + BALANCE.civilDeadlineSlack + (job === 'escort' ? 2 : 0),
        client: rng.pick(CLIENTS), reward, travelDays,
      });
    }
    return new Board(site.id, day, quests);
  }
  get stale(): (day: number) => boolean { return day => day - this.day >= BALANCE.boardRefreshDays; }
  remove(id: string): void { this.quests = this.quests.filter(q => q.id !== id); }
  toJSON(): BoardJSON { return { siteId: this.siteId, day: this.day, quests: this.quests.map(q => ({ ...q })) }; }
  static fromJSON(j: BoardJSON): Board { return new Board(j.siteId, j.day, j.quests.map(q => ({ ...q }))); }
}
