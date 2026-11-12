import { RenderDeviceError } from "../RenderDevice";
import { SSR_TRACE_UNIFORM_BYTES } from "./shaders/ssr.wgsl";

/**
 * W3 — host side of the native WebGPU screen-space reflections pass
 * (`shaders/ssr.wgsl.ts`). The renderer attaches a `WebGPUSsrFrame` (the exact
 * raster projection and depth convention of the frame) to the legacy `ssr`
 * pass; the device traces against the forward target's sampleable depth.
 */

/**
 * Whether the WebGPU device advertises sampleable depth (`depth-textures`) on
 * every native device, so a scene with SSR can pick WebGPU before any device
 * exists. The pass itself runs whenever a device does advertise it; this only
 * gates the pre-mount check. Turned on together with the W1 depth-textures lane.
 */
export const WEBGPU_PRECHECK_ASSUMES_DEPTH_TEXTURES = true;

/**
 * Post stages the native WebGPU chain runs over scene depth (pre-mount check input). `ssr` runs on any frame once the
 * device advertises sampleable depth; `ssr:msaa` runs on a 4x frame where SSR is the only depth reader, because the
 * trace reads the multisampled attachment, which every native WebGPU target can bind.
 */
export function webgpuNativeDepthPostStages(assumeDepthTextures = WEBGPU_PRECHECK_ASSUMES_DEPTH_TEXTURES): readonly string[] {
  return assumeDepthTextures ? ["ssr", "ssr:msaa"] : ["ssr:msaa"];
}

/** Frame inputs the renderer attaches to the `ssr` pass on WebGPU. */
export interface WebGPUSsrFrame {
  /** Column-major projection used to rasterize this frame (no jitter). */
  readonly projection: Float32Array | readonly number[];
  readonly inverseProjection: Float32Array | readonly number[];
  readonly far: number;
  readonly orthographic: boolean;
  /** Clip z range of `projection`: zero-to-one frames write clip z directly. */
  readonly clipRange: "minus-one-to-one" | "zero-to-one";
  readonly clearDepth: 0 | 1;
}

export interface WebGPUSsrOptions {
  readonly intensity: number;
  readonly maxDistance: number;
  readonly roughness: number;
  readonly thickness: number;
  readonly steps: 16 | 24 | 32;
}

/** S3 defaults (mirrors `resolveSsrOptions` in `v2Stages.ts`; kept local so the main chunk does not pull the v2 module). */
export function resolveWebGPUSsrOptions(ssr: unknown): WebGPUSsrOptions {
  const bag = (ssr && typeof ssr === "object" ? ssr : {}) as Record<string, unknown>;
  const num = (key: string, fallback: number, min: number, max: number): number => {
    const value = bag[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const steps = num("steps", 24, 1, 64);
  return {
    intensity: num("intensity", 0.9, 0, 2),
    maxDistance: num("maxDistance", 18, 0.5, 200),
    roughness: num("roughness", 0, 0, 1),
    thickness: num("thickness", 0.25, 0.01, 10),
    steps: steps <= 16 ? 16 : steps <= 24 ? 24 : 32
  };
}

function matrix16(value: unknown, name: string): Float32Array {
  const values = value instanceof Float32Array || Array.isArray(value) ? Array.from(value as ArrayLike<number>) : [];
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RenderDeviceError(`WebGPU SSR requires a finite ${name} matrix`, "WEBGPU_SSR_FRAME_REQUIRED");
  }
  return Float32Array.from(values);
}

/** Validate the renderer-attached frame (throws `WEBGPU_SSR_FRAME_REQUIRED`). */
export function validateWebGPUSsrFrame(frame: unknown): WebGPUSsrFrame {
  const value = frame as Partial<WebGPUSsrFrame> | undefined;
  if (!value || typeof value !== "object" || (value.clipRange !== "minus-one-to-one" && value.clipRange !== "zero-to-one")
      || (value.clearDepth !== 0 && value.clearDepth !== 1) || typeof value.orthographic !== "boolean"
      || typeof value.far !== "number" || !Number.isFinite(value.far) || value.far <= 0) {
    throw new RenderDeviceError("WebGPU SSR requires the frame's projection and depth convention", "WEBGPU_SSR_FRAME_REQUIRED");
  }
  return { projection: matrix16(value.projection, "projection"), inverseProjection: matrix16(value.inverseProjection, "inverse projection"),
    far: value.far, orthographic: value.orthographic, clipRange: value.clipRange, clearDepth: value.clearDepth };
}

/** Packed `SsrTraceUniforms` for a full-resolution `width` x `height` source. */
export function webgpuSsrTraceUniforms(frame: WebGPUSsrFrame, options: WebGPUSsrOptions, width: number, height: number): Float32Array {
  const data = new Float32Array(SSR_TRACE_UNIFORM_BYTES / 4);
  data.set(frame.projection, 0);
  data.set(frame.inverseProjection, 16);
  data.set([width, height, frame.far, options.maxDistance, options.thickness, options.roughness, options.steps,
    frame.orthographic ? 1 : 0, frame.clipRange === "zero-to-one" ? 1 : 0, frame.clearDepth, 0, 0], 32);
  return data;
}

/** Packed `SsrCompositeUniforms`. */
export function webgpuSsrCompositeUniforms(options: WebGPUSsrOptions): Float32Array {
  return new Float32Array([options.intensity, 0, 0, 0]);
}
