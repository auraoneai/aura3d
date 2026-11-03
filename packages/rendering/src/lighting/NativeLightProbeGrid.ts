import { Texture } from "../Texture";
import { NativeLightingResourceEvents, type NativeLightingResourceChange } from "./NativeLightingResourceEvents";

export type { NativeLightingResourceChange } from "./NativeLightingResourceEvents";

/** A three-dimensional grid of real, RGB-interleaved SH9 radiance probes. */
export type ProbeVector3 = readonly [number, number, number];
export type ProbeGridBackend = "webgl2" | "webgpu";
export type ProbeOutsidePolicy = "null" | "clamp";

export interface NativeLightProbeGridOptions {
  /** Sample positions span the bounds, inclusive; singleton axes use the midpoint. */
  readonly min: ProbeVector3;
  readonly max: ProbeVector3;
  readonly dimensions: readonly [number, number, number];
  /** Limits used for this grid; rendering requires a consumer of renderData(). */
  readonly backend?: ProbeGridBackend;
  /** Optional stricter application budget; cannot raise the backend limit. */
  readonly maxProbes?: number;
}

export interface NativeLightProbeGridSnapshot {
  readonly min: ProbeVector3;
  readonly max: ProbeVector3;
  readonly dimensions: readonly [number, number, number];
  readonly backend: ProbeGridBackend;
  /** Independent copy. Address as ((z * ny + y) * nx + x) * 27 + coefficient * 3 + channel. */
  readonly radianceSH9: Float32Array;
  readonly revision: number;
}

/**
 * Uploadable, grid-owned SH9 texture and the spatial metadata needed to use it.
 * Each RGBA32F texel contains one RGB radiance coefficient and an unused zero
 * alpha. For probe (x,y,z), coefficient k is at (x*9+k, y+z*ny). Probe
 * positions span min..max (a singleton axis uses its midpoint). Fetch exact
 * texels and trilinearly interpolate coefficients before SH evaluation; do not
 * use hardware linear filtering, which is optional for float32 textures. Bind
 * a nearest/non-filtering sampler where the renderer requires one.
 *
 * This resource is not bound to a scene or drawn automatically. Call
 * `renderData()` after updates and before a consuming draw to synchronize it.
 * The grid owns the texture and disposes it on `dispose()`; consumers must
 * not dispose or mutate it. `revision` identifies the uploaded CPU content.
 */
export interface NativeLightProbeGridRenderData {
  readonly texture: Texture;
  readonly min: ProbeVector3;
  readonly max: ProbeVector3;
  readonly dimensions: readonly [number, number, number];
  readonly revision: number;
}

/** Limits bound CPU allocation and the amount an adapter may choose to upload. */
export const NATIVE_LIGHT_PROBE_LIMITS = {
  webgl2: { maxAxis: 16, maxProbes: 4096 },
  webgpu: { maxAxis: 32, maxProbes: 32768 }
} as const;

const SH0 = 0.28209479177387814;
const MAX_FLOAT32 = 3.4028234663852886e38;

function validVector(value: readonly number[], label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) throw new RangeError(`${label} must contain three finite numbers`);
}

/**
 * Portable probe-grid sampling for WebGL2 and WebGPU. Coefficients represent
 * incident linear radiance in real SH9 basis order [1, -y, z, -x, xy, yz,
 * 3z²-1, xz, x²-y²], coefficient-major with RGB interleaved. `evaluate`
 * applies the Lambertian cosine-convolution kernel to return irradiance.
 * `renderData` exposes an uploadable texture, but no shader or implicit scene
 * binding is created by this class.
 */
export class NativeLightProbeGrid {
  readonly min: ProbeVector3;
  readonly max: ProbeVector3;
  readonly dimensions: readonly [number, number, number];
  readonly backend: ProbeGridBackend;
  readonly probeCount: number;
  private readonly coefficients: Float32Array;
  private disposed = false;
  private version = 0;
  private renderTexture: Texture | null = null;
  private renderVersion = -1;
  private readonly changes = new NativeLightingResourceEvents();

  constructor(options: NativeLightProbeGridOptions) {
    validVector(options.min, "min");
    validVector(options.max, "max");
    const backend = options.backend ?? "webgl2";
    if (backend !== "webgl2" && backend !== "webgpu") throw new RangeError("unsupported probe-grid backend");
    const limits = NATIVE_LIGHT_PROBE_LIMITS[backend];
    if (options.dimensions.length !== 3 || options.dimensions.some((n) => !Number.isInteger(n) || n < 1 || n > limits.maxAxis)) {
      throw new RangeError(`probe dimensions must contain three integers between 1 and ${limits.maxAxis}`);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      if (options.max[axis] <= options.min[axis] || !Number.isFinite(options.max[axis] - options.min[axis])) {
        throw new RangeError("probe-grid max must exceed min by a finite extent on every axis");
      }
    }
    const count = options.dimensions[0] * options.dimensions[1] * options.dimensions[2];
    if (options.maxProbes !== undefined && (!Number.isInteger(options.maxProbes) || options.maxProbes < 1 || options.maxProbes > limits.maxProbes)) {
      throw new RangeError(`maxProbes must be an integer between 1 and ${limits.maxProbes}`);
    }
    if (count > (options.maxProbes ?? limits.maxProbes)) throw new RangeError("probe-grid dimensions exceed the probe budget");
    this.min = Object.freeze([options.min[0], options.min[1], options.min[2]]);
    this.max = Object.freeze([options.max[0], options.max[1], options.max[2]]);
    this.dimensions = Object.freeze([options.dimensions[0], options.dimensions[1], options.dimensions[2]]);
    this.backend = backend;
    this.probeCount = count;
    this.coefficients = new Float32Array(count * 27);
  }

  get revision(): number { return this.version; }

  /**
   * Observe committed edits and disposal. The returned function detaches this
   * subscription; it never disposes the grid or its texture. Notifications are
   * ordered even when an observer makes another edit, and observer exceptions
   * do not interrupt other subscribers. A late subscriber receives disposal
   * immediately. The resource may have advanced beyond an event's revision
   * when a different observer performs a nested edit.
   */
  onChange(listener: (change: NativeLightingResourceChange) => void): () => void {
    return this.changes.subscribe(listener);
  }

  /** Updates exactly one probe, without retaining the caller's array. */
  setProbe(x: number, y: number, z: number, radianceSH9: ArrayLike<number>): void {
    const offset = this.offset(x, y, z);
    if (radianceSH9.length !== 27) throw new RangeError("probe must contain 27 SH9 RGB coefficients");
    for (let i = 0; i < 27; i += 1) {
      if (!Number.isFinite(radianceSH9[i]) || Math.abs(radianceSH9[i]) > MAX_FLOAT32) {
        throw new RangeError("probe coefficients must be finite float32 values");
      }
    }
    for (let i = 0; i < 27; i += 1) this.coefficients[offset + i] = radianceSH9[i];
    this.version += 1;
    this.changes.emit(this.version);
  }

  /** Writes constant irradiance into a probe as the corresponding radiance L0 coefficient. */
  setProbeIrradiance(x: number, y: number, z: number, rgb: ProbeVector3): void {
    validVector(rgb, "irradiance");
    if (rgb.some((n) => n < 0)) throw new RangeError("irradiance cannot be negative");
    const sh = new Float64Array(27);
    for (let channel = 0; channel < 3; channel += 1) sh[channel] = rgb[channel] / (Math.PI * SH0);
    this.setProbe(x, y, z, sh);
  }

  getProbePosition(x: number, y: number, z: number): [number, number, number] {
    this.offset(x, y, z);
    return [x, y, z].map((index, axis) => this.dimensions[axis] === 1
      ? this.min[axis] + (this.max[axis] - this.min[axis]) / 2
      : this.min[axis] + (this.max[axis] - this.min[axis]) * index / (this.dimensions[axis] - 1)) as [number, number, number];
  }

  /** Trilinearly interpolates all 27 coefficients, returning an owned array. */
  sample(position: ProbeVector3, outside: ProbeOutsidePolicy = "null"): Float32Array | null {
    this.assertAlive();
    validVector(position, "position");
    if (outside !== "null" && outside !== "clamp") throw new RangeError("outside policy must be null or clamp");
    if (outside === "null" && position.some((n, axis) => n < this.min[axis] || n > this.max[axis])) return null;
    const coordinates = position.map((p, axis) => Math.min(this.dimensions[axis] - 1,
      Math.max(0, (p - this.min[axis]) / (this.max[axis] - this.min[axis]) * (this.dimensions[axis] - 1))));
    const low = coordinates.map(Math.floor);
    const high = low.map((n, axis) => Math.min(n + 1, this.dimensions[axis] - 1));
    const fraction = coordinates.map((n, axis) => n - low[axis]);
    const result = new Float32Array(27);
    for (let dz = 0; dz < 2; dz += 1) for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
      const weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
      if (weight === 0) continue;
      const offset = this.offset(dx ? high[0] : low[0], dy ? high[1] : low[1], dz ? high[2] : low[2]);
      for (let i = 0; i < 27; i += 1) result[i] += this.coefficients[offset + i] * weight;
    }
    return result;
  }

  /** Evaluates cosine-integrated linear irradiance; negative SH ringing is clamped. */
  evaluate(position: ProbeVector3, normal: ProbeVector3, outside: ProbeOutsidePolicy = "null"): [number, number, number] | null {
    validVector(normal, "normal");
    const length = Math.hypot(...normal);
    if (length === 0 || !Number.isFinite(length)) throw new RangeError("normal must have finite nonzero length");
    const sh = this.sample(position, outside);
    if (!sh) return null;
    const [x, y, z] = normal.map((n) => n / length);
    const basis = [SH0 * Math.PI, -0.4886025119029199 * y * 2 * Math.PI / 3,
      0.4886025119029199 * z * 2 * Math.PI / 3, -0.4886025119029199 * x * 2 * Math.PI / 3,
      1.0925484305920792 * x * y * Math.PI / 4, 1.0925484305920792 * y * z * Math.PI / 4,
      0.31539156525252005 * (3 * z * z - 1) * Math.PI / 4, 1.0925484305920792 * x * z * Math.PI / 4,
      0.5462742152960396 * (x * x - y * y) * Math.PI / 4];
    const result: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 9; i += 1) for (let channel = 0; channel < 3; channel += 1) result[channel] += sh[i * 3 + channel] * basis[i];
    return result.map((n) => Math.max(0, n)) as [number, number, number];
  }

  snapshot(): NativeLightProbeGridSnapshot {
    this.assertAlive();
    return { min: [...this.min], max: [...this.max], dimensions: [...this.dimensions], backend: this.backend,
      radianceSH9: this.coefficients.slice(), revision: this.version };
  }

  /** Synchronize and return the portable data texture for an explicit renderer consumer. */
  renderData(): NativeLightProbeGridRenderData {
    this.assertAlive();
    if (!this.renderTexture || this.renderTexture.disposed || this.renderVersion !== this.version) {
      const [nx, ny, nz] = this.dimensions;
      const width = nx * 9;
      const height = ny * nz;
      const packed = new Float32Array(width * height * 4);
      for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
        const source = ((z * ny + y) * nx + x) * 27;
        for (let coefficient = 0; coefficient < 9; coefficient += 1) {
          const target = ((y + z * ny) * width + x * 9 + coefficient) * 4;
          for (let channel = 0; channel < 3; channel += 1) packed[target + channel] = this.coefficients[source + coefficient * 3 + channel];
        }
      }
      if (!this.renderTexture || this.renderTexture.disposed) {
        this.renderTexture = new Texture({ width, height, format: "rgba32f", colorSpace: "linear", data: packed, dynamic: true,
          generateMipmaps: false, label: "native-light-probe-grid" });
      } else {
        this.renderTexture.updateMip(0, packed);
      }
      this.renderVersion = this.version;
    }
    return { texture: this.renderTexture, min: this.min, max: this.max, dimensions: this.dimensions, revision: this.renderVersion };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderTexture?.dispose();
    this.renderTexture = null;
    this.coefficients.fill(0);
    this.version += 1;
    this.changes.emit(this.version, true);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("probe grid is disposed");
  }

  private offset(x: number, y: number, z: number): number {
    this.assertAlive();
    const indices = [x, y, z];
    if (indices.some((n, axis) => !Number.isInteger(n) || n < 0 || n >= this.dimensions[axis])) {
      throw new RangeError("probe index is outside the grid");
    }
    return ((z * this.dimensions[1] + y) * this.dimensions[0] + x) * 27;
  }
}
