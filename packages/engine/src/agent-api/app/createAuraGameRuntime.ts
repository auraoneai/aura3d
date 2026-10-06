// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraGameRuntimeOptions, AuraGameRuntime } from "../nodes/types.js";
import { DEFAULT_MAX_SUBSTEPS } from "./frameLoopDefaults.js";
import { camera } from "../nodes/camera.js";
import { createAuraGameRules } from "../gameRules.js";
import { createCombatWorld, createGameCameraDirector, createGameEffects, createGameInput } from "../GameRuntime";
import { effects } from "../nodes/effects.composite.js";
import { game } from "../nodes/game/index.js";

export function createAuraGameRuntime(options: AuraGameRuntimeOptions = {}): AuraGameRuntime {
  return {
    kind: "aura-game-runtime",
    loop: {
      kind: "aura-game-loop-plan",
      fixedDt: options.loop?.fixedDt ?? 1 / 60,
      maxSubSteps: options.loop?.maxSubSteps ?? DEFAULT_MAX_SUBSTEPS,
      timeScale: options.loop?.timeScale ?? 1
    },
    rules: createAuraGameRules(options.rules),
    input: options.input ? createGameInput(options.input) : undefined,
    combat: createCombatWorld(),
    camera: createGameCameraDirector({
      stageBounds: {
        minX: options.rules?.stageBounds?.minX ?? -4.5,
        maxX: options.rules?.stageBounds?.maxX ?? 4.5
      }
    }),
    effects: createGameEffects({ poolSize: options.effectPoolSize }),
    bodies: []
  };
}
