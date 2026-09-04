import type { Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";
import type { Particle } from "./Particle.js";

/**
 * Curl-noise turbulence for GPU particles (PART A4).
 *
 * The field is the analytic curl of a vector potential built from a fixed
 * sinusoidal scalar potential, sampled through a deterministic 3D lattice
 * (the "curl-noise LUT"). The CPU fallback trilinear-samples the same LUT
 * the WGSL compute path uploads, so both paths share one field definition.
 */

export const TURBULENCE_LUT_RESOLUTION = 8;
export const TURBULENCE_LUT_ENTRIES = TURBULENCE_LUT_RESOLUTION ** 3;

function scalarPotentialU(u: number, v: number): { value: number; du: number; dv: number } {
  const a1u = 1.6 * u;
  const b1v = 1.3 * v;
  const a2u = 3.1 * u + 1.7;
  const b2v = 2.7 * v + 0.6;
  return {
    value: Math.sin(a1u) * Math.cos(b1v) + 0.35 * Math.sin(a2u) * Math.cos(b2v),
    du: 1.6 * Math.cos(a1u) * Math.cos(b1v) + 0.35 * 3.1 * Math.cos(a2u) * Math.cos(b2v),
    dv: -1.3 * Math.sin(a1u) * Math.sin(b1v) - 0.35 * 2.7 * Math.sin(a2u) * Math.sin(b2v),
  };
}

function curlAt(x: number, y: number, z: number): Vector3Like {
  // A(p) = (f(y,z), f(z,x), f(x,y)); V = curl(A).
  const fyz = scalarPotentialU(y, z);
  const fzx = scalarPotentialU(z, x);
  const fxy = scalarPotentialU(x, y);
  return {
    x: fzx.du - fxy.dv,
    y: fxy.du - fyz.dv,
    z: fyz.du - fzx.dv,
  };
}

/** Build the deterministic curl-noise LUT: resolution^3 vec4 entries (xyz = curl, w = 0). */
export function createCurlNoiseLUT(resolution: number = TURBULENCE_LUT_RESOLUTION): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 32) {
    throw new RangeError("Curl-noise LUT resolution must be an integer in [2, 32].");
  }
  const lut = new Float32Array(resolution ** 3 * 4);
  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const curl = curlAt((x + 0.5) / resolution, (y + 0.5) / resolution, (z + 0.5) / resolution);
        const offset = (x + y * resolution + z * resolution * resolution) * 4;
        lut[offset] = curl.x;
        lut[offset + 1] = curl.y;
        lut[offset + 2] = curl.z;
        lut[offset + 3] = 0;
      }
    }
  }
  return lut;
}

/** Trilinear, wrapping sample of a curl-noise LUT at unit-space coordinates. */
export function sampleCurlNoiseLUT(
  lut: Float32Array,
  resolution: number,
  x: number,
  y: number,
  z: number,
  out: Vector3Like = { x: 0, y: 0, z: 0 },
): Vector3Like {
  if (lut.length < resolution ** 3 * 4) {
    throw new RangeError("Curl-noise LUT buffer is smaller than resolution^3 vec4 entries.");
  }
  const gx = (x - Math.floor(x)) * resolution - 0.5;
  const gy = (y - Math.floor(y)) * resolution - 0.5;
  const gz = (z - Math.floor(z)) * resolution - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);
  const fx = gx - x0;
  const fy = gy - y0;
  const fz = gz - z0;

  let rx = 0;
  let ry = 0;
  let rz = 0;
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const weight =
          (dx === 0 ? 1 - fx : fx) * (dy === 0 ? 1 - fy : fy) * (dz === 0 ? 1 - fz : fz);
        const ix = (((x0 + dx) % resolution) + resolution) % resolution;
        const iy = (((y0 + dy) % resolution) + resolution) % resolution;
        const iz = (((z0 + dz) % resolution) + resolution) % resolution;
        const offset = (ix + iy * resolution + iz * resolution * resolution) * 4;
        rx += (lut[offset] ?? 0) * weight;
        ry += (lut[offset + 1] ?? 0) * weight;
        rz += (lut[offset + 2] ?? 0) * weight;
      }
    }
  }
  out.x = rx;
  out.y = ry;
  out.z = rz;
  return out;
}

export interface TurbulenceModuleOptions {
  readonly strength?: number;
  readonly scale?: number;
  readonly flowSpeed?: number;
  readonly lutResolution?: number;
}

export interface GPUTurbulenceParams {
  readonly strength: number;
  readonly scale: number;
  readonly flowSpeed: number;
  readonly lutResolution: number;
}

export class TurbulenceModule implements ParticleModule {
  readonly name = "TurbulenceModule";
  readonly supportsGPU = true;
  readonly strength: number;
  readonly scale: number;
  readonly flowSpeed: number;
  readonly lutResolution: number;
  private cachedLUT: Float32Array | null = null;

  constructor(options: TurbulenceModuleOptions = {}) {
    this.strength = options.strength ?? 0.6;
    this.scale = options.scale ?? 0.8;
    this.flowSpeed = options.flowSpeed ?? 0.15;
    this.lutResolution = options.lutResolution ?? TURBULENCE_LUT_RESOLUTION;
    if (!Number.isFinite(this.strength) || !Number.isFinite(this.scale) || !Number.isFinite(this.flowSpeed)) {
      throw new RangeError("TurbulenceModule strength, scale, and flowSpeed must be finite numbers.");
    }
    if (!Number.isInteger(this.lutResolution) || this.lutResolution < 2 || this.lutResolution > 32) {
      throw new RangeError("TurbulenceModule lutResolution must be an integer in [2, 32].");
    }
  }

  getLUT(): Float32Array {
    if (!this.cachedLUT) {
      this.cachedLUT = createCurlNoiseLUT(this.lutResolution);
    }
    return this.cachedLUT;
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    const scratch = sampleCurlNoiseLUT(
      this.getLUT(),
      this.lutResolution,
      particle.position.x * this.scale + context.elapsedTime * this.flowSpeed,
      particle.position.y * this.scale,
      particle.position.z * this.scale,
      { x: 0, y: 0, z: 0 },
    );
    particle.velocity.x += scratch.x * this.strength * context.deltaTime;
    particle.velocity.y += scratch.y * this.strength * context.deltaTime;
    particle.velocity.z += scratch.z * this.strength * context.deltaTime;
  }

  toGPUTurbulence(): GPUTurbulenceParams {
    return {
      strength: this.strength,
      scale: this.scale,
      flowSpeed: this.flowSpeed,
      lutResolution: this.lutResolution,
    };
  }
}
