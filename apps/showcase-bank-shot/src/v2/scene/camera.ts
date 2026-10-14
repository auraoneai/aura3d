// apps/showcase-bank-shot/src/v2/scene/camera.ts — aim-orbit camera rig (T2.3).
// Route-local AuraCameraRig (G12 stand-in, direction.standIns[] R-14-10):
// aim phase orbits the cue ball at the art direction's distance 1.1–2.0 m and
// pitch 18–38° with yaw bound to the aim angle; while balls roll it blends
// toward a 3/4 overhead shot. `app.camera.use(rig, { blend })` applies it
// where C-22 is real; the scene camera below is the compiled fallback.
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";

export interface BankShotRigState {
  /** Current aim angle in radians (cue-ball orbit yaw). */
  readonly aimAngle: number;
  /** True while a shot is in flight (blend to the overhead roll camera). */
  readonly rolling: boolean;
}

const AIM_DISTANCE = 1.6;
const AIM_PITCH_DEG = 26;
const ROLL_POSITION: AuraVec3 = [-0.35, 2.5, 2.3];
const AIM_FOV = 44;
const ROLL_FOV = 48;
const UP: AuraVec3 = [0, 1, 0];

function lerpPose(a: AuraCameraPose, b: AuraCameraPose, t: number): AuraCameraPose {
  const v = (from: AuraVec3, to: AuraVec3): AuraVec3 => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];
  return {
    position: v(a.position, b.position),
    target: v(a.target, b.target),
    up: a.up,
    roll: a.roll + (b.roll - a.roll) * t,
    fov: a.fov + (b.fov - a.fov) * t,
    near: a.near,
    far: a.far
  };
}

export function createBankShotRig(state: BankShotRigState): AuraCameraRig {
  const pitch = (AIM_PITCH_DEG * Math.PI) / 180;
  // 0.4 s blend toward the roll camera while balls move, back when aiming.
  let rollBlend = 0;
  return {
    id: "bank-shot.aim-orbit",
    reset: () => { rollBlend = 0; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      rollBlend = state.rolling
        ? Math.min(1, rollBlend + ctx.dt / 0.4)
        : Math.max(0, rollBlend - ctx.dt / 0.4);
      const cue = ctx.subject("ball-00");
      const target: AuraVec3 = cue?.position ?? [-0.7, 0.08, 0];
      // Aim orbit: camera sits BEHIND the cue along the aim direction.
      const yaw = state.aimAngle + Math.PI;
      const aimPos: AuraVec3 = [
        target[0] + Math.cos(yaw) * AIM_DISTANCE * Math.cos(pitch),
        target[1] + AIM_DISTANCE * Math.sin(pitch),
        target[2] + Math.sin(yaw) * AIM_DISTANCE * Math.cos(pitch)
      ];
      const aim: AuraCameraPose = {
        position: aimPos, target, up: UP, roll: 0,
        fov: AIM_FOV, near: 0.05, far: 40
      };
      const roll: AuraCameraPose = {
        position: ROLL_POSITION, target: [0.3, 0, 0], up: UP, roll: 0,
        fov: ROLL_FOV, near: 0.05, far: 40
      };
      return lerpPose(aim, roll, rollBlend);
    }
  };
}

/** Compiled fallback pose for the scene camera (pre-rig / no C-22). */
export function fallbackCameraNode() {
  return camera.perspective({
    position: ROLL_POSITION,
    target: [0.3, 0, 0],
    fov: ROLL_FOV
  });
}
