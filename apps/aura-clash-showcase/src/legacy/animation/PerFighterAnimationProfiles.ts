import type { FighterAnimationState } from "./FighterAnimationMap";

export interface FighterAnimationProfile {
  fighterId: string;
  idlePose: string;
  locomotionStyle: string;
  attackStyle: string;
  auraBurstPose: string;
  stateOverrides: Partial<Record<FighterAnimationState, string[]>>;
}

export const perFighterAnimationProfiles: FighterAnimationProfile[] = [
  {
    fighterId: "mara-volt",
    idlePose: "forward bounce with electric hands",
    locomotionStyle: "fast lean-in footwork",
    attackStyle: "short jabs into lightning palm",
    auraBurstPose: "two-hand voltage release",
    stateOverrides: {
      light: ["Jab", "Punch"],
      special: ["Magic Attack", "Cast"],
      victory: ["Cheer", "Victory"],
    },
  },
  {
    fighterId: "rook-atlas",
    idlePose: "heavy planted guard",
    locomotionStyle: "slow shoulder advance",
    attackStyle: "wide hook and body blow",
    auraBurstPose: "overhead atlas slam",
    stateOverrides: {
      heavy: ["Heavy Punch", "Attack 2"],
      guard: ["Block", "Defend"],
      defeat: ["Knockdown", "Defeat"],
    },
  },
  {
    fighterId: "nyx-vale",
    idlePose: "sideways counter stance",
    locomotionStyle: "quiet lateral glide",
    attackStyle: "feint into snap kick",
    auraBurstPose: "mirrored shadow split",
    stateOverrides: {
      dash: ["Dash", "Run"],
      light: ["Attack 1", "Jab"],
      hitstun: ["Hit Reaction", "Damage"],
    },
  },
  {
    fighterId: "kade-ember",
    idlePose: "classic raised guard",
    locomotionStyle: "clean arcade step",
    attackStyle: "boxer jab into anti-air arc",
    auraBurstPose: "flame uppercut line",
    stateOverrides: {
      heavy: ["Kick", "Heavy Punch"],
      special: ["Attack 3", "Magic Attack"],
    },
  },
  {
    fighterId: "sable-iron",
    idlePose: "compact shielded guard",
    locomotionStyle: "defensive micro steps",
    attackStyle: "counter palm and shield bash",
    auraBurstPose: "iron curtain barrier",
    stateOverrides: {
      guard: ["Guard", "Block"],
      victory: ["Victory", "Celebrate"],
    },
  },
  {
    fighterId: "jin-flux",
    idlePose: "asymmetric stance dancer",
    locomotionStyle: "ring-control sidestep",
    attackStyle: "long reach kick and spiral palm",
    auraBurstPose: "flux ring spiral",
    stateOverrides: {
      walk: ["Walk", "Locomotion Walk"],
      special: ["Cast", "Magic Attack"],
    },
  },
];

export function getFighterAnimationProfile(fighterId: string): FighterAnimationProfile {
  return perFighterAnimationProfiles.find((profile) => profile.fighterId === fighterId) ?? perFighterAnimationProfiles[0]!;
}
