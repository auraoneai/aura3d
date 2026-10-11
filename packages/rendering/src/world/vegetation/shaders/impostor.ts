/**
 * `a3d_prd10_impostor` — PRD-10 §8.4 octahedral impostor fragment chunk.
 * Hemi-octahedral 8x8 view mapping, 3-frame barycentric blend, per-frame
 * parallax offset, alpha test and (High+) `gl_FragDepth` write. Vertex-side
 * billboard math lands with the `prd10.impostor` feature wiring.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform highp sampler2D u_impostorAlbedo;  // 8x8 atlas: albedo RGB + alpha A
uniform highp sampler2D u_impostorNormalDepth; // 8x8 atlas: tile-space normal XY in RG, depth B, coverage A
uniform float u_impostorGridDim;           // 8.0
uniform float u_impostorParallax;          // parallax offset scale
uniform float u_impostorAlphaCutoff;
uniform float u_impostorWriteDepth;          // High+ only; Low skips for early-Z

// World/view direction -> hemi-octahedral UV on the 8x8 grid.
vec2 a3dOctahedralUV(vec3 dir) {
  vec2 uv = dir.xz / (abs(dir.x) + abs(dir.z) + abs(dir.y));
  if (dir.y < 0.0) {
    vec2 s = vec2(uv.x >= 0.0 ? 1.0 : -1.0, uv.y >= 0.0 ? 1.0 : -1.0);
    uv = (1.0 - abs(uv.yx)) * s;
  }
  return uv * 0.5 + 0.5; // [0,1]
}

// 3 nearest frames in grid space + barycentric weights for one view dir.
// Frame (i, j) was baked from the direction at oct-UV ((i, j) + 0.5) / grid
// (tools/impostor-bake impostorViewGrid), so the continuous frame coordinate
// is octUv * grid - 0.5. The enclosing grid quad is split on its anti-diagonal
// and the view is blended barycentrically across that triangle's 3 frames.
void a3dImpostorFrames(vec2 octUv, out vec2 frameUV[3], out vec3 weights) {
  float g = u_impostorGridDim;
  vec2 grid = clamp(octUv * g - 0.5, vec2(0.0), vec2(g - 1.0));
  vec2 cell = min(floor(grid), vec2(g - 2.0));
  vec2 f = grid - cell;
  if (f.x + f.y < 1.0) {
    frameUV[0] = cell;
    frameUV[1] = cell + vec2(1.0, 0.0);
    frameUV[2] = cell + vec2(0.0, 1.0);
    weights = vec3(1.0 - f.x - f.y, f.x, f.y);
  } else {
    frameUV[0] = cell + vec2(1.0, 1.0);
    frameUV[1] = cell + vec2(0.0, 1.0);
    frameUV[2] = cell + vec2(1.0, 0.0);
    weights = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y);
  }
}

// Atlas UV for frame f with local texel uv in [0,1].
vec2 a3dImpostorAtlasUV(vec2 frame, vec2 uv) {
  return (frame + uv) / u_impostorGridDim;
}

// Sample + blend the three frames; parallax per frame via the depth channel.
vec4 a3dImpostorShade(vec2 octUv, vec2 localUv, vec2 frameViewDirXY[3], out vec3 outNormal, out float outDepth) {
  vec2 frames[3]; vec3 w;
  a3dImpostorFrames(octUv, frames, w);
  vec4 albedo = vec4(0.0);
  vec4 nd = vec4(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 ndi = texture(u_impostorNormalDepth, a3dImpostorAtlasUV(frames[i], localUv));
    vec2 parallaxUv = localUv + (ndi.z - 0.5) * frameViewDirXY[i] * u_impostorParallax;
    albedo += w[i] * texture(u_impostorAlbedo, a3dImpostorAtlasUV(frames[i], parallaxUv));
    nd += w[i] * ndi;
  }
  if (albedo.a < u_impostorAlphaCutoff) discard;
  outNormal = vec3(nd.xy * 2.0 - 1.0, 0.0); // XY in impostor (tile) space; the caller reconstructs Z
  outDepth = nd.z;
  return albedo;
}
`;

const wgsl = /* wgsl */ `
@group(0) @binding(0) var u_impostorAlbedo : texture_2d<f32>;
@group(0) @binding(1) var u_impostorNormalDepth : texture_2d<f32>;
@group(0) @binding(2) var u_samp : sampler;
struct A3dImpostorUniforms {
  gridDim : f32,
  parallax : f32,
  alphaCutoff : f32,
  writeDepth : i32,
};
@group(0) @binding(3) var<uniform> u_impostor : A3dImpostorUniforms;

fn a3dOctahedralUV(dir : vec3f) -> vec2f {
  var uv = dir.xz / (abs(dir.x) + abs(dir.z) + abs(dir.y));
  if (dir.y < 0.0) {
    let s = vec2f(sign(uv.x), sign(uv.y));
    uv = (vec2f(1.0) - abs(uv.yx)) * s;
  }
  return uv * 0.5 + vec2f(0.5);
}

fn a3dImpostorAtlasUV(frame : vec2f, uv : vec2f) -> vec2f {
  return (frame + uv) / u_impostor.gridDim;
}
`;

export const a3d_prd10_impostor: ShaderChunk = {
  name: "a3d_prd10_impostor",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
