import { CollisionModule } from "./CollisionModule.js";
import { ColorModule } from "./ColorModule.js";
import { ForceModule } from "./ForceModule.js";
import { ParticleEmitter } from "./ParticleEmitter.js";
import { ParticleSystem } from "./ParticleSystem.js";
import { SizeModule } from "./SizeModule.js";

export type ParticleEffectPresetName = "fire" | "fountain" | "collision-burst" | "spark-shower";

export interface ParticleEffectPresetOptions {
  readonly seed?: number;
  readonly maxParticles?: number;
}

export function createParticleEffectPreset(
  name: ParticleEffectPresetName,
  options: ParticleEffectPresetOptions = {}
): ParticleSystem {
  if (name === "fire") return createFirePreset(options);
  if (name === "fountain") return createFountainPreset(options);
  if (name === "collision-burst") return createCollisionBurstPreset(options);
  if (name === "spark-shower") return createSparkShowerPreset(options);
  const exhaustive: never = name;
  throw new Error(`Unsupported particle effect preset: ${exhaustive}`);
}

function createSparkShowerPreset(options: ParticleEffectPresetOptions): ParticleSystem {
  return new ParticleSystem({
    maxParticles: options.maxParticles ?? 160,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 404,
        emissionRate: 0,
        bursts: [{ time: 0, count: 48 }],
        lifetime: { min: 0.55, max: 1.1 },
        speed: { min: 0.55, max: 1.15 },
        shape: { type: "cone", origin: { x: 0, y: 0.12, z: 0 }, radius: 0.22, length: 0.36, angle: Math.PI / 7, emitFromVolume: true },
        initial: { size: 0.055, color: { r: 1, g: 0.78, b: 0.25, a: 1 } }
      })
    ],
    modules: [
      new ForceModule({ x: 0.16, y: -1.4, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.92, b: 0.42, a: 1 } },
        { time: 0.55, color: { r: 1, g: 0.35, b: 0.1, a: 0.8 } },
        { time: 1, color: { r: 0.35, g: 0.08, b: 0.04, a: 0.08 } }
      ]),
      new SizeModule([
        { time: 0, size: 0.035 },
        { time: 0.22, size: 0.075 },
        { time: 1, size: 0.012 }
      ]),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.18 })
    ]
  });
}

function createFirePreset(options: ParticleEffectPresetOptions): ParticleSystem {
  return new ParticleSystem({
    maxParticles: options.maxParticles ?? 200,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 101,
        emissionRate: 90,
        lifetime: { min: 0.7, max: 1.1 },
        speed: { min: 0.15, max: 0.45 },
        shape: { type: "box", center: { x: 0, y: 0.2, z: 0 }, size: { x: 0.4, y: 0.05, z: 0.1 } },
        initial: { size: 0.1 }
      })
    ],
    modules: [
      new ForceModule({ x: 0, y: 0.65, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.78, b: 0.2, a: 1 } },
        { time: 1, color: { r: 0.85, g: 0.12, b: 0.04, a: 0.15 } }
      ]),
      new SizeModule([
        { time: 0, size: 0.05 },
        { time: 0.5, size: 0.14 },
        { time: 1, size: 0.02 }
      ])
    ]
  });
}

function createFountainPreset(options: ParticleEffectPresetOptions): ParticleSystem {
  return new ParticleSystem({
    maxParticles: options.maxParticles ?? 220,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 202,
        emissionRate: 120,
        lifetime: { min: 1.0, max: 1.4 },
        speed: { min: 0.5, max: 0.9 },
        shape: { type: "point", position: { x: 0, y: 0.1, z: 0 } },
        initial: { size: 0.08 }
      })
    ],
    modules: [
      new ForceModule({ x: 0, y: -0.45, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 0.2, g: 0.72, b: 1, a: 0.9 } },
        { time: 1, color: { r: 0.1, g: 0.26, b: 1, a: 0.25 } }
      ])
    ]
  });
}

function createCollisionBurstPreset(options: ParticleEffectPresetOptions): ParticleSystem {
  return new ParticleSystem({
    maxParticles: options.maxParticles ?? 64,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 303,
        emissionRate: 0,
        bursts: [{ time: 0, count: 20 }],
        lifetime: 2,
        speed: 0,
        shape: { type: "box", center: { x: 0, y: 0.75, z: 0 }, size: { x: 0.55, y: 0.1, z: 0 } },
        initial: { size: 0.08, color: { r: 0.45, g: 1, b: 0.48, a: 1 } }
      })
    ],
    modules: [
      new ForceModule({ x: 0, y: -2.8, z: 0 }),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.25 })
    ]
  });
}
