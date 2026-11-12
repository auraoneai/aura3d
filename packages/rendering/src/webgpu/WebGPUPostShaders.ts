import { rendererQrFlags } from "../renderer/FrameGraph";

/**
 * PRD-03 Phase 7 — the §6.4 exposure semantic under `A3D_QR_POST` is a
 * linear multiplier (same as three `toneMappingExposure`), not an EV —
 * `webgpuColorGradeFragment` selects the expression per flag.
 * `webgpuFxaaFragment` (the 2-tap approximation) and the uncapped
 * `webgpuSoftKneeWeight` mirror are deleted under the flag: the real r185
 * FXAA WGSL twin lives in `post/shaders/fxaa.wgsl.ts` and the §6.6-capped
 * knee in `post/shaders/bloom.wgsl.ts` (execution twin is Q-11-2, lane 11).
 */
function webgpuPostFlagOn(): boolean {
  return rendererQrFlags()?.on("A3D_QR_POST") === true;
}

function postWgslLegacyRemoved(name: string): never {
  throw new Error(`POST_WGSL_LEGACY_REMOVED:${name}`);
}

/**
 * muse3jsparity-PRD J2 — native WebGPU post-process WGSL sources.
 *
 * Fullscreen-triangle passes that run on the real WebGPU device
 * (WebGPUDevice.executeWebGPUBloom / executeWebGPUColorGrade /
 * executeWebGPUFxaa). Backend-agnostic image work: bright-extract with a
 * soft-knee threshold, a separable-Gaussian mip pyramid, energy-weighted
 * composite, exposure/contrast/saturation color grade, and an FXAA
 * luma-edge pass. Native TAA is owned by WebGPUTemporal.ts, with explicit
 * GPU velocity and ping-pong history targets; it performs no CPU readback.
 */

export const WEBGPU_POST_VERTEX_WGSL = `struct PostVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_post(@builtin(vertex_index) index: u32) -> PostVertexOutput {
  var output: PostVertexOutput;
  let corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let corner = corners[index];
  output.position = vec4<f32>(corner, 0.0, 1.0);
  output.uv = vec2<f32>((corner.x + 1.0) * 0.5, 1.0 - (corner.y + 1.0) * 0.5);
  return output;
}
`;

export function webgpuBrightExtractFragment(): string {
  return `struct BloomUniforms {
  threshold: f32,
  knee: f32,
  strength: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_bloom: BloomUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

fn a3d_sanitize_hdr(c: vec3<f32>) -> vec3<f32> {
  let bits = bitcast<vec3<u32>>(c);
  let finite_mask = (bits & vec3<u32>(0x7f800000u)) != vec3<u32>(0x7f800000u);
  let clean = select(vec3<f32>(0.0), c, finite_mask);
  return clamp(clean, vec3<f32>(0.0), vec3<f32>(65504.0));
}

@fragment
fn fs_bright(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(u_source, u_sampler, uv);
  let rgb = a3d_sanitize_hdr(color.rgb);
  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  // Soft-knee gate: smoothstep over [threshold - knee, threshold + knee].
  // Floor knee >= 1e-4 before smoothstep so knee = 0 never triggers WGSL
  // smoothstep(lo, lo, x) undefined behavior, while preserving hard step at 0.
  let safe_knee = max(u_bloom.knee, 1e-4);
  let lo = u_bloom.threshold - safe_knee;
  let hi = u_bloom.threshold + safe_knee;
  let soft_weight = smoothstep(lo, hi, luma);
  let hard_weight = select(0.0, 1.0, luma >= u_bloom.threshold);
  let weight = select(soft_weight, hard_weight, u_bloom.knee <= 0.0);
  return vec4<f32>(rgb * weight, 1.0);
}
`;
}

export function webgpuBlurFragment(): string {
  return `struct BlurUniforms {
  direction: vec2<f32>,
  texel: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_blur: BlurUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment
fn fs_blur(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // 9-tap separable Gaussian (sigma ~1.35): weights sum to exactly 1.0 so
  // the pyramid preserves energy before the composite gain stage.
  // NOTE: direction/texel MUST be read from u_blur (not baked): an
  // unreferenced uniform is stripped, which invalidates bind-group entry 0.
  let step = u_blur.direction * u_blur.texel;
  var acc = textureSample(u_source, u_sampler, uv) * 0.2270270270;
  acc = acc + textureSample(u_source, u_sampler, uv + step * 1.3846153846) * 0.3162162162;
  acc = acc + textureSample(u_source, u_sampler, uv - step * 1.3846153846) * 0.3162162162;
  acc = acc + textureSample(u_source, u_sampler, uv + step * 3.2307692308) * 0.0702702703;
  acc = acc + textureSample(u_source, u_sampler, uv - step * 3.2307692308) * 0.0702702703;
  return vec4<f32>(acc.rgb, 1.0);
}
`;
}

export interface WebGPUCompositeParams {
  /** Per-mip weights, index 0 = finest. Energy-preserving when they sum to 1. */
  readonly weights: readonly number[];
  /** Global gain (bloom strength). */
  readonly strength: number;
}

export const WEBGPU_BLOOM_MAX_MIPS = 5;

export function webgpuBloomCompositeFragment(params: WebGPUCompositeParams): string {
  const lines = params.weights
    .map((weight, index) => `  bloom = bloom + textureSample(u_mip${index}, u_sampler, uv).rgb * ${weight.toFixed(5)};`)
    .join("\n");
  const bindings = params.weights
    .map((_, index) => `@group(0) @binding(${index + 3}) var u_mip${index}: texture_2d<f32>;`)
    .join("\n");
  return `struct CompositeUniforms {
  strength: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u_composite: CompositeUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_scene: texture_2d<f32>;
${bindings}

@fragment
fn fs_composite(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let scene = textureSample(u_scene, u_sampler, uv);
  var bloom = vec3<f32>(0.0, 0.0, 0.0);
${lines}
  return vec4<f32>(scene.rgb + bloom * u_composite.strength, scene.a);
}
`;
}

/** Default per-mip weights: 0.5^i falloff normalized to sum 1 (energy-preserving). */
export function defaultWebGPUBloomWeights(mipCount: number): number[] {
  const raw = Array.from({ length: mipCount }, (_, index) => Math.pow(0.5, index));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

export type WebGPUBloomQuality = "performance" | "balanced" | "cinematic";

export interface WebGPUBloomOptions {
  readonly threshold?: number;
  readonly knee?: number;
  readonly strength?: number;
  readonly quality?: WebGPUBloomQuality;
  readonly mipCount?: number;
}

export interface NormalizedWebGPUBloom {
  readonly threshold: number;
  readonly knee: number;
  readonly strength: number;
  readonly quality: WebGPUBloomQuality;
  readonly mipCount: number;
  readonly halfFloat: boolean;
}

export const WEBGPU_BLOOM_QUALITY_TABLE: Readonly<Record<WebGPUBloomQuality, { readonly mipCount: number; readonly halfFloat: boolean }>> = {
  // performance keeps the single-target legacy shape; balanced/cinematic run
  // the full pyramid with half-float mip targets (mirrors the WebGL2 tiers).
  performance: { mipCount: 1, halfFloat: false },
  balanced: { mipCount: 3, halfFloat: true },
  cinematic: { mipCount: 5, halfFloat: true }
};

export function normalizeWebGPUBloomQuality(quality: WebGPUBloomQuality | undefined): {
  readonly quality: WebGPUBloomQuality;
  readonly mipCount: number;
  readonly halfFloat: boolean;
} {
  const resolved: WebGPUBloomQuality = quality ?? "balanced";
  const table = WEBGPU_BLOOM_QUALITY_TABLE[resolved];
  if (!table) throw new RangeError(`Unknown WebGPU bloom quality "${String(quality)}" (expected performance|balanced|cinematic).`);
  return { quality: resolved, mipCount: table.mipCount, halfFloat: table.halfFloat };
}

export function normalizeWebGPUBloomOptions(options: WebGPUBloomOptions = {}): NormalizedWebGPUBloom {
  const { quality, mipCount, halfFloat } = normalizeWebGPUBloomQuality(options.quality);
  const threshold = options.threshold ?? 0.85;
  const knee = options.knee ?? 0.15;
  const strength = options.strength ?? 0.6;
  if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError("WebGPU bloom threshold must be a finite number >= 0.");
  if (!Number.isFinite(knee) || knee < 0) throw new RangeError("WebGPU bloom knee must be a finite number >= 0.");
  if (!Number.isFinite(strength) || strength < 0) throw new RangeError("WebGPU bloom strength must be a finite number >= 0.");
  if (options.mipCount !== undefined) {
    if (!Number.isInteger(options.mipCount) || options.mipCount < 1 || options.mipCount > WEBGPU_BLOOM_MAX_MIPS) {
      throw new RangeError(`WebGPU bloom mipCount must be an integer in [1, ${WEBGPU_BLOOM_MAX_MIPS}].`);
    }
    return { threshold, knee, strength, quality, mipCount: options.mipCount, halfFloat };
  }
  return { threshold, knee, strength, quality, mipCount, halfFloat };
}

export interface WebGPUBloomDiagnostics {
  readonly mipCount: number;
  readonly halfFloat: boolean;
  readonly targetBytes: number;
  readonly compositeGain: number;
  readonly passes: number;
  readonly executionMode: "webgpu-native-post";
}

export interface WebGPUColorGradeOptions {
  readonly exposure?: number;
  readonly contrast?: number;
  readonly saturation?: number;
}

export interface NormalizedWebGPUColorGrade {
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
}

export function normalizeWebGPUColorGradeOptions(options: WebGPUColorGradeOptions = {}): NormalizedWebGPUColorGrade {
  // PRD-03 Phase 7: flag-on exposure is a linear multiplier (identity 1.0);
  // flag-off keeps the J2 stops semantic (identity 0).
  const exposure = options.exposure ?? (webgpuPostFlagOn() ? 1 : 0);
  const contrast = options.contrast ?? 1;
  const saturation = options.saturation ?? 1;
  if (!Number.isFinite(exposure)) throw new RangeError("WebGPU color-grade exposure must be finite.");
  if (!Number.isFinite(contrast) || contrast < 0) throw new RangeError("WebGPU color-grade contrast must be finite and >= 0.");
  if (!Number.isFinite(saturation) || saturation < 0) throw new RangeError("WebGPU color-grade saturation must be finite and >= 0.");
  return { exposure, contrast, saturation };
}

export interface WebGPUFxaaOptions {
  readonly enabled?: boolean;
}

/** CPU mirror of the WGSL soft-knee gate (unit oracle, never the shader output). */
export function webgpuSoftKneeWeight(luma: number, threshold: number, knee: number): number {
  // Deleted under the flag (PRD-03 Phase 7): the uncapped J2 soft-knee mirror
  // is superseded by the §6.6 quadratic knee in post/shaders/bloom.wgsl.ts.
  if (webgpuPostFlagOn()) postWgslLegacyRemoved("webgpuSoftKneeWeight");
  if (knee <= 0) return luma >= threshold ? 1 : 0;
  const lo = threshold - knee;
  const hi = threshold + knee;
  if (luma <= lo) return 0;
  if (luma >= hi) return 1;
  const t = (luma - lo) / (hi - lo);
  return t * t * (3 - 2 * t);
}

export function webgpuColorGradeFragment(): string {
  // PRD-03 Phase 7: flag-on exposure is the same linear multiplier as three
  // `toneMappingExposure`; flag-off keeps the J2 EV (`exp2`) semantic.
  const exposureLine = webgpuPostFlagOn()
    ? "color = color * u_grade.exposure;"
    : "color = color * exp2(u_grade.exposure);";
  return `struct GradeUniforms {
  exposure: f32,
  contrast: f32,
  saturation: f32,
  display_p3: f32,
};

@group(0) @binding(0) var<uniform> u_grade: GradeUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment
fn fs_grade(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(u_source, u_sampler, uv).rgb;
  // Exposure first (stops simulate the root colorGrade node), then
  // saturation around luma, then contrast around middle gray.
  // NOTE: all fields MUST be read from u_grade (not baked): an unreferenced
  // uniform is stripped, which invalidates bind-group entry 0.
  ${exposureLine}
  let luma_weights = select(
    vec3<f32>(0.2126, 0.7152, 0.0722),
    vec3<f32>(0.22897456, 0.69173852, 0.07928691),
    u_grade.display_p3 > 0.5
  );
  let luma = dot(color, luma_weights);
  color = mix(vec3<f32>(luma), color, u_grade.saturation);
  color = (color - vec3<f32>(0.5)) * u_grade.contrast + vec3<f32>(0.5);
  return vec4<f32>(color, 1.0);
}
`;
}

export function webgpuFxaaFragment(): string {
  // Deleted under the flag (PRD-03 Phase 7): the 2-tap J2 "FXAA" is
  // superseded by the three r185 FXAA twin in post/shaders/fxaa.wgsl.ts.
  if (webgpuPostFlagOn()) postWgslLegacyRemoved("webgpuFxaaFragment");
  return `struct FxaaUniforms {
  texel: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> u_fxaa: FxaaUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

fn fxaaLuma(uv: vec2<f32>) -> f32 {
  let color = textureSample(u_source, u_sampler, uv).rgb;
  return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_fxaa(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // Compact FXAA 3.11 console core: luma neighborhood, edge direction from
  // the diagonal/axis contrast, one perpendicular blend tap pair.
  // NOTE: texel MUST be read from u_fxaa (not baked): an unreferenced
  // uniform is stripped, which invalidates bind-group entry 0.
  let texel = u_fxaa.texel;
  // All taps up front: textureSample needs uniform control flow, so no
  // sampling may happen after the flat-neighborhood early-out below —
  // including the early-out's own return value.
  let center = textureSample(u_source, u_sampler, uv).rgb;
  let lumaM = fxaaLuma(uv);
  let lumaN = fxaaLuma(uv + vec2<f32>(0.0, -texel.y));
  let lumaS = fxaaLuma(uv + vec2<f32>(0.0, texel.y));
  let lumaW = fxaaLuma(uv + vec2<f32>(-texel.x, 0.0));
  let lumaE = fxaaLuma(uv + vec2<f32>(texel.x, 0.0));
  let rangeMin = min(lumaM, min(min(lumaN, lumaS), min(lumaW, lumaE)));
  let rangeMax = max(lumaM, max(max(lumaN, lumaS), max(lumaW, lumaE)));
  let range = rangeMax - rangeMin;
  // Flat neighborhoods pass through untouched (no blur where nothing edges).
  if (range < max(0.0312, rangeMax * 0.125)) {
    return vec4<f32>(center, 1.0);
  }
  // Canonical FXAA 3.11 console edge terms (first-order axis contrast):
  // edgeHorz measures the N-S gradient, so a dominant edgeHorz means the
  // edge spans horizontally and the blend taps go vertical, and vice versa.
  // (Second-order-only terms vanish on ideal steps and pick no direction.)
  let edgeHorz = abs((-2.0 * lumaM) + lumaN + lumaS);
  let edgeVert = abs((-2.0 * lumaM) + lumaW + lumaE);
  let horzSpan = edgeHorz >= edgeVert;
  // WGSL has no ternary operator: select(falseValue, trueValue, condition).
  // textureSampleLevel (explicit LOD) is used for the blend taps because they
  // sit after the early-out branch: implicit-derivative sampling is illegal
  // in non-uniform control flow.
  let blend = select(vec2<f32>(texel.x * 0.5, 0.0), vec2<f32>(0.0, texel.y * 0.5), horzSpan);
  let tapA = textureSampleLevel(u_source, u_sampler, uv - blend, 0.0).rgb;
  let tapB = textureSampleLevel(u_source, u_sampler, uv + blend, 0.0).rgb;
  return vec4<f32>((tapA + tapB) * 0.5, 1.0);
}
`;
}

/**
 * The v2 (`postprocess.v2`) bloom request as the WebGL2 v2 chain reads it
 * (`normalizeNativeBloomOptions` with the `v2` stamp, webgl2/LegacyPost.ts):
 * an HDR excess prefilter over `threshold` with an absolute soft knee
 * (`threshold × knee`, capped at 0.5; else the authored `softKnee`), the
 * cinematic 5-mip pyramid when `quality` is unauthored, `spread`-weighted
 * mips and a composite of `scene + bloom × intensity` with no hidden gain.
 */
export interface WebGPUBloomV2Request {
  readonly threshold: number;
  readonly intensity: number;
  readonly softKnee: number;
  readonly quality: WebGPUBloomQuality;
  /** Single-scale (performance) blur radius in pixels, as WebGL2 derives it from `scatter` / `radius`. */
  readonly radius: number;
  readonly spread: number;
}

function bloomV2Number(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`WebGPU bloom ${key} must be a finite number.`);
  return value;
}

/** True when a bloom pass carries the v2 stamp (`RendererPostprocessPlan` adds it on `postprocess.v2` frames). */
export function isWebGPUBloomV2(options: unknown): boolean {
  return Boolean(options) && typeof options === "object" && (options as { readonly v2?: unknown }).v2 === true;
}

export function normalizeWebGPUBloomV2Options(options: Readonly<Record<string, unknown>>): WebGPUBloomV2Request {
  const threshold = bloomV2Number(options, "threshold", 0.75);
  const intensity = bloomV2Number(options, "intensity", 0.35);
  const knee = bloomV2Number(options, "knee", NaN);
  const scatter = bloomV2Number(options, "scatter", NaN);
  const radius = Number.isFinite(scatter) ? Math.round(scatter) : bloomV2Number(options, "radius", 1);
  if (threshold < 0 || threshold > 64) throw new RangeError("WebGPU bloom threshold must be finite and in [0, 64].");
  if (intensity < 0) throw new RangeError("WebGPU bloom intensity must be finite and non-negative.");
  if (!Number.isInteger(radius) || radius < 0 || radius > 16) throw new RangeError("WebGPU bloom radius must be an integer in [0, 16].");
  if (Number.isFinite(knee) && (knee < 0 || knee > 1)) throw new RangeError("WebGPU bloom knee must be finite and in [0, 1].");
  const softKnee = Number.isFinite(knee) ? Math.min(0.5, threshold * knee) : bloomV2Number(options, "softKnee", 0);
  const quality = options.quality === undefined ? "cinematic" : options.quality;
  if (quality !== "performance" && quality !== "balanced" && quality !== "cinematic") {
    throw new RangeError(`Unknown WebGPU bloom quality "${String(quality)}" (expected performance|balanced|cinematic).`);
  }
  const spread = bloomV2Number(options, "spread", 0.7);
  if (!(spread >= 0) || spread > 1) throw new RangeError("WebGPU bloom spread must be finite and in [0, 1].");
  return { threshold, intensity, softKnee, quality, radius, spread };
}

/** v2 excess prefilter (BLOOM_BRIGHT_EXTRACT_GLSL, `u_hdr = 1`, `u_excess = 1`). Uniforms: threshold, softKnee. */
export const WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT = `@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
fn a3d_prefilter_sanitize(c: vec3<f32>) -> vec3<f32> {
  let bits = bitcast<vec3<u32>>(c);
  let finite_mask = (bits & vec3<u32>(0x7f800000u)) != vec3<u32>(0x7f800000u);
  let clean = select(vec3<f32>(0.0), c, finite_mask);
  return clamp(clean, vec3<f32>(0.0), vec3<f32>(65504.0));
}
@fragment
fn fs_bloom_prefilter(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(textureDimensions(u_source));
  let source = textureSampleLevel(u_source, u_sampler, position.xy / size, 0.0);
  let rgb = a3d_prefilter_sanitize(source.rgb);
  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let knee = max(params.y, 1e-4);
  let soft_raw = clamp(luma - params.x + knee, 0.0, 2.0 * knee);
  let soft = select(0.0, soft_raw * soft_raw / (4.0 * knee), params.y > 0.0);
  let excessWeight = max(soft, max(luma - params.x, 0.0)) / max(luma, 1e-5);
  return vec4<f32>(rgb * excessWeight, source.a);
}
`;

/** Four-tap box downsample (webgl2-bloom-downsample). Uniforms: source texel size (xy). */
export const WEBGPU_BLOOM_V2_DOWNSAMPLE_FRAGMENT = `@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
fn a3dFinite(c: vec4<f32>) -> vec4<f32> {
  let bad = (c != c) | (abs(c) > vec4<f32>(3.0e38));
  return select(c, vec4<f32>(0.0), any(bad));
}
@fragment
fn fs_bloom_downsample(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy / params.zw;
  let e = params.xy * 0.5;
  let sum = a3dFinite(textureSampleLevel(u_source, u_sampler, uv - e, 0.0)) + a3dFinite(textureSampleLevel(u_source, u_sampler, uv + vec2<f32>(e.x, -e.y), 0.0))
    + a3dFinite(textureSampleLevel(u_source, u_sampler, uv + vec2<f32>(-e.x, e.y), 0.0)) + a3dFinite(textureSampleLevel(u_source, u_sampler, uv + e, 0.0));
  return sum * 0.25;
}
`;

/**
 * Separable Gaussian with an integer radius (webgl2-bloom-blur): sigma = max(r / 3, 0.5), edge-clamped taps,
 * normalised weights. Uniforms: direction (xy), radius (z). Taps sample texel centres, so the linear sampler
 * returns the texel exactly, as the WebGL2 texelFetch does.
 */
export const WEBGPU_BLOOM_V2_BLUR_FRAGMENT = `@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@fragment
fn fs_bloom_blur(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(textureDimensions(u_source));
  let pixel = floor(position.xy);
  let radius = i32(params.z + 0.5);
  let sigma = max(params.z / 3.0, 0.5);
  let coefficient = 0.39894 / sigma;
  var sum = textureSampleLevel(u_source, u_sampler, (pixel + 0.5) / size, 0.0) * coefficient;
  var weightSum = coefficient;
  for (var offset = 1; offset <= 24; offset = offset + 1) {
    if (offset > radius) { break; }
    let distance = f32(offset);
    let weight = coefficient * exp(-0.5 * distance * distance / (sigma * sigma));
    let delta = params.xy * distance;
    let a = clamp(pixel + delta, vec2<f32>(0.0), size - 1.0);
    let b = clamp(pixel - delta, vec2<f32>(0.0), size - 1.0);
    sum = sum + (textureSampleLevel(u_source, u_sampler, (a + 0.5) / size, 0.0) + textureSampleLevel(u_source, u_sampler, (b + 0.5) / size, 0.0)) * weight;
    weightSum = weightSum + 2.0 * weight;
  }
  return sum / max(weightSum, 0.000001);
}
`;

/**
 * Weighted mip sum at level-0 size (webgl2-bloom-accumulate, smallest to largest, each mip bilinearly sampled at
 * the level-0 pixel centre). Uniforms: weights 0-3 (vec4) and weight 4 (x of the second vec4); unused mips bind
 * mip 0 with weight 0.
 */
export const WEBGPU_BLOOM_V2_ACCUMULATE_FRAGMENT = `struct BloomAccumulate { w: vec4<f32>, w4: vec4<f32> };
@group(0) @binding(0) var<uniform> params: BloomAccumulate;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_mip0: texture_2d<f32>;
@group(0) @binding(3) var u_mip1: texture_2d<f32>;
@group(0) @binding(4) var u_mip2: texture_2d<f32>;
@group(0) @binding(5) var u_mip3: texture_2d<f32>;
@group(0) @binding(6) var u_mip4: texture_2d<f32>;
@fragment
fn fs_bloom_accumulate(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy / vec2<f32>(textureDimensions(u_mip0));
  var bloom = textureSampleLevel(u_mip4, u_sampler, uv, 0.0).rgb * params.w4.x;
  bloom = bloom + textureSampleLevel(u_mip3, u_sampler, uv, 0.0).rgb * params.w.w;
  bloom = bloom + textureSampleLevel(u_mip2, u_sampler, uv, 0.0).rgb * params.w.z;
  bloom = bloom + textureSampleLevel(u_mip1, u_sampler, uv, 0.0).rgb * params.w.y;
  bloom = bloom + textureSampleLevel(u_mip0, u_sampler, uv, 0.0).rgb * params.w.x;
  return vec4<f32>(bloom, 0.0);
}
`;

/** HDR composite `scene + bloom × intensity` (webgl2-bloom-composite, `u_hdr = 1`); the bloom is upsampled bilinearly. */
export const WEBGPU_BLOOM_V2_COMPOSITE_FRAGMENT = `@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_scene: texture_2d<f32>;
@group(0) @binding(3) var u_bloom: texture_2d<f32>;
@fragment
fn fs_bloom_composite(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy / vec2<f32>(textureDimensions(u_scene));
  let scene = textureSampleLevel(u_scene, u_sampler, uv, 0.0);
  let bloom = textureSampleLevel(u_bloom, u_sampler, uv, 0.0).rgb;
  return vec4<f32>(scene.rgb + bloom * params.x, scene.a);
}
`;

/**
 * The v2 S10 linear grade (`HDR_GRADE_GLSL`, post/shaders/hdrGrade.glsl.ts) without the S8 multiply: white balance,
 * ASC-CDL lift/gamma/gain, then the shadows/midtones/highlights weights over log2 luma. Uniforms: seven vec4 rows
 * (whiteBalance, lift, gamma, gain, shadows, midtones, highlights; w unused).
 */
export const WEBGPU_HDR_GRADE_FRAGMENT = `struct HdrGrade { whiteBalance: vec4<f32>, lift: vec4<f32>, gamma: vec4<f32>, gain: vec4<f32>,
  shadows: vec4<f32>, midtones: vec4<f32>, highlights: vec4<f32> };
@group(0) @binding(0) var<uniform> grade: HdrGrade;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_hdr: texture_2d<f32>;
@fragment
fn fs_hdr_grade(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let src = textureSampleLevel(u_hdr, u_sampler, position.xy / vec2<f32>(textureDimensions(u_hdr)), 0.0);
  var c = src.rgb * grade.whiteBalance.rgb;
  let safeGamma = max(grade.gamma.rgb, vec3<f32>(1e-3));
  c = pow(max(c * grade.gain.rgb + grade.lift.rgb, vec3<f32>(0.0)), vec3<f32>(1.0) / safeGamma);
  let s = clamp(log2(max(dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
  c = c * (grade.shadows.rgb * (1.0 - s) * (1.0 - s) + grade.midtones.rgb * 2.0 * s * (1.0 - s) + grade.highlights.rgb * s * s);
  return vec4<f32>(c, src.a);
}
`;

export interface WebGPUOutlineOptions {
  readonly threshold?: number;
  readonly width?: number;
  readonly radius?: number;
  readonly opacity?: number;
  readonly color?: readonly number[];
  readonly depthThreshold?: number;
  readonly normalThreshold?: number;
}

export interface NormalizedWebGPUOutline {
  readonly threshold: number;
  readonly radius: number;
  readonly opacity: number;
  readonly color: readonly [number, number, number];
  readonly depthThreshold: number;
  readonly normalThreshold: number;
}

export function normalizeWebGPUOutlineOptions(
  options: WebGPUOutlineOptions | Readonly<Record<string, unknown>> = {}
): NormalizedWebGPUOutline {
  const rawThreshold = options.threshold === undefined ? 0.18 : Number(options.threshold);
  if (!Number.isFinite(rawThreshold) || rawThreshold < 0 || rawThreshold > 4) {
    throw new RangeError("WebGPU outline threshold must be a finite number in [0, 4].");
  }
  const rawRadius = options.width !== undefined ? Number(options.width) : options.radius !== undefined ? Number(options.radius) : 1;
  if (!Number.isFinite(rawRadius) || rawRadius < 0) {
    throw new RangeError("WebGPU outline width/radius must be a finite number >= 0.");
  }
  const radius = Math.min(6, Math.max(0, rawRadius));
  const rawOpacity = options.opacity === undefined ? 0.85 : Number(options.opacity);
  if (!Number.isFinite(rawOpacity) || rawOpacity < 0 || rawOpacity > 1) {
    throw new RangeError("WebGPU outline opacity must be a finite number in [0, 1].");
  }
  const rawDepthThreshold = options.depthThreshold === undefined ? 0.08 : Number(options.depthThreshold);
  const depthThreshold = Number.isFinite(rawDepthThreshold) && rawDepthThreshold > 0 ? rawDepthThreshold : 0.08;
  const rawNormalThreshold = options.normalThreshold === undefined ? 0.35 : Number(options.normalThreshold);
  const normalThreshold = Number.isFinite(rawNormalThreshold) && rawNormalThreshold > 0 ? rawNormalThreshold : 0.35;

  let color: [number, number, number] = [1.0, 188 / 255, 64 / 255];
  let alphaScale = 1;
  if (Array.isArray(options.color)) {
    if ((options.color.length !== 3 && options.color.length !== 4)
      || options.color.some((channel) => typeof channel !== "number" || !Number.isFinite(channel) || channel < 0 || channel > 255)) {
      throw new RangeError("WebGPU outline color must be a 3- or 4-channel finite tuple in [0, 255].");
    }
    const maxChannel = Math.max(...(options.color as readonly number[]));
    const scale = maxChannel > 1 ? 1 / 255 : 1;
    color = [
      Math.min(1, Math.max(0, Number(options.color[0]) * scale)),
      Math.min(1, Math.max(0, Number(options.color[1]) * scale)),
      Math.min(1, Math.max(0, Number(options.color[2]) * scale))
    ];
    if (options.color.length === 4) {
      alphaScale = Math.min(1, Math.max(0, Number(options.color[3]) * scale));
    }
  }
  return {
    threshold: rawThreshold,
    radius,
    opacity: rawOpacity * alphaScale,
    color,
    depthThreshold,
    normalThreshold
  };
}

export function packWebGPUOutlineUniforms(
  width: number,
  height: number,
  options: NormalizedWebGPUOutline,
  hasDepth: boolean,
  farPlane = 1000
): Float32Array {
  return new Float32Array([
    1 / Math.max(1, width),
    1 / Math.max(1, height),
    options.radius,
    options.threshold,
    options.color[0],
    options.color[1],
    options.color[2],
    options.opacity,
    hasDepth ? 1 : 0,
    options.depthThreshold,
    options.normalThreshold,
    Number.isFinite(farPlane) && farPlane > 0 ? Math.min(farPlane, 65000) : 1000
  ]);
}

/**
 * Full-frame 3x3 Sobel depth, surface-normal crease, and luma/chroma outline pass.
 * Binding 2 = display/linear color, Binding 3 = clamped linear view depth (or 1x1 dummy when `depth.x <= 0.5`).
 */
export const WEBGPU_OUTLINE_FRAGMENT = /* wgsl */ `struct OutlineUniforms {
  texel_radius_threshold: vec4<f32>,
  color_opacity: vec4<f32>,
  depth_params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_outline: OutlineUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_linear_depth: texture_2d<f32>;

fn a3d_outline_luma(uv: vec2<f32>) -> f32 {
  let c = textureSampleLevel(u_source, u_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).rgb;
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn a3d_outline_depth(uv: vec2<f32>) -> f32 {
  return textureSampleLevel(u_linear_depth, u_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).r;
}

@fragment
fn fs_outline(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let center = textureSampleLevel(u_source, u_sampler, uv, 0.0);
  let step_uv = u_outline.texel_radius_threshold.xy * max(u_outline.texel_radius_threshold.z, 0.0);
  let threshold = u_outline.texel_radius_threshold.w;

  let l00 = a3d_outline_luma(uv + vec2<f32>(-step_uv.x, -step_uv.y));
  let l10 = a3d_outline_luma(uv + vec2<f32>(0.0, -step_uv.y));
  let l20 = a3d_outline_luma(uv + vec2<f32>(step_uv.x, -step_uv.y));
  let l01 = a3d_outline_luma(uv + vec2<f32>(-step_uv.x, 0.0));
  let l21 = a3d_outline_luma(uv + vec2<f32>(step_uv.x, 0.0));
  let l02 = a3d_outline_luma(uv + vec2<f32>(-step_uv.x, step_uv.y));
  let l12 = a3d_outline_luma(uv + vec2<f32>(0.0, step_uv.y));
  let l22 = a3d_outline_luma(uv + vec2<f32>(step_uv.x, step_uv.y));

  let gx = -l00 + l20 - 2.0 * l01 + 2.0 * l21 - l02 + l22;
  let gy = -l00 - 2.0 * l10 - l20 + l02 + 2.0 * l12 + l22;
  let luma_grad = length(vec2<f32>(gx, gy)) * 0.25;
  let lo_edge = max(threshold * 0.75, 0.0);
  let hi_edge = max(threshold * 1.25, lo_edge + 1e-4);
  let color_edge = smoothstep(lo_edge, hi_edge, luma_grad);

  let zc = a3d_outline_depth(uv);
  let z00 = a3d_outline_depth(uv + vec2<f32>(-step_uv.x, -step_uv.y));
  let z10 = a3d_outline_depth(uv + vec2<f32>(0.0, -step_uv.y));
  let z20 = a3d_outline_depth(uv + vec2<f32>(step_uv.x, -step_uv.y));
  let z01 = a3d_outline_depth(uv + vec2<f32>(-step_uv.x, 0.0));
  let z21 = a3d_outline_depth(uv + vec2<f32>(step_uv.x, 0.0));
  let z02 = a3d_outline_depth(uv + vec2<f32>(-step_uv.x, step_uv.y));
  let z12 = a3d_outline_depth(uv + vec2<f32>(0.0, step_uv.y));
  let z22 = a3d_outline_depth(uv + vec2<f32>(step_uv.x, step_uv.y));

  let inv_z = 1.0 / max(min(zc, u_outline.depth_params.w), 0.1);
  let dzx = (-z00 + z20 - 2.0 * z01 + 2.0 * z21 - z02 + z22) * 0.25 * inv_z;
  let dzy = (-z00 - 2.0 * z10 - z20 + z02 + 2.0 * z12 + z22) * 0.25 * inv_z;
  let depth_grad = length(vec2<f32>(dzx, dzy));
  let d_thresh = max(u_outline.depth_params.y, 1e-4);
  let depth_edge = smoothstep(d_thresh * 0.75, d_thresh * 1.35, depth_grad);

  // Second-order depth Laplacian detects surface-normal creases while vanishing on tilted planes.
  let crease = abs(z10 + z12 + z01 + z21 - 4.0 * zc) * inv_z;
  let n_thresh = max(u_outline.depth_params.z, 1e-4);
  let normal_edge = smoothstep(n_thresh * 0.5, n_thresh, crease * 4.0);
  let geo_edge = select(0.0, max(depth_edge, normal_edge), u_outline.depth_params.x > 0.5);

  let enabled = select(0.0, 1.0, u_outline.texel_radius_threshold.z > 0.0 && u_outline.color_opacity.a > 0.0);
  let edge = clamp(max(color_edge, geo_edge) * u_outline.color_opacity.a * enabled, 0.0, 1.0);
  return vec4<f32>(mix(center.rgb, u_outline.color_opacity.rgb, edge), center.a);
}
`;

/**
 * Filterable fp16 linear view-space depth pass for custom `@binding(3)` depth consumers
 * and full-frame Sobel outlines. Clamps sky depth to 65000.0 so `rgba16float` never overflows to +Inf.
 */
export function webgpuFilterableLinearDepthFragment(multisampled: boolean): string {
  const depthType = multisampled ? "texture_depth_multisampled_2d" : "texture_2d<f32>";
  const rawLoad = multisampled ? "textureLoad(u_depth, coord, 0)" : "textureLoad(u_depth, coord, 0).r";
  return `struct AoLinearDepthParams {
  near_value: f32,
  far_value: f32,
  perspective: f32,
  reversed: f32,
  _pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_params: AoLinearDepthParams;
@group(0) @binding(2) var u_depth: ${depthType};

@fragment
fn fs_chain_linear_depth(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(textureDimensions(u_depth));
  let coord = clamp(vec2<i32>(position.xy), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  let d = ${rawLoad};
  let rev = u_params.reversed > 0.5;
  if ((rev && d <= 0.000001) || (!rev && d >= 0.999999)) {
    return vec4<f32>(65000.0, 65000.0, 0.0, 1.0);
  }
  let near_weight = select(1.0 - d, d, rev);
  let mixed = near_weight * u_params.near_value + (1.0 - near_weight) * u_params.far_value;
  var view_z = mixed;
  if (u_params.perspective > 0.5) {
    view_z = select(65000.0, 1.0 / mixed, mixed > 1e-6);
  }
  let clamped_z = clamp(view_z, 0.0, 65000.0);
  return vec4<f32>(clamped_z, clamped_z, 0.0, 1.0);
}
`;
}

/**
 * Native WebGPU SMAA 1x three-pass shaders adapted to `runWebGPUFullscreenPass`
 * (`@binding(0)` uniform, `@binding(1)` linear sampler, `@binding(2..4)` textures).
 * Matches `post/shaders/smaa.wgsl.ts` and `post/smaa/textures.ts` (`81x1` area, `256x1` search).
 */
export const WEBGPU_SMAA_EDGES_FRAGMENT = /* wgsl */ `struct SmaaParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaParams;
@group(0) @binding(1) var u_color_smp: sampler;
@group(0) @binding(2) var u_color_tex: texture_2d<f32>;

fn a3d_smaa_diff(a: vec4<f32>, b: vec4<f32>) -> f32 {
  let d = abs(a - b);
  return max(max(d.r, d.g), max(d.b, d.a));
}

@fragment
fn fs_smaa_edges(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let center = textureSampleLevel(u_color_tex, u_color_smp, uv, 0.0);
  let dx = vec2<f32>(u_params.resolution.x, 0.0);
  let dy = vec2<f32>(0.0, u_params.resolution.y);
  let left = a3d_smaa_diff(center, textureSampleLevel(u_color_tex, u_color_smp, uv - dx, 0.0));
  let right = a3d_smaa_diff(center, textureSampleLevel(u_color_tex, u_color_smp, uv + dx, 0.0));
  let down = a3d_smaa_diff(center, textureSampleLevel(u_color_tex, u_color_smp, uv - dy, 0.0));
  let up = a3d_smaa_diff(center, textureSampleLevel(u_color_tex, u_color_smp, uv + dy, 0.0));
  let local_max = max(max(left, right), max(down, up));
  let contrast = vec2<f32>(left, down);
  let strength = smoothstep(vec2<f32>(0.04), vec2<f32>(0.10), contrast)
    * step(vec2<f32>(local_max * 0.35), contrast);
  return vec4<f32>(strength, 0.0, 1.0);
}
`;

export const WEBGPU_SMAA_WEIGHTS_FRAGMENT = /* wgsl */ `struct SmaaParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaParams;
@group(0) @binding(1) var u_linear_smp: sampler;
@group(0) @binding(2) var u_edges_tex: texture_2d<f32>;
@group(0) @binding(3) var u_area_tex: texture_2d<f32>;
@group(0) @binding(4) var u_search_tex: texture_2d<f32>;

const A3D_SMAA_MAX_EDGE_RUN: i32 = 8;
fn a3d_smaa_edge(uv: vec2<f32>, vertical: bool) -> f32 {
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return 0.0; }
  let edge = textureSampleLevel(u_edges_tex, u_linear_smp, uv, 0.0).rg;
  return select(edge.g, edge.r, vertical);
}

fn a3d_smaa_edge_weight(uv: vec2<f32>, vertical: bool) -> f32 {
  let strength = a3d_smaa_edge(uv, vertical);
  let area_zero = textureSampleLevel(u_area_tex, u_linear_smp, vec2<f32>(0.5 / 81.0, 0.5), 0.0).r;
  let search_zero = textureSampleLevel(u_search_tex, u_linear_smp, vec2<f32>(0.5 / 256.0, 0.5), 0.0).r;
  if (strength <= 0.0) { return 0.0 * (area_zero + search_zero); }
  let tangent = select(vec2<f32>(u_params.resolution.x, 0.0),
                       vec2<f32>(0.0, u_params.resolution.y), vertical);
  var negative: i32 = 0;
  var positive: i32 = 0;
  for (var i: i32 = 1; i <= A3D_SMAA_MAX_EDGE_RUN; i = i + 1) {
    if (a3d_smaa_edge(uv - tangent * f32(i), vertical) <= 0.0) { break; }
    negative = i;
  }
  for (var i: i32 = 1; i <= A3D_SMAA_MAX_EDGE_RUN; i = i + 1) {
    if (a3d_smaa_edge(uv + tangent * f32(i), vertical) <= 0.0) { break; }
    positive = i;
  }
  if (negative == A3D_SMAA_MAX_EDGE_RUN && positive == A3D_SMAA_MAX_EDGE_RUN) { return 0.0; }
  let index = f32(negative + (A3D_SMAA_MAX_EDGE_RUN + 1) * positive);
  let area = textureSampleLevel(u_area_tex, u_linear_smp, vec2<f32>((index + 0.5) / 81.0, 0.5), 0.0).r;
  let response = textureSampleLevel(u_search_tex, u_linear_smp, vec2<f32>((strength * 255.0 + 0.5) / 256.0, 0.5), 0.0).r;
  return 0.25 * area * response;
}

@fragment
fn fs_smaa_weights(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(a3d_smaa_edge_weight(uv, true), a3d_smaa_edge_weight(uv, false), 0.0, 0.0);
}
`;

export const WEBGPU_SMAA_BLEND_FRAGMENT = /* wgsl */ `struct SmaaParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaParams;
@group(0) @binding(1) var u_linear_smp: sampler;
@group(0) @binding(2) var u_weights_tex: texture_2d<f32>;
@group(0) @binding(3) var u_color_tex: texture_2d<f32>;

fn a3d_smaa_to_linear(c: vec3<f32>) -> vec3<f32> {
  return mix(c / 12.92, pow(max((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(0.0)), vec3<f32>(2.4)),
             step(vec3<f32>(0.04045), c));
}
fn a3d_smaa_to_display(input: vec3<f32>) -> vec3<f32> {
  let c = max(input, vec3<f32>(0.0));
  return mix(12.92 * c, 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055),
             step(vec3<f32>(0.0031308), c));
}

@fragment
fn fs_smaa_blend(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let center = textureSampleLevel(u_color_tex, u_linear_smp, uv, 0.0);
  let here = textureSampleLevel(u_weights_tex, u_linear_smp, uv, 0.0).rg;
  let right = textureSampleLevel(u_weights_tex, u_linear_smp, uv + vec2<f32>(u_params.resolution.x, 0.0), 0.0).r;
  let up = textureSampleLevel(u_weights_tex, u_linear_smp, uv + vec2<f32>(0.0, u_params.resolution.y), 0.0).g;
  var weight = here.r;
  var offset = vec2<f32>(-u_params.resolution.x, 0.0);
  if (right > weight) { weight = right; offset = vec2<f32>(u_params.resolution.x, 0.0); }
  if (here.g > weight) { weight = here.g; offset = vec2<f32>(0.0, -u_params.resolution.y); }
  if (up > weight) { weight = up; offset = vec2<f32>(0.0, u_params.resolution.y); }
  if (weight <= 0.0) { return center; }
  let other = textureSampleLevel(u_color_tex, u_linear_smp, uv + offset, 0.0);
  let alpha = mix(center.a, other.a, weight);
  if (alpha <= 1e-8) { return vec4<f32>(0.0); }
  let premultiplied = mix(a3d_smaa_to_linear(center.rgb) * center.a,
                          a3d_smaa_to_linear(other.rgb) * other.a, weight);
  return vec4<f32>(a3d_smaa_to_display(premultiplied / alpha), alpha);
}
`;
