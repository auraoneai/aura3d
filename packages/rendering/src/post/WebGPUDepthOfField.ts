import { RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import type { VertexFormat } from "../VertexFormat";
import type { DofOptions } from "./PostGraph";
import {
  INDEPENDENT_DOF_COMPOSITE_WGSL,
  INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL,
  INDEPENDENT_DOF_GATHER_WGSL,
  INDEPENDENT_DOF_NEAR_TILE_WGSL,
  INDEPENDENT_DOF_PREFILTER_COC_WGSL,
  INDEPENDENT_DOF_PREFILTER_WGSL
} from "./shaders/independentDepthOfField.wgsl";

const MAX_DIMENSION = 16384;
const DEFAULT_BYTE_LIMIT = 512 * 1024 * 1024;
const MAX_BYTE_LIMIT = 2 * 1024 * 1024 * 1024;

/** Unsigned normalized colors are bounded even if their buffer is changed on the GPU. */
export function nativeDofVertexColorSupported(format: VertexFormat | undefined): boolean {
  const colors = format?.attributes.filter(attribute => attribute.shaderLocation === 4) ?? [];
  const color = colors[0];
  return colors.length === 1 && color?.semantic === "color" && color.shaderName === "a_color"
    && color.components === 4 && (color.type === "uint8" || color.type === "uint16")
    && color.normalized && !color.integer
    && format!.streams.some(stream => stream.slot === color.bufferSlot && stream.stepMode === "vertex");
}

export interface WebGPUDepthOfFieldTextureBinding {
  readonly binding: 1 | 2 | 3;
  readonly target: RenderTarget;
  readonly sampleType: "float" | "unfilterable-float";
}

export interface WebGPUDepthOfFieldDraw {
  readonly label: string;
  readonly fragment: string;
  readonly entryPoint: string;
  readonly target: RenderTarget;
  readonly textures: readonly WebGPUDepthOfFieldTextureBinding[];
  /** If present, these bytes occupy uniform binding 0. */
  readonly uniforms?: Uint8Array;
  /** The gather pass specializes its sampling count at pipeline creation. */
  readonly constants?: Readonly<Record<string, number>>;
  /** Present only when binding 4 is a filtering sampler. */
  readonly sampler?: { readonly binding: 4; readonly filter: "linear"; readonly addressMode: "clamp-to-edge" };
}

/**
 * A host must check device ownership, enqueue each draw in order, declare the
 * input/output resource accesses, and retain every submitted resource until
 * the device has finished using it. Target disposal must defer native freeing
 * until the relevant queue work completes. A lost device must invalidate its
 * generation and call `dispose` on the driver. Pipeline constants and sparse
 * bindings are part of the pipeline-cache identity.
 */
export interface WebGPUDepthOfFieldHost {
  createTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  draw(pass: WebGPUDepthOfFieldDraw): void;
  deviceGeneration(): unknown;
  isDeviceLost(): boolean;
}

export interface WebGPUDepthOfFieldInput {
  /**
   * Single-sample linear HDR color. The caller guarantees finite f32 RGB,
   * alpha in [0,1], zero RGB where alpha is zero, and premultiplied alpha;
   * opaque pixels are the alpha=1 special case. Float target rounding and
   * permitted f32 subnormal flushing limit extremely small values.
   */
  readonly color: RenderTarget;
  readonly alpha: "opaque" | "premultiplied";
  /** Every color pixel must correspond to one depth; overlapping layers need a different path. */
  readonly depthModel: "single-surface";
  /**
   * Full-resolution rgba32f color target with linear view-space distance in
   * metres in its red channel, not a raw hardware depth attachment. Zero
   * marks no depth. The caller guarantees that geometry has finite,
   * normal positive f32 depth (at least 1.1754943508222875e-38 metres) no
   * greater than `maxGeometryDepthMeters`, and that background is at or
   * beyond `skyDepthMeters`. Hardware may flush smaller positive subnormal
   * depths to zero, so they cannot represent geometry in this path.
   */
  readonly linearDepth: RenderTarget;
  readonly depthEncoding: "linear-view-metres";
  readonly skyDepthMeters: number;
  readonly maxGeometryDepthMeters: number;
  readonly options: Partial<DofOptions>;
  readonly gatherRings?: 1 | 2 | 3;
  /** Full-resolution CoC requires another implementation. */
  readonly fullCoC?: boolean;
  readonly signal?: AbortSignal;
}

export interface WebGPUDepthOfFieldResult {
  /** Caller-owned until release; release after downstream submission. */
  readonly target: RenderTarget;
  release(): void;
}

interface NormalizedDof {
  readonly focusDistance: number;
  readonly focalLengthMm: number;
  readonly fStop: number;
  readonly sensorHeightMm: number;
  readonly maxBlurPx: number;
  readonly gatherRings: 1 | 2 | 3;
}

function failure(message: string, code = "WEBGPU_DOF_INVALID"): never {
  throw new RenderDeviceError(message, code);
}

type DofConfiguration = Pick<WebGPUDepthOfFieldInput, "options" | "maxGeometryDepthMeters" | "skyDepthMeters" | "gatherRings" | "fullCoC">;

function normalize(input: DofConfiguration): NormalizedDof {
  const options = input.options;
  if (!options || typeof options !== "object" || Array.isArray(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
    failure("Depth-of-field options must be a plain object");
  }
  const allowed = new Set(["focusDistance", "focalLengthMm", "fStop", "sensorHeightMm", "maxBlurPx", "halfRes", "tiltShift"]);
  if (Object.keys(options).some(key => !allowed.has(key))) failure("Unknown depth-of-field option");
  if (options.halfRes !== undefined && options.halfRes !== true) failure("Depth of field supports only half-resolution processing", "WEBGPU_DOF_OPTION_UNSUPPORTED");
  if (options.tiltShift !== undefined) failure("Depth of field does not support tilt-shift", "WEBGPU_DOF_OPTION_UNSUPPORTED");
  if (input.fullCoC !== undefined && input.fullCoC !== false) failure("Depth of field does not support full-resolution CoC", "WEBGPU_DOF_OPTION_UNSUPPORTED");
  const gatherRings = input.gatherRings === undefined ? 3 : input.gatherRings;
  if (gatherRings !== 1 && gatherRings !== 2 && gatherRings !== 3) failure("Depth of field requires 1, 2, or 3 gather rings", "WEBGPU_DOF_OPTION_UNSUPPORTED");
  const focusDistance = options.focusDistance === undefined ? 3 : options.focusDistance;
  const focalLengthMm = options.focalLengthMm === undefined ? 50 : options.focalLengthMm;
  const fStop = options.fStop === undefined ? 2.8 : options.fStop;
  const sensorHeightMm = options.sensorHeightMm === undefined ? 24 : options.sensorHeightMm;
  const maxBlurPx = options.maxBlurPx === undefined ? 16 : options.maxBlurPx;
  if (![focusDistance, focalLengthMm, fStop, sensorHeightMm, maxBlurPx, input.skyDepthMeters, input.maxGeometryDepthMeters]
    .every(value => typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
    failure("Depth-of-field parameters must be finite f32 values");
  }
  // Bound optical arithmetic and sampling work; reject rather than silently
  // approximating configurations outside this first implementation.
  if (focusDistance > 100000 || focalLengthMm < .01 || focalLengthMm > 1000
    || focusDistance * 1000 <= focalLengthMm + 1 || fStop < .1 || fStop > 128
    || sensorHeightMm < 1 || sensorHeightMm > 100 || maxBlurPx < 0 || maxBlurPx > 64) {
    failure("Depth-of-field optical parameters exceed the supported bounds");
  }
  if (input.maxGeometryDepthMeters <= 0 || input.skyDepthMeters > 100000
    || input.maxGeometryDepthMeters >= input.skyDepthMeters
    || Math.fround(input.maxGeometryDepthMeters) >= Math.fround(input.skyDepthMeters)) {
    failure("Depth of field requires geometry strictly before the representable sky threshold", "WEBGPU_DOF_DEPTH_UNSUPPORTED");
  }
  return { focusDistance, focalLengthMm, fStop, sensorHeightMm, maxBlurPx, gatherRings };
}

/** Validate native DoF controls and depth bounds before allocating or submitting GPU work. */
export function validateWebGPUDepthOfFieldOptions(options: Partial<DofOptions>, maxGeometryDepthMeters: number, skyDepthMeters: number): void {
  normalize({ options, maxGeometryDepthMeters, skyDepthMeters });
}

function validateTarget(target: RenderTarget, description: string, format?: "rgba16f" | "rgba32f"): void {
  if (!target || target.disposed || !target.colorTexture || target.colorTexture.disposed
    || (target.sampleCount ?? 1) !== 1 || (target.dimension ?? "2d") !== "2d" || target.depthOnly
    || (target.colorTexture.format !== "rgba16f" && target.colorTexture.format !== "rgba32f")
    || (format !== undefined && target.colorTexture.format !== format)
    || target.colorTexture.colorSpace !== "linear" || !Array.isArray(target.colorTexture.usage) || !target.colorTexture.usage.includes("sampled")
    || target.colorTexture.width !== target.width || target.colorTexture.height !== target.height
    || target.colorTexture.dimension !== "2d" || (target.attachmentMipLevel ?? 0) !== 0 || (target.attachmentLayer ?? 0) !== 0) {
    failure(`${description} requires a live single-sample linear floating-point color target`, "WEBGPU_DOF_TARGET_UNSUPPORTED");
  }
  if (!Number.isSafeInteger(target.width) || !Number.isSafeInteger(target.height)
    || target.width < 1 || target.height < 1 || target.width > MAX_DIMENSION || target.height > MAX_DIMENSION) {
    failure(`${description} dimensions exceed the supported bounds`, "WEBGPU_DOF_SIZE_UNSUPPORTED");
  }
}

function uniforms(options: NormalizedDof, height: number, skyDepthMeters: number): Uint8Array {
  const data = new DataView(new ArrayBuffer(32));
  [options.focusDistance, options.focalLengthMm, options.fStop, options.sensorHeightMm, height, options.maxBlurPx, skyDepthMeters]
    .forEach((value, index) => data.setFloat32(index * 4, value, true));
  return new Uint8Array(data.buffer);
}

/**
 * Internal bounded six-pass building block; this class is not a renderer
 * integration. A compatible native host and linear-depth producer are needed
 * before an application can use the effect through the public post chain.
 */
export class WebGPUDepthOfField {
  private readonly generation: unknown;
  private readonly outputs = new Map<RenderTarget, number>();
  private outputBytes = 0;
  private disposed = false;
  private executing = false;
  private readonly byteLimit: number;

  /** `maxBytes` bounds estimated owned color storage; device allocation policy still applies. */
  constructor(private readonly host: WebGPUDepthOfFieldHost, options: { readonly maxBytes?: number } = {}) {
    this.byteLimit = options.maxBytes ?? DEFAULT_BYTE_LIMIT;
    if (!Number.isSafeInteger(this.byteLimit) || this.byteLimit < 1 || this.byteLimit > MAX_BYTE_LIMIT) {
      failure("Depth-of-field memory budget is invalid");
    }
    this.generation = host.deviceGeneration();
    if (host.isDeviceLost()) failure("Depth-of-field device is lost", "WEBGPU_DOF_DEVICE_LOST");
  }

  execute(input: WebGPUDepthOfFieldInput): WebGPUDepthOfFieldResult {
    if (this.executing) failure("Depth-of-field execution cannot be reentered", "WEBGPU_DOF_REENTRANT");
    this.checkpoint(input?.signal);
    if (!input || (input.alpha !== "opaque" && input.alpha !== "premultiplied")) {
      failure("Depth of field requires opaque or premultiplied source pixels", "WEBGPU_DOF_ALPHA_UNSUPPORTED");
    }
    if (input.depthModel !== "single-surface") failure("Depth of field requires one corresponding depth per color pixel", "WEBGPU_DOF_DEPTH_UNSUPPORTED");
    if (input.depthEncoding !== "linear-view-metres") failure("Depth of field requires linear view-space metres", "WEBGPU_DOF_DEPTH_UNSUPPORTED");
    const options = normalize(input);
    validateTarget(input.color, "Depth-of-field color");
    validateTarget(input.linearDepth, "Depth-of-field linear depth", "rgba32f");
    if (input.color.width !== input.linearDepth.width || input.color.height !== input.linearDepth.height) {
      failure("Depth-of-field depth and color dimensions must match", "WEBGPU_DOF_DEPTH_UNSUPPORTED");
    }
    if (input.color === input.linearDepth || input.color.colorTexture === input.linearDepth.colorTexture) {
      failure("Depth-of-field color and depth cannot alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
    }
    const width = input.color.width, height = input.color.height;
    const halfWidth = Math.ceil(width / 2), halfHeight = Math.ceil(height / 2);
    const tileWidth = Math.ceil(halfWidth / 8), tileHeight = Math.ceil(halfHeight / 8);
    const outputBytes = width * height * (input.color.colorTexture.format === "rgba32f" ? 16 : 8);
    // Two rgba32f color targets and two rgba16f CoC/influence targets.
    const requestedBytes = halfWidth * halfHeight * 48 + tileWidth * tileHeight * 8 + outputBytes;
    if (!Number.isSafeInteger(requestedBytes) || requestedBytes + this.outputBytes > this.byteLimit) {
      failure("Depth-of-field targets exceed the configured memory budget", "WEBGPU_DOF_BUDGET_EXCEEDED");
    }
    const allocated: RenderTarget[] = [];
    const borrowed = [input.color, input.linearDepth, ...this.outputs.keys()];
    const allocate = (descriptor: RenderTargetDescriptor): RenderTarget => {
      this.checkpoint(input.signal);
      const target = this.host.createTarget(descriptor);
      // A host violating ownership by returning another wrapper over a borrowed
      // texture cannot safely be disposed here: it could destroy the input.
      if (target && [...borrowed, ...allocated].some(other => other === target || other.colorTexture === target.colorTexture)) {
        failure("Depth-of-field targets cannot alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      }
      if (target && typeof target.dispose === "function") allocated.push(target);
      validateTarget(target, "Depth-of-field allocated target", descriptor.format as "rgba16f" | "rgba32f");
      if (target.width !== descriptor.width || target.height !== descriptor.height || !target.colorTexture.usage.includes("render-attachment")) {
        failure("Depth-of-field host returned the wrong target size", "WEBGPU_DOF_TARGET_UNSUPPORTED");
      }
      this.checkpoint(input.signal);
      return target;
    };
    const draw = (pass: WebGPUDepthOfFieldDraw): void => {
      this.checkpoint(input.signal);
      for (const binding of pass.textures) validateTarget(binding.target, "Depth-of-field pass input");
      validateTarget(pass.target, "Depth-of-field pass output");
      this.host.draw(pass);
      this.checkpoint(input.signal);
    };
    this.executing = true;
    try {
      const halfColor: RenderTargetDescriptor = { width: halfWidth, height: halfHeight, format: "rgba32f", depth: false, sampleCount: 1 };
      const halfScalar: RenderTargetDescriptor = { width: halfWidth, height: halfHeight, format: "rgba16f", depth: false, sampleCount: 1 };
      const prefilter = allocate({ ...halfColor, label: "webgpu-dof-prefilter-color" });
      const coc = allocate({ ...halfScalar, label: "webgpu-dof-prefilter-coc" });
      const tile = allocate({ width: tileWidth, height: tileHeight, format: "rgba16f", depth: false, sampleCount: 1, label: "webgpu-dof-near-tile" });
      const gather = allocate({ ...halfColor, label: "webgpu-dof-gather-color" });
      const influence = allocate({ ...halfScalar, label: "webgpu-dof-gather-influence" });
      const output = allocate({ width, height, format: input.color.colorTexture.format as "rgba16f" | "rgba32f", depth: false, sampleCount: 1, label: "webgpu-dof-composite" });
      draw({ label: "webgpu-dof-prefilter", fragment: INDEPENDENT_DOF_PREFILTER_WGSL, entryPoint: "fs_dof_prefilter", target: prefilter,
        uniforms: uniforms(options, height, input.skyDepthMeters), textures: [
          { binding: 1, target: input.color, sampleType: "unfilterable-float" },
          { binding: 2, target: input.linearDepth, sampleType: "unfilterable-float" }
        ] });
      draw({ label: "webgpu-dof-prefilter-coc", fragment: INDEPENDENT_DOF_PREFILTER_COC_WGSL, entryPoint: "fs_dof_prefilter_coc", target: coc,
        uniforms: uniforms(options, height, input.skyDepthMeters), textures: [
          { binding: 1, target: input.color, sampleType: "unfilterable-float" },
          { binding: 2, target: input.linearDepth, sampleType: "unfilterable-float" }
        ] });
      draw({ label: "webgpu-dof-near-tile", fragment: INDEPENDENT_DOF_NEAR_TILE_WGSL, entryPoint: "fs_dof_near_tile", target: tile,
        textures: [{ binding: 1, target: coc, sampleType: "unfilterable-float" }] });
      draw({ label: "webgpu-dof-gather", fragment: INDEPENDENT_DOF_GATHER_WGSL, entryPoint: "fs_dof_gather", target: gather,
        constants: { DOF_RINGS: options.gatherRings }, textures: [
          { binding: 1, target: prefilter, sampleType: "unfilterable-float" },
          { binding: 2, target: coc, sampleType: "unfilterable-float" },
          { binding: 3, target: tile, sampleType: "unfilterable-float" }
        ] });
      draw({ label: "webgpu-dof-gather-influence", fragment: INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL, entryPoint: "fs_dof_gather_influence", target: influence,
        constants: { DOF_RINGS: options.gatherRings }, textures: [
          { binding: 1, target: prefilter, sampleType: "unfilterable-float" },
          { binding: 2, target: coc, sampleType: "unfilterable-float" },
          { binding: 3, target: tile, sampleType: "unfilterable-float" }
        ] });
      draw({ label: "webgpu-dof-composite", fragment: INDEPENDENT_DOF_COMPOSITE_WGSL, entryPoint: "fs_dof_composite", target: output,
        textures: [{ binding: 1, target: input.color, sampleType: "unfilterable-float" },
          { binding: 2, target: gather, sampleType: "unfilterable-float" }, { binding: 3, target: influence, sampleType: "float" }],
        sampler: { binding: 4, filter: "linear", addressMode: "clamp-to-edge" } });
      // The host defers native freeing until all queued reads are complete.
      const intermediates = allocated.splice(0, 5);
      const errors = this.disposeTargets(intermediates);
      if (errors.length) throw new AggregateError(errors, "Depth-of-field intermediate disposal failed");
      this.checkpoint(input.signal);
      allocated.length = 0;
      this.outputs.set(output, outputBytes);
      this.outputBytes += outputBytes;
      return { target: output, release: () => this.release(output) };
    } catch (error) {
      const cleanupErrors = this.disposeTargets(allocated);
      if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Depth-of-field execution and cleanup failed");
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
    const errors = this.disposeTargets(targets);
    if (errors.length) throw new AggregateError(errors, "Depth-of-field disposal failed");
  }

  private release(target: RenderTarget): void {
    const bytes = this.outputs.get(target);
    if (bytes === undefined) return;
    this.outputs.delete(target);
    this.outputBytes -= bytes;
    if (!target.disposed) target.dispose();
  }

  private disposeTargets(targets: readonly RenderTarget[]): unknown[] {
    const errors: unknown[] = [];
    for (const target of targets) {
      try { if (!target.disposed) target.dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  }

  private checkpoint(signal?: AbortSignal): void {
    if (this.disposed) failure("Depth-of-field driver is disposed", "WEBGPU_DOF_DISPOSED");
    if (this.host.isDeviceLost() || !Object.is(this.host.deviceGeneration(), this.generation)) {
      try { this.dispose(); } catch { /* Preserve the device-loss error. */ }
      failure("Depth-of-field device was lost or replaced", "WEBGPU_DOF_DEVICE_LOST");
    }
    if (signal?.aborted) failure("Depth-of-field execution was cancelled", "WEBGPU_DOF_CANCELLED");
  }
}
