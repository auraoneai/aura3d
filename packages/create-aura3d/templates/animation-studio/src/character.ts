// Typed character definition for Animation Studio. Pure data + types (no engine import) so the
// profile pipeline (plan/profile/package/verify) runs in plain Node.

export type LocomotionAction = "idle" | "walk" | "run";

export interface AnimationStudioIkChain {
  readonly id: string;
  readonly root: string;
  readonly mid: string;
  readonly tip: string;
}

export interface AnimationStudioCharacter {
  readonly id: string;
  readonly name: string;
  /** Typed asset key resolved from aura.assets.json (never a raw URL). */
  readonly assetKey: string;
  /** Locomotion clip map: action -> embedded GLB clip name. */
  readonly clipMap: Readonly<Record<LocomotionAction, string>>;
  /** Speeds (units/sec) at which walk and run clips reach full weight. */
  readonly walkSpeed: number;
  readonly runSpeed: number;
  /** Two-bone IK chains the studio can solve (feet/hands). */
  readonly ikChains: readonly AnimationStudioIkChain[];
}

export const requiredLocomotionActions: readonly LocomotionAction[] = ["idle", "walk", "run"];

export const heroCharacter: AnimationStudioCharacter = {
  id: "hero",
  name: "Hero",
  assetKey: "hero",
  clipMap: { idle: "Idle", walk: "Walk", run: "Run" },
  walkSpeed: 1.6,
  runSpeed: 4.4,
  ikChains: [
    { id: "left-leg", root: "LeftUpLeg", mid: "LeftLeg", tip: "LeftFoot" },
    { id: "right-leg", root: "RightUpLeg", mid: "RightLeg", tip: "RightFoot" }
  ]
};
