// APPLIED BY LANE 15 (T6.11 arch-gate): moved from app/ — nodes/game legally reaches it here.
// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraGameRuntimeOptions, AuraGameRuntime } from "../types.js";
import { DEFAULT_MAX_SUBSTEPS } from "./frameLoopDefaults.js";
import { camera } from "../camera.js";
import { createAuraGameRules } from "../../gameRules.js";
import { createCombatWorld, createGameCameraDirector, createGameEffects, createGameInput } from "../../GameRuntime.js";
import { effects } from "../effects.composite.js";

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
