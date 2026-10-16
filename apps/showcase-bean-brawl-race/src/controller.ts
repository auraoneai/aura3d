// Pure kinematic speed + obstacle gauntlet simulation for Bean Brawl Race.
// Deterministic + testable; the browser route feeds speed into @aura3d/animation
// createLocomotionKit and drives the 4 rigged bean humanoids through their
// inspected embedded clips ("Idle", "Walk", "Run", "Jump", "Fall", "Celebrate").

export type BeanClipName = "Idle" | "Walk" | "Run" | "Jump" | "Fall" | "Celebrate";

export interface CharacterControllerTuning {
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly jumpVelocity: number;
  readonly bounceVelocity: number;
  readonly gravity: number;
  readonly laneHalfWidth: number;
  readonly finishZ: number;
}

export const defaultCharacterControllerTuning: CharacterControllerTuning = {
  walkSpeed: 3.4,
  runSpeed: 6.4,
  acceleration: 18,
  deceleration: 22,
  jumpVelocity: 6.8,
  bounceVelocity: 8.8,
  gravity: 17.5,
  laneHalfWidth: 3.7,
  finishZ: 56
};

export interface CharacterMoveInput {
  /** A direction key is held. */
  readonly move: boolean;
  /** The run modifier is held. */
  readonly run: boolean;
}

export interface CharacterControllerState {
  readonly speed: number;
}

/** Advance toward the target speed (walk/run/stop) with accel/decel. Pure + deterministic. */
export function stepCharacterSpeed(
  state: CharacterControllerState,
  input: CharacterMoveInput,
  dt: number,
  tuning: CharacterControllerTuning = defaultCharacterControllerTuning
): CharacterControllerState {
  const target = input.move ? (input.run ? tuning.runSpeed : tuning.walkSpeed) : 0;
  const rate = target > state.speed ? tuning.acceleration : tuning.deceleration;
  const step = Math.max(0, rate) * Math.max(0, dt);
  let speed = state.speed;
  if (Math.abs(target - speed) <= step) speed = target;
  else speed += Math.sign(target - speed) * step;
  return { speed: Math.max(0, speed) };
}

export const CHECKPOINT_Z_THRESHOLDS = [0, 10, 23, 40] as const;

export const STAGE_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Stage 1: Sweeper Alley",
  2: "Stage 2: Turntable Crossing",
  3: "Stage 3: Pendulum Gauntlet",
  4: "Stage 4: Crown Summit"
};

export function resolveCheckpointStage(z: number): 1 | 2 | 3 | 4 {
  if (z >= 40) return 4;
  if (z >= 23) return 3;
  if (z >= 10) return 2;
  return 1;
}

export function resolveCheckpointRespawnZ(stage: 1 | 2 | 3 | 4): number {
  return CHECKPOINT_Z_THRESHOLDS[stage - 1] ?? 0;
}

export function resolveCourseProgressPct(z: number, finishZ: number = defaultCharacterControllerTuning.finishZ): number {
  const clamped = Math.max(0, Math.min(finishZ, z));
  return Number(((clamped / finishZ) * 100).toFixed(1));
}

export interface SweeperHazardSpec {
  readonly id: string;
  readonly z: number;
  readonly radius: number;
  readonly angularVelocity: number;
  readonly initialAngle: number;
  readonly barHeight: number;
}

export interface TurntableHazardSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly angularVelocity: number;
  readonly driftStrength: number;
}

export interface BouncePadSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface PendulumHazardSpec {
  readonly id: string;
  readonly z: number;
  readonly swingAmplitudeX: number;
  readonly frequency: number;
  readonly phase: number;
}

export const COURSE_SWEEPERS: readonly SweeperHazardSpec[] = [
  { id: "sweeper-1", z: 11.5, radius: 3.1, angularVelocity: 2.15, initialAngle: 0.4, barHeight: 0.52 },
  { id: "sweeper-2", z: 18.0, radius: 3.1, angularVelocity: -2.55, initialAngle: 1.9, barHeight: 0.52 }
];

export const COURSE_TURNTABLES: readonly TurntableHazardSpec[] = [
  { id: "turntable-1", x: 0, z: 26.5, radius: 2.35, angularVelocity: 1.9, driftStrength: 2.35 },
  { id: "turntable-2", x: 0, z: 34.5, radius: 2.35, angularVelocity: -2.2, driftStrength: -2.55 }
];

export const COURSE_BOUNCE_PADS: readonly BouncePadSpec[] = [
  { id: "bounce-1", x: -1.65, z: 23.2, radius: 1.05 },
  { id: "bounce-2", x: 1.65, z: 30.5, radius: 1.05 },
  { id: "bounce-3", x: 0, z: 38.2, radius: 1.05 }
];

export const COURSE_PENDULUMS: readonly PendulumHazardSpec[] = [
  { id: "pendulum-1", z: 43.5, swingAmplitudeX: 1.95, frequency: 2.35, phase: 0 },
  { id: "pendulum-2", z: 49.0, swingAmplitudeX: 1.95, frequency: 2.65, phase: Math.PI }
];

export function resolveBeanAnimationClip(options: {
  readonly qualified: boolean;
  readonly knockdownTimer: number;
  readonly grounded: boolean;
  readonly locomotionState: "idle" | "walk" | "run";
}): BeanClipName {
  if (options.qualified) return "Celebrate";
  if (options.knockdownTimer > 0) return "Fall";
  if (!options.grounded) return "Jump";
  if (options.locomotionState === "run") return "Run";
  if (options.locomotionState === "walk") return "Walk";
  return "Idle";
}
