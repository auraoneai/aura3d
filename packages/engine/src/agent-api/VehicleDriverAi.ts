/**
 * Reusable AI driving: racing line, look-ahead steering, curvature-based speed.
 *
 * ## The defect this replaces
 *
 * Turbo's opponent was a route-local controller that steered only to null its
 * lateral offset from the racing line:
 *
 * ```ts
 * const steeringCorrection = -snapshot.signedTrackOffset * steeringGain;
 * ```
 *
 * A pure proportional term on present error has no notion of where the track goes
 * next. Approaching a corner it steers straight until it is already off the line,
 * then over-corrects, which is why the opponent read as moving sideways and leaving
 * the circuit. It also had no braking model tied to the corner ahead, so it entered
 * every turn at cruise speed and understeered out of it. And because the kit's
 * off-track handler pulls a certified car back toward the centreline, the recovery
 * looked like the car being dragged rather than driving.
 *
 * This module drives the way a driver does: it samples the route **ahead** of the
 * car, aims at a look-ahead point on the racing line, and sets a target speed from
 * the curvature it is about to meet. It also detects being stuck and being off
 * track, and recovers deliberately.
 *
 * Pure and deterministic: given the same route and the same seed it produces the
 * same lap, so a race is reproducible and testable.
 */

export interface DriverRoutePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Route the driver follows.
 *
 * Supplied by the caller from its own track topology, so the driver has no
 * knowledge of any particular circuit.
 */
export interface DriverRoute {
  /** Sample the racing line at a normalized progress 0..1. */
  sample(progress: number): { readonly x: number; readonly y: number; readonly heading: number };
  /** Half-width of the drivable road at a progress. */
  halfWidth(progress: number): number;
  /** Total route length in world units, used to convert look-ahead distance to progress. */
  readonly length: number;
}

export interface DriverVehicleState {
  readonly progress: number;
  readonly speed: number;
  readonly heading: number;
  /** Lateral offset from the racing line, signed positive to the left of travel. */
  readonly signedTrackOffset: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly offTrack: boolean;
  /** Signed racing-line offset the driver should hold, in game units. */
  readonly preferredSignedOffset?: number;
}

export interface DriverInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly drift: boolean;
}

export type DriverAggression = "cautious" | "balanced" | "aggressive";

export interface DriverConfig {
  readonly maxSpeed: number;
  /** Fraction of `maxSpeed` targeted on a straight. */
  readonly paceFraction?: number | undefined;
  /**
   * Look-ahead time in seconds. The driver aims where it will be this far in the
   * future, which is what lets it turn *before* the corner instead of after it.
   */
  readonly lookAheadSeconds?: number | undefined;
  /** Minimum look-ahead distance so a stationary car still has an aim point. */
  readonly minLookAhead?: number | undefined;
  /** Lateral correction gain. Scaled internally by route width. */
  readonly lineGain?: number | undefined;
  /** Heading correction gain. */
  readonly headingGain?: number | undefined;
  /**
   * Lateral acceleration the driver is willing to carry through a corner, in world
   * units per second squared. This is what sets corner entry speed.
   */
  readonly corneringAcceleration?: number | undefined;
  readonly aggression?: DriverAggression | undefined;
  /** Reaction delay in seconds. A human driver is not instantaneous. */
  readonly reactionSeconds?: number | undefined;
  /** Deterministic seed for line variation. */
  readonly seed?: number | undefined;
}

export interface DriverTelemetry {
  readonly controller: "aura-vehicle-driver-ai";
  readonly aggression: DriverAggression;
  readonly targetSpeed: number;
  readonly lookAheadDistance: number;
  readonly upcomingCurvature: number;
  readonly cornerSpeedLimit: number;
  readonly steerFromLine: number;
  readonly steerFromHeading: number;
  readonly recovering: boolean;
  readonly stuckSeconds: number;
  readonly decisionCount: number;
  readonly input: DriverInput;
}

export interface VehicleDriverAi {
  readonly kind: "aura-vehicle-driver-ai";
  /** Decide inputs for the coming step. */
  decide(dt: number, state: DriverVehicleState): DriverInput;
  telemetry(): DriverTelemetry;
  reset(): void;
}

const AGGRESSION_PROFILES: Record<DriverAggression, {
  readonly paceScale: number;
  readonly cornerScale: number;
  readonly lineVariation: number;
  readonly reactionScale: number;
}> = {
  cautious: { paceScale: 0.82, cornerScale: 0.82, lineVariation: 0.05, reactionScale: 1.4 },
  balanced: { paceScale: 0.92, cornerScale: 0.94, lineVariation: 0.1, reactionScale: 1 },
  aggressive: { paceScale: 1, cornerScale: 1.06, lineVariation: 0.16, reactionScale: 0.7 }
};

/**
 * Create a deterministic AI driver for a route.
 */
export function createVehicleDriverAi(route: DriverRoute, config: DriverConfig): VehicleDriverAi {
  /*
   * A non-finite or non-positive route length makes every look-ahead progress NaN and
   * the driver produces NaN steering, which reaches the renderer as an undefined
   * position rather than as a visible error. Fail loudly at construction instead: a
   * caller passing a route with no measurable length has a bug in its route adapter,
   * and silently substituting 1 would hide it behind plausible-looking driving.
   */
  if (!Number.isFinite(route.length) || route.length <= 0) {
    throw new Error(
      `createVehicleDriverAi requires a positive, finite route length; received ${String(route.length)}. Suggested fix: measure the racing-line polyline length and pass it as DriverRoute.length.`
    );
  }
  const aggression = config.aggression ?? "balanced";
  const profile = AGGRESSION_PROFILES[aggression];
  const maxSpeed = Math.max(0.01, config.maxSpeed);
  const paceFraction = clamp(config.paceFraction ?? 0.92, 0.2, 1) * profile.paceScale;
  const lookAheadSeconds = Math.max(0.1, config.lookAheadSeconds ?? 1.1);
  const minLookAhead = Math.max(0.1, config.minLookAhead ?? Math.max(1, route.length * 0.01));
  const lineGain = Math.max(0, config.lineGain ?? 1.6);
  const headingGain = Math.max(0, config.headingGain ?? 1.5);
  const corneringAcceleration = Math.max(0.5, config.corneringAcceleration ?? 9) * profile.cornerScale;
  const reactionSeconds = Math.max(0, (config.reactionSeconds ?? 0.14) * profile.reactionScale);

  let elapsed = 0;
  let sinceDecision = 0;
  let held: DriverInput = { throttle: 0, brake: 0, steer: 0, drift: false };
  let decisionCount = 0;
  let stuckSeconds = 0;
  let recovering = false;
  let telemetry: DriverTelemetry = {
    controller: "aura-vehicle-driver-ai",
    aggression,
    targetSpeed: maxSpeed * paceFraction,
    lookAheadDistance: minLookAhead,
    upcomingCurvature: 0,
    cornerSpeedLimit: maxSpeed,
    steerFromLine: 0,
    steerFromHeading: 0,
    recovering: false,
    stuckSeconds: 0,
    decisionCount: 0,
    input: held
  };
  // Deterministic line variation, so two identical races produce identical laps.
  let random = (config.seed ?? 1) >>> 0 || 1;
  const nextRandom = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return ((random >>> 0) / 0xffffffff) * 2 - 1;
  };

  /**
   * Curvature of the racing line over the next `distance` units.
   *
   * Measured as heading change per unit distance across three samples, which is
   * enough to distinguish a straight from a hairpin without differentiating a
   * spline the route may not expose.
   */
  const curvatureAhead = (progress: number, distance: number): number => {
    const span = distance / Math.max(1e-6, route.length);
    const a = route.sample(wrap(progress));
    const b = route.sample(wrap(progress + span * 0.5));
    const c = route.sample(wrap(progress + span));
    const turn = Math.abs(angleDelta(b.heading, a.heading)) + Math.abs(angleDelta(c.heading, b.heading));
    return turn / Math.max(1e-6, distance);
  };

  const decide = (state: DriverVehicleState): DriverInput => {
    const speed = Math.abs(state.speed);
    // Look-ahead distance grows with speed: at pace the driver plans further out.
    const lookAheadDistance = Math.max(minLookAhead, speed * lookAheadSeconds);
    const lookAheadProgress = wrap(state.progress + lookAheadDistance / Math.max(1e-6, route.length));
    const aim = route.sample(lookAheadProgress);
    const halfWidth = Math.max(1e-6, route.halfWidth(state.progress));

    // Steering has two terms. Heading error aims the car at the look-ahead point,
    // which is what makes it turn into a corner. Lateral error brings it back to
    // the line. A controller with only the second term steers straight at a corner
    // until it has already left the road -- the defect this replaces.
    const bearingToAim = Math.atan2(aim.y - state.position.y, aim.x - state.position.x);
    const headingError = angleDelta(bearingToAim, state.heading);
    const steerFromHeading = clamp(headingError * headingGain, -1, 1);
    // Lateral error normalized by road width, so a gain tuned on a wide circuit
    // does not under-correct on a narrow one.
    const lineError = state.signedTrackOffset - (state.preferredSignedOffset ?? 0);
    const steerFromLine = clamp((-lineError / halfWidth) * lineGain, -1, 1);

    // Racing-line variation keeps two AI cars from tracing the same path, and is
    // deterministic so it does not make a race unreproducible.
    const variation = Math.sin(elapsed * 0.74) * profile.lineVariation + nextRandom() * profile.lineVariation * 0.1;

    // Corner speed from the curvature ahead: v = sqrt(a_lat / kappa).
    const curvature = curvatureAhead(state.progress, lookAheadDistance);
    const cornerSpeedLimit = curvature > 1e-4
      ? Math.min(maxSpeed, Math.sqrt(corneringAcceleration / curvature))
      : maxSpeed;
    let targetSpeed = Math.min(maxSpeed * paceFraction, cornerSpeedLimit);

    // Stuck and off-track recovery. A driver that has stopped moving is not
    // "cruising slowly", it is stuck, and must be handled explicitly rather than
    // relying on a kit to teleport it back to the centreline.
    if (state.offTrack || stuckSeconds > 1.2) {
      recovering = true;
    } else if (!state.offTrack && speed > maxSpeed * 0.18 && stuckSeconds === 0) {
      recovering = false;
    }
    if (recovering) {
      // Slow to a controllable speed and steer hard back toward the line.
      targetSpeed = Math.min(targetSpeed, maxSpeed * 0.34);
    }

    const steer = clamp(
      recovering
        ? steerFromLine * 1.4 + steerFromHeading * 0.6
        : steerFromHeading + steerFromLine * 0.55 + variation,
      -1,
      1
    );

    // Throttle and brake from the speed error. Braking is proportional to the
    // overspeed, so entering a corner too fast produces real braking rather than a
    // binary coast.
    const speedError = targetSpeed - speed;
    const throttle = speedError > 0 ? clamp(speedError / Math.max(1e-6, maxSpeed * 0.25), 0, 1) : 0;
    const brake = speedError < 0 ? clamp(-speedError / Math.max(1e-6, maxSpeed * 0.3), 0, 1) : 0;
    // Drift only when genuinely cornering hard at speed; a stationary car
    // handbraking is the kind of detail that makes a demo read as fake.
    const drift = !recovering && Math.abs(steer) > 0.55 && speed > maxSpeed * 0.45;

    telemetry = {
      controller: "aura-vehicle-driver-ai",
      aggression,
      targetSpeed: round(targetSpeed),
      lookAheadDistance: round(lookAheadDistance),
      upcomingCurvature: round(curvature),
      cornerSpeedLimit: round(cornerSpeedLimit),
      steerFromLine: round(steerFromLine),
      steerFromHeading: round(steerFromHeading),
      recovering,
      stuckSeconds: round(stuckSeconds),
      decisionCount,
      input: { throttle: round(throttle), brake: round(brake), steer: round(steer), drift }
    };
    return telemetry.input;
  };

  return {
    kind: "aura-vehicle-driver-ai",
    decide(dt, state) {
      const step = Math.max(0, Math.min(0.1, dt));
      elapsed += step;
      sinceDecision += step;
      // A stopped car accumulates stuck time; moving clears it.
      stuckSeconds = Math.abs(state.speed) < maxSpeed * 0.05 ? stuckSeconds + step : 0;
      // Reaction delay: hold the previous decision until the driver would react.
      if (sinceDecision < reactionSeconds && decisionCount > 0) return held;
      sinceDecision = 0;
      decisionCount += 1;
      held = decide(state);
      return held;
    },
    telemetry() {
      return telemetry;
    },
    reset() {
      elapsed = 0;
      sinceDecision = 0;
      decisionCount = 0;
      stuckSeconds = 0;
      recovering = false;
      held = { throttle: 0, brake: 0, steer: 0, drift: false };
      random = (config.seed ?? 1) >>> 0 || 1;
    }
  };
}

/** Smallest signed angle from `b` to `a`, in -pi..pi. */
export function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function wrap(progress: number): number {
  const value = progress % 1;
  return value < 0 ? value + 1 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
