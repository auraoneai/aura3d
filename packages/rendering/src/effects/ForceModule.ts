import type { Particle, Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export type ForceSampler = Vector3Like | ((particle: Particle, context: ParticleUpdateContext) => Vector3Like);

export class ForceModule implements ParticleModule {
  readonly name = "ForceModule";
  readonly force: ForceSampler;

  constructor(force: ForceSampler) {
    this.force = force;
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    const force = typeof this.force === "function" ? this.force(particle, context) : this.force;

    particle.velocity.x += force.x * context.deltaTime;
    particle.velocity.y += force.y * context.deltaTime;
    particle.velocity.z += force.z * context.deltaTime;
  }
}

export function gravityForce(gravity = -9.81): ForceModule {
  return new ForceModule({ x: 0, y: gravity, z: 0 });
}
