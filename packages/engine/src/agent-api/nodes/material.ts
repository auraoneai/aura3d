// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEditableMaterialParameters, AuraMaterialCapabilityDiagnostics, AuraMaterialCapabilityInput, AuraMaterialInspectorPanel, AuraMaterialSpec, AuraMaterialVisualQAResult, AuraProceduralTextureSpec, AuraSceneNode } from "../nodes/types.js";
import { PHYSICAL_SPEC_KEYS, createMaterialCapabilityDiagnostics, createMaterialInspector, proceduralTexture } from "../nodes/materialTools.js";
import { neon } from "../nodes/neon.js";
import { createPhysicalMaterialSpec } from "../../material-physical/PhysicalMaterialSpec.js";
import { validateMaterialVisualQA } from "../looks/structuralQA.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const material = lazyNamespace(() => ({
  pbr: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: "#d7dee8",
    roughness: 0.55,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
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
  emissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111827",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    roughness: options.roughness ?? 0.35,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
  metal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#dce6ee",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 1.45,
    ...options
  }),
  rubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111317",
    roughness: options.roughness ?? 0.86,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
  glass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
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
    envMapIntensity: options.envMapIntensity ?? 1.85,
    ...options
  }),
  clearcoat: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#e8edf5",
    roughness: options.roughness ?? 0.16,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    envMapIntensity: options.envMapIntensity ?? 1.35,
    ...options
  }),
  neon: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#0a1020",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    emissiveIntensity: options.emissiveIntensity ?? 2.8,
    roughness: options.roughness ?? 0.18,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    ...options
  }),
  reflectiveFloor: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#05070d",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 0.35,
    metalness: options.metalness ?? options.metallic ?? 0.35,
    clearcoat: options.clearcoat ?? 0.7,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.25,
    ...options
  }),
  solarSun: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    name: options.name ?? "solar sun shader material",
    shader: "solar-sun",
    color: options.color ?? "#ffd166",
    coreColor: options.coreColor ?? "#fff7ad",
    rimColor: options.rimColor ?? "#f97316",
    emissive: options.emissive ?? options.color ?? "#ffd166",
    emissiveIntensity: options.emissiveIntensity ?? 2.45,
    noiseStrength: options.noiseStrength ?? 0.18,
    roughness: options.roughness ?? 0.18,
    ...options
  }),
  solarCorona: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
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
    roughness: options.roughness ?? 0.35,
    ...options
  }),
  fabric: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#d8dde6",
    roughness: options.roughness ?? 0.92,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.42,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 18, strength: 0.42, contrast: 0.62 }),
    sheen: options.sheen ?? 0.45,
    sheenRoughness: options.sheenRoughness ?? 0.78,
    ...options
  }),
  chrome: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.metal({
    name: options.name ?? "chrome",
    color: options.color ?? "#f8fbff",
    roughness: options.roughness ?? 0.018,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.22,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 2,
    ...options
  }),
  brushedMetal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.metal({
    name: options.name ?? "brushed metal",
    color: options.color ?? "#d9e2ea",
    roughness: options.roughness ?? 0.28,
    anisotropy: options.anisotropy ?? 0.86,
    anisotropyRotation: options.anisotropyRotation ?? 1.5708,
    normal: options.normal ?? proceduralTexture("brushed-metal-anisotropy", { scale: 36, strength: 0.38, contrast: 0.7, direction: [1, 0, 0] }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("brushed-metal-anisotropy", { scale: 42, strength: 0.44, contrast: 0.64, direction: [1, 0, 0] }),
    envMapIntensity: options.envMapIntensity ?? 1.55,
    ...options
  }),
  frostedGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.glass({
    name: options.name ?? "frosted glass",
    color: options.color ?? "#d8f7ff",
    roughness: options.roughness ?? 0.42,
    opacity: options.opacity ?? 0.46,
    transmission: options.transmission ?? 0.72,
    thickness: options.thickness ?? 0.88,
    normal: options.normal ?? proceduralTexture("plastic-micro-scratch", { scale: 24, strength: 0.24, contrast: 0.5 }),
    envMapIntensity: options.envMapIntensity ?? 1.28,
    ...options
  }),
  clearGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.glass({
    name: options.name ?? "clear glass",
    color: options.color ?? "#c8f4ff",
    roughness: options.roughness ?? 0.015,
    opacity: options.opacity ?? 0.2,
    transmission: options.transmission ?? 1,
    thickness: options.thickness ?? 0.9,
    ior: options.ior ?? 1.5,
    envMapIntensity: options.envMapIntensity ?? 2.05,
    ...options
  }),
  blackRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.rubber({
    name: options.name ?? "black rubber",
    color: options.color ?? "#0b0d11",
    roughness: options.roughness ?? 0.98,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 28, strength: 0.34, contrast: 0.76 }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("rubber-roughness", { scale: 32, strength: 0.8, contrast: 0.86 }),
    envMapIntensity: options.envMapIntensity ?? 0.22,
    ...options
  }),
  matteClay: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.pbr({
    name: options.name ?? "matte clay",
    color: options.color ?? "#b98f73",
    roughness: options.roughness ?? 0.94,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.28,
    ...options
  }),
  ceramic: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.clearcoat({
    name: options.name ?? "glazed ceramic",
    color: options.color ?? "#f3f7fb",
    roughness: options.roughness ?? 0.22,
    clearcoat: options.clearcoat ?? 0.78,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.18,
    ...options
  }),
  glowingEmissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.emissive({
    name: options.name ?? "glowing emissive",
    color: options.color ?? "#ff42c8",
    emissive: options.emissive ?? options.color ?? "#ff42c8",
    emissiveIntensity: options.emissiveIntensity ?? 3.4,
    roughness: options.roughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 0.3,
    ...options
  }),
  clearcoatPaint: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.clearcoat({
    name: options.name ?? "clearcoat paint",
    color: options.color ?? "#ef233c",
    roughness: options.roughness ?? 0.055,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 1.62,
    ...options
  }),
  sneakerMesh: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.fabric({
    name: options.name ?? "sneaker mesh",
    color: options.color ?? "#dbeafe",
    roughness: options.roughness ?? 0.88,
    sheen: options.sheen ?? 0.34,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 34, strength: 0.48, contrast: 0.72 }),
    envMapIntensity: options.envMapIntensity ?? 0.36,
    ...options
  }),
  sneakerRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.blackRubber({
    name: options.name ?? "sneaker rubber",
    color: options.color ?? "#111827",
    roughness: options.roughness ?? 0.93,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 24, strength: 0.42, contrast: 0.7 }),
    envMapIntensity: options.envMapIntensity ?? 0.26,
    ...options
  }),
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
    fabric: material.fabric()
  }),
  inspector: (name: string, spec: AuraMaterialSpec): AuraMaterialInspectorPanel => createMaterialInspector(name, spec),
  visualQA: (nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult => validateMaterialVisualQA(nodes),
  capabilityDiagnostics: (input?: AuraMaterialCapabilityInput): AuraMaterialCapabilityDiagnostics =>
    createMaterialCapabilityDiagnostics(input)
} as const));
