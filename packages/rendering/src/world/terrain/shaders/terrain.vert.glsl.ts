/**
 * PRD-10 T2.4 — the standalone Path S terrain program sources, composed from
 * the `a3d_prd10_terrain_cdlod` / `a3d_prd10_terrain_splat` chunk bodies so the
 * vertex displacement is bit-identical to the harnessed chunk.
 */
import {
  terrainCdlodGlsl,
  terrainCdlodWgslBindings,
  terrainCdlodWgslFunctions,
  terrainCdlodWgslUniformStruct
} from "./terrainCdlod.js";
import {
  terrainSplatGlsl,
  terrainSplatWgslBindings,
  terrainSplatWgslFunctions,
  terrainSplatWgslUniformStruct
} from "./terrainSplat.js";

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

/**
 * T2.4 — WGSL twin of the Path S terrain program (TERRAIN_VERT_GLSL +
 * TERRAIN_FRAG_GLSL), composed from the same chunk function bodies.
 *
 * Bind layout (one module, no collisions):
 *   @group(0): 0 `u_terrain` (CDLOD), 1 `u_height`, 2 `u_camera`, 3 `u_view`
 *   @group(1): 0..6 splat/hole/layer/macro textures, 7 `u_samp`, 8 `u_terrainFrag`
 * The fragment entry takes every derivative first, in uniform control flow,
 * and defers `discard` to the end, so the layer loop uses explicit-gradient
 * fetches (`textureSampleGrad`) exactly like the GLSL implicit-derivative path.
 * Validated by naga in `qr-prd10-wgsl.yml`; WebGPU consumption needs #260.
 */
export const TERRAIN_WGSL = /* wgsl */ `
${terrainCdlodWgslUniformStruct}
${terrainSplatWgslUniformStruct}
struct A3dTerrainView {
  viewProjection : mat4x4f,
  ambient : vec3f,
  keyLightDir : vec3f,        // direction light travels (e.g. sun -> scene)
  keyLightColor : vec3f,
};
${terrainCdlodWgslBindings}
@group(0) @binding(3) var<uniform> u_view : A3dTerrainView;
${terrainSplatWgslBindings}
${terrainCdlodWgslFunctions}
${terrainSplatWgslFunctions}
struct TerrainVsOut {
  @builtin(position) position : vec4f,
  @location(0) terrainUv : vec2f,
  @location(1) worldPosition : vec3f,
};

@vertex
fn terrainVs(@location(0) a_grid : vec2f, @location(1) a_node : vec4f) -> TerrainVsOut {
  let v = a3dTerrainCdlod(a_grid, a_node);
  var o : TerrainVsOut;
  o.position = u_view.viewProjection * vec4f(v.world, 1.0);
  o.terrainUv = v.uv;
  o.worldPosition = v.world;
  return o;
}

@fragment
fn terrainFs(in_ : TerrainVsOut) -> @location(0) vec4f {
  let uv = in_.terrainUv;
  let xz = in_.worldPosition.xz;
  // Uniform control flow: all derivatives before any branch, loop or discard.
  let dUvDx = dpdx(uv);
  let dUvDy = dpdy(uv);
  let dXZDx = dpdx(xz);
  let dXZDy = dpdy(xz);
  let hole = a3dTerrainDiscardHole(uv);
  let n = a3dTerrainMacroNormal(uv);
  let layerCount = u_terrainFrag.layerCount;
  var w = a3dTerrainSplatWeights(uv, dUvDx, dUvDy, layerCount);
  let viewDist = distance(u_camera, in_.worldPosition);
  w = a3dTerrainHeightBlend(w, xz, dXZDx, dXZDy, viewDist, layerCount);
  let macroN = textureSampleGrad(u_macroVariation, u_samp, xz / 256.0, dXZDx / 256.0, dXZDy / 256.0).r;
  let rot = mat2x2f(0.80902, 0.58779, -0.58779, 0.80902); // rot(0.62) second-scale anti-tiling
  var albedo = vec3f(0.0);
  var roughness = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= layerCount) { break; }
    let params = u_terrainFrag.layerParams[i];
    let tint = u_terrainFrag.layerTintOrm[i].rgb;
    if (u_terrainFrag.solidMode == 0) {
      let inv = 1.0 / max(params.x, 1e-3);
      let uvA = xz * inv;
      let gAx = dXZDx * inv;
      let gAy = dXZDy * inv;
      let ah = mix(textureSampleGrad(u_layerAlbedoHeight, u_samp, uvA, i, gAx, gAy),
                   textureSampleGrad(u_layerAlbedoHeight, u_samp, rot * uvA, i, rot * gAx, rot * gAy),
                   clamp(macroN * 2.0, 0.0, 1.0));
      albedo = albedo + ah.rgb * tint * w[i];
      roughness = roughness + textureSampleGrad(u_layerOrm, u_samp, uvA, i, gAx, gAy).g * w[i];
    } else {
      albedo = albedo + tint * (0.85 + 0.3 * macroN) * w[i];
      roughness = roughness + 0.85 * w[i];
    }
    roughness = roughness + u_terrainFrag.layerTintOrm[i].a * w[i];
  }
  if (hole) { discard; }
  let ndl = max(dot(n, -u_view.keyLightDir), 0.0);
  let col = albedo * (u_view.ambient + u_view.keyLightColor * ndl);
  return vec4f(col, 1.0);
}
`;
