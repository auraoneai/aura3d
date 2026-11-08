// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// PRD-04 P2-10 (R15): presets record their defaulted fields via AURA_PRESET_DEFAULTS.

import type { AuraAssetRef, AuraColor, AuraCustomMaterialSpec, AuraCustomUniformSpec, AuraEditableMaterialParameters, AuraMaterialCapabilityDiagnostics, AuraMaterialCapabilityInput, AuraMaterialInspectorPanel, AuraMaterialSpec, AuraMaterialVisualQAResult, AuraProceduralTextureSpec, AuraSceneNode, AuraTextureRef, AuraToonMaterialOptions, AuraVec3 } from "../nodes/types.js";
import { assertAuraCustomMaterialSpec } from "../compiler/customMaterial.js";
import { parseAuraColor } from "../../contracts/sceneGraph.js";
import { materialNode } from "./tsl/index.js";
import type { TslMaterialNodeOptions } from "./tsl/emit.js";
import { migrateTslShaderGraph, shaderGraphMaterial, type ShaderGraphMaterialOptions } from "./shaderGraph.js";
import { PHYSICAL_SPEC_KEYS, createMaterialCapabilityDiagnostics, createMaterialInspector, proceduralTexture } from "../nodes/materialTools.js";
import { neon } from "../nodes/neon.js";
import { createPhysicalMaterialSpec, resolveIridescenceThickness } from "../../material-physical/PhysicalMaterialSpec.js";
import { validateMaterialVisualQA } from "../looks/structuralQA.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { causticsMaterial, lightBeamMaterial, strataMaterial } from "./material.visual.js";
import { noteMaterialGuesses, noteUnrenderedOptions, normalizeThreeMaterialAliases } from "./optionDiagnostics.js";
import { markStudioMaterial } from "./studioMaterial.js";
import type { AuraSolarPlanetMaterialPreset } from "../nodes/types.js";
import { solarPlanetMaterial } from "../nodes/solar.js";
import { resolveDepthPreviewMaterialOptions } from "@aura3d/rendering";
import { assertAuraColorOption } from "../color.js";


/**
 * PRD-04 P2-10 (R15): enumerable symbol on preset-produced material specs. Its value is the set of
 * spec field names that came from the preset's own defaults rather than the caller's options, so the
 * flag-on override lowering (C-15, §7.2) can ignore preset-defaulted values — most importantly
 * `spec.color`, which the legacy tint bridge treated as authored intent even when it was a stock
 * preset colour.
 */
const MATERIAL_COLOR_KEYS = ["color", "emissive", "sheenColor", "specularColor", "attenuationColor"] as const;

export const AURA_PRESET_DEFAULTS: unique symbol = Symbol.for("aura3d.presetDefaults");

/** Merge `defaults` with `options` and mark which resulting fields the user did not supply. */
export function resolveMaterialSpecDefaults(defaults: AuraMaterialSpec, options: AuraMaterialSpec): AuraMaterialSpec {
  // Every material preset validates its authored colours at the API entry (any CSS form; invalid throws COLOR_INVALID).
  for (const key of MATERIAL_COLOR_KEYS) {
    assertAuraColorOption((options as Record<string, unknown>)[key], `material preset ({ ${key} })`);
  }
  const defaultedKeys = new Set<string>();
  for (const key of Object.keys(defaults)) {
    // An own `undefined` option still wins the spread below (legacy merge shape), so the key's value
    // did not come from the preset and must not be marked as preset-defaulted.
    if (!Object.prototype.hasOwnProperty.call(options, key)) defaultedKeys.add(key);
  }
  const spec = { ...defaults, ...options } as AuraMaterialSpec & { [AURA_PRESET_DEFAULTS]?: ReadonlySet<string> };
  spec[AURA_PRESET_DEFAULTS] = defaultedKeys;
  return spec;
}

/**
 * Derived presets (chrome, frostedGlass, ...) compose their own defaults with caller options and
 * delegate to a base preset. The base factory would mark fields the derived preset itself supplied,
 * so the derived preset's own marker is restored onto the base's result.
 */
function presetFrom(defaults: AuraMaterialSpec, options: AuraMaterialSpec, base: (merged: AuraMaterialSpec) => AuraMaterialSpec): AuraMaterialSpec {
  const merged = resolveMaterialSpecDefaults(defaults, options);
  const spec = base(merged);
  (spec as { [AURA_PRESET_DEFAULTS]?: ReadonlySet<string> })[AURA_PRESET_DEFAULTS] =
    (merged as { [AURA_PRESET_DEFAULTS]?: ReadonlySet<string> })[AURA_PRESET_DEFAULTS];
  return spec;
}

/**
 * GU47 E-D `material.toon`: the vertex stage reads `instanceMatrix` (identity on a plain draw) so the material works on
 * instanced nodes and in the `castShadow` depth pass.
 */
const TOON_VERTEX_GLSL = `out vec3 vToonWorld;
out vec3 vToonNormal;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vToonWorld = world.xyz;
  vToonNormal = normalMatrix * (mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/**
 * Light level = luminance of every scene light's white-albedo radiance (`a3dDirect`, sun shadow included) times pi, so
 * 1 is a surface facing a unit-intensity light. Bands with `a3dToonRamp` (or the ramp texture), mixes `shadowColor` to
 * `color`, adds a hemisphere fill and the rim.
 */
const TOON_FRAGMENT_GLSL = `#include <a3d_lights>
#include <a3d_toon>
#ifdef A3D_TOON_RIM
#include <a3d_rim>
#endif
in vec3 vToonWorld;
in vec3 vToonNormal;
out vec4 outColor;
void main() {
  vec3 N = normalize(vToonNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vToonWorld);
  vec3 direct = a3dDirect(N, V, vec3(1.0), 1.0, vToonWorld);
  float light = clamp(dot(direct, vec3(0.2126, 0.7152, 0.0722)) * 3.14159265, 0.0, 1.0);
#ifdef A3D_TOON_RAMP
  vec3 color = toonColor * texture(toonRamp, vec2(light, 0.5)).rgb;
#else
  vec3 color = mix(toonShadowColor, toonColor, a3dToonRamp(light, toonSteps, 0.08));
#endif
  color += toonColor * a3dHemiLight(N) * 0.25;
#ifdef A3D_TOON_RIM
  color += a3dRim(N, V, toonRimColor, toonRimPower, toonRimIntensity);
#endif
  outColor = vec4(color, 1.0);
}`;

const linearRgb = (color: string): readonly [number, number, number] => {
  const [r, g, b] = parseAuraColor(color);
  return [r, g, b];
};

const clampFinite = (value: number | undefined, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** GU47 E-D (PRD §3.1): `material.toon(opts)` lowers to a `material.custom` spec over the `a3d_lights` / `a3d_toon` / `a3d_rim` chunks. */
export function toonMaterial(options: AuraToonMaterialOptions = {}): AuraMaterialSpec {
  const color = linearRgb(options.color ?? "#d7dee8");
  const shadow = options.shadowColor !== undefined ? linearRgb(options.shadowColor) : [color[0] * 0.35, color[1] * 0.35, color[2] * 0.35] as const;
  const uniforms: Record<string, AuraCustomUniformSpec> = {
    toonColor: { type: "vec3", value: [...color] },
    toonShadowColor: { type: "vec3", value: [...shadow] },
    toonSteps: { type: "f32", value: Math.round(clampFinite(options.steps, 3, 1, 8)) }
  };
  const defines: Record<string, boolean> = {};
  if (options.ramp) {
    uniforms.toonRamp = { type: "texture2d", value: options.ramp };
    defines.A3D_TOON_RAMP = true;
  }
  if (options.rim) {
    uniforms.toonRimColor = { type: "vec3", value: [...linearRgb(options.rim.color)] };
    uniforms.toonRimPower = { type: "f32", value: clampFinite(options.rim.power, 3, 0.1, 16) };
    uniforms.toonRimIntensity = { type: "f32", value: clampFinite(options.rim.intensity, 1, 0, 16) };
    defines.A3D_TOON_RIM = true;
  }
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: TOON_VERTEX_GLSL, fragment: TOON_FRAGMENT_GLSL },
    uniforms,
    ...(Object.keys(defines).length > 0 ? { defines } : {}),
    fog: true,
    castShadow: true
  };
  assertAuraCustomMaterialSpec(custom, "material.toon");
  return { kind: "custom", custom };
}

export interface AuraMatcapMaterialOptions {
  readonly map: AuraTextureRef | AuraAssetRef<"texture">;
  readonly color?: AuraColor;
  readonly opacity?: number;
  readonly transparent?: boolean;
  readonly side?: "front" | "back" | "double";
}

/**
 * Opaque grayscale of positive camera-space distance (`-view.z`). Near maps
 * to white and far maps to black; values outside this range are clamped.
 * This range does not alter or automatically follow the camera clip planes.
 * Currently supported on standard-depth WebGL2 triangle primitives only;
 * model overrides, scene/material clipping, WebGPU and nonstandard depth
 * modes are unavailable. Postprocessing can change the displayed grayscale.
 */
export interface AuraDepthPreviewMaterialOptions {
  /** Preview near distance in world/view units (default 0.1; 0 is allowed). */
  readonly near?: number;
  /** Preview far distance in world/view units (default 100). */
  readonly far?: number;
  /** Which triangle faces to draw (default "front"). */
  readonly side?: "front" | "back" | "double";
}

/**
 * Opaque view-space vertex-normal preview: normalized XYZ is mapped from
 * [-1, 1] to RGB [0, 1]. Back-facing fragments use the opposite normal.
 *
 * This uses the portable custom-surface path, with triangle primitives that
 * have normals and a standard minus-one-to-one camera projection. Separate
 * view/projection frame matrices must be bound and match the raster camera;
 * the custom adapter otherwise falls back to identity. This builder does not
 * generally reject unsupported targets and does not establish imported model,
 * instance, skinning, morph, geometry-transform, clipping, shadow or other
 * depth-convention support. Model and view transforms must be affine; face
 * semantics require an orientation-preserving view. Reflected object transforms
 * also require determinant < -1e-8 for the renderer's winding correction.
 * Degenerate normals or transform determinants at or below 1e-12 produce
 * neutral gray if a fragment is rasterized. Postprocessing/output conversion
 * can change the displayed RGB values.
 */
export interface AuraNormalMaterialOptions {
  /** Which triangle faces to draw (default "front"). */
  readonly side?: "front" | "back" | "double";
}

export interface AuraDistanceMaterialOptions {
  readonly referencePosition?: AuraVec3;
  readonly near?: number;
  readonly far?: number;
  readonly side?: "front" | "back" | "double";
}

export interface AuraShadowMaterialOptions {
  readonly color?: AuraColor;
  readonly opacity?: number;
  readonly side?: "front" | "back" | "double";
  readonly light?: "directional" | "point" | "spot";
}

const SPECIAL_SURFACE_VERTEX_GLSL = `
#define A3D_REQUIRES_VERTEX_NORMAL 1
out vec3 vSpecialWorld;
out vec3 vSpecialNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vSpecialWorld = world.xyz;
  vSpecialNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SPECIAL_SURFACE_VERTEX_WGSL = `
struct SpecialVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> SpecialVertexOutput {
  let world = aura.u_modelMatrix * vec4<f32>(position, 1.0);
  var output: SpecialVertexOutput;
  output.world = world.xyz;
  output.normal = (aura.u_normalMatrix * vec4<f32>(normal, 0.0)).xyz;
  output.position = aura.u_projectionMatrix * aura.u_viewMatrix * world;
  return output;
}`;

// u_normalMatrix is the renderer's inverse-transpose model matrix, including
// its mirrored-winding compensation. The view cofactor matrix, multiplied by
// sign(det(view)), is a positive scalar multiple of inverse-transpose(view).
// That common scalar cancels when the interpolated result is normalized.
const NORMAL_VERTEX_GLSL = `
#define A3D_REQUIRES_VERTEX_NORMAL 1
out vec3 vNormalPreview;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 eye = viewMatrix * world;
  mat3 viewBasis = mat3(viewMatrix);
  vec3 c0 = cross(viewBasis[1], viewBasis[2]);
  vec3 c1 = cross(viewBasis[2], viewBasis[0]);
  vec3 c2 = cross(viewBasis[0], viewBasis[1]);
  float viewDet = dot(viewBasis[0], c0);
  float modelDet = determinant(mat3(modelMatrix));
  vNormalPreview = vec3(0.0);
  if (abs(viewDet) > 1.0e-12 && abs(viewDet) < 3.0e38 &&
      abs(modelDet) > 1.0e-12 && abs(modelDet) < 3.0e38) {
    vNormalPreview = mat3(c0, c1, c2) * (normalMatrix * normal) * (viewDet < 0.0 ? -1.0 : 1.0);
  }
  gl_Position = projectionMatrix * eye;
}`;

const NORMAL_FRAGMENT_GLSL = `
in vec3 vNormalPreview;
out vec4 outColor;
void main() {
  vec3 direction = vec3(0.0);
  float largest = max(max(abs(vNormalPreview.x), abs(vNormalPreview.y)), abs(vNormalPreview.z));
  if (largest > 0.0 && all(lessThanEqual(abs(vNormalPreview), vec3(3.0e38)))) {
    vec3 scaled = vNormalPreview / largest;
    direction = scaled * inversesqrt(dot(scaled, scaled));
  }
  direction *= gl_FrontFacing ? 1.0 : -1.0;
  outColor = vec4(clamp(direction * 0.5 + 0.5, 0.0, 1.0), 1.0);
}`;

const NORMAL_VERTEX_WGSL = `
// Reversed-depth WebGPU frames pass a native zero-to-one projection and set
// this pipeline override; other frames pass a minus-one-to-one projection.
override a3dZeroToOneProjection: bool = false;
struct NormalPreviewVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> NormalPreviewVertexOutput {
  let world = aura.u_modelMatrix * vec4<f32>(position, 1.0);
  let eye = aura.u_viewMatrix * world;
  let view0 = aura.u_viewMatrix[0].xyz;
  let view1 = aura.u_viewMatrix[1].xyz;
  let view2 = aura.u_viewMatrix[2].xyz;
  let c0 = cross(view1, view2);
  let c1 = cross(view2, view0);
  let c2 = cross(view0, view1);
  let viewDet = dot(view0, c0);
  let modelBasis = mat3x3<f32>(aura.u_modelMatrix[0].xyz, aura.u_modelMatrix[1].xyz, aura.u_modelMatrix[2].xyz);
  let modelDet = determinant(modelBasis);
  var output: NormalPreviewVertexOutput;
  output.normal = vec3<f32>(0.0);
  if (abs(viewDet) > 1.0e-12 && abs(viewDet) < 3.0e38 &&
      abs(modelDet) > 1.0e-12 && abs(modelDet) < 3.0e38) {
    let worldNormal = (aura.u_normalMatrix * vec4<f32>(normal, 0.0)).xyz;
    output.normal = mat3x3<f32>(c0, c1, c2) * worldNormal * select(-1.0, 1.0, viewDet > 0.0);
  }
  let clip = aura.u_projectionMatrix * eye;
  output.position = vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
  return output;
}`;

const NORMAL_FRAGMENT_WGSL = `
@fragment fn fs_main(@location(0) normal: vec3<f32>, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  var direction = vec3<f32>(0.0);
  let largest = max(max(abs(normal.x), abs(normal.y)), abs(normal.z));
  if (largest > 0.0 && all(abs(normal) <= vec3<f32>(3.0e38))) {
    let scaled = normal / largest;
    direction = scaled * inverseSqrt(dot(scaled, scaled));
  }
  direction *= select(-1.0, 1.0, front);
  return vec4<f32>(clamp(direction * 0.5 + vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

const MATCAP_FRAGMENT_GLSL = `
in vec3 vSpecialWorld;
in vec3 vSpecialNormal;
out vec4 outColor;
vec3 specialMatcapLinear(vec3 value) {
  vec3 lo = value / 12.92;
  vec3 hi = pow((value + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, lessThanEqual(value, vec3(0.04045)));
}
void main() {
  vec3 worldNormal = normalize(vSpecialNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 viewNormal = normalize(mat3(viewMatrix) * worldNormal);
  vec4 sampleColor = texture(matcapMap, viewNormal.xy * 0.5 + 0.5);
  vec3 rgb = matcapDecodeSrgb > 0.5 ? specialMatcapLinear(sampleColor.rgb) : sampleColor.rgb;
  outColor = vec4(rgb * matcapColor, sampleColor.a * matcapOpacity);
}`;

const MATCAP_FRAGMENT_WGSL = `
fn specialMatcapLinear(value: vec3<f32>) -> vec3<f32> {
  let low = value / 12.92;
  let high = pow((value + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return select(high, low, value <= vec3<f32>(0.04045));
}
@fragment fn fs_main(@location(1) normal: vec3<f32>, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  let n = normalize(normal) * select(-1.0, 1.0, front);
  let viewNormal = normalize((aura.u_viewMatrix * vec4<f32>(n, 0.0)).xyz);
  let sampleColor = textureSample(u_matcapMapTexture, u_matcapMapSampler, viewNormal.xy * 0.5 + vec2<f32>(0.5));
  let rgb = select(sampleColor.rgb, specialMatcapLinear(sampleColor.rgb), aura.u_matcapDecodeSrgb > 0.5);
  return vec4<f32>(rgb * aura.u_matcapColor, sampleColor.a * aura.u_matcapOpacity);
}`;

const PREVIEW_VERTEX_GLSL = `
out vec3 vPreviewWorld;
out float vPreviewDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 eye = viewMatrix * world;
  vPreviewWorld = world.xyz;
  vPreviewDepth = -eye.z;
  gl_Position = projectionMatrix * eye;
}`;

const PREVIEW_VERTEX_WGSL = `
struct PreviewVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) depth: f32,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> PreviewVertexOutput {
  let world = aura.u_modelMatrix * vec4<f32>(position, 1.0);
  let eye = aura.u_viewMatrix * world;
  var output: PreviewVertexOutput;
  output.world = world.xyz;
  output.depth = -eye.z;
  output.position = aura.u_projectionMatrix * eye;
  return output;
}`;

const DISTANCE_FRAGMENT_GLSL = `
in vec3 vPreviewWorld;
out vec4 outColor;
void main() {
  float value = clamp((length(vPreviewWorld - distanceOrigin) - distanceNear) / (distanceFar - distanceNear), 0.0, 1.0);
  outColor = vec4(vec3(value), 1.0);
}`;

const DISTANCE_FRAGMENT_WGSL = `
@fragment fn fs_main(@location(0) world: vec3<f32>) -> @location(0) vec4<f32> {
  let value = clamp((length(world - aura.u_distanceOrigin) - aura.u_distanceNear) / (aura.u_distanceFar - aura.u_distanceNear), 0.0, 1.0);
  return vec4<f32>(vec3<f32>(value), 1.0);
}`;

const SHADOW_FRAGMENT_GLSL = `
#include <a3d_shadow>
in vec3 vSpecialWorld;
in vec3 vSpecialNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vSpecialNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec4 lightClip = u_shadowMapMatrix * vec4(vSpecialWorld + n * u_shadowMapNormalBias, 1.0);
  float depth = lightClip.z / max(lightClip.w, 0.0001);
  float visibility = lightClip.w <= 0.0 || depth < -1.0 || depth > 1.0 ? 1.0 : a3dSunShadowAuto(vSpecialWorld, n);
  outColor = vec4(shadowColor, shadowOpacity * clamp(1.0 - visibility, 0.0, 1.0));
}`;

const SHADOW_FRAGMENT_WGSL = `
fn specialShadowVisibility(world: vec3<f32>, normal: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let light = normalize(aura.u_a3dSunDirection);
  let clip = aura.u_shadowMapMatrix * vec4<f32>(world + normal * aura.u_shadowMapNormalBias, 1.0);
  if (clip.w <= 0.0) { return 1.0; }
  let projected = clip.xyz / clip.w;
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0)) || projected.z < -1.0 || projected.z > 1.0) { return 1.0; }
  let cosine = clamp(abs(dot(normal, light)), 0.0, 1.0);
  let tangent = min(sqrt(max(1.0 - cosine * cosine, 0.0)) / max(cosine, 0.05), 8.0);
  let slope = tangent * aura.u_shadowMapSlopeBias * max(aura.u_shadowMapTexelSize.x, aura.u_shadowMapTexelSize.y);
  let depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  let count = clamp(i32(aura.u_shadowPcfSampleCount), 1, 32);
  var blocked = 0.0;
  var total = 0.0;
  for (var i = 0; i < count; i += 1) {
    let tap = aura.u_shadowPcfSamples[u32(i)];
    let offset = tap.xy * aura.u_shadowMapTexelSize;
    let sampleUv = vec2<f32>(uv.x + offset.x, 1.0 - uv.y - offset.y);
    let stored = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, sampleUv, 0.0).r;
    let bias = aura.u_shadowMapBias + slope * max(1.0, length(tap.xy));
    let weight = max(tap.z, 0.0);
    blocked += select(0.0, weight, depth - bias > stored);
    total += weight;
  }
  let occlusion = select(0.0, blocked / max(total, 0.00001), total > 0.0);
  return 1.0 - clamp(aura.u_shadowMapStrength, 0.0, 1.0) * occlusion;
}
@fragment fn fs_main(@location(0) world: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  let n = normalize(normal) * select(-1.0, 1.0, front);
  let visibility = specialShadowVisibility(world, n);
  return vec4<f32>(aura.u_shadowColor, aura.u_shadowOpacity * clamp(1.0 - visibility, 0.0, 1.0));
}`;

function punctualShadowFragmentGlsl(light: "point" | "spot"): string {
  const prefix = `u_${light}Shadow`;
  const projection = light === "point" ? `
  vec3 direction = abs(delta);
  int face = direction.x >= direction.y && direction.x >= direction.z
    ? (delta.x >= 0.0 ? 0 : 1)
    : direction.y >= direction.z ? (delta.y >= 0.0 ? 2 : 3) : (delta.z >= 0.0 ? 4 : 5);
  vec4 clip = u_pointShadowFaceMatrices[face] * vec4(world, 1.0);
  vec4 rect = u_pointShadowFaceRects[face];` : `
  if (dot(delta / radial, normalize(u_spotShadowLightDirection)) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 clip = u_spotShadowMatrix * vec4(world, 1.0);
  vec4 rect = vec4(0.0, 0.0, 1.0, 1.0);`;
  const shape = light === "point"
    ? "uniform mat4 u_pointShadowFaceMatrices[6];\nuniform vec4 u_pointShadowFaceRects[6];"
    : "uniform vec3 u_spotShadowLightDirection;\nuniform mat4 u_spotShadowMatrix;\nuniform vec2 u_spotShadowCone;";
  return `
uniform sampler2D ${prefix}MapTexture;
uniform float ${prefix}MapEnabled;
uniform vec3 ${prefix}LightPosition;
uniform float ${prefix}Range;
${shape}
uniform float ${prefix}Strength;
uniform float ${prefix}Bias;
uniform float ${prefix}SlopeBias;
uniform vec2 ${prefix}TexelSize;
uniform float ${prefix}PcfSampleCount;
uniform vec4 ${prefix}PcfSamples[32];
in vec3 vSpecialWorld;
in vec3 vSpecialNormal;
out vec4 outColor;
float specialPunctualVisibility(vec3 world, vec3 n) {
  if (${prefix}MapEnabled < 0.5) return 1.0;
  vec3 delta = world - ${prefix}LightPosition;
  float radial = length(delta);
  if (radial <= 0.00001 || radial > ${prefix}Range) return 1.0;
  ${projection}
  if (clip.w <= 0.0) return 1.0;
  vec3 projected = clip.xyz / clip.w;
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (any(lessThan(localUv, vec2(0.0))) || any(greaterThan(localUv, vec2(1.0))) || projected.z < -1.0 || projected.z > 1.0) return 1.0;
  vec2 uv = rect.xy + localUv * rect.zw;
  vec2 lower = rect.xy + ${prefix}TexelSize * 0.5;
  vec2 upper = max(lower, rect.xy + rect.zw - ${prefix}TexelSize * 0.5);
  float cosine = clamp(abs(dot(n, -delta / radial)), 0.0, 1.0);
  float tangent = min(sqrt(max(1.0 - cosine * cosine, 0.0)) / max(cosine, 0.05), 8.0);
  float slope = tangent * ${prefix}SlopeBias * max(${prefix}TexelSize.x, ${prefix}TexelSize.y);
  float depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  int count = clamp(int(${prefix}PcfSampleCount), 1, 32);
  float blocked = 0.0;
  float total = 0.0;
  for (int i = 0; i < 32; ++i) {
    if (i >= count) break;
    vec4 tap = ${prefix}PcfSamples[i];
    vec2 sampleUv = clamp(uv + tap.xy * ${prefix}TexelSize, lower, upper);
    float stored = texture(${prefix}MapTexture, sampleUv).r;
    float bias = ${prefix}Bias + slope * max(1.0, length(tap.xy));
    float weight = max(tap.z, 0.0);
    blocked += (depth - bias > stored ? weight : 0.0);
    total += weight;
  }
  float occlusion = total > 0.0 ? blocked / total : 0.0;
  return 1.0 - clamp(${prefix}Strength, 0.0, 1.0) * occlusion;
}
void main() {
  vec3 n = normalize(vSpecialNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float visibility = specialPunctualVisibility(vSpecialWorld, n);
  outColor = vec4(shadowColor, shadowOpacity * clamp(1.0 - visibility, 0.0, 1.0));
}`;
}

function punctualShadowFragmentWgsl(light: "point" | "spot"): string {
  const prefix = `u_${light}Shadow`;
  const projection = light === "point" ? `
  let axes = abs(delta);
  var face = 0u;
  if (axes.x >= axes.y && axes.x >= axes.z) {
    face = select(1u, 0u, delta.x >= 0.0);
  } else if (axes.y >= axes.z) {
    face = select(3u, 2u, delta.y >= 0.0);
  } else {
    face = select(5u, 4u, delta.z >= 0.0);
  }
  let clip = aura.u_pointShadowFaceMatrices[face] * vec4<f32>(world, 1.0);
  let rect = aura.u_pointShadowFaceRects[face];` : `
  if (dot(delta / radial, normalize(aura.u_spotShadowLightDirection)) < cos(aura.u_spotShadowCone.x)) { return 1.0; }
  let clip = aura.u_spotShadowMatrix * vec4<f32>(world, 1.0);
  let rect = vec4<f32>(0.0, 0.0, 1.0, 1.0);`;
  return `
fn specialPunctualVisibility(world: vec3<f32>, n: vec3<f32>) -> f32 {
  if (aura.${prefix}MapEnabled < 0.5) { return 1.0; }
  let delta = world - aura.${prefix}LightPosition;
  let radial = length(delta);
  if (radial <= 0.00001 || radial > aura.${prefix}Range) { return 1.0; }
  ${projection}
  if (clip.w <= 0.0) { return 1.0; }
  let projected = clip.xyz / clip.w;
  let localUv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (any(localUv < vec2<f32>(0.0)) || any(localUv > vec2<f32>(1.0)) || projected.z < -1.0 || projected.z > 1.0) { return 1.0; }
  let uv = rect.xy + localUv * rect.zw;
  let lower = rect.xy + aura.${prefix}TexelSize * 0.5;
  let upper = max(lower, rect.xy + rect.zw - aura.${prefix}TexelSize * 0.5);
  let cosine = clamp(abs(dot(n, -delta / radial)), 0.0, 1.0);
  let tangent = min(sqrt(max(1.0 - cosine * cosine, 0.0)) / max(cosine, 0.05), 8.0);
  let slope = tangent * aura.${prefix}SlopeBias * max(aura.${prefix}TexelSize.x, aura.${prefix}TexelSize.y);
  let depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  let count = clamp(i32(aura.${prefix}PcfSampleCount), 1, 32);
  var blocked = 0.0;
  var total = 0.0;
  for (var i = 0; i < count; i += 1) {
    let tap = aura.${prefix}PcfSamples[u32(i)];
    let sampleUv = clamp(uv + tap.xy * aura.${prefix}TexelSize, lower, upper);
    let stored = textureSampleLevel(${prefix}MapTextureTexture, ${prefix}MapTextureSampler, vec2<f32>(sampleUv.x, 1.0 - sampleUv.y), 0.0).r;
    let bias = aura.${prefix}Bias + slope * max(1.0, length(tap.xy));
    let weight = max(tap.z, 0.0);
    blocked += select(0.0, weight, depth - bias > stored);
    total += weight;
  }
  let occlusion = select(0.0, blocked / max(total, 0.00001), total > 0.0);
  return 1.0 - clamp(aura.${prefix}Strength, 0.0, 1.0) * occlusion;
}
@fragment fn fs_main(@location(0) world: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  let n = normalize(normal) * select(-1.0, 1.0, front);
  let visibility = specialPunctualVisibility(world, n);
  return vec4<f32>(aura.u_shadowColor, aura.u_shadowOpacity * clamp(1.0 - visibility, 0.0, 1.0));
}`;
}

function specialRange(near: number | undefined, far: number | undefined, defaultNear: number, owner: string): readonly [number, number] {
  const low = near === undefined ? defaultNear : near;
  const high = far === undefined ? 100 : far;
  if (!Number.isFinite(low) || low < 0 || !Number.isFinite(high) || !Number.isFinite(Math.fround(high)) || Math.fround(high) <= Math.fround(low)) {
    throw new RangeError(`${owner}: near and far must be finite, non-negative and distinct in float32, with far greater than near`);
  }
  return [low, high];
}

function specialOpacity(value: number | undefined, owner: string): number {
  const opacity = value === undefined ? 1 : value;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError(`${owner}: opacity must be finite and in [0, 1]`);
  return opacity;
}

function specialMaterial(spec: AuraCustomMaterialSpec, owner: string): AuraMaterialSpec {
  assertAuraCustomMaterialSpec(spec, owner);
  return { kind: "custom", custom: spec };
}

export function matcapMaterial(options: AuraMatcapMaterialOptions): AuraMaterialSpec {
  if (!options || !options.map) throw new TypeError("material.matcap: map must be a texture handle or typed texture asset");
  if (options.transparent !== undefined && typeof options.transparent !== "boolean") throw new TypeError("material.matcap: transparent must be a boolean");
  const opacity = specialOpacity(options.opacity, "material.matcap");
  return specialMaterial({
    glsl: { vertex: SPECIAL_SURFACE_VERTEX_GLSL, fragment: MATCAP_FRAGMENT_GLSL },
    wgsl: { vertex: SPECIAL_SURFACE_VERTEX_WGSL, fragment: MATCAP_FRAGMENT_WGSL },
    uniforms: {
      matcapMap: { type: "texture2d", value: options.map },
      matcapColor: { type: "vec3", value: [...linearRgb(options.color ?? "#ffffff")] },
      matcapOpacity: { type: "f32", value: opacity },
      matcapDecodeSrgb: { type: "f32", value: options.map.kind === "aura-asset-ref" ? 1 : 0 }
    },
    transparent: options.transparent === true || opacity < 1,
    ...(options.side === undefined ? {} : { side: options.side })
  }, "material.matcap");
}

/** Create an immutable native preview spec, not a custom-shader alias. */
export function depthPreviewMaterial(options: AuraDepthPreviewMaterialOptions = {}): AuraMaterialSpec {
  return Object.freeze({ kind: "depth-preview", depthPreview: Object.freeze(resolveDepthPreviewMaterialOptions(options)) });
}

export function normalMaterial(options: AuraNormalMaterialOptions = {}): AuraMaterialSpec {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("material.normal: options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (key !== "side") throw new TypeError(`material.normal: unsupported option '${key}'`);
  }
  const side = options.side === undefined ? "front" : options.side;
  if (side !== "front" && side !== "back" && side !== "double") {
    throw new RangeError("material.normal: side must be front, back, or double");
  }
  return specialMaterial({
    glsl: { vertex: NORMAL_VERTEX_GLSL, fragment: NORMAL_FRAGMENT_GLSL },
    wgsl: { vertex: NORMAL_VERTEX_WGSL, fragment: NORMAL_FRAGMENT_WGSL },
    side
  }, "material.normal");
}

export function distanceMaterial(options: AuraDistanceMaterialOptions = {}): AuraMaterialSpec {
  const [near, far] = specialRange(options.near, options.far, 0, "material.distance");
  const origin = options.referencePosition === undefined ? [0, 0, 0] : options.referencePosition;
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
    throw new RangeError("material.distance: referencePosition must contain three finite float32 values");
  }
  return specialMaterial({
    glsl: { vertex: PREVIEW_VERTEX_GLSL, fragment: DISTANCE_FRAGMENT_GLSL },
    wgsl: { vertex: PREVIEW_VERTEX_WGSL, fragment: DISTANCE_FRAGMENT_WGSL },
    uniforms: {
      distanceOrigin: { type: "vec3", value: [...origin] },
      distanceNear: { type: "f32", value: near },
      distanceFar: { type: "f32", value: far }
    },
    ...(options.side === undefined ? {} : { side: options.side })
  }, "material.distance");
}

export function shadowMaterial(options: AuraShadowMaterialOptions = {}): AuraMaterialSpec {
  const opacity = specialOpacity(options.opacity, "material.shadow");
  const light = options.light === undefined ? "directional" : options.light;
  if (light !== "directional" && light !== "point" && light !== "spot") {
    throw new RangeError("material.shadow: light must be directional, point, or spot");
  }
  return specialMaterial({
    glsl: { vertex: SPECIAL_SURFACE_VERTEX_GLSL, fragment: light === "directional" ? SHADOW_FRAGMENT_GLSL : punctualShadowFragmentGlsl(light) },
    wgsl: { vertex: SPECIAL_SURFACE_VERTEX_WGSL, fragment: light === "directional" ? SHADOW_FRAGMENT_WGSL : punctualShadowFragmentWgsl(light) },
    uniforms: {
      shadowColor: { type: "vec3", value: [...linearRgb(options.color ?? "#000000")] },
      shadowOpacity: { type: "f32", value: opacity }
    },
    transparent: true,
    depthWrite: false,
    ...(options.side === undefined ? {} : { side: options.side })
  }, "material.shadow");
}

export const material = lazyNamespace(() => ({
  /**
   * threejs-parity SH-02 (L1): three-style custom shader material. `spec.glsl`
   * is required (GLSL is authoritative — `createAuraApp` mounts WebGL2);
   * `spec.wgsl` is optional and runs only on the WebGPU backend. Validation is
   * synchronous: a malformed or WGSL-only spec throws `invalid-material-spec`
   * here rather than at mount.
   */
  custom: (spec: AuraCustomMaterialSpec): AuraMaterialSpec => {
    assertAuraCustomMaterialSpec(spec);
    return { kind: "custom", custom: spec };
  },
  /**
   * GU47 E-D: cel-shaded material (`AuraToonMaterialOptions`): every scene light banded into `steps` between
   * `shadowColor` and `color` (or through a `ramp` texture), hemisphere fill, optional `rim`, scene fog, shadows.
   */
  toon: (options: AuraToonMaterialOptions = {}): AuraMaterialSpec => toonMaterial(options),
  /** Lane 514: height-banded rock layers with slope-based cliff colouring (`AuraStrataMaterialOptions`). */
  strata: strataMaterial,
  /** Lane 514: lit floor with an animated water-caustic pattern (`AuraCausticsMaterialOptions`). */
  caustics: causticsMaterial,
  /** Lane 514: soft additive beam shader for a cone or cylinder (`AuraLightBeamMaterialOptions`). */
  lightBeam: lightBeamMaterial,
  matcap: matcapMaterial,
  /** Linear view-depth grayscale; see AuraDepthPreviewMaterialOptions for supported paths and limits. */
  depth: depthPreviewMaterial,
  /** View-space normal RGB preview; see AuraNormalMaterialOptions for supported paths and limits. */
  normal: normalMaterial,
  distance: distanceMaterial,
  shadow: shadowMaterial,
  /** Node material from a persistent graph or the existing TSL expression API. */
  node: (options: TslMaterialNodeOptions | ShaderGraphMaterialOptions): AuraMaterialSpec => {
    if ("graph" in options) return shaderGraphMaterial(options);
    // Keep the established GLSL path for its imperative Fn/If/Loop surface.
    // New output channels and WGSL use the typed graph adapter.
    if (options.backend === "wgsl" || options.normalNode !== undefined || options.roughnessNode !== undefined || options.metalnessNode !== undefined) {
      const migrated = migrateTslShaderGraph(options);
      return shaderGraphMaterial({
        graph: migrated.graph,
        uniforms: migrated.uniforms,
        backend: options.backend,
        transparent: options.transparent,
        depthWrite: options.depthWrite,
        depthTest: options.depthTest,
        side: options.side,
        blending: options.blending,
        fog: options.fog,
        defines: options.defines
      });
    }
    return materialNode(options);
  },
  pbr: (rawOptions: AuraMaterialSpec = {}): AuraMaterialSpec => {
    // E3-06: three.js spellings (`transparent`, `side`) normalise to the canonical options; unsupported guesses are noted.
    const { options, notes: guessNotes } = normalizeThreeMaterialAliases("material.pbr", rawOptions);
    for (const key of ["color", "emissive", "sheenColor", "specularColor", "attenuationColor"] as const) {
      assertAuraColorOption((options as Record<string, unknown>)[key], `material.pbr({ ${key} })`);
    }
    if (options.iridescenceThicknessRange !== undefined || options.iridescenceThicknessMinimum !== undefined ||
        options.iridescenceThicknessMaximum !== undefined) {
      resolveIridescenceThickness(options);
    }
    return noteMaterialGuesses(noteUnrenderedOptions("material.pbr", options, resolveMaterialSpecDefaults({
      color: "#d7dee8",
      roughness: 0.55,
      metallic: options.metallic ?? options.metalness ?? 0,
      metalness: options.metalness ?? options.metallic ?? 0
    }, options)), guessNotes);
  },
  /**
   * 5.4 N7: three.js `MeshStandardMaterial` spelling (`color`, `roughness`, `metalness`, `emissive`, `map` ...).
   * Identical to `material.pbr(options)`, including the three.js option normalisation and its OPTION_IGNORED notes.
   */
  standard: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.pbr(options),
  /**
   * Film thickness endpoints are in nanometres. Explicit minimum/maximum
   * override the corresponding legacy range entries; omitted endpoints use
   * the range or the renderer defaults (100/400), respectively.
   */
  physical: (options: AuraMaterialSpec = {}): AuraMaterialSpec => {
    // P3 (muse3jsparity-PRD): the sync factory stays scalar (C1 decision —
    // no renderer change); extension params validate through the physical
    // matrix and every non-supported request rides the spec as a warning.
    const defined = PHYSICAL_SPEC_KEYS.reduce<Record<string, unknown>>((picked, key) => {
      const value = (options as Record<string, unknown>)[key];
      if (value !== undefined) picked[key] = value;
      return picked;
    }, {});
    const result = createPhysicalMaterialSpec(defined);
    const normalized = PHYSICAL_SPEC_KEYS.reduce<Record<string, unknown>>((picked, key) => {
      const value = (result.spec as Record<string, unknown>)[key];
      if (value !== undefined && (options as Record<string, unknown>)[key] !== undefined) picked[key] = value;
      return picked;
    }, {});
    return {
      ...material.pbr(options),
      ...normalized,
      ...(result.boundedWarnings.length > 0 ? { physicalWarnings: [...result.boundedWarnings] } : {})
    };
  },
  emissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#111827",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    roughness: options.roughness ?? 0.35,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    practical: options.practical ?? true
  }, options),
  metal: (rawOptions: AuraMaterialSpec = {}): AuraMaterialSpec => {
    const { options, notes } = normalizeThreeMaterialAliases("material.metal", rawOptions);
    return noteMaterialGuesses(noteUnrenderedOptions("material.metal", options, resolveMaterialSpecDefaults({
      color: options.color ?? "#dce6ee",
      roughness: options.roughness ?? 0.12,
      metallic: options.metallic ?? options.metalness ?? 1,
      metalness: options.metalness ?? options.metallic ?? 1,
      clearcoat: options.clearcoat ?? 0.12,
      clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
      envMapIntensity: options.envMapIntensity ?? 1.45
    }, options)), notes);
  },
  rubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#111317",
    roughness: options.roughness ?? 0.86,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0
  }, options),
  glass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#d8f2ff",
    roughness: options.roughness ?? 0.04,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    opacity: options.opacity ?? 0.24,
    transmission: options.transmission ?? 1,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    thickness: options.thickness ?? 0.74,
    ior: options.ior ?? 1.48,
    attenuationColor: options.attenuationColor ?? options.color ?? "#d8f2ff",
    attenuationDistance: options.attenuationDistance ?? 0.85,
    envMapIntensity: options.envMapIntensity ?? 1.85
  }, options),
  clearcoat: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#e8edf5",
    roughness: options.roughness ?? 0.16,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    envMapIntensity: options.envMapIntensity ?? 1.35
  }, options),
  neon: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#0a1020",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    emissiveIntensity: options.emissiveIntensity ?? 2.8,
    roughness: options.roughness ?? 0.18,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    practical: options.practical ?? true
  }, options),
  reflectiveFloor: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#05070d",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 0.35,
    metalness: options.metalness ?? options.metallic ?? 0.35,
    clearcoat: options.clearcoat ?? 0.7,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.25
  }, options),
  solarSun: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    name: options.name ?? "solar sun shader material",
    shader: "solar-sun",
    color: options.color ?? "#ffd166",
    coreColor: options.coreColor ?? "#fff7ad",
    rimColor: options.rimColor ?? "#f97316",
    emissive: options.emissive ?? options.color ?? "#ffd166",
    emissiveIntensity: options.emissiveIntensity ?? 2.45,
    noiseStrength: options.noiseStrength ?? 0.18,
    roughness: options.roughness ?? 0.18
  }, options),
  solarCorona: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    name: options.name ?? "solar corona shader material",
    shader: "solar-corona",
    color: options.color ?? "#ff9f1c",
    coreColor: options.coreColor ?? "#ffd166",
    rimColor: options.rimColor ?? "#f97316",
    emissive: options.emissive ?? options.color ?? "#ff9f1c",
    emissiveIntensity: options.emissiveIntensity ?? 1.55,
    opacity: options.opacity ?? 0.36,
    falloff: options.falloff ?? 2.7,
    noiseStrength: options.noiseStrength ?? 0.14,
    roughness: options.roughness ?? 0.35
  }, options),
  fabric: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#d8dde6",
    roughness: options.roughness ?? 0.92,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.42,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 18, strength: 0.42, contrast: 0.62 }),
    sheen: options.sheen ?? 0.45,
    sheenRoughness: options.sheenRoughness ?? 0.78
  }, options),
  chrome: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "chrome",
    color: options.color ?? "#f8fbff",
    roughness: options.roughness ?? 0.018,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.22,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 2
  }, options, material.metal),
  brushedMetal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "brushed metal",
    color: options.color ?? "#d9e2ea",
    roughness: options.roughness ?? 0.28,
    anisotropy: options.anisotropy ?? 0.86,
    anisotropyRotation: options.anisotropyRotation ?? 1.5708,
    normal: options.normal ?? proceduralTexture("brushed-metal-anisotropy", { scale: 36, strength: 0.38, contrast: 0.7, direction: [1, 0, 0] }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("brushed-metal-anisotropy", { scale: 42, strength: 0.44, contrast: 0.64, direction: [1, 0, 0] }),
    envMapIntensity: options.envMapIntensity ?? 1.55
  }, options, material.metal),
  frostedGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "frosted glass",
    color: options.color ?? "#d8f7ff",
    roughness: options.roughness ?? 0.42,
    opacity: options.opacity ?? 0.46,
    transmission: options.transmission ?? 0.72,
    thickness: options.thickness ?? 0.88,
    normal: options.normal ?? proceduralTexture("plastic-micro-scratch", { scale: 24, strength: 0.24, contrast: 0.5 }),
    envMapIntensity: options.envMapIntensity ?? 1.28
  }, options, material.glass),
  clearGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "clear glass",
    color: options.color ?? "#c8f4ff",
    roughness: options.roughness ?? 0.015,
    opacity: options.opacity ?? 0.2,
    transmission: options.transmission ?? 1,
    thickness: options.thickness ?? 0.9,
    ior: options.ior ?? 1.5,
    envMapIntensity: options.envMapIntensity ?? 2.05
  }, options, material.glass),
  /**
   * Polished metal that reads as metal without tuning: full metalness, clearcoat-free reflection, and a hint so a scene
   * with no `environments.*` node binds the structured softbox probe (a near-uniform probe leaves a mirror nothing to
   * reflect). Pair with `environments.studio({ preset: "softbox" })` to say it explicitly. Wraps `material.metal`;
   * every option still overrides.
   */
  studioMetal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => markStudioMaterial(presetFrom({
    name: options.name ?? "studio metal",
    color: options.color ?? "#d9dee5",
    roughness: options.roughness ?? 0.16,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0,
    envMapIntensity: options.envMapIntensity ?? 1
  }, options, material.metal)),
  /**
   * Clear glass that stays visible: physical transmission with `ior` and `thickness`, a faint `tint` carried by the
   * absorption colour, and the same softbox hint. `createAuraApp` also turns physical transmission on for a scene that
   * uses it (a source that sets `A3D_QR_MATERIALS_TRANSMISSION` explicitly wins). Glass shows the opaque scene behind it
   * plus reflections, so it needs something behind it and something to reflect; against a plain white backdrop and a
   * uniform probe it is invisible. Wraps `material.glass`; every option still overrides.
   */
  studioGlass: (options: AuraMaterialSpec & { readonly tint?: AuraColor } = {}): AuraMaterialSpec => {
    const { tint, ...rest } = options;
    return markStudioMaterial(presetFrom({
      name: rest.name ?? "studio glass",
      color: rest.color ?? tint ?? "#eaf6ff",
      roughness: rest.roughness ?? 0.01,
      opacity: rest.opacity ?? 1,
      transmission: rest.transmission ?? 1,
      thickness: rest.thickness ?? 0.8,
      ior: rest.ior ?? 1.5,
      clearcoat: rest.clearcoat ?? 0,
      attenuationColor: rest.attenuationColor ?? tint ?? "#a8d8ec",
      attenuationDistance: rest.attenuationDistance ?? 1.4,
      envMapIntensity: rest.envMapIntensity ?? 1.25
    }, rest, material.glass));
  },
  blackRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "black rubber",
    color: options.color ?? "#0b0d11",
    roughness: options.roughness ?? 0.98,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 28, strength: 0.34, contrast: 0.76 }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("rubber-roughness", { scale: 32, strength: 0.8, contrast: 0.86 }),
    envMapIntensity: options.envMapIntensity ?? 0.22
  }, options, material.rubber),
  matteClay: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "matte clay",
    color: options.color ?? "#b98f73",
    roughness: options.roughness ?? 0.94,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.28
  }, options, material.pbr),
  ceramic: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "glazed ceramic",
    color: options.color ?? "#f3f7fb",
    roughness: options.roughness ?? 0.22,
    clearcoat: options.clearcoat ?? 0.78,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.18
  }, options, material.clearcoat),
  glowingEmissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "glowing emissive",
    color: options.color ?? "#ff42c8",
    emissive: options.emissive ?? options.color ?? "#ff42c8",
    emissiveIntensity: options.emissiveIntensity ?? 3.4,
    roughness: options.roughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 0.3
  }, options, material.emissive),
  clearcoatPaint: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "clearcoat paint",
    color: options.color ?? "#ef233c",
    roughness: options.roughness ?? 0.055,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 1.62
  }, options, material.clearcoat),
  sneakerMesh: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "sneaker mesh",
    color: options.color ?? "#dbeafe",
    roughness: options.roughness ?? 0.88,
    sheen: options.sheen ?? 0.34,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 34, strength: 0.48, contrast: 0.72 }),
    envMapIntensity: options.envMapIntensity ?? 0.36
  }, options, material.fabric),
  sneakerRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "sneaker rubber",
    color: options.color ?? "#111827",
    roughness: options.roughness ?? 0.93,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 24, strength: 0.42, contrast: 0.7 }),
    envMapIntensity: options.envMapIntensity ?? 0.26
  }, options, material.blackRubber),
  /**
   * #84 (R-14-14 §8.6, Bank Shot): billiard felt. A pure C-03 sheen lobe over a rough diffuse base,
   * with the fabric procedural normal for the nap. No clearcoat, no metal.
   */
  felt: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "felt",
    color: options.color ?? "#0f5132",
    roughness: options.roughness ?? 0.94,
    sheen: options.sheen ?? 0.82,
    sheenRoughness: options.sheenRoughness ?? 0.62,
    sheenColor: options.sheenColor ?? options.color ?? "#3f8f6a",
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 48, strength: 0.28, contrast: 0.55 }),
    envMapIntensity: options.envMapIntensity ?? 0.32
  }, options, material.fabric),
  /**
   * #84 (R-14-14 §8.6, Bank Shot rails): high-gloss lacquered wood/plastic. A dielectric base under a
   * C-03 clearcoat lobe; colour and roughness stay authored-overridable.
   */
  lacquer: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "lacquer",
    color: options.color ?? "#5b1a12",
    roughness: options.roughness ?? 0.38,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.03,
    envMapIntensity: options.envMapIntensity ?? 1.2
  }, options, material.clearcoat),
  /**
   * #84 (R-14-14 §8.6, Turbo Drift): metallic car paint. A semi-metal base coat under a C-03
   * clearcoat lobe. The flake normal is not a procedural kind yet (#84 follow-up); the base
   * roughness carries the metallic sparkle spread meanwhile.
   */
  carPaint: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "car paint",
    color: options.color ?? "#b91c1c",
    roughness: options.roughness ?? 0.32,
    metallic: options.metallic ?? options.metalness ?? 0.65,
    metalness: options.metalness ?? options.metallic ?? 0.65,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.02,
    envMapIntensity: options.envMapIntensity ?? 1.5
  }, options, material.clearcoat),
  /**
   * #80 (R-14-14 §8.1) / #258: planet surface presets, delegating to the solar-system preset table
   * (`nodes/solar.ts`) so both entry points share one definition. Caller options override the preset.
   */
  planet: (preset: AuraSolarPlanetMaterialPreset = "rocky", options: AuraMaterialSpec = {}): AuraMaterialSpec =>
    // Every preset field (not just `name`) is marked preset-defaulted unless the caller supplies it.
    resolveMaterialSpecDefaults({ ...solarPlanetMaterial(preset), name: `planet ${preset}` }, options),
  /**
   * #80 (R-14-14 §8.1): atmosphere / shield shell for a slightly larger sphere around a planet.
   * Translucent, emissive, unlit-looking (roughness 1, no env): the §8.1 fallback without a rim
   * term. The rim falloff lobe is #88.
   */
  atmosphere: (options: AuraMaterialSpec = {}): AuraMaterialSpec => presetFrom({
    name: options.name ?? "atmosphere",
    color: options.color ?? "#60a5fa",
    emissive: options.emissive ?? options.color ?? "#60a5fa",
    emissiveIntensity: options.emissiveIntensity ?? 0.6,
    opacity: options.opacity ?? 0.28,
    roughness: options.roughness ?? 1,
    envMapIntensity: options.envMapIntensity ?? 0
  }, options, material.emissive),
  proceduralTexture,
  proceduralTextures: {
    fabric: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("fabric-normal", { scale: 18, strength: 0.42, contrast: 0.62, ...options }),
    rubber: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("rubber-roughness", { scale: 28, strength: 0.7, contrast: 0.82, ...options }),
    brushedMetal: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("brushed-metal-anisotropy", { scale: 42, strength: 0.44, contrast: 0.68, direction: [1, 0, 0], ...options }),
    plastic: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("plastic-micro-scratch", { scale: 22, strength: 0.26, contrast: 0.5, ...options })
  },
  parameters: (name: string, spec: AuraMaterialSpec): AuraEditableMaterialParameters => ({
    kind: "aura-material-parameters",
    name,
    material: spec,
    roughness: spec.roughness ?? 0.55,
    metallic: spec.metallic ?? spec.metalness ?? 0,
    metalness: spec.metalness ?? spec.metallic ?? 0,
    transmission: spec.transmission ?? 0,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0,
    thickness: spec.thickness ?? 0,
    ior: spec.ior ?? 1.5,
    sheen: spec.sheen ?? 0,
    iridescence: spec.iridescence ?? 0,
    anisotropy: spec.anisotropy ?? 0,
    envMapIntensity: spec.envMapIntensity ?? 1,
    emissiveIntensity: spec.emissiveIntensity ?? 0
  }),
  fromParameters: (parameters: AuraEditableMaterialParameters): AuraMaterialSpec => ({
    ...parameters.material,
    roughness: parameters.roughness,
    metallic: parameters.metallic,
    metalness: parameters.metalness,
    transmission: parameters.transmission,
    clearcoat: parameters.clearcoat,
    clearcoatRoughness: parameters.clearcoatRoughness,
    thickness: parameters.thickness,
    ior: parameters.ior,
    sheen: parameters.sheen,
    iridescence: parameters.iridescence,
    anisotropy: parameters.anisotropy,
    envMapIntensity: parameters.envMapIntensity,
    emissiveIntensity: parameters.emissiveIntensity
  }),
  labParameters: (): readonly AuraEditableMaterialParameters[] => [
    material.parameters("chrome", material.chrome()),
    material.parameters("glass", material.clearGlass()),
    material.parameters("rubber", material.blackRubber()),
    material.parameters("emissive", material.glowingEmissive({ color: "#ff4bd8", emissive: "#ff4bd8", emissiveIntensity: 3.2 })),
    material.parameters("clearcoat", material.clearcoatPaint({ color: "#ef4444" }))
  ],
  presets: (): Readonly<Record<string, AuraMaterialSpec>> => ({
    chrome: material.chrome(),
    brushedMetal: material.brushedMetal(),
    frostedGlass: material.frostedGlass(),
    clearGlass: material.clearGlass(),
    blackRubber: material.blackRubber(),
    matteClay: material.matteClay(),
    ceramic: material.ceramic(),
    glowingEmissive: material.glowingEmissive(),
    clearcoatPaint: material.clearcoatPaint(),
    sneakerMesh: material.sneakerMesh(),
    sneakerRubber: material.sneakerRubber(),
    fabric: material.fabric(),
    felt: material.felt(),
    lacquer: material.lacquer(),
    carPaint: material.carPaint()
  }),
  inspector: (name: string, spec: AuraMaterialSpec): AuraMaterialInspectorPanel => createMaterialInspector(name, spec),
  /**
   * @deprecated Name-heuristic check (#192, PRD-13 T1.11): every result carries
   * `deprecated: true, kind: "structural-name-heuristic"`. Use `structuralQA.material` instead.
   */
  visualQA: (nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult => validateMaterialVisualQA(nodes),
  capabilityDiagnostics: (input?: AuraMaterialCapabilityInput): AuraMaterialCapabilityDiagnostics =>
    createMaterialCapabilityDiagnostics(input)
} as const));
