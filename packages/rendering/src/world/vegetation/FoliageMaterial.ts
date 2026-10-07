/**
 * PRD-10 T3.4 §8.3 — the standalone Path S foliage program for scatter draws:
 * `a3d_prd10_wind` vertex deform + `a3d_prd10_foliage` fragment behaviour
 * (alpha cutoff/A2C sharpen, two-sided normals, sun translucency, per-instance
 * colour variation, screen-door crossfade) over the §9.3 compact32 instance
 * layout. Path G reaches the same behaviour through `programCacheSlot`
 * features (`prd10.wind` + `prd10.foliageTranslucency`).
 */
import type { ShaderSources } from "../../RenderDevice.js";
import { registerMaterialLobe } from "../../contracts/materialLobes.js";
import { a3d_prd10_foliage } from "./shaders/foliage.js";
import { a3d_prd10_wind } from "./shaders/wind.js";

const FOLIAGE_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec4 a_colorWeights;          // vertex colour wind weights (r bend, g flutter, b phase, a -)
// compact32 instance record (yaw arrives normalized 0..1 from u16, scale from
// a HALF_FLOAT attribute — GL converts both before the VS sees them)
in vec3 a_instancePosition;
in float a_instanceYaw;          // u16 unorm -> 0..1
in float a_instanceScale;        // f16 -> f32
in vec4 a_instanceVariation;     // unorm8x4 -> 0..1 per channel
in vec4 a_instanceExtra;
uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
uniform vec4 u_terrain;          // not used for foliage; keeps std layout
uniform float u_time;
uniform float u_assetHeight;
uniform float u_lodFade;         // distance fade 0..1 (screen-door discard vs bayer)
${a3d_prd10_wind.glsl}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_weights;
out float v_variation;
out float v_fade;
void main() {
  float yaw = a_instanceYaw * 6.28318530718;
  float scale = a_instanceScale;
  float cs = cos(yaw); float sn = sin(yaw);
  vec3 local = vec3(a_position.x * cs + a_position.z * sn, a_position.y, -a_position.x * sn + a_position.z * cs) * scale;
  vec3 world = local + a_instancePosition;
  vec3 wind = a3dWindOffset(local, a_instancePosition, a_colorWeights, u_assetHeight);
  world += wind;
  vec3 n = normalize(vec3(a_normal.x * cs + a_normal.z * sn, a_normal.y, -a_normal.x * sn + a_normal.z * cs));
  v_worldPosition = world;
  v_normal = n;
  v_uv = a_uv;
  v_weights = a_colorWeights;
  v_variation = a_instanceVariation.x;
  v_fade = a_instanceVariation.y * u_lodFade;
  gl_Position = u_viewProjection * vec4(world, 1.0);
}
`;

const FOLIAGE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_weights;
in float v_variation;
in float v_fade;
out vec4 o_color;
uniform vec3 u_cameraPosition;
uniform vec3 u_ambient;
uniform vec3 u_keyLightDir;
uniform vec3 u_keyLightColor;
uniform vec3 u_translucencyColor;
uniform float u_thickness;
uniform float u_lod1Fade;        // 1 = keep, 0 = discard all (band fade)
${a3d_prd10_foliage.glsl}
void main() {
  if (a3dBayer4x4(gl_FragCoord.xy) > v_fade * u_lod1Fade + 0.001) discard;
  float alpha = a3dFoliageAlpha(v_uv);
  vec3 n = a3dFoliageNormal(normalize(v_normal));
  vec3 albedo = a3dInstanceVariation(texture(u_baseColor, v_uv).rgb, v_variation);
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  float ndl = max(dot(n, -u_keyLightDir), 0.0);
  vec3 direct = albedo * (u_ambient + u_keyLightColor * ndl);
  direct += a3dFoliageTranslucency(albedo, u_translucencyColor, u_thickness, V, u_keyLightDir, u_keyLightColor, 1.0);
  o_color = vec4(direct, alpha);
}
`;

/** Full sources for the standalone Path S foliage program. */
export function foliageShaderSources(): ShaderSources {
  return {
    label: "prd10-foliage",
    marker: "prd10-foliage",
    vertex: FOLIAGE_VERT,
    fragment: FOLIAGE_FRAG
  };
}

/** T3.4 — the C-03 lobe that adds the sun translucency term on Path G. */
export function registerPrd10FoliageLobe(): () => void {
  return registerMaterialLobe({
    id: "prd10.foliageTranslucency",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    chunks: { pars: "a3d_prd10_foliage", fragment: "a3d_prd10_foliage" },
    samplerSlots: [],
    feature(material) {
      const translucency = material.parameters["translucencyColor"];
      return translucency === undefined ? undefined : { lobe: "prd10.foliageTranslucency", maps: [], bits: { "prd10.foliageTranslucency": 1 } };
    },
    bind(material, set) {
      const t = material.parameters["translucencyColor"] as readonly number[] | undefined;
      if (t) set("u_translucencyColor", [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0]);
      set("u_thickness", (material.parameters["translucencyThickness"] as number | undefined) ?? 1);
      set("u_alphaCutoff", (material.parameters["alphaCutoff"] as number | undefined) ?? 0.5);
    }
  });
}
