/**
 * Paired GLSL 300 es + WGSL `material.custom` presets for Aura3D 5.5.1 showcase games.
 * Every preset provides BOTH `glsl` and `wgsl` stages using Aura3D's exact uniform & clip-space
 * binding rules so `backend: "auto"` runs natively on WebGPU with zero WebGL2 fallback warnings.
 *
 * IMPORTANT Aura3D `material.custom` rules:
 *   1. Never redeclare `uniform ...` in GLSL source for entries already in `spec.uniforms` (the engine prelude injects them).
 *   2. In WGSL (`/* @aura3d-bindings * /`), scalar/vector uniforms from `spec.uniforms` live on `aura.u_<name>`,
 *      textures live on `u_<name>Texture` + `u_<name>Sampler`, and vertex clip positions wrap in `a3dRasterPosition(...)`.
 */
import type { material, texture } from "@aura3d/engine";
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  WGSL_PBR_MICRO,
  WGSL_TOON,
  wgslStage
} from "./wgsl-twins";

export type CustomMaterialSpec = Parameters<typeof material.custom>[0];
type TextureRef = ReturnType<typeof texture.data>;

const STANDARD_VARYING_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const STANDARD_VARYING_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
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

export interface DualCelRimOptions {
  readonly baseColor?: readonly [number, number, number];
  readonly rimColor?: readonly [number, number, number];
  readonly emissive?: readonly [number, number, number];
  readonly shadowFloor?: number;
  readonly rimWidth?: number;
  readonly sunDir?: readonly [number, number, number];
}

/** Crisp Blender-Eevee-style 2-band cel shader with anti-aliased `fwidth` terminator, Fresnel rim, and highlight shoulder. */
export function dualCelRimSpec(options: DualCelRimOptions = {}): CustomMaterialSpec {
  const baseColor = options.baseColor ?? [0.85, 0.32, 0.18];
  const rimColor = options.rimColor ?? [1.0, 0.86, 0.62];
  const emissive = options.emissive ?? [0, 0, 0];
  const shadowFloor = options.shadowFloor ?? 0.58;
  const rimWidth = options.rimWidth ?? 0.28;
  const sunDir = options.sunDir ?? [0.45, 0.82, 0.35];

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(sunDir);
  float c = dot(N, L) * 0.5 + 0.5;
  float fw = fwidth(c) * 0.6 + 1e-4;
  float band = mix(shadowFloor, 1.0, smoothstep(0.56 - fw, 0.56 + fw, c));
  float rimRaw = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  float rimFw = fwidth(rimRaw) * 0.5 + 1e-4;
  float edge = clamp(1.0 - rimWidth, 0.05, 0.98);
  float rim = mix(pow(rimRaw, 3.0), smoothstep(edge - rimFw, edge + rimFw, rimRaw), 0.65);
  vec3 hemi = mix(vec3(0.16, 0.21, 0.34), vec3(0.96, 0.98, 1.0), 0.5 * N.y + 0.5) * 0.42;
  vec3 lit = baseColor * (hemi + vec3(0.76) * band) + rimColor * (rim * 0.45) + emissive;
  float k = 0.84;
  vec3 over = max(lit - vec3(k), vec3(0.0));
  vec3 rolled = min(lit, vec3(k)) + (1.0 - k) * (vec3(1.0) - exp(-over / (1.0 - k)));
  outColor = vec4(rolled, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_TOON], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _uv = vUv;
  var N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let band = a3dToonRamp(dot(N, L), 0.56, aura.u_shadowFloor);
  let rim = a3dToonRim(N, V, aura.u_rimWidth, 3.0);
  let hemi = mix(vec3<f32>(0.16, 0.21, 0.34), vec3<f32>(0.96, 0.98, 1.0), 0.5 * N.y + 0.5) * 0.42;
  let lit = aura.u_baseColor * (hemi + vec3<f32>(0.76) * band) + aura.u_rimColor * (rim * 0.45) + aura.u_emissive;
  return vec4<f32>(a3dHighlightShoulder(lit, 0.84), 1.0);
}`);

  return {
    glsl: { vertex: STANDARD_VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      baseColor: { type: "color3", value: [...baseColor] },
      rimColor: { type: "color3", value: [...rimColor] },
      emissive: { type: "color3", value: [...emissive] },
      sunDir: { type: "vec3", value: [...sunDir] },
      shadowFloor: { type: "f32", value: shadowFloor },
      rimWidth: { type: "f32", value: rimWidth }
    }
  };
}

export interface DualEnergyFieldOptions {
  readonly coreColor?: readonly [number, number, number];
  readonly edgeColor?: readonly [number, number, number];
  readonly pulseSpeed?: number;
  readonly scanScale?: number;
  readonly opacity?: number;
}

/** Translucent Fresnel + animated scanline energy barrier / shield / portal shader (paired GLSL + WGSL). */
export function dualEnergyFieldSpec(options: DualEnergyFieldOptions = {}): CustomMaterialSpec {
  const coreColor = options.coreColor ?? [0.12, 0.68, 1.0];
  const edgeColor = options.edgeColor ?? [0.55, 0.95, 1.0];
  const pulseSpeed = options.pulseSpeed ?? 2.6;
  const scanScale = options.scanScale ?? 14.0;
  const opacity = options.opacity ?? 0.62;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(N, V)), 2.4);
  float scan = 0.5 + 0.5 * sin(vWorld.y * scanScale - uTime * pulseSpeed + vUv.x * 6.2831853);
  float band = smoothstep(0.35, 0.95, scan);
  vec3 col = mix(coreColor, edgeColor, clamp(fresnel * 0.85 + band * 0.35, 0.0, 1.0)) * (1.15 + fresnel * 1.4);
  float alpha = clamp(opacity * (0.28 + fresnel * 0.72 + band * 0.18), 0.05, 0.96);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let fresnel = a3dPow(1.0 - abs(dot(N, V)), 2.4);
  let scan = 0.5 + 0.5 * sin(vWorld.y * aura.u_scanScale - aura.u_time * aura.u_pulseSpeed + vUv.x * 6.2831853);
  let band = smoothstep(0.35, 0.95, scan);
  let col = mix(aura.u_coreColor, aura.u_edgeColor, clamp(fresnel * 0.85 + band * 0.35, 0.0, 1.0)) * (1.15 + fresnel * 1.4);
  let alpha = clamp(aura.u_opacity * (0.28 + fresnel * 0.72 + band * 0.18), 0.05, 0.96);
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: STANDARD_VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      coreColor: { type: "color3", value: [...coreColor] },
      edgeColor: { type: "color3", value: [...edgeColor] },
      pulseSpeed: { type: "f32", value: pulseSpeed },
      scanScale: { type: "f32", value: scanScale },
      opacity: { type: "f32", value: opacity }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export interface DualAnimatedWaterOptions {
  readonly deepColor?: readonly [number, number, number];
  readonly shallowColor?: readonly [number, number, number];
  readonly foamColor?: readonly [number, number, number];
  readonly sunDir?: readonly [number, number, number];
  readonly waveScale?: number;
  readonly waveSpeed?: number;
  readonly opacity?: number;
}

/** Dual-backend Gerstner-ripple & GGX sun-glitter water surface with environment fog support. */
export function dualAnimatedWaterSpec(options: DualAnimatedWaterOptions = {}): CustomMaterialSpec {
  const deepColor = options.deepColor ?? [0.03, 0.14, 0.26];
  const shallowColor = options.shallowColor ?? [0.08, 0.42, 0.54];
  const foamColor = options.foamColor ?? [0.88, 0.95, 1.0];
  const sunDir = options.sunDir ?? [0.42, 0.78, 0.46];
  const waveScale = options.waveScale ?? 0.35;
  const waveSpeed = options.waveSpeed ?? 1.35;
  const opacity = options.opacity ?? 0.92;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vWorld.xz * waveScale;
  float t = uTime * waveSpeed;
  float n1 = vnoise(p + vec2(t * 0.45, -t * 0.31));
  float n2 = vnoise(p * 2.13 - vec2(t * 0.62, t * 0.48));
  float crest = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 1.0);
  vec3 N = normalize(vec3((n1 - 0.5) * 0.28, 1.0, (n2 - 0.5) * 0.28));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 5.0);
  float spec = pow(max(dot(N, H), 0.0), 96.0) * 1.85;
  float foam = smoothstep(0.74, 0.92, crest);
  vec3 body = mix(deepColor, shallowColor, clamp(crest * 0.7 + fresnel * 0.5, 0.0, 1.0));
  vec3 col = mix(body, foamColor, foam * 0.55) + foamColor * spec + vec3(0.45, 0.65, 0.88) * (fresnel * 0.42);
  outColor = vec4(col, opacity);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_PBR_MICRO, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _uv = vUv;
  let p = vWorld.xz * aura.u_waveScale;
  let t = aura.u_time * aura.u_waveSpeed;
  let n1 = a3dValueNoise2(p + vec2<f32>(t * 0.45, -t * 0.31));
  let n2 = a3dValueNoise2(p * 2.13 - vec2<f32>(t * 0.62, t * 0.48));
  let crest = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 1.0);
  let N = normalize(vec3<f32>((n1 - 0.5) * 0.28, 1.0, (n2 - 0.5) * 0.28));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let fresnel = a3dFresnelSchlick(max(dot(N, V), 0.0), vec3<f32>(0.02)).x;
  let spec = a3dPow(max(dot(N, H), 0.0), 96.0) * 1.85;
  let foam = smoothstep(0.74, 0.92, crest);
  let body = mix(aura.u_deepColor, aura.u_shallowColor, clamp(crest * 0.7 + fresnel * 0.5, 0.0, 1.0));
  let col = mix(body, aura.u_foamColor, foam * 0.55) + aura.u_foamColor * spec + vec3<f32>(0.45, 0.65, 0.88) * (fresnel * 0.42);
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, aura.u_opacity);
}`);

  return {
    glsl: { vertex: STANDARD_VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      deepColor: { type: "color3", value: [...deepColor] },
      shallowColor: { type: "color3", value: [...shallowColor] },
      foamColor: { type: "color3", value: [...foamColor] },
      sunDir: { type: "vec3", value: [...sunDir] },
      waveScale: { type: "f32", value: waveScale },
      waveSpeed: { type: "f32", value: waveSpeed },
      opacity: { type: "f32", value: opacity }
    },
    transparent: opacity < 1,
    fog: true
  };
}

export interface DualWetInkSurfaceOptions {
  readonly baseColor?: readonly [number, number, number];
  readonly splatMap: TextureRef;
  readonly sunDir?: readonly [number, number, number];
}

/** Dual-backend wet glossy paint/ink surface reading an RGBA8 `createGpuSplatMap` texture (`alpha` = wet ink thickness + specular lobe). */
export function dualWetInkSurfaceSpec(options: DualWetInkSurfaceOptions): CustomMaterialSpec {
  const baseColor = options.baseColor ?? [0.14, 0.16, 0.21];
  const sunDir = options.sunDir ?? [0.38, 0.84, 0.38];

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  vec4 splat = texture(splatMap, vUv);
  float inkMask = clamp(splat.a, 0.0, 1.0);
  vec3 inkLinear = srgbToLin(splat.rgb);
  float dx = dFdx(inkMask);
  float dy = dFdy(inkMask);
  vec3 N = normalize(vNormal + vec3(-dx * 2.4, 0.0, -dy * 2.4));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float ndotl = max(dot(N, L), 0.0);
  float specPower = mix(18.0, 128.0, inkMask);
  float specStrength = mix(0.08, 1.15, inkMask);
  float spec = pow(max(dot(N, H), 0.0), specPower) * specStrength;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * inkMask * 0.35;
  vec3 albedo = mix(baseColor, inkLinear, inkMask);
  vec3 lit = albedo * (0.34 + 0.72 * ndotl) + vec3(1.0, 0.98, 0.95) * spec + inkLinear * rim;
  outColor = vec4(lit, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let splat = textureSample(u_splatMapTexture, u_splatMapSampler, vUv);
  let inkMask = clamp(splat.a, 0.0, 1.0);
  let inkLinear = a3dSrgbToLinear(splat.rgb);
  let dx = dpdx(inkMask);
  let dy = dpdy(inkMask);
  let N = normalize(vNormal + vec3<f32>(-dx * 2.4, 0.0, -dy * 2.4));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let ndotl = max(dot(N, L), 0.0);
  let specPower = mix(18.0, 128.0, inkMask);
  let specStrength = mix(0.08, 1.15, inkMask);
  let spec = a3dPow(max(dot(N, H), 0.0), specPower) * specStrength;
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 4.0) * inkMask * 0.35;
  let albedo = mix(aura.u_baseColor, inkLinear, inkMask);
  let lit = albedo * (0.34 + 0.72 * ndotl) + vec3<f32>(1.0, 0.98, 0.95) * spec + inkLinear * rim;
  return vec4<f32>(lit, 1.0);
}`);

  return {
    glsl: { vertex: STANDARD_VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      baseColor: { type: "color3", value: [...baseColor] },
      sunDir: { type: "vec3", value: [...sunDir] },
      splatMap: { type: "texture2d", value: options.splatMap }
    }
  };
}
