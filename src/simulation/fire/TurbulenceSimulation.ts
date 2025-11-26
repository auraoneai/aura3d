/**
 * Turbulence simulation using curl noise for fire dynamics.
 * Generates procedural turbulence to create realistic, chaotic fire motion.
 * @module TurbulenceSimulation
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.get('TurbulenceSimulation');

/**
 * 3D Perlin-style noise implementation for turbulence generation.
 */
class NoiseGenerator {
  private readonly permutation: Uint8Array;

  constructor(seed: number = 0) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    let rng = seed;
    const random = (): number => {
      rng = (rng * 1664525 + 1013904223) | 0;
      return ((rng >>> 0) / 4294967296);
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    this.permutation = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.permutation[i] = p[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  public noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.permutation[X]! + Y;
    const AA = this.permutation[A]! + Z;
    const AB = this.permutation[A + 1]! + Z;
    const B = this.permutation[X + 1]! + Y;
    const BA = this.permutation[B]! + Z;
    const BB = this.permutation[B + 1]! + Z;

    const lerp = (t: number, a: number, b: number): number => a + t * (b - a);

    return lerp(w,
      lerp(v,
        lerp(u, this.grad(this.permutation[AA]!, x, y, z),
               this.grad(this.permutation[BA]!, x - 1, y, z)),
        lerp(u, this.grad(this.permutation[AB]!, x, y - 1, z),
               this.grad(this.permutation[BB]!, x - 1, y - 1, z))),
      lerp(v,
        lerp(u, this.grad(this.permutation[AA + 1]!, x, y, z - 1),
               this.grad(this.permutation[BA + 1]!, x - 1, y, z - 1)),
        lerp(u, this.grad(this.permutation[AB + 1]!, x, y - 1, z - 1),
               this.grad(this.permutation[BB + 1]!, x - 1, y - 1, z - 1))));
  }
}

/**
 * Turbulence simulation using curl noise to inject vorticity into flow fields.
 * Creates swirling, turbulent motion characteristic of fire and smoke.
 */
export class TurbulenceSimulation {
  private readonly noiseGen: NoiseGenerator;
  private time: number;

  private readonly octaves: number;
  private readonly lacunarity: number;
  private readonly persistence: number;
  private readonly scale: number;

  /**
   * Creates a new turbulence simulation.
   * @param seed - Random seed for reproducibility
   * @param octaves - Number of noise octaves (default: 4)
   * @param lacunarity - Frequency multiplier per octave (default: 2.0)
   * @param persistence - Amplitude multiplier per octave (default: 0.5)
   * @param scale - Overall noise scale (default: 1.0)
   */
  constructor(
    seed: number = 0,
    octaves: number = 4,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
    scale: number = 1.0
  ) {
    this.noiseGen = new NoiseGenerator(seed);
    this.time = 0;

    this.octaves = octaves;
    this.lacunarity = lacunarity;
    this.persistence = persistence;
    this.scale = scale;

    logger.info('Turbulence simulation initialized');
  }

  /**
   * Samples multi-octave noise at position.
   * @param position - 3D position
   * @returns Noise value in range [-1, 1]
   */
  private fbm(position: Vector3): number {
    let sum = 0;
    let amplitude = 1.0;
    let frequency = this.scale;

    for (let i = 0; i < this.octaves; i++) {
      sum += amplitude * this.noiseGen.noise(
        position.x * frequency,
        position.y * frequency,
        position.z * frequency
      );
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    return sum;
  }

  /**
   * Computes curl of a potential field to generate divergence-free velocity.
   * Uses finite differences to approximate the curl operator.
   * @param position - Sample position
   * @param epsilon - Finite difference step size
   * @returns Curl velocity vector
   */
  public getCurlNoise(position: Vector3, epsilon: number = 0.01): Vector3 {
    const timeOffset = new Vector3(this.time, this.time * 0.7, this.time * 1.3);
    const pos = position.add(timeOffset);

    const dx = new Vector3(epsilon, 0, 0);
    const dy = new Vector3(0, epsilon, 0);
    const dz = new Vector3(0, 0, epsilon);

    const px = this.samplePotential(pos.add(dx));
    const nx = this.samplePotential(pos.sub(dx));
    const py = this.samplePotential(pos.add(dy));
    const ny = this.samplePotential(pos.sub(dy));
    const pz = this.samplePotential(pos.add(dz));
    const nz = this.samplePotential(pos.sub(dz));

    const x = (py.z - ny.z) - (pz.y - nz.y);
    const y = (pz.x - nz.x) - (px.z - nx.z);
    const z = (px.y - nx.y) - (py.x - ny.x);

    return new Vector3(x, y, z).scale(1.0 / (2.0 * epsilon));
  }

  /**
   * Samples a 3D potential field (three noise functions).
   * @param position - Sample position
   * @returns Potential vector
   */
  private samplePotential(position: Vector3): Vector3 {
    return new Vector3(
      this.fbm(position),
      this.fbm(position.add(new Vector3(31.416, 47.853, 12.793))),
      this.fbm(position.add(new Vector3(73.921, 19.134, 56.437)))
    );
  }

  /**
   * Applies turbulence forces to a velocity field.
   * @param velocityField - Velocity field to modify
   * @param getVelocity - Function to get velocity at (i, j, k)
   * @param setVelocity - Function to set velocity at (i, j, k)
   * @param resolution - Grid resolution
   * @param cellSize - Grid cell size
   * @param strength - Turbulence strength multiplier
   */
  public applyTurbulence(
    velocityField: {
      getVelocity: (i: number, j: number, k: number) => Vector3;
      setVelocity: (i: number, j: number, k: number, v: Vector3) => void;
    },
    resolution: Vector3,
    cellSize: number,
    strength: number
  ): void {
    for (let k = 0; k < resolution.z; k++) {
      for (let j = 0; j < resolution.y; j++) {
        for (let i = 0; i < resolution.x; i++) {
          const position = new Vector3(
            (i + 0.5) * cellSize,
            (j + 0.5) * cellSize,
            (k + 0.5) * cellSize
          );

          const curlVelocity = this.getCurlNoise(position, cellSize * 0.5);
          const currentVelocity = velocityField.getVelocity(i, j, k);

          const newVelocity = currentVelocity.add(curlVelocity.scale(strength));
          velocityField.setVelocity(i, j, k, newVelocity);
        }
      }
    }
  }

  /**
   * Applies turbulence to specific region (e.g., near fire sources).
   * @param velocityField - Velocity field to modify
   * @param getVelocity - Function to get velocity at (i, j, k)
   * @param setVelocity - Function to set velocity at (i, j, k)
   * @param resolution - Grid resolution
   * @param cellSize - Grid cell size
   * @param center - Center of turbulent region
   * @param radius - Radius of turbulent region
   * @param strength - Turbulence strength multiplier
   */
  public applyLocalTurbulence(
    velocityField: {
      getVelocity: (i: number, j: number, k: number) => Vector3;
      setVelocity: (i: number, j: number, k: number, v: Vector3) => void;
    },
    resolution: Vector3,
    cellSize: number,
    center: Vector3,
    radius: number,
    strength: number
  ): void {
    const radiusCells = Math.ceil(radius / cellSize);
    const gridCenter = new Vector3(
      center.x / cellSize,
      center.y / cellSize,
      center.z / cellSize
    );

    const minI = Math.max(0, Math.floor(gridCenter.x - radiusCells));
    const maxI = Math.min(resolution.x - 1, Math.ceil(gridCenter.x + radiusCells));
    const minJ = Math.max(0, Math.floor(gridCenter.y - radiusCells));
    const maxJ = Math.min(resolution.y - 1, Math.ceil(gridCenter.y + radiusCells));
    const minK = Math.max(0, Math.floor(gridCenter.z - radiusCells));
    const maxK = Math.min(resolution.z - 1, Math.ceil(gridCenter.z + radiusCells));

    for (let k = minK; k <= maxK; k++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const position = new Vector3(
            (i + 0.5) * cellSize,
            (j + 0.5) * cellSize,
            (k + 0.5) * cellSize
          );

          const distance = position.sub(center).length();
          if (distance < radius) {
            const falloff = 1.0 - (distance / radius);
            const curlVelocity = this.getCurlNoise(position, cellSize * 0.5);
            const currentVelocity = velocityField.getVelocity(i, j, k);

            const turbulence = curlVelocity.scale(strength * falloff);
            velocityField.setVelocity(i, j, k, currentVelocity.add(turbulence));
          }
        }
      }
    }
  }

  /**
   * Updates simulation time (animates noise field).
   * @param dt - Time delta in seconds
   * @param speed - Animation speed multiplier
   */
  public update(dt: number, speed: number = 1.0): void {
    this.time += dt * speed;
  }

  /**
   * Resets simulation time.
   */
  public reset(): void {
    this.time = 0;
  }

  /**
   * Gets current simulation time.
   */
  public getTime(): number {
    return this.time;
  }
}
