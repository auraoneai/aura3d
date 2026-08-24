/**
 * Gravity Post — authored gravity field + forward integrator.
 *
 * These are ROUTE-LOCAL DESIGN VALUES for an arcade slingshot game. The force
 * model is an authored inverse-distance well with a hard cutoff at each body's
 * well radius. It is deliberately NOT Newtonian gravity, NOT n-body, and makes
 * no physical-parity claim of any kind ("authored arcade gravity, non-physical").
 *
 * Everything in this module is a pure function over explicit state so the unit
 * suite can prove determinism (same inputs -> identical dock point hash).
 */

export type Vec2 = readonly [number, number];

export interface WellBody {
  readonly id: string;
  readonly name: string;
  /** World position on the play plane [x, z]. */
  readonly position: Vec2;
  /** Visual radius used for planet-strike collision. */
  readonly visualRadius: number;
  /** Authored well radius; force is zero at and beyond this distance. */
  readonly wellRadius: number;
  /** Authored inverse-distance strength constant (route-local design value). */
  readonly mu: number;
  /** Radius that counts as a close flyby visit for assist/bonus logging. */
  readonly flybyRadius: number;
}

export interface WellTuning {
  /** Multiplier applied to every body's mu for one contract. */
  readonly strengthScale: number;
}

/** Fixed integration step (seconds) — every simulation advances in these units. */
export const FIXED_DT = 1 / 120;
/** Solar escape radius: beyond this the pod is lost. */
export const SOLAR_ESCAPE_RADIUS = 8.4;
/** Soft floor on distance so the inverse-distance law stays bounded. */
const MIN_DISTANCE = 0.05;

/**
 * Authored acceleration at a point from every well.
 * a(d) = mu / d - zero contribution at or beyond the well edge, continuous there,
 * clamped by MIN_DISTANCE so a strike trajectory cannot divide by ~0.
 */
export function wellAcceleration(bodies: readonly WellBody[], tuning: WellTuning, point: Vec2): Vec2 {
  let ax = 0;
  let az = 0;
  for (const body of bodies) {
    const dx = body.position[0] - point[0];
    const dz = body.position[1] - point[1];
    const distance = Math.max(MIN_DISTANCE, Math.hypot(dx, dz));
    if (distance >= body.wellRadius) continue;
    const magnitude = (body.mu * tuning.strengthScale) * (1 / distance - 1 / body.wellRadius);
    ax += (dx / distance) * magnitude;
    az += (dz / distance) * magnitude;
  }
  return [ax, az];
}

export interface PodKinematic {
  position: Vec2;
  velocity: Vec2;
}

/** One semi-implicit Euler step at FIXED_DT granularity. */
export function stepPod(
  bodies: readonly WellBody[],
  tuning: WellTuning,
  pod: PodKinematic,
  burnAcceleration: Vec2,
  dtSeconds: number
): void {
  let remaining = Math.max(0, Math.min(1, dtSeconds));
  while (remaining > 0) {
    const stepDt = Math.min(FIXED_DT, remaining);
    remaining -= stepDt;
    const gravity = wellAcceleration(bodies, tuning, pod.position);
    const ax = gravity[0] + burnAcceleration[0];
    const az = gravity[1] + burnAcceleration[1];
    pod.velocity = [
      pod.velocity[0] + ax * stepDt,
      pod.velocity[1] + az * stepDt
    ];
    pod.position = [
      pod.position[0] + pod.velocity[0] * stepDt,
      pod.position[1] + pod.velocity[1] * stepDt
    ];
  }
}

export interface TrajectorySample {
  readonly position: Vec2;
  readonly speed: number;
}

export interface IntegratePathResult {
  readonly samples: TrajectorySample[];
  readonly escapedSolar: boolean;
  readonly struckBodyId: string | null;
  readonly enteredWells: readonly string[];
}

/**
 * Sampled forward integration used by the prediction line. Pure: same inputs
 * produce byte-identical sample lists, which the determinism unit test hashes.
 */
export function integratePath(options: {
  bodies: readonly WellBody[];
  tuning: WellTuning;
  start: Vec2;
  velocity: Vec2;
  steps: number;
}): IntegratePathResult {
  const pod: PodKinematic = { position: [...options.start] as Vec2, velocity: [...options.velocity] as Vec2 };
  const samples: TrajectorySample[] = [];
  const entered = new Set<string>();
  let escapedSolar = false;
  let struckBodyId: string | null = null;
  for (let index = 0; index < options.steps; index += 1) {
    stepPod(options.bodies, options.tuning, pod, [0, 0], FIXED_DT);
    if (samples.length < 200) {
      samples.push({ position: [...pod.position] as Vec2, speed: Math.hypot(pod.velocity[0], pod.velocity[1]) });
    }
    for (const body of options.bodies) {
      const distance = Math.hypot(body.position[0] - pod.position[0], body.position[1] - pod.position[1]);
      if (distance <= body.visualRadius) struckBodyId = body.id;
      else if (distance <= body.flybyRadius) entered.add(body.id);
    }
    if (Math.hypot(pod.position[0], pod.position[1]) >= SOLAR_ESCAPE_RADIUS) escapedSolar = true;
    if (escapedSolar || struckBodyId !== null) break;
  }
  return { samples, escapedSolar, struckBodyId, enteredWells: [...entered] };
}

/** Stable FNV-style hash over quantized dock points — determinism evidence. */
export function dockPointHash(point: Vec2): number {
  const qx = Math.round(point[0] * 4096);
  const qz = Math.round(point[1] * 4096);
  let hash = 0x811c9dc5;
  hash = (hash ^ (qx & 0xffff)) >>> 0;
  hash = Math.imul(hash, 16777619) >>> 0;
  hash = (hash ^ (qz & 0xffff)) >>> 0;
  hash = Math.imul(hash, 16777619) >>> 0;
  return hash >>> 0;
}
