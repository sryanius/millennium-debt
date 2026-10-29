import { BALANCE } from './balance';
import { Rng } from './rng';
import { hash } from './market';
import type { World, Site } from './world';

/** 군사 게시판 의뢰(원작: 작전내용·의뢰인·보수, 기한 없음). 2단계는 토벌만. */
export interface MilitaryQuest {
  id: string; kind: 'subjugate';
  from: string;
  /** 도적단이 있는 거점 */
  target: string;
  tier: number; reward: number; client: string; text: string;
}
export interface MilitaryBoardJSON { siteId: string; day: number; quests: MilitaryQuest[] }

/** 지도 위의 적 무리. 의뢰 토벌 대상이거나 떠돌이. */
export interface EnemyBand {
  id: string; name: string; site: string; tier: number; questId: string | null;
  /** bandit 토벌 대상 · rebel 잿빛 교단 전투단(요새를 친다) · roam 떠돌이 */
  kind: 'bandit' | 'rebel' | 'roam';
  path?: string[]; target?: string; nextMove?: number;
}

const CLIENTS = ['영주', '수비대장', '상인 조합', '순례자 보호회', '길드 연합'];

export class MilitaryBoard {
  constructor(public readonly siteId: string, public day: number, public quests: MilitaryQuest[]) {}
  static generate(world: World, site: Site, day: number, seed: number, blocked: ReadonlySet<string>, taken: ReadonlySet<string>): MilitaryBoard {
    const rng = new Rng(seed ^ hash('mil' + site.id) ^ (day * 7907));
    // 같은 지역의 성이 아닌 거점 중, 이 성에서 두 간선 안에 있는 곳
    const near = new Set<string>();
    for (const a of site.adjacent) { near.add(a); for (const b of world.site(a).adjacent) near.add(b); }
    near.delete(site.id);
    const targets = [...near].map(id => world.site(id)).filter(s => s.kind !== 'castle' && !blocked.has(s.region) && !taken.has(s.id));
    const n = Math.min(site.size >= 5 ? 2 : 1, targets.length);
    const quests: MilitaryQuest[] = [];
    for (let i = 0; i < n; i++) {
      const pool = targets.filter(t => !quests.some(q => q.target === t.id)); if (!pool.length) break;
      const t = rng.pick(pool);
      const tier = Math.min(3, 1 + (rng.next() < 0.3 ? 1 : 0) + (site.size >= 5 && rng.next() < 0.4 ? 1 : 0));
      const reward = Math.round((BALANCE.militaryBaseReward + BALANCE.militaryRewardPerTier * (tier - 1)) * (0.9 + rng.next() * 0.3) / 100) * 100;
      quests.push({ id: 'M:' + site.id + ':' + day + ':' + i, kind: 'subjugate', from: site.id, target: t.id, tier, reward, client: rng.pick(CLIENTS), text: t.name + '의 도적단 토벌(' + ['소규모', '중규모', '대규모'][tier - 1] + ')' });
    }
    return new MilitaryBoard(site.id, day, quests);
  }
  stale(day: number): boolean { return day - this.day >= BALANCE.militaryRefreshDays; }
  remove(id: string): void { this.quests = this.quests.filter(q => q.id !== id); }
  toJSON(): MilitaryBoardJSON { return { siteId: this.siteId, day: this.day, quests: this.quests.map(q => ({ ...q })) }; }
  static fromJSON(j: MilitaryBoardJSON): MilitaryBoard { return new MilitaryBoard(j.siteId, j.day, j.quests.map(q => ({ ...q }))); }
}
