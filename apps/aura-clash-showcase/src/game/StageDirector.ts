import { neonDowntownFightFloorBounds } from "../arenas/FightFloorBounds";

export interface StageDirectorPlan {
  id: "neon-downtown-rooftop";
  foreground: string[];
  combatLane: string;
  midground: string[];
  background: string[];
  cameraSafeZone: { minX: number; maxX: number };
  nonBlockingRules: string[];
}

export function createStageDirectorPlan(): StageDirectorPlan {
  return {
    id: "neon-downtown-rooftop",
    foreground: ["transparent guard rail", "subtle floor bloom", "low skyline haze"],
    combatLane: "flat rooftop fighting lane with no blocking geometry",
    midground: ["animated billboard", "holographic crowd strip", "service boxes below fighter silhouettes"],
    background: ["downtown towers", "neon windows", "parallax skyline"],
    cameraSafeZone: {
      minX: neonDowntownFightFloorBounds.cameraSafeMinX,
      maxX: neonDowntownFightFloorBounds.cameraSafeMaxX,
    },
    nonBlockingRules: [
      "fighters always render in front of skyline",
      "HUD has no overlap with fighter heads at 1440x1200",
      "combat lane stays clear for jumps and knockback",
    ],
  };
}

