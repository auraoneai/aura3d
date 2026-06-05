import type { FighterAnimationState } from "./FighterAnimationMap";

export interface FallbackPose {
  state: FighterAnimationState;
  label: string;
  rootTiltDeg: number;
  armPose: "neutral" | "guard" | "strike" | "cast" | "fall";
  legPose: "planted" | "step" | "dash" | "jump" | "knockdown";
}

export const fallbackPoses: FallbackPose[] = [
  { state: "idle", label: "Neutral idle", rootTiltDeg: 0, armPose: "neutral", legPose: "planted" },
  { state: "walk", label: "Readable step", rootTiltDeg: 2, armPose: "neutral", legPose: "step" },
  { state: "dash", label: "Dash lean", rootTiltDeg: 8, armPose: "neutral", legPose: "dash" },
  { state: "jump", label: "Jump tuck", rootTiltDeg: -4, armPose: "neutral", legPose: "jump" },
  { state: "light", label: "Fast strike", rootTiltDeg: 5, armPose: "strike", legPose: "planted" },
  { state: "heavy", label: "Heavy strike", rootTiltDeg: 10, armPose: "strike", legPose: "step" },
  { state: "special", label: "Aura cast", rootTiltDeg: 0, armPose: "cast", legPose: "planted" },
  { state: "guard", label: "Guard block", rootTiltDeg: -2, armPose: "guard", legPose: "planted" },
  { state: "hitstun", label: "Hit reaction", rootTiltDeg: -9, armPose: "neutral", legPose: "step" },
  { state: "victory", label: "Victory pose", rootTiltDeg: 0, armPose: "cast", legPose: "planted" },
  { state: "defeat", label: "Knockdown fallback", rootTiltDeg: -18, armPose: "fall", legPose: "knockdown" },
];

export function getFallbackPose(state: FighterAnimationState): FallbackPose {
  return fallbackPoses.find((pose) => pose.state === state) ?? fallbackPoses[0]!;
}
