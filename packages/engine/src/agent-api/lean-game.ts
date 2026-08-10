import {
  createAuraApp as createProductApp,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions
} from "./lean-product.js";
import {
  createLeanGameInput,
  createLeanPlatformer,
  type LeanGameInputController,
  type LeanGameInputOptions
} from "./LeanArcadeRuntime.js";

export * from "./lean-product.js";
export type * from "./LeanArcadeRuntime.js";

export interface AuraLeanGameApp extends AuraLeanApp {
  input(options: LeanGameInputOptions): LeanGameInputController;
}

/**
 * Creates the deterministic arcade entry. Physical simulation is intentionally
 * absent: add `@aura3d/physics-rapier` explicitly when a game claims rigid-body,
 * character-controller, or vehicle physics.
 */
export function createAuraApp(target: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanGameApp {
  const base = createProductApp(target, options);
  const inputs = new Set<LeanGameInputController>();
  const stopInputUpdates = base.onFrame((deltaSeconds) => {
    for (const input of inputs) input.update(deltaSeconds);
  });
  return {
    ...base,
    input(inputOptions) {
      const input = createLeanGameInput(inputOptions);
      inputs.add(input);
      return input;
    },
    dispose() {
      stopInputUpdates();
      for (const input of inputs) input.dispose();
      inputs.clear();
      base.dispose();
    }
  };
}

export const game = {
  input: createLeanGameInput,
  platformer: createLeanPlatformer,
  runtime: "lean-deterministic-arcade"
} as const;
