/**
 * Gravity Post — pod state machine: launch, one bounded correction, capture/bounce, loss.
 *
 * Pure state + transitions; the route mounts this onto runtime nodes and the
 * physics sensor layer. Deterministic: no clocks, no randomness.
 */
import { STATIONS, stationById, stationPosition, WELL_BODIES, type ContractSpec } from "./contracts";
import {
  FIXED_DT,
  SOLAR_ESCAPE_RADIUS,
  stepPod,
  wellAcceleration,
  type PodKinematic,
  type Vec2,
  type WellBody
} from "./wells";

export type PodState = "ready" | "coasting" | "docked" | "lost";

/** Entering this fraction of a well radius logs a distinct-body assist. */
export const ASSIST_ZONE_FRACTION = 0.45;
/** One correction changes speed by this bounded amount (units/second). */
export const CORRECTION_DELTA_SPEED = 0.24;
/** One correction spends this fixed percentage of the route-local propellant budget. */
export const CORRECTION_FUEL_COST = 12;
/** Total propellant tank. */
export const PROPELLANT_CAPACITY = 100;
/** Adrift timer (seconds): fuel-out with no progress ends the contract. */
export const ADRIFT_LIMIT_SECONDS = 18;
/** Speed multiplier for bounded time-warp while coasting. */
export const TIME_WARP_MULTIPLIER = 8;
/** Velocity kept after a too-fast bounce off a station sensor. */
export const BOUNCE_RESTITUTION = 0.5;
/** Dock sensor radius shared by every station (world units). */
export const DOCK_SENSOR_RADIUS = 0.42;

export interface PodEvent {
  readonly type:
    | "launch"
    | "correction"
    | "assist"
    | "dock"
    | "bounce"
    | "too-fast"
    | "planet-strike"
    | "solar-escape"
    | "timeout"
    | "stranded"
    | "fuel-out";
  readonly bodyId?: string;
  readonly detail?: string;
}

export interface PodRuntimeState {
  readonly kinematic: PodKinematic;
  state: PodState;
  propellant: number;
  /** Distinct well bodies that meaningfully bent this flight. */
  readonly assists: Set<string>;
  /** Bodies whose close flyby was visited this flight (bonus logging). */
  readonly flybys: Set<string>;
  adriftSeconds: number;
  fuelOutLogged: boolean;
  correctionTokensRemaining: number;
  correctionsUsed: number;
  flightSeconds: number;
  simulationSeconds: number;
  integrationRemainder: number;
}

export function createPodRuntime(originStationId: string, tuningStrengthScale: number): PodRuntimeState {
  const station = stationById(originStationId);
  const position = stationPosition(station);
  return {
    kinematic: { position: [position[0], position[1]], velocity: [0, 0] },
    state: "ready",
    propellant: PROPELLANT_CAPACITY,
    assists: new Set<string>(),
    flybys: new Set<string>(),
    adriftSeconds: 0,
    fuelOutLogged: false,
    correctionTokensRemaining: 0,
    correctionsUsed: 0,
    flightSeconds: 0,
    simulationSeconds: 0,
    integrationRemainder: 0,
    ...(tuningStrengthScale === undefined ? {} : {})
  };
}

export function launch(pod: PodRuntimeState, direction: Vec2, speed: number): PodEvent[] {
  if (pod.state !== "ready") return [];
  const length = Math.hypot(direction[0], direction[1]);
  if (!Number.isFinite(length) || length < 1e-6 || speed <= 0) return [];
  pod.kinematic.velocity = [(direction[0] / length) * speed, (direction[1] / length) * speed];
  pod.state = "coasting";
  return [{ type: "launch", detail: speed.toFixed(3) }];
}

/**
 * Spend the contract's only correction token. The impulse is constrained to
 * the current velocity axis, so it corrects timing without becoming free-flight
 * steering. Repeated input is a deterministic no-op after the token is spent.
 */
export function applyCorrection(pod: PodRuntimeState, direction: -1 | 1): PodEvent[] {
  if (pod.state !== "coasting" || pod.correctionTokensRemaining <= 0 || pod.propellant < CORRECTION_FUEL_COST) return [];
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  if (speed <= 1e-6) return [];
  const nextSpeed = Math.max(0.08, speed + CORRECTION_DELTA_SPEED * direction);
  pod.kinematic.velocity = [
    (pod.kinematic.velocity[0] / speed) * nextSpeed,
    (pod.kinematic.velocity[1] / speed) * nextSpeed
  ];
  pod.correctionTokensRemaining -= 1;
  pod.correctionsUsed += 1;
  pod.propellant -= CORRECTION_FUEL_COST;
  return [{ type: "correction", detail: direction > 0 ? "prograde" : "retrograde" }];
}

/**
 * Advance one frame of coasting. Returns the events produced this frame.
 * Corrections are discrete and applied separately through applyCorrection;
 * this function owns only the shared deterministic coast step.
 */
export function updateCoast(options: {
  pod: PodRuntimeState;
  contract: ContractSpec;
  bodies: readonly WellBody[];
  dt: number;
  warpActive: boolean;
}): PodEvent[] {
  const { pod, contract, bodies } = options;
  if (pod.state !== "coasting") return [];
  const events: PodEvent[] = [];

  const effectiveDt = options.dt * (options.warpActive ? TIME_WARP_MULTIPLIER : 1);
  pod.flightSeconds += options.dt;
  pod.integrationRemainder += effectiveDt;

  // The live route consumes the same fixed quantum as integratePath. Collision,
  // flyby, and assist truth are sampled at every quantum so time-warp cannot
  // tunnel through a meaningful zone.
  const originBodyId = stationById(contract.originStationId).bodyId;
  const destinationBodyId = stationById(contract.destinationStationId).bodyId;
  while (pod.integrationRemainder + 1e-12 >= FIXED_DT) {
    stepPod(bodies, contract.tuning, pod.kinematic, [0, 0], FIXED_DT);
    pod.integrationRemainder = Math.max(0, pod.integrationRemainder - FIXED_DT);
    pod.simulationSeconds += FIXED_DT;

    for (const body of bodies) {
      const distance = Math.hypot(body.position[0] - pod.kinematic.position[0], body.position[1] - pod.kinematic.position[1]);
      if (distance < body.visualRadius) {
        pod.state = "lost";
        events.push({ type: "planet-strike", bodyId: body.id });
        return events;
      }
      if (distance <= body.flybyRadius) pod.flybys.add(body.id);
      if (
        body.id !== originBodyId &&
        body.id !== destinationBodyId &&
        distance < body.wellRadius * ASSIST_ZONE_FRACTION &&
        !pod.assists.has(body.id)
      ) {
        pod.assists.add(body.id);
        events.push({ type: "assist", bodyId: body.id });
      }
    }

    if (Math.hypot(pod.kinematic.position[0], pod.kinematic.position[1]) >= SOLAR_ESCAPE_RADIUS) {
      pod.state = "lost";
      events.push({ type: "solar-escape" });
      return events;
    }
  }

  if (pod.flightSeconds >= contract.timeLimitSeconds) {
    pod.state = "lost";
    events.push({ type: "timeout", detail: contract.timeLimitSeconds.toFixed(1) });
    return events;
  }

  if (pod.propellant <= 0) {
    pod.adriftSeconds += options.dt;
    if (pod.adriftSeconds >= ADRIFT_LIMIT_SECONDS) {
      pod.state = "lost";
      events.push({ type: "stranded" });
      return events;
    }
  }

  return events;
}

export interface CaptureOutcome {
  readonly docked: boolean;
  readonly distanceToCore: number;
  readonly relativeSpeed: number;
  readonly captureLimit: number;
}

/**
 * Capture rule evaluated when the destination dock sensor fires
 * (physics onTriggerEnter). Under the limit -> dock; over -> bounce-off.
 */
export function evaluateCapture(
  pod: PodRuntimeState,
  contract: ContractSpec,
  stationId: string
): CaptureOutcome & { readonly events: PodEvent[] } {
  const station = stationById(stationId);
  const core = stationPosition(station);
  const dx = pod.kinematic.position[0] - core[0];
  const dz = pod.kinematic.position[1] - core[1];
  const distanceToCore = Math.hypot(dx, dz);
  const relativeSpeed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);

  if (relativeSpeed < contract.captureLimit) {
    pod.state = "docked";
    pod.kinematic.velocity = [0, 0];
    pod.kinematic.position = [core[0], core[1]];
    return {
      docked: true,
      distanceToCore,
      relativeSpeed,
      captureLimit: contract.captureLimit,
      events: [{ type: "dock", bodyId: stationId, detail: distanceToCore.toFixed(3) }]
    };
  }

  // Too fast: bounce off the sensor with readable rejection.
  const normalLength = Math.max(1e-6, distanceToCore);
  const nx = dx / normalLength;
  const nz = dz / normalLength;
  const velocityAlongNormal = pod.kinematic.velocity[0] * nx + pod.kinematic.velocity[1] * nz;
  let vx = pod.kinematic.velocity[0];
  let vz = pod.kinematic.velocity[1];
  if (velocityAlongNormal < 0) {
    vx -= 2 * velocityAlongNormal * nx;
    vz -= 2 * velocityAlongNormal * nz;
  }
  pod.kinematic.velocity = [vx * BOUNCE_RESTITUTION, vz * BOUNCE_RESTITUTION];
  const pushOut = DOCK_SENSOR_RADIUS + 0.02;
  pod.kinematic.position = [core[0] + nx * pushOut, core[1] + nz * pushOut];
  return {
    docked: false,
    distanceToCore,
    relativeSpeed,
    captureLimit: contract.captureLimit,
    events: [{ type: "too-fast", bodyId: stationId }, { type: "bounce", bodyId: stationId }]
  };
}

/** Reset per-flight state back to the contract origin station. */
export function resetPodForContract(pod: PodRuntimeState, contract: ContractSpec): void {
  const station = stationById(contract.originStationId);
  const position = stationPosition(station);
  pod.kinematic.position = [position[0], position[1]];
  pod.kinematic.velocity = [0, 0];
  pod.state = "ready";
  pod.propellant = PROPELLANT_CAPACITY;
  pod.assists.clear();
  pod.flybys.clear();
  pod.adriftSeconds = 0;
  pod.fuelOutLogged = false;
  pod.correctionTokensRemaining = contract.correctionTokens;
  pod.correctionsUsed = 0;
  pod.flightSeconds = 0;
  pod.simulationSeconds = 0;
  pod.integrationRemainder = 0;
  void WELL_BODIES;
  void STATIONS;
  void wellAcceleration;
}
