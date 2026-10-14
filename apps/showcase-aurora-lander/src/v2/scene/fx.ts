// apps/showcase-aurora-lander/src/v2/scene/fx.ts — juice wiring (T2.5).
// Maps touchdown (soft/hard), crash, pad-lock sensor arm and gust telegraph
// onto game.fx bursts + hitStop + camera shake. The crash debris ballistics
// and plume/dust/whiteout loops stay as runtime-node animation in boot.ts —
// they read the same authored state every frame, not fire-and-forget.
import type { Game } from "@aura3d/engine";

export interface AuroraFx {
  touchdown(x: number, y: number, z: number, soft: boolean): void;
  crash(x: number, y: number, z: number): void;
  padLock(x: number, y: number, z: number): void;
  gustWarn(x: number, y: number, z: number): void;
  siteClear(x: number, y: number, z: number): void;
}

export function wireAuroraFx(game: Game): AuroraFx {
  return {
    touchdown(x, y, z, soft) {
      game.fx.burst("dust", [x, Math.max(y, 0.1), z], {
        count: soft ? 10 : 16,
        speed: soft ? 1.6 : 2.6,
        color: "#b8c4c2"
      });
      game.app.camera?.shake.add(soft ? 0.1 : 0.22);
      if (!soft) game.session.hitStop(0.04);
    },
    crash(x, y, z) {
      game.fx.burst("debris", [x, Math.max(y, 0.2), z], { count: 14, speed: 3.4, color: "#57606a" });
      game.fx.burst("spark", [x, Math.max(y, 0.3), z], { count: 8, speed: 2.8, color: "#fca5a5" });
      game.app.camera?.shake.add(0.34);
      game.session.hitStop(0.06);
    },
    padLock(x, y, z) {
      game.fx.burst("ring", [x, Math.max(y, 0.2), z], { count: 8, speed: 2.2, color: "#59d7ff" });
    },
    gustWarn(x, y, z) {
      game.fx.burst("dust", [x, y, z], { count: 6, speed: 1.2, color: "#bae6fd" });
    },
    siteClear(x, y, z) {
      game.fx.burst("ring", [x, y + 0.4, z], { count: 14, speed: 3.4, color: "#5eead4" });
      game.app.camera?.shake.add(0.18);
    }
  };
}
