import { Game, type GameJSON } from '../core/game';
import type { World } from '../core/world';

const KEY = 'mercenary.save.v1';

export function saveGame(g: Game): boolean {
  if (g.battle) return false;
  try { localStorage.setItem(KEY, JSON.stringify(g.toJSON())); return true; } catch { return false; }
}
export function loadGame(world: World): Game | null {
  try {
    const s = localStorage.getItem(KEY); if (!s) return null;
    const j = JSON.parse(s) as GameJSON; if (j.version !== 3) return null;
    const g = Game.fromJSON(world, j);
    // 집행관 대화 중에 저장된 것은 멈춘 채로 돌아오므로 다시 흐르게 한다
    if (g.clock.speed === 0 && !g.ending) g.clock.speed = 1;
    return g;
  } catch { return null; }
}
export function hasSave(): boolean { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
