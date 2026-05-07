import type { Particle, Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export interface CollisionPlane {
  normal: Vector3Like;
  constant: number;
  restitution?: number;
  mode?: "bounce" | "kill";
}

function dot(left: Vector3Like, right: Vector3Like): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function normalize(value: Vector3Like): Vector3Like {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length === 0) {
    throw new RangeError("Collision plane normal cannot be zero length.");
  }

  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

export class CollisionModule implements ParticleModule {
  readonly name = "CollisionModule";
  readonly plane: Required<CollisionPlane>;

  constructor(plane: CollisionPlane) {
    this.plane = {
      normal: normalize(plane.normal),
      constant: plane.constant,
      restitution: plane.restitution ?? 0.5,
      mode: plane.mode ?? "bounce",
    };

    if (!Number.isFinite(this.plane.constant) || !Number.isFinite(this.plane.restitution)) {
      throw new RangeError("Collision plane constant and restitution must be finite numbers.");
    }
  }

  afterIntegrate(particle: Particle, _context: ParticleUpdateContext): void {
    const distance = dot(this.plane.normal, particle.position) + this.plane.constant;
    if (distance >= 0) {
      return;
    }

    if (this.plane.mode === "kill") {
      particle.alive = false;
      return;
    }

    particle.position.x -= this.plane.normal.x * distance;
    particle.position.y -= this.plane.normal.y * distance;
    particle.position.z -= this.plane.normal.z * distance;

    const normalVelocity = dot(particle.velocity, this.plane.normal);
    if (normalVelocity < 0) {
      const impulse = -(1 + this.plane.restitution) * normalVelocity;
      particle.velocity.x += this.plane.normal.x * impulse;
      particle.velocity.y += this.plane.normal.y * impulse;
      particle.velocity.z += this.plane.normal.z * impulse;
    }
  }
}
