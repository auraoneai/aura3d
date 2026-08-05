/**
 * Grip-limited speed profile along a closed racing line.
 *
 * ## The gap this closes
 *
 * WS-3.8 was attempted twice and reverted twice. Both attempts swapped the racing kit's
 * kinematic `heading += steer * steerRate * dt` for the WS-3.3 force model, and both times the
 * car could not lap its own certified circuit. The diagnosis recorded in the PRD was that a
 * certified route encodes a *kinematic* contract, so moving to forces invalidates its lap time.
 *
 * That diagnosis was one step short. The actual defect is narrower and fixable: the route's
 * speed model is `routeLength / authoredLapSeconds`, a **single constant speed for the whole
 * lap**. A kinematic car can hold a constant speed through any corner, because its heading is
 * an input rather than a consequence. A real car cannot — cornering at speed `v` through radius
 * `r` demands lateral acceleration `v^2 / r`, and no tyre supplies an unbounded amount.
 *
 * On Aura3D's own certified circuit the two contracts are irreconcilable *as stated*: the
 * tightest corner has radius 0.77 units, and holding the certified 4x pace of 4.312 u/s through
 * it demands 24.15 u/s^2. That is why every previous attempt failed at the same corner, and why
 * no steering gain or sign convention rescued it — the request was geometrically impossible, so
 * the controller was never the problem.
 *
 * A real driver does not hold one speed. They brake for the corner, hold the grip limit through
 * the apex, and accelerate out. Once the target is a *profile* rather than a constant, the same
 * circuit is comfortably drivable: at a physical 0.41 g the lap comes out at 11.29 s against
 * 4.312 u/s of straight-line speed, versus the 24.15 u/s^2 a constant-speed lap demanded. The
 * certified average speed is preserved as what it always physically meant — a lap average — and
 * the force model then has a target it can actually track.
 *
 * ## What this module is
 *
 * The standard two-pass forward/backward solve used by every real racing-line generator:
 *
 * 1. **Cornering limit.** At each station, `v <= sqrt(lateralLimit * radius)`, the fastest speed
 *    the tyre can hold through that radius. Straights are bounded by `maxSpeed` instead.
 * 2. **Forward pass.** Acceleration is finite, so a station's speed is also bounded by how fast
 *    the car could have got there from the previous one: `v[i+1]^2 <= v[i]^2 + 2*a*ds`.
 * 3. **Backward pass.** Braking is finite, so a station's speed is bounded by the need to be
 *    slow enough for what is coming: `v[i]^2 <= v[i+1]^2 + 2*b*ds`.
 *
 * Passes 2 and 3 are interdependent — braking earlier changes what you can accelerate from — so
 * they are iterated to a fixed point rather than run once. On a closed loop this matters more
 * than on an open one: the profile must also join up with itself at the start/finish line.
 *
 * ## Why it lives in `packages/physics`
 *
 * It is a property of a path and a friction limit, not of any route, genre kit or app. Nothing
 * here knows what a checkpoint is. The racing kit consumes it; so could a traffic simulation, an
 * AI overtaking line, a camera dolly, or a drone following a spline.
 */

export interface RacingLineStation {
  /** Distance along the line from the start, in world units. */
  readonly distance: number;
  /**
   * Unsigned radius of curvature at this station, world units.
   *
   * Signed curvature is what a controller wants for steering direction; a speed limit only cares
   * how tight the corner is, not which way it goes. Use `Math.abs(1 / curvature)`, or
   * `Number.POSITIVE_INFINITY` for a straight.
   */
  readonly radius: number;
}

export interface RacingLineProfileSpec {
  /** Stations in increasing distance order. At least two. */
  readonly stations: readonly RacingLineStation[];
  /** Total path length. On a closed loop this includes the closing segment back to station 0. */
  readonly length: number;
  /**
   * Lateral acceleration the tyres can sustain, world units per second squared.
   *
   * This is the grip limit, and it is the number that sets corner speeds. For a vehicle running
   * `createVehicleMotion`, it is `grip * tyrePeakFriction * gravity` in the same units the route
   * is authored in.
   */
  readonly lateralLimit: number;
  /** Longitudinal acceleration available on exit, world units per second squared. */
  readonly acceleration: number;
  /** Braking deceleration available on entry, world units per second squared. Positive. */
  readonly braking: number;
  /** Straight-line speed ceiling, world units per second. */
  readonly maxSpeed: number;
  /** True when the last station connects back to the first. Defaults to `true`. */
  readonly closed?: boolean | undefined;
  /**
   * Lowest speed the profile may demand, so a hairpin tighter than the grip limit can hold does
   * not resolve to a dead stop the car can never leave. Defaults to 5% of `maxSpeed`.
   */
  readonly minSpeed?: number | undefined;
}

export interface RacingLineProfile {
  readonly kind: "aura-racing-line-profile";
  /** Target speed at each station, index-aligned with the input stations. */
  readonly speeds: readonly number[];
  /** Lap time implied by the profile, seconds. */
  readonly lapSeconds: number;
  /** Distance-weighted mean speed, which is `length / lapSeconds`. */
  readonly averageSpeed: number;
  readonly minSpeed: number;
  readonly maxSpeed: number;
  /**
   * Target speed at an arbitrary distance along the line, interpolated between stations.
   *
   * This is what a driver model calls each frame: it has a distance from the route's progress and
   * needs to know what speed to be doing, without caring where the stations happen to sit.
   */
  speedAt(distance: number): number;
  /**
   * The lateral acceleration the profile demands at its tightest point.
   *
   * Exposed because it is the number that proves the profile is inside the vehicle's capability.
   * A caller can assert it against the tyre's actual limit rather than assuming the solve worked.
   */
  readonly peakLateralDemand: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createRacingLineProfile(spec: RacingLineProfileSpec): RacingLineProfile {
  const stations = spec.stations;
  if (stations.length < 2) {
    throw new Error("createRacingLineProfile requires at least 2 stations.");
  }
  const closed = spec.closed !== false;
  const length = finitePositive(spec.length, 1);
  const lateralLimit = finitePositive(spec.lateralLimit, 8);
  const acceleration = finitePositive(spec.acceleration, 4);
  const braking = finitePositive(spec.braking, 6);
  const maxSpeed = finitePositive(spec.maxSpeed, 10);
  const minSpeed = Math.min(maxSpeed, finitePositive(spec.minSpeed ?? maxSpeed * 0.05, maxSpeed * 0.05));

  const count = stations.length;
  /*
   * Segment length *out of* station i. On a closed loop the final segment wraps to station 0
   * using the declared total length, which is why `length` is a required input rather than
   * something derived: the closing segment is not represented by any pair of stations.
   */
  const segment = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    const here = stations[index].distance;
    const next = index + 1 < count ? stations[index + 1].distance : length;
    segment[index] = Math.max(1e-6, next - here);
  }

  // Pass 1: the cornering limit at each station.
  const speeds = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    const radius = stations[index].radius;
    const corner = Number.isFinite(radius) && radius > 0 ? Math.sqrt(lateralLimit * radius) : maxSpeed;
    speeds[index] = Math.max(minSpeed, Math.min(maxSpeed, corner));
  }

  /*
   * Passes 2 and 3 to a fixed point.
   *
   * A single forward pass then a single backward pass is correct only for an open path. On a
   * closed loop each pass changes the boundary condition the other one started from, so they are
   * repeated until nothing moves. The iteration is monotonically decreasing and bounded below by
   * `minSpeed`, so it converges; the cap and the epsilon are there to bound the work, not to
   * decide the answer.
   */
  for (let iteration = 0; iteration < 64; iteration += 1) {
    let changed = false;
    // Forward: limited by acceleration out of the previous station.
    const forwardLast = closed ? count : count - 1;
    for (let index = 0; index < forwardLast; index += 1) {
      const next = (index + 1) % count;
      const bound = Math.sqrt(speeds[index] * speeds[index] + 2 * acceleration * segment[index]);
      if (bound < speeds[next] - 1e-9) {
        speeds[next] = Math.max(minSpeed, bound);
        changed = true;
      }
    }
    // Backward: limited by the need to brake for the next station.
    for (let index = forwardLast - 1; index >= 0; index -= 1) {
      const next = (index + 1) % count;
      const bound = Math.sqrt(speeds[next] * speeds[next] + 2 * braking * segment[index]);
      if (bound < speeds[index] - 1e-9) {
        speeds[index] = Math.max(minSpeed, bound);
        changed = true;
      }
    }
    if (!changed) break;
  }

  /*
   * Lap time from the profile.
   *
   * Using the mean of the two endpoint speeds over each segment is the trapezoidal rule, which is
   * exact for the constant-acceleration segments this solve produces and avoids the systematic
   * underestimate that taking the entry speed alone would give.
   */
  let lapSeconds = 0;
  const segmentCount = closed ? count : count - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % count;
    const mean = Math.max(1e-6, (speeds[index] + speeds[next]) / 2);
    lapSeconds += segment[index] / mean;
  }

  let peakLateralDemand = 0;
  for (let index = 0; index < count; index += 1) {
    const radius = stations[index].radius;
    if (Number.isFinite(radius) && radius > 0) {
      peakLateralDemand = Math.max(peakLateralDemand, (speeds[index] * speeds[index]) / radius);
    }
  }

  const observedMin = Math.min(...speeds);
  const observedMax = Math.max(...speeds);

  function speedAt(distance: number): number {
    if (!Number.isFinite(distance)) return observedMin;
    let along = closed ? ((distance % length) + length) % length : Math.max(0, Math.min(length, distance));
    // Locate the segment containing `along`. Stations are sorted, so a scan is adequate at the
    // station counts a hand- or asset-authored route produces.
    let index = 0;
    for (let probe = 0; probe < count; probe += 1) {
      const here = stations[probe].distance;
      const next = probe + 1 < count ? stations[probe + 1].distance : length;
      if (along >= here && along < next) {
        index = probe;
        break;
      }
      if (probe === count - 1) index = probe;
    }
    const here = stations[index].distance;
    const t = Math.max(0, Math.min(1, (along - here) / segment[index]));
    const next = (index + 1) % count;
    /*
     * Interpolating `v^2` rather than `v` is what makes this consistent with the solve: between
     * two stations the car is under constant acceleration, so `v^2` is linear in distance and `v`
     * is not. Lerping `v` directly would report speeds the profile never actually demanded.
     */
    const a = speeds[index] * speeds[index];
    const b = speeds[next] * speeds[next];
    return Math.sqrt(Math.max(0, a + (b - a) * t));
  }

  return {
    kind: "aura-racing-line-profile",
    speeds,
    lapSeconds,
    averageSpeed: length / Math.max(1e-6, lapSeconds),
    minSpeed: observedMin,
    maxSpeed: observedMax,
    speedAt,
    peakLateralDemand
  };
}
