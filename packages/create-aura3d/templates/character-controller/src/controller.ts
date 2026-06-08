// Pure kinematic speed model for the character-controller template. Deterministic + testable;
// the browser route feeds this speed into the @aura3d/animation locomotion kit. (The full physics
// capsule path via @aura3d/physics `createFightingCharacterController` is documented in the README.)

export interface CharacterControllerTuning {
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
}

export const defaultCharacterControllerTuning: CharacterControllerTuning = {
  walkSpeed: 1.6,
  runSpeed: 4.4,
  acceleration: 12,
  deceleration: 16
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
