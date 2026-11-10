/**
 * Slingshot Siege — paired GLSL 300 es + WGSL custom materials (WP-12).
 *
 * Every custom material ships both `glsl` and `wgsl` stages using Aura3D 5.5.1's
 * binding conventions (`a3dRasterPosition`, `aura.u_<uniform>`, `u_<tex>Texture` +
 * `u_<tex>Sampler`) so `backend: "auto"` runs natively on WebGPU and WebGL2 with
 * identical visual output.
 */
import { material, type AuraMaterialSpec } from "@aura3d/engine";
import {
  dualAnimatedWaterSpec,
  type CustomMaterialSpec
} from "../../../showcase-port-shared/dual-shaders";
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  wgslStage
} from "../../../showcase-port-shared/wgsl-twins";
import { createFlipbookAtlas, type FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";
import { sunDirection, type ChapterLook } from "./look";

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16) || 0;
  const srgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(srgb[0]), lin(srgb[1]), lin(srgb[2])];
}

const VARYING_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const VARYING_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SiegeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> SiegeVarying {
  var out: SiegeVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** Dual-backend Gerstner-ripple + GGX sun-glitter coastal ocean surface per chapter. */
export function coastalSeaSpec(row: ChapterLook, reducedMotion: boolean): CustomMaterialSpec {
  const isNight = row.chapter === 5;
  const isWarm = row.chapter === 3 || row.chapter === 4;
  const shallow = hexToRgb(row.terrain.shallows);
  const sea = hexToRgb(row.terrain.sea);
  const deep: [number, number, number] = isNight
    ? [0.008, 0.022, 0.055]
    : [sea[0] * 0.34, sea[1] * 0.42, sea[2] * 0.56];
  const shallowTuned: [number, number, number] = isNight
    ? [0.02, 0.055, 0.11]
    : [shallow[0] * 0.92, shallow[1] * 0.95, shallow[2] * 0.98];
  const foam: [number, number, number] = isNight
    ? [0.16, 0.24, 0.38]
    : isWarm
      ? [0.98, 0.84, 0.68]
      : [0.9, 0.97, 1.0];
  const dir = sunDirection(row.sun);
  return dualAnimatedWaterSpec({
    deepColor: deep,
    shallowColor: shallowTuned,
    foamColor: foam,
    sunDir: dir,
    waveScale: 0.26,
    waveSpeed: reducedMotion ? 0.22 : 1.15,
    opacity: 0.96
  });
}

export function coastalSeaMaterial(row: ChapterLook, reducedMotion: boolean): AuraMaterialSpec {
  return material.custom(coastalSeaSpec(row, reducedMotion));
}

/** Dual-backend sun-bleached sedimentary coastal limestone strata shader (high target silhouette contrast). */
export function dualLimestoneStrataSpec(options: {
  readonly baseColor?: readonly [number, number, number];
  readonly bandColor?: readonly [number, number, number];
  readonly sunDir?: readonly [number, number, number];
  readonly sunGain?: number;
} = {}): CustomMaterialSpec {
  const baseColor = options.baseColor ?? [0.76, 0.7, 0.58];
  const bandColor = options.bandColor ?? [0.56, 0.5, 0.41];
  const sunDir = options.sunDir ?? [-0.8, 0.53, 0.27];
  const sunGain = options.sunGain ?? 1.0;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(sunDir);
  vec3 V = normalize(cameraPosition - vWorld);
  float warp = vnoise(vWorld.xz * 0.65) * 0.55;
  float strata = 0.5 + 0.5 * sin((vWorld.y * 5.2 + warp) * 3.14159);
  float grain = vnoise(vWorld.xy * 3.8);
  vec3 rock = mix(bandColor, baseColor, smoothstep(0.22, 0.78, strata * 0.78 + grain * 0.22));
  float upCap = smoothstep(0.55, 0.92, N.y);
  rock = mix(rock, baseColor * 1.08, upCap * 0.35);
  float ndotl = max(dot(N, L), 0.0);
  float hemi = 0.42 + 0.18 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.14;
  vec3 lit = rock * (hemi + ndotl * 0.68 * sunGain) + baseColor * rim;
  outColor = vec4(lit, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let _uv = vUv;
  let N = a3dSafeNormalize3(vNormal, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let warp = a3dValueNoise2(vWorld.xz * 0.65) * 0.55;
  let strata = 0.5 + 0.5 * sin((vWorld.y * 5.2 + warp) * 3.14159);
  let grain = a3dValueNoise2(vWorld.xy * 3.8);
  var rock = mix(aura.u_bandColor, aura.u_baseColor, smoothstep(0.22, 0.78, strata * 0.78 + grain * 0.22));
  let upCap = smoothstep(0.55, 0.92, N.y);
  rock = mix(rock, aura.u_baseColor * 1.08, upCap * 0.35);
  let ndotl = max(dot(N, L), 0.0);
  let hemi = 0.42 + 0.18 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.14;
  let lit = rock * (hemi + ndotl * 0.68 * aura.u_sunGain) + aura.u_baseColor * rim;
  let fogged = a3dApplyEnvironmentFog(lit, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      baseColor: { type: "color3", value: [...baseColor] },
      bandColor: { type: "color3", value: [...bandColor] },
      sunDir: { type: "vec3", value: [...sunDir] },
      sunGain: { type: "f32", value: sunGain }
    },
    fog: true
  };
}

export function limestoneCliffMaterial(row: ChapterLook): AuraMaterialSpec {
  const isNight = row.chapter === 5;
  const base = isNight ? [0.16, 0.2, 0.3] as const : hexToRgb(row.terrain.chalk);
  const band = isNight ? [0.09, 0.12, 0.2] as const : hexToRgb("#b8ae99");
  return material.custom(dualLimestoneStrataSpec({
    baseColor: base,
    bandColor: band,
    sunDir: sunDirection(row.sun),
    sunGain: isNight ? 0.55 : 1.05
  }));
}

/** Dual-backend strain-colored braided elastic slingshot band ribbon shader. */
export function dualElasticBandSpec(options: {
  readonly restColor?: readonly [number, number, number];
  readonly hotColor?: readonly [number, number, number];
  readonly strain?: number;
} = {}): CustomMaterialSpec {
  const restColor = options.restColor ?? hexToRgb("#d94f30");
  const hotColor = options.hotColor ?? [1.0, 0.72, 0.18];
  const strain = options.strain ?? 0;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float s = clamp(strain, 0.0, 1.0);
  float braid = 0.88 + 0.12 * sin(vUv.y * 44.0 + vUv.x * 9.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  vec3 tint = mix(restColor, hotColor, smoothstep(0.15, 0.95, s));
  vec3 lit = tint * braid * (0.68 + 0.34 * max(N.y, 0.0)) + hotColor * (rim * (0.18 + 0.55 * s) + s * 0.22);
  outColor = vec4(lit, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let N = a3dSafeNormalize3(vNormal, vec3<f32>(0.0, 1.0, 0.0));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let s = clamp(aura.u_strain, 0.0, 1.0);
  let braid = 0.88 + 0.12 * sin(vUv.y * 44.0 + vUv.x * 9.0);
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 2.4);
  let tint = mix(aura.u_restColor, aura.u_hotColor, smoothstep(0.15, 0.95, s));
  let lit = tint * braid * (0.68 + 0.34 * max(N.y, 0.0)) + aura.u_hotColor * (rim * (0.18 + 0.55 * s) + s * 0.22);
  let fogged = a3dApplyEnvironmentFog(lit, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      restColor: { type: "color3", value: [...restColor] },
      hotColor: { type: "color3", value: [...hotColor] },
      strain: { type: "f32", value: strain }
    },
    fog: true
  };
}

export function elasticBandMaterial(baseHex: string, strain = 0): AuraMaterialSpec {
  return material.custom(dualElasticBandSpec({ restColor: hexToRgb(baseHex), strain }));
}

/** Dual-backend predictive parabolic trajectory ribbon shader with animated ballistic flow pulse. */
export function dualTrajectoryRibbonSpec(options: {
  readonly arcColor?: readonly [number, number, number];
  readonly pulseSpeed?: number;
} = {}): CustomMaterialSpec {
  const arcColor = options.arcColor ?? [1.0, 0.88, 0.48];
  const pulseSpeed = options.pulseSpeed ?? 2.8;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  float edge = 1.0 - smoothstep(0.18, 0.5, abs(vUv.y - 0.5));
  float tip = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
  float flow = 0.72 + 0.28 * sin(vWorld.x * 2.4 - uTime * pulseSpeed * 3.2);
  float core = smoothstep(0.32, 0.0, abs(vUv.y - 0.5));
  vec3 col = mix(arcColor, vec3(1.0, 0.99, 0.92), core * 0.65) * (1.25 * flow);
  float alpha = clamp(edge * tip * 0.92, 0.0, 1.0);
  if (alpha < 0.03) discard;
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let edge = 1.0 - smoothstep(0.18, 0.5, abs(vUv.y - 0.5));
  let tip = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
  let flow = 0.72 + 0.28 * sin(vWorld.x * 2.4 - aura.u_time * aura.u_pulseSpeed * 3.2);
  let core = smoothstep(0.32, 0.0, abs(vUv.y - 0.5));
  let col = mix(aura.u_arcColor, vec3<f32>(1.0, 0.99, 0.92), core * 0.65) * (1.25 * flow);
  let alpha = clamp(edge * tip * 0.92, 0.0, 1.0);
  if (alpha < 0.03) { discard; }
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      arcColor: { type: "color3", value: [...arcColor] },
      pulseSpeed: { type: "f32", value: pulseSpeed }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export function trajectoryRibbonMaterial(ammoHex = "#ffe699", pulseSpeed = 2.8): AuraMaterialSpec {
  return material.custom(dualTrajectoryRibbonSpec({ arcColor: hexToRgb(ammoHex), pulseSpeed }));
}

/** Shared procedural 8x4 RGBA8 flipbook atlases (masonry dust plumes & blast sparks). */
export const SIEGE_DUST_ATLAS: FlipbookAtlasSpec = createFlipbookAtlas("dust", [228, 214, 190]);
export const SIEGE_SPARKS_ATLAS: FlipbookAtlasSpec = createFlipbookAtlas("sparks", [255, 198, 96]);

/** Dual-backend 8x4 (32-frame) sprite-sheet flipbook burst shader reading a `createFlipbookAtlas` texture. */
export function dualFlipbookBurstSpec(
  atlas: FlipbookAtlasSpec,
  options: {
    readonly tint?: readonly [number, number, number];
    readonly emissiveGain?: number;
    readonly progress?: number;
  } = {}
): CustomMaterialSpec {
  const tint = options.tint ?? [1, 1, 1];
  const emissiveGain = options.emissiveGain ?? 1.0;
  const progress = options.progress ?? 0;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec4 sampleFrame(float idx, vec2 uv) {
  float col = mod(idx, 8.0);
  float row = floor(idx / 8.0);
  vec2 cellUv = (vec2(col, row) + clamp(uv, 0.02, 0.98)) / vec2(8.0, 4.0);
  return texture(atlasMap, cellUv);
}
void main() {
  float p = clamp(progress, 0.0, 0.999);
  float f = p * 31.0;
  float f0 = floor(f);
  float f1 = min(31.0, f0 + 1.0);
  vec4 s0 = sampleFrame(f0, vUv);
  vec4 s1 = sampleFrame(f1, vUv);
  vec4 texel = mix(s0, s1, fract(f));
  float alpha = texel.a * (1.0 - smoothstep(0.78, 1.0, p));
  if (alpha < 0.02) discard;
  vec3 col = srgbToLin(texel.rgb) * tintColor * emissiveGain;
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_COLOR], /* wgsl */ `
fn sampleFlipFrame(idx: f32, uv: vec2<f32>) -> vec4<f32> {
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
  let p = clamp(aura.u_progress, 0.0, 0.999);
  let f = p * 31.0;
  let f0 = floor(f);
  let f1 = min(31.0, f0 + 1.0);
  let s0 = sampleFlipFrame(f0, vUv);
  let s1 = sampleFlipFrame(f1, vUv);
  let texel = mix(s0, s1, fract(f));
  let alpha = texel.a * (1.0 - smoothstep(0.78, 1.0, p));
  if (alpha < 0.02) { discard; }
  let col = a3dSrgbToLinear(texel.rgb) * aura.u_tintColor * aura.u_emissiveGain;
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      atlasMap: { type: "texture2d", value: atlas.texture },
      tintColor: { type: "color3", value: [...tint] },
      emissiveGain: { type: "f32", value: emissiveGain },
      progress: { type: "f32", value: progress }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export function masonryPlumeMaterial(progress = 0): AuraMaterialSpec {
  return material.custom(dualFlipbookBurstSpec(SIEGE_DUST_ATLAS, {
    tint: [0.92, 0.87, 0.78],
    emissiveGain: 0.95,
    progress
  }));
}

export function blastSparksMaterial(progress = 0): AuraMaterialSpec {
  return material.custom(dualFlipbookBurstSpec(SIEGE_SPARKS_ATLAS, {
    tint: [1.0, 0.78, 0.36],
    emissiveGain: 1.85,
    progress
  }));
}
