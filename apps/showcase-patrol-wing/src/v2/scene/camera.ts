// apps/showcase-patrol-wing/src/v2/scene/camera.ts — flight rig (T2.3).
// §6.9.11 rig "flight": behind and above the aircraft, tracking its authored
// forward/up so climb and bank read in frame — a flight-sim chase cam, fov 68
// inside the [65,73] band. World-up bias keeps the horizon legible through
// rolls; the plane silhouette holds ~0.2 frame height inside [0.12,0.3].
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";

const BACK = 10.6;
const UP_WORLD = 3.2;
const UP_BODY = 1.1;
const LOOK_AHEAD = 7.0;
const LOOK_DROP = 1.0;
const FOV = 68;

export interface PatrolRigState {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function patrolPoseFor(state: PatrolRigState): AuraCameraPose {
  const f = state.forward;
  const fu = state.up;
  return {
    position: [
      state.position[0] - f[0] * BACK + fu[0] * UP_BODY,
      state.position[1] - f[1] * BACK + UP_WORLD + fu[1] * UP_BODY,
      state.position[2] - f[2] * BACK + fu[2] * UP_BODY
    ],
    target: [
      state.position[0] + f[0] * LOOK_AHEAD,
      state.position[1] + f[1] * LOOK_AHEAD - LOOK_DROP,
      state.position[2] + f[2] * LOOK_AHEAD
    ],
    up: [0, 1, 0],
    roll: 0,
    fov: FOV,
    near: 0.05,
    far: 220
  };
}

/** True when `point` sits inside the rig's forward cone (§7.2.1 rings.inFrame). */
export function pointInRigFrame(
  pose: AuraCameraPose,
  point: readonly [number, number, number],
  margin = 0.92
): boolean {
  const fx = pose.target[0] - pose.position[0];
  const fy = pose.target[1] - pose.position[1];
  const fz = pose.target[2] - pose.position[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const dx = point[0] - pose.position[0];
  const dy = point[1] - pose.position[1];
  const dz = point[2] - pose.position[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  const cos = (fx * dx + fy * dy + fz * dz) / (fl * dl);
  const halfAngleRad = ((pose.fov / 2) * Math.PI) / 180;
  return cos >= Math.cos(halfAngleRad * margin);
}

export function createPatrolRig(state: PatrolRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, 0, 0];
  const target: [number, number, number] = [0, 0, 0];
  const apply = (want: AuraCameraPose, k: number): void => {
    for (let i = 0; i < 3; i += 1) {
      eye[i] += (want.position[i]! - eye[i]) * k;
      target[i] += (want.target[i]! - target[i]) * k;
    }
  };
  return {
    id: "patrol-wing.flight",
    reset: () => {
      const want = patrolPoseFor(state);
      for (let i = 0; i < 3; i += 1) {
        eye[i] = want.position[i]!;
        target[i] = want.target[i]!;
      }
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.22);
      apply(patrolPoseFor(state), k);
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [target[0], target[1], target[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: FOV,
        near: 0.05,
        far: 220
      };
    }
  };
}

export function fallbackCameraNode() {
  return camera.perspective({
    position: [10.9, 7.2, 23.5],
    target: [0, 3.6, 17],
    fov: FOV
  });
}
