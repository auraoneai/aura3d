// apps/showcase-siege-golf/src/v2/scene/camera.ts — altitude rig (T2.3).
// §6.9.10 rig "altitude": a high three-quarter view over the tee end so the
// whole lane — tee, structures, keep, cups — sits inside the [45,60] fov band
// at ~0.55 subject height fraction. During a stroke the target eases toward
// the live ball so demolition stays framed; it returns to the lane centroid
// when the next aim phase begins.
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";

const EYE: [number, number, number] = [0, 9.2, 7.8];
const LANE_TARGET: [number, number, number] = [0, 0.2, -3.4];
const FOV = 52;
// During flight the tracked target blends toward the ball by this amount —
// enough to keep the demolition in frame without losing the keep read.
const BALL_FOLLOW_FRACTION = 0.55;

export interface SiegeRigState {
  /** Live ball position (x,z) on the felt. */
  ball: { x: number; z: number };
  /** True while a stroke is resolving (phase "simulating"). */
  ballInFlight: boolean;
}

export function createSiegeRig(state: SiegeRigState): AuraCameraRig {
  const target: [number, number, number] = [...LANE_TARGET];
  return {
    id: "siege-golf.altitude",
    reset: () => {
      target[0] = LANE_TARGET[0];
      target[1] = LANE_TARGET[1];
      target[2] = LANE_TARGET[2];
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.16);
      const wantX = state.ballInFlight
        ? LANE_TARGET[0] + (state.ball.x - LANE_TARGET[0]) * BALL_FOLLOW_FRACTION
        : LANE_TARGET[0];
      const wantZ = state.ballInFlight
        ? LANE_TARGET[2] + (state.ball.z - LANE_TARGET[2]) * BALL_FOLLOW_FRACTION
        : LANE_TARGET[2];
      target[0] += (wantX - target[0]) * k;
      target[2] += (wantZ - target[2]) * k;
      return {
        position: [EYE[0], EYE[1], EYE[2]],
        target: [target[0], target[1], target[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: FOV,
        near: 0.1,
        far: 160
      };
    }
  };
}

export function fallbackCameraNode() {
  return camera.perspective({
    position: EYE,
    target: LANE_TARGET,
    fov: FOV
  });
}
