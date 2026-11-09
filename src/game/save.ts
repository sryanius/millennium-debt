import { Game, type GameJSON } from '../core/game';
import type { World } from '../core/world';

const KEY = 'mercenary.save.v1';

/** 새 게임을 고른 뒤에는 저장하지 않는다(페이지가 닫힐 때 자동 저장이 옛 게임을 다시 써 넣던 문제) */
let resetting = false;
export function saveGame(g: Game): boolean {
  if (g.battle || resetting) return false;
  try { localStorage.setItem(KEY, JSON.stringify(g.toJSON())); return true; } catch { return false; }
}
export function loadGame(world: World): Game | null {
  try {
    const s = localStorage.getItem(KEY); if (!s) return null;
    const j = JSON.parse(s) as GameJSON; if (j.version !== 3) return null;
    const g = Game.fromJSON(world, j);
    // 집행관 대화 중에 저장된 것은 멈춘 채로 돌아오므로 다시 흐르게 한다
    if (g.clock.speed === 0 && !g.ending) g.clock.speed = 1;
    g.refireArrivals(); // 저장 때 열려 있던 도착 대화(합류·관문 …)를 다시 띄운다
    return g;
  } catch { return null; }
}
export function hasSave(): boolean { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
/** 저장을 지우고 새 게임으로 다시 연다 */
export function startNewGame(): void { resetting = true; clearSave(); location.reload(); }

// ───── 수동 저장 칸 3개(자동 저장과 따로). 불러오기 = 칸 내용을 자동 저장 자리에 넣고 다시 연다 ─────
export const SLOTS = 3;
const slotKey = (i: number) => 'mercenary.slot.' + i;
export interface SlotInfo { date: string; day: number; cash: number; debt: number; leader: string; savedAt: number }
export function slotInfo(i: number): SlotInfo | null {
  try {
    const s = localStorage.getItem(slotKey(i)); if (!s) return null;
    const j = JSON.parse(s) as GameJSON & { savedAt?: number }; if (j.version !== 3) return null;
    const c = j.clock; const sq = j.squads[j.selected] ?? j.squads[0];
    return { date: String(c.year).padStart(4, '0') + '/' + String(c.month).padStart(2, '0') + '/' + String(c.day).padStart(2, '0'), day: 0, cash: j.ledger.cash, debt: j.ledger.debt, leader: sq?.leader.name ?? '', savedAt: j.savedAt ?? 0 };
  } catch { return null; }
}
export function saveSlot(g: Game, i: number): boolean {
  if (g.battle) return false;
  try { localStorage.setItem(slotKey(i), JSON.stringify({ ...g.toJSON(), savedAt: Date.now() })); return true; } catch { return false; }
}
/** 칸을 자동 저장 자리에 복사하고 다시 연다(열리면 BootScene 이 자동 저장을 읽는다) */
export function loadSlot(i: number): boolean {
  try { const s = localStorage.getItem(slotKey(i)); if (!s) return false; resetting = true; localStorage.setItem(KEY, s); location.reload(); return true; } catch { return false; }
}
export function clearSlot(i: number): void { try { localStorage.removeItem(slotKey(i)); } catch { /* ignore */ } }
