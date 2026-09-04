/**
 * Game-ready material preset library (PART C2).
 *
 * Six compact presets tuned for real-time routes. Each preset carries its
 * authoring parameters, a root-API example snippet, a tunables table, and
 * probe metadata (geometry + environment + probe screenshot path).
 *
 * Claim boundary: these are parameter presets over the public material spec.
 * The skin entry is a wrapped-diffuse approximation and is never presented
 * as physical subsurface scattering.
 */

export type GameReadyMaterialKind =
  | "carPaint"
  | "skinSSS-approx"
  | "glassThin"
  | "brushedMetal"
  | "foliage"
  | "concreteAsphalt";

export interface GameReadyMaterialTunable {
  readonly name: string;
  readonly default: number | string;
  readonly range: string;
  readonly effect: string;
}

export interface GameReadyMaterialProbe {
  readonly geometry: "sphere" | "beveled-cube" | "thin-pane" | "card";
  readonly environmentId: string;
  readonly screenshot: string;
}

export interface GameReadyMaterialPreset {
  readonly id: string;
  readonly label: string;
  readonly kind: GameReadyMaterialKind;
  readonly features: readonly string[];
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
  readonly exampleSnippet: string;
  readonly tunables: readonly GameReadyMaterialTunable[];
  readonly probe: GameReadyMaterialProbe;
  readonly note: string;
}

const REPORT_DIR = "tests/reports/game-ready-materials";

export const GAME_READY_MATERIAL_PRESETS: readonly GameReadyMaterialPreset[] = [
  {
    id: "carPaint",
    label: "Car paint (clearcoat + flake normal)",
    kind: "carPaint",
    features: ["clearcoat", "flake normal"],
    parameters: {
      baseColor: [0.62, 0.03, 0.06],
      metallic: 0.65,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      flakeNormalScale: 0.35,
      flakeDensity: 0.6
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// carPaint preset values: clearcoat shell over a metallic base,",
      "// flakeNormalScale rides the normal slot as a fine sparkle normal.",
      "const paint = material.clearcoatPaint({",
      '  color: "#c1121f",',
      "  roughness: 0.32,",
      "  metallic: 0.65,",
      "  clearcoat: 1,",
      "  clearcoatRoughness: 0.06,",
      "  normalScale: 0.35,",
      "  envMapIntensity: 1.4",
      "});",
      "scene().add(primitives.sphere({ name: \"car body panel\", material: paint }));"
    ].join("\n"),
    tunables: [
      { name: "clearcoat", default: 1, range: "0..1", effect: "Top-gloss shell strength; lower to dull the finish." },
      { name: "clearcoatRoughness", default: 0.06, range: "0..0.3", effect: "Sharpness of clearcoat reflections." },
      { name: "flakeNormalScale", default: 0.35, range: "0..1", effect: "Metallic-flake sparkle intensity via the flake normal." },
      { name: "flakeDensity", default: 0.6, range: "0..1", effect: "Flake coverage; raise for glitter, lower for solid gloss." },
      { name: "roughness", default: 0.32, range: "0.05..0.7", effect: "Base-coat spread under the clearcoat shell." },
      { name: "metallic", default: 0.65, range: "0..1", effect: "Base-coat metalness; lower for candy/dielectric looks." }
    ],
    probe: { geometry: "beveled-cube", environmentId: "industrial-sunset-puresky", screenshot: `${REPORT_DIR}/carPaint.png` },
    note: "Clearcoat shell plus flake normal; tune flakeDensity down under dim environments."
  },
  {
    id: "skinSSS-approx",
    label: "Skin (wrapped-diffuse approximation)",
    kind: "skinSSS-approx",
    features: ["wrapped diffuse", "thickness tint"],
    parameters: {
      baseColor: [0.85, 0.55, 0.42],
      roughness: 0.55,
      wrapDiffuse: 0.5,
      thicknessTint: [0.98, 0.35, 0.25],
      thicknessScale: 0.8
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// skinSSS-approx preset values: wrapped-diffuse approximation with a",
      "// warm thickness tint. Approximation only, not physical scattering.",
      "const skin = material.pbr({",
      '  color: "#d98c6b",',
      "  roughness: 0.55,",
      "  metallic: 0,",
      '  emissive: "#fa5940",',
      "  emissiveIntensity: 0.12,",
      "  envMapIntensity: 0.5",
      "});",
      "// wrapDiffuse 0.5 softens the terminator; thicknessTint warms thin areas.",
      "scene().add(primitives.sphere({ name: \"character head\", material: skin }));"
    ].join("\n"),
    tunables: [
      { name: "wrapDiffuse", default: 0.5, range: "0..1", effect: "Light wrap around the terminator; higher looks softer." },
      { name: "thicknessTint", default: "[0.98, 0.35, 0.25]", range: "color", effect: "Warm tint for thin areas (ears, nose, fingers)." },
      { name: "thicknessScale", default: 0.8, range: "0..2", effect: "Strength of the thickness tint contribution." },
      { name: "roughness", default: 0.55, range: "0.3..0.8", effect: "Skin sheen; lower reads oily, higher reads dry." },
      { name: "emissiveIntensity", default: 0.12, range: "0..0.4", effect: "Stand-in glow for transmitted warmth; keep subtle." }
    ],
    probe: { geometry: "sphere", environmentId: "showroom-softboxes", screenshot: `${REPORT_DIR}/skinSSS-approx.png` },
    note: "Wrapped-diffuse approximation only; never presented as physical scattering."
  },
  {
    id: "glassThin",
    label: "Thin glass (transmission, thin-walled)",
    kind: "glassThin",
    features: ["transmission", "thin-walled"],
    parameters: {
      baseColor: [0.75, 0.9, 0.95],
      roughness: 0.05,
      transmission: 0.9,
      thickness: 0.02,
      ior: 1.5,
      opacity: 0.35
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// glassThin preset values: high transmission with near-zero thickness",
      "// for windows, visors, and display covers.",
      "const thinGlass = material.clearGlass({",
      '  color: "#bfe6f2",',
      "  opacity: 0.35,",
      "  transmission: 0.9,",
      "  thickness: 0.02,",
      "  roughness: 0.05",
      "});",
      "scene().add(primitives.box({ name: \"visor pane\", material: thinGlass }));"
    ].join("\n"),
    tunables: [
      { name: "transmission", default: 0.9, range: "0..1", effect: "See-through strength; lower for smoked glass." },
      { name: "thickness", default: 0.02, range: "0..0.1", effect: "Refraction volume; keep near zero for thin panes." },
      { name: "roughness", default: 0.05, range: "0..0.4", effect: "Raise for frosted or dirty glass." },
      { name: "ior", default: 1.5, range: "1..2.5", effect: "Index of refraction for edge bending." },
      { name: "opacity", default: 0.35, range: "0..1", effect: "Blend fallback where transmission is unavailable." }
    ],
    probe: { geometry: "thin-pane", environmentId: "studio-small-08", screenshot: `${REPORT_DIR}/glassThin.png` },
    note: "Thin-walled panes only; use the full glass preset for solid volumes."
  },
  {
    id: "brushedMetal",
    label: "Brushed metal (anisotropic)",
    kind: "brushedMetal",
    features: ["anisotropy", "brushed roughness"],
    parameters: {
      baseColor: [0.72, 0.74, 0.78],
      metalness: 1,
      roughness: 0.38,
      anisotropy: 0.85,
      anisotropyRotation: 1.5708,
      brushScale: 42
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// brushedMetal preset values: full metal with directional anisotropy",
      "// so highlights stretch along the brush direction.",
      "const brushed = material.pbr({",
      '  color: "#b8bcc2",',
      "  roughness: 0.38,",
      "  metallic: 1,",
      "  anisotropy: 0.85,",
      "  anisotropyRotation: 1.5708,",
      "  envMapIntensity: 1.3",
      "});",
      "scene().add(primitives.box({ name: \"brushed housing\", material: brushed }));"
    ].join("\n"),
    tunables: [
      { name: "anisotropy", default: 0.85, range: "0..1", effect: "Highlight stretch along the brush direction." },
      { name: "anisotropyRotation", default: 1.5708, range: "0..6.2832", effect: "Brush direction in radians." },
      { name: "roughness", default: 0.38, range: "0.1..0.7", effect: "Brush coarseness; higher blurs the streak." },
      { name: "brushScale", default: 42, range: "8..128", effect: "Procedural brush texture tiling density." },
      { name: "envMapIntensity", default: 1.3, range: "0..3", effect: "Reflection punch under studio lighting." }
    ],
    probe: { geometry: "beveled-cube", environmentId: "showroom-softboxes", screenshot: `${REPORT_DIR}/brushedMetal.png` },
    note: "Rotate anisotropyRotation to match the mesh UV brush direction."
  },
  {
    id: "foliage",
    label: "Foliage (alpha-cutout + translucency)",
    kind: "foliage",
    features: ["alpha-cutout", "translucency"],
    parameters: {
      baseColor: [0.25, 0.45, 0.18],
      alphaMode: "mask",
      alphaCutoff: 0.5,
      translucency: 0.6,
      translucencyColor: [0.55, 0.8, 0.3],
      side: "double"
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// foliage preset values: alpha-cutout cards with backlit translucency.",
      "// alphaCutoff discards background texels; translucency lifts sun-side leaves.",
      "const leaf = material.pbr({",
      '  color: "#40732e",',
      "  roughness: 0.85,",
      "  metallic: 0,",
      '  emissive: "#8ccc4d",',
      "  emissiveIntensity: 0.25,",
      "  opacity: 1",
      "});",
      "// Apply alphaMode mask with alphaCutoff 0.5 on the card texture,",
      "// and translucency 0.6 toward the sun color for backlight.",
      "scene().add(primitives.plane({ name: \"leaf card\", material: leaf }));"
    ].join("\n"),
    tunables: [
      { name: "alphaCutoff", default: 0.5, range: "0..1", effect: "Cutout threshold; lower keeps soft edges, higher trims them." },
      { name: "translucency", default: 0.6, range: "0..1", effect: "Backlight lift when the sun is behind the leaves." },
      { name: "translucencyColor", default: "[0.55, 0.8, 0.3]", range: "color", effect: "Tint of transmitted backlight." },
      { name: "roughness", default: 0.85, range: "0.5..1", effect: "Leaf matte response; rarely below 0.5 outdoors." },
      { name: "side", default: "double", range: "front | double", effect: "Cards need double-sided rendering." }
    ],
    probe: { geometry: "card", environmentId: "showroom-softboxes", screenshot: `${REPORT_DIR}/foliage.png` },
    note: "Cards only; pair with alphaCutoff-matched mip bias to avoid edge crawl."
  },
  {
    id: "concreteAsphalt",
    label: "Concrete / asphalt (roughness variation)",
    kind: "concreteAsphalt",
    features: ["roughness variation", "aggregate normal"],
    parameters: {
      baseColor: [0.32, 0.33, 0.35],
      roughness: 0.85,
      roughnessVariation: 0.25,
      normalScale: 0.9,
      aggregateScale: 18
    },
    exampleSnippet: [
      'import { material, primitives, scene } from "@aura3d/engine";',
      "",
      "// concreteAsphalt preset values: high roughness broken up by",
      "// roughnessVariation so large ground planes avoid a flat CG look.",
      "const asphalt = material.pbr({",
      '  color: "#525458",',
      "  roughness: 0.85,",
      "  metallic: 0,",
      "  normalScale: 0.9,",
      "  envMapIntensity: 0.35",
      "});",
      "// roughnessVariation 0.25 modulates roughness per aggregate patch.",
      "scene().add(primitives.plane({ name: \"road surface\", material: asphalt }));"
    ].join("\n"),
    tunables: [
      { name: "roughnessVariation", default: 0.25, range: "0..0.5", effect: "Patch-to-patch roughness breakup; higher looks weathered." },
      { name: "roughness", default: 0.85, range: "0.6..1", effect: "Mean roughness; rarely below 0.6 for ground." },
      { name: "normalScale", default: 0.9, range: "0..1.5", effect: "Aggregate bump strength." },
      { name: "aggregateScale", default: 18, range: "4..64", effect: "Aggregate grain tiling density." },
      { name: "envMapIntensity", default: 0.35, range: "0..1", effect: "Keep low so ground stays matte under studio light." }
    ],
    probe: { geometry: "sphere", environmentId: "showroom-softboxes", screenshot: `${REPORT_DIR}/concreteAsphalt.png` },
    note: "Variation is load-bearing: without it large planes read as flat CG."
  }
];

export const GAME_READY_MATERIAL_IDS: readonly string[] = GAME_READY_MATERIAL_PRESETS.map((preset) => preset.id);

export function listGameReadyMaterials(): readonly GameReadyMaterialPreset[] {
  return GAME_READY_MATERIAL_PRESETS;
}

export function findGameReadyMaterial(id: string): GameReadyMaterialPreset | undefined {
  return GAME_READY_MATERIAL_PRESETS.find((preset) => preset.id === id);
}
