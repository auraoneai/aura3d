import type { CombatAction, FighterRuntimeState } from "../state/GameTypes";
import { clampFighterStats, setFighterAction } from "../state/FighterState";

export interface FighterControllerInput {
  move: -1 | 0 | 1;
  jump: boolean;
  dash: boolean;
  guard: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
}

export interface FighterControllerTuning {
  walkSpeed: number;
  dashSpeed: number;
  jumpVelocity: number;
  jumpHorizontalSpeed: number;
  gravity: number;
  laneMinX: number;
  laneMaxX: number;
  auraGainOnAction: number;
}

export const defaultFighterControllerTuning: FighterControllerTuning = {
  walkSpeed: 0.0055,
  dashSpeed: 0.018,
  jumpVelocity: 0.028,
  jumpHorizontalSpeed: 0.012,
  gravity: 0.0025,
  laneMinX: -3.2,
  laneMaxX: 3.2,
  auraGainOnAction: 4,
};

export function updateFighterController(
  fighter: FighterRuntimeState,
  input: FighterControllerInput,
  deltaMs: number,
  nowMs: number,
  tuning: FighterControllerTuning = defaultFighterControllerTuning,
): FighterRuntimeState {
  if (nowMs < fighter.actionLockedUntilMs && fighter.action !== "guard") {
    return applyMovement(fighter, deltaMs, tuning);
  }

  let next = fighter;
  let action: CombatAction = input.guard ? "guard" : "idle";
  let lockMs = 0;

  if (input.special && fighter.stats.aura >= 50) {
    action = "special";
    lockMs = 650;
    next = {
      ...next,
      stats: {
        ...next.stats,
        aura: next.stats.aura - 50,
      },
    };
  } else if (input.heavy) {
    action = "heavy";
    lockMs = 310;
  } else if (input.light) {
    action = "light";
    lockMs = 180;
  } else if (input.dash) {
    action = "dash";
    lockMs = 220;
    next = {
      ...next,
      velocity: {
        ...next.velocity,
        x: fighter.facing * tuning.dashSpeed,
      },
    };
  } else if (input.jump && fighter.position.y <= 0) {
    action = "jump";
    lockMs = 340;
    // Directional jump: A/D + W carries horizontal momentum and turns the fighter
    // to face the leap, instead of a purely vertical hop.
    const jumpFacing = input.move !== 0 ? (input.move > 0 ? 1 : -1) : fighter.facing;
    next = {
      ...next,
      facing: jumpFacing,
      velocity: {
        ...next.velocity,
        x: input.move !== 0 ? input.move * tuning.jumpHorizontalSpeed : next.velocity.x,
        y: tuning.jumpVelocity,
      },
    };
  } else if (input.move !== 0) {
    action = "move";
    next = {
      ...next,
      facing: input.move > 0 ? 1 : -1,
      velocity: {
        ...next.velocity,
        x: input.move * tuning.walkSpeed,
      },
    };
  } else {
    next = {
      ...next,
      velocity: {
        ...next.velocity,
        x: 0,
      },
    };
  }

  if (action === "light" || action === "heavy" || action === "dash") {
    next = {
      ...next,
      stats: {
        ...next.stats,
        aura: next.stats.aura + tuning.auraGainOnAction,
      },
    };
  }

  return clampFighterStats(applyMovement(setFighterAction(next, action, nowMs, lockMs), deltaMs, tuning));
}

function applyMovement(
  fighter: FighterRuntimeState,
  deltaMs: number,
  tuning: FighterControllerTuning,
): FighterRuntimeState {
  const nextY = Math.max(0, fighter.position.y + fighter.velocity.y * deltaMs);
  const landed = nextY <= 0;
  const nextX = Math.max(tuning.laneMinX, Math.min(tuning.laneMaxX, fighter.position.x + fighter.velocity.x * deltaMs));

  return {
    ...fighter,
    position: {
      x: nextX,
      y: nextY,
    },
    velocity: {
      x: fighter.velocity.x * 0.88,
      y: landed ? 0 : fighter.velocity.y - tuning.gravity * deltaMs,
    },
  };
}
