// PR 0 follow-up: gameRules/createAuraGameRules moved out of the agent-api barrel.
// nodes/game/index.ts reads `gameRules` at module-eval time, and the barrel imports
// nodes/game/index.js before this point in the file — under native ESM that read hit
// the TDZ zone of the in-barrel `export const gameRules` and crashed any consumer
// whose module graph enters the barrel (Package Tests / editor-runtime). A leaf
// module breaks the cycle: both the barrel and the carve-out import from here.
import type { AuraGameRules } from "./index.js";
import { createGameFighting2DRules } from "./GameRuntime.js";

export function createAuraGameRules(options: Partial<Omit<AuraGameRules, "kind">> = {}): AuraGameRules {
  return {
    kind: "aura-game-rules",
    gravity: options.gravity ?? 24,
    roundSeconds: options.roundSeconds ?? 90,
    maxHealth: options.maxHealth ?? 100,
    maxGuard: options.maxGuard ?? 100,
    maxMeter: options.maxMeter ?? 100,
    stageBounds: options.stageBounds ?? {
      minX: -4.5,
      maxX: 4.5
    }
  };
}

export const gameRules = Object.assign(createAuraGameRules, {
  fighting2D: createGameFighting2DRules
});
