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
import type { PortableShaderBinding, ShaderSources } from "../../RenderDevice.js";
import { a3d_prd10_gerstner } from "./shaders/gerstner.js";
import { a3d_prd10_water } from "./shaders/water.js";
import { a3d_prd10_world_light_fallback } from "../shared/shaders/worldLightFallback.js";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "../../webgpu/ProjectionClip.js";

const WATER_VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
// prd10.water — marker for the RenderDevice shader contract.
in vec3 a_position;       // unit quad grid, xz = metres, y = 0
in float a_shore;         // baked signed shore distance (metres): Low path depth; < 0 = outside the shape
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
uniform vec3 u_cameraPosition;   // bound by WaterRuntime; the shared chunks read it but do not declare it
#ifndef A3D_PRD10_WATER_HAS_SCENE
#define A3D_PRD10_WATER_HAS_SCENE 0
#endif
${a3d_prd10_world_light_fallback.glsl}
${a3d_prd10_water.glsl}
void main() {
  if (v_shore < 0.0) discard; // outside the polygon / circle shape (the grid is the shape's bounding square)
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
  vec3 reflected = u_reflectionMode > 1.5
    ? a3dWaterPlanarReflection(suv, n)
    : a3dWorldEnvSpecular(R, 0.03);   // mode 0 env; mode 1 SSR arrives via C-13 (stub = env)
  vec3 sunSpec = a3dDirectSpecularGGX(n, V, u_sunDirection, 0.06) * u_sunColor * a3dSunShadowAt(v_worldPosition);
  vec3 color = mix(transmitted, reflected, F) + sunSpec;
  color = mix(color, vec3(0.9) * a3dSunIrradiance() + a3dSkyIrradiance(), a3dWaterFoam(v_xz, thickness, v_crest));
  color = a3dApplyFog(color, v_worldPosition);
  o_color = vec4(color, 1.0);
}
`;


/**
 * WGSL twin (WebGPU, portable layout): the same Gerstner vertex, §8.6 water and §8.7 underwater fragments and
 * `a3d_prd10_world_light_fallback` terms as the GLSL above, reading the uniforms WaterRuntime binds by name. The device
 * injects the `aura` uniform block and `<name>Texture`/`<name>Sampler` pairs at `@aura3d-bindings` from
 * WATER_PORTABLE_BINDINGS. Clip z goes through the zero-to-one projection override like the other native scene programs.
 * Scene copies (rgba8 colour targets, top-left origin like the fragment position) are read with explicit-LOD samples so
 * the post-`discard` control flow stays valid.
 */
const WATER_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_worldOffset", kind: "vec3" },
  { name: "u_waterHeight", kind: "float" },
  { name: "u_waves", kind: "vec4", arrayLength: 8 },
  { name: "u_waveSpeed", kind: "vec4", arrayLength: 8 },
  { name: "u_waveCount", kind: "float" },
  { name: "u_time", kind: "float" },
  { name: "u_cameraPosition", kind: "vec3" },
  { name: "u_viewport", kind: "vec2" },
  { name: "u_near", kind: "float" },
  { name: "u_far", kind: "float" },
  { name: "u_flow0", kind: "vec2" },
  { name: "u_flow1", kind: "vec2" },
  { name: "u_normalScale", kind: "float" },
  { name: "u_absorption", kind: "vec3" },
  { name: "u_scatterColor", kind: "vec3" },
  { name: "u_deepColor", kind: "vec3" },
  { name: "u_shallowColor", kind: "vec3" },
  { name: "u_refractionStrength", kind: "float" },
  { name: "u_reflectionMode", kind: "float" },
  { name: "u_reflectionDistort", kind: "float" },
  { name: "u_foamShoreDepth", kind: "float" },
  { name: "u_foamCrest", kind: "float" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_sunColor", kind: "vec3" },
  { name: "u_skyHorizonColor", kind: "vec3" },
  { name: "u_shIrradiance", kind: "vec4", arrayLength: 9 },
  { name: "u_fogColor", kind: "vec3" },
  { name: "u_fogNearFar", kind: "vec2" },
  { name: "u_ambientSH", kind: "vec3" },
  { name: "u_surfaceColor", kind: "vec3" },
  { name: "u_deepGradient", kind: "vec3" },
  { name: "u_normal0", kind: "texture2d" },
  { name: "u_normal1", kind: "texture2d" },
  { name: "u_sceneDepth", kind: "texture2d" },
  { name: "u_sceneColor", kind: "texture2d" },
  { name: "u_planarReflection", kind: "texture2d" },
  { name: "u_foam", kind: "texture2d" }
];

const WATER_VARYINGS_WGSL = /* wgsl */ `
struct WaterVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) xz: vec2<f32>,
  @location(2) waveNormal: vec3<f32>,
  @location(3) crest: f32,
  @location(4) shore: f32,
};`;

const WATER_VERT_WGSL = /* wgsl */ `
// prd10.water — marker for the RenderDevice shader contract (WGSL twin of WATER_VERT_GLSL).
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
${WATER_VARYINGS_WGSL}
fn a3dGerstnerPhase(i: i32, xz: vec2<f32>) -> vec3<f32> {
  let wave = aura.u_waves[i];
  let k = 6.2831853 / wave.w;
  let c = sqrt(9.81 / k) * aura.u_waveSpeed[i].x;
  return vec3<f32>(k * (dot(wave.xy, xz) - c * aura.u_time), wave.z / k, wave.z);
}
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_shore: f32) -> WaterVarying {
  var out: WaterVarying;
  let xz = a_position.xz + aura.u_worldOffset.xz;
  var p = vec3<f32>(xz.x, 0.0, xz.y);
  var tangent = vec3<f32>(1.0, 0.0, 0.0);
  var binormal = vec3<f32>(0.0, 0.0, 1.0);
  var j = 0.0;
  for (var i = 0; i < 8; i++) {
    if (f32(i) >= aura.u_waveCount) { break; }
    let d = aura.u_waves[i].xy;
    let ph = a3dGerstnerPhase(i, xz);
    let f = ph.x; let a = ph.y; let st = ph.z;
    p += vec3<f32>(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
    tangent += vec3<f32>(-d.x * d.x * st * sin(f), d.x * st * cos(f), -d.x * d.y * st * sin(f));
    binormal += vec3<f32>(-d.x * d.y * st * sin(f), d.y * st * cos(f), -d.y * d.y * st * sin(f));
    j += st * sin(f);
  }
  out.worldPosition = vec3<f32>(p.x, p.y + aura.u_waterHeight, p.z);
  out.xz = xz;
  out.waveNormal = normalize(cross(binormal, tangent));
  out.crest = 1.0 - j;
  out.shore = a_shore;
  let clip = aura.u_viewProjection * vec4<f32>(out.worldPosition, 1.0);
  out.position = vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  return out;
}
`;

/** Shared fragment helpers (water chunk + world light fallback), WGSL. */
const WATER_HELPERS_WGSL = /* wgsl */ `
fn a3dTex(t: texture_2d<f32>, s: sampler, uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(t, s, uv, 0.0); }
fn a3dWaterLinearDepth(z: f32) -> f32 {
  return (2.0 * aura.u_near * aura.u_far) / (aura.u_far + aura.u_near - (z * 2.0 - 1.0) * (aura.u_far - aura.u_near));
}
fn a3dWaterNormal(waveNormal: vec3<f32>, xz: vec2<f32>, time: f32) -> vec3<f32> {
  let n0 = a3dTex(u_normal0Texture, u_normal0Sampler, xz / 6.0 + time * aura.u_flow0).xyz * 2.0 - 1.0;
  let n1 = a3dTex(u_normal1Texture, u_normal1Sampler, xz / 17.0 + time * aura.u_flow1).xyz * 2.0 - 1.0;
  let detail = normalize(vec3<f32>(n0.xy + n1.xy, n0.z * n1.z));
  let t = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), waveNormal));
  let b = cross(waveNormal, t);
  return normalize(t * detail.x + b * detail.y + waveNormal * (detail.z * aura.u_normalScale));
}
fn a3dWaterFresnel(n: vec3<f32>, V: vec3<f32>) -> f32 { return 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0); }
fn a3dWaterFoam(xz: vec2<f32>, thickness: f32, crest: f32) -> f32 {
  let shoreFoam = (1.0 - smoothstep(0.0, aura.u_foamShoreDepth, thickness)) * a3dTex(u_foamTexture, u_foamSampler, xz / 3.0 + aura.u_time * 0.02).r;
  let crestFoam = smoothstep(aura.u_foamCrest, aura.u_foamCrest - 0.15, crest) * a3dTex(u_foamTexture, u_foamSampler, xz / 5.0).g;
  return clamp(shoreFoam + crestFoam, 0.0, 1.0);
}
fn a3dDirectSpecularGGX(n: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> vec3<f32> {
  let H = normalize(V + L);
  let ndh = max(dot(n, H), 0.0);
  let a = max(roughness * roughness, 0.02);
  let a2 = a * a;
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  return aura.u_sunColor * (a2 / max(3.14159265 * d * d, 1e-4)) * 0.25;
}
fn a3dWorldEnvSpecular(R: vec3<f32>, roughness: f32) -> vec3<f32> {
  let f = pow(1.0 - clamp(R.y, 0.0, 1.0), 3.0);
  return aura.u_skyHorizonColor * (0.04 + 0.96 * f) * (1.0 - roughness * 0.8);
}
fn a3dApplyFog(color: vec3<f32>, worldPos: vec3<f32>) -> vec3<f32> {
  let d = distance(aura.u_cameraPosition, worldPos);
  let f = clamp((d - aura.u_fogNearFar.x) / max(aura.u_fogNearFar.y - aura.u_fogNearFar.x, 1e-4), 0.0, 1.0);
  return mix(color, aura.u_fogColor, f);
}
`;

function waterFragWgsl(hasScene: boolean): string {
  return /* wgsl */ `
// prd10.water — marker for the RenderDevice shader contract (WGSL twin of WATER_FRAG_GLSL, HAS_SCENE ${hasScene ? 1 : 0}).
/* @aura3d-bindings */
${WATER_VARYINGS_WGSL}
${WATER_HELPERS_WGSL}
@fragment fn fs_main(in: WaterVarying) -> @location(0) vec4<f32> {
  if (in.shore < 0.0) { discard; }
  let n = a3dWaterNormal(in.waveNormal, in.xz, aura.u_time);
  let V = normalize(aura.u_cameraPosition - in.worldPosition);
  let F = a3dWaterFresnel(n, V);
  let suv = in.position.xy / aura.u_viewport;
  let waterZ = a3dWaterLinearDepth(in.position.z);
  var thickness = 0.0;
  var transmitted = vec3<f32>(0.0);
${hasScene ? `  let sceneZ = a3dWaterLinearDepth(a3dTex(u_sceneDepthTexture, u_sceneDepthSampler, suv).r);
  thickness = max(sceneZ - waterZ, 0.0);
  var ruv = suv + n.xz * aura.u_refractionStrength * clamp(thickness, 0.0, 1.0);
  if (a3dWaterLinearDepth(a3dTex(u_sceneDepthTexture, u_sceneDepthSampler, ruv).r) < waterZ) { ruv = suv; }
  let T = exp(-aura.u_absorption * thickness);
  transmitted = a3dTex(u_sceneColorTexture, u_sceneColorSampler, ruv).rgb * T
              + aura.u_scatterColor * (1.0 - exp(-aura.u_absorption * thickness)) * aura.u_sunColor;` : `  thickness = max(in.shore, 0.0);
  let T = exp(-aura.u_absorption * thickness);
  transmitted = mix(aura.u_shallowColor, aura.u_deepColor, clamp(1.0 - T.g, 0.0, 1.0)) * aura.u_skyHorizonColor;`}
  let R = reflect(-V, n);
  let planar = a3dTex(u_planarReflectionTexture, u_planarReflectionSampler, suv + n.xz * aura.u_reflectionDistort).rgb;
  let reflected = select(a3dWorldEnvSpecular(R, 0.03), planar, aura.u_reflectionMode > 1.5);
  let sunSpec = a3dDirectSpecularGGX(n, V, aura.u_sunDirection, 0.06) * aura.u_sunColor;
  var color = mix(transmitted, reflected, F) + sunSpec;
  color = mix(color, vec3<f32>(0.9) * aura.u_sunColor + aura.u_skyHorizonColor, a3dWaterFoam(in.xz, thickness, in.crest));
  return vec4<f32>(a3dApplyFog(color, in.worldPosition), 1.0);
}
`;
}

const UNDERWATER_FRAG_WGSL = /* wgsl */ `
// prd10.water — marker for the RenderDevice shader contract (WGSL twin of UNDERWATER_FRAG_GLSL).
/* @aura3d-bindings */
${WATER_VARYINGS_WGSL}
${WATER_HELPERS_WGSL}
@fragment fn fs_main(in: WaterVarying) -> @location(0) vec4<f32> {
  if (in.shore < 0.0) { discard; }
  let n = a3dWaterNormal(in.waveNormal, in.xz, aura.u_time);
  let V = normalize(in.worldPosition - aura.u_cameraPosition);
  let cosI = clamp(dot(-V, -n), 0.0, 1.0);
  let sinT2 = 1.33 * 1.33 * (1.0 - cosI * cosI);
  var color: vec3<f32>;
  if (sinT2 > 1.0) {
    color = mix(aura.u_deepGradient, aura.u_surfaceColor, clamp(in.worldPosition.y / aura.u_waterHeight, 0.0, 1.0));
  } else {
    color = mix(aura.u_deepGradient, aura.u_surfaceColor, clamp(in.worldPosition.y / max(aura.u_waterHeight, 0.01), 0.0, 1.0))
          + aura.u_sunColor * 0.35 * a3dWaterFresnel(n, -V);
  }
  return vec4<f32>(a3dApplyFog(color, in.worldPosition), 1.0);
}
`;

/** Full §8.6 program. `hasScene`/`planar` bake the feature defines. */
export function waterShaderSources(options: { readonly hasScene: boolean; readonly planar: boolean }): ShaderSources {
  const defines = `#define A3D_PRD10_WATER_HAS_SCENE ${options.hasScene ? 1 : 0}\n`;
  return {
    label: "prd10-water",
    marker: "prd10.water",
    vertex: WATER_VERT_GLSL,
    // The define goes after `#version` (GLSL ES requires `#version` first; prefixing it failed every water compile).
    fragment: WATER_FRAG_GLSL.replace("#version 300 es\n", `#version 300 es\n${defines}`),
    webgpu: { vertex: WATER_VERT_WGSL, fragment: waterFragWgsl(options.hasScene) },
    portableBindings: WATER_PORTABLE_BINDINGS
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
uniform vec3 u_cameraPosition;   // bound by WaterRuntime; the shared chunks read it but do not declare it
${a3d_prd10_world_light_fallback.glsl}
${a3d_prd10_water.glsl}
uniform vec3 u_surfaceColor;   // gradient top (#2a8fb0)
uniform vec3 u_deepGradient;   // gradient bottom (#021018)
uniform float u_waterHeight;   // rest surface Y (declared in the vertex stage too)
void main() {
  if (v_shore < 0.0) discard; // outside the polygon / circle shape (the grid is the shape's bounding square)
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
    fragment: UNDERWATER_FRAG_GLSL,
    webgpu: { vertex: WATER_VERT_WGSL, fragment: UNDERWATER_FRAG_WGSL },
    portableBindings: WATER_PORTABLE_BINDINGS
  };
}
