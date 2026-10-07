import { sceneKits as rootSceneKits } from "./nodes/sceneKits.js";
import type { AuraSceneBuilder } from "./nodes/scene.js";
import type { AuraApp, AuraAppTarget, AuraColor, AuraCreateAppOptions, AuraSceneKit } from "./nodes/types.js";

export {
  createAuraApp
} from "./app/createAuraApp.js";
export {
  ui
} from "./nodes/ui.js";

export type {
  AuraApp,
  AuraAppTarget,
  AuraColor,
  AuraCreateAppOptions
};

export interface ParticleFountainOptions {
  readonly particleCount?: number;
  readonly emissionRate?: number;
  readonly color?: AuraColor;
  readonly colors?: readonly AuraColor[];
}

export type ParticleFountainScene = AuraSceneBuilder;
export type ParticleFountainSceneKit = AuraSceneKit;

export const sceneKits = {
  particleFountain(options: ParticleFountainOptions = {}): ParticleFountainSceneKit {
    return particleFountain(options);
  }
} as const;

export function particleFountain(options: ParticleFountainOptions = {}): ParticleFountainSceneKit {
  return rootSceneKits.particleFountain({
    particleCount: options.particleCount,
    emissionRate: options.emissionRate,
    colors: options.colors ?? (options.color ? [options.color] : undefined)
  });
}
