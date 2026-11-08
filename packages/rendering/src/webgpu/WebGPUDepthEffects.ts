/**
 * Native WebGPU depth-reading post stages: S4 god rays, S7 camera motion blur
 * and the legacy `volumetric-light` pass.
 *
 * The WebGL2 v2 chain runs god rays and motion blur in `post/v2Stages.ts`; the
 * legacy volumetric light is the CPU kernel `volumetricLightPixels`. These are
 * WGSL ports that run inside the WebGPU native post chain. They read the
 * forward target's own depth attachment (single-sample or 4x multisampled, in
 * which case sample 0 is read), so they need no public sampleable depth
 * texture. Depth is decoded with the frame's depth convention and inverse
 * projection, the same decode the WebGL2 chain uses (`writeDepthUniforms`).
 *
 * Coordinates: the WebGL2 shaders work in bottom-left uv. These ports keep that
 * convention for every quantity they share with WebGL2 (light uv, NDC, the
 * legacy kernel's pixel rows) and convert only at texture access, so the same
 * options land on the same screen position on both backends.
 *
 * Bind convention (the device's sampled fullscreen pass, auto layout):
 * binding 0 uniform, binding 1 linear sampler, binding 2.. textures. Every
 * shader references every binding so the auto layout keeps all entries.
 */

import { RenderDeviceError } from "../RenderDevice";

/** Decodes hardware depth to linear view depth, mirroring the WebGL2 v2 depth functions. */
export interface WebGPUDepthDecode {
  readonly near: number;
  readonly far: number;
  readonly mode: "standard" | "reversed" | "logarithmic";
  readonly clipRange: "minus-one-to-one" | "zero-to-one";
  /** Column-major inverse of the frame projection, in the frame's clip convention. */
  readonly inverseProjection: Float32Array;
}

/** One frame of native S4 god rays. `lightUv` is bottom-left uv (WebGL2 convention). */
export interface WebGPUGodRaysRequest {
  readonly decode: WebGPUDepthDecode;
  readonly lightUv: readonly [number, number];
  readonly lightClipW: number;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly decay: number;
  readonly density: number;
  readonly medium: number;
  readonly samples: number;
  readonly frameAnchored: boolean;
}

/** One frame of native S7 camera motion blur. */
export interface WebGPUMotionBlurRequest {
  readonly decode: WebGPUDepthDecode;
  /** prevViewProjection · inverse(unjitteredViewProjection), folded in float64. */
  readonly reprojection: Float32Array;
  readonly jitterClip: readonly [number, number];
  /** Authored shutter already scaled by (1/60) / frameTime. */
  readonly shutter: number;
  readonly maxBlurPx: number;
  readonly samples: number;
  readonly tileSize: number;
}

/** Legacy `volumetric-light` options after the CPU kernel's validation. */
export interface WebGPUVolumetricLightUniformInput {
  readonly lightPosition: readonly [number, number];
  readonly color: readonly [number, number, number];
  readonly density: number;
  readonly decay: number;
  readonly weight: number;
  readonly exposure: number;
  readonly samples: number;
  readonly occlusionThreshold: number;
  readonly dither: boolean;
}

/* ------------------------------------------------------------------ *
 * Option resolution (mirrors post/v2Stages.ts; kept local so the main
 * renderer chunk does not import the deferred v2 module).
 * ------------------------------------------------------------------ */

/** Same as v2Stages `godRayColor`: non-finite channels fall back to the warm default. */
export function webgpuGodRayColor(color: unknown): [number, number, number] {
  const fallback: [number, number, number] = [1, 0.96, 0.9];
  let rgb: unknown[] | undefined;
  if (Array.isArray(color)) rgb = color;
  else if (color && typeof color === "object") {
    const o = color as { r?: unknown; g?: unknown; b?: unknown };
    rgb = [o.r, o.g, o.b];
  }
  if (!rgb) return fallback;
  return [0, 1, 2].map((i) => (typeof rgb![i] === "number" && Number.isFinite(rgb![i]) ? (rgb![i] as number) : fallback[i]!)) as [number, number, number];
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Mat = ArrayLike<number>;

function multiply(a: Mat, b: Mat): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Column-major 4x4 inverse in float64; null when singular or non-finite. */
export function invertColumnMajor4(m: Mat): number[] | null {
  const a = Array.from({ length: 16 }, (_, i) => m[i]!);
  if (!a.every(Number.isFinite)) return null;
  const inv = new Array<number>(16);
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!;
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!;
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!;
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!;
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!;
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!;
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!;
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!;
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!;
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!;
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!;
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!;
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!;
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!;
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!;
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return null;
  return inv.map((value) => value / det);
}

/** Frame camera fields the native depth stages read (a subset of `FrameCamera`). */
export interface WebGPUDepthEffectCamera {
  readonly projectionMatrix: ArrayLike<number>;
  readonly projectionMatrixInverse?: ArrayLike<number>;
  readonly viewProjectionMatrix: ArrayLike<number>;
  readonly near: number;
  readonly far: number;
  readonly projection: "perspective" | "orthographic";
  readonly position: readonly [number, number, number];
  readonly depth?: { readonly mode: "standard" | "reversed" | "logarithmic"; readonly clipRange: "minus-one-to-one" | "zero-to-one" };
}

/**
 * The depth decode for a frame camera. Same rules as the WebGL2 v2
 * `writeDepthUniforms`: the exact inverse projection when supplied, else an
 * ordinary GL projection rebuilt from near/far (standard -1..1 only).
 */
export function resolveWebGPUDepthDecode(camera: WebGPUDepthEffectCamera): WebGPUDepthDecode {
  const { near, far } = camera;
  const orthographic = camera.projection === "orthographic";
  const depth = camera.depth ?? { mode: "standard" as const, clipRange: "minus-one-to-one" as const };
  if (!Number.isFinite(near) || (!orthographic && near <= 0) || !(far > near)
      || (far !== Infinity && !Number.isFinite(far)) || (orthographic && !Number.isFinite(far))
      || (depth.mode === "logarithmic" && (near <= 0 || !Number.isFinite(far)))) {
    throw new RenderDeviceError("Native depth stages need a valid camera depth range", "POSTPROCESS_DEPTH_RANGE_INVALID", { near, far });
  }
  let inverse: number[] | null = camera.projectionMatrixInverse ? Array.from(camera.projectionMatrixInverse) : null;
  if (!inverse) inverse = invertColumnMajor4(camera.projectionMatrix);
  if (!inverse || inverse.length !== 16 || !inverse.every(Number.isFinite)) {
    throw new RenderDeviceError("Native depth stages need a finite inverse projection", "POSTPROCESS_PROJECTION_INVERSE_INVALID");
  }
  return { near, far, mode: depth.mode, clipRange: depth.clipRange, inverseProjection: Float32Array.from(inverse) };
}

/** Pipeline `godRays` bag fields (a subset of `GodRayOptions`). */
export interface WebGPUGodRaysOptions {
  readonly samples?: number;
  readonly decay?: number;
  readonly weight?: number;
  readonly color?: unknown;
  readonly intensity?: number;
  readonly lightWorld?: readonly [number, number, number];
  readonly lightDirection?: readonly [number, number, number];
  readonly density?: number;
  readonly frameAnchored?: boolean;
  readonly medium?: number;
}

/** Light placement and uniforms exactly as the WebGL2 S4 stage computes them. */
export function resolveWebGPUGodRays(god: WebGPUGodRaysOptions, camera: WebGPUDepthEffectCamera): WebGPUGodRaysRequest {
  const decode = resolveWebGPUDepthDecode(camera);
  const far = camera.far;
  let lightWorld = god.lightWorld;
  if (!lightWorld && god.lightDirection) {
    const d = god.lightDirection;
    const p = camera.position;
    lightWorld = [p[0] + d[0] * far * 2, p[1] + d[1] * far * 2, p[2] + d[2] * far * 2];
  }
  if (!lightWorld) lightWorld = [camera.position[0], camera.position[1] + far, camera.position[2]];
  const vp = camera.viewProjectionMatrix;
  const clipX = vp[0]! * lightWorld[0] + vp[4]! * lightWorld[1] + vp[8]! * lightWorld[2] + vp[12]!;
  const clipY = vp[1]! * lightWorld[0] + vp[5]! * lightWorld[1] + vp[9]! * lightWorld[2] + vp[13]!;
  const clipW = vp[3]! * lightWorld[0] + vp[7]! * lightWorld[1] + vp[11]! * lightWorld[2] + vp[15]!;
  const lightUv: [number, number] = clipW !== 0 ? [(clipX / clipW) * 0.5 + 0.5, (clipY / clipW) * 0.5 + 0.5] : [0.5, 0.5];
  const samples = Math.round(clamp(finiteOr(god.samples, 32), 1, 128));
  const intensity = finiteOr(god.intensity, 0.7);
  return {
    decode,
    lightUv: [finiteOr(lightUv[0], 0.5), finiteOr(lightUv[1], 0.5)],
    lightClipW: finiteOr(clipW, -1),
    color: webgpuGodRayColor(god.color),
    intensity,
    decay: finiteOr(god.decay, 0.94),
    density: typeof god.density === "number" && Number.isFinite(god.density) ? clamp(god.density, 0.05, 1) : 1,
    medium: typeof god.medium === "number" && Number.isFinite(god.medium) ? clamp(god.medium, 0, 1) : 0,
    samples,
    frameAnchored: god.frameAnchored === true
  };
}

/** Pipeline `motionBlur` bag fields (a subset of the v2 `MotionBlurOptions`). */
export interface WebGPUMotionBlurOptions {
  readonly shutter?: number;
  readonly maxBlurPx?: number;
  readonly samples?: number;
  readonly tileSize?: number;
}

/**
 * Camera motion blur from the temporal v2 frame: the reprojection
 * prevVP · inverse(unjitteredVP) folded in float64 (so a static camera is the
 * identity) and the shutter scaled by the nominal 60 Hz frame, as WebGL2 S7.
 */
export function resolveWebGPUMotionBlur(
  mb: WebGPUMotionBlurOptions,
  temporal: { readonly unjittered: ArrayLike<number>; readonly previous: ArrayLike<number>; readonly jitterClip: readonly [number, number]; readonly frameTime: number },
  camera: WebGPUDepthEffectCamera
): WebGPUMotionBlurRequest {
  const decode = resolveWebGPUDepthDecode(camera);
  const inverse = invertColumnMajor4(temporal.unjittered);
  if (!inverse) throw new RenderDeviceError("Motion blur needs an invertible view-projection", "TEMPORAL_INVALID_MATRIX");
  const reprojection = multiply(Array.from({ length: 16 }, (_, i) => temporal.previous[i]!), inverse);
  if (!reprojection.every(Number.isFinite)) throw new RenderDeviceError("Motion blur reprojection is not finite", "TEMPORAL_INVALID_MATRIX");
  const samples = Math.round(clamp(finiteOr(mb.samples, 12), 1, 16));
  const tileSize = Math.round(clamp(finiteOr(mb.tileSize, 16), 4, 32));
  const frameScale = finiteOr(mb.shutter, 0.5) * ((1 / 60) / Math.max(finiteOr(temporal.frameTime, 1 / 60), 1e-4));
  return {
    decode,
    reprojection: Float32Array.from(reprojection),
    jitterClip: [finiteOr(temporal.jitterClip[0], 0), finiteOr(temporal.jitterClip[1], 0)],
    shutter: clamp(frameScale, -1e10, 1e10),
    maxBlurPx: Math.max(0, finiteOr(mb.maxBlurPx, 32)),
    samples,
    tileSize
  };
}

/** Validates legacy volumetric-light options with the CPU kernel's ranges and defaults. */
export function resolveWebGPUVolumetricLight(options: Readonly<Record<string, unknown>>): WebGPUVolumetricLightUniformInput {
  const range = (name: string, fallback: number, min: number, max: number): number => {
    const value = options[name] === undefined ? fallback : options[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`Volumetric light ${name} must be finite and within [${min}, ${max}].`);
    }
    return value;
  };
  const lightPosition = (options.lightPosition ?? [0.5, 0.18]) as readonly number[];
  if (!Array.isArray(lightPosition) || lightPosition.length !== 2 || !lightPosition.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new RangeError("Volumetric light position must contain two finite normalized coordinates.");
  }
  const color = (options.color ?? [1, 0.88, 0.62]) as readonly number[];
  if (!Array.isArray(color) || color.length !== 3 || !color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new RangeError("Volumetric light color must contain three finite values within [0, 1].");
  }
  const samples = range("samples", 32, 4, 128);
  if (!Number.isInteger(samples)) throw new RangeError("Volumetric light samples must be an integer in [4, 128].");
  return {
    lightPosition: [lightPosition[0]!, lightPosition[1]!],
    color: [color[0]!, color[1]!, color[2]!],
    density: range("density", 0.9, 0.01, 2),
    decay: range("decay", 0.96, 0, 1),
    weight: range("weight", 0.18, 0, 2),
    exposure: range("exposure", 0.72, 0, 4),
    samples,
    occlusionThreshold: range("occlusionThreshold", 0.985, 0, 1),
    dither: options.dither === true
  };
}

/* ------------------------------------------------------------------ *
 * Uniform packing. Each layout matches the WGSL struct below.
 * ------------------------------------------------------------------ */

const DEPTH_MODE = { standard: 0, reversed: 1, logarithmic: 2 } as const;
/** Stand-in for an infinite far plane; any linear depth this large reads as sky. */
const FAR_LIMIT = 3.0e38;

function writeDecode(out: Float32Array, offset: number, decode: WebGPUDepthDecode): void {
  out.set(decode.inverseProjection, offset);
  out[offset + 16] = decode.near;
  out[offset + 17] = Math.min(decode.far, FAR_LIMIT);
  out[offset + 18] = DEPTH_MODE[decode.mode];
  out[offset + 19] = decode.clipRange === "zero-to-one" ? 1 : 0;
}

/** 144 bytes: decode (80), light, color, shape, frame. */
export function webgpuGodRaysUniforms(request: WebGPUGodRaysRequest, fullWidth: number, halfWidth: number, halfHeight: number): Float32Array {
  const out = new Float32Array(36);
  writeDecode(out, 0, request.decode);
  out.set([request.lightUv[0], request.lightUv[1], request.lightClipW, request.intensity], 20);
  out.set([request.color[0], request.color[1], request.color[2], request.decay], 24);
  // Disk feather radii are fixed in the WebGL2 stage (0.08 outer, 0.02 inner).
  out.set([0.08, 0.02, request.density, request.medium], 28);
  // Lane 514: frame-anchored shafts map the half-res pass onto the full frame; otherwise the legacy mapping (scale 1).
  out.set([request.frameAnchored ? fullWidth / halfWidth : 1, request.samples, halfHeight, 0], 32);
  return out;
}

/** 160 bytes: reprojection (64), decode (80), frame. */
export function webgpuMotionVelocityUniforms(request: WebGPUMotionBlurRequest, width: number, height: number): Float32Array {
  const out = new Float32Array(40);
  out.set(request.reprojection, 0);
  writeDecode(out, 16, request.decode);
  out.set([request.jitterClip[0], request.jitterClip[1], width, height], 36);
  return out;
}

/** 16 bytes: tile size. */
export function webgpuMotionTileUniforms(request: WebGPUMotionBlurRequest): Float32Array {
  return new Float32Array([request.tileSize, 0, 0, 0]);
}

/** 96 bytes: decode (80), blur. */
export function webgpuMotionReconstructUniforms(request: WebGPUMotionBlurRequest): Float32Array {
  const out = new Float32Array(24);
  writeDecode(out, 0, request.decode);
  out.set([request.shutter, request.maxBlurPx, request.samples, request.tileSize], 20);
  return out;
}

/** 64 bytes: light, march, color, depth. `depthDecode` supplies near/far for the logarithmic standardisation. */
export function webgpuVolumetricLightUniforms(input: WebGPUVolumetricLightUniformInput, width: number, height: number,
  depth: { readonly mode: WebGPUDepthDecode["mode"]; readonly near: number; readonly far: number }): Float32Array {
  const out = new Float32Array(16);
  // The CPU kernel walks rows of a bottom-up WebGL readback; keep that convention.
  out.set([input.lightPosition[0] * (width - 1), input.lightPosition[1] * (height - 1), input.density, input.decay], 0);
  out.set([input.weight, input.exposure, input.samples, input.occlusionThreshold], 4);
  out.set([input.color[0], input.color[1], input.color[2], input.dither ? 1 : 0], 8);
  out.set([DEPTH_MODE[depth.mode], depth.near, Math.min(depth.far, FAR_LIMIT), 0], 12);
  return out;
}

/* ------------------------------------------------------------------ *
 * WGSL
 * ------------------------------------------------------------------ */

const fragmentCache = new Map<string, string>();

/** Generated once per variant: the device keys its pipeline cache on the WGSL text. */
function memo(key: string, build: () => string): string {
  let code = fragmentCache.get(key);
  if (code === undefined) { code = build(); fragmentCache.set(key, code); }
  return code;
}

function depthBinding(binding: number, multisampled: boolean): string {
  return `@group(0) @binding(${binding}) var depthTex: ${multisampled ? "texture_depth_multisampled_2d" : "texture_depth_2d"};`;
}

/** Sample 0 of the forward depth attachment at a clamped pixel (top-left origin). */
const LOAD_DEPTH_WGSL = /* wgsl */ `
fn a3dLoadDepth(pixel: vec2<i32>) -> f32 {
  let size = vec2<i32>(textureDimensions(depthTex));
  return textureLoad(depthTex, clamp(pixel, vec2<i32>(0), size - vec2<i32>(1)), 0);
}`;

/** WGSL port of the WebGL2 v2 DEPTH_FUNCTIONS (`auraNdcDepth`, `auraLinearDepth`, `auraLogNdcDepth`). */
const DECODE_STRUCT_WGSL = /* wgsl */ `
struct DepthDecode {
  invProj: mat4x4<f32>,
  params: vec4<f32>, // near, far, mode (0 standard, 1 reversed, 2 logarithmic), clip zero-to-one
};`;

function decodeFunctionsWgsl(field: string): string {
  return /* wgsl */ `
const A3D_SKY_DEPTH: f32 = 3e38;
fn a3dNdcDepth(depth: f32) -> f32 {
  return select(depth * 2.0 - 1.0, depth, ${field}.params.w > 0.5);
}
fn a3dLinearDepth(ndcXY: vec2<f32>, depth: f32) -> f32 {
  let mode = i32(${field}.params.z + 0.5);
  if ((mode == 1 && depth <= 0.0) || (mode != 1 && depth >= 1.0)) { return A3D_SKY_DEPTH; }
  let near = ${field}.params.x;
  let far = ${field}.params.y;
  if (mode == 2) {
    if (!(near > 0.0) || !(far > near) || far >= A3D_SKY_DEPTH) { return A3D_SKY_DEPTH; }
    return exp(mix(log(near), log(far), depth));
  }
  let view = ${field}.invProj * vec4<f32>(ndcXY, a3dNdcDepth(depth), 1.0);
  if (abs(view.w) < 1e-20 || view.w != view.w || view.z != view.z) { return A3D_SKY_DEPTH; }
  let viewDepth = -view.z / view.w;
  if (viewDepth != viewDepth || abs(viewDepth) >= A3D_SKY_DEPTH) { return A3D_SKY_DEPTH; }
  return viewDepth;
}
fn a3dLogNdcDepth(ndcXY: vec2<f32>, viewDepth: f32) -> f32 {
  let q = ${field}.invProj * vec4<f32>(ndcXY, 0.0, 1.0);
  let zColumn = ${field}.invProj[2];
  let denominator = zColumn.z + viewDepth * zColumn.w;
  if (abs(denominator) < 1e-20) { return 0.0; }
  return -(q.z + viewDepth * q.w) / denominator;
}
/** Linear view depth at a bottom-left uv. */
fn a3dLinearDepthAtGlUv(uv: vec2<f32>) -> f32 {
  let size = vec2<f32>(textureDimensions(depthTex));
  let pixel = vec2<i32>(floor(vec2<f32>(uv.x, 1.0 - uv.y) * size));
  return a3dLinearDepth(uv * 2.0 - 1.0, a3dLoadDepth(pixel));
}`;
}

/**
 * S4 god rays: half-res radial march, a line-for-line port of GODRAYS_GLSL
 * (emitter falloff, decay-weighted mean, disk, density, medium, uv scale).
 */
export function webgpuGodRaysFragment(multisampled: boolean): string {
  return memo(`webgpuGodRaysFragment:${multisampled}`, () => /* wgsl */ `${DECODE_STRUCT_WGSL}
struct GodRays {
  decode: DepthDecode,
  light: vec4<f32>, // lightUv (bottom-left), lightClipW, intensity
  color: vec4<f32>, // rgb, decay
  shape: vec4<f32>, // diskOuter, diskInner, density, medium
  frame: vec4<f32>, // uvScale, samples, output height, unused
};
@group(0) @binding(0) var<uniform> u: GodRays;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
${depthBinding(3, multisampled)}
${LOAD_DEPTH_WGSL}
${decodeFunctionsWgsl("u.decode")}
const EMIT_RADIUS: f32 = 0.6;

fn sampleHdr(uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(hdrTex, linearSampler, vec2<f32>(uv.x, 1.0 - uv.y), 0.0);
}

@fragment
fn fs_godrays(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let glFrag = vec2<f32>(position.x, u.frame.z - position.y);
  let hdrSize = vec2<f32>(textureDimensions(hdrTex));
  let uvScale = select(1.0, u.frame.x, u.frame.x > 0.0);
  let uv = glFrag * uvScale / hdrSize;
  let lightUv = u.light.xy;
  let dir = lightUv - uv;
  let dist = length(dir);
  let density = select(1.0, u.shape.z, u.shape.z > 0.0);
  let samples = i32(u.frame.y + 0.5);
  let stepUv = select(vec2<f32>(0.0), dir * density / f32(max(samples, 1)), dist > 0.0);
  let offScreen = clamp(1.0 - (max(abs(lightUv.x - 0.5), abs(lightUv.y - 0.5)) - 0.5) * 4.0, 0.0, 1.0)
    * step(0.0, u.light.z);
  let aspect = vec2<f32>(hdrSize.x / max(hdrSize.y, 1.0), 1.0);
  let far = u.decode.params.y;
  var marchWeight = 1.0;
  var weightSum = 0.0;
  var accum = vec3<f32>(0.0);
  var sampleUv = uv;
  for (var i = 0; i < 128; i = i + 1) {
    if (i >= samples) { break; }
    sampleUv = sampleUv + stepUv;
    let hdr = sampleHdr(sampleUv);
    let linZ = a3dLinearDepthAtGlUv(sampleUv);
    let sky = linZ >= far * 0.999;
    let luma = dot(hdr.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let nearLight = 1.0 - smoothstep(0.0, EMIT_RADIUS, length((sampleUv - lightUv) * aspect));
    var src = select(vec3<f32>(0.0), hdr.rgb * nearLight, sky || luma > 4.0);
    if (sky) { src = src + vec3<f32>(smoothstep(u.shape.x, u.shape.y, length(sampleUv - lightUv))); }
    accum = accum + marchWeight * src;
    weightSum = weightSum + marchWeight;
    marchWeight = marchWeight * u.color.w;
  }
  let shaft = accum / max(weightSum, 1e-4);
  let viewZ = min(a3dLinearDepthAtGlUv(uv), far);
  let medium = select(1.0, 1.0 - exp(-u.shape.w * viewZ), u.shape.w > 0.0);
  return vec4<f32>(shaft * u.color.rgb * u.light.w * offScreen * medium, 1.0);
}
`);
}

/** Additive S4 composite: full-res HDR plus the bilinearly upsampled half-res shafts. Keeps the scene alpha. */
export const WEBGPU_GODRAYS_COMPOSITE_FRAGMENT = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var shaftTex: texture_2d<f32>;
@fragment
fn fs_godrays_composite(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let base = textureLoad(hdrTex, pixel, 0);
  let uv = position.xy * params.xy;
  let shaft = textureSampleLevel(shaftTex, linearSampler, uv, 0.0);
  return vec4<f32>(base.rgb + shaft.rgb, base.a);
}`;

/**
 * S1-C camera velocity in pixels (top-left, +y down) from depth reprojection.
 * Port of CAMERA_VELOCITY_GLSL; sky pixels get zero velocity as on WebGL2.
 */
export function webgpuMotionVelocityFragment(multisampled: boolean): string {
  return memo(`webgpuMotionVelocityFragment:${multisampled}`, () => /* wgsl */ `${DECODE_STRUCT_WGSL}
struct MotionVelocity {
  reprojection: mat4x4<f32>,
  decode: DepthDecode,
  frame: vec4<f32>, // jitterClip.xy, width, height
};
@group(0) @binding(0) var<uniform> u: MotionVelocity;
@group(0) @binding(1) var linearSampler: sampler;
${depthBinding(2, multisampled)}
${LOAD_DEPTH_WGSL}
${decodeFunctionsWgsl("u.decode")}

@fragment
fn fs_motion_velocity(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  _ = linearSampler;
  let size = u.frame.zw;
  let uv = vec2<f32>(position.x / size.x, 1.0 - position.y / size.y);
  let ndcCurr = uv * 2.0 - 1.0 - u.frame.xy;
  let d = a3dLoadDepth(vec2<i32>(position.xy));
  let linearDepth = a3dLinearDepth(ndcCurr, d);
  if (linearDepth >= 2.9e38) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let mode = i32(u.decode.params.z + 0.5);
  let ndcZ = select(a3dNdcDepth(d), a3dLogNdcDepth(ndcCurr, linearDepth), mode == 2);
  let clipPrev = u.reprojection * vec4<f32>(ndcCurr, ndcZ, 1.0);
  if (abs(clipPrev.w) < 1e-20 || clipPrev.w != clipPrev.w) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let velocity = (ndcCurr - clipPrev.xy / clipPrev.w) * 0.5;
  return vec4<f32>(velocity.x * size.x, -velocity.y * size.y, 0.0, 1.0);
}
`);
}

/** Tile max of the per-pixel velocity (largest magnitude, direction kept). */
export const WEBGPU_MOTION_TILE_MAX_FRAGMENT = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: vec4<f32>; // tile size
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var velocityTex: texture_2d<f32>;
@fragment
fn fs_motion_tile(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  _ = linearSampler;
  let tileSize = i32(params.x + 0.5);
  let tile = vec2<i32>(position.xy);
  let size = vec2<i32>(textureDimensions(velocityTex));
  var best = vec2<f32>(0.0);
  var mag = 0.0;
  for (var y = 0; y < 32; y = y + 1) {
    if (y >= tileSize) { break; }
    for (var x = 0; x < 32; x = x + 1) {
      if (x >= tileSize) { break; }
      let p = tile * tileSize + vec2<i32>(x, y);
      if (p.x >= size.x || p.y >= size.y) { continue; }
      let v = textureLoad(velocityTex, p, 0).rg;
      let m = dot(v, v);
      if (m > mag) { mag = m; best = v; }
    }
  }
  return vec4<f32>(best, 0.0, 1.0);
}`;

/** 3x3 neighbourhood max of the tile velocities. */
export const WEBGPU_MOTION_NEIGHBOR_FRAGMENT = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var tileTex: texture_2d<f32>;
@fragment
fn fs_motion_neighbor(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  _ = linearSampler;
  _ = params;
  let tile = vec2<i32>(position.xy);
  let size = vec2<i32>(textureDimensions(tileTex));
  var best = vec2<f32>(0.0);
  var mag = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let v = textureLoad(tileTex, clamp(tile + vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1)), 0).rg;
      let m = dot(v, v);
      if (m > mag) { mag = m; best = v; }
    }
  }
  return vec4<f32>(best, 0.0, 1.0);
}`;

/**
 * McGuire reconstruction along the neighbourhood-max velocity with a soft
 * 0.05 m depth compare. Port of MB_RECONSTRUCT_GLSL; linear depth is decoded
 * from the depth attachment per tap instead of a linear-depth target.
 */
export function webgpuMotionReconstructFragment(multisampled: boolean): string {
  return memo(`webgpuMotionReconstructFragment:${multisampled}`, () => /* wgsl */ `${DECODE_STRUCT_WGSL}
struct MotionBlur {
  decode: DepthDecode,
  blur: vec4<f32>, // shutter, maxBlurPx, samples, tileSize
};
@group(0) @binding(0) var<uniform> u: MotionBlur;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var colorTex: texture_2d<f32>;
@group(0) @binding(3) var neighborTex: texture_2d<f32>;
${depthBinding(4, multisampled)}
${LOAD_DEPTH_WGSL}
${decodeFunctionsWgsl("u.decode")}

fn linearAtPixel(pixel: vec2<i32>, size: vec2<f32>) -> f32 {
  let uv = vec2<f32>((f32(pixel.x) + 0.5) / size.x, 1.0 - (f32(pixel.y) + 0.5) / size.y);
  return a3dLinearDepth(uv * 2.0 - 1.0, a3dLoadDepth(pixel));
}

@fragment
fn fs_motion_reconstruct(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  _ = linearSampler;
  let sizeI = vec2<i32>(textureDimensions(colorTex));
  let size = vec2<f32>(sizeI);
  let pixel = clamp(vec2<i32>(position.xy), vec2<i32>(0), sizeI - vec2<i32>(1));
  let src = textureLoad(colorTex, pixel, 0);
  let samples = clamp(i32(u.blur.z + 0.5), 1, 16);
  if (samples == 1) { return src; }
  let zSelf = linearAtPixel(pixel, size);
  let neighborMax = vec2<i32>(textureDimensions(neighborTex)) - vec2<i32>(1);
  let tile = clamp(pixel / max(i32(u.blur.w + 0.5), 1), vec2<i32>(0), neighborMax);
  let velocity = clamp(textureLoad(neighborTex, tile, 0).rg, vec2<f32>(-1e10), vec2<f32>(1e10));
  var velocityPx = velocity * clamp(u.blur.x, -1e10, 1e10);
  let component = max(abs(velocityPx.x), abs(velocityPx.y));
  if (component == 0.0) { return src; }
  let direction = velocityPx / component;
  let maxLen = clamp(u.blur.y, 0.0, 2.0 * length(size));
  velocityPx = direction * min(component, maxLen / length(direction));
  var sum = vec4<f32>(0.0);
  var wsum = 0.0;
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= samples) { break; }
    let t = (f32(i) + 0.5) / f32(samples) - 0.5;
    let pos = clamp(vec2<f32>(pixel) + velocityPx * t, vec2<f32>(0.0), size - vec2<f32>(1.0));
    let base = vec2<i32>(floor(pos));
    let fraction = fract(pos);
    for (var y = 0; y < 2; y = y + 1) {
      for (var x = 0; x < 2; x = x + 1) {
        let coverage = select(fraction.x, 1.0 - fraction.x, x == 0) * select(fraction.y, 1.0 - fraction.y, y == 0);
        if (coverage <= 0.0) { continue; }
        let tapPx = clamp(base + vec2<i32>(x, y), vec2<i32>(0), sizeI - vec2<i32>(1));
        let zTap = linearAtPixel(tapPx, size);
        let w = coverage * clamp(1.0 - abs(zTap - zSelf) / 0.05, 0.0, 1.0);
        var sampleColor = textureLoad(colorTex, tapPx, 0);
        if (src.a <= 1.0) { sampleColor.a = clamp(sampleColor.a, 0.0, 1.0); }
        sum = sum + sampleColor * w;
        wsum = wsum + w;
      }
    }
  }
  let filtered = select(src, sum / wsum, wsum > 0.0);
  return select(filtered, vec4<f32>(filtered.rgb, src.a), src.a > 1.0);
}
`);
}

/**
 * Legacy `volumetric-light`: a port of the CPU kernel `volumetricLightPixels`
 * on the display-space (LDR) frame. The kernel walks the rows of a bottom-up
 * readback and compares standard window depth with the occlusion threshold;
 * reversed and logarithmic depth are converted to standard window depth first.
 */
export function webgpuVolumetricLightFragment(multisampled: boolean): string {
  return memo(`webgpuVolumetricLightFragment:${multisampled}`, () => /* wgsl */ `
struct VolumetricLight {
  light: vec4<f32>,  // lightX, lightY (pixels, bottom-up rows), density, decay
  march: vec4<f32>,  // weight, exposure, samples, occlusionThreshold
  color: vec4<f32>,  // rgb, dither
  depth: vec4<f32>,  // mode, near, far, unused
};
@group(0) @binding(0) var<uniform> u: VolumetricLight;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var colorTex: texture_2d<f32>;
${depthBinding(3, multisampled)}
${LOAD_DEPTH_WGSL}

fn standardDepth(raw: f32) -> f32 {
  let mode = i32(u.depth.x + 0.5);
  if (mode == 1) { return clamp(1.0 - raw, 0.0, 1.0); }
  if (mode == 2) {
    let near = u.depth.y;
    let far = u.depth.z;
    if (!(near > 0.0) || !(far > near)) { return clamp(raw, 0.0, 1.0); }
    let z = exp(mix(log(near), log(far), raw));
    return clamp(far * (z - near) / (z * (far - near)), 0.0, 1.0);
  }
  return clamp(raw, 0.0, 1.0);
}

fn bayer2(x: i32, y: i32) -> f32 {
  let index = ((y & 1) << 1u) | (x & 1);
  if (index == 0) { return -0.375; }
  if (index == 1) { return 0.375; }
  if (index == 2) { return -0.125; }
  return 0.125;
}

@fragment
fn fs_volumetric_light(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  _ = linearSampler;
  let sizeI = vec2<i32>(textureDimensions(colorTex));
  let x = i32(position.x);
  let rowTop = i32(position.y);
  let y = sizeI.y - 1 - rowTop;
  let samples = i32(u.march.z + 0.5);
  let deltaX = ((u.light.x - f32(x)) / f32(samples)) * u.light.z;
  let deltaY = ((u.light.y - f32(y)) / f32(samples)) * u.light.z;
  var sampleX = f32(x);
  var sampleY = f32(y);
  var illuminationDecay = 1.0;
  var scattering = 0.0;
  for (var i = 0; i < 128; i = i + 1) {
    if (i >= samples) { break; }
    sampleX = sampleX + deltaX;
    sampleY = sampleY + deltaY;
    let sx = clamp(i32(round(sampleX)), 0, sizeI.x - 1);
    let sy = clamp(i32(round(sampleY)), 0, sizeI.y - 1);
    let texel = vec2<i32>(sx, sizeI.y - 1 - sy);
    let c = textureLoad(colorTex, texel, 0);
    let luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    let source = max(0.0, luminance - 0.42) / 0.58;
    let visible = select(0.0, 1.0, standardDepth(a3dLoadDepth(texel)) >= u.march.w || source > 0.05);
    scattering = scattering + source * visible * illuminationDecay * u.march.x;
    illuminationDecay = illuminationDecay * u.light.w;
  }
  let boost = scattering * u.march.y;
  let before = textureLoad(colorTex, vec2<i32>(x, rowTop), 0);
  let dither = select(0.0, bayer2(x, y), u.color.w > 0.5) / 255.0;
  return vec4<f32>(clamp(before.rgb + u.color.rgb * boost + vec3<f32>(dither), vec3<f32>(0.0), vec3<f32>(1.0)), before.a);
}
`);
}
