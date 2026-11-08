// PRD-02 §6.6 — `IrradianceVolume`: a grid of SH-L1 probes (4 coefficients ×
// RGB = 12 floats per cell). Each cell is captured at 32 px through the same
// `renderFace` seam, SH-projected, and stored in three RGBA16F array textures —
// one per colour channel, each texel holding (L0, L1₋₁, L1₀, L1₁). L2 (27
// floats) would need 7 RGBA textures and does not fit the 16-unit sampler
// budget (§6.10). Sampling is trilinear with a 0.5·cell normal offset for
// leak reduction and a smooth fade at the bounds. `once`/`on-demand` baking.

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import { Texture } from "../Texture";
import { cubeFaceViewProjection } from "../environment/probeBuild";
import { projectCubeToSH9 } from "../environment/SphericalHarmonics";
import { flipRows, type ReflectionFaceRenderer } from "./ReflectionProbeSystem";
import { webgl2DeviceHost } from "../webgl2/Counters";

export type { ReflectionFaceRenderer };

export interface IrradianceVolumeSpec {
  readonly name: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Grid cells per axis; 1..16 (the authored builder exposes 2..16). */
  readonly resolution?: readonly [number, number, number]; // default [4,4,4]
  readonly intensity?: number;                             // default 1
  readonly update?: "once" | "on-demand";                  // default "once"
  readonly captureFaceSize?: number;                       // default 32
  /** Maximum grid cells captured per frame; capped by the contributor's shared frame budget. */
  readonly maxUpdatesPerFrame?: number;                    // default 4, maximum 64
}

export interface IrradianceVolume {
  readonly spec: Required<IrradianceVolumeSpec>;
  /** (nx*ny*nz × 4) SH-L1 coefficients per channel, linear radiance. */
  readonly shR: Float32Array;
  readonly shG: Float32Array;
  readonly shB: Float32Array;
  /** 3 RGBA16F 2d-array textures (layers = nz) for the shader path. */
  readonly textures: readonly [Texture, Texture, Texture];
}

const SH_L1_CELL_SIZE = 32;
const MAX_VOLUME_AXIS = 16;
const MAX_FRAME_UPDATES = 64;

export interface IrradianceCaptureStep {
  /** Cells captured in this call. Each cell requires six face captures. */
  readonly work: number;
  /** True only when this call published a complete volume. */
  readonly completed: boolean;
}

interface IrradianceCaptureJob {
  readonly spec: Required<IrradianceVolumeSpec>;
  readonly configRevision: number;
  readonly updateRevision: number;
  readonly shR: Float32Array;
  readonly shG: Float32Array;
  readonly shB: Float32Array;
  cursor: number;
}

export class IrradianceVolumeSystem {
  private volume: IrradianceVolume | null = null;
  private dirty = false;
  private configRevision = 0;
  private updateRevision = 0;
  private disposed = false;
  private updating = false;
  private job: IrradianceCaptureJob | null = null;

  constructor(
    private readonly device: RenderDevice,
    private readonly renderFace: ReflectionFaceRenderer
  ) {}

  configure(spec: IrradianceVolumeSpec): void {
    this.assertAlive();
    const next = normalizeSpec(spec);
    if (this.pending && JSON.stringify(this.pending) === JSON.stringify(next)) return;
    validateDeviceLimits(this.device, next);
    this.volume?.textures.forEach((t) => t.dispose());
    this.volume = null;
    this.pending = next;
    this.dirty = true;
    this.configRevision += 1;
    this.updateRevision += 1;
    this.job = null;
  }

  private pending: Required<IrradianceVolumeSpec> | null = null;

  updateProbe(): void { this.assertAlive(); this.dirty = true; this.updateRevision += 1; }

  /** Drop a bake in progress so it restarts from cell 0; the last completed volume stays live. */
  restartPartialCapture(): void { this.assertAlive(); this.job = null; }

  get(): IrradianceVolume | null { return this.volume; }
  get maxUpdatesPerFrame(): number { return this.pending?.maxUpdatesPerFrame ?? 4; }

  /** Bake: capture each cell's 6 faces at 32 px → SH-project → pack. */
  update(): boolean {
    this.assertAlive();
    if (this.updating) throw new Error("irradiance capture is already in progress");
    this.updating = true;
    try { return this.updateSync(Number.MAX_SAFE_INTEGER).completed; } finally { this.updating = false; }
  }

  /** Capture a bounded number of cells, leaving the previous volume live until completion. */
  step(maxCells = this.maxUpdatesPerFrame): IrradianceCaptureStep {
    this.assertAlive();
    validateStep(maxCells);
    if (this.updating) throw new Error("irradiance capture is already in progress");
    this.updating = true;
    try { return this.updateSync(maxCells); } finally { this.updating = false; }
  }

  private updateSync(maxCells: number): IrradianceCaptureStep {
    const job = this.captureJob();
    if (!job) return { work: 0, completed: false };
    const [nx, ny, nz] = job.spec.resolution;
    const cells = nx * ny * nz;
    let work = 0;
    while (job.cursor < cells && work < maxCells) {
      const cell = job.cursor;
      const ix = cell % nx, iy = Math.floor(cell / nx) % ny, iz = Math.floor(cell / (nx * ny));
      const faces = this.captureCell(cellCenter(job.spec, ix, iy, iz), job.spec.captureFaceSize, job.configRevision);
      if (this.disposed || this.configRevision !== job.configRevision) return { work, completed: false };
      this.writeCell(job, cell, projectCubeToSH9(faces, job.spec.captureFaceSize));
      job.cursor += 1;
      work += 1;
    }
    return { work, completed: job.cursor === cells && this.finishJob(job) };
  }

  /** Same capture using async float readback, required by native WebGPU. */
  async updateAsync(): Promise<boolean> {
    this.assertAlive();
    if (this.updating) throw new Error("irradiance capture is already in progress");
    this.updating = true;
    try { return (await this.updateAsyncImpl(Number.MAX_SAFE_INTEGER)).completed; } finally { this.updating = false; }
  }

  /** Async bounded step, using native asynchronous readback when provided. */
  async stepAsync(maxCells = this.maxUpdatesPerFrame): Promise<IrradianceCaptureStep> {
    this.assertAlive();
    validateStep(maxCells);
    if (this.updating) throw new Error("irradiance capture is already in progress");
    this.updating = true;
    try { return await this.updateAsyncImpl(maxCells); } finally { this.updating = false; }
  }

  private async updateAsyncImpl(maxCells: number): Promise<IrradianceCaptureStep> {
    const job = this.captureJob();
    if (!job) return { work: 0, completed: false };
    const [nx, ny, nz] = job.spec.resolution;
    const cells = nx * ny * nz;
    let work = 0;
    while (job.cursor < cells && work < maxCells) {
      const cell = job.cursor;
      const ix = cell % nx, iy = Math.floor(cell / nx) % ny, iz = Math.floor(cell / (nx * ny));
      const faces = await this.captureCellAsync(cellCenter(job.spec, ix, iy, iz), job.spec.captureFaceSize, job.configRevision);
      if (this.disposed || this.configRevision !== job.configRevision) return { work, completed: false };
      this.writeCell(job, cell, projectCubeToSH9(faces, job.spec.captureFaceSize));
      job.cursor += 1;
      work += 1;
    }
    return { work, completed: job.cursor === cells && this.finishJob(job) };
  }

  private captureJob(): IrradianceCaptureJob | null {
    if (!this.dirty || !this.pending) return null;
    if (!this.job) {
      const count = this.pending.resolution[0] * this.pending.resolution[1] * this.pending.resolution[2] * 4;
      this.job = { spec: this.pending, configRevision: this.configRevision, updateRevision: this.updateRevision,
        shR: new Float32Array(count), shG: new Float32Array(count), shB: new Float32Array(count), cursor: 0 };
    }
    return this.job;
  }

  private writeCell(job: IrradianceCaptureJob, cell: number, sh: Float32Array): void {
    for (let c = 0; c < 4; c += 1) {
      job.shR[cell * 4 + c] = sh[c * 3];
      job.shG[cell * 4 + c] = sh[c * 3 + 1];
      job.shB[cell * 4 + c] = sh[c * 3 + 2];
    }
  }

  private finishJob(job: IrradianceCaptureJob): boolean {
    const completed = this.commit(job.spec, job.shR, job.shG, job.shB, job.configRevision, job.updateRevision);
    if (this.job === job) this.job = null;
    return completed;
  }

  private commit(spec: Required<IrradianceVolumeSpec>, shR: Float32Array, shG: Float32Array, shB: Float32Array,
    configRevision: number, updateRevision: number): boolean {
    if (this.disposed || this.configRevision !== configRevision) return false;
    const [nx, ny, nz] = spec.resolution;
    const allocated: Texture[] = [];
    try {
      allocated.push(shArrayTexture(nx, ny, nz, shR, `${spec.name}-sh-r`));
      allocated.push(shArrayTexture(nx, ny, nz, shG, `${spec.name}-sh-g`));
      allocated.push(shArrayTexture(nx, ny, nz, shB, `${spec.name}-sh-b`));
    } catch (error) {
      allocated.forEach((texture) => texture.dispose());
      throw error;
    }
    const textures = allocated as [Texture, Texture, Texture];
    this.volume?.textures.forEach((t) => t.dispose());
    this.volume = { spec, shR, shG, shB, textures };
    this.dirty = this.updateRevision !== updateRevision;
    return true;
  }

  private captureCell(pos: readonly [number, number, number], size: number, configRevision: number): Float32Array[] {
    const faces: Float32Array[] = [];
    for (let f = 0; f < 6; f += 1) {
      if (this.disposed || this.configRevision !== configRevision) return faces;
      const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `iv-f${f}` });
      const prevTarget = this.device.getRenderTarget?.() ?? null;
      try {
        this.device.setRenderTarget(target);
        this.renderFace(f as 0 | 1 | 2 | 3 | 4 | 5, target, cubeFaceViewProjection(f as 0 | 1 | 2 | 3 | 4 | 5, pos));
        const raw = this.device.readFloatPixels(0, 0, size, size);
        faces.push(this.device.kind === "webgl2" ? flipRows(raw, size, size) : raw);
      } finally {
        try { this.device.setRenderTarget(prevTarget); } finally { target.dispose(); }
      }
    }
    return faces;
  }

  private async captureCellAsync(pos: readonly [number, number, number], size: number, configRevision: number): Promise<Float32Array[]> {
    const faces: Float32Array[] = [];
    for (let f = 0; f < 6; f += 1) {
      if (this.disposed || this.configRevision !== configRevision) return faces;
      const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `iv-f${f}` });
      const prevTarget = this.device.getRenderTarget?.() ?? null;
      try {
        this.device.setRenderTarget(target);
        this.renderFace(f as 0 | 1 | 2 | 3 | 4 | 5, target, cubeFaceViewProjection(f as 0 | 1 | 2 | 3 | 4 | 5, pos));
        const raw = this.device.readFloatPixelsAsync
          ? await this.device.readFloatPixelsAsync(0, 0, size, size)
          : this.device.readFloatPixels(0, 0, size, size);
        faces.push(this.device.kind === "webgl2" || this.device.kind === "webgpu" ? flipRows(raw, size, size) : raw);
      } finally {
        try { this.device.setRenderTarget(prevTarget); } finally { target.dispose(); }
      }
    }
    return faces;
  }

  /** Release the published textures and invalidate any in-flight capture. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.configRevision += 1;
    this.pending = null;
    this.job = null;
    this.dirty = false;
    this.volume?.textures.forEach((texture) => texture.dispose());
    this.volume = null;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("irradiance volume system is disposed");
  }

  /**
   * Trilinear SH-L1 sample with a 0.5·cell normal offset (leak reduction)
   * and a smooth fade at the bounds. Returns linear irradiance RGB, or null
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
  if (!spec.name || !spec.name.trim()) throw new RangeError("irradiance volume name must be nonempty");
  if (resolution.length !== 3 || resolution.some((r) => !Number.isInteger(r) || r < 1 || r > MAX_VOLUME_AXIS)) {
    throw new RangeError(`irradiance volume resolution must be 1..${MAX_VOLUME_AXIS} per axis`);
  }
  if (spec.min.length !== 3 || spec.max.length !== 3 || spec.min.some((value, axis) =>
    !Number.isFinite(value) || !Number.isFinite(spec.max[axis]) || spec.max[axis] <= value || !Number.isFinite(spec.max[axis] - value))) {
    throw new RangeError("irradiance volume bounds must be finite with positive extents");
  }
  const intensity = spec.intensity ?? 1;
  if (!Number.isFinite(intensity) || intensity < 0) throw new RangeError("irradiance volume intensity must be finite and nonnegative");
  const update = spec.update ?? "once";
  if (update !== "once" && update !== "on-demand") throw new RangeError("unsupported irradiance update mode");
  const captureFaceSize = spec.captureFaceSize ?? SH_L1_CELL_SIZE;
  if (!Number.isInteger(captureFaceSize) || captureFaceSize < 1 || captureFaceSize > 128) throw new RangeError("irradiance capture face size must be 1..128");
  const maxUpdatesPerFrame = spec.maxUpdatesPerFrame ?? 4;
  validateStep(maxUpdatesPerFrame);
  return {
    name: spec.name,
    min: [spec.min[0], spec.min[1], spec.min[2]],
    max: [spec.max[0], spec.max[1], spec.max[2]],
    resolution: [resolution[0], resolution[1], resolution[2]],
    intensity,
    update,
    captureFaceSize,
    maxUpdatesPerFrame
  };
}

function validateStep(maxCells: number): void {
  if (!Number.isInteger(maxCells) || maxCells < 1 || maxCells > MAX_FRAME_UPDATES) {
    throw new RangeError(`irradiance updates per frame must be 1..${MAX_FRAME_UPDATES}`);
  }
}

/** Validate reported native limits; the conservative defaults are the API minima. */
function validateDeviceLimits(device: RenderDevice, spec: Required<IrradianceVolumeSpec>): void {
  let maxTextureSize = device.kind === "webgpu" ? 8192 : 2048;
  let maxArrayLayers = 256;
  const native = (device as RenderDevice & { readonly nativeGpuDevice?: { readonly limits?: Readonly<Record<string, number>> } }).nativeGpuDevice;
  if (device.kind === "webgpu" && native?.limits) {
    maxTextureSize = validDeviceLimit(native.limits.maxTextureDimension2D, maxTextureSize, "maxTextureDimension2D");
    maxArrayLayers = validDeviceLimit(native.limits.maxTextureArrayLayers, maxArrayLayers, "maxTextureArrayLayers");
  } else if (device.kind === "webgl2") {
    const gl = webgl2DeviceHost(device)?.gl;
    if (gl) {
      maxTextureSize = validDeviceLimit(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, maxTextureSize, "MAX_TEXTURE_SIZE");
      maxArrayLayers = validDeviceLimit(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number, maxArrayLayers, "MAX_ARRAY_TEXTURE_LAYERS");
    }
  }
  if (Math.max(spec.resolution[0], spec.resolution[1], spec.captureFaceSize) > maxTextureSize || spec.resolution[2] > maxArrayLayers) {
    throw new RangeError("irradiance volume exceeds the device texture size or array-layer limit");
  }
}

function validDeviceLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`device ${label} must be a positive integer`);
  return value;
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
  const gx = Math.min(Math.max((p[0] - spec.min[0]) / c[0] - 0.5, 0), nx - 1);
  const gy = Math.min(Math.max((p[1] - spec.min[1]) / c[1] - 0.5, 0), ny - 1);
  const gz = Math.min(Math.max((p[2] - spec.min[2]) / c[2] - 0.5, 0), nz - 1);
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

/** Cosine-convolved irradiance from radiance SH L1 in interleaved RGB order. */
function evalShL1(sh: Float32Array, n: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const [x, y, z] = [n[0] / l, n[1] / l, n[2] / l];
  const c0 = 0.282095, c1 = 0.488603;
  // Lambertian convolution scales l=0 by π and l=1 by 2π/3. Captures hold
  // radiance, so evaluating their bare SH basis would be missing this kernel.
  const basis = [c0 * Math.PI, -c1 * y * 2 * Math.PI / 3, c1 * z * 2 * Math.PI / 3, -c1 * x * 2 * Math.PI / 3];
  return [
    sh[0]! * basis[0]! + sh[3]! * basis[1]! + sh[6]! * basis[2]! + sh[9]! * basis[3]!,
    sh[1]! * basis[0]! + sh[4]! * basis[1]! + sh[7]! * basis[2]! + sh[10]! * basis[3]!,
    sh[2]! * basis[0]! + sh[5]! * basis[1]! + sh[8]! * basis[2]! + sh[11]! * basis[3]!
  ];
}

function shArrayTexture(nx: number, ny: number, nz: number, data: Float32Array, label: string): Texture {
  // A mip contains all array layers in z-major order; its pixels are RGBA SH
  // coefficients with x varying fastest, matching the capture and upload paths.
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i += 1) half[i] = floatToHalf(data[i]!);
  return new Texture({
    width: nx,
    height: ny,
    dimension: "2d-array",
    layers: nz,
    format: "rgba16f",
    colorSpace: "linear",
    generateMipmaps: false,
    label,
    mipLevels: [{ width: nx, height: ny, data: half }]
  });
}

const halfScratch = new Float32Array(1);
const halfBits = new Uint32Array(halfScratch.buffer);

// SH coefficients may be negative or subnormal, unlike radiance-only data.
// Round to nearest even, preserving signs and clamping overflow to finite HDR.
function floatToHalf(value: number): number {
  halfScratch[0] = value;
  const bits = halfBits[0]!;
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return sign | (mantissa ? 0x7e00 : 0x7bff);
  const halfExponent = exponent - 112;
  if (halfExponent >= 31) return sign | 0x7bff;
  if (halfExponent <= 0) {
    if (halfExponent < -10) return sign;
    const significand = mantissa | 0x800000;
    const shift = 14 - halfExponent;
    let rounded = significand >>> shift;
    const remainder = significand & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && (rounded & 1) !== 0)) rounded += 1;
    return sign | rounded;
  }
  let rounded = mantissa >>> 13;
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && (rounded & 1) !== 0)) rounded += 1;
  return sign | Math.min(0x7bff, (halfExponent << 10) + rounded);
}
