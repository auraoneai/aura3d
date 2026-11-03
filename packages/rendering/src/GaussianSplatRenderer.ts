import type { RenderBuffer, RenderDevice, RenderShaderProgram, ShaderSources } from "./RenderDevice";
import { VertexFormat } from "./VertexFormat";

/** Arrays returned by the splat loader, expressed in the asset's declared local coordinate system. */
export interface GaussianSplatCloud {
  readonly count: number;
  readonly positions: Float32Array;
  readonly scales: Float32Array;
  /** Normalized x, y, z, w quaternions. */
  readonly rotations: Float32Array;
  readonly colors: Float32Array;
  readonly opacities: Float32Array;
  /** Per-splat RGB triples, ordered by degree and m=-l..l, excluding DC. */
  readonly sphericalHarmonics?: Float32Array;
  readonly shDegree: 0 | 1 | 2 | 3 | 4;
  /** The 16 SPZ axis labels are supported. When absent, the input is assumed to use RUB. */
  readonly metadata?: { readonly colorSpace?: "srgb_rec709_display" | "lin_rec709_display"; readonly coordinateSystem?: string; readonly extras?: Readonly<Record<string, unknown>> };
}

export interface GaussianSplatRenderOptions {
  /** Hard allocation bound, checked before allocating buffers. Default 1,000,000. */
  readonly maxSplats?: number;
  /** Maximum GPU instance-buffer size. Default 64 MiB. */
  readonly maxGpuBytes?: number;
  /** Maximum projected radius in pixels per principal axis. Default 2048. */
  readonly maxRadiusPx?: number;
  /** Gaussian cutoff in standard deviations, between 0 and 4. Default 3. */
  readonly sigmaCutoff?: number;
  /** Discard samples with opacity at or below this threshold. Default 1/255. */
  readonly opacityCutoff?: number;
}

export interface GaussianSplatDrawInput {
  /** Column-major, OpenGL clip-space matrices. */
  readonly viewMatrix: ArrayLike<number>;
  readonly projectionMatrix: ArrayLike<number>;
  /** Asset-to-world transform in RUB scene coordinates, after the asset basis conversion. */
  readonly modelMatrix?: ArrayLike<number>;
  /** Current drawing buffer width and height, in pixels. */
  readonly viewport: readonly [number, number];
  /** Optional world-space camera position; otherwise derived from the view matrix. */
  readonly cameraPosition?: readonly [number, number, number];
}

export interface GaussianSplatFrame {
  readonly visibleCount: number;
  /** Asset indices in the exact back-to-front submission order. */
  readonly order: Uint32Array;
  readonly backend: RenderDevice["kind"];
  readonly colorSpace: "srgb_rec709_display" | "lin_rec709_display";
}

/** Frame-local CPU projection retained while this frame is referenced. `order` is a copy; `distanceAt` uses its original sorted order. */
export interface GaussianSplatPreparedFrame extends GaussianSplatFrame {
  /** Radial world-space distance from camera to splat center. */
  distanceAt(sortedIndex: number): number;
}

/** A contiguous part of one prepared cloud, suitable for a transparent queue. */
export interface GaussianSplatTransparentRun {
  readonly sortDepth: number;
  readonly start: number;
  readonly count: number;
  /** Color space of the SH-evaluated values submitted by `draw`. */
  readonly colorSpace: GaussianSplatFrame["colorSpace"];
  /** Submit source-space values into the currently bound compatible target. */
  draw(): void;
}

interface PreparedSplatData {
  readonly projected: Float32Array;
  readonly sorted: Uint32Array;
  readonly distances: Float64Array;
  readonly view: readonly number[];
  readonly projection: readonly number[];
  readonly camera: readonly number[];
  readonly viewport: readonly [number, number];
}

const STRIDE_FLOATS = 11;
const STRIDE_BYTES = STRIDE_FLOATS * 4;
export const GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS = 1_000_000;
export const GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES = 64 * 1024 * 1024;

/**
 * Exact byte length of one cloud renderer's instance buffer. The fixed quad
 * buffer, shader objects, driver overhead, and CPU frame snapshots are not
 * included. Multiple transformed instances of the same cloud share this
 * allocation; distinct cloud renderers each require their own buffer.
 */
export function gaussianSplatGpuInstanceBytes(count: number): number {
  positiveInteger(count, "splat count");
  const bytes = count * STRIDE_BYTES;
  if (!Number.isSafeInteger(bytes)) throw new RangeError("splat instance buffer byte length must be a safe integer");
  return bytes;
}

const QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
const QUAD_FORMAT = new VertexFormat([{ semantic: "position", components: 2, offset: 0, shaderName: "aCorner", shaderLocation: 0 }], 8);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const COORDINATE_SYSTEMS = new Set([
  "LDB", "RDB", "LUB", "RUB", "LDF", "RDF", "LUF", "RUF",
  "LFD", "RFD", "LFU", "RFU", "LBD", "RBD", "LBU", "RBU"
]);

/** Columns are the source x, y, z axes written in RUB scene coordinates. */
function coordinateBasis(system = "RUB"): number[] {
  if (!COORDINATE_SYSTEMS.has(system)) throw new RangeError(`unsupported splat coordinate system: ${system}`);
  const axis: Readonly<Record<string, readonly [number, number, number]>> = {
    R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], B: [0, 0, 1], F: [0, 0, -1]
  };
  const x = axis[system[0]!]!, y = axis[system[1]!]!, z = axis[system[2]!]!;
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1];
}

/**
 * Orthogonal polar factor Q of the model's linear transform M = Q S.
 * This rotates SH with the model without distorting it by nonuniform scale.
 * It also gives a defined closest orthogonal orientation for an affine shear
 * or reflection. A collapsed direction has no unique SH orientation.
 * Matrices here are row-major; scaled Newton iteration keeps anisotropy bounded.
 */
function modelOrientation(model: readonly number[]): number[] {
  let q = [model[0]!, model[4]!, model[8]!, model[1]!, model[5]!, model[9]!, model[2]!, model[6]!, model[10]!];
  const scale = Math.max(...q.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) throw new RangeError("modelMatrix must be invertible for spherical harmonics");
  for (let iteration = 0; iteration < 32; iteration++) {
    // Multiplying a matrix by a positive scalar preserves its polar factor.
    // Renormalize every iteration so cofactors do not overflow after a very
    // anisotropic, but still invertible, input takes its first Newton step.
    const magnitude = Math.max(...q.map(Math.abs));
    if (!Number.isFinite(magnitude) || magnitude === 0) throw new RangeError("modelMatrix is too singular for spherical harmonics");
    q = q.map((value) => value / magnitude);
    const [a, b, c, d, e, f, g, h, i] = q as [number, number, number, number, number, number, number, number, number];
    const cofactors = [e * i - f * h, f * g - d * i, d * h - e * g,
      c * h - b * i, a * i - c * g, b * g - a * h,
      b * f - c * e, c * d - a * f, a * e - b * d];
    const det = a * cofactors[0]! + b * cofactors[1]! + c * cofactors[2]!;
    if (!Number.isFinite(det) || det === 0) throw new RangeError("modelMatrix must be invertible for spherical harmonics");
    const inverseTranspose = cofactors.map((value) => value / det);
    const norm = Math.hypot(...q), inverseNorm = Math.hypot(...inverseTranspose);
    const gamma = Math.sqrt(inverseNorm) / Math.sqrt(norm);
    if (!Number.isFinite(gamma) || gamma === 0) throw new RangeError("modelMatrix is too singular for spherical harmonics");
    const next = q.map((value, index) => 0.5 * (gamma * value + inverseTranspose[index]! / gamma));
    let error = 0;
    for (let column = 0; column < 3; column++) for (let other = 0; other < 3; other++) {
      const dot = next[column]! * next[other]! + next[3 + column]! * next[3 + other]! + next[6 + column]! * next[6 + other]!;
      error = Math.max(error, Math.abs(dot - (column === other ? 1 : 0)));
    }
    q = next;
    if (error <= 1e-12) return q;
  }
  throw new RangeError("modelMatrix orientation did not converge for spherical harmonics");
}

/** The projected center and axes are computed from the full 3D covariance each frame. */
export const GAUSSIAN_SPLAT_SHADER: ShaderSources = {
  label: "gaussian-splat",
  marker: "AURA_GAUSSIAN_SPLAT",
  vertex: `#version 300 es
// AURA_GAUSSIAN_SPLAT
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec4 aAxes;
layout(location=3) in vec4 aColor;
out vec2 vGaussian;
out vec4 vColor;
void main() {
  vec2 offset = aAxes.xy * aCorner.x + aAxes.zw * aCorner.y;
  gl_Position = vec4(aCenter.xy + offset, aCenter.z, 1.0);
  vGaussian = aCorner;
  vColor = aColor;
}`,
  fragment: `#version 300 es
// AURA_GAUSSIAN_SPLAT
precision highp float;
in vec2 vGaussian;
in vec4 vColor;
out vec4 outColor;
void main() {
  float r2 = dot(vGaussian, vGaussian);
  if (r2 > 1.0) discard;
  float alpha = vColor.a * exp(-0.5 * r2 * 9.00000000);
  if (alpha <= 0.0039215686) discard;
  outColor = vec4(max(vColor.rgb, vec3(0.0)), alpha);
}`,
  webgpu: {
    vertex: `struct VertexOutput { @builtin(position) position: vec4f, @location(0) gaussian: vec2f, @location(1) color: vec4f };
@vertex fn vs_main(@location(0) corner: vec2f, @location(1) center: vec3f, @location(2) axes: vec4f, @location(3) color: vec4f) -> VertexOutput {
  var out: VertexOutput;
  let offset = axes.xy * corner.x + axes.zw * corner.y;
  out.position = vec4f(center.xy + offset, (center.z + 1.0) * 0.5, 1.0);
  out.gaussian = corner;
  out.color = color;
  return out;
}`,
    fragment: `@fragment fn fs_main(@location(0) gaussian: vec2f, @location(1) color: vec4f) -> @location(0) vec4f {
  let r2 = dot(gaussian, gaussian);
  if (r2 > 1.0) { discard; }
  let alpha = color.a * exp(-0.5 * r2 * 9.00000000);
  if (alpha <= 0.0039215686) { discard; }
  return vec4f(max(color.rgb, vec3f(0.0)), alpha);
}`
  },
  portableBindings: []
};

function matrix(value: ArrayLike<number>, name: string): number[] {
  if (value.length !== 16) throw new RangeError(`${name} must have 16 elements`);
  const result = Array.from(value);
  if (!result.every(Number.isFinite)) throw new RangeError(`${name} must be finite`);
  return result;
}
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}
function cameraFromView(v: readonly number[]): [number, number, number] {
  // Invert the affine 3x3 rather than assuming the supplied view is orthonormal.
  if (Math.abs(v[3]!) + Math.abs(v[7]!) + Math.abs(v[11]!) > 1e-8 || Math.abs(v[15]! - 1) > 1e-8) throw new RangeError("viewMatrix must be affine");
  const a = v[0]!, b = v[4]!, c = v[8]!, d = v[1]!, e = v[5]!, f = v[9]!, g = v[2]!, h = v[6]!, i = v[10]!;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new RangeError("viewMatrix must be invertible");
  const x = -v[12]!, y = -v[13]!, z = -v[14]!;
  return [((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / det,
    ((f * g - d * i) * x + (a * i - c * g) * y + (c * d - a * f) * z) / det,
    ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / det];
}
function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
}
function validateCloud(data: GaussianSplatCloud, maxSplats: number): void {
  positiveInteger(data.count, "splat count");
  if (data.count > maxSplats) throw new RangeError("splat count exceeds maxSplats");
  if (![0, 1, 2, 3, 4].includes(data.shDegree)) throw new RangeError("unsupported spherical harmonics degree");
  const entries: readonly [string, Float32Array | undefined, number][] = [
    ["positions", data.positions, data.count * 3], ["scales", data.scales, data.count * 3],
    ["rotations", data.rotations, data.count * 4], ["colors", data.colors, data.count * 3],
    ["opacities", data.opacities, data.count], ["sphericalHarmonics", data.sphericalHarmonics, data.count * ((data.shDegree + 1) ** 2 - 1) * 3]
  ];
  for (const [name, values, length] of entries) {
    if (!length && values === undefined) continue;
    if (!(values instanceof Float32Array) || values.length !== length) throw new RangeError(`invalid ${name} layout`);
    for (const value of values) if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  for (let n = 0; n < data.count; n++) {
    if (data.scales[n * 3]! < 0 || data.scales[n * 3 + 1]! < 0 || data.scales[n * 3 + 2]! < 0) throw new RangeError("scales must be non-negative");
    if (data.opacities[n]! < 0 || data.opacities[n]! > 1) throw new RangeError("opacity must be in [0,1]");
    if (Math.hypot(...data.rotations.subarray(n * 4, n * 4 + 4)) < 1e-8) throw new RangeError("rotation must be nonzero");
  }
  const extensionTypes = data.metadata?.extras?.extensionTypes;
  if (extensionTypes !== undefined && (!Array.isArray(extensionTypes) || extensionTypes.some((type) => type !== 0xadbe0002 && type !== 0xadbe0003))) throw new RangeError("unsupported SPZ extension");
  coordinateBasis(data.metadata?.coordinateSystem);
  if (data.metadata?.colorSpace !== undefined && data.metadata.colorSpace !== "srgb_rec709_display" && data.metadata.colorSpace !== "lin_rec709_display") throw new RangeError("unsupported splat color space");
}

/** Real orthonormal SH with Condon–Shortley phase; m is ordered from -l to l. */
export function gaussianSphericalHarmonicBasis(degree: number, m: number, direction: readonly [number, number, number]): number {
  if (!Number.isInteger(degree) || degree < 0 || degree > 4 || !Number.isInteger(m) || Math.abs(m) > degree) throw new RangeError("invalid spherical harmonic index");
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length < 1e-12) throw new RangeError("direction must be finite and nonzero");
  const x = direction[0] / length, y = direction[1] / length, z = Math.max(-1, Math.min(1, direction[2] / length));
  const n = Math.abs(m);
  let p = 1;
  for (let j = 1; j <= n; j++) p *= -(2 * j - 1) * Math.sqrt(Math.max(0, 1 - z * z));
  if (degree > n) {
    let previous = p;
    p = (2 * n + 1) * z * p;
    for (let l = n + 2; l <= degree; l++) {
      const next = ((2 * l - 1) * z * p - (l + n - 1) * previous) / (l - n);
      previous = p; p = next;
    }
  }
  let ratio = 1;
  for (let j = degree - n + 1; j <= degree + n; j++) ratio /= j;
  const norm = Math.sqrt((2 * degree + 1) * ratio / (4 * Math.PI));
  if (!m) return norm * p;
  const angle = Math.atan2(y, x) * n;
  return Math.SQRT2 * norm * p * (m < 0 ? Math.sin(angle) : Math.cos(angle));
}

/**
 * Independent projected-Gaussian renderer. It owns its shader and buffers, not the device or input arrays.
 * Projection and stable sort are CPU-side; the GPU performs Gaussian shading, depth testing and blending.
 * Colors are blended in the supplied cloud color space, so the caller must bind a matching target.
 */
export class GaussianSplatRenderer {
  private quad!: RenderBuffer;
  private instances!: RenderBuffer;
  private program!: RenderShaderProgram;
  private readonly sources: ShaderSources;
  private generation: number | undefined;
  private readonly sigma: number;
  private readonly opacityCutoff: number;
  private readonly maxRadiusPx: number;
  private readonly basis: readonly number[];
  private readonly instanceBytes: number;
  private readonly prepared = new WeakMap<GaussianSplatPreparedFrame, PreparedSplatData>();
  private scratch = new Float32Array(0);
  private disposed = false;

  constructor(private readonly device: RenderDevice, private readonly data: GaussianSplatCloud, options: GaussianSplatRenderOptions = {}) {
    const maxSplats = options.maxSplats ?? GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS, maxGpuBytes = options.maxGpuBytes ?? GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES;
    positiveInteger(maxSplats, "maxSplats"); positiveInteger(maxGpuBytes, "maxGpuBytes");
    validateCloud(data, maxSplats);
    this.basis = coordinateBasis(data.metadata?.coordinateSystem);
    this.instanceBytes = gaussianSplatGpuInstanceBytes(data.count);
    if (this.instanceBytes > maxGpuBytes) throw new RangeError("splat GPU buffer exceeds maxGpuBytes");
    this.sigma = options.sigmaCutoff ?? 3;
    this.opacityCutoff = options.opacityCutoff ?? 1 / 255;
    this.maxRadiusPx = options.maxRadiusPx ?? 2048;
    if (!Number.isFinite(this.sigma) || this.sigma <= 0 || this.sigma > 4) throw new RangeError("sigmaCutoff must be in (0,4]");
    if (!Number.isFinite(this.opacityCutoff) || this.opacityCutoff < 0 || this.opacityCutoff >= 1) throw new RangeError("opacityCutoff must be in [0,1)");
    if (!Number.isFinite(this.maxRadiusPx) || this.maxRadiusPx <= 0) throw new RangeError("maxRadiusPx must be positive");
    if (device.disposed || device.contextLost) throw new Error("splat renderer requires a live device");
    this.assertSupportedDepth();
    const sigmaSquared = (this.sigma * this.sigma).toFixed(8);
    const cutoff = this.opacityCutoff.toFixed(10);
    const sources: ShaderSources = {
      ...GAUSSIAN_SPLAT_SHADER,
      fragment: GAUSSIAN_SPLAT_SHADER.fragment.replace("9.00000000", sigmaSquared).replace("0.0039215686", cutoff),
      webgpu: {
        vertex: GAUSSIAN_SPLAT_SHADER.webgpu!.vertex,
        fragment: GAUSSIAN_SPLAT_SHADER.webgpu!.fragment.replace("9.00000000", sigmaSquared).replace("0.0039215686", cutoff)
      }
    };
    this.sources = sources;
    this.createResources();
  }

  private createResources(): void {
    let quad: RenderBuffer | undefined, instances: RenderBuffer | undefined;
    try {
      quad = this.device.createBuffer("vertex", QUAD.byteLength, QUAD);
      instances = this.device.createBuffer("vertex", this.instanceBytes);
      const program = this.device.createShaderProgram(this.sources);
      this.quad = quad; this.instances = instances; this.program = program;
      this.generation = this.device.generation;
    } catch (error) { instances?.dispose(); quad?.dispose(); throw error; }
  }

  private ensureAvailable(): void {
    if (this.disposed || this.device.disposed || this.device.contextLost) throw new Error("splat renderer is disposed or device is unavailable");
    this.assertSupportedDepth();
    if (this.device.generation !== this.generation) {
      this.program.dispose(); this.instances.dispose(); this.quad.dispose();
      this.createResources();
    }
  }

  private assertSupportedDepth(): void {
    const mode = this.device.getDepthConvention?.().mode ?? (this.device as RenderDevice & { readonly depthConvention?: { readonly mode: string } }).depthConvention?.mode;
    if (mode !== undefined && mode !== "standard") throw new Error(`Gaussian splats do not support ${mode} depth`);
  }

  private preparedData(frame: GaussianSplatPreparedFrame): PreparedSplatData {
    const result = this.prepared.get(frame);
    if (!result) throw new Error("prepared splat frame does not belong to this renderer");
    return result;
  }

  /** Identity check for integrating the renderer into an existing device-owned frame. */
  belongsToDevice(device: RenderDevice): boolean { return this.device === device; }

  /** Reproject and sort without submitting. Each call owns a separate frame-local snapshot. */
  prepare(input: GaussianSplatDrawInput): GaussianSplatPreparedFrame {
    this.ensureAvailable();
    const view = matrix(input.viewMatrix, "viewMatrix"), projection = matrix(input.projectionMatrix, "projectionMatrix"), model = matrix(input.modelMatrix ?? IDENTITY, "modelMatrix");
    if (Math.abs(model[3]!) + Math.abs(model[7]!) + Math.abs(model[11]!) > 1e-8 || Math.abs(model[15]! - 1) > 1e-8) throw new RangeError("modelMatrix must be affine");
    const [width, height] = input.viewport;
    positiveInteger(width, "viewport width"); positiveInteger(height, "viewport height");
    const camera = input.cameraPosition ?? cameraFromView(view);
    if (camera.length !== 3 || !camera.every(Number.isFinite)) throw new RangeError("cameraPosition must be finite");
    const sceneModel = multiply(model, this.basis);
    const transform = multiply(multiply(projection, view), sceneModel);
    if (!sceneModel.every(Number.isFinite) || !transform.every(Number.isFinite)) throw new RangeError("splat transform must remain finite");
    const orientation = this.data.shDegree ? modelOrientation(model) : undefined;
    const projected = new Float32Array(this.data.count * STRIDE_FLOATS);
    const distances = new Float64Array(this.data.count);
    const order = new Uint32Array(this.data.count);
    let visible = 0;
    for (let n = 0; n < this.data.count; n++) {
      const pos = n * 3, rot = n * 4;
      const x = this.data.positions[pos]!, y = this.data.positions[pos + 1]!, z = this.data.positions[pos + 2]!;
      const cx = transform[0]! * x + transform[4]! * y + transform[8]! * z + transform[12]!;
      const cy = transform[1]! * x + transform[5]! * y + transform[9]! * z + transform[13]!;
      const cz = transform[2]! * x + transform[6]! * y + transform[10]! * z + transform[14]!;
      const cw = transform[3]! * x + transform[7]! * y + transform[11]! * z + transform[15]!;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(cw)) throw new RangeError("splat projection must remain finite");
      if (cw <= 1e-8 || this.data.opacities[n]! <= this.opacityCutoff) continue;
      const nx = cx / cw, ny = cy / cw, nz = cz / cw;
      if (nz < -1 || nz > 1) continue;
      const qlen = Math.hypot(this.data.rotations[rot]!, this.data.rotations[rot + 1]!, this.data.rotations[rot + 2]!, this.data.rotations[rot + 3]!);
      const qx = this.data.rotations[rot]! / qlen, qy = this.data.rotations[rot + 1]! / qlen, qz = this.data.rotations[rot + 2]! / qlen, qw = this.data.rotations[rot + 3]! / qlen;
      const axes = [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)],
        [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)],
        [2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)]
      ];
      const jx = [0, 1, 2].map((j) => (transform[j * 4]! * cw - cx * transform[j * 4 + 3]!) / (cw * cw) * width / 2);
      const jy = [0, 1, 2].map((j) => (transform[j * 4 + 1]! * cw - cy * transform[j * 4 + 3]!) / (cw * cw) * height / 2);
      let xx = 0, xy = 0, yy = 0;
      for (let j = 0; j < 3; j++) {
        const a = axes[j]!, scale = this.data.scales[pos + j]!;
        const u = (jx[0]! * a[0]! + jx[1]! * a[1]! + jx[2]! * a[2]!) * scale;
        const v = (jy[0]! * a[0]! + jy[1]! * a[1]! + jy[2]! * a[2]!) * scale;
        xx += u * u; xy += u * v; yy += v * v;
      }
      if (!Number.isFinite(xx) || !Number.isFinite(xy) || !Number.isFinite(yy)) throw new RangeError("projected splat covariance must remain finite");
      const delta = Math.hypot(xx - yy, 2 * xy), major = Math.max(0, (xx + yy + delta) / 2), minor = Math.max(0, (xx + yy - delta) / 2);
      if (!Number.isFinite(major) || !Number.isFinite(minor)) throw new RangeError("projected splat covariance must remain finite");
      if (major < 1e-12) continue;
      const theta = 0.5 * Math.atan2(2 * xy, xx - yy), co = Math.cos(theta), si = Math.sin(theta);
      const r1 = Math.min(this.maxRadiusPx, this.sigma * Math.sqrt(major)), r2 = Math.min(this.maxRadiusPx, this.sigma * Math.sqrt(minor));
      const ax = co * r1 * 2 / width, ay = si * r1 * 2 / height, bx = -si * r2 * 2 / width, by = co * r2 * 2 / height;
      if (Math.abs(nx) > 1 + Math.hypot(ax, bx) || Math.abs(ny) > 1 + Math.hypot(ay, by)) continue;
      const out = n * STRIDE_FLOATS;
      projected.set([nx, ny, nz, ax, ay, bx, by, this.data.colors[pos]!, this.data.colors[pos + 1]!, this.data.colors[pos + 2]!, this.data.opacities[n]!], out);
      for (let j = 0; j < 7; j++) if (!Number.isFinite(projected[out + j])) throw new RangeError("projected splat values must fit float32");
      const wx = sceneModel[0]! * x + sceneModel[4]! * y + sceneModel[8]! * z + sceneModel[12]! - camera[0];
      const wy = sceneModel[1]! * x + sceneModel[5]! * y + sceneModel[9]! * z + sceneModel[13]! - camera[1];
      const wz = sceneModel[2]! * x + sceneModel[6]! * y + sceneModel[10]! * z + sceneModel[14]! - camera[2];
      const distance = Math.hypot(wx, wy, wz);
      if (!Number.isFinite(distance)) throw new RangeError("splat camera distance must remain finite");
      if (this.data.shDegree) {
        const q = orientation!;
        const lx = q[0]! * wx + q[3]! * wy + q[6]! * wz;
        const ly = q[1]! * wx + q[4]! * wy + q[7]! * wz;
        const lz = q[2]! * wx + q[5]! * wy + q[8]! * wz;
        const direction: [number, number, number] = distance > 1e-12
          ? [this.basis[0]! * lx + this.basis[1]! * ly + this.basis[2]! * lz,
            this.basis[4]! * lx + this.basis[5]! * ly + this.basis[6]! * lz,
            this.basis[8]! * lx + this.basis[9]! * ly + this.basis[10]! * lz]
          : [0, 0, 1];
        const stride = ((this.data.shDegree + 1) ** 2 - 1) * 3;
        let k = 0;
        for (let l = 1; l <= this.data.shDegree; l++) for (let m = -l; m <= l; m++, k++) {
          const basis = gaussianSphericalHarmonicBasis(l, m, direction);
          for (let channel = 0; channel < 3; channel++) projected[out + 7 + channel]! += basis * this.data.sphericalHarmonics![n * stride + k * 3 + channel]!;
        }
      }
      if (!Number.isFinite(projected[out + 7]) || !Number.isFinite(projected[out + 8]) || !Number.isFinite(projected[out + 9])) throw new RangeError("splat color must remain finite");
      distances[n] = distance; order[visible++] = n;
    }
    const sorted = order.subarray(0, visible);
    sorted.sort((a, b) => distances[b]! - distances[a]! || a - b);
    const frame: GaussianSplatPreparedFrame = Object.freeze({
      visibleCount: visible, order: sorted.slice(), backend: this.device.kind,
      colorSpace: this.data.metadata?.colorSpace ?? "srgb_rec709_display",
      distanceAt(index: number): number {
        if (!Number.isSafeInteger(index) || index < 0 || index >= visible) throw new RangeError("splat sorted index out of range");
        return distances[sorted[index]!]!;
      }
    });
    this.prepared.set(frame, { projected, sorted, distances, view, projection, camera: [...camera], viewport: [width, height] });
    return frame;
  }

  /** Submit a contiguous range from a frame prepared by this renderer into the active target. */
  submitPrepared(frame: GaussianSplatPreparedFrame, start: number, count: number): void {
    this.ensureAvailable();
    const state = this.preparedData(frame);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0 || start + count > state.sorted.length) throw new RangeError("prepared splat range is out of bounds");
    if (count) {
      const length = count * STRIDE_FLOATS;
      if (this.scratch.length < length) this.scratch = new Float32Array(length);
      const packed = this.scratch.subarray(0, length);
      for (let i = 0; i < count; i++) {
        const offset = state.sorted[start + i]! * STRIDE_FLOATS;
        packed.set(state.projected.subarray(offset, offset + STRIDE_FLOATS), i * STRIDE_FLOATS);
      }
      this.device.updateBuffer(this.instances, 0, packed);
      this.device.draw({
        label: "gaussian-splat", topology: "triangles", vertexBuffer: this.quad, vertexFormat: QUAD_FORMAT, vertexCount: 6,
        instanceCount: count, shader: this.program,
        instanceAttributes: [
          { buffer: this.instances, shaderName: "aCenter", components: 3, offset: 0, stride: STRIDE_BYTES },
          { buffer: this.instances, shaderName: "aAxes", components: 4, offset: 12, stride: STRIDE_BYTES },
          { buffer: this.instances, shaderName: "aColor", components: 4, offset: 28, stride: STRIDE_BYTES }
        ],
        renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true, blendMode: "alpha" }
      });
    }
  }

  /** Reproject and submit a single cloud without interleaving other transparent objects. */
  draw(input: GaussianSplatDrawInput): GaussianSplatFrame {
    const frame = this.prepare(input);
    this.submitPrepared(frame, 0, frame.visibleCount);
    // Do not retain the projected CPU arrays merely because a caller keeps
    // the lightweight diagnostic returned by the single-cloud draw path.
    return { visibleCount: frame.visibleCount, order: frame.order, backend: frame.backend, colorSpace: frame.colorSpace };
  }

  /**
   * Merge prepared clouds into contiguous, back-to-front queue runs. Supply
   * every other transparent mesh/contributor distance as a boundary so no
   * run crosses it. These keys order whole mesh items by their sort centers;
   * they cannot resolve intersecting geometry at individual pixels. Frames
   * must share a device, view, projection, camera position and viewport. The
   * default run budget is 1,000,000; exceeding it throws before any run draws.
   */
  transparentRuns(
    entries: readonly { readonly renderer: GaussianSplatRenderer; readonly frame: GaussianSplatPreparedFrame }[],
    boundaries: readonly number[],
    options: { readonly maxRuns?: number } = {}
  ): readonly GaussianSplatTransparentRun[] {
    this.ensureAvailable();
    const maxRuns = options.maxRuns ?? 1_000_000;
    positiveInteger(maxRuns, "maxRuns");
    const splitDepths = [...boundaries];
    if (splitDepths.some((depth) => typeof depth !== "number" || Number.isNaN(depth))) throw new RangeError("transparent boundary depth must be numeric");
    splitDepths.sort((a, b) => a === b ? 0 : a > b ? -1 : 1);
    let reference: PreparedSplatData | undefined;
    const equal = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((value, i) => value === b[i]);
    const states = entries.map(({ renderer, frame }) => {
      if (renderer.device !== this.device) throw new Error("transparent splat frames must share a render device");
      renderer.ensureAvailable();
      const state = renderer.preparedData(frame);
      if (reference && (!equal(reference.view, state.view) || !equal(reference.projection, state.projection) || !equal(reference.camera, state.camera) || !equal(reference.viewport, state.viewport))) throw new Error("transparent splat frames must share the same camera view and viewport");
      reference ??= state;
      return state;
    });
    type Candidate = { readonly entry: number; readonly index: number; readonly distance: number };
    const heap: Candidate[] = [];
    const farther = (a: Candidate, b: Candidate): boolean => a.distance === b.distance ? a.entry < b.entry : a.distance > b.distance;
    const push = (value: Candidate): void => {
      let index = heap.length; heap.push(value);
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!farther(value, heap[parent]!)) break;
        heap[index] = heap[parent]!; index = parent;
      }
      heap[index] = value;
    };
    const pop = (): Candidate => {
      const top = heap[0]!, tail = heap.pop()!;
      if (heap.length) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1, right = left + 1;
          if (left >= heap.length) break;
          const child = right < heap.length && farther(heap[right]!, heap[left]!) ? right : left;
          if (!farther(heap[child]!, tail)) break;
          heap[index] = heap[child]!; index = child;
        }
        heap[index] = tail;
      }
      return top;
    };
    for (let entry = 0; entry < states.length; entry++) {
      const state = states[entry]!;
      if (state.sorted.length) push({ entry, index: 0, distance: state.distances[state.sorted[0]!]! });
    }
    const runs: GaussianSplatTransparentRun[] = [];
    let pending: { entry: number; start: number; count: number; sortDepth: number } | undefined;
    const flush = (): void => {
      if (!pending) return;
      if (runs.length >= maxRuns) throw new RangeError("transparent splat runs exceed maxRuns");
      const { entry, start, count, sortDepth } = pending;
      const { renderer, frame } = entries[entry]!;
      runs.push({ sortDepth, start, count, colorSpace: frame.colorSpace, draw: () => renderer.submitPrepared(frame, start, count) });
      pending = undefined;
    };
    let boundaryIndex = 0, previousDistance: number | undefined, boundaryAtPreviousDistance = false;
    while (heap.length) {
      const next = pop();
      if (previousDistance !== undefined && next.distance !== previousDistance && boundaryAtPreviousDistance) {
        flush(); boundaryAtPreviousDistance = false;
      }
      while (boundaryIndex < splitDepths.length && splitDepths[boundaryIndex]! >= next.distance) {
        flush();
        if (splitDepths[boundaryIndex] === next.distance) boundaryAtPreviousDistance = true;
        boundaryIndex++;
      }
      if (pending?.entry === next.entry) pending.count++;
      else { flush(); pending = { entry: next.entry, start: next.index, count: 1, sortDepth: next.distance }; }
      previousDistance = next.distance;
      const state = states[next.entry]!, index = next.index + 1;
      if (index < state.sorted.length) push({ entry: next.entry, index, distance: state.distances[state.sorted[index]!]! });
    }
    flush();
    return runs;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scratch = new Float32Array(0);
    this.program.dispose(); this.instances.dispose(); this.quad.dispose();
  }
}
