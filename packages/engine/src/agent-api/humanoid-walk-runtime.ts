import { character as rootCharacter, sceneKits as rootSceneKits } from "./index.js";
import type {
  AuraApp,
  AuraAppTarget,
  AuraCreateAppOptions,
  AuraSceneBuilder,
  AuraSceneKit
} from "./index.js";

export {
  createAuraApp
} from "./index.js";

export type {
  AuraApp,
  AuraAppTarget,
  AuraCreateAppOptions
};

export interface HumanoidWalkOptions {
  readonly animationState?: "idle" | "walk" | "run" | "wave" | "turn" | "pose" | "benchmark-pose" | string;
}

export type HumanoidWalkScene = AuraSceneBuilder;
export type HumanoidWalkSceneKit = AuraSceneKit;

export const character = rootCharacter;

export const sceneKits = {
  humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
    return humanoidWalk(options);
  }
} as const;

export function humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
  return rootSceneKits.humanoidWalk(options);
}
