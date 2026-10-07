// apps/showcase-vault-breakers/src/v2/scene/camera.ts — table camera rig (T2.3).
// Route-local AuraCameraRig (direction rig "static"): a fixed 3/4 lens over the
// playfield — the legacy framing kept backbox to drain gap in the canvas at
// [0, 5.15, 7.35] → [0, -0.05, -0.38] fov 50. While a ball is live the target
// eases a bounded 0.4 m toward it (ball tracking without losing the table).
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";

export interface VaultRigState {
  /** Live ball world position, or null when no ball is in play. */
  readonly ball: AuraVec3 | null;
}

const POSITION: AuraVec3 = [0, 5.15, 7.35];
const BASE_TARGET: AuraVec3 = [0, -0.05, -0.38];
const FOV = 50;
const UP: AuraVec3 = [0, 1, 0];
const TRACK_RADIUS = 0.4;

export function createVaultRig(state: VaultRigState): AuraCameraRig {
  const tracked: AuraVec3 = [...BASE_TARGET];
  return {
    id: "vault-breakers.static-table",
    reset: () => { tracked[0] = BASE_TARGET[0]; tracked[1] = BASE_TARGET[1]; tracked[2] = BASE_TARGET[2]; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const want: AuraVec3 = state.ball
        ? [
            BASE_TARGET[0] + Math.max(-TRACK_RADIUS, Math.min(TRACK_RADIUS, state.ball[0] * 0.12)),
            BASE_TARGET[1],
            BASE_TARGET[2] + Math.max(-TRACK_RADIUS, Math.min(TRACK_RADIUS, (state.ball[2] + 0.38) * 0.15))
          ]
        : BASE_TARGET;
      // ~0.8 s ease toward the tracked target.
      const t = Math.min(1, ctx.dt / 0.8);
      for (let i = 0; i < 3; i += 1) tracked[i] = tracked[i] + (want[i] - tracked[i]) * t;
      return {
        position: POSITION,
        target: [tracked[0], tracked[1], tracked[2]],
        up: UP,
        roll: 0,
        fov: FOV,
        near: 0.1,
        far: 60
      };
    }
  };
}

/** Compiled fallback camera for scene() snapshots (identical base pose). */
export function fallbackCameraNode(): ReturnType<typeof camera.perspective> {
  return camera.perspective({ position: POSITION, target: BASE_TARGET, fov: FOV });
}
