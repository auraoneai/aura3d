// Pure Animation Studio profile pipeline: builds the exportable animation-profile.json structure
// and validates character readiness. No engine/browser import — runs in plain Node so
// `anim:plan/profile/package/verify` work without a renderer.

import {
  requiredLocomotionActions,
  type AnimationStudioCharacter,
  type LocomotionAction
} from "./character.js";

export interface AnimationStudioReadiness {
  readonly ok: boolean;
  readonly characterId: string;
  readonly requiredActions: readonly LocomotionAction[];
  readonly missingActions: readonly LocomotionAction[];
  readonly errors: readonly string[];
}

export interface AnimationStudioStateGraphDescriptor {
  readonly states: readonly string[];
  readonly parameters: readonly string[];
  readonly transitions: ReadonlyArray<{ readonly from: string; readonly to: string; readonly when: string }>;
}

export interface AnimationStudioBlendTreeDescriptor {
  readonly parameter: "speed";
  readonly children: ReadonlyArray<{ readonly clip: string; readonly threshold: number }>;
}

export interface AnimationProfile {
  readonly schema: "aura-animation-profile/v1";
  readonly characterId: string;
  readonly characterName: string;
  readonly assetKey: string;
  readonly clipMap: Readonly<Record<LocomotionAction, string>>;
  readonly stateGraph: AnimationStudioStateGraphDescriptor;
  readonly blendTree: AnimationStudioBlendTreeDescriptor;
  readonly ikChains: AnimationStudioCharacter["ikChains"];
  readonly rootMotion: { readonly suppressed: boolean; readonly note: string };
}

export function validateAnimationStudioCharacter(character: AnimationStudioCharacter): AnimationStudioReadiness {
  const errors: string[] = [];
  const missingActions: LocomotionAction[] = [];
  for (const action of requiredLocomotionActions) {
    const clip = character.clipMap[action];
    if (!clip || clip.trim().length === 0) {
      missingActions.push(action);
      errors.push(`Required locomotion action "${action}" has no clip mapped.`);
    }
  }
  if (!character.assetKey || character.assetKey.trim().length === 0) {
    errors.push("Character must reference a typed assetKey, not a raw URL.");
  }
  if (!(character.runSpeed > character.walkSpeed)) {
    errors.push(`runSpeed (${character.runSpeed}) must be greater than walkSpeed (${character.walkSpeed}).`);
  }
  return {
    ok: errors.length === 0,
    characterId: character.id,
    requiredActions: requiredLocomotionActions,
    missingActions,
    errors
  };
}

export function createAnimationProfile(character: AnimationStudioCharacter): AnimationProfile {
  return {
    schema: "aura-animation-profile/v1",
    characterId: character.id,
    characterName: character.name,
    assetKey: character.assetKey,
    clipMap: character.clipMap,
    stateGraph: {
      states: ["idle", "walk", "run"],
      parameters: ["isMoving", "isRunning"],
      transitions: [
        { from: "idle", to: "walk", when: "isMoving" },
        { from: "idle", to: "run", when: "isRunning" },
        { from: "walk", to: "run", when: "isRunning" },
        { from: "walk", to: "idle", when: "!isMoving" },
        { from: "run", to: "walk", when: "!isRunning" },
        { from: "run", to: "idle", when: "!isMoving" }
      ]
    },
    blendTree: {
      parameter: "speed",
      children: [
        { clip: character.clipMap.idle, threshold: 0 },
        { clip: character.clipMap.walk, threshold: character.walkSpeed },
        { clip: character.clipMap.run, threshold: character.runSpeed }
      ]
    },
    ikChains: character.ikChains,
    rootMotion: { suppressed: true, note: "Locomotion uses controller velocity; in-place clips with root motion suppressed." }
  };
}
