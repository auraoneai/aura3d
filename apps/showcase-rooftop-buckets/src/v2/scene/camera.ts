// apps/showcase-rooftop-buckets/src/v2/scene/camera.ts — shoulder rig (T2.3).
// Route-local AuraCameraRig (direction rig "shoulder"): sits just behind and
// right of the shooter at the active spot, chest-high, aimed at the rim. In
// flight the target eases to track the ball; between shots it returns to the
// broadcast line-up over the shooter's shoulder.
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";

export interface RooftopRigState {
  /** Active shot spot (x,z). */
  readonly spot: { readonly x: number; readonly z: number };
  /** Ball world position while in flight, else null. */
  ball: AuraVec3 | null;
}

const UP: AuraVec3 = [0, 1, 0];
const SHOULDER_BACK = 2.6;
const SHOULDER_SIDE = 0.7;
const SHOULDER_UP = 1.75;
const FOV = 50;
const HOOP: AuraVec3 = [0, 3.05, 0];

export function createRooftopRig(state: RooftopRigState): AuraCameraRig {
  const tracked: [number, number, number] = [HOOP[0], HOOP[1], HOOP[2]];
  return {
    id: "rooftop-buckets.shoulder",
    reset: () => { tracked[0] = HOOP[0]; tracked[1] = HOOP[1]; tracked[2] = HOOP[2]; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const { spot, ball } = state;
      // Over-the-shoulder: behind the spot on the ray spot→hoop, off to +x.
      const dx = HOOP[0] - spot.x;
      const dz = HOOP[2] - spot.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const position: AuraVec3 = [
        spot.x - nx * SHOULDER_BACK + -nz * SHOULDER_SIDE,
        SHOULDER_UP,
        spot.z - nz * SHOULDER_BACK + nx * SHOULDER_SIDE
      ];
      const want: AuraVec3 = ball
        ? [HOOP[0] + (ball[0] - HOOP[0]) * 0.55, Math.max(1.2, ball[1]), HOOP[2] + (ball[2] - HOOP[2]) * 0.55]
        : HOOP;
      const t = Math.min(1, ctx.dt / (ball ? 0.18 : 0.8));
      for (let i = 0; i < 3; i += 1) tracked[i] = tracked[i] + (want[i] - tracked[i]) * t;
      return {
        position,
        target: [tracked[0], tracked[1], tracked[2]],
        up: UP,
        roll: 0,
        fov: FOV,
        near: 0.05,
        far: 120
      };
    }
  };
}

/** Compiled fallback camera for scene() snapshots (spot 2 = free throw). */
export function fallbackCameraNode(): ReturnType<typeof camera.perspective> {
  const spot = { x: 0, z: 4.6 };
  const dx = HOOP[0] - spot.x;
  const dz = HOOP[2] - spot.z;
  const len = Math.hypot(dx, dz) || 1;
  return camera.perspective({
    position: [
      spot.x - (dx / len) * SHOULDER_BACK + -(dz / len) * SHOULDER_SIDE,
      SHOULDER_UP,
      spot.z - (dz / len) * SHOULDER_BACK + (dx / len) * SHOULDER_SIDE
    ],
    target: HOOP,
    fov: FOV
  });
}
