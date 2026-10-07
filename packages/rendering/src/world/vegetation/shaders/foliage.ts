/**
 * `a3d_prd10_foliage` — PRD-10 §8.3 foliage fragment chunk: alpha cutoff /
 * A2C-sharpened alpha, two-sided normals, sun translucency, per-instance
 * colour variation and screen-door crossfade.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform sampler2D u_baseColor;
uniform float u_alphaCutoff;          // default 0.5
uniform int u_alphaToCoverage;        // C-15 alphaToCoverage active (MSAA on)

// Alpha handling: A2C path sharpens for multisample resolve; otherwise a hard
// alpha test (Path S, where the C-15 stub ignores alphaToCoverage).
float a3dFoliageAlpha(vec2 uv) {
  float alpha = texture(u_baseColor, uv).a;
  if (u_alphaToCoverage == 0) {
    if (alpha < u_alphaCutoff) discard;
    return 1.0;
  }
  return clamp((alpha - u_alphaCutoff) / max(fwidth(alpha), 1e-4) + 0.5, 0.0, 1.0);
}

// Two-sided: flip the back-face normal.
vec3 a3dFoliageNormal(vec3 n) {
  return gl_FrontFacing ? n : -n;
}

// Sun-only translucency term added inside the shared direct-light loop:
// translucencyColor * albedo * pow(saturate(dot(V, -L)), 4) * thickness * shadow * sunColor.
vec3 a3dFoliageTranslucency(vec3 albedo, vec3 translucencyColor, float thickness, vec3 V, vec3 L, vec3 sunColor, float shadow) {
  float t = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  return translucencyColor * albedo * t * thickness * shadow * sunColor;
}

// Per-instance colour variation: albedo *= 1 + (variation - 0.5) * (0.08, 0.12, 0.04).
vec3 a3dInstanceVariation(vec3 albedo, float variation) {
  return albedo * (1.0 + (variation - 0.5) * vec3(0.08, 0.12, 0.04));
}

// 4x4 Bayer matrix for the screen-door LOD1<->impostor crossfade.
float a3dBayer4x4(vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord) & 3;
  const mat4 b = mat4(
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (b[p.x][p.y] + 0.5) / 16.0;
}

// Dithered crossfade: discard when the Bayer threshold exceeds the per-instance
// fade (written per band in the vertex stage from distance).
void a3dFoliageCrossfade(vec2 fragCoord, float fade) {
  if (a3dBayer4x4(fragCoord) > fade) discard;
}
`;

const wgsl = /* wgsl */ `
@group(0) @binding(0) var u_baseColor : texture_2d<f32>;
@group(0) @binding(1) var u_samp : sampler;
struct A3dFoliageUniforms {
  alphaCutoff : f32,
  alphaToCoverage : i32,
  pad0 : f32,
  pad1 : f32,
};
@group(0) @binding(2) var<uniform> u_foliage : A3dFoliageUniforms;

fn a3dFoliageAlpha(uv : vec2f) -> f32 {
  let alpha = textureSample(u_baseColor, u_samp, uv).a;
  if (u_foliage.alphaToCoverage == 0) {
    if (alpha < u_foliage.alphaCutoff) { discard; }
    return 1.0;
  }
  return clamp((alpha - u_foliage.alphaCutoff) / max(fwidth(alpha), 1e-4) + 0.5, 0.0, 1.0);
}

fn a3dFoliageNormal(n : vec3f, frontFacing : bool) -> vec3f {
  return select(-n, n, frontFacing);
}

fn a3dFoliageTranslucency(albedo : vec3f, translucencyColor : vec3f, thickness : f32, V : vec3f, L : vec3f, sunColor : vec3f, shadow : f32) -> vec3f {
  let t = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  return translucencyColor * albedo * t * thickness * shadow * sunColor;
}

fn a3dInstanceVariation(albedo : vec3f, variation : f32) -> vec3f {
  return albedo * (1.0 + (variation - 0.5) * vec3f(0.08, 0.12, 0.04));
}

fn a3dBayer4x4(fragCoord : vec2f) -> f32 {
  let x = i32(fragCoord.x) & 3;
  let y = i32(fragCoord.y) & 3;
  let b = array<array<f32, 4>, 4>(
    array<f32, 4>(0.0, 8.0, 2.0, 10.0),
    array<f32, 4>(12.0, 4.0, 14.0, 6.0),
    array<f32, 4>(3.0, 11.0, 1.0, 9.0),
    array<f32, 4>(15.0, 7.0, 13.0, 5.0)
  );
  return (b[y][x] + 0.5) / 16.0;
}
`;

export const a3d_prd10_foliage: ShaderChunk = {
  name: "a3d_prd10_foliage",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
