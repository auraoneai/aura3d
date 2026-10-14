// apps/showcase-deep-recovery/src/v2/scene/camera.ts — §6.9.14 chase rig.
// Three-quarter dive composition: slightly above and behind the hull, aimed
// a touch below it so the wreck basin stays in the lower frame — the salvage
// chart read the direction wants. FOV 62 inside the [55,70] band; the sub
// occupies ~0.2 of frame height (inside [0.15,0.3]).
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";

const BACK = 13.5;
const UP = 7.0;
const SIDE = 2.2;
const LOOK_AHEAD = 4.5;
const LOOK_DROP = 2.2;
export const RIG_FOV = 62;

export interface DeepRigState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Pure chase pose: behind+above the hull along its yaw, aimed past the bow. */
export function deepPoseFor(state: DeepRigState): AuraCameraPose {
  const fx = Math.sin(state.yaw);
  const fz = Math.cos(state.yaw);
  const rx = Math.cos(state.yaw);
  const rz = -Math.sin(state.yaw);
  return {
    position: [
      state.x - fx * BACK + rx * SIDE,
      state.y + UP,
      state.z - fz * BACK + rz * SIDE
    ],
    target: [
      state.x + fx * LOOK_AHEAD,
      state.y - LOOK_DROP,
      state.z + fz * LOOK_AHEAD
    ],
    up: [0, 1, 0],
    roll: 0,
    fov: RIG_FOV,
    near: 0.1,
    far: 500
  };
}

export function createDeepRig(state: DeepRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, 0, 0];
  const aim: [number, number, number] = [0, 0, 0];
  return {
    id: "deep-recovery.chase",
    reset: () => {
      const pose = deepPoseFor(state);
      eye[0] = pose.position[0];
      eye[1] = pose.position[1];
      eye[2] = pose.position[2];
      aim[0] = pose.target[0];
      aim[1] = pose.target[1];
      aim[2] = pose.target[2];
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      // §14.4 smoothing 0.15 — the chase pose eases over a 0.15 s time
      // constant, fast enough to keep the sub framed through turns.
      const k = Math.min(1, dt / 0.15);
      const want = deepPoseFor(state);
      for (let i = 0; i < 3; i += 1) {
        eye[i] += (want.position[i]! - eye[i]) * k;
        aim[i] += (want.target[i]! - aim[i]) * k;
      }
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [aim[0], aim[1], aim[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: RIG_FOV,
        near: 0.1,
        far: 500
      };
    }
  };
}

/** True when `point` sits inside a pose's forward cone (half-fov * margin). */
export function pointInRigFrame(
  pose: AuraCameraPose,
  point: readonly [number, number, number],
  marginFraction = 0.82
): boolean {
  const fx = pose.target[0] - pose.position[0];
  const fy = pose.target[1] - pose.position[1];
  const fz = pose.target[2] - pose.position[2];
  const px = point[0] - pose.position[0];
  const py = point[1] - pose.position[1];
  const pz = point[2] - pose.position[2];
  const fLen = Math.hypot(fx, fy, fz) || 1;
  const pLen = Math.hypot(px, py, pz) || 1;
  const cosAngle = (fx * px + fy * py + fz * pz) / (fLen * pLen);
  const halfFovRad = (pose.fov * Math.PI) / 360;
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) <= halfFovRad * marginFraction;
}

export function fallbackCameraNode() {
  return camera.perspective({
    position: [16, -2, 24],
    target: [-4, -14, -8],
    fov: 58
  });
}
