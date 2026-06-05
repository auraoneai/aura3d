import type { CombatAction, FighterRuntimeState, FighterSide, Vec2 } from "./GameTypes";

export function createFighterRuntimeState(side: FighterSide, fighterId: string, position: Vec2, facing: -1 | 1): FighterRuntimeState {
  return {
    side,
    fighterId,
    position,
    velocity: { x: 0, y: 0 },
    facing,
    action: "idle",
    stats: {
      health: 100,
      guard: 100,
      aura: 0,
      combo: 0,
    },
    invulnerableUntilMs: 0,
    actionLockedUntilMs: 0,
  };
}

export function clampFighterStats(state: FighterRuntimeState): FighterRuntimeState {
  return {
    ...state,
    stats: {
      health: Math.max(0, Math.min(100, state.stats.health)),
      guard: Math.max(0, Math.min(100, state.stats.guard)),
      aura: Math.max(0, Math.min(100, state.stats.aura)),
      combo: Math.max(0, state.stats.combo),
    },
  };
}

export function setFighterAction(state: FighterRuntimeState, action: CombatAction, atMs: number, lockMs = 0): FighterRuntimeState {
  return {
    ...state,
    action,
    actionLockedUntilMs: Math.max(state.actionLockedUntilMs, atMs + lockMs),
  };
}
