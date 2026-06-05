import type { AuraClashAnimationName } from "../game";

export interface AuraClashAnimationMapEntry {
  animation: AuraClashAnimationName;
  clip: string;
  fallbackPose: string;
  eventTags: string[];
}

export const auraClashAnimationMap: readonly AuraClashAnimationMapEntry[] = [
  { animation: "idle", clip: "Idle", fallbackPose: "neutral breathing stance", eventTags: [] },
  { animation: "walkForward", clip: "Walk", fallbackPose: "forward lean stride", eventTags: ["movement"] },
  { animation: "walkBack", clip: "WalkBack", fallbackPose: "guarded reverse step", eventTags: ["movement"] },
  { animation: "jump", clip: "Jump", fallbackPose: "knees up aerial pose", eventTags: ["airborne"] },
  { animation: "land", clip: "Land", fallbackPose: "impact crouch", eventTags: ["landing"] },
  { animation: "dash", clip: "Dash", fallbackPose: "speed-line lean", eventTags: ["movement", "effect:dash-dust"] },
  { animation: "guard", clip: "Guard", fallbackPose: "arms raised block", eventTags: ["defense"] },
  { animation: "light", clip: "LightPunch", fallbackPose: "fast jab", eventTags: ["attack:light", "hitbox:start"] },
  { animation: "heavy", clip: "HeavyStrike", fallbackPose: "wide wind-up", eventTags: ["attack:heavy", "hitbox:start"] },
  { animation: "special", clip: "Special", fallbackPose: "aura burst", eventTags: ["attack:special", "effect:aura-burst"] },
  { animation: "hit", clip: "HitReact", fallbackPose: "torso recoil", eventTags: ["reaction"] },
  { animation: "stun", clip: "Stun", fallbackPose: "stagger hold", eventTags: ["reaction", "hitstop"] },
  { animation: "knockdown", clip: "Knockdown", fallbackPose: "floor impact", eventTags: ["reaction", "grounded"] },
  { animation: "victory", clip: "Victory", fallbackPose: "win pose", eventTags: ["round:win"] },
  { animation: "defeat", clip: "Defeat", fallbackPose: "loss pose", eventTags: ["round:lose"] },
];

