/**
 * Paired GLSL 300 es + WGSL (`/* @aura3d-bindings * /`) custom materials for IRON CROWN (WP-09):
 *   1. `crownRuneWardMaterialSpec` — forged dark-iron & molten-gold radial rune ward inlaid into the center floor.
 *   2. `parrySlashArcMaterialSpec` — steel-clash / molten cleave / guard-parry crescent arc ribbon shader.
 *
 * Follows Aura3D 5.5.1 `material.custom` contract:
 *   - GLSL never redeclares uniforms already in `spec.uniforms`.
 *   - WGSL uses `wgslStage(...)` (`/* @aura3d-bindings * /`), `a3dRasterPosition(...)`, and `aura.u_<name>`.
 */
import type { material } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_COLOR, WGSL_MATH, WGSL_NOISE, wgslStage } from "../../../showcase-port-shared/wgsl-twins";
import type { FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";

export type CustomMaterialSpec = Parameters<typeof material.custom>[0];

const DUAL_VERTEX_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const DUAL_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct IcDualVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> IcDualVarying {
  var out: IcDualVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export interface CrownRuneWardOptions {
  readonly runeColor?: readonly [number, number, number];
  readonly emberColor?: readonly [number, number, number];
  readonly pulseSpeed?: number;
  readonly opacity?: number;
}

/** Molten forged-gold & ember radial rune seal on the arena combat floor (paired GLSL 300 es + WGSL). */
export function crownRuneWardMaterialSpec(options: CrownRuneWardOptions = {}): CustomMaterialSpec {
  const runeColor = options.runeColor ?? [0.92, 0.68, 0.24];
  const emberColor = options.emberColor ?? [0.86, 0.24, 0.14];
  const pulseSpeed = options.pulseSpeed ?? 1.45;
  const opacity = options.opacity ?? 0.58;

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
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float outerRing = smoothstep(0.032, 0.0, abs(r - 0.88));
  float innerRing = smoothstep(0.026, 0.0, abs(r - 0.62));
  float hubRing = smoothstep(0.022, 0.0, abs(r - 0.28));
  float spokeWave = abs(sin(ang * 6.0 + uTime * 0.18));
  float runeBand = smoothstep(0.64, 0.72, r) * (1.0 - smoothstep(0.80, 0.86, r));
  float glyphs = step(0.56, sin(ang * 24.0 - uTime * 0.35) * 0.5 + 0.5) * runeBand;
  float spokes = smoothstep(0.94, 0.995, spokeWave) * smoothstep(0.28, 0.34, r) * (1.0 - smoothstep(0.86, 0.90, r));
  float ember = vnoise(p * 4.5 + vec2(uTime * pulseSpeed * 0.35, -uTime * pulseSpeed * 0.25));
  float pulse = 0.72 + 0.28 * sin(uTime * pulseSpeed - r * 4.2);
  float pattern = clamp(outerRing + innerRing * 0.85 + hubRing * 0.7 + glyphs * 0.75 + spokes * 0.8, 0.0, 1.0);
  vec3 col = mix(emberColor, runeColor, clamp(0.35 + ember * 0.65, 0.0, 1.0)) * (0.95 + pulse * 0.65);
  float fadeEdge = 1.0 - smoothstep(0.92, 1.0, r);
  float alpha = clamp(pattern * opacity * fadeEdge * (0.68 + ember * 0.32), 0.0, 0.92);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let p = (vUv - vec2<f32>(0.5, 0.5)) * 2.0;
  let r = length(p);
  let ang = atan2(p.y, p.x);
  let outerRing = smoothstep(0.032, 0.0, abs(r - 0.88));
  let innerRing = smoothstep(0.026, 0.0, abs(r - 0.62));
  let hubRing = smoothstep(0.022, 0.0, abs(r - 0.28));
  let spokeWave = abs(sin(ang * 6.0 + aura.u_time * 0.18));
  let runeBand = smoothstep(0.64, 0.72, r) * (1.0 - smoothstep(0.80, 0.86, r));
  let glyphs = select(0.0, 1.0, (sin(ang * 24.0 - aura.u_time * 0.35) * 0.5 + 0.5) >= 0.56) * runeBand;
  let spokes = smoothstep(0.94, 0.995, spokeWave) * smoothstep(0.28, 0.34, r) * (1.0 - smoothstep(0.86, 0.90, r));
  let ember = a3dValueNoise2(p * 4.5 + vec2<f32>(aura.u_time * aura.u_pulseSpeed * 0.35, -aura.u_time * aura.u_pulseSpeed * 0.25));
  let pulse = 0.72 + 0.28 * sin(aura.u_time * aura.u_pulseSpeed - r * 4.2);
  let pattern = clamp(outerRing + innerRing * 0.85 + hubRing * 0.7 + glyphs * 0.75 + spokes * 0.8, 0.0, 1.0);
  let col = mix(aura.u_emberColor, aura.u_runeColor, clamp(0.35 + ember * 0.65, 0.0, 1.0)) * (0.95 + pulse * 0.65);
  let fadeEdge = 1.0 - smoothstep(0.92, 1.0, r);
  let alpha = clamp(pattern * aura.u_opacity * fadeEdge * (0.68 + ember * 0.32), 0.0, 0.92);
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: DUAL_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: DUAL_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      runeColor: { type: "color3", value: [...runeColor] },
      emberColor: { type: "color3", value: [...emberColor] },
      pulseSpeed: { type: "f32", value: pulseSpeed },
      opacity: { type: "f32", value: opacity }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export interface ParrySlashArcOptions {
  readonly coreColor?: readonly [number, number, number];
  readonly rimColor?: readonly [number, number, number];
  readonly opacity?: number;
}

/** Crescent forged-blade slash & guard-parry shock arc shader (paired GLSL 300 es + WGSL). */
export function parrySlashArcMaterialSpec(options: ParrySlashArcOptions = {}): CustomMaterialSpec {
  const coreColor = options.coreColor ?? [1.0, 0.82, 0.42];
  const rimColor = options.rimColor ?? [1.0, 0.96, 0.84];
  const opacity = options.opacity ?? 0.86;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  // Crescent arc spanning -110 deg .. +110 deg on +X side
  float arcMask = smoothstep(2.05, 0.65, abs(ang));
  float blade = smoothstep(0.52, 0.78, r) * (1.0 - smoothstep(0.86, 0.98, r));
  float hotEdge = smoothstep(0.80, 0.90, r) * (1.0 - smoothstep(0.92, 0.99, r));
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(N, V)), 1.8);
  float streak = 0.72 + 0.28 * sin(ang * 14.0 - uTime * 18.0);
  vec3 col = mix(coreColor, rimColor, clamp(hotEdge * 0.8 + fresnel * 0.45, 0.0, 1.0)) * (1.25 + hotEdge * 0.9);
  float alpha = clamp(arcMask * blade * streak * opacity, 0.0, 0.95);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let p = (vUv - vec2<f32>(0.5, 0.5)) * 2.0;
  let r = length(p);
  let ang = atan2(p.y, p.x);
  let arcMask = smoothstep(2.05, 0.65, abs(ang));
  let blade = smoothstep(0.52, 0.78, r) * (1.0 - smoothstep(0.86, 0.98, r));
  let hotEdge = smoothstep(0.80, 0.90, r) * (1.0 - smoothstep(0.92, 0.99, r));
  let N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let fresnel = a3dPow(1.0 - abs(dot(N, V)), 1.8);
  let streak = 0.72 + 0.28 * sin(ang * 14.0 - aura.u_time * 18.0);
  let col = mix(aura.u_coreColor, aura.u_rimColor, clamp(hotEdge * 0.8 + fresnel * 0.45, 0.0, 1.0)) * (1.25 + hotEdge * 0.9);
  let alpha = clamp(arcMask * blade * streak * aura.u_opacity, 0.0, 0.95);
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: DUAL_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: DUAL_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      coreColor: { type: "color3", value: [...coreColor] },
      rimColor: { type: "color3", value: [...rimColor] },
      opacity: { type: "f32", value: opacity }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/** Dual-backend 8x4 (32-frame) sprite-sheet flipbook burst shader reading a `createFlipbookAtlas` texture. */
export function dualFlipbookAtlasBurstSpec(
  atlas: FlipbookAtlasSpec,
  options: {
    readonly tint?: readonly [number, number, number];
    readonly emissiveGain?: number;
    readonly additive?: boolean;
  } = {}
): CustomMaterialSpec {
  const tint = options.tint ?? [1, 1, 1];
  const emissiveGain = options.emissiveGain ?? 1.0;

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
  float alpha = texel.a * (1.0 - smoothstep(0.76, 1.0, p));
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
  let alpha = texel.a * (1.0 - smoothstep(0.76, 1.0, p));
  if (alpha < 0.02) { discard; }
  let col = a3dSrgbToLinear(texel.rgb) * aura.u_tintColor * aura.u_emissiveGain;
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: DUAL_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: DUAL_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      atlasMap: { type: "texture2d", value: atlas.texture },
      tintColor: { type: "color3", value: [...tint] },
      emissiveGain: { type: "f32", value: emissiveGain },
      progress: { type: "f32", value: 0 }
    },
    transparent: true,
    depthWrite: false,
    side: "double",
    ...(options.additive ? { blend: "additive" as const } : {})
  };
}
