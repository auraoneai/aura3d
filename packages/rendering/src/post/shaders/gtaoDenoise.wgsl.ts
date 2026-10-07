/**
 * PRD-03 §8.4 Phase 7 — S2 GTAO denoise + joint-bilateral upsample/apply
 * WGSL twins. `GTAO_DENOISE_WGSL` runs twice (H then V). `GTAO_APPLY_WGSL`
 * is the fused joint-bilateral upsample + §6.3 multiply
 * (`hdr *= mix(1, aoMB, w)`; w = `hdr.a` under `indirectFraction`, else the
 * fallback `strength · (1 − sky) · step(luma, 4)` — the AURA_AO_INDIRECT_FRACTION
 * variant is a define-level alternate compiled by the driver).
 */

const BILATERAL = /* wgsl */ `
// 5-tap gaussian (sigma 1.0) × exponential depth term exp(-|dz|/(0.05*z)).
fn ao_weight(dz: f32, z: f32, g: f32) -> f32 {
  return g * exp(-abs(dz) / max(0.05 * z, 1e-4));
}
const GAUSS_5 = array<f32, 5>(0.06136, 0.24477, 0.38774, 0.24477, 0.06136);
`;

export const GTAO_DENOISE_WGSL = /* wgsl */ `struct GtaoDenoiseParams {
  dir: vec2<f32>,          // (texel.x, 0) then (0, texel.y)
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: GtaoDenoiseParams;
@group(0) @binding(1) var u_ao_tex: texture_2d<f32>;       // half-res R8
@group(0) @binding(2) var u_depth_half_tex: texture_2d<f32>; // half-res linear depth (.r)

${BILATERAL}

@fragment
fn fs_gtao_denoise(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(frag_coord.xy);
  let texel = vec2<f32>(textureDimensions(u_ao_tex));
  let center_ao = textureLoad(u_ao_tex, p, 0).r;
  let center_z = textureLoad(u_depth_half_tex, p, 0).r;
  var total = GAUSS_5[2];
  var sum = center_ao * GAUSS_5[2];
  for (var i = -2; i <= 2; i = i + 1) {
    if (i == 0) { continue; }
    var s = p + vec2<i32>(u_params.dir * texel * f32(i));
    s = clamp(s, vec2<i32>(0), vec2<i32>(texel) - vec2<i32>(1));
    let z = textureLoad(u_depth_half_tex, s, 0).r;
    let w = ao_weight(z - center_z, center_z, GAUSS_5[i + 2]);
    sum = sum + textureLoad(u_ao_tex, s, 0).r * w;
    total = total + w;
  }
  return vec4<f32>(sum / total, 0.0, 0.0, 1.0);
}
`;

export const GTAO_APPLY_WGSL = /* wgsl */ `struct GtaoApplyParams {
  far: f32,
  ao_fallback_strength: f32,
  ao_multi_bounce: i32,
  ao_indirect_fraction: i32,  // AURA_AO_INDIRECT_FRACTION equivalent
};

@group(0) @binding(0) var<uniform> u_params: GtaoApplyParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;        // full-res HDR (linear)
@group(0) @binding(2) var u_ao_tex: texture_2d<f32>;         // denoised half-res R8
@group(0) @binding(3) var u_depth_full_tex: texture_2d<f32>; // full-res linear depth
@group(0) @binding(4) var u_depth_half_tex: texture_2d<f32>;

${BILATERAL}

// Jimenez 2016 multi-bounce polynomial, albedoProxy ρ = 0.5.
fn ao_multi_bounce(ao: f32) -> f32 {
  let a = 2.0404 * 0.5 - 0.3324;
  let b = -4.7951 * 0.5 + 0.6417;
  let c = 2.7552 * 0.5 + 0.6903;
  return max(ao, ((ao * a + b) * ao + c) * ao);
}

// Joint-bilateral upsample: the four half-res taps around the bilinear
// coordinate, weighted by depth similarity to the full-res texel.
fn upsample_ao(uv_half: vec2<f32>, full_z: f32, half_size: vec2<f32>) -> f32 {
  let p = uv_half * half_size - vec2<f32>(0.5);
  let p0 = vec2<i32>(floor(p));
  let f = p - vec2<f32>(p0);
  var sum = 0.0;
  var total = 0.0;
  for (var y = 0; y < 2; y = y + 1) {
    for (var x = 0; x < 2; x = x + 1) {
      let s = clamp(p0 + vec2<i32>(x, y), vec2<i32>(0), vec2<i32>(half_size) - vec2<i32>(1));
      let z = textureLoad(u_depth_half_tex, s, 0).r;
      let w = ao_weight(z - full_z, full_z,
        select(f.x, 1.0 - f.x, x == 0) * select(f.y, 1.0 - f.y, y == 0));
      sum = sum + textureLoad(u_ao_tex, s, 0).r * w;
      total = total + w;
    }
  }
  return select(1.0, sum / total, total > 0.0);
}

@fragment
fn fs_gtao_apply(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(frag_coord.xy);
  var hdr = textureLoad(u_hdr_tex, p, 0);
  let full_z = textureLoad(u_depth_full_tex, p, 0).r;
  let half_size = vec2<f32>(textureDimensions(u_ao_tex));
  let uv_half = frag_coord.xy / vec2<f32>(textureDimensions(u_hdr_tex));
  let ao = upsample_ao(uv_half, full_z, half_size);
  let ao_mb = select(ao, ao_multi_bounce(ao), u_params.ao_multi_bounce != 0);

  var w: f32;
  if (u_params.ao_indirect_fraction != 0) {
    w = hdr.a;
  } else {
    let sky = step(u_params.far * 0.999, full_z);
    let luma = dot(hdr.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    w = u_params.ao_fallback_strength * (1.0 - sky) * step(luma, 4.0);
  }
  hdr = vec4<f32>(hdr.rgb * mix(1.0, ao_mb, w), hdr.a);
  return hdr;
}
`;
