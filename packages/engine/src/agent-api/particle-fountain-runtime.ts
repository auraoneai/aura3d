import { sceneKits as rootSceneKits } from "./index.js";
import type {
  AuraApp,
  AuraAppTarget,
  AuraColor,
  AuraCreateAppOptions,
  AuraSceneBuilder,
  AuraSceneKit
} from "./index.js";

export {
  createAuraApp,
  ui
} from "./index.js";

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
