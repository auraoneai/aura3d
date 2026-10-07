import { character as rootCharacter } from "./nodes/character.js";
import { sceneKits as rootSceneKits } from "./nodes/sceneKits.js";
import type { AuraSceneBuilder } from "./nodes/scene.js";
import type {
  AuraApp,
  AuraAppTarget,
  AuraCreateAppOptions,
  AuraSceneKit
} from "./nodes/types.js";
import { lazyNamespace } from "./lazyNamespace.js";


export {
  createAuraApp
} from "./app/createAuraApp.js";

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

export const character = lazyNamespace(() => rootCharacter);

export const sceneKits = {
  humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
    return humanoidWalk(options);
  }
} as const;

export function humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
  return rootSceneKits.humanoidWalk(options);
}
