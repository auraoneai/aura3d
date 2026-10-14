// apps/showcase-aurora-lander/src/v2/scene/camera.ts — altitude rig (T2.3).
// §6.9.12 rig "altitude": a high three-quarter night-ops view. While the lander
// is high the eye trails it so the craft reads against the aurora curtains
// (~0.11 subject height fraction inside the [35,50] fov band); through the
// final ~30 m the eye eases onto a far pad overlook that rises with AGL and
// the target splits the difference between craft and pad — both stay inside
// the 44° cone through touchdown, which is what the §7.2.1 pair
// lander.altitude<30 && framing.padInFrame===true measures.
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";

const FOLLOW_OFFSET: readonly [number, number, number] = [6, 7.5, 21];
const APPROACH_EYE_PAD_X = 10;
const APPROACH_EYE_BASE_Y = 18;
const APPROACH_EYE_AGL_GAIN = 1.0;
const APPROACH_EYE_BASE_Z = 24;
const APPROACH_EYE_AGL_Z_GAIN = 0.6;
const FOV = 44;
// Blend window: approach pose is fully engaged by 30 m AGL so
// framing.padInFrame holds for the entire lander.altitude<30 window.
const BLEND_HI_AGL = 34;
const BLEND_LO_AGL = 26;
const MIDPOINT_PAD_WEIGHT = 0.5;

export interface AuroraRigState {
  /** Live lander position. */
  x: number;
  y: number;
  z: number;
  /** Altitude above ground (feet plane), meters. */
  agl: number;
  /** Active pad plateau centre in world space. */
  padX: number;
  padY: number;
  padZ: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function smoothstep01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** Pure pose for the current state — the rig eases toward this each frame. */
export function auroraPoseFor(state: AuroraRigState): AuraCameraPose {
  const w = smoothstep01((BLEND_HI_AGL - state.agl) / (BLEND_HI_AGL - BLEND_LO_AGL));
  const appEyeX = state.padX + APPROACH_EYE_PAD_X;
  const appEyeY = state.padY + APPROACH_EYE_BASE_Y + state.agl * APPROACH_EYE_AGL_GAIN;
  const appEyeZ = state.padZ + APPROACH_EYE_BASE_Z + state.agl * APPROACH_EYE_AGL_Z_GAIN;
  const appTargetX = lerp(state.x, state.padX, MIDPOINT_PAD_WEIGHT);
  const appTargetY = lerp(state.y, state.padY + 1.2, MIDPOINT_PAD_WEIGHT);
  const appTargetZ = lerp(state.z, state.padZ, MIDPOINT_PAD_WEIGHT);
  return {
    position: [
      lerp(state.x + FOLLOW_OFFSET[0], appEyeX, w),
      lerp(Math.max(state.y + FOLLOW_OFFSET[1], state.padY + 14), appEyeY, w),
      lerp(state.z + FOLLOW_OFFSET[2], appEyeZ, w)
    ],
    target: [
      lerp(state.x, appTargetX, w),
      lerp(state.y, appTargetY, w),
      lerp(state.z, appTargetZ, w)
    ],
    up: [0, 1, 0],
    roll: 0,
    fov: FOV,
    near: 0.1,
    far: 400
  };
}

export function createAuroraRig(state: AuroraRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, 0, 0];
  const target: [number, number, number] = [0, 0, 0];
  return {
    id: "aurora-lander.altitude",
    reset: () => {
      const pose = auroraPoseFor(state);
      eye[0] = pose.position[0];
      eye[1] = pose.position[1];
      eye[2] = pose.position[2];
      target[0] = pose.target[0];
      target[1] = pose.target[1];
      target[2] = pose.target[2];
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.2);
      const want = auroraPoseFor(state);
      for (let i = 0; i < 3; i += 1) {
        eye[i] += (want.position[i]! - eye[i]) * k;
        target[i] += (want.target[i]! - target[i]) * k;
      }
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [target[0], target[1], target[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: FOV,
        near: 0.1,
        far: 400
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
    position: [14, 20, 22],
    target: [8, 4, 8],
    fov: FOV
  });
}
