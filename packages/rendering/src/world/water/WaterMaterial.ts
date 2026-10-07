/**
 * PRD-10 §8.6 / T4.2 — `WaterMaterial`: the standalone water surface program.
 * Composes the `a3d_prd10_gerstner` vertex chunk (wave displacement +
 * `v_crest`), the `a3d_prd10_water` fragment chunk (UDN normals, Fresnel,
 * depth refraction, Beer-Lambert, foam) and `a3d_prd10_world_light_fallback`
 * (env specular / sun GGX / shadow stub / linear fog) into `ShaderSources`
 * that `WaterRuntime` draws in the `transparent` phase.
 *
 * `A3D_PRD10_WATER_HAS_SCENE` selects the refraction path: 0 = Low (deep/
 * shallow mix from the `a_shore` vertex attribute, no scene copy — §8.6 Low),
 * 1 = scene color + depth copies (foreground-reject refraction + shore foam).
 * `A3D_PRD10_WATER_PLANAR` binds the planar reflection texture when a
 * `ReflectionViewPass` captured one this frame.
 */
import type { ShaderSources } from "../../RenderDevice.js";
import { a3d_prd10_gerstner } from "./shaders/gerstner.js";
import { a3d_prd10_water } from "./shaders/water.js";
import { a3d_prd10_world_light_fallback } from "../shared/shaders/worldLightFallback.js";

const WATER_VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
// prd10.water — marker for the RenderDevice shader contract.
in vec3 a_position;       // unit quad grid, xz = metres, y = 0
in float a_shore;         // baked shore distance (metres) — Low path only
uniform mat4 u_viewProjection;
uniform vec3 u_worldOffset;   // grid origin in world space
uniform float u_waterHeight;  // rest surface Y
${a3d_prd10_gerstner.glsl}
out vec3 v_worldPosition;
out vec2 v_xz;
out vec3 v_waveNormal;
out float v_crest;
out float v_shore;
void main() {
  vec3 waveN;
  vec3 p = a3dGerstner(a_position.xz + u_worldOffset.xz, waveN);
  v_worldPosition = vec3(p.x, p.y + u_waterHeight, p.z);
  v_xz = a_position.xz + u_worldOffset.xz;
  v_waveNormal = waveN;
  v_crest = a3dGerstnerCrest(v_xz);
  v_shore = a_shore;
  gl_Position = u_viewProjection * vec4(v_worldPosition, 1.0);
}
`;

const WATER_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
// prd10.water — marker for the RenderDevice shader contract.
in vec3 v_worldPosition;
in vec2 v_xz;
in vec3 v_waveNormal;
in float v_crest;
in float v_shore;
out vec4 o_color;
#ifndef A3D_PRD10_WATER_HAS_SCENE
#define A3D_PRD10_WATER_HAS_SCENE 0
#endif
${a3d_prd10_world_light_fallback.glsl}
${a3d_prd10_water.glsl}
void main() {
  vec3 n = a3dWaterNormal(v_waveNormal, v_xz, u_time);
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  float F = a3dWaterFresnel(n, V);
  vec2 suv = gl_FragCoord.xy / u_viewport;
  float waterZ = a3dWaterLinearDepth(gl_FragCoord.z);
  float thickness;
  vec3 transmitted;
#if A3D_PRD10_WATER_HAS_SCENE
  transmitted = a3dWaterRefracted(suv, waterZ, n, thickness)
              + u_scatterColor * (1.0 - exp(-u_absorption * thickness)) * a3dSunIrradiance();
#else
  // Low path (§8.6): baked shore distance stands in for scene-depth thickness.
  thickness = max(v_shore, 0.0);
  vec3 T = exp(-u_absorption * thickness);
  transmitted = mix(u_shallowColor, u_deepColor, clamp(1.0 - T.g, 0.0, 1.0)) * a3dSkyIrradiance();
#endif
  vec3 R = reflect(-V, n);
  vec3 reflected = u_reflectionMode == 2
    ? a3dWaterPlanarReflection(suv, n)
    : a3dWorldEnvSpecular(R, 0.03);   // mode 0 env; mode 1 SSR arrives via C-13 (stub = env)
  vec3 sunSpec = a3dDirectSpecularGGX(n, V, u_sunDirection, 0.06) * u_sunColor * a3dSunShadowAt(v_worldPosition);
  vec3 color = mix(transmitted, reflected, F) + sunSpec;
  color = mix(color, vec3(0.9) * a3dSunIrradiance() + a3dSkyIrradiance(), a3dWaterFoam(v_xz, thickness, v_crest));
  color = a3dApplyFog(color, v_worldPosition);
  o_color = vec4(color, 1.0);
}
`;

/** Full §8.6 program. `hasScene`/`planar` bake the feature defines. */
export function waterShaderSources(options: { readonly hasScene: boolean; readonly planar: boolean }): ShaderSources {
  const defines = `#define A3D_PRD10_WATER_HAS_SCENE ${options.hasScene ? 1 : 0}\n`;
  return {
    label: "prd10-water",
    marker: "prd10.water",
    vertex: WATER_VERT_GLSL,
    fragment: defines + WATER_FRAG_GLSL,
    webgpu: undefined // WGSL twin ships with the Path G variant (chunk-level wgsl exists on a3d_prd10_water)
  };
}

/**
 * The §8.6 underwater shell program: the surface re-drawn back-face with a
 * Snell's window (total internal reflection outside the 48.6° cone) and the
 * depth-graded underwater gradient as background tint.
 */
const UNDERWATER_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
// prd10.water — marker for the RenderDevice shader contract.
in vec3 v_worldPosition;
in vec2 v_xz;
in vec3 v_waveNormal;
in float v_crest;
in float v_shore;
out vec4 o_color;
${a3d_prd10_world_light_fallback.glsl}
${a3d_prd10_water.glsl}
uniform vec3 u_surfaceColor;   // gradient top (#2a8fb0)
uniform vec3 u_deepGradient;   // gradient bottom (#021018)
void main() {
  vec3 n = a3dWaterNormal(v_waveNormal, v_xz, u_time);
  vec3 V = normalize(v_worldPosition - u_cameraPosition); // view ray upward
  float cosI = clamp(dot(-V, -n), 0.0, 1.0);
  // Snell's window: total internal reflection beyond the 48.6° critical cone
  // (sin²θc = 1/1.33²). Below it the surface refracts the sky gradient.
  float sinT2 = 1.33 * 1.33 * (1.0 - cosI * cosI);
  vec3 color;
  if (sinT2 > 1.0) {
    // TIR: reflect the underwater background back down
    color = mix(u_deepGradient, u_surfaceColor, clamp(v_worldPosition.y / u_waterHeight, 0.0, 1.0));
  } else {
    color = mix(u_deepGradient, u_surfaceColor, clamp(v_worldPosition.y / max(u_waterHeight, 0.01), 0.0, 1.0))
          + a3dSunIrradiance() * 0.35 * a3dWaterFresnel(n, -V);
  }
  o_color = vec4(a3dApplyFog(color, v_worldPosition), 1.0);
}
`;

/** Underwater back-face program (§8.7) — drawn when the camera is submerged. */
export function underwaterShaderSources(): ShaderSources {
  return {
    label: "prd10-water-underwater",
    marker: "prd10.water",
    vertex: WATER_VERT_GLSL,
    fragment: UNDERWATER_FRAG_GLSL
  };
}
