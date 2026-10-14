// apps/showcase-gravity-post/src/v2/scene/fx.ts — T2.4 fx wiring.
// §6.9.13 vfx: launch burst at the pad, dock-clamp ring, delivery ring,
// pod-lost shake+hitStop. The thrust cone, pulse breathing, trail streaks and
// spark ballistics stay as runtime-node animation in boot.ts — they read the
// same authored state every frame, not fire-and-forget.
import type { Game } from "@aura3d/engine";

export interface GravityFx {
  launch(x: number, z: number): void;
  dockClamp(x: number, z: number): void;
  delivery(x: number, z: number): void;
  podLost(x: number, z: number): void;
  bounce(x: number, z: number): void;
  correction(x: number, z: number): void;
}

export function wireGravityFx(game: Game): GravityFx {
  return {
    launch(x, z) {
      game.fx.burst("spark", [x, 0.2, z], { count: 10, speed: 1.6, color: "#67e8f9" });
    },
    dockClamp(x, z) {
      game.fx.burst("ring", [x, 0.2, z], { count: 14, speed: 2.2, color: "#59d7ff" });
      game.app.camera?.shake.add(0.12);
    },
    delivery(x, z) {
      game.fx.burst("ring", [x, 0.24, z], { count: 22, speed: 3.0, color: "#ffd166" });
      game.app.camera?.shake.add(0.16);
    },
    podLost(x, z) {
      game.fx.burst("debris", [x, 0.2, z], { count: 12, speed: 2.8, color: "#94a3b8" });
      game.app.camera?.shake.add(0.3);
      game.session.hitStop(0.06);
    },
    bounce(x, z) {
      game.fx.burst("spark", [x, 0.2, z], { count: 6, speed: 1.4, color: "#fca5a5" });
      game.session.hitStop(0.03);
    },
    correction(x, z) {
      game.fx.burst("spark", [x, 0.14, z], { count: 6, speed: 1.1, color: "#e8b04a" });
    }
  };
}
