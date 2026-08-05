/**
 * Turns a path plus a speed target into steering, throttle and brake for `createVehicleMotion`.
 *
 * ## Why this exists
 *
 * The library shipped the two hard halves of AI driving — `createVehicleMotion` for the tyre and
 * yaw dynamics, `createRacingLineProfile` for the speed a corner can be taken at — and nothing to
 * join them. Every racing route therefore hand-rolled its own driver, and hand-rolled drivers all
 * fail the same way. The obvious formulation, a Stanley controller that steers on
 * `headingError + atan2(crossTrack, speed)`, is stable on gentle curves and diverges on a hairpin:
 *
 * 1. Heading error grows faster than the car can rotate, so the steering command saturates.
 * 2. Saturated at full lock, the controller has no authority left and the car runs wide.
 * 3. Once outside the road the nearest point on the path stops advancing, so `progress` latches.
 *    A latched progress freezes the speed target and the curvature feedforward.
 * 4. The now-constant cross-track term flips sign every frame as the car crosses the path
 *    centreline, and the car saws away from the track at full lock — measured on the certified
 *    circuit as progress stuck at 0.2789 for 8,700 consecutive frames while lateral offset grew to
 *    43 units, i.e. 98 road widths from a 0.439-wide road.
 *
 * The failure is not the vehicle's. Held at a fixed speed, the same car corners at radius
 * 0.32-0.55 against a hairpin that demands 0.80, so it has ~40% radius margin. It was the
 * controller throwing that margin away.
 *
 * ## What this does instead
 *
 * Pure pursuit: aim at a point a lookahead distance *along the path* and solve the arc that reaches
 * it. This is bounded by construction — the arc to a point at a known distance has a known
 * curvature, so the command cannot run away the way an unbounded error term can. Three properties
 * matter for the hairpin case:
 *
 * - **Lookahead scales with speed** (`lookaheadTime * speed`, clamped to `[minLookahead,
 *   maxLookahead]`). Time-based lookahead means the car looks a fixed duration ahead rather than a
 *   fixed distance, which is what makes one gain work at both 2 and 12 units/second.
 * - **The target is measured along arc length, not straight-line distance.** On a hairpin the point
 *   0.8 units ahead along the road is nearly behind the car in a straight line; chord-based
 *   lookahead skips the corner entirely and cuts to the exit.
 * - **Progress advances monotonically** from the driver's own integrated distance, so being off the
 *   road cannot latch it. This is the direct fix for failure 3 above: the driver keeps a running
 *   distance and only accepts a measured progress that is ahead of it, within a rejoin window.
 *
 * Speed control is a PI-free proportional law with an explicit brake/throttle split, because a
 * single signed axis fed to a vehicle that has separate `driveForce` and `brakeForce` produces
 * asymmetric response that reads as the car refusing to slow for corners.
 *
 * The driver is pure and allocation-free per step: no `three`, no renderer, no route names, no
 * game-specific branch. Any path that can answer "where am I along you" and "what is your point at
 * distance d" can be driven, which is why the input is two callbacks rather than a route type.
 */

export interface PathFollowSample {
  /** Path point at the requested distance. */
  readonly x: number;
  readonly y: number;
  /** Tangent heading at that point, radians, atan2(dy, dx) convention. */
  readonly heading: number;
  /** Signed curvature at that point, 1/radius. Positive turns left. */
  readonly curvature: number;
}

export interface PathFollowContact {
  /** Distance along the path of the closest point to the car. */
  readonly distance: number;
  /** Signed lateral offset of the car from the path, positive to the left of travel. */
  readonly signedOffset: number;
}

export interface PathFollowDriverOptions {
  /** Total path length in world units. */
  readonly length: number;
  /** True when the path loops. Defaults to true. */
  readonly closed?: boolean | undefined;
  /** Path point at an absolute distance along the path. Must handle wrap on a closed path. */
  sampleAt(distance: number): PathFollowSample;
  /** Closest point on the path to a world position. */
  contactAt(x: number, y: number): PathFollowContact;
  /** Target speed at a distance along the path, world units per second. */
  speedAt(distance: number): number;
  /** Vehicle wheelbase, world units. Sets how much steer angle a given arc needs. */
  readonly wheelbase: number;
  /** Vehicle maximum steer angle, radians, matching `createVehicleMotion`. */
  readonly maxSteerAngle: number;
  /**
   * Seconds of travel to look ahead. Larger is smoother and cuts corners more; smaller tracks the
   * line tighter and saturates sooner.
   *
   * The default is measured, not guessed. Swept over the certified circuit at 5,400 frames per
   * cell, off-track time is dominated by this parameter and barely moves with grip margin, which is
   * what identifies the original failure as tracking geometry rather than tyre grip:
   *
   * ```text
   * lookaheadTime   0.12   0.18   0.25   0.30   0.35   0.45   0.55   0.70   0.90
   * off-track %      5.4    4.3    3.3    3.5    5.4   12.8   20.3   33.6   44.0
   * saturated %      8.5    5.0    3.2    1.4    0.7    1.7    4.6    5.4    4.7
   * ```
   *
   * 0.25 is the minimum. Below it the car tracks so tightly that it saturates on corner entry
   * (8.5% of frames at full lock); above it the aim point cuts inside the apex and the car runs
   * wide. Full sweep in `tests/unit/physics/racing-line-profile.test.ts`.
   */
  readonly lookaheadTime?: number | undefined;
  /** Lookahead floor, world units, so a stopped car still has a target. */
  readonly minLookahead?: number | undefined;
  /** Lookahead ceiling, world units, so a fast straight does not aim past the next corner. */
  readonly maxLookahead?: number | undefined;
  /**
   * Extra steer per unit of lateral offset, used only to close a standing offset that pure pursuit
   * alone converges on slowly. Applied through `atan2` against speed so it fades as speed rises.
   *
   * 2.5 measured best on the certified circuit (3.3% off-track versus 4.2% at 0.6), and unlike a
   * Stanley cross-track gain it cannot destabilise the loop on its own because the `atan2` bounds
   * its contribution to under a quarter turn regardless of how large the offset grows.
   */
  readonly crossTrackGain?: number | undefined;
  /** Throttle/brake proportional gain on speed error, per world unit per second. */
  readonly speedGain?: number | undefined;
  /**
   * How far ahead of the car the speed target is read, in seconds of travel. Braking has to start
   * before the corner, so a driver that reads the target at its own position always enters too
   * fast. Defaults to 0.35.
   */
  readonly speedPreviewTime?: number | undefined;
  /**
   * How far the measured progress may sit behind the driver's integrated distance before the driver
   * accepts it as a genuine rejoin rather than a stale nearest-point match. World units.
   * Defaults to 8% of `length`.
   */
  readonly rejoinWindow?: number | undefined;
}

export interface PathFollowCommand {
  /** 0..1, feed straight to `VehicleMotion.step`. */
  readonly throttle: number;
  /** 0..1. */
  readonly brake: number;
  /** -1..1. */
  readonly steer: number;
  /** Distance along the path the driver believes it is at. Monotonic on a closed path. */
  readonly distance: number;
  /** Progress 0..1 derived from `distance`. */
  readonly progress: number;
  /** Signed lateral offset used for this command. */
  readonly signedOffset: number;
  /** Speed the driver is currently asking for. */
  readonly targetSpeed: number;
  /** Lookahead distance used, world units. Exposed for tuning and for tests. */
  readonly lookahead: number;
  /** True while the steering command is at full lock, which means the driver is out of authority. */
  readonly saturated: boolean;
}

export interface PathFollowDriver {
  readonly kind: "aura-path-follow-driver";
  /** Compute the command for the current vehicle state. Does not mutate the vehicle. */
  step(state: { readonly x: number; readonly z: number; readonly heading: number; readonly speed: number }): PathFollowCommand;
  /** Reset the integrated distance, e.g. after placing the car on the grid. */
  reset(distance?: number): void;
  /** Laps completed since reset, counted from monotonic distance rather than progress wrap. */
  readonly lapsCompleted: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function createPathFollowDriver(options: PathFollowDriverOptions): PathFollowDriver {
  const length = options.length;
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`createPathFollowDriver requires a positive length, received ${String(options.length)}`);
  }
  const closed = options.closed !== false;
  const wheelbase = Math.max(1e-4, options.wheelbase);
  const maxSteerAngle = Math.max(1e-4, options.maxSteerAngle);
  const lookaheadTime = options.lookaheadTime ?? 0.25;
  const minLookahead = options.minLookahead ?? Math.max(wheelbase * 0.7, length / 160);
  const maxLookahead = Math.max(minLookahead, options.maxLookahead ?? length / 8);
  const crossTrackGain = options.crossTrackGain ?? 2.5;
  const speedGain = options.speedGain ?? 2;
  const speedPreviewTime = options.speedPreviewTime ?? 0.35;
  const rejoinWindow = options.rejoinWindow ?? length * 0.08;

  let travelled = 0;
  let laps = 0;

  function advance(measured: number): number {
    if (!closed) {
      travelled = Math.max(travelled, measured);
      return travelled;
    }
    /*
     * `measured` is a nearest-point match on a wrapped path, so it can legitimately jump backwards
     * across the start line. Compare in the wrapped frame and only accept forward motion, or a
     * backward step small enough to be a genuine correction rather than a stale match from the far
     * side of the circuit.
     */
    const currentWrapped = ((travelled % length) + length) % length;
    let delta = measured - currentWrapped;
    if (delta > length / 2) delta -= length;
    if (delta < -length / 2) delta += length;
    if (delta > 0 || delta > -rejoinWindow) {
      travelled += delta;
      const nextLaps = Math.floor(travelled / length);
      if (nextLaps > laps) laps = nextLaps;
    }
    return travelled;
  }

  return {
    kind: "aura-path-follow-driver",
    get lapsCompleted() {
      return laps;
    },
    reset(distance = 0) {
      travelled = distance;
      laps = 0;
    },
    step(state) {
      const contact = options.contactAt(state.x, state.z);
      const distance = advance(contact.distance);
      const speed = Math.max(0, state.speed);

      const lookahead = clamp(lookaheadTime * speed, minLookahead, maxLookahead);
      const aim = options.sampleAt(distance + lookahead);

      /*
       * Pure pursuit: with the aim point expressed in the car's frame, the arc through it has
       * curvature `2 * lateralOffset / chord^2`. Deriving curvature from the geometry rather than
       * from a heading-error gain is what bounds the command: a reachable point yields a reachable
       * arc.
       */
      const dx = aim.x - state.x;
      const dy = aim.y - state.z;
      const cosH = Math.cos(state.heading);
      const sinH = Math.sin(state.heading);
      const forward = dx * cosH + dy * sinH;
      const lateralToAim = -dx * sinH + dy * cosH;
      const chordSquared = dx * dx + dy * dy;
      let curvature = chordSquared > 1e-9 ? (2 * lateralToAim) / chordSquared : 0;
      /*
       * If the aim point is behind the car the arc solution degenerates — it points the car at a
       * target it has already passed and can produce a near-zero command exactly when the car most
       * needs to turn. Fall back to closing the heading error to the path tangent, which always has
       * the right sign.
       */
      if (forward <= 0) {
        curvature = Math.sign(wrapAngle(aim.heading - state.heading) || 1) * (1 / Math.max(1e-4, wheelbase));
      }

      const steerFromArc = Math.atan(wheelbase * curvature);
      const crossTerm = Math.atan2(crossTrackGain * -contact.signedOffset, Math.max(0.5, speed));
      const steer = clamp((steerFromArc + crossTerm) / maxSteerAngle, -1, 1);

      const previewDistance = distance + Math.max(lookahead, speedPreviewTime * speed);
      const targetSpeed = options.speedAt(previewDistance);
      const speedError = targetSpeed - speed;
      const throttle = speedError > 0 ? Math.min(1, speedError * speedGain) : 0;
      const brake = speedError < 0 ? Math.min(1, -speedError * speedGain) : 0;

      return {
        throttle,
        brake,
        steer,
        distance,
        progress: closed ? (((distance / length) % 1) + 1) % 1 : clamp(distance / length, 0, 1),
        signedOffset: contact.signedOffset,
        targetSpeed,
        lookahead,
        saturated: Math.abs(steer) >= 0.999
      };
    }
  };
}
