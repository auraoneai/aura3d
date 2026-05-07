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

export class TrailModule implements ParticleModule {
  readonly name = "TrailModule";
  readonly maxPoints: number;
  readonly minDistance: number;
  readonly lifetime: number;

  constructor(options: TrailModuleOptions = {}) {
    this.maxPoints = options.maxPoints ?? 16;
    this.minDistance = options.minDistance ?? 0.05;
    this.lifetime = options.lifetime ?? 0.5;

    if (this.maxPoints <= 0 || this.minDistance < 0 || this.lifetime <= 0) {
      throw new RangeError("TrailModule maxPoints and lifetime must be positive, and minDistance must be non-negative.");
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
