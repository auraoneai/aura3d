export type FighterAnimationState =
  | "idle"
  | "walk"
  | "dash"
  | "jump"
  | "light"
  | "heavy"
  | "special"
  | "guard"
  | "hitstun"
  | "victory"
  | "defeat";

export interface FighterAnimationClipMap {
  state: FighterAnimationState;
  preferredClips: string[];
  loop: boolean;
  blendMs: number;
  fallbackState?: FighterAnimationState;
}

export const fighterAnimationClipMap: FighterAnimationClipMap[] = [
  {
    state: "idle",
    preferredClips: ["Idle", "Standing Idle", "Breathing Idle"],
    loop: true,
    blendMs: 140,
  },
  {
    state: "walk",
    preferredClips: ["Walk", "Walking", "Locomotion Walk"],
    loop: true,
    blendMs: 120,
    fallbackState: "idle",
  },
  {
    state: "dash",
    preferredClips: ["Run", "Dash", "Sprint"],
    loop: false,
    blendMs: 80,
    fallbackState: "walk",
  },
  {
    state: "jump",
    preferredClips: ["Jump", "Jump Up", "Falling"],
    loop: false,
    blendMs: 90,
    fallbackState: "idle",
  },
  {
    state: "light",
    preferredClips: ["Punch", "Jab", "Attack 1"],
    loop: false,
    blendMs: 55,
    fallbackState: "idle",
  },
  {
    state: "heavy",
    preferredClips: ["Heavy Punch", "Kick", "Attack 2"],
    loop: false,
    blendMs: 70,
    fallbackState: "light",
  },
  {
    state: "special",
    preferredClips: ["Cast", "Magic Attack", "Attack 3"],
    loop: false,
    blendMs: 90,
    fallbackState: "heavy",
  },
  {
    state: "guard",
    preferredClips: ["Block", "Guard", "Defend"],
    loop: true,
    blendMs: 90,
    fallbackState: "idle",
  },
  {
    state: "hitstun",
    preferredClips: ["Hit Reaction", "Damage", "Knockback"],
    loop: false,
    blendMs: 45,
    fallbackState: "idle",
  },
  {
    state: "victory",
    preferredClips: ["Victory", "Cheer", "Celebrate"],
    loop: true,
    blendMs: 150,
    fallbackState: "idle",
  },
  {
    state: "defeat",
    preferredClips: ["Defeat", "Death", "Knockdown"],
    loop: false,
    blendMs: 120,
    fallbackState: "hitstun",
  },
];

export function getAnimationClipMap(state: FighterAnimationState): FighterAnimationClipMap {
  return fighterAnimationClipMap.find((clip) => clip.state === state) ?? fighterAnimationClipMap[0]!;
}
