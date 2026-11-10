/**
 * Cross Hop WP-14 paired GLSL 300 es + WGSL custom surface & flipbook shaders.
 * Every material provides both `glsl` and `wgsl` stages so `backend: "auto"` runs
 * natively on WebGPU and WebGL2 with zero fallback warnings.
 */
import { defineAuraAssets, material, type AuraAssetRef } from "@aura3d/engine";
import { dualAnimatedWaterSpec, type DualAnimatedWaterOptions } from "../../../showcase-port-shared/dual-shaders";
import { createFlipbookAtlas, createGradingLut, type FlipbookKind } from "../../../showcase-port-shared/vfx-pack";
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_INSTANCE_INPUTS,
  WGSL_MATH,
  WGSL_NOISE,
  WGSL_PBR_MICRO,
  wgslStage
} from "../../../showcase-port-shared/wgsl-twins";

const INSTANCED_SURFACE_VERTEX_GLSL = /* glsl */ `
out vec3 vWorld;
out vec3 vLocal;
out vec4 vInstColor;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vLocal = position;
  vInstColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const INSTANCED_SURFACE_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct InstancedSurfaceVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vLocal: vec3<f32>,
  @location(2) vInstColor: vec4<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  ${WGSL_INSTANCE_INPUTS},
  @location(12) a_instanceColor: vec4<f32>
) -> InstancedSurfaceVarying {
  var out: InstancedSurfaceVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0);
  out.vWorld = world.xyz;
  out.vLocal = a_position;
  out.vInstColor = a_instanceColor;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

/** Single-mesh animated water surface spec re-exported for river basins & previews. */
export function basinWaterMaterial(options: DualAnimatedWaterOptions = {}) {
  return material.custom(dualAnimatedWaterSpec({
    deepColor: [0.05, 0.24, 0.42],
    shallowColor: [0.14, 0.56, 0.72],
    foamColor: [0.92, 0.97, 1.0],
    sunDir: [-0.46, 0.74, 0.48],
    waveScale: 0.48,
    waveSpeed: 1.35,
    opacity: 1,
    ...options
  }));
}

/**
 * Instanced river lane shader (`instances.box`): dual-octave Gerstner ripples,
 * bright underwater caustics lattice, Schlick Fresnel sky sheen, GGX sun glitter,
 * and crisp white shoreline foam along both banks, modulated by per-theme `instanceColor`.
 */
export function riverWaterMaterial() {
  const baseWater = dualAnimatedWaterSpec({
    deepColor: [0.04, 0.22, 0.38],
    shallowColor: [0.14, 0.54, 0.68],
    foamColor: [0.92, 0.98, 1.0],
    sunDir: [-0.46, 0.74, 0.48],
    waveScale: 0.52,
    waveSpeed: 1.28,
    opacity: 1
  });

  const fragmentGlsl = /* glsl */ `
in vec3 vWorld;
in vec3 vLocal;
in vec4 vInstColor;
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
  float n1 = vnoise(p + vec2(t * 0.52, -t * 0.24));
  float n2 = vnoise(p * 2.25 - vec2(t * 0.68, t * 0.36));
  float causticsA = vnoise(p * 3.4 + vec2(t * 0.85, t * 0.42));
  float causticsB = vnoise(p * 3.9 - vec2(t * 0.72, -t * 0.51));
  float caustics = smoothstep(0.58, 0.93, causticsA * 0.55 + causticsB * 0.45);
  float crest = clamp(n1 * 0.58 + n2 * 0.42, 0.0, 1.0);
  vec3 N = normalize(vec3((n1 - 0.5) * 0.32, 1.0, (n2 - 0.5) * 0.32));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float fresnel = 0.03 + 0.97 * pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 4.6);
  float spec = pow(max(dot(N, H), 0.0), 112.0) * 1.95;
  float bankEdge = smoothstep(0.33, 0.49, abs(vLocal.z) + (n2 - 0.5) * 0.07);
  float foam = clamp(smoothstep(0.76, 0.94, crest) * 0.52 + bankEdge * 0.78, 0.0, 1.0);
  vec3 tint = clamp(vInstColor.rgb, vec3(0.08), vec3(1.0));
  vec3 deep = mix(deepColor, tint * 0.46, 0.62);
  vec3 shallow = mix(shallowColor, tint * 1.16, 0.66);
  vec3 body = mix(deep, shallow, clamp(crest * 0.68 + fresnel * 0.46, 0.0, 1.0));
  body += shallow * (caustics * 0.34);
  vec3 col = mix(body, foamColor, foam * 0.66) + foamColor * spec + vec3(0.46, 0.68, 0.92) * (fresnel * 0.38);
  outColor = vec4(col, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_PBR_MICRO, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vWorld: vec3<f32>,
  @location(1) vLocal: vec3<f32>,
  @location(2) vInstColor: vec4<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let p = vWorld.xz * aura.u_waveScale;
  let t = aura.u_time * aura.u_waveSpeed;
  let n1 = a3dValueNoise2(p + vec2<f32>(t * 0.52, -t * 0.24));
  let n2 = a3dValueNoise2(p * 2.25 - vec2<f32>(t * 0.68, t * 0.36));
  let causticsA = a3dValueNoise2(p * 3.4 + vec2<f32>(t * 0.85, t * 0.42));
  let causticsB = a3dValueNoise2(p * 3.9 - vec2<f32>(t * 0.72, -t * 0.51));
  let caustics = smoothstep(0.58, 0.93, causticsA * 0.55 + causticsB * 0.45);
  let crest = clamp(n1 * 0.58 + n2 * 0.42, 0.0, 1.0);
  let N = normalize(vec3<f32>((n1 - 0.5) * 0.32, 1.0, (n2 - 0.5) * 0.32));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let fresnel = a3dFresnelSchlick(max(dot(N, V), 0.0), vec3<f32>(0.03)).x;
  let spec = a3dPow(max(dot(N, H), 0.0), 112.0) * 1.95;
  let bankEdge = smoothstep(0.33, 0.49, abs(vLocal.z) + (n2 - 0.5) * 0.07);
  let foam = clamp(smoothstep(0.76, 0.94, crest) * 0.52 + bankEdge * 0.78, 0.0, 1.0);
  let tint = clamp(vInstColor.rgb, vec3<f32>(0.08), vec3<f32>(1.0));
  let deep = mix(aura.u_deepColor, tint * 0.46, 0.62);
  let shallow = mix(aura.u_shallowColor, tint * 1.16, 0.66);
  var body = mix(deep, shallow, clamp(crest * 0.68 + fresnel * 0.46, 0.0, 1.0));
  body = body + shallow * (caustics * 0.34);
  let col = mix(body, aura.u_foamColor, foam * 0.66) + aura.u_foamColor * spec + vec3<f32>(0.46, 0.68, 0.92) * (fresnel * 0.38);
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return material.custom({
    glsl: { vertex: INSTANCED_SURFACE_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: INSTANCED_SURFACE_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: baseWater.uniforms,
    fog: true
  });
}

/**
 * Instanced glowing magma-fissure shader (`s-lava`): dark cooled basalt plates
 * floating over incandescent FBM convection veins.
 */
export function lavaMagmaMaterial() {
  const fragmentGlsl = /* glsl */ `
in vec3 vWorld;
in vec3 vLocal;
in vec4 vInstColor;
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
  vec2 p = vWorld.xz * magmaScale;
  float t = uTime * flowSpeed;
  float n1 = vnoise(p + vec2(t * 0.35, -t * 0.18));
  float n2 = vnoise(p * 2.35 - vec2(t * 0.52, t * 0.27));
  float ridge = 1.0 - abs((n1 * 0.6 + n2 * 0.4) * 2.0 - 1.0);
  float fissure = smoothstep(0.42, 0.94, ridge);
  float edgeGlow = smoothstep(0.35, 0.49, abs(vLocal.z));
  float heat = clamp(fissure * 0.85 + edgeGlow * 0.45, 0.0, 1.0);
  vec3 hotCore = vec3(1.55, 0.92, 0.24);
  vec3 ember = max(vInstColor.rgb, magmaColor);
  vec3 col = mix(crustColor, ember, smoothstep(0.18, 0.68, heat));
  col = mix(col, hotCore, smoothstep(0.72, 0.98, heat));
  outColor = vec4(col, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vWorld: vec3<f32>,
  @location(1) vLocal: vec3<f32>,
  @location(2) vInstColor: vec4<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let p = vWorld.xz * aura.u_magmaScale;
  let t = aura.u_time * aura.u_flowSpeed;
  let n1 = a3dValueNoise2(p + vec2<f32>(t * 0.35, -t * 0.18));
  let n2 = a3dValueNoise2(p * 2.35 - vec2<f32>(t * 0.52, t * 0.27));
  let ridge = 1.0 - abs((n1 * 0.6 + n2 * 0.4) * 2.0 - 1.0);
  let fissure = smoothstep(0.42, 0.94, ridge);
  let edgeGlow = smoothstep(0.35, 0.49, abs(vLocal.z));
  let heat = clamp(fissure * 0.85 + edgeGlow * 0.45, 0.0, 1.0);
  let hotCore = vec3<f32>(1.55, 0.92, 0.24);
  let ember = max(vInstColor.rgb, aura.u_magmaColor);
  var col = mix(aura.u_crustColor, ember, smoothstep(0.18, 0.68, heat));
  col = mix(col, hotCore, smoothstep(0.72, 0.98, heat));
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return material.custom({
    glsl: { vertex: INSTANCED_SURFACE_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: INSTANCED_SURFACE_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      crustColor: { type: "color3", value: [0.09, 0.05, 0.05] },
      magmaColor: { type: "color3", value: [0.95, 0.32, 0.07] },
      magmaScale: { type: "f32", value: 0.72 },
      flowSpeed: { type: "f32", value: 0.75 }
    },
    fog: true
  });
}

const FLIPBOOK_VERTEX_GLSL = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FLIPBOOK_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct FlipbookVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> FlipbookVarying {
  var out: FlipbookVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

const FLIPBOOK_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  float idx = floor(clamp(progress, 0.0, 0.9999) * frameCount);
  float col = mod(idx, gridSize.x);
  float row = floor(idx / gridSize.x);
  vec2 cellUv = vec2((col + clamp(vUv.x, 0.02, 0.98)) / gridSize.x, (row + clamp(1.0 - vUv.y, 0.02, 0.98)) / gridSize.y);
  vec4 texel = texture(atlas, cellUv);
  float a = texel.a * alphaScale;
  if (a < 0.006) discard;
  outColor = vec4(srgbToLin(texel.rgb) * tintColor, a);
}`;

const FLIPBOOK_FRAGMENT_WGSL = wgslStage([WGSL_COLOR, WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let idx = floor(clamp(aura.u_progress, 0.0, 0.9999) * aura.u_frameCount);
  let col = a3dModF(idx, aura.u_gridSize.x);
  let row = floor(idx / aura.u_gridSize.x);
  let cellUv = vec2<f32>(
    (col + clamp(vUv.x, 0.02, 0.98)) / aura.u_gridSize.x,
    (row + clamp(1.0 - vUv.y, 0.02, 0.98)) / aura.u_gridSize.y
  );
  let texel = textureSample(u_atlasTexture, u_atlasSampler, cellUv);
  let a = texel.a * aura.u_alphaScale;
  if (a < 0.006) { discard; }
  return vec4<f32>(a3dSrgbToLinear(texel.rgb) * aura.u_tintColor, a);
}`);

const atlasCache = new Map<string, ReturnType<typeof createFlipbookAtlas>>();

function sharedAtlas(kind: FlipbookKind, tint: readonly [number, number, number]) {
  const key = `${kind}:${tint.join(",")}`;
  let entry = atlasCache.get(key);
  if (!entry) {
    entry = createFlipbookAtlas(kind, tint);
    atlasCache.set(key, entry);
  }
  return entry;
}

/**
 * Paired GLSL + WGSL sprite-sheet flipbook material backed by `createFlipbookAtlas("ripple" | "dust")`
 * (`8x4` = 32 procedural RGBA8 frames).
 */
export function flipbookQuadMaterial(
  kind: "ripple" | "dust",
  tintRgb255: readonly [number, number, number],
  progress = 0,
  alphaScale = 0,
  tintLinear: readonly [number, number, number] = [1, 1, 1]
) {
  const sheet = sharedAtlas(kind, tintRgb255);
  return material.custom({
    glsl: { vertex: FLIPBOOK_VERTEX_GLSL, fragment: FLIPBOOK_FRAGMENT_GLSL },
    wgsl: { vertex: FLIPBOOK_VERTEX_WGSL, fragment: FLIPBOOK_FRAGMENT_WGSL },
    uniforms: {
      atlas: { type: "texture2d", value: sheet.texture },
      gridSize: { type: "vec2", value: [sheet.columns, sheet.rows] },
      frameCount: { type: "f32", value: sheet.frameCount },
      progress: { type: "f32", value: progress },
      alphaScale: { type: "f32", value: alphaScale },
      tintColor: { type: "color3", value: [...tintLinear] }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  });
}

let cachedBroadcastLutCubeText: string | null = null;
let cachedBroadcastLutAsset: AuraAssetRef<"lut"> | null = null;

/**
 * Generates an Adobe/Resolve `.cube` 3D LUT string directly from `createGradingLut("broadcast-crisp")`,
 * suitable for `effects.colorGrade({ lut })` and `parseCubeLut(...)`.
 */
export function broadcastCrispCubeText(size = 8): string {
  if (cachedBroadcastLutCubeText && size === 8) return cachedBroadcastLutCubeText;
  const strip = createGradingLut("broadcast-crisp", size);
  const raw = (strip.texture as unknown as { data?: Uint8Array }).data;
  const lines: string[] = [
    'TITLE "Cross Hop Broadcast Crisp"',
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0"
  ];
  const width = size * size;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        if (raw && raw.length >= width * size * 4) {
          const idx = (g * width + (b * size + r)) * 4;
          lines.push(`${(raw[idx]! / 255).toFixed(5)} ${(raw[idx + 1]! / 255).toFixed(5)} ${(raw[idx + 2]! / 255).toFixed(5)}`);
        } else {
          const nr = r / (size - 1);
          const ng = g / (size - 1);
          const nb = b / (size - 1);
          lines.push(`${nr.toFixed(5)} ${ng.toFixed(5)} ${nb.toFixed(5)}`);
        }
      }
    }
  }
  const text = lines.join("\n");
  if (size === 8) cachedBroadcastLutCubeText = text;
  return text;
}

/** Browser-ready `AuraAssetRef<"lut">` for `looks.preset({ grade: { lut } })` (`undefined` in headless Node unit tests). */
export function broadcastCrispLutAsset(): AuraAssetRef<"lut"> | undefined {
  if (typeof window === "undefined") return undefined;
  if (!cachedBroadcastLutAsset) {
    const url = `data:text/plain;charset=utf-8,${encodeURIComponent(broadcastCrispCubeText(8))}`;
    cachedBroadcastLutAsset = defineAuraAssets({
      broadcastCrisp: { type: "lut", format: "cube", url }
    }).broadcastCrisp;
  }
  return cachedBroadcastLutAsset;
}
