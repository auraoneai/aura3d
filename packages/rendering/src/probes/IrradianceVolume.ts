// PRD-02 §6.6 — `IrradianceVolume`: a grid of SH-L1 probes (4 coefficients ×
// RGB = 12 floats per cell). Each cell is captured at 32 px through the same
// `renderFace` seam, SH-projected, and stored in three RGBA16F 3D textures —
// one per colour channel, each texel holding (L0, L1₋₁, L1₀, L1₁). L2 (27
// floats) would need 7 RGBA textures and does not fit the 16-unit sampler
// budget (§6.10). Sampling is trilinear with a 0.5·cell normal offset for
// leak reduction and a smooth fade at the bounds. `once`/`on-demand` baking.

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import { Texture } from "../Texture";
import { cubeFaceViewProjection } from "../environment/probeBuild";
import { projectCubeToSH9 } from "../environment/SphericalHarmonics";
import type { ReflectionFaceRenderer } from "./ReflectionProbeSystem";

export type { ReflectionFaceRenderer };

export interface IrradianceVolumeSpec {
  readonly name: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Grid cells per axis; ≤ 8 each by default budget (8³=512 cells). */
  readonly resolution?: readonly [number, number, number]; // default [4,4,4]
  readonly intensity?: number;                             // default 1
  readonly update?: "once" | "on-demand";                  // default "once"
  readonly captureFaceSize?: number;                       // default 32
}

export interface IrradianceVolume {
  readonly spec: Required<IrradianceVolumeSpec>;
  /** (nx*ny*nz × 4) SH-L1 coefficients per channel, linear radiance. */
  readonly shR: Float32Array;
  readonly shG: Float32Array;
  readonly shB: Float32Array;
  /** 3 RGBA16F 3D textures (2d-array, layers = nz) for the shader path. */
  readonly textures: readonly [Texture, Texture, Texture];
}

const SH_L1_CELL_SIZE = 32;

export class IrradianceVolumeSystem {
  private volume: IrradianceVolume | null = null;
  private dirty = false;

  constructor(
    private readonly device: RenderDevice,
    private readonly renderFace: ReflectionFaceRenderer
  ) {}

  configure(spec: IrradianceVolumeSpec): void {
    const next = normalizeSpec(spec);
    if (this.volume && JSON.stringify(this.volume.spec) === JSON.stringify(next)) return;
    this.volume?.textures.forEach((t) => t.dispose());
    this.volume = null;
    this.pending = next;
    this.dirty = true;
  }

  private pending: Required<IrradianceVolumeSpec> | null = null;

  updateProbe(): void { this.dirty = true; }

  get(): IrradianceVolume | null { return this.volume; }

  /** Bake: capture each cell's 6 faces at 32 px → SH-project → pack. */
  update(): boolean {
    if (!this.dirty || !this.pending) return false;
    const spec = this.pending;
    const [nx, ny, nz] = spec.resolution;
    const cells = nx * ny * nz;
    const shR = new Float32Array(cells * 4);
    const shG = new Float32Array(cells * 4);
    const shB = new Float32Array(cells * 4);
    const size = spec.captureFaceSize;
    for (let iz = 0; iz < nz; iz += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let ix = 0; ix < nx; ix += 1) {
          const cell = (iz * ny + iy) * nx + ix;
          const pos = cellCenter(spec, ix, iy, iz);
          const sh = projectCubeToSH9(this.captureCell(pos, size), size);
          // SH L1 = coefficients 0..3 per channel (bands 0 + 1).
          for (let c = 0; c < 4; c += 1) {
            shR[cell * 4 + c] = sh[c * 3 + 0];
            shG[cell * 4 + c] = sh[c * 3 + 1];
            shB[cell * 4 + c] = sh[c * 3 + 2];
          }
        }
      }
    }
    const textures = [
      sh3DTexture(nx, ny, nz, shR, `${spec.name}-sh-r`),
      sh3DTexture(nx, ny, nz, shG, `${spec.name}-sh-g`),
      sh3DTexture(nx, ny, nz, shB, `${spec.name}-sh-b`)
    ] as const;
    this.volume?.textures.forEach((t) => t.dispose());
    this.volume = { spec, shR, shG, shB, textures };
    this.dirty = false;
    return true;
  }

  private captureCell(pos: readonly [number, number, number], size: number): Float32Array[] {
    const faces: Float32Array[] = [];
    for (let f = 0; f < 6; f += 1) {
      const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `iv-f${f}` });
      try {
        this.device.setRenderTarget(target);
        this.renderFace(f as 0 | 1 | 2 | 3 | 4 | 5, target, cubeFaceViewProjection(f as 0 | 1 | 2 | 3 | 4 | 5, pos));
        faces.push(this.device.readFloatPixels(0, 0, size, size));
      } finally {
        this.device.setRenderTarget(null);
        target.dispose();
      }
    }
    return faces;
  }

  /**
   * Trilinear SH-L1 sample with a 0.5·cell normal offset (leak reduction)
   * and a smooth fade at the bounds. Returns linear radiance RGB, or null
   * outside the volume's fade shell (PRD-02 §6.6: inside, E_probe replaces
   * E_SH with a smooth fade).
   */
  sample(point: readonly [number, number, number], normal: readonly [number, number, number]): readonly [number, number, number] | null {
    const v = this.volume;
    if (!v) return null;
    const { spec } = v;
    const cell = cellSize(spec);
    const p: [number, number, number] = [
      point[0] + normal[0] * cell[0] * 0.5,
      point[1] + normal[1] * cell[1] * 0.5,
      point[2] + normal[2] * cell[2] * 0.5
    ];
    const t = fadeOutside(spec, p);
    if (t <= 0) return null;
    const sh = trilinearL1(v, p);
    const irradiance = evalShL1(sh, normal);
    return [
      Math.max(0, irradiance[0] * spec.intensity * t),
      Math.max(0, irradiance[1] * spec.intensity * t),
      Math.max(0, irradiance[2] * spec.intensity * t)
    ];
  }
}

function normalizeSpec(spec: IrradianceVolumeSpec): Required<IrradianceVolumeSpec> {
  const resolution = spec.resolution ?? [4, 4, 4];
  for (const r of resolution) {
    if (!Number.isInteger(r) || r < 1 || r > 8) throw new RangeError("irradiance volume resolution must be 1..8 per axis");
  }
  return {
    name: spec.name,
    min: spec.min,
    max: spec.max,
    resolution: [resolution[0], resolution[1], resolution[2]],
    intensity: spec.intensity ?? 1,
    update: spec.update ?? "once",
    captureFaceSize: spec.captureFaceSize ?? SH_L1_CELL_SIZE
  };
}

function cellSize(spec: Required<IrradianceVolumeSpec>): [number, number, number] {
  return [
    (spec.max[0] - spec.min[0]) / spec.resolution[0],
    (spec.max[1] - spec.min[1]) / spec.resolution[1],
    (spec.max[2] - spec.min[2]) / spec.resolution[2]
  ];
}

function cellCenter(spec: Required<IrradianceVolumeSpec>, ix: number, iy: number, iz: number): [number, number, number] {
  const c = cellSize(spec);
  return [
    spec.min[0] + (ix + 0.5) * c[0],
    spec.min[1] + (iy + 0.5) * c[1],
    spec.min[2] + (iz + 0.5) * c[2]
  ];
}

/** 1 inside, smooth fade over half a cell outside, 0 beyond. */
function fadeOutside(spec: Required<IrradianceVolumeSpec>, p: readonly [number, number, number]): number {
  const c = cellSize(spec);
  let fade = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const over = Math.max(spec.min[axis] - p[axis], p[axis] - spec.max[axis]);
    if (over > 0) fade = Math.min(fade, Math.max(0, 1 - over / (c[axis] * 0.5)));
  }
  return fade;
}

function trilinearL1(v: IrradianceVolume, p: readonly [number, number, number]): Float32Array {
  const { spec } = v;
  const [nx, ny, nz] = spec.resolution;
  const c = cellSize(spec);
  const gx = Math.min(Math.max((p[0] - spec.min[0]) / c[0] - 0.5, 0), nx - 1.001);
  const gy = Math.min(Math.max((p[1] - spec.min[1]) / c[1] - 0.5, 0), ny - 1.001);
  const gz = Math.min(Math.max((p[2] - spec.min[2]) / c[2] - 0.5, 0), nz - 1.001);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
  const fx = gx - x0, fy = gy - y0, fz = gz - z0;
  const out = new Float32Array(12); // 4 coeffs × 3 channels
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        const cell = (Math.min(z0 + dz, nz - 1) * ny + Math.min(y0 + dy, ny - 1)) * nx + Math.min(x0 + dx, nx - 1);
        for (let k = 0; k < 4; k += 1) {
          out[k * 3 + 0] += w * v.shR[cell * 4 + k];
          out[k * 3 + 1] += w * v.shG[cell * 4 + k];
          out[k * 3 + 2] += w * v.shB[cell * 4 + k];
        }
      }
    }
  }
  return out;
}

/** Irradiance from SH L1 (projectCubeToSH9's interleaved layout): Σᵢ
 *  sh[i·3+ch]·Bᵢ(n) for i<4, basis [c0, −c1·y, c1·z, −c1·x]. */
function evalShL1(sh: Float32Array, n: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const [x, y, z] = [n[0] / l, n[1] / l, n[2] / l];
  const c0 = 0.282095, c1 = 0.488603;
  const basis = [c0, -c1 * y, c1 * z, -c1 * x];
  return [
    sh[0]! * basis[0]! + sh[3]! * basis[1]! + sh[6]! * basis[2]! + sh[9]! * basis[3]!,
    sh[1]! * basis[0]! + sh[4]! * basis[1]! + sh[7]! * basis[2]! + sh[10]! * basis[3]!,
    sh[2]! * basis[0]! + sh[5]! * basis[1]! + sh[8]! * basis[2]! + sh[11]! * basis[3]!
  ];
}

function sh3DTexture(nx: number, ny: number, nz: number, data: Float32Array, label: string): Texture {
  // Texture's 2d-array upload path is a C-18 seam (TextureUpload handles 2D and
  // cube only): layers ride as per-layer mipLevels entries — mipLevels[z] is
  // the nx×ny RGBA16F slice for grid layer z.
  const mipLevels = Array.from({ length: nz }, (_, z) => {
    const half = new Uint16Array(nx * ny * 4);
    for (let i = 0; i < nx * ny * 4; i += 1) {
      half[i] = floatToHalf(data[z * nx * ny * 4 + i]!);
    }
    return { width: nx, height: ny, data: half };
  });
  return new Texture({
    width: nx,
    height: ny,
    dimension: "2d-array",
    layers: nz,
    format: "rgba16f",
    label,
    mipLevels
  });
}

// minimal float32→float16 (per probeBuild.faceToHalf's contract)
function floatToHalf(value: number): number {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = value;
  const x = intView[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 112;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7bff;
  return sign | (exp << 10) | ((x & 0x7fffff) >>> 13);
}
