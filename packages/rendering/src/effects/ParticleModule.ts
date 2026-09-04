import type { Particle } from "./Particle.js";

export interface ParticleUpdateContext {
  deltaTime: number;
  elapsedTime: number;
  normalizedAge: number;
  random: () => number;
}

export interface ParticleModule {
  readonly name: string;
  /**
   * Set when the module's per-frame behavior is also implemented in the
   * WGSL compute kernel. ParticleSystem skips the CPU hooks of GPU-capable
   * modules on the GPU path so particles cost zero CPU per-particle work;
   * the CPU hook remains the fallback. Modules without this flag always run
   * their CPU hooks on both paths.
   */
  readonly supportsGPU?: boolean;
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
