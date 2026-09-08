import type { RenderTarget } from "../RenderDevice";
import { temporalAccumulationWeight } from "../TemporalMath";
export { temporalAccumulationWeight } from "../TemporalMath";

/** GPU-only temporal contract. All targets use the native top-left UV convention. */
export interface WebGPUTemporalInputs {
  readonly velocity: RenderTarget;
  readonly history: RenderTarget;
  readonly historyOutput: RenderTarget;
  readonly historyValid: boolean;
  readonly historyFrames?: number;
  readonly blend?: number;
  readonly depthThreshold?: number;
}

export function normalizeWebGPUTemporalOptions(options: Pick<WebGPUTemporalInputs, "blend" | "depthThreshold" | "historyFrames">): readonly [number, number] {
  const blend = options.blend ?? 0.9;
  const depthThreshold = options.depthThreshold ?? 0.01;
  if (!Number.isFinite(blend) || blend < 0 || blend >= 1) throw new RangeError("TAA blend must be finite in [0, 1)");
  if (!Number.isFinite(depthThreshold) || depthThreshold <= 0 || depthThreshold > 1) throw new RangeError("TAA depthThreshold must be finite in (0, 1]");
  return [temporalAccumulationWeight(blend, options.historyFrames), depthThreshold];
}

export const WEBGPU_TAA_FRAGMENT = `
struct TemporalUniforms { texel: vec2<f32>, blend: f32, valid: f32, depthThreshold: f32, _pad0: f32, _pad1: f32, _pad2: f32 };
@group(0) @binding(0) var<uniform> temporal: TemporalUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@group(0) @binding(3) var velocity: texture_2d<f32>;
@group(0) @binding(4) var history: texture_2d<f32>;
@fragment fn fs_taa(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let current = textureSampleLevel(source, linearSampler, uv, 0.0);
  let dimensions = vec2<i32>(textureDimensions(velocity));
  let coord = clamp(vec2<i32>(uv * vec2<f32>(dimensions)), vec2<i32>(0), dimensions - vec2<i32>(1));
  let motion = textureLoad(velocity, coord, 0);
  let previousUV = uv - motion.rg;
  let previous = textureSampleLevel(history, linearSampler, previousUV, 0.0);
  var lo = current.rgb;
  var hi = current.rgb;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let neighbor = textureSampleLevel(source, linearSampler, uv + vec2<f32>(f32(x), f32(y)) * temporal.texel, 0.0).rgb;
      lo = min(lo, neighbor); hi = max(hi, neighbor);
    }
  }
  let inBounds = all(previousUV >= vec2<f32>(0.0)) && all(previousUV <= vec2<f32>(1.0));
  // Filtered history alpha mixes categorical foreground/background depths.
  // Validate the actual contributing surfaces instead of a nonexistent
  // interpolated surface; filtered RGB remains neighborhood-clipped below.
  let previousBase = vec2<i32>(floor(previousUV * vec2<f32>(dimensions) - vec2<f32>(0.5)));
  var depthError = 1.0;
  for (var y = 0; y < 2; y = y + 1) {
    for (var x = 0; x < 2; x = x + 1) {
      let tap = clamp(previousBase + vec2<i32>(x, y), vec2<i32>(0), dimensions - vec2<i32>(1));
      depthError = min(depthError, abs(textureLoad(history, tap, 0).a - motion.a));
    }
  }
  let depthMatches = depthError <= temporal.depthThreshold;
  let accept = temporal.valid > 0.5 && inBounds && depthMatches;
  let weight = select(0.0, temporal.blend * 0.90, accept);
  return vec4<f32>(mix(current.rgb, clamp(previous.rgb, lo, hi), weight), motion.b);
}`;

/** Separate output restores scene alpha: history alpha contains depth. */
export const WEBGPU_TAA_OUTPUT_FRAGMENT = `
struct OutputUniforms { texel: vec2<f32>, _pad: vec2<f32> };
@group(0) @binding(0) var<uniform> output: OutputUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var resolved: texture_2d<f32>;
@group(0) @binding(3) var source: texture_2d<f32>;
@fragment fn fs_taa_output(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = clamp(uv, output.texel * 0.5, vec2<f32>(1.0) - output.texel * 0.5);
  let current = textureSample(source, linearSampler, p);
  let accumulated = textureSample(resolved, linearSampler, p);
  return vec4<f32>(accumulated.rgb, current.a);
}`;
