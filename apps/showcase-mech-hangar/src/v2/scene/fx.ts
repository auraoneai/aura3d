// apps/showcase-mech-hangar/src/v2/scene/fx.ts — bout event accents mapped to the
// direction's vfx table: amber hit sparks, cyan guard rings, dust on land/KO,
// a bigger ignition flare on special fire.
import type { GameFxKind, GameFxLayer } from "@aura3d/engine/contracts";

type ScenePoint = readonly [number, number, number];

export function wireMechFx(fx: GameFxLayer) {
  return {
    lightHit(position: ScenePoint) {
      fx.burst("spark", position, { count: 10, speed: 2.6, color: "#ffd27a" });
    },
    heavyHit(position: ScenePoint) {
      fx.burst("spark", position, { count: 18, speed: 3.6, color: "#ffb454" });
      fx.burst("ring", position, { count: 1, speed: 0.4, color: "#ffd27a" });
    },
    blocked(position: ScenePoint) {
      fx.burst("ring", position, { count: 1, speed: 0.5, color: "#62f8e7" });
    },
    guardBreak(position: ScenePoint) {
      fx.burst("debris", position, { count: 14, speed: 2.8, color: "#62f8e7" });
      fx.burst("ring", position, { count: 1, speed: 0.7, color: "#9ffff2" });
    },
    specialFire(position: ScenePoint) {
      fx.burst("muzzle", position, { count: 1, speed: 0, color: "#ffb454" });
      fx.burst("streak", position, { count: 8, speed: 5.4, color: "#ffd27a" });
    },
    jump(position: ScenePoint) {
      fx.burst("dust", position, { count: 6, speed: 1.4, color: "#8b93a1" });
    },
    land(position: ScenePoint) {
      fx.burst("dust", position, { count: 10, speed: 2.0, color: "#8b93a1" });
    },
    ko(position: ScenePoint) {
      fx.burst("explosion-small", position, { count: 1, speed: 0, color: "#ffb454" });
      fx.burst("debris", position, { count: 22, speed: 3.2, color: "#ff7a45" });
      fx.burst("ring", position, { count: 1, speed: 0.9, color: "#ffb454" });
    }
  };
}

export type MechFx = ReturnType<typeof wireMechFx>;
