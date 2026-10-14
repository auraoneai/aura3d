// apps/showcase-courier-rush/src/v2/scene/camera.ts — chase rig (T2.3).
// Route-local AuraCameraRig (direction rig "chase"): trails the van at
// CHASE_CAMERA.distance/height aimed lookAhead past the nose, smoothed; the
// drop look-back blends the eye out beside the van via chaseOffsetForBlend
// for DROP_LOOKBACK_SECONDS after a delivery lands.
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";
import { CHASE_CAMERA, chaseOffsetForBlend } from "../../gameplay/van";

export interface CourierRigState {
  /** Van world pose + heading (radians, forward = cos/sin in x/z). */
  van: { x: number; z: number; heading: number };
  /** Drop look-back blend 0..1 (0 = straight chase). */
  lookback: number;
}

const UP: AuraVec3 = [0, 1, 0];

export function createCourierRig(state: CourierRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, CHASE_CAMERA.height, 24];
  const tracked: [number, number, number] = [0, 1, 14];
  return {
    id: "courier-rush.chase",
    reset: () => {
      eye[0] = 0; eye[1] = CHASE_CAMERA.height; eye[2] = 24;
      tracked[0] = 0; tracked[1] = 1; tracked[2] = 14;
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const { van, lookback } = state;
      const fx = Math.cos(van.heading);
      const fz = Math.sin(van.heading);
      const offset = chaseOffsetForBlend(lookback);
      const rightX = -fz;
      const rightZ = fx;
      const want: AuraVec3 = [
        van.x - fx * offset.offsetZ + rightX * offset.offsetX,
        offset.offsetY,
        van.z - fz * offset.offsetZ + rightZ * offset.offsetX
      ];
      const wantTarget: AuraVec3 = [
        van.x + fx * CHASE_CAMERA.lookAhead,
        1.0,
        van.z + fz * CHASE_CAMERA.lookAhead
      ];
      const t = Math.min(1, ctx.dt / (CHASE_CAMERA.smoothing * (1 + lookback)));
      for (let i = 0; i < 3; i += 1) {
        eye[i] = eye[i] + (want[i] - eye[i]) * t;
        tracked[i] = tracked[i] + (wantTarget[i] - tracked[i]) * Math.min(1, t * 1.4);
      }
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [tracked[0], tracked[1], tracked[2]],
        up: UP,
        roll: 0,
        fov: CHASE_CAMERA.fov,
        near: 0.1,
        far: 160
      };
    }
  };
}

/** Compiled fallback camera for scene() snapshots (spawn chase view). */
export function fallbackCameraNode(): ReturnType<typeof camera.perspective> {
  return camera.perspective({
    position: [0, CHASE_CAMERA.height, 24],
    target: [0, 1, 14],
    fov: CHASE_CAMERA.fov
  });
}
