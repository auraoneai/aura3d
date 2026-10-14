// apps/showcase-gallery-shift/src/v2/scene/fx.ts — direction vfx table:
// lift-sparkle on exhibit lifts, alarm-strobe on laser trips / the alarm run,
// a stung burst when the meter fills, and dust accents on footsteps.
import type { GameFxLayer } from "@aura3d/engine/contracts";

type ScenePoint = readonly [number, number, number];

export function wireGalleryFx(fx: GameFxLayer) {
  return {
    liftSparkle(position: ScenePoint) {
      fx.burst("spark", position, { count: 12, speed: 1.6, color: "#ffd05a" });
      fx.burst("pickup", position, { count: 6, speed: 1.2, color: "#62f8e7" });
    },
    alarmStrobe(position: ScenePoint) {
      fx.burst("muzzle", position, { count: 2, speed: 0, color: "#ff334d" });
      fx.burst("ring", position, { count: 1, speed: 0.8, color: "#ff334d" });
    },
    laserTrip(position: ScenePoint) {
      fx.burst("spark", position, { count: 10, speed: 2.2, color: "#ff3b4e" });
    },
    caughtPulse(position: ScenePoint) {
      fx.burst("explosion-small", position, { count: 1, speed: 0, color: "#ff477b" });
      fx.burst("debris", position, { count: 14, speed: 2.4, color: "#ff5e8e" });
    },
    floorClear(position: ScenePoint) {
      fx.burst("ring", position, { count: 1, speed: 0.6, color: "#3dfc9a" });
      fx.burst("spark", position, { count: 8, speed: 1.8, color: "#7ef8ff" });
    },
    footDust(position: ScenePoint) {
      fx.burst("dust", position, { count: 3, speed: 0.8, color: "#8b93a1" });
    }
  };
}
