/**
 * Rigged Idol kart drivers (presentation only). The kart shells are generated with an EMPTY seat; each driver is a rigged
 * Idol kid (`turfHeroDriverRig`, `turfRivalDriverRig`, unnamed `bone_N` skeleton mapped by
 * `apps/showcase-port-shared/idol/humanoid.ts`) posed every frame: seated (hips and knees flexed into the footwell), hands on
 * the steering-wheel rim through two-bone IK, the wheel turning with the steer input, torso and head leaning and looking
 * into the turn, plus a small speed-driven road buzz so a driver is never a frozen statue.
 *
 * Poses go to the runtime handle as `setAnimationPose({ bones, mode: "replace" })` with OBJECT-form transforms (the
 * shared driver already emits `{x,y,z,w}`), and the node keeps the generator's `normalized.sceneScale` (rigged GLBs are
 * stored at unit height).
 */
import {
  eulerZYX,
  type HumanoidAnimationPose,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type Vec3
} from "../../../showcase-port-shared/idol/humanoid";

export interface DriverControl {
  /** Steering input, -1 (full left, toward -X of the kart) .. 1 (full right, toward +X of the kart). */
  readonly steer: number;
  /** Shown clock (s). */
  readonly time: number;
  /** 0..1 speed ratio (drives the road buzz). */
  readonly speed: number;
  readonly reduced: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Seated body (no hand targets yet): thighs forward into the footwell, shins down, torso leaning into the turn. */
export function seatedRotations(c: DriverControl): HumanoidPoseInput["rotations"] {
  const s = clamp(c.steer, -1, 1);
  const buzz = c.reduced ? 0 : 0.02 * Math.sin(c.time * (18 + 10 * c.speed)) * (0.3 + c.speed);
  const breathe = c.reduced ? 0 : 0.025 * Math.sin(c.time * 2.1);
  return {
    leftUpperLeg: eulerZYX(-1.38, 0.08, 0.06),
    rightUpperLeg: eulerZYX(-1.38, -0.08, -0.06),
    leftLowerLeg: eulerZYX(1.25, 0, 0),
    rightLowerLeg: eulerZYX(1.25, 0, 0),
    leftFoot: eulerZYX(-0.2, 0, 0),
    rightFoot: eulerZYX(-0.2, 0, 0),
    // lean forward a touch, roll the shoulders into the turn and twist toward it
    spine: eulerZYX(0.12 + breathe + buzz, -0.18 * s, 0.1 * s),
    chest: eulerZYX(0.06, -0.12 * s, 0.08 * s),
    neck: eulerZYX(-0.05, -0.2 * s, 0),
    head: eulerZYX(-0.08 + buzz, -0.3 * s, -0.06 * s)
  };
}

/** Steering-wheel rim angle (rad) for a steer input: up to ±100 deg of lock. */
export const wheelTurn = (steer: number): number => clamp(steer, -1, 1) * 1.75;

/**
 * Full driver pose: hands gripping the steering-wheel rim at ten-to-two, turned with the steer input. The wheel centre is
 * placed in front of the seated chest in model space (unit-height rig), so it works for any Idol proportions.
 */
export function driverPose(driver: HumanoidDriver, c: DriverControl): { input: HumanoidPoseInput; pose: HumanoidAnimationPose } {
  const rotations = seatedRotations(c);
  const base: HumanoidPoseInput = { rotations };
  const pos = driver.modelPositions(base);
  const r = driver.map.roles;
  const ls = pos[r.leftUpperArm ?? ""], rs = pos[r.rightUpperArm ?? ""], hips = pos[r.hips ?? ""];
  if (!ls || !rs || !hips) return { input: base, pose: driver.pose(base) };
  const mid: Vec3 = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2];
  const torso = Math.max(0.05, mid[1] - hips[1]);
  const centre: Vec3 = [mid[0], mid[1] - 0.42 * torso, mid[2] + 0.62 * torso];
  const rim = 0.3 * torso;
  const turn = wheelTurn(c.steer);
  // character's left = +X; ten-to-two grips, the wheel plane tilted 25 deg back toward the driver
  const grip = (a: number): Vec3 => {
    const x = Math.cos(a) * rim, y = Math.sin(a) * rim;
    return [centre[0] + x, centre[1] + y * Math.cos(0.44), centre[2] - y * Math.sin(0.44)];
  };
  const input: HumanoidPoseInput = { rotations, handTargets: { left: grip(0.52 - turn), right: grip(Math.PI - 0.52 - turn) } };
  return { input, pose: driver.pose(input) };
}

/** Model-space hips of the seated pose (the point that sits on the kart seat). */
export function seatedHips(driver: HumanoidDriver): Vec3 {
  const pos = driver.modelPositions({ rotations: seatedRotations({ steer: 0, time: 0, speed: 0, reduced: true }) });
  return pos[driver.map.roles.hips ?? ""] ?? [0, 0.5, 0];
}
