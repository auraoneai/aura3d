/**
 * muse3jsparity-PRD J2 — native WebGPU post-process WGSL sources.
 *
 * Fullscreen-triangle passes that run on the real WebGPU device
 * (WebGPUDevice.executeWebGPUBloom / executeWebGPUColorGrade /
 * executeWebGPUFxaa). Backend-agnostic image work: bright-extract with a
 * soft-knee threshold, a separable-Gaussian mip pyramid, energy-weighted
 * composite, exposure/contrast/saturation color grade, and an FXAA
 * luma-edge pass. TAA is deliberately NOT here: it needs velocity +
 * history inputs that do not exist on the WebGPU path (same withheld
 * doctrine as the root A3 motion-blur/TAA nodes).
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

@fragment
fn fs_bright(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(u_source, u_sampler, uv);
  let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  // Soft-knee gate: smoothstep over [threshold - knee, threshold + knee].
  // knee = 0 collapses to a hard step (matches the native WebGL2 path).
  // NOTE: threshold/knee MUST be read from u_bloom (not baked): an
  // unreferenced uniform is stripped, which invalidates bind-group entry 0.
  let lo = u_bloom.threshold - u_bloom.knee;
  let hi = u_bloom.threshold + u_bloom.knee;
  let weight = smoothstep(lo, hi, luma);
  return vec4<f32>(color.rgb * weight, 1.0);
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
  const exposure = options.exposure ?? 0;
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
  if (knee <= 0) return luma >= threshold ? 1 : 0;
  const lo = threshold - knee;
  const hi = threshold + knee;
  if (luma <= lo) return 0;
  if (luma >= hi) return 1;
  const t = (luma - lo) / (hi - lo);
  return t * t * (3 - 2 * t);
}

export function webgpuColorGradeFragment(): string {
  return `struct GradeUniforms {
  exposure: f32,
  contrast: f32,
  saturation: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_grade: GradeUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment
fn fs_grade(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(u_source, u_sampler, uv).rgb;
  // Exposure first (stops simulate the root colorGrade node), then
  // saturation around luma, then contrast around middle gray.
  // NOTE: all three MUST be read from u_grade (not baked): an unreferenced
  // uniform is stripped, which invalidates bind-group entry 0.
  color = color * exp2(u_grade.exposure);
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  color = mix(vec3<f32>(luma), color, u_grade.saturation);
  color = (color - vec3<f32>(0.5)) * u_grade.contrast + vec3<f32>(0.5);
  return vec4<f32>(color, 1.0);
}
`;
}

export function webgpuFxaaFragment(): string {
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
