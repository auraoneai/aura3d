// apps/showcase-bank-shot/src/v2/scene/fx.ts — gameplay event fx (T2.4).
// §6.9.1 VFX restraint: chalk puff on strike (12 dust), felt dust on break
// (24), nothing else. Juice: break trauma 0.25 + 30 ms hit-stop, 0.5× slow-mo
// 0.6 s on the 8-ball. All through C-24 game.fx / game.session — no per-frame
// allocations, no renderer reads.
import type { Game } from "@aura3d/engine";
import { EIGHT_BALL } from "../../gameplay/rules";

/** Burst positions come from the live sim pose at event time. */
export function wireBankShotFx(game: Game, atCueBall: () => [number, number, number]): {
  onStrike(): void;
  onBreak(): void;
  onPotted(ball: number): void;
} {
  return {
    onStrike() {
      const [x, y, z] = atCueBall();
      game.fx.burst("dust", [x, y + 0.03, z], { count: 12, speed: 0.35, color: "#cfd8c8" });
    },
    onBreak() {
      const [x, y, z] = atCueBall();
      game.fx.burst("dust", [x, y + 0.02, z], { count: 24, speed: 0.5, color: "#9fb08f" });
      // §6.9.1 juice: break trauma 0.25 + 30 ms hit-stop.
      game.app.camera?.shake.add(0.25);
      game.session.hitStop(0.03);
    },
    onPotted(ball: number) {
      if (ball === EIGHT_BALL) game.session.slowMo(0.5, 600);
    }
  };
}
