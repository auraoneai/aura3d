import type { Particle, Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export type HeightfieldCollisionMode = "bounce" | "kill";

export interface HeightfieldSamplerOptions {
  readonly originX?: number;
  readonly originZ?: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array | readonly number[];
}

/** Bilinear heightfield sampler shared by the CPU fallback and the compute path. */
export class HeightfieldSampler {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array;

  constructor(options: HeightfieldSamplerOptions) {
    this.originX = options.originX ?? 0;
    this.originZ = options.originZ ?? 0;
    this.cellSize = options.cellSize;
    this.columns = options.columns;
    this.rows = options.rows;
    if (!Number.isFinite(this.cellSize) || this.cellSize <= 0) {
      throw new RangeError("HeightfieldSampler cellSize must be a finite positive number.");
    }
    if (!Number.isInteger(this.columns) || this.columns < 2 || !Number.isInteger(this.rows) || this.rows < 2) {
      throw new RangeError("HeightfieldSampler columns and rows must be integers >= 2.");
    }
    const expected = this.columns * this.rows;
    const heights = options.heights instanceof Float32Array ? options.heights : Float32Array.from(options.heights);
    if (heights.length !== expected) {
      throw new RangeError(`HeightfieldSampler heights must hold columns*rows (${expected}) entries.`);
    }
    if (!heights.every(Number.isFinite)) {
      throw new RangeError("HeightfieldSampler heights must all be finite numbers.");
    }
    this.heights = heights;
  }

  sampleHeight(x: number, z: number): number {
    const fx = (x - this.originX) / this.cellSize;
    const fz = (z - this.originZ) / this.cellSize;
    const clampedX = Math.min(Math.max(fx, 0), this.columns - 1.001);
    const clampedZ = Math.min(Math.max(fz, 0), this.rows - 1.001);
    const x0 = Math.floor(clampedX);
    const z0 = Math.floor(clampedZ);
    const tx = clampedX - x0;
    const tz = clampedZ - z0;
    const h00 = this.heights[z0 * this.columns + x0] ?? 0;
    const h10 = this.heights[z0 * this.columns + x0 + 1] ?? 0;
    const h01 = this.heights[(z0 + 1) * this.columns + x0] ?? 0;
    const h11 = this.heights[(z0 + 1) * this.columns + x0 + 1] ?? 0;
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  }

  /** Finite-difference surface normal; shared by CPU bounce and the WGSL kernel. */
  surfaceNormal(x: number, z: number, out: Vector3Like = { x: 0, y: 1, z: 0 }): Vector3Like {
    const e = this.cellSize;
    const dhdx = (this.sampleHeight(x + e, z) - this.sampleHeight(x - e, z)) / (2 * e);
    const dhdz = (this.sampleHeight(x, z + e) - this.sampleHeight(x, z - e)) / (2 * e);
    const length = Math.hypot(dhdx, 1, dhdz);
    out.x = -dhdx / length;
    out.y = 1 / length;
    out.z = -dhdz / length;
    return out;
  }
}

/** Deterministic rolling-hills heightfield for demos and tests. */
export function createSineHeightfield(
  columns: number,
  rows: number,
  cellSize: number,
  amplitude: number,
  frequency: number,
  originX = 0,
  originZ = 0,
): HeightfieldSampler {
  const heights = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * cellSize;
      const z = originZ + row * cellSize;
      heights[row * columns + column] =
        amplitude * Math.sin(x * frequency) * Math.cos(z * frequency * 0.8) +
        amplitude * 0.35 * Math.sin(x * frequency * 2.3 + 1.1) * Math.sin(z * frequency * 1.9);
    }
  }
  return new HeightfieldSampler({ originX, originZ, cellSize, columns, rows, heights });
}

export interface HeightfieldModuleOptions {
  readonly sampler: HeightfieldSampler;
  readonly restitution?: number;
  readonly mode?: HeightfieldCollisionMode;
}

export interface GPUHeightfieldParams {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly restitution: number;
  readonly killOnContact: boolean;
}

/** Ground collision via heightfield; runs in compute, with this CPU fallback. */
export class HeightfieldModule implements ParticleModule {
  readonly name = "HeightfieldModule";
  readonly supportsGPU = true;
  readonly sampler: HeightfieldSampler;
  readonly restitution: number;
  readonly mode: HeightfieldCollisionMode;

  constructor(options: HeightfieldModuleOptions) {
    this.sampler = options.sampler;
    this.restitution = options.restitution ?? 0.4;
    this.mode = options.mode ?? "bounce";
    if (!Number.isFinite(this.restitution) || this.restitution < 0) {
      throw new RangeError("HeightfieldModule restitution must be a finite non-negative number.");
    }
  }

  afterIntegrate(particle: Particle, _context: ParticleUpdateContext): void {
    const contacted = resolveHeightfieldContact(
      this.sampler,
      particle.position,
      particle.velocity,
      this.restitution,
      this.mode === "kill",
    );
    if (contacted && this.mode === "kill") {
      particle.alive = false;
    }
  }

  toGPUHeightfield(): GPUHeightfieldParams {
    return {
      originX: this.sampler.originX,
      originZ: this.sampler.originZ,
      cellSize: this.sampler.cellSize,
      columns: this.sampler.columns,
      rows: this.sampler.rows,
      restitution: this.restitution,
      killOnContact: this.mode === "kill",
    };
  }
}

/**
 * Resolve one ground contact. Pure and shared: the CPU fallback calls it
 * directly and the WGSL kernel implements the same steps (bilinear sample,
 * gradient normal, restitution reflect, surface clamp).
 */
export function resolveHeightfieldContact(
  sampler: HeightfieldSampler,
  position: Vector3Like,
  velocity: Vector3Like,
  restitution: number,
  killOnContact: boolean,
): boolean {
  const ground = sampler.sampleHeight(position.x, position.z);
  if (position.y >= ground) {
    return false;
  }
  if (killOnContact) {
    return true;
  }
  const normal = sampler.surfaceNormal(position.x, position.z, { x: 0, y: 1, z: 0 });
  position.y = ground;
  const normalVelocity = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  if (normalVelocity < 0) {
    const impulse = -(1 + restitution) * normalVelocity;
    velocity.x += normal.x * impulse;
    velocity.y += normal.y * impulse;
    velocity.z += normal.z * impulse;
  }
  return true;
}
