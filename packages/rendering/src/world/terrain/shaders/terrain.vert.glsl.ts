/**
 * PRD-10 T2.4 — the standalone Path S terrain program sources, composed from
 * the `a3d_prd10_terrain_cdlod` / `a3d_prd10_terrain_splat` chunk bodies so the
 * vertex displacement is bit-identical to the harnessed chunk.
 */
import { terrainCdlodGlsl, terrainCdlodWgsl } from "./terrainCdlod.js";
import { terrainSplatGlsl, terrainSplatWgsl } from "./terrainSplat.js";

export const TERRAIN_VERT_GLSL = /* glsl */ `#version 300 es
// prd10.terrain — RenderDevice shader marker (both stages; the device rejects a program without it)
precision highp float;
in vec2 a_grid;
in vec4 a_node;
uniform vec3 u_cameraPosition;
uniform mat4 u_viewProjection;
${terrainCdlodGlsl}
void main() {
  vec2 uv;
  vec3 pos = a3dTerrainCdlod(a_grid, a_node, uv);
  v_worldPosition = pos;
  v_terrainUv = uv;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
}
`;

const terrainFragBody = /* glsl */ `// prd10.terrain — RenderDevice shader marker
precision highp float;
in vec3 v_worldPosition;
in vec2 v_terrainUv;
out vec4 o_color;
// float, not int: the device uploads JS numbers with uniform1f, which is
// INVALID_OPERATION on an int uniform (the count stayed 0 → black terrain).
uniform float u_layerCount;
uniform vec3 u_cameraPosition;
uniform vec3 u_ambient;
uniform vec3 u_keyLightDir;      // direction light travels (e.g. sun → scene)
uniform vec3 u_keyLightColor;
${terrainSplatGlsl}
void main() {
  if (a3dTerrainDiscardHole(v_terrainUv)) discard;
  int layerCount = int(u_layerCount + 0.5);
  vec3 n = a3dTerrainMacroNormal(v_terrainUv);
  float w[8];
  a3dTerrainSplatWeights(v_terrainUv, layerCount, w);
  float viewDist = distance(u_cameraPosition, v_worldPosition);
  a3dTerrainHeightBlend(w, v_worldPosition.xz, viewDist, layerCount);
  float macro = texture(u_macroVariation, v_worldPosition.xz / 256.0).r;
  vec3 albedo = vec3(0.0);
  float roughness = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= layerCount) break;
    vec4 params = u_layerParams[i];
    vec3 tint = u_layerTintOrm[i].rgb;
#ifdef A3D_TERRAIN_SOLID
    albedo += tint * (0.85 + 0.3 * macro) * w[i];
    roughness += 0.85 * w[i];
#else
    vec2 uvA = v_worldPosition.xz / max(params.x, 1e-3);
    vec2 uvB = mat2(0.80902, 0.58779, -0.58779, 0.80902) * uvA; // rot(0.62) second-scale anti-tiling
    vec4 ah = mix(texture(u_layerAlbedoHeight, vec3(uvA, float(i))),
                  texture(u_layerAlbedoHeight, vec3(uvB, float(i))),
                  clamp(macro * 2.0, 0.0, 1.0));
    albedo += ah.rgb * tint * w[i];
    roughness += texture(u_layerOrm, vec3(uvA, float(i))).g * w[i];
#endif
    roughness += u_layerTintOrm[i].a * w[i];
  }
  float ndl = max(dot(n, -u_keyLightDir), 0.0);
  vec3 col = albedo * (u_ambient + u_keyLightColor * ndl);
  o_color = vec4(col, 1.0);
}
`;

/** Textured terrain program (layer albedo/height + ORM texture arrays bound). */
export const TERRAIN_FRAG_GLSL = `#version 300 es\n${terrainFragBody}`;

/** Tint-only terrain program for Path S: declares no sampler2DArray (see the splat chunk). */
export const TERRAIN_FRAG_SOLID_GLSL = `#version 300 es\n#define A3D_TERRAIN_SOLID 1\n${terrainFragBody}`;

/** WGSL Path-G mirror (composed from the chunk bodies like the GLSL path). */
export const TERRAIN_WGSL = /* wgsl */ `
${terrainCdlodWgsl}
${terrainSplatWgsl}
@vertex
fn terrainVs(@location(0) a_grid : vec2f, @location(1) a_node : vec4f) -> TerrainVsOut {
  var out_ : TerrainVsOut;
  let pos = a3dTerrainCdlod(a_grid, a_node);
  out_.position = vec4f(pos, 1.0); // u_viewProjection multiply lands with the Path G UBO group
  out_.terrainUv = vec2f(0.0);
  out_.worldPosition = pos;
  return out_;
}
struct TerrainVsOut {
  @builtin(position) position : vec4f,
  @location(0) terrainUv : vec2f,
  @location(1) worldPosition : vec3f,
};
@fragment
fn terrainFs(in_ : TerrainVsOut) -> @location(0) vec4f {
  if (a3dTerrainDiscardHole(in_.terrainUv)) { discard; }
  let n = a3dTerrainMacroNormal(in_.terrainUv);
  let w = a3dTerrainSplatWeights(in_.terrainUv, 8);
  var albedo = vec3f(w[0], w[1], w[2]); // placeholder until Path G material lands
  _ = n;
  return vec4f(albedo, 1.0);
}
`;
