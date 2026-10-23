import type { InputFrame } from "../contract";
import { clamp } from "../ui/format";
import type { HudState, SlamEngine } from "../ui/types";

/**
 * The page's "Auto" demo player. The original adapter nudged the player's position directly; this version plays through
 * the same inputs a human has (a movement frame plus swing requests), so the simulation stays the only thing that moves actors.
 */
export interface Autopilot {
  enabled: boolean;
  /** Movement frame for this step, or null to fall back to human input. Swings go through `engine.requestSwing`. */
  step(state: HudState, engine: SlamEngine, dt: number): InputFrame | null;
}

export function createAutopilot(initial = false): Autopilot {
  let serveTimer = 0;
  const autopilot: Autopilot = {
    enabled: initial,
    step(state, engine, dt) {
      if (!autopilot.enabled || state.mode !== "playing" || state.paused) return null;
      const p = state.player, b = state.ball;
      if (state.phase === "serve" && state.server === "player") {
        serveTimer += dt;
        if (serveTimer >= 0.45) { serveTimer = 0; engine.requestSwing("player", state.time, false); }
        return { x: 0, y: 0 };
      }
      serveTimer = 0;
      const attempt = state.serveAttempt as { swingAt?: number | null } | null;
      if (state.phase === "serveToss" && state.server === "player" && attempt?.swingAt === null && b.z >= 0.82 && b.vz <= 0.55) {
        engine.requestSwing("player", state.time, false);
        return { x: 0, y: 0 };
      }
      if (state.phase === "rally" && b.active && b.lastHit === "ai" && b.vy > 0) {
        const targetX = clamp(b.targetX ?? b.x ?? 0, -0.92, 0.92);
        const targetY = clamp(Math.max(0.68, (b.targetY ?? 0.82) + 0.08), 0.62, 1.06);
        const dx = targetX - p.x, dy = targetY - p.y;
        const dist = Math.hypot(dx, dy);
        const frame: InputFrame = dist > 0.04 ? { x: clamp(dx * 6.5, -1, 1), y: clamp(dy * 6.5, -1, 1) } : { x: 0, y: 0 };
        const ballDist = Math.hypot((b.x - p.x) * 1.05, b.y - p.y);
        if ((!b.isServe || b.bounceCount >= 1) && ballDist <= 0.34 && b.y > 0.12 && p.swing <= 0 && p.swingCooldown <= 0) {
          engine.selectShot("deep", "player");
          engine.requestSwing("player", state.time, false);
        }
        return frame;
      }
      return { x: 0, y: 0 };
    }
  };
  return autopilot;
}
