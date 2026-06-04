import type { AuraVec3 } from "./AuraSceneIR.js";

export type AuraCinematicBlockingAction = "look-at" | "reach-toward" | "turn-to-prop" | "pause-on-discovery";

export interface AuraCinematicBlockingTarget {
  readonly id: string;
  readonly role: "hero" | "prop" | "camera" | "practical" | "environment";
  readonly position: AuraVec3;
}

export interface AuraCinematicBlockingPlan {
  readonly id: string;
  readonly targets: readonly AuraCinematicBlockingTarget[];
  readonly actions: readonly {
    readonly id: string;
    readonly actorId: string;
    readonly targetId: string;
    readonly action: AuraCinematicBlockingAction;
    readonly atSeconds: number;
  }[];
  readonly diagnostics: readonly string[];
}

export function createNorthStarCinematicBlockingPlan(): AuraCinematicBlockingPlan {
  return {
    id: "blocking_rainy_neon_alley",
    targets: [
      { id: "robot-expressive", role: "hero", position: [-0.42, 0, 0.1] },
      { id: "glowing-flower", role: "prop", position: [0.82, 0.18, 0.72] },
      { id: "camera_main", role: "camera", position: [0, 1.25, 4.2] },
      { id: "neon-practical-light", role: "practical", position: [1.8, 1.4, -0.4] }
    ],
    actions: [
      { id: "look_at_flower", actorId: "robot-expressive", targetId: "glowing-flower", action: "look-at", atSeconds: 4 },
      { id: "reach_toward_flower", actorId: "robot-expressive", targetId: "glowing-flower", action: "reach-toward", atSeconds: 7 },
      { id: "pause_on_discovery", actorId: "robot-expressive", targetId: "glowing-flower", action: "pause-on-discovery", atSeconds: 10 }
    ],
    diagnostics: ["North-star blocking places robot, flower, camera, and practical lights in coherent scene space."]
  };
}
