// apps/showcase-turbo-drift-circuit/src/v2/scene/fx.ts — T2.4 VFX wiring.
// §6.9.2 direction vfx[]: tyre-slip trail (lit smoke), wall-scrape burst
// (sparks), off-track trail (dust). Juice: speed streaks > 85% top speed
// (fov kick), kerb shake trauma 0.1, finish slow-mo. All through
// game.fx / game.session / app.camera (C-24 shell).
import type { GameFxLayer, GameSession, AuraApp, AuraVec3 } from "@aura3d/engine";

export interface TurboFxHooks {
  readonly game: { readonly fx: GameFxLayer; readonly session: GameSession };
  readonly app: AuraApp | undefined;
}

export interface TurboFxFrame {
  readonly speedRatio: number;
  readonly driftAmount: number;
  readonly offTrack: boolean;
  readonly scraped: boolean;
  readonly carPosition: AuraVec3;
  readonly finishedEvent: boolean;
}

const SPEED_STREAK_THRESHOLD = 0.85;
let smokeAcc = 0;
let scrapeAcc = 0;
let dustAcc = 0;

/** Per-frame fx emission. Emission is probabilistic so p95 stays bounded. */
export function turboDriftFxFrame(hooks: TurboFxHooks, f: TurboFxFrame): void {
  const { game, app } = hooks;
  const { fx, session } = game;

  // Tyre smoke while drifting on the road: burst puffs from the rear axle.
  if (f.driftAmount > 0.25 && !f.offTrack) {
    smokeAcc += f.driftAmount * 3;
    if (smokeAcc >= 1) {
      smokeAcc = 0;
      fx.burst("dust", f.carPosition, {
        count: Math.round(6 + f.driftAmount * 10),
        speed: 0.35 + f.driftAmount * 0.5,
        color: "#cfd2d4",
        seed: Math.floor(f.carPosition[0] * 977 + f.carPosition[2] * 131)
      });
    }
  }
  // Off-track dust kicked up onto grass/dirt.
  if (f.offTrack && f.speedRatio > 0.15) {
    dustAcc += f.speedRatio * 2;
    if (dustAcc >= 1) {
      dustAcc = 0;
      fx.burst("dust", f.carPosition, {
        count: 8,
        speed: 0.5,
        color: "#8a7a5a",
        seed: Math.floor(f.carPosition[0] * 331)
      });
    }
  }
  // Wall/kerb scrape sparks + kerb shake trauma.
  if (f.scraped) {
    scrapeAcc += 1;
    if (scrapeAcc >= 6) {
      scrapeAcc = 0;
      fx.burst("spark", f.carPosition, { count: 10, speed: 1.1, color: "#ffb36b" });
      app?.camera?.shake.add(0.1);
    }
  }
  // Screen-space speed streaks above 85% top speed (fov channel, halflife).
  const kick = f.speedRatio > SPEED_STREAK_THRESHOLD
    ? ((f.speedRatio - SPEED_STREAK_THRESHOLD) / (1 - SPEED_STREAK_THRESHOLD)) * 6
    : 0;
  app?.camera?.fovKick.set("speed", kick, 0.25);

  if (f.finishedEvent) {
    session.slowMo(0.5, 900);
    app?.camera?.shake.add(0.5);
    fx.burst("ring", f.carPosition, { count: 24, speed: 1.4, color: "#ffd24d" });
  }
}
