import { RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import { INDEPENDENT_LINEAR_DEPTH_COVERAGE_WGSL, INDEPENDENT_LINEAR_DEPTH_WGSL } from "./shaders/independentLinearDepth.wgsl";

const MIN_NORMAL_F32 = 1.1754943508222875e-38;
const MAX_DIMENSION = 16384;
const DEFAULT_BYTE_LIMIT = 512 * 1024 * 1024;
const MAX_BYTE_LIMIT = 2 * 1024 * 1024 * 1024;
// Reserve 32 f32 relative epsilons for the endpoint interpolation and divide.
const FAR_ARITHMETIC_MARGIN = 2 ** -18;
const PROJECTION_RELATIVE_TOLERANCE = 0.001;

export interface WebGPULinearDepthProjection {
  readonly kind: "perspective" | "orthographic";
  /** Logarithmic depth and shader-authored depth are not supported. */
  readonly mode: "standard" | "reversed";
  /** Clip convention of inverseProjection, before any raster clip remap. */
  readonly clipRange: "minus-one-to-one" | "zero-to-one";
  /** Column-major inverse of the exact projection used for this frame. */
  readonly inverseProjection: readonly number[] | Float32Array;
  readonly nearMeters: number;
  readonly farMeters: number;
  /** The window-depth viewport used for the depth attachment; currently [0, 1]. */
  readonly viewportDepthRange: readonly [number, number];
  readonly clearValue: 0 | 1;
}

export interface WebGPULinearDepthDraw {
  readonly label: string;
  readonly fragment: string;
  readonly entryPoint: string;
  readonly source: RenderTarget;
  /** Bind a non-comparison texture_depth_2d view of the depth aspect only. */
  readonly sourceAspect: "depth-only";
  /** Binding 2, present only in the coverage shader variant. */
  readonly coverage?: {
    readonly target: RenderTarget;
    readonly colorAttachment: number;
    readonly binding: 2;
    readonly sampleType: "float";
  };
  readonly target: RenderTarget;
  /** Binding 0 is this 32-byte uniform; binding 1 is the depth view. */
  readonly uniforms: Uint8Array;
}

/**
 * A native host checks ownership, generation and subresources, submits in
 * order, declares its depth/coverage reads and output write, and retains all
 * submitted resources through GPU use. It must reject native read/write
 * aliases even when distinct wrappers refer to the same native texture.
 * Target disposal must defer native destruction until submitted use completes.
 * A lost device invalidates its generation, disposes the driver, and retires
 * any device-owned allocation that could not pass the ownership check.
 */
export interface WebGPULinearDepthHost {
  createTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  /** Reject a foreign, stale, lost target or any of its foreign attachments. */
  assertTargetOwned(target: RenderTarget): void;
  draw(pass: WebGPULinearDepthDraw): void;
  deviceGeneration(): unknown;
  isDeviceLost(): boolean;
}

export interface WebGPULinearDepthCoverage {
  readonly target: RenderTarget;
  /** Index within target.colorTextures; zero is target.colorTexture. */
  readonly colorAttachment: number;
  /**
   * Caller asserts the selected rgba8 attachment was cleared to red 0 and
   * written with red 1, without blending, exactly for depth-updating samples
   * of this same frame, viewport and scissor. It must not be stale or receive
   * writes from fragments that did not update the corresponding depth.
   */
  readonly encoding: "depth-coverage-red8";
}

interface WebGPULinearDepthInputBase {
  /** Single-sample 2D target with a live sampleable depth24 attachment. */
  readonly source: RenderTarget;
  readonly projection: WebGPULinearDepthProjection;
  /**
   * Conservative upper bound including projection/quantization arithmetic.
   * It must cover the camera far plane with an f32 margin and remain strictly
   * below skyDepthMeters after f32 rounding.
   */
  readonly maxGeometryDepthMeters: number;
  readonly skyDepthMeters: number;
  readonly signal?: AbortSignal;
}

/**
 * Depth must be projection-derived with the supplied viewport and convention;
 * depth bias, custom depth or depth clamping cannot change that mapping.
 * Either supply a matching coverage attachment or guarantee that geometry can
 * never quantize to the clear value. A clear value alone cannot prove coverage.
 */
export type WebGPULinearDepthInput = WebGPULinearDepthInputBase & (
  | { readonly coverage: WebGPULinearDepthCoverage; readonly clearValueIsBackground?: false }
  | { readonly coverage?: undefined; readonly clearValueIsBackground: true }
);

export interface WebGPULinearDepthResult {
  /** Full-size, single-sample rgba32f color target; caller releases its lease. */
  readonly target: RenderTarget;
  release(): void;
}

interface PreparedProjection {
  readonly nearValue: number;
  readonly farValue: number;
  readonly maxGeometryDepth: number;
  readonly skyDepth: number;
  readonly clearDepth: 0 | 1;
  readonly perspective: boolean;
  readonly reversed: boolean;
}

function failure(message: string, code = "WEBGPU_LINEAR_DEPTH_INVALID"): never {
  throw new RenderDeviceError(message, code);
}

/** Round a positive finite number toward the selected end of its f32 interval. */
function positiveF32(value: number, direction: "down" | "up"): number {
  const nearest = Math.fround(value);
  if ((direction === "down" && nearest <= value) || (direction === "up" && nearest >= value)) return nearest;
  const bits = new DataView(new ArrayBuffer(4));
  bits.setFloat32(0, nearest, true);
  bits.setUint32(0, bits.getUint32(0, true) + (direction === "up" ? 1 : -1), true);
  return bits.getFloat32(0, true);
}

function prepareProjection(projection: WebGPULinearDepthProjection, maxGeometryDepthMeters: number, skyDepthMeters: number): PreparedProjection {
  if (!projection || (projection.kind !== "perspective" && projection.kind !== "orthographic")
    || (projection.mode !== "standard" && projection.mode !== "reversed")
    || (projection.clipRange !== "minus-one-to-one" && projection.clipRange !== "zero-to-one")) {
    failure("Linear depth requires a standard perspective or orthographic projection", "WEBGPU_LINEAR_DEPTH_PROJECTION_UNSUPPORTED");
  }
  if (!Array.isArray(projection.viewportDepthRange) || projection.viewportDepthRange.length !== 2
    || projection.viewportDepthRange[0] !== 0 || projection.viewportDepthRange[1] !== 1
    || projection.clearValue !== (projection.mode === "reversed" ? 0 : 1)) {
    failure("Linear depth requires the matching full viewport depth range and clear value", "WEBGPU_LINEAR_DEPTH_CONVENTION_UNSUPPORTED");
  }
  if (![projection.nearMeters, projection.farMeters, maxGeometryDepthMeters, skyDepthMeters]
    .every(value => typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value)))
    || projection.nearMeters < MIN_NORMAL_F32 || projection.farMeters <= projection.nearMeters
    || maxGeometryDepthMeters < MIN_NORMAL_F32 || skyDepthMeters > 100000
    || maxGeometryDepthMeters >= skyDepthMeters
    || Math.fround(maxGeometryDepthMeters) >= Math.fround(skyDepthMeters)) {
    failure("Linear depth requires finite near/far and representably separated geometry and sky bounds", "WEBGPU_LINEAR_DEPTH_RANGE_UNSUPPORTED");
  }

  const inverse = projection.inverseProjection;
  if (!(Array.isArray(inverse) || inverse instanceof Float32Array) || inverse.length !== 16
    || !Array.from(inverse).every(value => typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
    failure("Linear depth requires a finite 4x4 inverse projection", "WEBGPU_LINEAR_DEPTH_PROJECTION_UNSUPPORTED");
  }
  const m = Array.from(inverse, value => Math.fround(value));
  // z and w must not vary with image x or y. This explicitly excludes
  // oblique/custom depth projections rather than estimating their behavior.
  const xyDeterminant = m[0]! * m[5]! - m[4]! * m[1]!;
  if (m[2] !== 0 || m[6] !== 0 || m[3] !== 0 || m[7] !== 0 || !Number.isFinite(xyDeterminant) || xyDeterminant === 0
    || (projection.kind === "perspective" && (m[10] !== 0 || m[11] === 0 || m[14] === 0))
    || (projection.kind === "orthographic" && (m[11] !== 0 || m[10] === 0 || m[15] === 0))) {
    failure("Linear depth does not support oblique, singular or custom projections", "WEBGPU_LINEAR_DEPTH_PROJECTION_UNSUPPORTED");
  }
  const low = projection.clipRange === "minus-one-to-one" ? -1 : 0;
  const nearClip = projection.mode === "reversed" ? 1 : low;
  const farClip = projection.mode === "reversed" ? low : 1;
  const atClip = (z: number): number => -(m[10]! * z + m[14]!) / (m[11]! * z + m[15]!);
  const near = atClip(nearClip), far = atClip(farClip);
  const agrees = (value: number, expected: number): boolean =>
    Number.isFinite(value) && value >= MIN_NORMAL_F32 && Math.abs(value - expected) <= expected * PROJECTION_RELATIVE_TOLERANCE;
  if (!agrees(near, projection.nearMeters) || !agrees(far, projection.farMeters) || far <= near) {
    failure("Linear depth projection endpoints do not match the declared camera convention", "WEBGPU_LINEAR_DEPTH_PROJECTION_UNSUPPORTED");
  }

  // The shaders and target are f32. Round the geometry bound down and the sky
  // sentinel up so neither output crosses its caller-supplied double bound.
  const maxGeometryDepth = positiveF32(maxGeometryDepthMeters, "down");
  const skyDepth = positiveF32(skyDepthMeters, "up");
  const farWithMargin = Math.max(far, projection.farMeters) * (1 + FAR_ARITHMETIC_MARGIN);
  if (!(maxGeometryDepth >= farWithMargin) || !(maxGeometryDepth < skyDepth)) {
    failure("Linear depth geometry bound must cover the finite far plane and f32 arithmetic margin", "WEBGPU_LINEAR_DEPTH_RANGE_UNSUPPORTED");
  }
  const perspective = projection.kind === "perspective";
  const nearValue = Math.fround(perspective ? 1 / near : near);
  const farValue = Math.fround(perspective ? 1 / far : far);
  if (![nearValue, farValue].every(value => Number.isFinite(value) && value >= MIN_NORMAL_F32)) {
    failure("Linear depth coefficients are outside the normal f32 range", "WEBGPU_LINEAR_DEPTH_RANGE_UNSUPPORTED");
  }
  return { nearValue, farValue, maxGeometryDepth, skyDepth, clearDepth: projection.clearValue, perspective, reversed: projection.mode === "reversed" };
}

/**
 * CPU equivalent of the shader's bounded conversion, for source checks.
 * Omit coverageRed only when the caller has the clear-noncollision guarantee.
 */
export function linearizeWebGPUDepthSample(rawDepth: number, projection: WebGPULinearDepthProjection, maxGeometryDepthMeters: number, skyDepthMeters: number, coverageRed?: number): number {
  const prepared = prepareProjection(projection, maxGeometryDepthMeters, skyDepthMeters);
  if (coverageRed !== undefined) {
    if (coverageRed === 0) return prepared.skyDepth;
    if (coverageRed !== 1) return 0;
  }
  if (typeof rawDepth !== "number" || !Number.isFinite(rawDepth) || rawDepth < 0 || rawDepth > 1) return 0;
  const depth = Math.fround(rawDepth);
  if (coverageRed === undefined && depth === prepared.clearDepth) return prepared.skyDepth;
  const nearWeight = prepared.reversed ? depth : Math.fround(1 - depth);
  const farWeight = prepared.reversed ? Math.fround(1 - depth) : depth;
  const near = Math.fround(nearWeight * prepared.nearValue);
  const far = Math.fround(farWeight * prepared.farValue);
  const mixed = Math.fround(near + far);
  const metres = prepared.perspective ? Math.fround(1 / mixed) : mixed;
  return Number.isFinite(metres) && metres >= MIN_NORMAL_F32 && metres <= prepared.maxGeometryDepth ? metres : 0;
}

function validateCoverage(coverage: WebGPULinearDepthCoverage, source: RenderTarget): NonNullable<RenderTarget["colorTexture"]> {
  const target = coverage?.target;
  const attachment = coverage?.colorAttachment;
  if (!coverage || coverage.encoding !== "depth-coverage-red8" || !target || target.disposed
    || !Number.isSafeInteger(attachment) || attachment < 0 || attachment > 7
    || target.width !== source.width || target.height !== source.height
    || (target.sampleCount ?? 1) !== 1 || (target.dimension ?? "2d") !== "2d" || target.depthOnly
    || (target.attachmentMipLevel ?? 0) !== 0 || (target.attachmentLayer ?? 0) !== 0) {
    failure("Linear depth requires a matching single-sample 2D coverage attachment", "WEBGPU_LINEAR_DEPTH_COVERAGE_UNSUPPORTED");
  }
  const attachments = target.colorTextures;
  if (attachments !== undefined && (!Array.isArray(attachments) || attachments[0] !== target.colorTexture)) {
    failure("Linear depth coverage attachment metadata is invalid", "WEBGPU_LINEAR_DEPTH_COVERAGE_UNSUPPORTED");
  }
  const texture = attachments === undefined ? (attachment === 0 ? target.colorTexture : undefined) : attachments[attachment];
  if (!texture || texture.disposed || texture.dimension !== "2d" || texture.format !== "rgba8" || texture.colorSpace !== "linear"
    || texture.width !== source.width || texture.height !== source.height || !Array.isArray(texture.usage)
    || !texture.usage.includes("sampled") || !texture.usage.includes("render-attachment")
    || texture === source.colorTexture || texture === source.depthTexture) {
    failure("Linear depth coverage must use a distinct live linear rgba8 attachment", "WEBGPU_LINEAR_DEPTH_COVERAGE_UNSUPPORTED");
  }
  return texture;
}

function validateSource(source: RenderTarget): void {
  const depth = source?.depthTexture;
  if (!source || source.disposed || (source.sampleCount ?? 1) !== 1 || (source.dimension ?? "2d") !== "2d"
    || (source.attachmentMipLevel ?? 0) !== 0 || (source.attachmentLayer ?? 0) !== 0
    || !depth || depth.disposed || depth.dimension !== "2d" || depth.format !== "depth24"
    || depth.width !== source.width || depth.height !== source.height
    || !Array.isArray(depth.usage) || !depth.usage.includes("sampled") || !depth.usage.includes("render-attachment")) {
    failure("Linear depth requires a live single-sample sampleable 2D depth attachment", "WEBGPU_LINEAR_DEPTH_TARGET_UNSUPPORTED");
  }
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1
    || source.width > MAX_DIMENSION || source.height > MAX_DIMENSION) {
    failure("Linear depth target dimensions exceed the supported bounds", "WEBGPU_LINEAR_DEPTH_SIZE_UNSUPPORTED");
  }
}

function validateOutput(target: RenderTarget, width: number, height: number): void {
  const color = target?.colorTexture;
  if (!target || target.disposed || target.width !== width || target.height !== height
    || (target.sampleCount ?? 1) !== 1 || (target.dimension ?? "2d") !== "2d" || target.depthOnly || target.depthTexture
    || (target.attachmentMipLevel ?? 0) !== 0 || (target.attachmentLayer ?? 0) !== 0
    || !color || color.disposed || color.format !== "rgba32f" || color.colorSpace !== "linear" || color.dimension !== "2d"
    || color.width !== width || color.height !== height || !Array.isArray(color.usage)
    || !color.usage.includes("sampled") || !color.usage.includes("render-attachment")) {
    failure("Linear depth host must return a matching single-sample rgba32f color target", "WEBGPU_LINEAR_DEPTH_TARGET_UNSUPPORTED");
  }
}

function uniforms(prepared: PreparedProjection): Uint8Array {
  const data = new DataView(new ArrayBuffer(32));
  [prepared.nearValue, prepared.farValue, prepared.maxGeometryDepth, prepared.skyDepth, prepared.clearDepth]
    .forEach((value, index) => data.setFloat32(index * 4, value, true));
  data.setUint32(20, prepared.perspective ? 1 : 0, true);
  data.setUint32(24, prepared.reversed ? 1 : 0, true);
  return new Uint8Array(data.buffer);
}

/** Internal preparation building block; it requires a renderer/device host. */
export class WebGPULinearDepth {
  private readonly generation: unknown;
  private readonly outputs = new Map<RenderTarget, number>();
  private outputBytes = 0;
  private disposed = false;
  private executing = false;
  private readonly byteLimit: number;

  constructor(private readonly host: WebGPULinearDepthHost, options: { readonly maxBytes?: number } = {}) {
    if (!host || typeof host.assertTargetOwned !== "function" || typeof host.createTarget !== "function"
      || typeof host.draw !== "function" || typeof host.deviceGeneration !== "function" || typeof host.isDeviceLost !== "function") {
      failure("Linear depth requires a host with ownership and generation checks", "WEBGPU_LINEAR_DEPTH_HOST_UNSUPPORTED");
    }
    this.byteLimit = options.maxBytes ?? DEFAULT_BYTE_LIMIT;
    if (!Number.isSafeInteger(this.byteLimit) || this.byteLimit < 1 || this.byteLimit > MAX_BYTE_LIMIT) failure("Linear depth memory budget is invalid");
    this.generation = host.deviceGeneration();
    if (host.isDeviceLost()) failure("Linear depth device is lost", "WEBGPU_LINEAR_DEPTH_DEVICE_LOST");
  }

  execute(input: WebGPULinearDepthInput): WebGPULinearDepthResult {
    if (this.executing) failure("Linear depth execution cannot be reentered", "WEBGPU_LINEAR_DEPTH_REENTRANT");
    this.checkpoint(input?.signal);
    if (!input) failure("Linear depth input is required");
    const suppliedCoverage = input.coverage;
    // Snapshot the binding metadata before invoking host callbacks.
    const coverage: WebGPULinearDepthCoverage | undefined = suppliedCoverage ? { target: suppliedCoverage.target, colorAttachment: suppliedCoverage.colorAttachment,
      encoding: suppliedCoverage.encoding } : suppliedCoverage;
    const clearGuarantee: unknown = input.clearValueIsBackground;
    if (coverage !== undefined) {
      if (!coverage || (clearGuarantee !== undefined && clearGuarantee !== false)) {
        failure("Linear depth requires one unambiguous coverage or clear-value route", "WEBGPU_LINEAR_DEPTH_CLEAR_UNSUPPORTED");
      }
    } else if (clearGuarantee !== true) {
      failure("Linear depth requires coverage or an explicit noncolliding clear-value guarantee", "WEBGPU_LINEAR_DEPTH_CLEAR_UNSUPPORTED");
    }
    const source = input.source;
    const signal = input.signal;
    const prepared = prepareProjection(input.projection, input.maxGeometryDepthMeters, input.skyDepthMeters);
    validateSource(source);
    const sourceDepth = source.depthTexture;
    const coverageTexture = coverage ? validateCoverage(coverage, source) : undefined;
    const width = source.width, height = source.height;
    const outputBytes = width * height * 16;
    if (!Number.isSafeInteger(outputBytes) || outputBytes + this.outputBytes > this.byteLimit) {
      failure("Linear depth output exceeds the configured memory budget", "WEBGPU_LINEAR_DEPTH_BUDGET_EXCEEDED");
    }
    const readTargets = [...new Set([source, ...(coverage ? [coverage.target] : [])])];
    const borrowed = [...readTargets, ...this.outputs.keys()];
    const textures = (target: RenderTarget) => [target.colorTexture, target.depthTexture, target.multisampledDepthTexture,
      ...(Array.isArray(target.colorTextures) ? target.colorTextures : [])].filter(Boolean);
    // Include all pre-callback attachments even if a host callback swaps a
    // wrapper's current references before returning a candidate target.
    const borrowedSnapshot = borrowed.flatMap(textures);

    this.executing = true;
    let output: RenderTarget | undefined;
    try {
      this.checkpoint(signal);
      for (const target of readTargets) {
        this.host.assertTargetOwned(target);
        this.checkpoint(signal);
      }
      const candidate = this.host.createTarget({ width, height, format: "rgba32f", depth: false, sampleCount: 1, label: "webgpu-linear-depth" });
      // Never dispose a host-provided alias: doing so could destroy borrowed
      // source or an output still leased to another submission.
      const borrowedTextures = new Set([...borrowedSnapshot, ...borrowed.flatMap(textures)]);
      if (candidate && (borrowed.includes(candidate) || textures(candidate).some(texture => borrowedTextures.has(texture)))) {
        failure("Linear depth output cannot alias a borrowed resource", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      }
      if (!candidate || typeof candidate.dispose !== "function") {
        failure("Linear depth host returned an invalid target", "WEBGPU_LINEAR_DEPTH_TARGET_UNSUPPORTED");
      }
      this.host.assertTargetOwned(candidate);
      output = candidate;
      this.checkpoint(signal);
      validateOutput(candidate, width, height);
      validateSource(source);
      if (source.width !== width || source.height !== height || source.depthTexture !== sourceDepth) {
        failure("Linear depth source changed during submission", "WEBGPU_LINEAR_DEPTH_TARGET_UNSUPPORTED");
      }
      if (coverage && validateCoverage(coverage, source) !== coverageTexture) {
        failure("Linear depth coverage changed during submission", "WEBGPU_LINEAR_DEPTH_COVERAGE_UNSUPPORTED");
      }
      const pass: WebGPULinearDepthDraw = { label: "webgpu-linear-depth",
        fragment: coverage ? INDEPENDENT_LINEAR_DEPTH_COVERAGE_WGSL : INDEPENDENT_LINEAR_DEPTH_WGSL,
        entryPoint: "fs_linear_depth", source, sourceAspect: "depth-only", target: candidate,
        uniforms: uniforms(prepared), ...(coverage ? { coverage: {
          target: coverage.target, colorAttachment: coverage.colorAttachment, binding: 2 as const, sampleType: "float" as const
        } } : {}) };
      this.host.draw(pass);
      this.checkpoint(signal);
      this.outputs.set(candidate, outputBytes);
      this.outputBytes += outputBytes;
      output = undefined;
      return { target: candidate, release: () => this.release(candidate) };
    } catch (error) {
      if (output && !output.disposed) {
        try { output.dispose(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Linear depth execution and cleanup failed"); }
      }
      throw error;
    } finally {
      this.executing = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const targets = [...this.outputs.keys()];
    this.outputs.clear();
    this.outputBytes = 0;
    const errors: unknown[] = [];
    for (const target of targets) {
      try { if (!target.disposed) target.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Linear depth disposal failed");
  }

  private release(target: RenderTarget): void {
    const bytes = this.outputs.get(target);
    if (bytes === undefined) return;
    this.outputs.delete(target);
    this.outputBytes -= bytes;
    if (!target.disposed) target.dispose();
  }

  private checkpoint(signal?: AbortSignal): void {
    if (this.disposed) failure("Linear depth driver is disposed", "WEBGPU_LINEAR_DEPTH_DISPOSED");
    if (this.host.isDeviceLost() || !Object.is(this.host.deviceGeneration(), this.generation)) {
      try { this.dispose(); } catch { /* Preserve the device-loss error. */ }
      failure("Linear depth device was lost or replaced", "WEBGPU_LINEAR_DEPTH_DEVICE_LOST");
    }
    if (signal?.aborted) failure("Linear depth execution was cancelled", "WEBGPU_LINEAR_DEPTH_CANCELLED");
  }
}
