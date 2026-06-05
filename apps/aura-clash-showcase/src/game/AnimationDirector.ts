import type { AuraClashAnimationName } from "./types";

export interface AnimationSyncPlan {
  playerClip: AuraClashAnimationName;
  opponentClip: AuraClashAnimationName;
  playerSpeed: number;
  opponentSpeed: number;
  eventTags: string[];
}

export function createAnimationSyncPlan(playerClip: AuraClashAnimationName, opponentClip: AuraClashAnimationName): AnimationSyncPlan {
  return {
    playerClip,
    opponentClip,
    playerSpeed: speedFor(playerClip),
    opponentSpeed: speedFor(opponentClip),
    eventTags: [eventTagFor(playerClip), eventTagFor(opponentClip)].filter(Boolean),
  };
}

function speedFor(clip: AuraClashAnimationName): number {
  if (clip === "light" || clip === "heavy") return 1.25;
  if (clip === "special") return 1.45;
  if (clip === "hit" || clip === "stun") return 0.92;
  if (clip === "dash") return 1.5;
  if (clip === "crouch") return 0.85;
  return 1;
}

function eventTagFor(clip: AuraClashAnimationName): string {
  if (clip === "light" || clip === "heavy" || clip === "special") return `attack:${clip}`;
  if (clip === "crouch" || clip === "guard") return `defense:${clip}`;
  if (clip === "hit" || clip === "stun" || clip === "knockdown") return `reaction:${clip}`;
  return "";
}
