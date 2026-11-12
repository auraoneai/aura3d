/**
 * Wet-ink GPU splat surface, 3D broadcast-crisp LUT grading, and 32-frame ink-droplet flipbook shader
 * for Splat Turf (WP-17). Replaces the 7,200-quad (28,800-vertex) CPU paint Batch with a single static
 * corridor ribbon backed by `createGpuSplatMap` (`texture.data` RGBA8) and paired GLSL 300 es + WGSL stages.
 */
import { texture } from "@aura3d/engine";
import { dualWetInkSurfaceSpec } from "../../../showcase-port-shared/dual-shaders";
import { createFlipbookAtlas, createGradingLut, type FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";
import {
  WGSL_CLIP,
  WGSL_POW,
  WGSL_SHOULDER,
  WGSL_SRGB,
  createGpuSplatMap,
  wgslStage,
  type CustomSpec,
  type MeshData,
  type Rgb
} from "../../../../examples/shared/runner-kit/index";
import type { Haze } from "./haze";

export { dualWetInkSurfaceSpec };

type TextureHandle = ReturnType<typeof texture.data>;

/** Splat-map resolution: 16 texels per 1 m lane (6 lanes = 96) x 2 texels per 1 m row (1,200 m = 2,400). */
export const SPLAT_TEXELS_PER_COL = 16;
export const SPLAT_TEXELS_PER_ROW = 2;
export const SPLAT_BASE_RGBA = [247, 244, 236, 0] as const;
export const SPLAT_WASH_RGBA = [186, 244, 248, 148] as const;

export interface TurfSplatSurface {
  readonly splat: ReturnType<typeof createGpuSplatMap>;
  readonly texture: TextureHandle;
  readonly gradingLut: TextureHandle;
  readonly inkAtlas: FlipbookAtlasSpec;
  clearAll(): void;
  writeCell(row: number, col: number, state: number, paintRgba: readonly [number, number, number, number]): void;
  flush(): void;
}

/**
 * Allocates the persistent RGBA8 GPU splat map (`96 x 2400`), broadcast-crisp 3D strip LUT, and
 * 32-frame ink-droplet flipbook atlas. Mutates `splat.pixels` in place and flags `texture.needsUpdate = true`
 * only on frames where at least one cell changed.
 */
export function createTurfSplatSurface(rows: number, cols: number): TurfSplatSurface {
  const width = cols * SPLAT_TEXELS_PER_COL;
  const height = rows * SPLAT_TEXELS_PER_ROW;
  const splat = createGpuSplatMap({ width, height, baseRgba: SPLAT_BASE_RGBA });
  const splatTex = texture.data({
    data: splat.pixels,
    width,
    height,
    colorSpace: "srgb"
  });
  splatTex.wrapS = "clamp";
  splatTex.wrapT = "clamp";
  splatTex.minFilter = "linear";
  splatTex.magFilter = "linear";
  const lut = createGradingLut("broadcast-crisp", 16);
  lut.texture.wrapS = "clamp";
  lut.texture.wrapT = "clamp";
  lut.texture.minFilter = "linear";
  lut.texture.magFilter = "linear";
  const inkAtlas = createFlipbookAtlas("ink", [255, 255, 255]);
  inkAtlas.texture.wrapS = "clamp";
  inkAtlas.texture.wrapT = "clamp";
  inkAtlas.texture.minFilter = "linear";
  inkAtlas.texture.magFilter = "linear";
  let dirty = true;

  function clearAll(): void {
    splat.clear(SPLAT_BASE_RGBA);
    dirty = true;
  }

  function writeCell(row: number, col: number, state: number, paintRgba: readonly [number, number, number, number]): void {
    const x0 = col * SPLAT_TEXELS_PER_COL;
    const y0 = row * SPLAT_TEXELS_PER_ROW;
    const pixels = splat.pixels;
    const rgba = state === 1 ? paintRgba : state === 2 ? SPLAT_WASH_RGBA : SPLAT_BASE_RGBA;

    for (let dy = 0; dy < SPLAT_TEXELS_PER_ROW; dy += 1) {
      const y = y0 + dy;
      if (y < 0 || y >= height) continue;
      const wobble = Math.sin((row * 2 + dy) * 1.9 + col * 2.7) * 0.85;
      for (let dx = 0; dx < SPLAT_TEXELS_PER_COL; dx += 1) {
        const idx = (y * width + (x0 + dx)) * 4;
        if (state === 0) {
          pixels[idx] = SPLAT_BASE_RGBA[0];
          pixels[idx + 1] = SPLAT_BASE_RGBA[1];
          pixels[idx + 2] = SPLAT_BASE_RGBA[2];
          pixels[idx + 3] = 0;
          continue;
        }
        // Keep a crisp 1.4-texel gesso gutter between adjacent lanes unless wobbled by a wet roller bulge.
        const distFromCenter = Math.abs(dx + 0.5 - SPLAT_TEXELS_PER_COL * 0.5);
        const halfWidth = state === 1 ? 6.45 + wobble : 7.1;
        const coverage = Math.min(1, Math.max(0, (halfWidth - distFromCenter) * 0.85 + 0.5));
        const alpha = Math.round(rgba[3] * coverage);
        pixels[idx] = rgba[0];
        pixels[idx + 1] = rgba[1];
        pixels[idx + 2] = rgba[2];
        pixels[idx + 3] = alpha;
      }
    }
    dirty = true;
  }

  function flush(): void {
    if (!dirty) return;
    splatTex.needsUpdate = true;
    dirty = false;
  }

  return { splat, texture: splatTex, gradingLut: lut.texture, inkAtlas, clearAll, writeCell, flush };
}

/** Static subdivided ribbon covering `[x: -3..3, z: 0..-runLength]` with UVs `[0..1] x [0..1]`. */
export function paintRibbonMesh(runLength: number, lanes = 6, zSubdivisions = 300): MeshData {
  const halfW = lanes * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= zSubdivisions; iz += 1) {
    const v = iz / zSubdivisions;
    const z = -v * runLength;
    positions.push(-halfW, 0, z, halfW, 0, z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, v, 1, v);
  }
  for (let iz = 0; iz < zSubdivisions; iz += 1) {
    const a = iz * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  return { positions, normals, uvs, indices };
}

const WET_INK_VERTEX_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const WET_INK_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct WetInkVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @location(3) vLocal: vec3<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> WetInkVarying {
  var out: WetInkVarying;
  out.vUv = a_uv;
  out.vLocal = a_position;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

const WET_INK_FRAGMENT_GLSL = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
in vec3 vLocal;
out vec4 outColor;

vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linToSrgb(vec3 c) {
  vec3 x = max(c, vec3(0.0));
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}
vec3 shoulderRoll(vec3 c) {
  const float k = 0.84;
  vec3 over = max(c - vec3(k), vec3(0.0));
  return min(c, vec3(k)) + (1.0 - k) * (vec3(1.0) - exp(-over / (1.0 - k)));
}
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 gradeBroadcastLut(vec3 lin) {
  vec3 c = clamp(linToSrgb(lin), vec3(0.0), vec3(1.0));
  float bSlice = c.b * 15.0;
  float b0 = floor(bSlice);
  float b1 = min(15.0, b0 + 1.0);
  float bf = bSlice - b0;
  float uBase = (c.r * 15.0 + 0.5) / 256.0;
  float vCoord = (c.g * 15.0 + 0.5) / 16.0;
  vec3 s0 = texture(gradingLut, vec2(uBase + b0 / 16.0, vCoord)).rgb;
  vec3 s1 = texture(gradingLut, vec2(uBase + b1 / 16.0, vCoord)).rgb;
  return srgbToLin(mix(s0, s1, bf));
}

void main() {
  vec4 splat = texture(splatMap, vUv);
  float rawAlpha = clamp(splat.a, 0.0, 1.0);
  vec3 inkLinear = srgbToLin(splat.rgb);

  // World-anchored organic paint-roller edge wobble & micro-droplets so painted lanes feel fluid at 120 Hz.
  float laneCoord = vLocal.x + 3.0;
  float laneFrac = fract(laneCoord) - 0.5;
  float laneIdx = floor(laneCoord);
  float seed = laneIdx * 1.73 + 2.9;
  float ripple = 0.042 * sin(vLocal.z * 4.4 + seed) + 0.026 * sin(vLocal.z * 11.3 + seed * 2.1);
  float splatField = rawAlpha - 0.18 * smoothstep(0.32 + ripple, 0.49 + ripple, abs(laneFrac));
  float fw = fwidth(splatField) * 0.85 + 0.018;
  float inkMask = smoothstep(0.28 - fw, 0.34 + fw, splatField);
  float washMask = clamp((1.0 - inkMask) * smoothstep(0.12, 0.48, rawAlpha), 0.0, 1.0);

  // Raised 3D wet-paint meniscus lip from screen-space thickness derivatives + brush-rib micro-relief.
  float rib = sin(laneFrac * 38.0 + sin(vLocal.z * 2.5) * 0.6) * 0.03 * inkMask;
  float thickness = inkMask * (0.76 + 0.24 * smoothstep(0.32, 0.68, splatField)) + rib;
  float dx = dFdx(thickness);
  float dy = dFdy(thickness);
  vec3 N = normalize(vNormal + vec3(-dx * 3.35, 0.0, -dy * 3.35));

  // Sunlit primed gesso deck with subtle woven mineral grain + crisp dashed lane guides on unpainted concrete.
  float grain = (h21(floor(vLocal.xz * 26.0)) - 0.5) * 0.032;
  float laneSeam = 1.0 - smoothstep(0.012, 0.032, abs(abs(laneFrac) - 0.5));
  float dash = step(0.58, fract(-vLocal.z * 0.25));
  vec3 dryGesso = clamp(gessoColor + vec3(grain) - vec3(0.075, 0.08, 0.095) * (laneSeam * dash), vec3(0.0), vec3(1.0));

  // Slightly thicker pigment absorption along the raised meniscus lip.
  float lipRim = clamp(abs(dx) + abs(dy), 0.0, 1.0);
  vec3 wetPigment = inkLinear * (0.9 + 0.14 * thickness - 0.12 * lipRim);
  vec3 albedo = mix(dryGesso, inkLinear, washMask * 0.65);
  albedo = mix(albedo, wetPigment, inkMask);

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float ndotl = max(dot(N, L), 0.0);
  float ndotv = max(dot(N, V), 0.001);
  float ndoth = max(dot(N, H), 0.0);

  // Dual-lobe clearcoat response: matte primed gesso (0.68 roughness) vs liquid clearcoat ink (0.04 roughness).
  float wetFactor = clamp(inkMask + washMask * 0.45, 0.0, 1.0);
  float specPower = mix(20.0, 148.0, wetFactor);
  float specStrength = mix(0.05, 1.28, wetFactor);
  float spec = pow(ndoth, specPower) * specStrength;
  float broadCoat = pow(ndoth, 28.0) * wetFactor * 0.24;
  float fresnel = pow(1.0 - ndotv, 4.2) * wetFactor;

  vec3 skyFill = mix(vec3(0.52, 0.62, 0.78), vec3(0.94, 0.97, 1.0), 0.5 * N.y + 0.5);
  vec3 lit = albedo * (skyFill * 0.42 + sunTint * (0.68 * ndotl + 0.16))
    + sunTint * (spec + broadCoat)
    + skySheen * (fresnel * 0.42);

  vec3 graded = mix(lit, gradeBroadcastLut(lit), 0.55);
  vec3 rolled = shoulderRoll(graded);
  float dist = length(cameraPosition - vWorld);
  float hz = smoothstep(hazeRange.x, hazeRange.y, dist) * hazeRange.z;
  outColor = vec4(mix(rolled, hazeColor, hz), 1.0);
}`;

const WET_INK_FRAGMENT_WGSL = wgslStage([WGSL_POW, WGSL_SRGB, WGSL_SHOULDER], /* wgsl */ `
fn linToSrgb(c: vec3<f32>) -> vec3<f32> {
  let x = max(c, vec3<f32>(0.0));
  return mix(x * 12.92, 1.055 * a3dPow3(x, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), step(vec3<f32>(0.0031308), x));
}
fn h21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
fn gradeBroadcastLut(lin: vec3<f32>) -> vec3<f32> {
  let c = clamp(linToSrgb(lin), vec3<f32>(0.0), vec3<f32>(1.0));
  let bSlice = c.b * 15.0;
  let b0 = floor(bSlice);
  let b1 = min(15.0, b0 + 1.0);
  let bf = bSlice - b0;
  let uBase = (c.r * 15.0 + 0.5) / 256.0;
  let vCoord = (c.g * 15.0 + 0.5) / 16.0;
  let s0 = textureSample(u_gradingLutTexture, u_gradingLutSampler, vec2<f32>(uBase + b0 / 16.0, vCoord)).rgb;
  let s1 = textureSample(u_gradingLutTexture, u_gradingLutSampler, vec2<f32>(uBase + b1 / 16.0, vCoord)).rgb;
  return srgbToLinear(mix(s0, s1, bf));
}

@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @location(3) vLocal: vec3<f32>
) -> @location(0) vec4<f32> {
  let splat = textureSample(u_splatMapTexture, u_splatMapSampler, vUv);
  let rawAlpha = clamp(splat.a, 0.0, 1.0);
  let inkLinear = srgbToLinear(splat.rgb);

  let laneCoord = vLocal.x + 3.0;
  let laneFrac = fract(laneCoord) - 0.5;
  let laneIdx = floor(laneCoord);
  let seed = laneIdx * 1.73 + 2.9;
  let ripple = 0.042 * sin(vLocal.z * 4.4 + seed) + 0.026 * sin(vLocal.z * 11.3 + seed * 2.1);
  let splatField = rawAlpha - 0.18 * smoothstep(0.32 + ripple, 0.49 + ripple, abs(laneFrac));
  let fw = fwidth(splatField) * 0.85 + 0.018;
  let inkMask = smoothstep(0.28 - fw, 0.34 + fw, splatField);
  let washMask = clamp((1.0 - inkMask) * smoothstep(0.12, 0.48, rawAlpha), 0.0, 1.0);

  let rib = sin(laneFrac * 38.0 + sin(vLocal.z * 2.5) * 0.6) * 0.03 * inkMask;
  let thickness = inkMask * (0.76 + 0.24 * smoothstep(0.32, 0.68, splatField)) + rib;
  let dx = dpdx(thickness);
  let dy = dpdy(thickness);
  let N = normalize(vNormal + vec3<f32>(-dx * 3.35, 0.0, -dy * 3.35));

  let grain = (h21(floor(vec2<f32>(vLocal.x, vLocal.z) * 26.0)) - 0.5) * 0.032;
  let laneSeam = 1.0 - smoothstep(0.012, 0.032, abs(abs(laneFrac) - 0.5));
  let dash = step(0.58, fract(-vLocal.z * 0.25));
  let dryGesso = clamp(aura.u_gessoColor + vec3<f32>(grain) - vec3<f32>(0.075, 0.08, 0.095) * (laneSeam * dash), vec3<f32>(0.0), vec3<f32>(1.0));

  let lipRim = clamp(abs(dx) + abs(dy), 0.0, 1.0);
  let wetPigment = inkLinear * (0.9 + 0.14 * thickness - 0.12 * lipRim);
  var albedo = mix(dryGesso, inkLinear, washMask * 0.65);
  albedo = mix(albedo, wetPigment, inkMask);

  let V = normalize(aura.u_cameraPosition - vWorld);
  let L = normalize(aura.u_sunDir);
  let H = normalize(L + V);
  let ndotl = max(dot(N, L), 0.0);
  let ndotv = max(dot(N, V), 0.001);
  let ndoth = max(dot(N, H), 0.0);

  let wetFactor = clamp(inkMask + washMask * 0.45, 0.0, 1.0);
  let specPower = mix(20.0, 148.0, wetFactor);
  let specStrength = mix(0.05, 1.28, wetFactor);
  let spec = a3dPow(ndoth, specPower) * specStrength;
  let broadCoat = a3dPow(ndoth, 28.0) * wetFactor * 0.24;
  let fresnel = a3dPow(1.0 - ndotv, 4.2) * wetFactor;

  let skyFill = mix(vec3<f32>(0.52, 0.62, 0.78), vec3<f32>(0.94, 0.97, 1.0), 0.5 * N.y + 0.5);
  let lit = albedo * (skyFill * 0.42 + aura.u_sunTint * (0.68 * ndotl + 0.16))
    + aura.u_sunTint * (spec + broadCoat)
    + aura.u_skySheen * (fresnel * 0.42);

  let graded = mix(lit, gradeBroadcastLut(lit), 0.55);
  let rolled = shoulder(graded);
  let dist = length(aura.u_cameraPosition - vWorld);
  let hz = smoothstep(aura.u_hazeRange.x, aura.u_hazeRange.y, dist) * aura.u_hazeRange.z;
  return vec4<f32>(mix(rolled, aura.u_hazeColor, hz), 1.0);
}`);

export interface WetInkRibbonOptions {
  readonly splatMap: TextureHandle;
  readonly gradingLut: TextureHandle;
  readonly gessoColor: Rgb;
  readonly sunDir: readonly [number, number, number];
  readonly sunTint?: Rgb;
  readonly skySheen?: Rgb;
  readonly haze: Haze;
}

export function wetInkRibbonSpec(options: WetInkRibbonOptions): CustomSpec {
  const sunTint = options.sunTint ?? [1.0, 0.97, 0.9];
  const skySheen = options.skySheen ?? [0.68, 0.86, 1.0];
  return {
    glsl: { vertex: WET_INK_VERTEX_GLSL, fragment: WET_INK_FRAGMENT_GLSL },
    wgsl: { vertex: WET_INK_VERTEX_WGSL, fragment: WET_INK_FRAGMENT_WGSL },
    uniforms: {
      splatMap: { type: "texture2d", value: options.splatMap },
      gradingLut: { type: "texture2d", value: options.gradingLut },
      gessoColor: { type: "color3", value: [...options.gessoColor] },
      sunDir: { type: "vec3", value: [...options.sunDir] },
      sunTint: { type: "color3", value: [...sunTint] },
      skySheen: { type: "color3", value: [...skySheen] },
      hazeColor: { type: "color3", value: [...options.haze.color] },
      hazeRange: { type: "vec3", value: [options.haze.near, options.haze.far, options.haze.max] }
    }
  };
}

/**
 * Paired GLSL 300 es + WGSL 32-frame ink-droplet flipbook shader reading `createFlipbookAtlas("ink").texture`.
 * Per-instance `tone` packs `floor(tone.x) = frameIndex [0..31]` and `vec3(fract(tone.x), tone.y, tone.z) = linearRgb`.
 */
const INK_FLIPBOOK_VERTEX_GLSL = /* glsl */ `
in vec3 tone;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const INK_FLIPBOOK_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct InkBurstVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vTone: vec3<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(2) a_uv: vec2<f32>,
  @location(3) tone: vec3<f32>
) -> InkBurstVarying {
  var out: InkBurstVarying;
  out.vUv = a_uv;
  out.vTone = tone;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

const INK_FLIPBOOK_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
void main() {
  float frame = clamp(floor(vTone.x + 1e-4), 0.0, 31.0);
  vec3 tint = vec3(clamp(vTone.x - frame, 0.0, 1.0), vTone.y, vTone.z);
  float col = mod(frame, atlasGrid.x);
  float row = floor(frame / atlasGrid.x);
  vec2 cellUv = (vec2(col, row) + clamp(vUv, vec2(0.03), vec2(0.97))) / atlasGrid;
  vec4 tex = texture(inkAtlas, cellUv);
  outColor = vec4(tint * (0.9 + 0.45 * tex.rgb), tex.a * burstOpacity);
}`;

const INK_FLIPBOOK_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vUv: vec2<f32>,
  @location(1) vTone: vec3<f32>
) -> @location(0) vec4<f32> {
  let frame = clamp(floor(vTone.x + 1e-4), 0.0, 31.0);
  let tint = vec3<f32>(clamp(vTone.x - frame, 0.0, 1.0), vTone.y, vTone.z);
  let col = frame - aura.u_atlasGrid.x * floor(frame / aura.u_atlasGrid.x);
  let row = floor(frame / aura.u_atlasGrid.x);
  let cellUv = (vec2<f32>(col, row) + clamp(vUv, vec2<f32>(0.03), vec2<f32>(0.97))) / aura.u_atlasGrid;
  let tex = textureSample(u_inkAtlasTexture, u_inkAtlasSampler, cellUv);
  return vec4<f32>(tint * (0.9 + 0.45 * tex.rgb), tex.a * aura.u_burstOpacity);
}`);

export function inkFlipbookSpec(atlas: FlipbookAtlasSpec): CustomSpec {
  return {
    glsl: { vertex: INK_FLIPBOOK_VERTEX_GLSL, fragment: INK_FLIPBOOK_FRAGMENT_GLSL },
    wgsl: { vertex: INK_FLIPBOOK_VERTEX_WGSL, fragment: INK_FLIPBOOK_FRAGMENT_WGSL },
    uniforms: {
      inkAtlas: { type: "texture2d", value: atlas.texture },
      atlasGrid: { type: "vec2", value: [atlas.columns, atlas.rows] },
      burstOpacity: { type: "f32", value: 0.94 }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/** Packs a `[0..31]` flipbook frame index and linear RGB tint into a single `Batch.setTone` `[x, y, z]` tuple. */
export function packInkBurstTone(frame: number, rgb: Rgb): Rgb {
  const clampedFrame = Math.min(31, Math.max(0, Math.floor(frame)));
  const r = Math.min(0.985, Math.max(0.015, rgb[0]));
  return [clampedFrame + r, rgb[1], rgb[2]];
}
