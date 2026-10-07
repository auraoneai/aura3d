/**
 * `a3d_prd10_terrain_cdlod` — PRD-10 §8.1 terrain CDLOD vertex chunk.
 * Patch-instanced heightfield: manual bilinear height fetch (matches the CPU
 * `heightAt` within 1e-4 m) + geometric morph toward the parent grid.
 * Path S links this body; Path G consumes it through the `prd10.terrain` feature.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform highp sampler2D u_height;       // R32F, texelFetch only (no float filtering required)
uniform vec4 u_terrain;                 // originX, originZ, sizeX, sizeZ
uniform float u_heightScale;
uniform vec2 u_heightTexSize;
uniform vec2 u_morph[8];                // per LOD: morphStart, morphEnd (distance)
uniform float u_gridDim;                // patch quads per side (32 or 64)

out vec3 v_worldPosition;
out vec2 v_terrainUv;

// Must match AuraTerrainHandle.heightAt bit-for-bit within 1e-4 m: border
// texels clamp so the CPU and GPU kernels agree at the last texel.
float a3dTerrainHeightBilinear(vec2 uv) {
  vec2 p = uv * (u_heightTexSize - 1.0);
  ivec2 i = ivec2(floor(p));
  ivec2 hi = ivec2(u_heightTexSize) - ivec2(1);
  vec2 f = fract(p);
  float h00 = texelFetch(u_height, clamp(i,                 ivec2(0), hi), 0).r;
  float h10 = texelFetch(u_height, clamp(i + ivec2(1, 0),   ivec2(0), hi), 0).r;
  float h01 = texelFetch(u_height, clamp(i + ivec2(0, 1),   ivec2(0), hi), 0).r;
  float h11 = texelFetch(u_height, clamp(i + ivec2(1, 1),   ivec2(0), hi), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_heightScale;
}

// Full patch displacement for one vertex. a_grid: patch-local [0,1];
// a_node: per-instance {offsetX, offsetZ, nodeSize, lod}.
vec3 a3dTerrainCdlod(vec2 a_grid, vec4 a_node, out vec2 outTerrainUv) {
  vec2 world = a_node.xy + a_grid * a_node.z;
  float h = a3dTerrainHeightBilinear((world - u_terrain.xy) / u_terrain.zw);
  float d = distance(u_cameraPosition, vec3(world.x, h, world.y));
  int lod = int(a_node.w);
  float morph = clamp((d - u_morph[lod].x) / (u_morph[lod].y - u_morph[lod].x), 0.0, 1.0);
  vec2 fracPart = fract(a_grid * u_gridDim * 0.5) * 2.0 / u_gridDim; // odd vertices
  world -= fracPart * a_node.z * morph;                              // snap toward parent grid
  vec2 uv = (world - u_terrain.xy) / u_terrain.zw;
  h = a3dTerrainHeightBilinear(uv);
  outTerrainUv = uv;
  return vec3(world.x, h, world.y);
}
`;

const wgsl = /* wgsl */ `
struct A3dTerrainUniforms {
  terrain : vec4f,            // originX, originZ, sizeX, sizeZ
  heightScale : f32,
  heightTexSize : vec2f,
  gridDim : f32,
  pad : f32,
  morph : array<vec2f, 8>,    // per LOD: morphStart, morphEnd
};
@group(0) @binding(0) var<uniform> u_terrain : A3dTerrainUniforms;
@group(0) @binding(1) var u_height : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_camera : vec3f;

fn a3dTerrainHeightBilinear(uv : vec2f) -> f32 {
  let p = uv * (u_terrain.heightTexSize - vec2f(1.0));
  let i = vec2i(floor(p));
  let hi = vec2i(u_terrain.heightTexSize) - vec2i(1);
  let f = fract(p);
  let h00 = textureLoad(u_height, clamp(i,                    vec2i(0), hi), 0).r;
  let h10 = textureLoad(u_height, clamp(i + vec2i(1, 0),      vec2i(0), hi), 0).r;
  let h01 = textureLoad(u_height, clamp(i + vec2i(0, 1),      vec2i(0), hi), 0).r;
  let h11 = textureLoad(u_height, clamp(i + vec2i(1, 1),      vec2i(0), hi), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_terrain.heightScale;
}

fn a3dTerrainCdlod(aGrid : vec2f, aNode : vec4f) -> vec3f {
  var world = aNode.xy + aGrid * aNode.z;
  var h = a3dTerrainHeightBilinear((world - u_terrain.terrain.xy) / u_terrain.terrain.zw);
  let d = distance(u_camera, vec3f(world.x, h, world.y));
  let lod = i32(aNode.w);
  let morph = clamp((d - u_terrain.morph[lod].x) / (u_terrain.morph[lod].y - u_terrain.morph[lod].x), 0.0, 1.0);
  let fracPart = fract(aGrid * u_terrain.gridDim * 0.5) * 2.0 / u_terrain.gridDim;
  world = world - fracPart * aNode.z * morph;
  let uv = (world - u_terrain.terrain.xy) / u_terrain.terrain.zw;
  h = a3dTerrainHeightBilinear(uv);
  return vec3f(world.x, h, world.y);
}
`;

export const a3d_prd10_terrain_cdlod: ShaderChunk = {
  name: "a3d_prd10_terrain_cdlod",
  owner: "prd10",
  stage: "vertex",
  glsl,
  wgsl
};
