// Lane 514: visual helpers built on the portable `material.custom` path.
//   material.strata      height-banded rock with slope-based cliff colouring (terrain, canyons, cliffs).
//   material.caustics    lit floor with an animated, tileable water-caustic pattern (reefs, pools, harbours).
//   material.lightBeam   soft additive beam shader for an open cone (lighthouse, spot shaft).
// All three carry paired GLSL + WGSL custom shader stages so WebGL2 and native WebGPU render identical visuals. They read
// the built-in `uTime` clock only where they animate (caustics, beam); strata is static and never forces redraws.

import type { AuraColor, AuraCustomMaterialSpec, AuraCustomUniformSpec, AuraMaterialSpec } from "./types.js";
import { assertAuraCustomMaterialSpec } from "../compiler/customMaterial.js";
import { parseAuraColor } from "../../contracts/sceneGraph.js";

const rgb = (color: AuraColor): readonly [number, number, number] => {
  const [r, g, b] = parseAuraColor(color);
  return [r, g, b];
};

const num = (value: number | undefined, fallback: number, min: number, max: number, owner: string, field: string): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${owner}: ${field} must be a finite number`);
  return Math.min(max, Math.max(min, value));
};

const glslFloat = (value: number): string => {
  const text = Number.isInteger(value) ? `${value}.0` : String(Number(value.toPrecision(7)));
  return text.includes("e") ? value.toFixed(6) : text;
};
const glslVec3 = (value: readonly [number, number, number]): string => `vec3(${value.map(glslFloat).join(", ")})`;
const wgslVec3 = (value: readonly [number, number, number]): string => `vec3<f32>(${value.map(glslFloat).join(", ")})`;

/** Vertex stage shared by the lit helpers: world position and world normal (instanced meshes work). */
const LIT_VERTEX_GLSL = `out vec3 vVisWorld;
out vec3 vVisNormal;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vVisWorld = world.xyz;
  vVisNormal = normalMatrix * (mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WGSL_VIS_CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
fn a3dMat3Mul(m: mat4x4<f32>, v: vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(v, 0.0)).xyz;
}`;

const LIT_VERTEX_WGSL = /* wgsl */ `/* @aura3d-bindings */
${WGSL_VIS_CLIP}
struct VisVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(8) a_instanceMatrix0: vec4<f32>,
  @location(9) a_instanceMatrix1: vec4<f32>,
  @location(10) a_instanceMatrix2: vec4<f32>,
  @location(11) a_instanceMatrix3: vec4<f32>
) -> VisVertexOutput {
  let inst = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * inst * vec4<f32>(a_position, 1.0);
  var out: VisVertexOutput;
  out.vVisWorld = world.xyz;
  out.vVisNormal = a3dMat3Mul(aura.u_normalMatrix, a3dMat3Mul(inst, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`;

const WGSL_VIS_NOISE_3D = /* wgsl */ `
fn a3dHash11(p0: f32) -> f32 {
  var p = fract(p0 * 0.1031);
  p = p * (p + 33.33);
  p = p * (p + p);
  return fract(p);
}
fn a3dHash31(p0: vec3<f32>) -> f32 {
  var p3 = fract(p0 * 0.1031);
  p3 = p3 + dot(p3, p3.zyx + vec3<f32>(31.32));
  return fract((p3.x + p3.y) * p3.z);
}
fn a3dValueNoise3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec3<f32>(3.0) - 2.0 * f);
  let n000 = a3dHash31(i);
  let n100 = a3dHash31(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = a3dHash31(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = a3dHash31(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = a3dHash31(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = a3dHash31(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = a3dHash31(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = a3dHash31(i + vec3<f32>(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
fn a3dFbm3(p0: vec3<f32>, octaves: i32) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= octaves) { break; }
    s = s + a * a3dValueNoise3(p);
    p = p * 2.03 + vec3<f32>(17.1);
    a = a * 0.5;
  }
  return s;
}`;

const WGSL_VIS_LIGHTING_IBL_FOG = /* wgsl */ `
fn a3dHemiLight(n: vec3<f32>) -> vec3<f32> {
  let up = clamp(n.y / max(length(n), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  return mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, vec3<f32>(up));
}
fn a3dSunShadow(worldPosition: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let receiverNormal = normal / max(length(normal), 0.0001);
  let receiverLightDirection = toLight / max(length(toLight), 0.0001);
  let lightPosition = aura.u_shadowMapMatrix * vec4<f32>(worldPosition + receiverNormal * aura.u_shadowMapNormalBias, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  let slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  let slopeTexelBias = slopeTangent * aura.u_shadowMapSlopeBias * max(aura.u_shadowMapTexelSize.x, aura.u_shadowMapTexelSize.y);
  let projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  var shadowed = 0.0;
  var totalWeight = 0.0;
  let sampleCount = clamp(i32(aura.u_shadowPcfSampleCount), 1, 32);
  for (var i = 0; i < 32; i = i + 1) {
    if (i >= sampleCount) { break; }
    let sampleData = aura.u_shadowPcfSamples[u32(i)];
    let weight = max(sampleData.z, 0.0);
    let tapOffset = sampleData.xy * aura.u_shadowMapTexelSize;
    let storedDepth = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, vec2<f32>(uv.x + tapOffset.x, 1.0 - uv.y - tapOffset.y), 0.0).r;
    let sampleTexelDistance = max(1.0, length(sampleData.xy));
    let receiverDepth = projectedDepth - aura.u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed = shadowed + select(0.0, 1.0, receiverDepth > storedDepth) * weight;
    totalWeight = totalWeight + weight;
  }
  let occlusion = select(0.0, shadowed / totalWeight, totalWeight > 0.0);
  return mix(1.0, 1.0 - occlusion, clamp(aura.u_shadowMapStrength, 0.0, 1.0));
}
fn a3dDirectLight(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, radiance: vec3<f32>, albedo: vec3<f32>, roughness: f32) -> vec3<f32> {
  let n = N / max(length(N), 1e-4);
  let v = V / max(length(V), 1e-4);
  let l = L / max(length(L), 1e-4);
  let nDotL = clamp(dot(n, l), 0.0, 1.0);
  let halfVector = v + l;
  let h = halfVector / max(length(halfVector), 1e-4);
  let nDotV = clamp(dot(n, v), 1e-4, 1.0);
  let nDotH = clamp(dot(n, h), 0.0, 1.0);
  let vDotH = clamp(dot(v, h), 0.0, 1.0);
  let rClamped = clamp(roughness, 0.0, 1.0);
  let alpha = max(rClamped * rClamped, 0.002);
  let alpha2 = alpha * alpha;
  let denom = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  let distribution = alpha2 / max(3.14159265 * denom * denom, 1e-6);
  let lambdaV = nDotL * sqrt(max(nDotV * nDotV * (1.0 - alpha2) + alpha2, 0.0));
  let lambdaL = nDotV * sqrt(max(nDotL * nDotL * (1.0 - alpha2) + alpha2, 0.0));
  let visibility = 0.5 / max(lambdaV + lambdaL, 1e-5);
  let edge = 1.0 - vDotH;
  let edge2 = edge * edge;
  let fresnel = 0.04 + 0.96 * edge2 * edge2 * edge;
  let diffuse = albedo * (1.0 - fresnel) * 0.31830989;
  return (diffuse + vec3<f32>(distribution * visibility * fresnel)) * radiance * nDotL;
}
fn a3dDirect(N: vec3<f32>, V: vec3<f32>, albedo: vec3<f32>, roughness: f32, worldPos: vec3<f32>) -> vec3<f32> {
  var total = vec3<f32>(0.0);
  let count = min(i32(aura.u_lightCount), 16);
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= count) { break; }
    let base = u32(i * 6);
    let colorIntensity = aura.u_lightData[base];
    let positionRange = aura.u_lightData[base + 1u];
    let directionKind = aura.u_lightData[base + 2u];
    let spotShadow = aura.u_lightData[base + 3u];
    let areaRight = aura.u_lightData[base + 4u];
    let areaUp = aura.u_lightData[base + 5u];
    let kind = directionKind.w;
    if (kind > 2.5) {
      if (areaUp.w < 0.5) { continue; }
      let axis = directionKind.xyz / max(length(directionKind.xyz), 0.0001);
      let r = areaRight.xyz / max(length(areaRight.xyz), 0.0001);
      let u = areaUp.xyz / max(length(areaUp.xyz), 0.0001);
      let width = max(spotShadow.x, 0.0);
      let height = max(spotShadow.y, 0.0);
      for (var sampleIndex = 0; sampleIndex < 4; sampleIndex = sampleIndex + 1) {
        let sampleSign = vec2<f32>(select(1.0, -1.0, sampleIndex == 0 || sampleIndex == 2), select(1.0, -1.0, sampleIndex < 2));
        let samplePosition = positionRange.xyz + 0.28867513459 * (r * width * sampleSign.x + u * height * sampleSign.y);
        let delta = samplePosition - worldPos;
        let distanceToLight = length(delta);
        let l = select(-axis, delta / distanceToLight, distanceToLight > 0.0001);
        let areaRatio = distanceToLight / max(positionRange.w, 0.0001);
        let areaRatio2 = areaRatio * areaRatio;
        let areaWindow = select(clamp(1.0 - areaRatio2 * areaRatio2, 0.0, 1.0), 1.0, positionRange.w <= 0.0);
        let areaGeometry = width * height * 0.25 * abs(dot(axis, -l)) * areaWindow * areaWindow / max(distanceToLight * distanceToLight, 0.01);
        total = total + a3dDirectLight(N, V, l, colorIntensity.rgb * colorIntensity.a * areaGeometry, albedo, roughness);
      }
      continue;
    }
    var lightDirection = -directionKind.xyz;
    var attenuation = 1.0;
    if (kind > 0.5) {
      let toLight = positionRange.xyz - worldPos;
      let distanceToLight = length(toLight);
      lightDirection = select(-directionKind.xyz, toLight / distanceToLight, distanceToLight > 0.0001);
      let ratio = distanceToLight / max(positionRange.w, 0.0001);
      let ratio2 = ratio * ratio;
      var rangeFalloff = select(clamp(1.0 - ratio2 * ratio2, 0.0, 1.0), 1.0, positionRange.w <= 0.0);
      rangeFalloff = rangeFalloff * rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      let fromLight = worldPos - positionRange.xyz;
      let axis = directionKind.xyz / max(length(directionKind.xyz), 1e-4);
      var cone = dot(axis, fromLight / max(length(fromLight), 1e-4));
      if (areaUp.w > 0.5) { cone = abs(cone); }
      let outer = cos(spotShadow.x);
      let inner = cos(spotShadow.x * max(1.0 - spotShadow.y, 0.001));
      attenuation = attenuation * smoothstep(outer, inner, cone);
    }
    if (kind < 0.5 && spotShadow.z > 0.5) { attenuation = attenuation * a3dSunShadow(worldPos, N, lightDirection); }
    total = total + a3dDirectLight(N, V, lightDirection, colorIntensity.rgb * colorIntensity.a * attenuation, albedo, roughness);
  }
  return total;
}
fn a3dEnvShComponent(index: u32) -> f32 { return aura.u_a3dEnvSh[index / 4u][index % 4u]; }
fn a3dEnvShCoefficient(index: u32) -> vec3<f32> {
  let i = index * 3u;
  return vec3<f32>(a3dEnvShComponent(i), a3dEnvShComponent(i + 1u), a3dEnvShComponent(i + 2u));
}
fn a3dEnvShIrradiance(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 1e-4);
  return max(
    0.886227 * a3dEnvShCoefficient(0u)
      - 1.023328 * d.y * a3dEnvShCoefficient(1u)
      + 1.023328 * d.z * a3dEnvShCoefficient(2u)
      - 1.023328 * d.x * a3dEnvShCoefficient(3u)
      + 0.858086 * d.x * d.y * a3dEnvShCoefficient(4u)
      + 0.858086 * d.y * d.z * a3dEnvShCoefficient(5u)
      + 0.247708 * (3.0 * d.z * d.z - 1.0) * a3dEnvShCoefficient(6u)
      + 0.858086 * d.x * d.z * a3dEnvShCoefficient(7u)
      + 0.429043 * (d.x * d.x - d.y * d.y) * a3dEnvShCoefficient(8u),
    vec3<f32>(0.0)
  );
}
fn a3dEnvProcedural(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 1e-4);
  let c = mix(aura.u_a3dEnvGround, aura.u_a3dEnvSky, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(c, aura.u_a3dEnvHorizon, clamp(1.0 - abs(d.y), 0.0, 1.0) * 0.55);
}
fn a3dEnvMapSample(direction: vec3<f32>, lod: f32) -> vec3<f32> {
  let d = direction / max(length(direction), 1e-4);
  let u = atan2(d.z, d.x) * 0.15915494 + 0.5 + aura.u_a3dEnvMapRotation;
  let v = acos(clamp(d.y, -1.0, 1.0)) * 0.31830989;
  let texel = textureSampleLevel(u_a3dEnvMapTexture, u_a3dEnvMapSampler, vec2<f32>(fract(u), clamp(v, 0.0, 1.0)), clamp(lod, 0.0, 8.0) * (aura.u_a3dEnvMapMaxLod / 8.0));
  var rgb = max(texel.rgb, vec3<f32>(0.0));
  if (aura.u_a3dEnvMapEncoding > 0.5 && aura.u_a3dEnvMapEncoding < 1.5) {
    let exponent = texel.a * 255.0;
    rgb = select(vec3<f32>(0.0), max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3<f32>(0.0)), exponent > 0.0);
  }
  return rgb * aura.u_a3dEnvMapIntensity;
}
fn a3dEnvDiffuse(N: vec3<f32>) -> vec3<f32> {
  let hemiMean = 0.5 * (aura.u_a3dHemiSky + aura.u_a3dHemiGround);
  let ambient = max(aura.u_a3dEnvAmbient - hemiMean, vec3<f32>(0.0)) + a3dHemiLight(N);
  let diffuse = ambient * 0.31830989;
  if (aura.u_a3dEnvMapEnabled > 0.5) { return diffuse + a3dEnvMapSample(N, 8.0); }
  if (aura.u_a3dEnvShEnabled > 0.5) { return diffuse + a3dEnvShIrradiance(N) * 0.31830989; }
  return diffuse + a3dEnvProcedural(N);
}
fn a3dEnvironmentFogFactor(worldPosition: vec3<f32>) -> f32 {
  if (aura.u_environmentFogEnabled < 0.5) { return 0.0; }
  let distanceToCamera = length(aura.u_cameraPosition - worldPosition);
  var factor = 0.0;
  if (aura.u_environmentFogMode < 1.5) {
    factor = (distanceToCamera - aura.u_environmentFogNear) / max(aura.u_environmentFogFar - aura.u_environmentFogNear, 0.000001);
  } else if (aura.u_environmentFogMode < 2.5) {
    factor = 1.0 - exp(-max(aura.u_environmentFogDensity, 0.0) * distanceToCamera);
  } else {
    let scaledDensity = max(aura.u_environmentFogDensity, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-(scaledDensity * scaledDensity));
  }
  var heightMultiplier = 1.0;
  if (aura.u_environmentFogHeightFalloff > 0.0) {
    heightMultiplier = exp(-max(0.0, worldPosition.y - aura.u_environmentFogHeightReference) * aura.u_environmentFogHeightFalloff);
  }
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(aura.u_environmentFogMaxOpacity, 0.0, 1.0);
}
fn a3dApplyEnvironmentFog(linearColor: vec3<f32>, worldPosition: vec3<f32>, fragCoord: vec2<f32>) -> vec3<f32> {
  let fogFactor = a3dEnvironmentFogFactor(worldPosition);
  var fogged = mix(linearColor, aura.u_environmentFogColor, fogFactor);
  if (aura.u_volumetricIntensity > 0.0) {
    let viewDistance = max(length(aura.u_cameraPosition - worldPosition), 0.000001);
    let viewDirection = (aura.u_cameraPosition - worldPosition) / viewDistance;
    let forwardLobe = pow(max(dot(viewDirection, aura.u_volumetricLightDirection), 0.0), 6.0);
    var heightGate = 1.0;
    if (aura.u_environmentFogHeightFalloff > 0.0) {
      heightGate = exp(-max(0.0, worldPosition.y - aura.u_environmentFogHeightReference) * aura.u_environmentFogHeightFalloff);
    }
    let inscatter = aura.u_volumetricIntensity * heightGate * forwardLobe * aura.u_volumetricLightColor * (0.15 + 0.85 * fogFactor);
    let dither = fract(sin(dot(fragCoord, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5;
    fogged = fogged + inscatter + vec3<f32>(dither * (1.0 / 255.0));
  }
  return fogged;
}`;

/* ------------------------------------------------------------------------- */
/* material.strata                                                            */
/* ------------------------------------------------------------------------- */

export interface AuraStrataSlopeOptions {
  /** Surfaces flatter than this angle from horizontal (degrees) take `flatColor`; steeper ones show the bands. Default 38. */
  readonly angle?: number;
  /** Blend width in degrees around `angle`. Default 12. */
  readonly blend?: number;
  /** Colour of flat ground (talus, sand, grass) between cliffs. Default: the first palette colour, lightened. */
  readonly flatColor?: AuraColor;
}

export interface AuraStrataMaterialOptions {
  /** Number of layers across the height range (default 12). */
  readonly bands?: number;
  /** Palette cycled through the layers (default: five warm sandstone tones). One to eight colours. */
  readonly colors?: readonly AuraColor[];
  /** World-space height range the bands span `[bottom, top]` (default `[0, 10]`). Bands repeat outside it. */
  readonly heightRange?: readonly [number, number];
  /** Layer-edge waviness and grain, 0 to 1 (default 0.35). 0 gives ruler-straight layers. */
  readonly noise?: number;
  /** World-unit size of the noise features (default 3). */
  readonly noiseScale?: number;
  /** Thin dark seam between layers, 0 to 1 (default 0.25). */
  readonly seam?: number;
  /** Per-layer brightness variation, 0 to 1 (default 0.18). */
  readonly variation?: number;
  /** Colour flat ground separately from steep cliffs. Omit to band every surface. */
  readonly slope?: AuraStrataSlopeOptions;
  /** Surface roughness for the specular term (default 0.9). */
  readonly roughness?: number;
  /** Seed that shifts the noise (default 0). */
  readonly seed?: number;
  readonly side?: "front" | "back" | "double";
}

const STRATA_DEFAULT_COLORS: readonly AuraColor[] = ["#c0723f", "#d99a62", "#a85a34", "#e3b783", "#8e4a2e"];

function strataFragment(colors: readonly (readonly [number, number, number])[], hasSlope: boolean): string {
  const n = colors.length;
  return `#include <a3d_lights>
#include <a3d_ibl>
#include <a3d_noise>
in vec3 vVisWorld;
in vec3 vVisNormal;
out vec4 outColor;
const vec3 STRATA_PALETTE[${n}] = vec3[${n}](${colors.map(glslVec3).join(", ")});
void main() {
  vec3 N = normalize(vVisNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vVisWorld);
  vec3 p = vVisWorld;
  float scale = max(strataNoiseScale, 0.01);
  vec3 q = vec3(p.x, p.y * 0.5, p.z) / scale + strataSeed;
  float warp = (a3dFbm(q, 4) - 0.5) * 2.0;
  float grain = a3dFbm(vec3(p.x, p.y * 3.0, p.z) / (scale * 0.18) + strataSeed, 3) - 0.5;
  float span = max(strataRange.y - strataRange.x, 0.001);
  float f = (p.y - strataRange.x) / span * strataBands + warp * strataNoise * 0.9;
  float layer = floor(f);
  float within = f - layer;
  int idx = int(mod(layer, float(${n})));
  vec3 albedo = STRATA_PALETTE[idx];
  float jitter = a3dHash11(layer * 7.13 + strataSeed.x * 3.0) - 0.5;
  albedo *= 1.0 + jitter * 2.0 * strataVariation;
  float seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo *= mix(1.0, 0.55 + 0.45 * seamMask, strataSeam);
  albedo *= 1.0 + grain * strataNoise * 0.8;
${hasSlope ? `  float slopeDeg = degrees(acos(clamp(N.y, -1.0, 1.0)));
  float flatMix = 1.0 - smoothstep(strataSlope.x - strataSlope.y * 0.5, strataSlope.x + strataSlope.y * 0.5, slopeDeg);
  vec3 flatAlbedo = strataFlatColor * (1.0 + grain * strataNoise * 0.9);
  albedo = mix(albedo, flatAlbedo, flatMix);` : ""}
  albedo = max(albedo, vec3(0.0));
  vec3 color = a3dDirect(N, V, albedo, strataRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  outColor = vec4(color, 1.0);
}`;
}

function strataFragmentWgsl(colors: readonly (readonly [number, number, number])[], hasSlope: boolean): string {
  const n = colors.length;
  const branches = colors
    .slice(0, -1)
    .map((c, idx) => `  if (idx == ${idx}) { return ${wgslVec3(c)}; }`)
    .join("\n");
  const last = wgslVec3(colors[n - 1]!);
  return /* wgsl */ `/* @aura3d-bindings */
${WGSL_VIS_LIGHTING_IBL_FOG}
${WGSL_VIS_NOISE_3D}
fn strataPalette(idx: i32) -> vec3<f32> {
${branches ? `${branches}\n` : ""}  return ${last};
}
@fragment fn fs_main(
  @builtin(front_facing) frontFacing: bool,
  @builtin(position) fragCoord: vec4<f32>,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>
) -> @location(0) vec4<f32> {
  var N = vVisNormal / max(length(vVisNormal), 1e-4);
  if (!frontFacing) { N = -N; }
  let V = (aura.u_cameraPosition - vVisWorld) / max(length(aura.u_cameraPosition - vVisWorld), 1e-4);
  let p = vVisWorld;
  let scale = max(aura.u_strataNoiseScale, 0.01);
  let q = vec3<f32>(p.x, p.y * 0.5, p.z) / scale + aura.u_strataSeed;
  let warp = (a3dFbm3(q, 4) - 0.5) * 2.0;
  let grain = a3dFbm3(vec3<f32>(p.x, p.y * 3.0, p.z) / (scale * 0.18) + aura.u_strataSeed, 3) - 0.5;
  let span = max(aura.u_strataRange.y - aura.u_strataRange.x, 0.001);
  let f = (p.y - aura.u_strataRange.x) / span * aura.u_strataBands + warp * aura.u_strataNoise * 0.9;
  let layer = floor(f);
  let within = f - layer;
  let period = f32(${n});
  let idx = clamp(i32(layer - period * floor(layer / period)), 0, ${n - 1});
  var albedo = strataPalette(idx);
  let jitter = a3dHash11(layer * 7.13 + aura.u_strataSeed.x * 3.0) - 0.5;
  albedo = albedo * (1.0 + jitter * 2.0 * aura.u_strataVariation);
  let seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo = albedo * mix(1.0, 0.55 + 0.45 * seamMask, aura.u_strataSeam);
  albedo = albedo * (1.0 + grain * aura.u_strataNoise * 0.8);
${hasSlope ? `  let slopeDeg = degrees(acos(clamp(N.y, -1.0, 1.0)));
  let flatMix = 1.0 - smoothstep(aura.u_strataSlope.x - aura.u_strataSlope.y * 0.5, aura.u_strataSlope.x + aura.u_strataSlope.y * 0.5, slopeDeg);
  let flatAlbedo = aura.u_strataFlatColor * (1.0 + grain * aura.u_strataNoise * 0.9);
  albedo = mix(albedo, flatAlbedo, flatMix);` : ""}
  albedo = max(albedo, vec3<f32>(0.0));
  let lit = a3dDirect(N, V, albedo, aura.u_strataRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  return vec4<f32>(a3dApplyEnvironmentFog(lit, vVisWorld, fragCoord.xy), 1.0);
}`;
}

/**
 * `material.strata(options)`: sedimentary layers by world height with noisy layer edges, thin seams and per-layer
 * brightness, lit by every scene light and the scene environment. With `slope`, flat ground reads `flatColor` and only
 * steep faces show the bands, which is how a canyon wall or heightfield cliff separates from its floor and rim.
 * Apply it to any mesh, including a `procedural.heightfield` surface.
 */
export function strataMaterial(options: AuraStrataMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.strata";
  const palette = (options.colors ?? STRATA_DEFAULT_COLORS).map(rgb);
  if (palette.length < 1 || palette.length > 8) throw new RangeError(`${owner}: colors must hold one to eight colours`);
  const bands = Math.round(num(options.bands, 12, 1, 64, owner, "bands"));
  const range = options.heightRange ?? [0, 10];
  if (!(range[1] > range[0]) || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) {
    throw new RangeError(`${owner}: heightRange must be [bottom, top] with top above bottom`);
  }
  const slope = options.slope;
  const flat = slope?.flatColor !== undefined
    ? rgb(slope.flatColor)
    : ([0, 1, 2].map((i) => Math.min(1, palette[0]![i]! * 0.6 + 0.35)) as unknown as readonly [number, number, number]);
  const seed = num(options.seed, 0, -1000, 1000, owner, "seed");
  const uniforms: Record<string, AuraCustomUniformSpec> = {
    strataBands: { type: "f32", value: bands },
    strataRange: { type: "vec2", value: [range[0], range[1]] },
    strataNoise: { type: "f32", value: num(options.noise, 0.35, 0, 1, owner, "noise") },
    strataNoiseScale: { type: "f32", value: num(options.noiseScale, 3, 0.01, 1000, owner, "noiseScale") },
    strataSeam: { type: "f32", value: num(options.seam, 0.25, 0, 1, owner, "seam") },
    strataVariation: { type: "f32", value: num(options.variation, 0.18, 0, 1, owner, "variation") },
    strataRoughness: { type: "f32", value: num(options.roughness, 0.9, 0.04, 1, owner, "roughness") },
    strataSeed: { type: "vec3", value: [seed * 1.37, seed * 0.71, seed * 1.93] }
  };
  if (slope) {
    uniforms.strataSlope = { type: "vec2", value: [num(slope.angle, 38, 1, 89, owner, "slope.angle"), num(slope.blend, 12, 0.5, 80, owner, "slope.blend")] };
    uniforms.strataFlatColor = { type: "vec3", value: [...flat] };
  }
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIT_VERTEX_GLSL, fragment: strataFragment(palette, slope !== undefined) },
    wgsl: { vertex: LIT_VERTEX_WGSL, fragment: strataFragmentWgsl(palette, slope !== undefined) },
    uniforms,
    fog: true,
    castShadow: true,
    ...(options.side === undefined ? {} : { side: options.side })
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}

/* ------------------------------------------------------------------------- */
/* material.caustics                                                          */
/* ------------------------------------------------------------------------- */

export interface AuraCausticsMaterialOptions {
  /** Colour of the floor under the light (default sand). */
  readonly color?: AuraColor;
  /** Colour of the caustic light (default warm white). */
  readonly causticColor?: AuraColor;
  /** Caustic brightness (default 1.2). */
  readonly strength?: number;
  /** World size of one caustic tile along X and Z (default 6). */
  readonly scale?: number;
  /** Animation speed multiplier (default 1). */
  readonly speed?: number;
  /** World height of the water surface. With `depthFade` the pattern dims the deeper a point lies below it (default none). */
  readonly surfaceY?: number;
  /** Extinction per metre below `surfaceY` (default 0.12; ignored without `surfaceY`). */
  readonly depthFade?: number;
  /** Roughness of the floor (default 0.95). */
  readonly roughness?: number;
  readonly side?: "front" | "back" | "double";
}

const CAUSTICS_FRAGMENT_GLSL = `#include <a3d_lights>
#include <a3d_ibl>
in vec3 vVisWorld;
in vec3 vVisNormal;
out vec4 outColor;
float visCaustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
void main() {
  vec3 N = normalize(vVisNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vVisWorld);
  vec3 albedo = causticsColor;
  vec3 lit = a3dDirect(N, V, albedo, causticsRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  float t = uTime * causticsSpeed * 0.5 + 23.0;
  vec2 uv = vVisWorld.xz / max(causticsScale, 0.01);
  float c = visCaustic(uv, t) * 0.7 + visCaustic(uv * 1.7 + 0.31, t * 1.2) * 0.45;
  float facing = smoothstep(-0.1, 0.7, N.y);
  float depthK = causticsFade.x > 0.5 ? exp(-max(causticsFade.y - vVisWorld.y, 0.0) * causticsFade.z) : 1.0;
  vec3 caustic = causticsLight * c * causticsStrength * facing * depthK;
  outColor = vec4(lit + caustic * (albedo * 0.6 + 0.4), 1.0);
}`;

const CAUSTICS_FRAGMENT_WGSL = /* wgsl */ `/* @aura3d-bindings */
${WGSL_VIS_LIGHTING_IBL_FOG}
fn a3dCausticPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
fn visCaustic(uv: vec2<f32>, t: f32) -> f32 {
  let tau = 6.28318530718;
  let scaled = uv * tau;
  let p = (scaled - tau * floor(scaled / tau)) - vec2<f32>(250.0);
  var i = p;
  var c = 1.0;
  let inten = 0.005;
  for (var n = 0; n < 4; n = n + 1) {
    let tt = t * (1.0 - (3.5 / f32(n + 1)));
    i = p + vec2<f32>(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    let sx = sin(i.x + tt);
    let cy = cos(i.y + tt);
    let dx = p.x / (select(-1.0, 1.0, sx >= 0.0) * max(abs(sx), 1e-6) / inten);
    let dy = p.y / (select(-1.0, 1.0, cy >= 0.0) * max(abs(cy), 1e-6) / inten);
    c = c + 1.0 / max(length(vec2<f32>(dx, dy)), 1e-6);
  }
  c = c / 4.0;
  c = 1.17 - a3dCausticPow(c, 1.4);
  return clamp(a3dCausticPow(abs(c), 8.0), 0.0, 1.0);
}
@fragment fn fs_main(
  @builtin(front_facing) frontFacing: bool,
  @builtin(position) fragCoord: vec4<f32>,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>
) -> @location(0) vec4<f32> {
  var N = vVisNormal / max(length(vVisNormal), 1e-4);
  if (!frontFacing) { N = -N; }
  let V = (aura.u_cameraPosition - vVisWorld) / max(length(aura.u_cameraPosition - vVisWorld), 1e-4);
  let albedo = aura.u_causticsColor;
  let lit = a3dDirect(N, V, albedo, aura.u_causticsRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  let t = aura.u_time * aura.u_causticsSpeed * 0.5 + 23.0;
  let uv = vVisWorld.xz / max(aura.u_causticsScale, 0.01);
  let c = visCaustic(uv, t) * 0.7 + visCaustic(uv * 1.7 + vec2<f32>(0.31), t * 1.2) * 0.45;
  let facing = smoothstep(-0.1, 0.7, N.y);
  let depthK = select(1.0, exp(-max(aura.u_causticsFade.y - vVisWorld.y, 0.0) * aura.u_causticsFade.z), aura.u_causticsFade.x > 0.5);
  let caustic = aura.u_causticsLight * c * aura.u_causticsStrength * facing * depthK;
  let linearColor = lit + caustic * (albedo * 0.6 + vec3<f32>(0.4));
  return vec4<f32>(a3dApplyEnvironmentFog(linearColor, vVisWorld, fragCoord.xy), 1.0);
}`;

/**
 * `material.caustics(options)`: a lit floor whose surface carries moving water-caustic light, projected straight down in
 * world X/Z so every receiver (sand, rock, ruins) shows the same shimmering net. It reads `uTime`, so it animates as long
 * as the app draws frames (a scene with a `uTime` custom shader is a declared time consumer on builds that include
 * `timeConsumers`; otherwise add an `app.onFrame` hook or a looping timeline).
 */
export function causticsMaterial(options: AuraCausticsMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.caustics";
  const hasSurface = options.surfaceY !== undefined;
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIT_VERTEX_GLSL, fragment: CAUSTICS_FRAGMENT_GLSL },
    wgsl: { vertex: LIT_VERTEX_WGSL, fragment: CAUSTICS_FRAGMENT_WGSL },
    uniforms: {
      causticsColor: { type: "vec3", value: [...rgb(options.color ?? "#d9c79c")] },
      causticsLight: { type: "vec3", value: [...rgb(options.causticColor ?? "#fff4d6")] },
      causticsStrength: { type: "f32", value: num(options.strength, 1.2, 0, 16, owner, "strength") },
      causticsScale: { type: "f32", value: num(options.scale, 6, 0.05, 1000, owner, "scale") },
      causticsSpeed: { type: "f32", value: num(options.speed, 1, 0, 20, owner, "speed") },
      causticsRoughness: { type: "f32", value: num(options.roughness, 0.95, 0.04, 1, owner, "roughness") },
      causticsFade: { type: "vec3", value: [hasSurface ? 1 : 0, hasSurface ? num(options.surfaceY, 0, -1e5, 1e5, owner, "surfaceY") : 0, num(options.depthFade, 0.12, 0, 4, owner, "depthFade")] }
    },
    fog: true,
    castShadow: true,
    ...(options.side === undefined ? {} : { side: options.side })
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}

/* ------------------------------------------------------------------------- */
/* material.lightBeam                                                         */
/* ------------------------------------------------------------------------- */

export interface AuraLightBeamMaterialOptions {
  /** Beam colour (default warm white). */
  readonly color?: AuraColor;
  /** Brightness multiplier (default 1). */
  readonly intensity?: number;
  /** Length of the cone along its axis, in object units: must match the cone's height (default 20). */
  readonly length?: number;
  /** How fast the beam fades from source to end (exponent, default 1). */
  readonly falloff?: number;
  /** Edge softness exponent: higher gives a brighter core and softer silhouette (default 1.3). */
  readonly edgeSoftness?: number;
  /** Dust noise strength, 0 to 1 (default 0.35). */
  readonly noise?: number;
  /** World-unit size of the dust features (default 2.5). */
  readonly noiseScale?: number;
  /** Noise drift speed (default 0.25). */
  readonly noiseSpeed?: number;
}

const LIGHT_BEAM_VERTEX_GLSL = `out vec3 vBeamWorld;
out vec3 vBeamNormal;
out float vBeamT;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vBeamWorld = world.xyz;
  vBeamNormal = normalMatrix * (mat3(instanceMatrix) * normal);
  vBeamT = clamp((0.5 * beamLength - position.y) / max(beamLength, 0.001), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const LIGHT_BEAM_FRAGMENT_GLSL = `#include <a3d_noise>
in vec3 vBeamWorld;
in vec3 vBeamNormal;
in float vBeamT;
out vec4 outColor;
void main() {
  vec3 N = normalize(vBeamNormal);
  vec3 V = normalize(cameraPosition - vBeamWorld);
  float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  float edge = pow(facing, beamShape.y);
  float axial = pow(1.0 - vBeamT, beamShape.x) * smoothstep(0.0, 0.05, vBeamT);
  vec3 q = vBeamWorld / max(beamNoise.y, 0.01) - vec3(0.0, uTime * beamNoise.z, 0.0);
  float dust = a3dFbm(q, 3);
  float density = 1.0 + (dust - 0.5) * 2.0 * beamNoise.x;
  float a = clamp(edge * axial * density * beamIntensity * 0.8, 0.0, 1.0);
  outColor = vec4(beamColor * a, a);
}`;

const LIGHT_BEAM_VERTEX_WGSL = /* wgsl */ `/* @aura3d-bindings */
${WGSL_VIS_CLIP}
struct BeamVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) vBeamWorld: vec3<f32>,
  @location(1) vBeamNormal: vec3<f32>,
  @location(2) vBeamT: f32,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(8) a_instanceMatrix0: vec4<f32>,
  @location(9) a_instanceMatrix1: vec4<f32>,
  @location(10) a_instanceMatrix2: vec4<f32>,
  @location(11) a_instanceMatrix3: vec4<f32>
) -> BeamVertexOutput {
  let inst = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * inst * vec4<f32>(a_position, 1.0);
  var out: BeamVertexOutput;
  out.vBeamWorld = world.xyz;
  out.vBeamNormal = a3dMat3Mul(aura.u_normalMatrix, a3dMat3Mul(inst, a_normal));
  out.vBeamT = clamp((0.5 * aura.u_beamLength - a_position.y) / max(aura.u_beamLength, 0.001), 0.0, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`;

const LIGHT_BEAM_FRAGMENT_WGSL = /* wgsl */ `/* @aura3d-bindings */
${WGSL_VIS_NOISE_3D}
fn a3dBeamPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
@fragment fn fs_main(
  @location(0) vBeamWorld: vec3<f32>,
  @location(1) vBeamNormal: vec3<f32>,
  @location(2) vBeamT: f32
) -> @location(0) vec4<f32> {
  let N = vBeamNormal / max(length(vBeamNormal), 1e-4);
  let V = (aura.u_cameraPosition - vBeamWorld) / max(length(aura.u_cameraPosition - vBeamWorld), 1e-4);
  let facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  let edge = a3dBeamPow(facing, aura.u_beamShape.y);
  let axial = a3dBeamPow(1.0 - vBeamT, aura.u_beamShape.x) * smoothstep(0.0, 0.05, vBeamT);
  let q = vBeamWorld / max(aura.u_beamNoise.y, 0.01) - vec3<f32>(0.0, aura.u_time * aura.u_beamNoise.z, 0.0);
  let dust = a3dFbm3(q, 3);
  let density = 1.0 + (dust - 0.5) * 2.0 * aura.u_beamNoise.x;
  let a = clamp(edge * axial * density * aura.u_beamIntensity * 0.8, 0.0, 1.0);
  return vec4<f32>(aura.u_beamColor * a, a);
}`;

/**
 * `material.lightBeam(options)`: additive soft beam for an open cone or cylinder whose axis is the mesh's local Y with the
 * source at +Y (`effects.volumetricBeam` builds that mesh for you). Brightness is strongest where the surface faces the
 * camera, so the silhouette dissolves instead of showing a hard cone edge; a drifting dust noise breaks up the shaft.
 */
export function lightBeamMaterial(options: AuraLightBeamMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.lightBeam";
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIGHT_BEAM_VERTEX_GLSL, fragment: LIGHT_BEAM_FRAGMENT_GLSL },
    wgsl: { vertex: LIGHT_BEAM_VERTEX_WGSL, fragment: LIGHT_BEAM_FRAGMENT_WGSL },
    uniforms: {
      beamColor: { type: "vec3", value: [...rgb(options.color ?? "#fff1c9")] },
      beamIntensity: { type: "f32", value: num(options.intensity, 1, 0, 32, owner, "intensity") },
      beamLength: { type: "f32", value: num(options.length, 20, 0.01, 1e5, owner, "length") },
      beamShape: { type: "vec2", value: [num(options.falloff, 1.0, 0.05, 16, owner, "falloff"), num(options.edgeSoftness, 1.3, 0.1, 16, owner, "edgeSoftness")] },
      beamNoise: { type: "vec3", value: [num(options.noise, 0.35, 0, 1, owner, "noise"), num(options.noiseScale, 2.5, 0.01, 1000, owner, "noiseScale"), num(options.noiseSpeed, 0.25, 0, 20, owner, "noiseSpeed")] }
    },
    transparent: true,
    blending: "additive",
    depthWrite: false,
    side: "double",
    fog: false
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}
