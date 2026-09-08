// @aura3d-shader:production-wgsl-postprocess
// Native TAA mirror; runtime owner: webgpu/WebGPUTemporal.ts

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
      let tap = clamp(coord + vec2<i32>(x, y), vec2<i32>(0), dimensions - vec2<i32>(1));
      let tapMotion = textureLoad(velocity, tap, 0);
      if (motion.b < 0.999 || abs(tapMotion.b - motion.b) <= temporal.depthThreshold) {
        let neighbor = textureLoad(source, tap, 0).rgb;
        lo = min(lo, neighbor); hi = max(hi, neighbor);
      }
    }
  }
  let inBounds = all(previousUV >= vec2<f32>(0.0)) && all(previousUV <= vec2<f32>(1.0));
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
  let weight = select(0.0, temporal.blend, accept);
  return vec4<f32>(mix(current.rgb, clamp(previous.rgb, lo, hi), weight), motion.b);
}
