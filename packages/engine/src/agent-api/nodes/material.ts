// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// PRD-04 P2-10 (R15): presets record their defaulted fields via AURA_PRESET_DEFAULTS.

import type { AuraCustomMaterialSpec, AuraCustomUniformSpec, AuraEditableMaterialParameters, AuraMaterialCapabilityDiagnostics, AuraMaterialCapabilityInput, AuraMaterialInspectorPanel, AuraMaterialSpec, AuraMaterialVisualQAResult, AuraProceduralTextureSpec, AuraSceneNode, AuraToonMaterialOptions } from "../nodes/types.js";
import { assertAuraCustomMaterialSpec } from "../compiler/customMaterial.js";
import { parseAuraColor } from "../../contracts/sceneGraph.js";
import { materialNode } from "./tsl/index.js";
import { PHYSICAL_SPEC_KEYS, createMaterialCapabilityDiagnostics, createMaterialInspector, proceduralTexture } from "../nodes/materialTools.js";
import { neon } from "../nodes/neon.js";
import { createPhysicalMaterialSpec } from "../../material-physical/PhysicalMaterialSpec.js";
import { validateMaterialVisualQA } from "../looks/structuralQA.js";
import { lazyNamespace } from "../lazyNamespace.js";
import type { AuraSolarPlanetMaterialPreset } from "../nodes/types.js";
import { solarPlanetMaterial } from "../nodes/solar.js";


/**
 * PRD-04 P2-10 (R15): enumerable symbol on preset-produced material specs. Its value is the set of
 * spec field names that came from the preset's own defaults rather than the caller's options, so the
 * flag-on override lowering (C-15, §7.2) can ignore preset-defaulted values — most importantly
 * `spec.color`, which the legacy tint bridge treated as authored intent even when it was a stock
 * preset colour.
 */
export const AURA_PRESET_DEFAULTS: unique symbol = Symbol.for("aura3d.presetDefaults");

/** Merge `defaults` with `options` and mark which resulting fields the user did not supply. */
export function resolveMaterialSpecDefaults(defaults: AuraMaterialSpec, options: AuraMaterialSpec): AuraMaterialSpec {
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
  /**
   * SH-01 (L1-11): TSL-subset node material — `colorNode/emissiveNode/opacityNode/positionNode`
   * graphs built with `tsl.*` lower to a GLSL `material.custom` spec. GLSL only; see `tsl`.
   */
  node: materialNode,
  pbr: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: "#d7dee8",
    roughness: 0.55,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0
  }, options),
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
  metal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => resolveMaterialSpecDefaults({
    color: options.color ?? "#dce6ee",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 1.45
  }, options),
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
