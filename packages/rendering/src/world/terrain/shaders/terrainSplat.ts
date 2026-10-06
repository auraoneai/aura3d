/**
 * `a3d_prd10_terrain_splat` — PRD-10 §8.1 terrain splat fragment chunk.
 * Macro normal from the height texture, splat weights, per-layer height-blend
 * and anti-tiling second-scale sampling. Provides `a3dSurface` inputs to the
 * shared PBR lighting on Path G; Path S links it directly.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

export const terrainSplatGlsl = /* glsl */ `
uniform highp sampler2D u_height;       // shared with the vertex stage
uniform highp sampler2D u_splat0;       // layers 0..3 weights in RGBA
uniform highp sampler2D u_splat1;       // layers 4..7 weights (optional)
uniform highp sampler2D u_holes;        // 1-bit hole mask
uniform highp sampler2DArray u_layerAlbedoHeight; // per layer: albedo RGB + height A
uniform highp sampler2DArray u_layerNormal;       // per layer: tangent normal RG
uniform highp sampler2DArray u_layerOrm;          // per layer: occlusion/roughness/metalness
uniform sampler2D u_macroVariation;     // macro anti-tiling noise
uniform vec4 u_layerParams[8];          // x: uvScale, y: triplanar flag, z: heightBlendContrast, w: layer count
uniform vec4 u_layerTintOrm[8];         // rgb: tint, a: roughness bias
uniform float u_terrainWorldSize;       // world size per heightmap edge (for macro normal texel)
uniform float u_terrainHeightScale;

// Macro normal: central differences on 4 texelFetch of u_height (§8.1).
vec3 a3dTerrainMacroNormal(vec2 uv) {
  ivec2 ts = textureSize(u_height, 0);
  ivec2 i = ivec2(clamp(uv, vec2(0.0), vec2(1.0)) * vec2(ts - 1));
  float texel = u_terrainWorldSize / float(ts.x);
  float hL = texelFetch(u_height, clamp(i - ivec2(1, 0), ivec2(0), ts - 1), 0).r;
  float hR = texelFetch(u_height, clamp(i + ivec2(1, 0), ivec2(0), ts - 1), 0).r;
  float hD = texelFetch(u_height, clamp(i - ivec2(0, 1), ivec2(0), ts - 1), 0).r;
  float hU = texelFetch(u_height, clamp(i + ivec2(0, 1), ivec2(0), ts - 1), 0).r;
  return normalize(vec3((hL - hR) * u_terrainHeightScale, 2.0 * texel, (hD - hU) * u_terrainHeightScale));
}

// Splat weights w[0..7] from the two splat maps (w[4..7] zero without u_splat1).
void a3dTerrainSplatWeights(vec2 uv, int layerCount, out float w[8]) {
  vec4 s0 = texture(u_splat0, uv);
  w[0] = s0.r; w[1] = s0.g; w[2] = s0.b; w[3] = s0.a;
  if (layerCount > 4) {
    vec4 s1 = texture(u_splat1, uv);
    w[4] = s1.r; w[5] = s1.g; w[6] = s1.b; w[7] = s1.a;
  } else {
    w[4] = 0.0; w[5] = 0.0; w[6] = 0.0; w[7] = 0.0;
  }
}

// Height-blend ("height lerp"): hb_i = w_i + height_i * contrast; renormalize
// above (max(hb) - 0.2). Mutates w in place.
void a3dTerrainHeightBlend(inout float w[8], vec2 worldXZ, float viewDist, int layerCount) {
  float macro = texture(u_macroVariation, worldXZ / 256.0).r;
  float t = smoothstep(20.0, 80.0, viewDist);
  float hbMax = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= layerCount) break;
    vec4 params = u_layerParams[i];
    vec2 uvA = worldXZ / max(params.x, 1e-3);
    float heightA = texture(u_layerAlbedoHeight, vec3(uvA, float(i))).a;
    w[i] += heightA * params.z + macro * t * 0.05;
    hbMax = max(hbMax, w[i]);
  }
  float m = hbMax - 0.2;
  float sum = 0.0;
  for (int i = 0; i < 8; i++) { w[i] = max(w[i] - m, 0.0); sum += w[i]; }
  if (sum > 1e-6) {
    for (int i = 0; i < 8; i++) w[i] /= sum;
  }
}

// Holes: fragments under mask 0.5 are discarded (also feeds collider holes).
bool a3dTerrainDiscardHole(vec2 uv) {
  return texture(u_holes, uv).r < 0.5;
}
`;

export const terrainSplatWgsl = /* wgsl */ `
@group(0) @binding(0) var u_height : texture_2d<f32>;
@group(0) @binding(1) var u_splat0 : texture_2d<f32>;
@group(0) @binding(2) var u_splat1 : texture_2d<f32>;
@group(0) @binding(3) var u_holes : texture_2d<f32>;
@group(0) @binding(4) var u_layerAlbedoHeight : texture_2d_array<f32>;
@group(0) @binding(5) var u_layerNormal : texture_2d_array<f32>;
@group(0) @binding(6) var u_layerOrm : texture_2d_array<f32>;
@group(0) @binding(7) var u_macroVariation : texture_2d<f32>;
@group(0) @binding(8) var u_samp : sampler;
struct A3dTerrainFragUniforms {
  layerParams : array<vec4f, 8>,
  layerTintOrm : array<vec4f, 8>,
  terrainWorldSize : f32,
  terrainHeightScale : f32,
  pad0 : f32,
  pad1 : f32,
};
@group(0) @binding(9) var<uniform> u_terrain : A3dTerrainFragUniforms;

fn a3dTerrainMacroNormal(uv : vec2f) -> vec3f {
  let ts = vec2i(textureDimensions(u_height, 0));
  let i = vec2i(clamp(uv, vec2f(0.0), vec2f(1.0)) * vec2f(ts - vec2i(1)));
  let texel = u_terrain.terrainWorldSize / f32(ts.x);
  let hL = textureLoad(u_height, clamp(i - vec2i(1, 0), vec2i(0), ts - vec2i(1)), 0).r;
  let hR = textureLoad(u_height, clamp(i + vec2i(1, 0), vec2i(0), ts - vec2i(1)), 0).r;
  let hD = textureLoad(u_height, clamp(i - vec2i(0, 1), vec2i(0), ts - vec2i(1)), 0).r;
  let hU = textureLoad(u_height, clamp(i + vec2i(0, 1), vec2i(0), ts - vec2i(1)), 0).r;
  return normalize(vec3f((hL - hR) * u_terrain.terrainHeightScale, 2.0 * texel, (hD - hU) * u_terrain.terrainHeightScale));
}

fn a3dTerrainSplatWeights(uv : vec2f, layerCount : i32) -> array<f32, 8> {
  var w : array<f32, 8>;
  let s0 = textureSample(u_splat0, u_samp, uv);
  w[0] = s0.r; w[1] = s0.g; w[2] = s0.b; w[3] = s0.a;
  if (layerCount > 4) {
    let s1 = textureSample(u_splat1, u_samp, uv);
    w[4] = s1.r; w[5] = s1.g; w[6] = s1.b; w[7] = s1.a;
  }
  return w;
}

fn a3dTerrainDiscardHole(uv : vec2f) -> bool {
  return textureSample(u_holes, u_samp, uv).r < 0.5;
}
`;

export const a3d_prd10_terrain_splat: ShaderChunk = {
  name: "a3d_prd10_terrain_splat",
  owner: "prd10",
  stage: "fragment",
  glsl: terrainSplatGlsl,
  wgsl: terrainSplatWgsl
};
