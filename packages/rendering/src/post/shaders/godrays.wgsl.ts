/**
 * PRD-03 §8.5 Phase 7 — S4 god rays WGSL twin (half-res RGBA16F radial
 * light-shaft march). Same occlusion/march/off-screen-fade math as the
 * GLSL twin; the GL twin's `#define AURA_GODRAY_SAMPLES` becomes the
 * pipeline-overridable `override AURA_GODRAY_SAMPLES` (default 32).
 */

export const GODRAYS_WGSL = /* wgsl */ `// AURA_GODRAY_SAMPLES — pipeline-overridable tier constant (default 32).
override AURA_GODRAY_SAMPLES: i32 = 32;

struct GodraysParams {
  far: f32,
  light_uv: vec2<f32>,
  light_clip_w: f32,
  color: vec3<f32>,
  intensity: f32,
  decay: f32,
  weight: f32,
  disk_outer: f32,         // r1: disk feather outer radius (uv)
  disk_inner: f32,         // r0: disk core radius (uv)
};

@group(0) @binding(0) var<uniform> u_params: GodraysParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;        // half-res HDR input
@group(0) @binding(2) var u_hdr_smp: sampler;
@group(0) @binding(3) var u_depth_half_tex: texture_2d<f32>; // half-res linear depth (.r)
@group(0) @binding(4) var u_depth_half_smp: sampler;

@fragment
fn fs_godrays(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag_coord.xy / vec2<f32>(textureDimensions(u_hdr_tex));
  let dir = u_params.light_uv - uv;
  let dist = length(dir);
  let step_uv = select(vec2<f32>(0.0), dir / f32(AURA_GODRAY_SAMPLES), dist > 0.0);

  // Off-screen / behind-camera fade: step(0, w) zeroes lights behind the eye,
  // the linear ramp fades across 25% uv past the frame edge.
  let off_screen = clamp(1.0 - (max(abs(u_params.light_uv.x - 0.5), abs(u_params.light_uv.y - 0.5)) - 0.5) * 4.0, 0.0, 1.0)
    * step(0.0, u_params.light_clip_w);

  var march_weight = u_params.weight;
  var accum = vec3<f32>(0.0);
  var sample_uv = uv;
  for (var i = 0; i < AURA_GODRAY_SAMPLES; i = i + 1) {
    sample_uv = sample_uv + step_uv;
    let hdr = textureSampleLevel(u_hdr_tex, u_hdr_smp, sample_uv, 0.0);
    let lin_z = textureSampleLevel(u_depth_half_tex, u_depth_half_smp, sample_uv, 0.0).r;
    let sky = lin_z >= u_params.far * 0.999;
    let luma = dot(hdr.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    // Emitters: sky pixels (the "gap" through occluders) or HDR highlights.
    var src = select(vec3<f32>(0.0), hdr.rgb, sky || luma > 4.0);
    // The light disk itself is an emitter regardless of coverage.
    src = src + vec3<f32>(smoothstep(u_params.disk_outer, u_params.disk_inner, length(sample_uv - u_params.light_uv)));
    accum = accum + march_weight * src;
    march_weight = march_weight * u_params.decay;
  }

  return vec4<f32>(accum * u_params.color * u_params.intensity * off_screen, 1.0);
}
`;
