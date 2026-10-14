// apps/showcase-gravity-post/src/v2/scene/camera.ts — orbit rig (T2.3).
// §6.9.13 rig "orbit": the system board IS the subject — an elevated oblique
// that keeps all six wells on screen (~0.8 subject height fraction inside the
// [40,60] fov band), drifting a quarter-degree a second so the board reads as
// a place instead of a menu. While a pod is in flight the target borrows up
// to a third of the pod's position so the courier never drifts out of frame.
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";

const BOARD_CENTRE: readonly [number, number] = [0.3, -0.4];
const ORBIT_RADIUS = 6.8;
const ORBIT_HEIGHT = 7.1;
const ORBIT_DRIFT_RAD_PER_SEC = 0.0044; // ~0.25 deg/s
const FOV = 46;
const POD_TARGET_WEIGHT = 0.32;

export interface GravityRigState {
  /** Pod position on the play plane. */
  podX: number;
  podZ: number;
  /** True while the pod is in flight (coasting). */
  inFlight: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function gravityPoseFor(state: GravityRigState, timeSeconds: number): AuraCameraPose {
  const az = Math.PI * 0.32 + timeSeconds * ORBIT_DRIFT_RAD_PER_SEC;
  const w = state.inFlight ? POD_TARGET_WEIGHT : 0;
  const tx = lerp(BOARD_CENTRE[0], state.podX, w);
  const tz = lerp(BOARD_CENTRE[1], state.podZ, w);
  return {
    position: [
      BOARD_CENTRE[0] + Math.sin(az) * ORBIT_RADIUS,
      ORBIT_HEIGHT,
      BOARD_CENTRE[1] + Math.cos(az) * ORBIT_RADIUS
    ],
    target: [tx, 0.08, tz],
    up: [0, 1, 0],
    roll: 0,
    fov: FOV,
    near: 0.05,
    far: 120
  };
}

export function createGravityRig(state: GravityRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, 0, 0];
  const target: [number, number, number] = [0, 0, 0];
  let time = 0;
  const apply = (want: AuraCameraPose, k: number): void => {
    for (let i = 0; i < 3; i += 1) {
      eye[i] += (want.position[i]! - eye[i]) * k;
      target[i] += (want.target[i]! - target[i]) * k;
    }
  };
  return {
    id: "gravity-post.orbit",
    reset: () => {
      const want = gravityPoseFor(state, time);
      for (let i = 0; i < 3; i += 1) {
        eye[i] = want.position[i]!;
        target[i] = want.target[i]!;
      }
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      time += dt;
      const k = Math.min(1, dt / 0.35);
      apply(gravityPoseFor(state, time), k);
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [target[0], target[1], target[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: FOV,
        near: 0.05,
        far: 120
      };
    }
  };
}

export function fallbackCameraNode() {
  return camera.perspective({
    position: [0.3, 7.25, 6.65],
    target: [0.28, 0.08, -0.55],
    fov: FOV
  });
}
