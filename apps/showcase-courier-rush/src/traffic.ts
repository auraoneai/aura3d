/**
 * Courier Rush traffic - createVehicleDriverAi cars on authored lane loops.
 *
 * Six to ten AI cars drive closed rectangular loops whose edges are exactly the
 * city kit's street segments, each with a deterministic per-car seed. The
 * reusable driver owns the decisions: its look-ahead/corner-speed model sets
 * target speed and produces throttle/brake, which this module integrates into
 * scalar progress along the loop. Lateral position is lane-locked to a
 * right-hand lane offset (this is city traffic, not a racing line), with a
 * small bounded steer-driven sway so the driver's steering is visible.
 *
 * Courtesy stops: each loop authors one stop window beside a delivery zone.
 * Approaching cars brake, hold for a fixed window (plan-able pauses per the
 * PRD), then resume. When the van is nearby as a car pulls up, the car honks -
 * the audio cue is driven from the returned events, not from timers.
 *
 * Pure and deterministic: same seeds plus same step sequence produce the same
 * lap, verified by unit test.
 */
import { createVehicleDriverAi, type DriverRoute, type VehicleDriverAi } from "@aura3d/engine";
import type { PropCollider } from "./city";

export interface LaneLoopPoint {
  readonly x: number;
  readonly z: number;
}

export interface CourtesyStop {
  /** World-space point where cars halt (on the loop path). */
  readonly x: number;
  readonly z: number;
  /** Distance-ahead threshold that begins the approach braking. */
  readonly approachDistance: number;
  /** Hold duration once stopped, in milliseconds. */
  readonly holdMs: number;
}

export interface LaneLoop {
  readonly id: string;
  readonly points: readonly LaneLoopPoint[];
  /** Right-of-travel lane offset from the segment centerline. */
  readonly laneOffset: number;
  readonly courtesyStop: CourtesyStop;
}

/** World-scale street rectangles; see src/city.ts for the segment table. */
/**
 * Lane loops, kept OFF the main NS/EW roads so courier legs (which run along
 * those mains) never share asphalt with routine traffic. The outer rectangle
 * rings the avenues and cross streets; one compact inner rectangle works the
 * central district's main-road block.
 */
/**
 * Two-way avenue/cross-street loops - the SAME street rectangle traversed in
 * both directions, so opposing traffic passes on distinct lanes. Both loops
 * stay entirely off the main NS/EW roads, leaving those to courier legs.
 */
export const LANE_LOOPS: readonly LaneLoop[] = [
  {
    id: "outer-eastbound",
    points: [
      { x: -20.7, z: -16.2 },
      { x: 15.3, z: -16.2 },
      { x: 15.3, z: 15.3 },
      { x: -20.7, z: 15.3 }
    ],
    laneOffset: 0.45,
    // Halts beside the front-cross docks zone before rolling through.
    courtesyStop: { x: -11, z: -16.2, approachDistance: 6, holdMs: 1500 }
  },
  {
    id: "outer-westbound",
    points: [
      { x: -20.7, z: 15.3 },
      { x: 15.3, z: 15.3 },
      { x: 15.3, z: -16.2 },
      { x: -20.7, z: -16.2 }
    ],
    laneOffset: 0.45,
    // Halts beside the east depot dock on the southbound stretch.
    courtesyStop: { x: 15.3, z: -12, approachDistance: 6, holdMs: 1500 }
  }
];

export const TRAFFIC_CAR_COUNT = 8;
export const TRAFFIC_MAX_SPEED = 7.4;
export const TRAFFIC_ACCELERATION = 5.2;
export const TRAFFIC_BRAKE_STRENGTH = 9;
const TRAFFIC_DRAG = 1.2;
/** Maximum lateral sway from the lane center, in world units. */
const MAX_LANE_SWAY = 0.26;

/** Car loop assignment: 4 per direction (6-10 total per the PRD). */
const CAR_PLAN: readonly { readonly loopIndex: number; readonly variant: "sedan" | "hatch"; readonly seed: number }[] = [
  { loopIndex: 0, variant: "sedan", seed: 101 },
  { loopIndex: 0, variant: "hatch", seed: 202 },
  { loopIndex: 0, variant: "sedan", seed: 303 },
  { loopIndex: 0, variant: "hatch", seed: 404 },
  { loopIndex: 1, variant: "hatch", seed: 606 },
  { loopIndex: 1, variant: "sedan", seed: 707 },
  { loopIndex: 1, variant: "hatch", seed: 808 },
  { loopIndex: 1, variant: "sedan", seed: 909 }
];

export interface TrafficCarSnapshot {
  readonly id: string;
  readonly loopId: string;
  readonly variant: "sedan" | "hatch";
  readonly progress: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly laneSway: number;
  /** True while holding the courtesy-stop window. */
  readonly courtesyStopped: boolean;
}

export interface TrafficStepEvent {
  readonly type: "courtesyHorn";
  readonly carId: string;
  readonly vanDistance: number;
}

interface TrafficCarInternal {
  readonly id: string;
  readonly loop: LaneLoop;
  readonly routeLength: number;
  readonly variant: "sedan" | "hatch";
  readonly driver: VehicleDriverAi;
  progress: number;
  speed: number;
  laneSway: number;
  courtesyRemainingMs: number;
  courtesyFiredThisStop: boolean;
  snapshot: TrafficCarSnapshot;
}

/** Perimeter of a closed polyline. */
function polylineLength(points: readonly LaneLoopPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Sample the centerline at normalized progress with piecewise-linear segments. */
function samplePolyline(points: readonly LaneLoopPoint[], progress: number): { x: number; z: number; heading: number } {
  const total = polylineLength(points);
  let distance = ((progress % 1) + 1) % 1 * total;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const segmentLength = Math.hypot(b.x - a.x, b.z - a.z);
    if (distance <= segmentLength || i === points.length - 1) {
      const t = segmentLength === 0 ? 0 : Math.min(1, distance / segmentLength);
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(b.z - a.z, b.x - a.x)
      };
    }
    distance -= segmentLength;
  }
  // Unreachable for non-degenerate polylines; kept for totality.
  return { x: points[0]!.x, z: points[0]!.z, heading: 0 };
}

/** Normalized progress of the point on the polyline closest to (x, z). */
export function fractionOfNearestPoint(points: readonly LaneLoopPoint[], x: number, z: number): number {
  const total = polylineLength(points);
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestFraction = 0;
  let traveled = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
    const cx = a.x + dx * t;
    const cz = a.z + dz * t;
    const distanceSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestFraction = (traveled + t * Math.sqrt(lengthSq)) / total;
    }
    traveled += Math.sqrt(lengthSq);
  }
  return bestFraction;
}

/**
 * Build the DriverRoute adapter for a loop: centerline sampling, narrowest
 * half-width, measured length. The reusable driver reads exactly these.
 */
export function laneLoopRoute(loop: LaneLoop): DriverRoute {
  const length = polylineLength(loop.points);
  const halfWidth = 0.9;
  return {
    length,
    halfWidth: () => halfWidth,
    sample: (progress) => {
      const sample = samplePolyline(loop.points, progress);
      return { x: sample.x, y: sample.z, heading: sample.heading };
    }
  };
}

export interface TrafficSimulationOptions {
  /** Base deterministic seed; per-car seeds derive from it. */
  readonly seed: number;
}

export interface TrafficSimulation {
  readonly kind: "aura-courier-traffic-sim";
  readonly seed: number;
  readonly carCount: number;
  step(dtSeconds: number, vanX: number, vanZ: number): readonly TrafficStepEvent[];
  cars(): readonly TrafficCarSnapshot[];
  reset(): void;
  /** Route adapters exposed for unit tests and debug drawing. */
  routes(): readonly { readonly loopId: string; readonly route: DriverRoute }[];
  /** Collision radii used by the route's strike detection. */
  staticColliders(): readonly PropCollider[];
}

export function createTrafficSimulation(options: TrafficSimulationOptions): TrafficSimulation {
  const cars: TrafficCarInternal[] = [];
  for (let index = 0; index < CAR_PLAN.length && index < TRAFFIC_CAR_COUNT; index += 1) {
    const plan = CAR_PLAN[index]!;
    const loop = LANE_LOOPS[plan.loopIndex]!;
    const route = laneLoopRoute(loop);
    // Stagger starting progress evenly around the loop so opening frames do
    // not bunch the field at one corner.
    const startProgress = (index / TRAFFIC_CAR_COUNT) % 1;
    const driver = createVehicleDriverAi(route, {
      maxSpeed: TRAFFIC_MAX_SPEED,
      paceFraction: 0.86,
      lookAheadSeconds: 1.05,
      minLookAhead: Math.max(0.5, route.length * 0.008),
      corneringAcceleration: 6.5,
      aggression: index % 3 === 0 ? "cautious" : "balanced",
      reactionSeconds: 0.16,
      seed: (options.seed ^ plan.seed) >>> 0 || 1
    });
    cars.push({
      id: "traffic-" + plan.variant + "-" + (index + 1),
      loop,
      routeLength: route.length,
      variant: plan.variant,
      driver,
      progress: startProgress,
      speed: 0,
      laneSway: 0,
      courtesyRemainingMs: 0,
      courtesyFiredThisStop: false,
      snapshot: emptySnapshot(plan.variant, loop.id, index)
    });
  }

  function publishSnapshot(car: TrafficCarInternal): void {
    const center = samplePolyline(car.loop.points, car.progress);
    // Right-of-travel vector: (-sin h, cos h) in x/z.
    const rightX = -Math.sin(center.heading);
    const rightZ = Math.cos(center.heading);
    const lane = car.loop.laneOffset + car.laneSway;
    car.snapshot = {
      id: car.id,
      loopId: car.loop.id,
      variant: car.variant,
      progress: car.progress,
      x: center.x + rightX * lane,
      z: center.z + rightZ * lane,
      heading: center.heading,
      speed: car.speed,
      laneSway: car.laneSway,
      courtesyStopped: car.courtesyRemainingMs > 0
    };
  }

  function stepCar(car: TrafficCarInternal, dtSeconds: number, vanX: number, vanZ: number): TrafficStepEvent | null {
    const dtMs = dtSeconds * 1000;
    const center = samplePolyline(car.loop.points, car.progress);
    // Right-of-travel vector: (-sin h, cos h) in x/z.
    const rightX = -Math.sin(center.heading);
    const rightZ = Math.cos(center.heading);
    const lane = car.loop.laneOffset + car.laneSway;

    // Leader following on the same loop prevents overlap without physics.
    let leaderGap = Number.POSITIVE_INFINITY;
    let leaderSpeed = Number.POSITIVE_INFINITY;
    for (const other of cars) {
      if (other === car || other.loop !== car.loop) continue;
      const gap = (((other.progress - car.progress) % 1) + 1) % 1 * car.routeLength;
      if (gap > 0.01 && gap < leaderGap) {
        leaderGap = gap;
        leaderSpeed = other.speed;
      }
    }

    // NOTE: traffic deliberately does NOT yield its whole loop to the van -
    // a full mutual yield deadlocked dock approaches (each side waiting for
    // the other). Traffic keeps its authored laps and courtesy stops; the van
    // times crossings against those plan-able pauses, and genuine contacts
    // remain honest strikes.
    void vanX;
    void vanZ;

    // The reusable driver decides throttle/brake from look-ahead curvature.
    const driverState = {
      progress: car.progress,
      speed: car.speed,
      heading: center.heading,
      signedTrackOffset: -car.laneSway,
      position: { x: center.x + rightX * lane, y: center.z + rightZ * lane },
      offTrack: false,
      preferredSignedOffset: 0
    };
    const decision = car.driver.decide(dtSeconds, driverState);
    let targetAccel = decision.throttle * TRAFFIC_ACCELERATION - decision.brake * TRAFFIC_BRAKE_STRENGTH;
    if (leaderGap < 4.2) {
      targetAccel = Math.min(targetAccel, -TRAFFIC_BRAKE_STRENGTH);
    } else if (leaderGap < 6.2) {
      targetAccel = Math.min(targetAccel, leaderSpeed <= 0.2 ? -2.6 : -1.5);
    }

    // Courtesy stop scheduling: signed remaining distance along the loop to
    // the authored stop point (negative means the stop is just behind us).
    const stopFraction = fractionOfNearestPoint(car.loop.points, car.loop.courtesyStop.x, car.loop.courtesyStop.z);
    let aheadToStop = (((stopFraction - car.progress) % 1) + 1) % 1 * car.routeLength;
    if (aheadToStop > car.routeLength * 0.5) aheadToStop -= car.routeLength;

    let courtesyEvent: TrafficStepEvent | null = null;
    if (car.courtesyRemainingMs > 0) {
      // Holding the window: brake fully and stay put.
      targetAccel = -TRAFFIC_BRAKE_STRENGTH;
      car.courtesyRemainingMs = Math.max(0, car.courtesyRemainingMs - dtMs);
    } else {
      // Capture band scales slightly with speed so fast arrivals cannot step
      // over the stop between frames.
      const captureRadius = Math.max(1.3, car.speed * 0.32);
      if (Math.abs(aheadToStop) <= captureRadius) {
        // Arrive: snap onto the authored stop line, halt, open the window.
        car.progress = stopFraction;
        car.speed = 0;
        car.laneSway *= 0.5;
        car.courtesyRemainingMs = car.loop.courtesyStop.holdMs;
        const vanDistanceNow = Math.hypot(vanX - (center.x + rightX * lane), vanZ - (center.z + rightZ * lane));
        if (!car.courtesyFiredThisStop && vanDistanceNow < 9.5) {
          car.courtesyFiredThisStop = true;
          courtesyEvent = { type: "courtesyHorn", carId: car.id, vanDistance: vanDistanceNow };
        }
      } else if (aheadToStop >= 0 && aheadToStop < car.loop.courtesyStop.approachDistance) {
        // Approach: full authority braking (driver throttle is overridden) so
        // the halt lands inside the capture band. Once nearly stopped short of
        // the band, creep forward instead of freezing out of capture range.
        const required = (car.speed * car.speed) / (2 * Math.max(0.4, aheadToStop)) + TRAFFIC_DRAG;
        targetAccel = car.speed < 0.45 ? 1.8 : -Math.min(required, TRAFFIC_BRAKE_STRENGTH);
      } else if (aheadToStop > car.loop.courtesyStop.approachDistance * 1.7 && aheadToStop > 0) {
        car.courtesyFiredThisStop = false;
      }
    }

    car.speed += targetAccel * dtSeconds;
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), TRAFFIC_DRAG * dtSeconds);
    car.speed = Math.max(0, Math.min(TRAFFIC_MAX_SPEED, car.speed));

    // Visible, bounded steering: the driver's steer sways the car inside its
    // lane instead of leaving the asphalt.
    car.laneSway += decision.steer * 1.35 * dtSeconds * Math.min(1, car.speed / TRAFFIC_MAX_SPEED);
    car.laneSway = Math.max(-MAX_LANE_SWAY, Math.min(MAX_LANE_SWAY, car.laneSway));
    if (Math.abs(decision.steer) < 0.08) {
      // Recentre gently when the driver releases steer.
      car.laneSway -= Math.sign(car.laneSway) * Math.min(Math.abs(car.laneSway), 0.4 * dtSeconds);
    }

    car.progress = ((car.progress + (car.speed * dtSeconds) / car.routeLength) % 1 + 1) % 1;
    publishSnapshot(car);
    return courtesyEvent;
  }

  let lastCars: TrafficCarSnapshot[] = [];
  const republishAll = () => {
    lastCars = cars.map((car) => car.snapshot);
  };

  for (const car of cars) publishSnapshot(car);
  republishAll();

  return {
    kind: "aura-courier-traffic-sim",
    seed: options.seed,
    carCount: cars.length,
    step(dtSeconds, vanX, vanZ) {
      const events: TrafficStepEvent[] = [];
      for (const car of cars) {
        const event = stepCar(car, dtSeconds, vanX, vanZ);
        if (event) events.push(event);
      }
      republishAll();
      return events;
    },
    cars() {
      return lastCars;
    },
    reset() {
      for (let index = 0; index < cars.length; index += 1) {
        const car = cars[index]!;
        car.driver.reset();
        car.progress = (index / TRAFFIC_CAR_COUNT) % 1;
        car.speed = 0;
        car.laneSway = 0;
        car.courtesyRemainingMs = 0;
        car.courtesyFiredThisStop = false;
        publishSnapshot(car);
      }
      republishAll();
    },
    routes() {
      return LANE_LOOPS.map((loop) => ({ loopId: loop.id, route: laneLoopRoute(loop) }));
    },
    staticColliders(): readonly PropCollider[] {
      return cars.map((car, index) => ({
        id: "traffic-car-" + (index + 1),
        x: car.snapshot.x,
        z: car.snapshot.z,
        // Fitted visual half-width plus a small margin (sedan ~0.51, hatch ~0.44).
        radius: car.variant === "sedan" ? 0.56 : 0.5,
        speed: car.snapshot.speed
      }));
    }
  };
}

function emptySnapshot(variant: "sedan" | "hatch", loopId: string, index: number): TrafficCarSnapshot {
  return {
    id: "traffic-" + variant + "-" + (index + 1),
    loopId,
    variant,
    progress: 0,
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    laneSway: 0,
    courtesyStopped: false
  };
}
