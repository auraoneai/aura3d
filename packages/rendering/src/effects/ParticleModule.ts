import type { Particle } from "./Particle.js";

export interface ParticleUpdateContext {
  deltaTime: number;
  elapsedTime: number;
  normalizedAge: number;
  random: () => number;
}

export interface ParticleModule {
  readonly name: string;
  onSpawn?(particle: Particle, context: ParticleUpdateContext): void;
  update?(particle: Particle, context: ParticleUpdateContext): void;
  afterIntegrate?(particle: Particle, context: ParticleUpdateContext): void;
}

export function applyParticleModules(
  modules: readonly ParticleModule[],
  hook: "onSpawn" | "update" | "afterIntegrate",
  particle: Particle,
  context: ParticleUpdateContext,
): void {
  for (const module of modules) {
    module[hook]?.(particle, context);
  }
}
