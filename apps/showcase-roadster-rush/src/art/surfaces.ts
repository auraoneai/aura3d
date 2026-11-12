/**
 * GU47 AO-M2 / WP-06: CC0 deck surfaces + dual-backend wet-shoulder & tire-polished wheel-rut micro-roughness shader.
 * ambientCG Asphalt033 and Concrete034 (CC0 1.0), downscaled to 512 px JPEG (quality 82); provenance in ../assets/textures/PROVENANCE.md.
 */
import { defineAuraAssets, material, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_COLOR, WGSL_MATH, WGSL_NOISE, wgslStage } from "./wgsl";

type TextureAsset = AuraAssetDefinition & { readonly type: "texture"; readonly format: "jpg"; readonly url: string };
type CustomSpec = Parameters<typeof material.custom>[0];

const meta = (source: string) => ({ license: "CC0-1.0", author: "ambientCG", provenance: { sourceUrl: "https://ambientcg.com", source } });

const definitions = {
  apexAsphaltColor: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-color.jpg", import.meta.url).pathname, sha256: "0787c5cc9abc58c26f42c0afa90203a925c1466bcfad5cf7eed384557efaa7d0", sizeBytes: 59218, metadata: meta("Asphalt033_1K-JPG_Color.jpg") },
  apexAsphaltNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-normal.jpg", import.meta.url).pathname, sha256: "e5a3f5a7b83066d417b55bb7bdc3d3b9a0662d7848a4efc47523c217ac48c491", sizeBytes: 115838, metadata: meta("Asphalt033_1K-JPG_NormalGL.jpg") },
  apexAsphaltRoughness: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-roughness.jpg", import.meta.url).pathname, sha256: "9b780fcba11cb43d325c4841566ca2cbdd8f4767fe17da0eddec31a23e4205f1", sizeBytes: 96620, metadata: meta("Asphalt033_1K-JPG_Roughness.jpg") },
  apexConcreteColor: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-concrete-color.jpg", import.meta.url).pathname, sha256: "a39ab497a85fce1b3db72d12d00673a527ee72d4c7da041263c9b5956ce37a9a", sizeBytes: 27062, metadata: meta("Concrete034_1K-JPG_Color.jpg") },
  apexConcreteNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-concrete-normal.jpg", import.meta.url).pathname, sha256: "383c4b61979db2cfecd92944d05f6cd68f95dd676c06e970d7b18d74026e4d4a", sizeBytes: 39313, metadata: meta("Concrete034_1K-JPG_NormalGL.jpg") }
} satisfies Record<string, TextureAsset>;

export const surfaces: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/** Deck tiling (AO-M2): 6 x 95 repeats over the 24 x 380 m deck, i.e. one 4 m tile. */
export const ASPHALT_REPEAT: readonly [number, number] = [6, 95];
export const ASPHALT_ROUGHNESS = 0.4;
/** Barrier tiling along the 380 m run. */
export const CONCRETE_REPEAT: readonly [number, number] = [95, 1];

/** The PBR deck: coarse aggregate asphalt with subtle damp clearcoat sheen so cascaded PCSS shadows and SSR ground every car. */
export function asphaltMaterial(): ReturnType<typeof material.pbr> {
  const scale = ASPHALT_REPEAT;
  return material.pbr({
    color: "#5d616c",
    roughness: ASPHALT_ROUGHNESS,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.28,
    texture: surfaces.apexAsphaltColor,
    normal: surfaces.apexAsphaltNormal,
    normalScale: 0.85,
    roughnessMap: surfaces.apexAsphaltRoughness,
    texTransforms: { baseColor: { scale }, normal: { scale }, metallicRoughness: { scale } }
  });
}

/** Jersey barriers: cast weathered concrete with crisp normal relief. */
export function concreteMaterial(): ReturnType<typeof material.pbr> {
  const scale = CONCRETE_REPEAT;
  return material.pbr({
    color: "#888c96",
    roughness: 0.78,
    metalness: 0.02,
    texture: surfaces.apexConcreteColor,
    normal: surfaces.apexConcreteNormal,
    normalScale: 0.9,
    texTransforms: { baseColor: { scale }, normal: { scale } }
  });
}

/**
 * Paired GLSL 3.00 + WGSL wet-shoulder & tire-polished wheel-rut micro-roughness specular glaze (`road-wet-ruts`).
 * Models 10 polished wheel ruts across the 5 lanes (roughness ~0.20 in ruts vs ~0.66 coarse aggregate between ruts) plus
 * coastal-mist damp shoulders outside +-8.8 m, catching both the low golden-hour sun ribbon and cobalt twilight dome.
 */
const RUT_VERTEX = /* glsl */ `
out vec3 vW;
out float vDeckX;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vDeckX = position.x * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const RUT_FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <colorspace_decode>
in vec3 vW;
in float vDeckX;
out vec4 outColor;
void main() {
  // 5 highway lanes at x = -7.2, -3.6, 0.0, 3.6, 7.2 (3.6 m lane stride); dual wheel ruts at +-0.76 m per lane
  float laneCoord = (vDeckX + 9.0) / 3.6;
  float inRoad = step(abs(vDeckX), 9.1);
  float laneCenterDist = (fract(laneCoord) - 0.5) * 3.6;
  float rutMask = exp(-pow((abs(laneCenterDist) - 0.76) / 0.34, 2.0)) * inRoad;
  float shoulderWet = smoothstep(8.4, 9.6, abs(vDeckX)) * (1.0 - smoothstep(10.3, 10.7, abs(vDeckX)));
  float worldZ = vW.z + roadScrollZ;
  float aggregate = a3dValueNoise(vec2(vDeckX * 3.4, worldZ * 0.85));
  float patchWet = smoothstep(0.38, 0.78, a3dValueNoise(vec2(vDeckX * 0.42, worldZ * 0.055)));
  float polish = a3dSaturate(rutMask * (0.68 + 0.32 * patchWet) + shoulderWet * (0.55 + 0.45 * patchWet));
  float rough = mix(0.66, 0.20, polish);

  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.2, 1.0));
  vec3 n = a3dSafeNormalize(vec3((aggregate - 0.5) * 0.035 * (1.0 - polish * 0.6), 1.0, 0.0), vec3(0.0, 1.0, 0.0));
  vec3 l = a3dSafeNormalize(rutSunDir, vec3(0.0, 0.14, -0.99));
  vec3 h = a3dSafeNormalize(v + l, vec3(0.0, 1.0, 0.0));
  float specExp = mix(18.0, 140.0, 1.0 - rough);
  float sunSpec = pow(max(dot(n, h), 0.0), specExp) * (0.18 + 1.45 * polish) * rutSunGain;
  float fresnel = pow(1.0 - a3dSaturate(dot(n, v)), 4.0);
  vec3 skyCol = a3dSrgbToLinear(rutSkyColor) * fresnel * (0.16 + 0.72 * polish);
  vec3 sunCol = a3dSrgbToLinear(rutSunColor) * sunSpec;

  float dist = length(cameraPosition - vW);
  float fade = (1.0 - smoothstep(85.0, 215.0, dist)) * smoothstep(2.0, 8.0, dist);
  vec3 glaze = (skyCol + sunCol) * fade * polish;
  outColor = vec4(a3dFinite(glaze), 1.0);
}`;

const RUT_WGSL_VERTEX = wgslStage([WGSL_CLIP], /* wgsl */ `
struct RutVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) w: vec3<f32>,
  @location(1) deckX: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> RutVarying {
  var out: RutVarying;
  let w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.w = w.xyz;
  out.deckX = a_position.x * length(aura.u_modelMatrix[0].xyz);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * w);
  return out;
}`);

const RUT_WGSL_FRAGMENT = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>, @location(1) vDeckX: f32) -> @location(0) vec4<f32> {
  let laneCoord = (vDeckX + 9.0) / 3.6;
  let inRoad = step(abs(vDeckX), 9.1);
  let laneCenterDist = (fract(laneCoord) - 0.5) * 3.6;
  let dRut = (abs(laneCenterDist) - 0.76) / 0.34;
  let rutMask = exp(-(dRut * dRut)) * inRoad;
  let shoulderWet = smoothstep(8.4, 9.6, abs(vDeckX)) * (1.0 - smoothstep(10.3, 10.7, abs(vDeckX)));
  let worldZ = vW.z + aura.u_roadScrollZ;
  let aggregate = a3dValueNoise2(vec2<f32>(vDeckX * 3.4, worldZ * 0.85));
  let patchWet = smoothstep(0.38, 0.78, a3dValueNoise2(vec2<f32>(vDeckX * 0.42, worldZ * 0.055)));
  let polish = a3dSaturate(rutMask * (0.68 + 0.32 * patchWet) + shoulderWet * (0.55 + 0.45 * patchWet));
  let rough = mix(0.66, 0.20, polish);

  let v = a3dSafeNormalize3(aura.u_cameraPosition - vW, vec3<f32>(0.0, 0.2, 1.0));
  let n = a3dSafeNormalize3(vec3<f32>((aggregate - 0.5) * 0.035 * (1.0 - polish * 0.6), 1.0, 0.0), vec3<f32>(0.0, 1.0, 0.0));
  let l = a3dSafeNormalize3(aura.u_rutSunDir, vec3<f32>(0.0, 0.14, -0.99));
  let h = a3dSafeNormalize3(v + l, vec3<f32>(0.0, 1.0, 0.0));
  let specExp = mix(18.0, 140.0, 1.0 - rough);
  let sunSpec = a3dPow(max(dot(n, h), 0.0), specExp) * (0.18 + 1.45 * polish) * aura.u_rutSunGain;
  let fresnel = a3dPow(1.0 - a3dSaturate(dot(n, v)), 4.0);
  let skyCol = a3dSrgbToLinear(aura.u_rutSkyColor) * fresnel * (0.16 + 0.72 * polish);
  let sunCol = a3dSrgbToLinear(aura.u_rutSunColor) * sunSpec;

  let dist = length(aura.u_cameraPosition - vW);
  let fade = (1.0 - smoothstep(85.0, 215.0, dist)) * smoothstep(2.0, 8.0, dist);
  let glaze = (skyCol + sunCol) * fade * polish;
  return vec4<f32>(a3dFinite3(glaze), 1.0);
}`);

export function asphaltRutSpec(): CustomSpec {
  return {
    glsl: { vertex: RUT_VERTEX, fragment: RUT_FRAGMENT },
    wgsl: { vertex: RUT_WGSL_VERTEX, fragment: RUT_WGSL_FRAGMENT },
    uniforms: {
      roadScrollZ: { type: "f32", value: 0 },
      rutSkyColor: { type: "vec3", value: [0.18, 0.36, 0.78] },
      rutSunColor: { type: "vec3", value: [1.0, 0.58, 0.26] },
      rutSunDir: { type: "vec3", value: [0.08, 0.14, -0.987] },
      rutSunGain: { type: "f32", value: 0.62 }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}
