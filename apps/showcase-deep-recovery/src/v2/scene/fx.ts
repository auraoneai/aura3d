// apps/showcase-deep-recovery/src/v2/scene/fx.ts — juice wiring (T2.5).
// §6.9.14 vfx table: thrust-bubbles/silt-kick/sonar-ping/breach-flicker/
// marine-snow. game.fx.burst covers the impulses; marine snow + silt drift
// stay as runtime-node animation (they read the same authored state).
import type { Game } from "@aura3d/engine";

export interface DeepFx {
  thrustBubbles(x: number, y: number, z: number): void;
  siltKick(x: number, y: number, z: number): void;
  sonarPing(x: number, y: number, z: number): void;
  breachStrobe(x: number, y: number, z: number): void;
  grappleLatch(x: number, y: number, z: number): void;
  crateBank(x: number, y: number, z: number): void;
  surfaceBreak(x: number, y: number, z: number): void;
}

export function wireDeepFx(game: Game): DeepFx {
  return {
    thrustBubbles(x, y, z) {
      game.fx.burst("bubble", [x, y + 0.4, z], { count: 6, speed: 0.8, color: "#9fd8e8" });
    },
    siltKick(x, y, z) {
      game.fx.burst("dust", [x, y + 0.3, z], { count: 10, speed: 1.8, color: "#5b7a82" });
      game.app.camera?.shake.add(0.16);
    },
    sonarPing(x, y, z) {
      game.fx.burst("ring", [x, y, z], { count: 10, speed: 2.6, color: "#59d7ff" });
    },
    breachStrobe(x, y, z) {
      game.fx.burst("spark", [x, y + 0.6, z], { count: 8, speed: 2.2, color: "#ef4444" });
      game.app.camera?.shake.add(0.3);
      game.session.hitStop(0.05);
    },
    grappleLatch(x, y, z) {
      game.fx.burst("pickup", [x, y + 0.3, z], { count: 10, speed: 2.0, color: "#fbbf24" });
    },
    crateBank(x, y, z) {
      game.fx.burst("pickup", [x, y + 0.8, z], { count: 14, speed: 2.8, color: "#59d7ff" });
      game.fx.burst("ring", [x, y + 0.4, z], { count: 8, speed: 2.4, color: "#ffb454" });
    },
    surfaceBreak(x, y, z) {
      game.fx.burst("splash", [x, Math.min(y + 0.5, -0.2), z], { count: 12, speed: 2.4, color: "#bae6fd" });
      game.app.camera?.shake.add(0.12);
    }
  };
}
