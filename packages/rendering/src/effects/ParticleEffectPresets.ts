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
    maxParticles: options.maxParticles ?? 260,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 101,
        emissionRate: 180,
        lifetime: { min: 0.85, max: 1.25 },
        speed: { min: 0.3, max: 0.75 },
        shape: { type: "cone", origin: { x: 0, y: 0.05, z: 0 }, radius: 0.28, length: 0.16, angle: Math.PI / 6, emitFromVolume: true },
        initial: { size: 0.13 }
      })
    ],
    modules: [
      new ForceModule({ x: 0.02, y: 0.82, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.92, b: 0.28, a: 1 } },
        { time: 0.38, color: { r: 1, g: 0.38, b: 0.08, a: 0.88 } },
        { time: 0.76, color: { r: 0.72, g: 0.12, b: 0.04, a: 0.36 } },
        { time: 1, color: { r: 0.12, g: 0.1, b: 0.1, a: 0.08 } }
      ]),
      new SizeModule([
        { time: 0, size: 0.05 },
        { time: 0.28, size: 0.18 },
        { time: 0.72, size: 0.13 },
        { time: 1, size: 0.035 }
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
        emissionRate: 155,
        lifetime: { min: 1.0, max: 1.4 },
        speed: { min: 0.72, max: 1.15 },
        shape: { type: "cone", origin: { x: 0, y: 0.08, z: 0 }, radius: 0.12, length: 0.12, angle: Math.PI / 5, emitFromVolume: true },
        initial: { size: 0.075 }
      })
    ],
    modules: [
      new ForceModule({ x: 0, y: -0.78, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 0.55, g: 0.9, b: 1, a: 0.95 } },
        { time: 0.58, color: { r: 0.18, g: 0.62, b: 1, a: 0.72 } },
        { time: 1, color: { r: 0.1, g: 0.26, b: 1, a: 0.2 } }
      ]),
      new SizeModule([
        { time: 0, size: 0.045 },
        { time: 0.38, size: 0.09 },
        { time: 1, size: 0.028 }
      ])
    ]
  });
}

function createCollisionBurstPreset(options: ParticleEffectPresetOptions): ParticleSystem {
  return new ParticleSystem({
    maxParticles: options.maxParticles ?? 96,
    emitters: [
      new ParticleEmitter({
        seed: options.seed ?? 303,
        emissionRate: 0,
        bursts: [{ time: 0, count: 42 }],
        lifetime: { min: 0.9, max: 1.6 },
        speed: { min: 0.35, max: 0.95 },
        shape: { type: "sphere", center: { x: 0, y: 0.56, z: 0 }, radius: 0.24 },
        initial: { size: 0.1, color: { r: 0.45, g: 1, b: 0.58, a: 1 } }
      })
    ],
    modules: [
      new ForceModule({ x: 0, y: -2.2, z: 0 }),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.32 }),
      new ColorModule([
        { time: 0, color: { r: 0.7, g: 1, b: 0.62, a: 1 } },
        { time: 0.5, color: { r: 0.22, g: 1, b: 0.7, a: 0.72 } },
        { time: 1, color: { r: 0.08, g: 0.45, b: 0.22, a: 0.16 } }
      ]),
      new SizeModule([
        { time: 0, size: 0.055 },
        { time: 0.2, size: 0.12 },
        { time: 1, size: 0.025 }
      ])
    ]
  });
}
