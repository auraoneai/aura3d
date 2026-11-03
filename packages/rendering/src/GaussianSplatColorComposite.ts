import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";

export type GaussianSplatColorSpace = "srgb_rec709_display" | "lin_rec709_display";
export type GaussianSplatTransfer = "linear-to-srgb" | "srgb-to-linear";
/** `independent` also covers scene targets whose alpha is an output coverage mask. */
export type GaussianSplatAlphaAssociation = "premultiplied" | "independent";

/**
 * Color conversion is deliberately applied to the whole backdrop and the
 * completed run, never to individual splat colors. These functions extend the
 * transfer to signed and HDR values in the same way as ColorManagement.ts.
 * The alpha channel is never transformed. A zero-alpha pixel with nonzero RGB
 * is kept reversible, since coverage targets can contain such pixels.
 *
 * These snippets contain no shader entry point: native backends embed them in
 * fullscreen passes that fetch the exact source pixel (and sample, for MSAA).
 */
export const GAUSSIAN_SPLAT_TRANSFER_GLSL = `
float a3dSplatTransferChannel(float value, float alpha, bool encode, bool premultiplied) {
  float v = abs(value);
  float scale = premultiplied && alpha > 0.0 ? alpha : 1.0;
  float result;
  if (encode) {
    result = v <= 0.0031308 * scale ? 12.92 * v
      : 1.055 * exp(log(v) / 2.4 + log(scale) * (1.0 - 1.0 / 2.4)) - 0.055 * scale;
  } else {
    result = v <= 0.04045 * scale ? v / 12.92
      : exp(2.4 * log((v + 0.055 * scale) / 1.055) - 1.4 * log(scale));
  }
  return sign(value) * result;
}
vec4 a3dSplatTransfer(vec4 color, bool encode, bool premultiplied) {
  return vec4(vec3(a3dSplatTransferChannel(color.r, color.a, encode, premultiplied),
                   a3dSplatTransferChannel(color.g, color.a, encode, premultiplied),
                   a3dSplatTransferChannel(color.b, color.a, encode, premultiplied)), color.a);
}`;

export const GAUSSIAN_SPLAT_TRANSFER_WGSL = `
fn a3dSplatTransferChannel(value: f32, alpha: f32, encode: bool, premultiplied: bool) -> f32 {
  let v = abs(value);
  var scale = 1.0;
  if (premultiplied && alpha > 0.0) { scale = alpha; }
  var result: f32;
  if (encode) {
    if (v <= 0.0031308 * scale) { result = 12.92 * v; }
    else { result = 1.055 * exp(log(v) / 2.4 + log(scale) * (1.0 - 1.0 / 2.4)) - 0.055 * scale; }
  } else {
    if (v <= 0.04045 * scale) { result = v / 12.92; }
    else { result = exp(2.4 * log((v + 0.055 * scale) / 1.055) - 1.4 * log(scale)); }
  }
  return sign(value) * result;
}
fn a3dSplatTransfer(color: vec4f, encode: bool, premultiplied: bool) -> vec4f {
  return vec4f(vec3f(a3dSplatTransferChannel(color.r, color.a, encode, premultiplied),
                     a3dSplatTransferChannel(color.g, color.a, encode, premultiplied),
                     a3dSplatTransferChannel(color.b, color.a, encode, premultiplied)), color.a);
}`;

/** A reference implementation for callers that need to reason about pixel math. */
export function transferGaussianSplatColor(
  color: readonly [number, number, number, number],
  direction: GaussianSplatTransfer,
  association: GaussianSplatAlphaAssociation
): [number, number, number, number] {
  if (color.length !== 4 || !color.every(Number.isFinite)) throw new RangeError("splat color must contain four finite channels");
  if (direction !== "linear-to-srgb" && direction !== "srgb-to-linear") throw new RangeError("unsupported splat color transfer");
  if (association !== "independent" && association !== "premultiplied") throw new RangeError("unsupported splat alpha association");
  const alpha = color[3];
  const scale = association === "premultiplied" && alpha > 0 ? alpha : 1;
  const channel = (value: number): number => {
    const v = Math.abs(value);
    const result = direction === "linear-to-srgb"
      ? v <= 0.0031308 * scale ? 12.92 * v : 1.055 * Math.exp(Math.log(v) / 2.4 + Math.log(scale) * (1 - 1 / 2.4)) - 0.055 * scale
      : v <= 0.04045 * scale ? v / 12.92 : Math.exp(2.4 * Math.log((v + 0.055 * scale) / 1.055) - 1.4 * Math.log(scale));
    const output = Math.sign(value) * result;
    if (!Number.isFinite(output)) throw new RangeError("splat color transfer overflow");
    return output;
  };
  return [channel(color[0]), channel(color[1]), channel(color[2]), alpha];
}

/** Owned scratch color storage; borrowed target depth is never disposed here. */
export interface GaussianSplatColorScratch {
  readonly byteLength: number;
  readonly disposed: boolean;
  dispose(): void;
}

/**
 * Backend contract for a color-space crossing. Methods are synchronous and
 * preserve the caller's target, viewport and scissor even on error. Transfer
 * passes also restore the GPU draw state; drawToScratch follows the normal
 * device.draw() contract for the draw callback's other state changes.
 *
 * `transfer` reads one attachment and writes the other without blending or
 * modifying depth. It must load the corresponding pixel and sample exactly;
 * resolving and expanding a multisampled target is not an implementation.
 * `drawToScratch` must borrow the original live depth attachment, retain the
 * target's exact raster state and sample count, and forbid depth writes. It
 * restores all bindings even if the callback throws. Scratch contents need not
 * survive errors. Unsupported target formats or features must throw before a
 * draw rather than silently reducing precision, depth or sample count.
 */
export interface GaussianSplatColorAdapter {
  createScratch(target: RenderTarget): GaussianSplatColorScratch;
  transfer(target: RenderTarget, scratch: GaussianSplatColorScratch, toScratch: boolean,
    direction: GaussianSplatTransfer, association: GaussianSplatAlphaAssociation): void;
  drawToScratch(target: RenderTarget, scratch: GaussianSplatColorScratch, draw: () => void): void;
  dispose(): void;
}

export interface GaussianSplatColorRun {
  readonly colorSpace: GaussianSplatColorSpace;
  /** Submits straight-alpha splats in this run's declared color space. */
  draw(): void;
}

export interface GaussianSplatColorCompositeOptions {
  /** Total bytes reserved for one scratch color surface. Defaults to 128 MiB. */
  readonly maxScratchBytes?: number;
  /** Full-screen conversions are bounded per beginFrame(). Defaults to 16,384 runs. */
  readonly maxConvertedRuns?: number;
}

type SplatColorDevice = RenderDevice & { createGaussianSplatColorAdapter?(): GaussianSplatColorAdapter };

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}

/**
 * One compositor per renderer; it owns at most one scratch surface and its
 * backend adapter. Call beginFrame once before submitting that frame's ordered
 * queue, draw once for each splat run, and dispose with the renderer. Matching
 * color spaces take the direct path and require no adapter or allocation.
 */
export class GaussianSplatColorComposite {
  private readonly maxScratchBytes: number;
  private readonly maxConvertedRuns: number;
  private adapter: GaussianSplatColorAdapter | undefined;
  private scratch: GaussianSplatColorScratch | undefined;
  private scratchTarget: RenderTarget | undefined;
  private generation: number | undefined;
  private convertedRuns = 0;
  private busy = false;
  private disposed = false;

  constructor(private readonly device: RenderDevice, options: GaussianSplatColorCompositeOptions = {}) {
    this.maxScratchBytes = options.maxScratchBytes ?? 128 * 1024 * 1024;
    this.maxConvertedRuns = options.maxConvertedRuns ?? 16_384;
    positiveInteger(this.maxScratchBytes, "maxScratchBytes");
    positiveInteger(this.maxConvertedRuns, "maxConvertedRuns");
    this.generation = device.generation;
  }

  beginFrame(): void {
    this.assertAvailable();
    if (this.busy) throw new RenderDeviceError("Cannot reset splat composition during a run", "GAUSSIAN_SPLAT_COLOR_REENTRANT");
    this.convertedRuns = 0;
  }

  draw(run: GaussianSplatColorRun, targetColorSpace: GaussianSplatColorSpace, association: GaussianSplatAlphaAssociation): void {
    this.assertAvailable();
    if (this.busy) throw new RenderDeviceError("Splat color composition cannot be nested", "GAUSSIAN_SPLAT_COLOR_REENTRANT");
    if ((run.colorSpace !== "srgb_rec709_display" && run.colorSpace !== "lin_rec709_display")
      || (targetColorSpace !== "srgb_rec709_display" && targetColorSpace !== "lin_rec709_display")) {
      throw new RenderDeviceError("Unknown splat or target color space", "GAUSSIAN_SPLAT_COLOR_SPACE_UNSUPPORTED");
    }
    if (association !== "premultiplied" && association !== "independent") {
      throw new RenderDeviceError("Unknown scene alpha association", "GAUSSIAN_SPLAT_COLOR_ALPHA_UNSUPPORTED");
    }
    if (run.colorSpace === targetColorSpace) { run.draw(); return; }
    if (this.convertedRuns >= this.maxConvertedRuns) {
      throw new RenderDeviceError("Splat color conversions exceed the per-frame budget", "GAUSSIAN_SPLAT_COLOR_RUN_LIMIT", { limit: this.maxConvertedRuns });
    }
    const target = this.device.getRenderTarget?.();
    if (!target || target.disposed) throw new RenderDeviceError("Splat color conversion needs a live offscreen scene target", "GAUSSIAN_SPLAT_COLOR_TARGET_UNSUPPORTED");
    positiveInteger(target.width, "target width"); positiveInteger(target.height, "target height");
    const samples = target.sampleCount ?? 1;
    positiveInteger(samples, "target sample count");
    // A full-float scratch is required to avoid clipping HDR radiance. Native
    // backends report their complete allocation (including resolve storage).
    const minimumBytes = target.width * target.height * samples * 16;
    if (!Number.isSafeInteger(minimumBytes) || minimumBytes > this.maxScratchBytes) {
      throw new RenderDeviceError("Splat color scratch exceeds its byte budget", "GAUSSIAN_SPLAT_COLOR_MEMORY_LIMIT", { minimumBytes, limit: this.maxScratchBytes });
    }
    if (this.device.generation !== this.generation) {
      this.releaseResources();
      this.generation = this.device.generation;
    }
    if (!this.adapter) {
      const factory = (this.device as SplatColorDevice).createGaussianSplatColorAdapter;
      if (!factory) throw new RenderDeviceError("Backend cannot preserve splat color, depth and samples", "GAUSSIAN_SPLAT_COLOR_COMPOSITE_UNSUPPORTED", { backend: this.device.kind });
      this.adapter = factory.call(this.device);
    }
    if (!this.scratch || this.scratch.disposed || this.scratchTarget !== target) {
      this.scratch?.dispose();
      this.scratch = undefined;
      this.scratchTarget = undefined;
      const scratch = this.adapter.createScratch(target);
      if (scratch.disposed || !Number.isSafeInteger(scratch.byteLength) || scratch.byteLength < minimumBytes || scratch.byteLength > this.maxScratchBytes) {
        scratch.dispose();
        throw new RenderDeviceError("Splat color scratch allocation violates its byte budget", "GAUSSIAN_SPLAT_COLOR_MEMORY_LIMIT", { byteLength: scratch.byteLength, minimumBytes, limit: this.maxScratchBytes });
      }
      this.scratch = scratch;
      this.scratchTarget = target;
    }
    const toRun: GaussianSplatTransfer = run.colorSpace === "srgb_rec709_display" ? "linear-to-srgb" : "srgb-to-linear";
    const fromRun: GaussianSplatTransfer = toRun === "linear-to-srgb" ? "srgb-to-linear" : "linear-to-srgb";
    const scratch = this.scratch, adapter = this.adapter;
    this.convertedRuns += 1;
    this.busy = true;
    try {
      adapter.transfer(target, scratch, true, toRun, association);
      adapter.drawToScratch(target, scratch, () => run.draw());
      adapter.transfer(target, scratch, false, fromRun, association);
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.busy) throw new RenderDeviceError("Cannot dispose splat composition during a run", "GAUSSIAN_SPLAT_COLOR_REENTRANT");
    this.disposed = true;
    this.releaseResources();
  }

  private assertAvailable(): void {
    if (this.disposed || this.device.disposed || this.device.contextLost) {
      throw new RenderDeviceError("Splat color compositor or device is unavailable", "GAUSSIAN_SPLAT_COLOR_UNAVAILABLE");
    }
  }

  private releaseResources(): void {
    try { this.scratch?.dispose(); } finally {
      this.scratch = undefined;
      this.scratchTarget = undefined;
      try { this.adapter?.dispose(); } finally { this.adapter = undefined; }
    }
  }
}
