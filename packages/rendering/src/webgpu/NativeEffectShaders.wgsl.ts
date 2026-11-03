/** Native WebGPU twin of the ordered display effects. Bind caller-owned textures at 0..2. */
export const NATIVE_EFFECT_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2<f32>, kind: u32, size: f32,
  angle: f32, strength: f32, intensity: f32, seed: f32,
  frame: f32, progress: f32, decay: f32, hasHistory: u32,
  hasMask: u32, invertMask: u32, maskOpacity: f32, _pad: f32,
};
@group(0) @binding(0) var colorTex: texture_2d<f32>;
@group(0) @binding(1) var auxTex: texture_2d<f32>;
@group(0) @binding(2) var maskTex: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;
fn bounded(uv: vec2<f32>) -> vec2<f32> {
  let halfPixel = 0.5 / params.resolution;
  return clamp(uv, halfPixel, vec2<f32>(1.0) - halfPixel);
}
fn random1(x: f32) -> f32 { return fract(sin(x * 12.9898 + params.seed * 78.233) * 43758.5453); }
@fragment fn nativeEffect(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let original = textureSample(colorTex, linearSampler, uv);
  var result = original;
  if (params.kind == 1u) {
    let p = (floor(uv * params.resolution / params.size) + 0.5) * params.size;
    result = textureSample(colorTex, linearSampler, bounded(p / params.resolution));
  } else if (params.kind == 2u || params.kind == 3u) {
    let c = cos(params.angle); let s = sin(params.angle);
    let p = (uv - 0.5) * params.resolution;
    let rotated = vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y) / params.size;
    let cell = fract(rotated) - 0.5;
    let luma = dot(original.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let radius = 0.5 * sqrt(clamp(1.0 - luma, 0.0, 1.0));
    let ink = 1.0 - smoothstep(radius - 0.04, radius + 0.04, length(cell));
    var dots = original.rgb * (1.0 - ink);
    if (params.kind == 2u) { dots = vec3<f32>(1.0 - ink); }
    result = vec4<f32>(mix(original.rgb, dots, params.strength), original.a);
  } else if (params.kind == 4u) {
    let row = floor(uv.y * 32.0);
    let n = random1(row + floor(params.frame * 0.25) * 37.0);
    let shift = (n - 0.5) * 0.16 * params.intensity * step(0.7, n);
    let shifted = textureSample(colorTex, linearSampler, bounded(uv + vec2<f32>(shift, 0.0)));
    result = vec4<f32>(shifted.rgb, original.a);
  } else if (params.kind == 5u) {
    result = mix(original, textureSample(auxTex, linearSampler, uv), params.progress);
  } else if (params.kind == 6u) {
    let dirt = textureSample(auxTex, linearSampler, uv).rgb;
    let light = max(max(original.r, original.g), original.b);
    result = vec4<f32>(original.rgb + dirt * light * params.intensity, original.a);
  } else if (params.kind == 7u && params.hasHistory != 0u) {
    let old = textureSample(auxTex, linearSampler, uv);
    let oldAlpha = old.a * params.decay;
    let alpha = max(original.a, oldAlpha);
    let premul = max(original.rgb * original.a, old.rgb * oldAlpha);
    result = vec4<f32>(select(vec3<f32>(0.0), premul / max(alpha, 0.000001), alpha > 0.0), alpha);
  }
  if (params.hasMask != 0u) {
    var m = textureSample(maskTex, linearSampler, uv).r;
    if (params.invertMask != 0u) { m = 1.0 - m; }
    result = mix(original, result, clamp(m * params.maskOpacity, 0.0, 1.0));
  }
  return result;
}`;
