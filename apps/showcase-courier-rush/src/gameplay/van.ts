/**
 * Courier Rush van - delivery tune over createGameArcadeVehicle + chase camera.
 *
 * The PRD requires a clearly different driving personality from Turbo's racer:
 * a soft-sprung delivery van with slower acceleration, a lower top speed, and
 * heavier turn-in. Every number below is chosen against Turbo's published
 * handling (pace-multiplied certified speed, drag 0.28, steerRate >= 2.7, drift
 * boost) so the README differentiation paragraph states measured differences,
 * not marketing.
 *
 * Pure: importable from Node for tuning tests.
 */
import type { GameArcadeVehicleInput, GameArcadeVehicleState } from "@aura3d/engine";

export const VAN_TUNE = {
  /** Lower top speed than the Turbo racer on purpose: a van, not a Formula car. */
  maxSpeed: 13,
  /** Slower acceleration: about 1.9s to half speed versus the racer's snap. */
  acceleration: 7.2,
  /** Strong brakes - city deliveries stop at docks. */
  brakeStrength: 20,
  reverseSpeed: 4.5,
  /**
   * Heavy drag (versus Turbo's 0.28): release the throttle and the van settles
   * quickly, which is what makes dock approaches forgiving.
   */
  drag: 1.9,
  /**
   * Heavier turn-in than the racer's certified steerRate: more steering wheel
   * for the same corner, no drift-boost assist.
   */
  steerRate: 2.35
} as const;

/** Extra deceleration while the handbrake is held, in units/second^2. */
export const HANDBRAKE_DECELERATION = 9;

export interface VanDriveInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly handbrake: boolean;
}

/**
 * Map raw drive input onto the arcade vehicle input contract. The handbrake is
 * the kit's drifting channel (turn-in widens while drifting), plus an explicit
 * scrub applied by the caller through `handbrakeSpeedMultiplier`.
 */
export function toArcadeVehicleInput(input: VanDriveInput): { readonly input: GameArcadeVehicleInput; readonly handbrake: boolean } {
  return {
    input: {
      throttle: Math.max(0, Math.min(1, input.throttle)),
      brake: Math.max(0, Math.min(1, input.brake)),
      steer: Math.max(-1, Math.min(1, input.steer)),
      drifting: input.handbrake
    },
    handbrake: input.handbrake
  };
}

/**
 * Speed multiplier to feed `vehicle.constrain` after a handbrake step, so the
 * handbrake genuinely scrubs speed instead of only widening the turn.
 */
export function handbrakeSpeedMultiplier(dtSeconds: number): number {
  return Math.max(0, 1 - (HANDBRAKE_DECELERATION * Math.max(0, dtSeconds)) / Math.max(1, VAN_TUNE.maxSpeed));
}

/** World pose derived from an arcade vehicle snapshot (x/z plane, y up). */
export interface VanPose {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly heading: number;
  readonly speed: number;
}

export function vanPoseFromSnapshot(snapshot: GameArcadeVehicleState, groundY = 0): VanPose {
  return { x: snapshot.x, z: snapshot.z, y: groundY, heading: snapshot.heading, speed: snapshot.speed };
}

/**
 * Chase camera tuning, expressed as a mutable offset object the route nudges
 * each frame (the drop look-back blends toward it; reduced motion skips it).
 */
export const CHASE_CAMERA = {
  distance: 5.25,
  height: 3.0,
  lookAhead: 1.8,
  fov: 49,
  smoothing: 0.12
} as const;

/** Look-back blend envelope after a drop, in seconds (reduced motion disables). */
export const DROP_LOOKBACK_SECONDS = 0.9;

export interface ChaseOffset {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
}

/**
 * Chase offset for a look-back blend in 0..1. At full blend the camera swings
 * out beside the van and rises, holding the drop zone in frame briefly before
 * easing home.
 */
export function chaseOffsetForBlend(blend: number, distance: number = CHASE_CAMERA.distance): ChaseOffset {
  const eased = Math.max(0, Math.min(1, blend));
  const side = Math.sin(eased * Math.PI);
  return {
    // The dedicated camera rig uses local -Z as simulation-forward, therefore
    // local +Z is the true trailing eye position.
    offsetX: 0.3 + distance * 0.42 * side,
    offsetY: CHASE_CAMERA.height + 1.5 * side,
    offsetZ: distance + 1.8 * side
  };
}
