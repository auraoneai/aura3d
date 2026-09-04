import { cloneVector3, type Particle, type Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export interface TrailPoint {
  position: Vector3Like;
  age: number;
}

export interface TrailModuleOptions {
  maxPoints?: number;
  minDistance?: number;
  lifetime?: number;
}

function distanceSquared(left: Vector3Like, right: Vector3Like): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  const z = left.z - right.z;
  return x * x + y * y + z * z;
}

export interface TrailRibbonOptions {
  /** Half-width of the ribbon at the head. Defaults to 0.02. */
  readonly width?: number;
  /** Head stretch along velocity per unit speed. Defaults to 0.06. */
  readonly stretchFactor?: number;
  /** Alpha falloff exponent over normalized trail age. Defaults to 1.5. */
  readonly fadePower?: number;
}

export interface TrailRibbonVertex {
  readonly position: Vector3Like;
  /** 1 at the head, fading to 0 at the tail. */
  readonly alpha: number;
  /** Arc distance from the head. */
  readonly distance: number;
  /** Ribbon half-width, tapered head-to-tail for GPU strip builders. */
  readonly width: number;
}

export interface TrailRibbon {
  readonly vertices: readonly TrailRibbonVertex[];
  readonly headStretch: number;
}

export const GPU_TRAIL_RING_MIN_POINTS = 1;
export const GPU_TRAIL_RING_MAX_POINTS = 8;

/**
 * Build a velocity-stretched ribbon strip from a CPU trail history. The head
 * vertex extends along the velocity direction proportionally to speed
 * (stretch-by-velocity); alpha fades head-to-tail so the ribbon dissolves.
 */
export function buildTrailRibbon(
  trail: readonly TrailPoint[],
  head: Vector3Like,
  velocity: Vector3Like,
  lifetime: number,
  options: TrailRibbonOptions = {},
): TrailRibbon {
  const width = options.width ?? 0.02;
  const stretchFactor = options.stretchFactor ?? 0.06;
  const fadePower = options.fadePower ?? 1.5;
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(stretchFactor) || stretchFactor < 0) {
    throw new RangeError("Trail ribbon width and stretchFactor must be finite non-negative numbers.");
  }
  if (!Number.isFinite(fadePower) || fadePower <= 0) {
    throw new RangeError("Trail ribbon fadePower must be a finite positive number.");
  }
  if (!Number.isFinite(lifetime) || lifetime <= 0) {
    throw new RangeError("Trail ribbon lifetime must be a finite positive number.");
  }

  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const headStretch = speed * stretchFactor;
  const direction = speed > 1e-6
    ? { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed }
    : { x: 0, y: 0, z: 0 };
  const stretchedHead = {
    x: head.x + direction.x * headStretch,
    y: head.y + direction.y * headStretch,
    z: head.z + direction.z * headStretch,
  };

  const points = [stretchedHead, ...trail.map((point) => point.position)];
  const vertices: TrailRibbonVertex[] = [];
  let distance = 0;
  let previous = stretchedHead;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    if (index > 0) {
      distance += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
      previous = current;
    }
    const trailAge = index === 0 ? 0 : Math.min((trail[index - 1]?.age ?? lifetime) / lifetime, 1);
    const alpha = Math.pow(1 - trailAge, fadePower);
    vertices.push({
      position: { ...current },
      alpha,
      distance,
      width: width * (0.25 + 0.75 * alpha),
    });
  }
  return { vertices, headStretch };
}

/** Validate the per-particle GPU trail ring depth (1..8 history points). */
export function encodeTrailCaptureDepth(pointsPerParticle: number): number {
  if (!Number.isInteger(pointsPerParticle) ||
      pointsPerParticle < GPU_TRAIL_RING_MIN_POINTS ||
      pointsPerParticle > GPU_TRAIL_RING_MAX_POINTS) {
    throw new RangeError(
      `GPU trail ring depth must be an integer in [${GPU_TRAIL_RING_MIN_POINTS}, ${GPU_TRAIL_RING_MAX_POINTS}].`,
    );
  }
  return pointsPerParticle;
}

/**
 * Decode a GPU trail ring buffer (count * depth vec4 entries: xyz position,
 * w age; newest first) back into CPU trail histories, dropping expired
 * (age > lifetime) entries the kernel initializes with a large age.
 */
export function decodeTrailRingBuffer(
  data: Float32Array,
  count: number,
  pointsPerParticle: number,
  lifetime: number,
): TrailPoint[][] {
  encodeTrailCaptureDepth(pointsPerParticle);
  if (data.length < count * pointsPerParticle * 4) {
    throw new RangeError("Trail ring buffer is smaller than count * depth vec4 entries.");
  }
  const trails: TrailPoint[][] = [];
  for (let particle = 0; particle < count; particle += 1) {
    const trail: TrailPoint[] = [];
    for (let slot = pointsPerParticle - 1; slot >= 0; slot -= 1) {
      const offset = (particle * pointsPerParticle + slot) * 4;
      const age = data[offset + 3] ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(age) || age < 0 || age > lifetime) {
        continue;
      }
      trail.push({
        position: {
          x: data[offset] ?? 0,
          y: data[offset + 1] ?? 0,
          z: data[offset + 2] ?? 0,
        },
        age,
      });
    }
    trails.push(trail);
  }
  return trails;
}

export class TrailModule implements ParticleModule {
  readonly name = "TrailModule";
  readonly supportsGPU = true;
  readonly maxPoints: number;
  readonly minDistance: number;
  readonly lifetime: number;

  constructor(options: TrailModuleOptions = {}) {
    this.maxPoints = options.maxPoints ?? 16;
    this.minDistance = options.minDistance ?? 0.05;
    this.lifetime = options.lifetime ?? 0.5;

    if (!Number.isInteger(this.maxPoints) || this.maxPoints <= 0 || !Number.isFinite(this.minDistance) || this.minDistance < 0 || !Number.isFinite(this.lifetime) || this.lifetime <= 0) {
      throw new RangeError("TrailModule maxPoints must be a positive integer, lifetime positive, and minDistance non-negative.");
    }
  }

  onSpawn(particle: Particle, _context: ParticleUpdateContext): void {
    particle.userData.trail = [{ position: cloneVector3(particle.position), age: 0 }] satisfies TrailPoint[];
  }

  afterIntegrate(particle: Particle, context: ParticleUpdateContext): void {
    const trail = this.getTrail(particle);
    for (const point of trail) {
      point.age += context.deltaTime;
    }

    while (trail.length > 0 && trail[0].age > this.lifetime) {
      trail.shift();
    }

    const last = trail[trail.length - 1];
    if (!last || distanceSquared(last.position, particle.position) >= this.minDistance * this.minDistance) {
      trail.push({ position: cloneVector3(particle.position), age: 0 });
    }

    while (trail.length > this.maxPoints) {
      trail.shift();
    }
  }

  getTrail(particle: Particle): TrailPoint[] {
    const trail = particle.userData.trail;
    if (!Array.isArray(trail)) {
      const next: TrailPoint[] = [];
      particle.userData.trail = next;
      return next;
    }

    return trail as TrailPoint[];
  }
}
