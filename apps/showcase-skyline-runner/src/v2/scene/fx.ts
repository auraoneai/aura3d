// apps/showcase-skyline-runner/src/v2/scene/fx.ts — real fx.burst accents for the
// kit's gameplay events, mapped to the direction's vfx table.
import type { Game } from "@aura3d/game";

type ScenePoint = readonly [number, number, number];

export function wireSkylineFx(game: Game) {
  const at = (p: ScenePoint) => [p[0], p[1], p[2]] as [number, number, number];
  return {
    landingPuff(pos: ScenePoint) {
      game.fx.burst("dust", at(pos), { count: 10, speed: 0.7, color: "#dbe9f4" });
    },
    jumpKick(pos: ScenePoint) {
      game.fx.burst("dust", at(pos), { count: 6, speed: 0.9, color: "#bfe4f4" });
    },
    dashStreak(pos: ScenePoint) {
      game.fx.burst("streak", at(pos), { count: 8, speed: 1.6, color: "#c7b8ff" });
    },
    pickupSparkle(pos: ScenePoint) {
      game.fx.burst("pickup", at(pos), { count: 12, speed: 1.1, color: "#ffd66b" });
    },
    emberVolley(pos: ScenePoint) {
      game.fx.burst("spark", at(pos), { count: 9, speed: 1.8, color: "#ffb454" });
    },
    checkpointChime(pos: ScenePoint) {
      game.fx.burst("ring", at(pos), { count: 14, speed: 1.0, color: "#62f8e7" });
    },
    hazardHit(pos: ScenePoint) {
      game.fx.burst("debris", at(pos), { count: 12, speed: 1.4, color: "#ff5f77" });
    },
    respawnBlink(pos: ScenePoint) {
      game.fx.burst("spark", at(pos), { count: 16, speed: 0.8, color: "#67e8f9" });
    },
    summitFlare(pos: ScenePoint) {
      game.fx.burst("explosion-small", at(pos), { count: 26, speed: 1.9, color: "#64e8c4" });
      game.fx.burst("ring", at(pos), { count: 18, speed: 1.4, color: "#fff1a8" });
    }
  };
}

export type SkylineFx = ReturnType<typeof wireSkylineFx>;
