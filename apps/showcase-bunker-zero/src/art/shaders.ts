/**
 * Bunker Zero — paired GLSL 300 es + WGSL custom materials & procedural flipbook shaders (WP-10).
 *
 * Every custom material ships both `glsl` and `wgsl` stages using Aura3D 5.5.1's dual-backend
 * conventions (`a3dRasterPosition`, `aura.u_<uniform>`, `u_<tex>Texture` + `u_<tex>Sampler`)
 * so `backend: "auto"` renders identically on WebGPU and WebGL2.
 */
import { material } from "@aura3d/engine";
import {
  dualAnimatedWaterSpec,
  dualEnergyFieldSpec,
  type CustomMaterialSpec
} from "../../../showcase-port-shared/dual-shaders";
import { createFlipbookAtlas, type FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";
import { WGSL_CLIP, WGSL_COLOR, WGSL_MATH, wgslStage } from "../../../showcase-port-shared/wgsl-twins";

const FLIPBOOK_VARYING_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FLIPBOOK_VARYING_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct DualVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> DualVarying {
  var out: DualVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BZ_MUZZLE_ATLAS: FlipbookAtlasSpec = createFlipbookAtlas("muzzle", [255, 216, 134]);
export const BZ_SPARKS_ATLAS: FlipbookAtlasSpec = createFlipbookAtlas("sparks", [255, 196, 98]);

/** Security laser containment field across locked bunker lift shutters (paired GLSL + WGSL). */
export function bunkerExitLaserMaterial() {
  return material.custom(dualEnergyFieldSpec({
    coreColor: [0.92, 0.18, 0.07],
    edgeColor: [1.0, 0.68, 0.22],
    pulseSpeed: 3.4,
    scanScale: 18.0,
    opacity: 0.62
  }));
}

/** Superheated reactor vent containment shield around the Iron Warden while vulnerable (paired GLSL + WGSL). */
export function bunkerWardenVentMaterial() {
  return material.custom(dualEnergyFieldSpec({
    coreColor: [1.0, 0.3, 0.06],
    edgeColor: [1.0, 0.84, 0.34],
    pulseSpeed: 5.2,
    scanScale: 12.0,
    opacity: 0.68
  }));
}

/** Subterranean damp cellar water seepage shimmer on flooded floors (paired GLSL + WGSL). */
export function bunkerDampSeepageMaterial() {
  return material.custom(dualAnimatedWaterSpec({
    deepColor: [0.02, 0.06, 0.06],
    shallowColor: [0.07, 0.17, 0.16],
    foamColor: [0.34, 0.56, 0.52],
    sunDir: [0.22, 0.92, 0.31],
    waveScale: 2.2,
    waveSpeed: 0.72,
    opacity: 0.68
  }));
}

/** Paired GLSL + WGSL animated 8x4 sprite-sheet flipbook shader driven by `uTime` / `aura.u_time`. */
export function dualFlipbookSheetSpec(
  atlas: FlipbookAtlasSpec,
  options: {
    readonly tint?: readonly [number, number, number];
    readonly emissiveGain?: number;
    readonly frameRate?: number;
    readonly phaseOffset?: number;
  } = {}
): CustomMaterialSpec {
  const tint = options.tint ?? [1.0, 0.88, 0.62];
  const emissiveGain = options.emissiveGain ?? 2.6;
  const frameRate = options.frameRate ?? 42;
  const phaseOffset = options.phaseOffset ?? 0;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec4 sampleFlipCell(float idx, vec2 uv) {
  float col = mod(idx, 8.0);
  float row = floor(idx / 8.0);
  vec2 cellUv = (vec2(col, row) + clamp(uv, 0.02, 0.98)) / vec2(8.0, 4.0);
  return texture(atlasMap, cellUv);
}
void main() {
  float cyc = fract(uTime * frameRate / 32.0 + phaseOffset);
  float f = cyc * 31.0;
  float f0 = floor(f);
  float f1 = min(31.0, f0 + 1.0);
  vec4 s0 = sampleFlipCell(f0, vUv);
  vec4 s1 = sampleFlipCell(f1, vUv);
  vec4 texel = mix(s0, s1, fract(f));
  float alpha = texel.a;
  if (alpha < 0.02) discard;
  vec3 col = srgbToLin(texel.rgb) * tintColor * emissiveGain;
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_COLOR], /* wgsl */ `
fn sampleFlipCell(idx: f32, uv: vec2<f32>) -> vec4<f32> {
  let col = idx - floor(idx / 8.0) * 8.0;
  let row = floor(idx / 8.0);
  let cellUv = (vec2<f32>(col, row) + clamp(uv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(8.0, 4.0);
  return textureSample(u_atlasMapTexture, u_atlasMapSampler, cellUv);
}
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let cyc = fract(aura.u_time * aura.u_frameRate / 32.0 + aura.u_phaseOffset);
  let f = cyc * 31.0;
  let f0 = floor(f);
  let f1 = min(31.0, f0 + 1.0);
  let s0 = sampleFlipCell(f0, vUv);
  let s1 = sampleFlipCell(f1, vUv);
  let texel = mix(s0, s1, fract(f));
  let alpha = texel.a;
  if (alpha < 0.02) { discard; }
  let col = a3dSrgbToLinear(texel.rgb) * aura.u_tintColor * aura.u_emissiveGain;
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: FLIPBOOK_VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: FLIPBOOK_VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      atlasMap: { type: "texture2d", value: atlas.texture },
      tintColor: { type: "color3", value: [...tint] },
      emissiveGain: { type: "f32", value: emissiveGain },
      frameRate: { type: "f32", value: frameRate },
      phaseOffset: { type: "f32", value: phaseOffset }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export function bunkerMuzzleFlipbookMaterial() {
  return material.custom(dualFlipbookSheetSpec(BZ_MUZZLE_ATLAS, {
    tint: [1.0, 0.86, 0.56],
    emissiveGain: 3.1,
    frameRate: 54,
    phaseOffset: 0
  }));
}

export function bunkerRicochetSparksMaterial(slotIndex = 0) {
  return material.custom(dualFlipbookSheetSpec(BZ_SPARKS_ATLAS, {
    tint: [1.0, 0.78, 0.38],
    emissiveGain: 2.8,
    frameRate: 44,
    phaseOffset: (slotIndex * 0.23) % 1
  }));
}
