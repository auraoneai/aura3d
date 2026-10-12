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
import { cameraPointClear, clearanceLift, createChaseClearance } from "../../gameplay/camera-clearance";

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
  // Flash fix: the trailing eye never enters a tower block (camera-clearance).
  const clearance = createChaseClearance();
  return {
    id: "courier-rush.chase",
    reset: () => {
      eye[0] = 0; eye[1] = CHASE_CAMERA.height; eye[2] = 24;
      tracked[0] = 0; tracked[1] = 1; tracked[2] = 14;
      clearance.reset();
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const { van, lookback } = state;
      const fx = Math.cos(van.heading);
      const fz = Math.sin(van.heading);
      const offset = chaseOffsetForBlend(lookback);
      const rightX = -fz;
      const rightZ = fx;
      const clear = clearance.update(van.x, van.z, -fx, -fz, offset.offsetZ, offset.offsetY, ctx.dt);
      const clearZ = clear.distance;
      const pull = clearZ / offset.offsetZ;
      const want: AuraVec3 = [
        van.x - fx * clearZ + rightX * offset.offsetX * pull,
        Math.max(offset.offsetY + clearanceLift(offset.offsetZ, clearZ), clear.minOffsetY + 0.2),
        van.z - fz * clearZ + rightZ * offset.offsetX * pull
      ];
      const wantTarget: AuraVec3 = [
        van.x + fx * CHASE_CAMERA.lookAhead,
        1.0,
        van.z + fz * CHASE_CAMERA.lookAhead
      ];
      const t = Math.min(1, ctx.dt / (CHASE_CAMERA.smoothing * (1 + lookback)));
      for (let i = 0; i < 3; i += 1) {
        eye[i] = eye[i] + (want[i] - eye[i]) * t;
      }
      // A smoothed eye can still cut a corner through a block: snap it onto
      // the clear sight line when the lagged position is not open street.
      if (!cameraPointClear(eye[0], eye[2], eye[1])) {
        eye[0] = want[0]; eye[1] = Math.max(eye[1], want[1]); eye[2] = want[2];
      }
      for (let i = 0; i < 3; i += 1) {
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
