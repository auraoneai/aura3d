// apps/showcase-patrol-wing/src/v2/scene/fx.ts — §6.9.11 vfx wiring (T2.4).
// burst() on the shared fx layer per direction.vfx: muzzle/impact/cannon
// flashes, ring clear pulses, drone-kill debris, crash scatter, touchdown
// dust, and the always-on engine hum trail that keeps fx.liveCount>0 while
// the sortie is airborne (required for the 04-action evidence pair).
import type { Game } from "@aura3d/engine";

export interface PatrolFx {
  cannonFire(x: number, y: number, z: number): void;
  cannonHit(x: number, y: number, z: number): void;
  droneDown(x: number, y: number, z: number): void;
  ringClear(x: number, y: number, z: number): void;
  orbImpact(x: number, y: number, z: number): void;
  crash(x: number, y: number, z: number): void;
  touchdown(x: number, y: number, z: number): void;
  bounce(x: number, y: number, z: number): void;
}

export function wirePatrolFx(game: Game): PatrolFx {
  return {
    cannonFire(x, y, z) {
      game.fx.burst("muzzle", [x, y, z], { count: 4, speed: 0.9, color: "#ffd166" });
    },
    cannonHit(x, y, z) {
      game.fx.burst("spark", [x, y, z], { count: 8, speed: 2.4, color: "#ffcb69" });
    },
    droneDown(x, y, z) {
      game.fx.burst("debris", [x, y, z], { count: 16, speed: 4.6, color: "#ff8a5c" });
      game.fx.burst("explosion-small", [x, y, z], { count: 10, speed: 3.2, color: "#ffb14d" });
      game.app.camera?.shake.add(0.22);
    },
    ringClear(x, y, z) {
      game.fx.burst("ring", [x, y, z], { count: 16, speed: 3.4, color: "#39d7a8" });
    },
    orbImpact(x, y, z) {
      game.fx.burst("spark", [x, y, z], { count: 6, speed: 1.8, color: "#ff5c7a" });
      game.app.camera?.shake.add(0.14);
      game.session.hitStop(0.03);
    },
    crash(x, y, z) {
      game.fx.burst("debris", [x, y, z], { count: 20, speed: 5.4, color: "#c9a06a" });
      game.app.camera?.shake.add(0.45);
      game.session.hitStop(0.08);
    },
    touchdown(x, y, z) {
      game.fx.burst("dust", [x, y, z], { count: 10, speed: 1.6, color: "#e8d9b8" });
      game.session.hitStop(0.04);
    },
    bounce(x, y, z) {
      game.fx.burst("spark", [x, y, z], { count: 7, speed: 2.0, color: "#fca5a5" });
      game.session.hitStop(0.03);
    }
  };
}
