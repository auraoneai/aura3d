/**
 * Rigged Idol paint-runner (`splatRunnerRig`) surfing the roller cradle, posed every frame (presentation only). The old
 * procedural runner stood in a fixed surf crouch; this one is livelier: a knee-pumping crouch whose depth follows the
 * speed, arms out for balance and swinging against the steering, hips and torso leaning into the steer, head looking
 * down the road, and a bigger "ride" when the ball is airborne. Pure functions of read-only presentation values, so the
 * simulation and its random stream never see it.
 */
import { eulerZYX, type HumanoidAnimationPose, type HumanoidDriver, type HumanoidPoseInput, type Vec3 } from "../../apps/showcase-port-shared/idol/humanoid";

export interface RunnerControl {
  /** Steering lean, -1..1 (sign follows the ball's steer bank). */
  readonly steer: number;
  /** Shown clock (s). */
  readonly time: number;
  /** 0..1 speed ratio. */
  readonly speed: number;
  /** Ball height above its resting height (m): the runner absorbs bumps and jumps. */
  readonly lift: number;
  readonly reduced: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function runnerInput(c: RunnerControl): HumanoidPoseInput {
  const s = clamp(c.steer, -1, 1);
  const sp = clamp(c.speed, 0, 1);
  const t = c.reduced ? 0 : c.time;
  const pumpRate = 6 + 4 * sp;
  const pump = c.reduced ? 0 : Math.sin(t * pumpRate);
  const air = clamp(c.lift * 3, 0, 1);
  const crouch = 0.55 + 0.25 * sp + 0.12 * pump + 0.25 * air; // 0 = standing, 1 = deep squat
  const thigh = -0.55 - 0.75 * crouch;
  const knee = 0.95 + 1.35 * crouch;
  const ankle = -(knee + thigh) * 0.55;
  const swing = c.reduced ? 0 : Math.sin(t * 2.4);
  return {
    hipsOffset: [0.06 * s, -0.12 - 0.22 * crouch, 0.02],
    rotations: {
      // surf stance: left foot forward, right foot back, both knees bent
      leftUpperLeg: eulerZYX(thigh - 0.18, 0.2, 0.12),
      rightUpperLeg: eulerZYX(thigh + 0.12, -0.25, -0.16),
      leftLowerLeg: eulerZYX(knee, 0, 0),
      rightLowerLeg: eulerZYX(knee + 0.1, 0, 0),
      leftFoot: eulerZYX(ankle, 0, 0),
      rightFoot: eulerZYX(ankle, 0, 0),
      spine: eulerZYX(0.35 + 0.25 * crouch, -0.25 * s, 0.22 * s),
      chest: eulerZYX(0.12, -0.15 * s + 0.06 * swing, 0.12 * s),
      neck: eulerZYX(-0.3, 0.2 * s, 0),
      head: eulerZYX(-0.25, 0.15 * s, -0.08 * s),
      // arms out for balance (character left = +X), see-sawing against the steer and the board's sway
      leftUpperArm: eulerZYX(-0.35 + 0.15 * pump, 0, 0.75 + 0.25 * s + 0.1 * swing),
      rightUpperArm: eulerZYX(-0.35 - 0.15 * pump, 0, -0.75 + 0.25 * s + 0.1 * swing),
      leftLowerArm: eulerZYX(-0.45, 0, 0.25),
      rightLowerArm: eulerZYX(-0.45, 0, -0.25)
    }
  };
}

export function runnerPose(driver: HumanoidDriver, c: RunnerControl): { input: HumanoidPoseInput; pose: HumanoidAnimationPose; feet: Vec3 } {
  const input = runnerInput(c);
  const pos = driver.modelPositions(input);
  const r = driver.map.roles;
  const lf = pos[r.leftFoot ?? ""], rf = pos[r.rightFoot ?? ""];
  const feet: Vec3 = lf && rf ? [(lf[0] + rf[0]) / 2, Math.min(lf[1], rf[1]), (lf[2] + rf[2]) / 2] : [0, 0, 0];
  return { input, pose: driver.pose(input), feet };
}
