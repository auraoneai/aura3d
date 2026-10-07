import { Material } from "./Material";
import { PBRMaterial, type PBRMaterialOptions } from "./PBRMaterial";
import { UnlitMaterial, type UnlitMaterialOptions } from "./UnlitMaterial";
import { TexturedPBRMaterial } from "./TexturedPBRMaterial";
import { type ProceduralTextureFixtureKind, createProceduralTexture } from "./ProceduralTexture";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./cinematic/CinematicEvidence";

export type MaterialPresetKind = "unlit" | "pbr" | string;
export type PhysicalMaterialPresetName =
  | "gold"
  | "silver"
  | "copper"
  | "iron"
  | "aluminum"
  | "plastic"
  | "rubber"
  | "wood"
  | "concrete"
  | "fabric"
  | "glass"
  | "water"
  | "skin"
  | "eye"
  | "hair"
  | "terrain"
  | "toon";

export type MaterialPresetOptions = Readonly<Record<string, unknown>>;

export type MaterialFactory<TOptions extends MaterialPresetOptions = MaterialPresetOptions> = (options?: TOptions) => Material;

export interface MaterialPresetDescriptor<TOptions extends MaterialPresetOptions = MaterialPresetOptions> {
  readonly kind: MaterialPresetKind;
  readonly description?: string;
  readonly create: MaterialFactory<TOptions>;
}

export interface PhysicalMaterialPresetDescriptor {
  readonly name: PhysicalMaterialPresetName;
  readonly category: "metal" | "dielectric" | "fabric" | "transmission" | "subsurface" | "anisotropic" | "terrain" | "npr";
  readonly source: "old-branch-material-presets";
  readonly options: PBRMaterialOptions;
  readonly knownLimits: readonly string[];
}

export class MaterialPresetRegistry {
  private readonly presets = new Map<MaterialPresetKind, MaterialPresetDescriptor>();

  constructor(descriptors: readonly MaterialPresetDescriptor[] = defaultMaterialPresets()) {
    for (const descriptor of descriptors) {
      this.register(descriptor);
    }
  }

  register<TOptions extends MaterialPresetOptions>(descriptor: MaterialPresetDescriptor<TOptions>): void {
    if (!descriptor.kind.trim()) {
      throw new Error("Material preset kind is required.");
    }
    if (this.presets.has(descriptor.kind)) {
      throw new Error(`Material preset already exists: ${descriptor.kind}`);
    }
    this.presets.set(descriptor.kind, descriptor as MaterialPresetDescriptor);
  }

  create<TOptions extends MaterialPresetOptions = MaterialPresetOptions>(kind: MaterialPresetKind, options?: TOptions): Material {
    const descriptor = this.presets.get(kind);
    if (!descriptor) {
      throw new Error(`Unknown material preset: ${kind}`);
    }
    return descriptor.create(options);
  }

  has(kind: MaterialPresetKind): boolean {
    return this.presets.has(kind);
  }

  list(): readonly MaterialPresetDescriptor[] {
    return [...this.presets.values()];
  }
}

export function defaultMaterialPresets(): readonly MaterialPresetDescriptor[] {
  return [
    {
      kind: "unlit",
      description: "Constant color material for debug, UI, and non-lighting-dependent geometry.",
      create: (options?: MaterialPresetOptions) => new UnlitMaterial(options as UnlitMaterialOptions)
    },
    {
      kind: "pbr",
      description: "Direct-light physically based material with base color, metallic, roughness, and emissive controls.",
      create: (options?: MaterialPresetOptions) => new PBRMaterial(options as PBRMaterialOptions)
    },
    ...listPhysicalMaterialPresets().map((preset): MaterialPresetDescriptor => ({
      kind: `physical:${preset.name}`,
      description: `Old-branch physical material preset port for ${preset.name}.`,
      create: (options?: MaterialPresetOptions) => createPhysicalMaterialPreset(preset.name, options as Partial<PBRMaterialOptions>)
    }))
  ];
}

export function listPhysicalMaterialPresets(): readonly PhysicalMaterialPresetDescriptor[] {
  return physicalMaterialPresets;
}

export function physicalMaterialPresetDescriptor(name: PhysicalMaterialPresetName): PhysicalMaterialPresetDescriptor {
  const descriptor = physicalMaterialPresets.find((entry) => entry.name === name);
  if (!descriptor) throw new Error(`Unknown physical material preset: ${name}`);
  return descriptor;
}

export function createPhysicalMaterialPreset(name: PhysicalMaterialPresetName, overrides: Partial<PBRMaterialOptions> = {}): PBRMaterial {
  const descriptor = physicalMaterialPresetDescriptor(name);
  return new PBRMaterial({
    ...descriptor.options,
    ...overrides,
    name: overrides.name ?? descriptor.options.name ?? `physical-${name}`
  });
}

const physicalMaterialPresets: readonly PhysicalMaterialPresetDescriptor[] = [
  physicalPreset("gold", "metal", {
    baseColor: [1, 0.782, 0.344, 1],
    metallic: 1,
    roughness: 0.2,
    specularFactor: 1
  }, ["Gold F0/albedo values are clamped into the current [0,1] PBR parameter range."]),
  physicalPreset("silver", "metal", {
    baseColor: [0.972, 0.96, 0.915, 1],
    metallic: 1,
    roughness: 0.15,
    specularFactor: 1
  }, ["Silver preset uses the current direct PBR shader and generated environment resources, not measured spectral data."]),
  physicalPreset("copper", "metal", {
    baseColor: [0.955, 0.638, 0.538, 1],
    metallic: 1,
    roughness: 0.25,
    specularFactor: 1
  }, ["Copper preset uses bounded RGB material response rather than wavelength-dependent metal reflectance."]),
  physicalPreset("iron", "metal", {
    baseColor: [0.56, 0.57, 0.58, 1],
    metallic: 1,
    roughness: 0.4,
    specularFactor: 0.9
  }, ["Iron preset is a bounded rough metal preset without oxidation or anisotropic brushing."]),
  physicalPreset("aluminum", "metal", {
    baseColor: [0.913, 0.921, 0.925, 1],
    metallic: 1,
    roughness: 0.3,
    specularFactor: 0.95
  }, ["Aluminum preset is isotropic; brushed anisotropy must be enabled through a separate material."]),
  physicalPreset("plastic", "dielectric", {
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    specularFactor: 0.55
  }, ["Plastic preset is a neutral dielectric baseline without measured polymer BRDF."]),
  physicalPreset("rubber", "dielectric", {
    baseColor: [0.2, 0.2, 0.2, 1],
    metallic: 0,
    roughness: 0.9,
    specularFactor: 0.25
  }, ["Rubber preset is a rough dark dielectric; subsurface or tire-specific normal detail is supplied by procedural texture fixtures."]),
  physicalPreset("wood", "dielectric", {
    baseColor: [0.6, 0.4, 0.2, 1],
    metallic: 0,
    roughness: 0.7,
    specularFactor: 0.35
  }, ["Wood preset captures bounded base response; grain detail comes from procedural wood textures."]),
  physicalPreset("concrete", "dielectric", {
    baseColor: [0.5, 0.5, 0.5, 1],
    metallic: 0,
    roughness: 0.85,
    specularFactor: 0.22
  }, ["Concrete preset is a rough dielectric response without aggregate displacement."]),
  physicalPreset("fabric", "fabric", {
    baseColor: [0.5, 0.3, 0.2, 1],
    metallic: 0,
    roughness: 0.8,
    sheenColorFactor: [0.42, 0.28, 0.22],
    sheenRoughnessFactor: 0.3,
    specularFactor: 0.28
  }, ["Fabric ports old cloth sheen intent into current bounded sheen parameters; fiber scattering parity is not claimed."]),
  physicalPreset("glass", "transmission", {
    baseColor: [1, 1, 1, 0.62],
    roughness: 0,
    transmissionFactor: 1,
    transmissionFallbackEnergy: 0.18,
    volumeThicknessFactor: 0.5,
    volumeAttenuationDistance: 12,
    volumeAttenuationColor: [0.94, 0.98, 1],
    ior: 1.5,
    specularFactor: 1,
    renderState: { blend: true, depthWrite: false, cullMode: "none" }
  }, ["Glass is a bounded transmission fallback in WebGL2; refraction ray marching and Unity/Unreal glass parity remain blocked."]),
  physicalPreset("water", "transmission", {
    baseColor: [0, 0.3, 0.5, 0.72],
    roughness: 0.08,
    transmissionFactor: 0.58,
    diffuseTransmissionFactor: 0.18,
    diffuseTransmissionColorFactor: [0.2, 0.72, 1],
    volumeThicknessFactor: 0.35,
    volumeAttenuationDistance: 5,
    volumeAttenuationColor: [0.1, 0.45, 0.72],
    ior: 1.333,
    specularFactor: 0.92,
    renderState: { blend: true, depthWrite: false, cullMode: "none" }
  }, ["Water ports old ocean color/reflectivity intent; waves, foam, planar reflection, and caustics are not claimed by this preset."]),
  physicalPreset("skin", "subsurface", {
    baseColor: [0.95, 0.8, 0.7, 1],
    roughness: 0.4,
    diffuseTransmissionFactor: 0.32,
    diffuseTransmissionColorFactor: [1, 0.5, 0.3],
    transmissionFallbackEnergy: 0.1,
    sheenColorFactor: [0.55, 0.28, 0.2],
    sheenRoughnessFactor: 0.46,
    specularFactor: 0.46
  }, ["Skin ports old subsurface color intent into bounded diffuse-transmission parameters; production SSS is not claimed."]),
  physicalPreset("eye", "subsurface", {
    baseColor: [1, 1, 1, 1],
    roughness: 0.1,
    diffuseTransmissionFactor: 0.24,
    diffuseTransmissionColorFactor: [0.8, 0.5, 0.5],
    clearcoatFactor: 0.75,
    clearcoatRoughnessFactor: 0.04,
    specularFactor: 1
  }, ["Eye preset combines bounded clearcoat and diffuse transmission; cornea/iris layered geometry is not included."]),
  physicalPreset("hair", "anisotropic", {
    baseColor: [0.3, 0.2, 0.1, 1],
    roughness: 0.32,
    anisotropyStrength: 0.78,
    anisotropyRotation: -0.15,
    sheenColorFactor: [0.5, 0.34, 0.18],
    sheenRoughnessFactor: 0.48,
    specularFactor: 0.72
  }, ["Hair ports old anisotropic highlight intent; Marschner-style strand scattering is not claimed."]),
  physicalPreset("terrain", "terrain", {
    baseColor: [0.34, 0.44, 0.22, 1],
    metallic: 0,
    roughness: 0.88,
    specularFactor: 0.24,
    environmentColor: [0.42, 0.48, 0.34],
    environmentIntensity: 0.12,
    sheenColorFactor: [0.14, 0.22, 0.1],
    sheenRoughnessFactor: 0.72
  }, ["Terrain ports old multi-layer terrain material intent into a bounded rough dielectric preset; splat maps, triplanar blending, and distance texture LOD are not claimed."]),
  physicalPreset("toon", "npr", {
    baseColor: [0.92, 0.58, 0.16, 1],
    metallic: 0,
    roughness: 0.64,
    specularFactor: 0.5,
    clearcoatFactor: 0.24,
    clearcoatRoughnessFactor: 0.18,
    emissiveColor: [0.08, 0.035, 0.005],
    emissiveStrength: 0.55
  }, ["Toon ports old cel-shading/rim-light material intent into bounded current PBR and emissive parameters; discrete lighting bands, outline rendering, and hatching are not claimed."])
];

function physicalPreset(
  name: PhysicalMaterialPresetName,
  category: PhysicalMaterialPresetDescriptor["category"],
  options: PBRMaterialOptions,
  knownLimits: readonly string[]
): PhysicalMaterialPresetDescriptor {
  return {
    name,
    category,
    source: "old-branch-material-presets",
    options: {
      name: `physical-${name}`,
      ...options
    },
    knownLimits
  };
}


// Merged verbatim from ./cinematic/CinematicMaterialPresets.ts (PRD-15 T6.6, owner 07, APPLIED BY LANE 15)

export type CinematicMaterialPresetId =
  | "wet-pavement"
  | "neon-emissive"
  | "hero-prop-glow"
  | "rain-dark-metal"
  | "cinematic-set-concrete";

export interface CinematicMaterialPreset {
  readonly id: CinematicMaterialPresetId;
  readonly label: string;
  readonly pbr: PBRMaterialOptions;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly approximatedFeatures: readonly string[];
  readonly diagnostics: readonly string[];
}

const MATERIAL_PRESETS: Readonly<Record<CinematicMaterialPresetId, Omit<CinematicMaterialPreset, "rendererOwnedEvidence">>> = {
  "wet-pavement": {
    id: "wet-pavement",
    label: "Wet pavement",
    pbr: {
      name: "cinematic/wet-pavement",
      baseColor: [0.035, 0.04, 0.045, 1],
      metallic: 0,
      roughness: 0.18,
      clearcoatFactor: 0.72,
      clearcoatRoughnessFactor: 0.08,
      environmentMapIntensity: 0.65,
      environmentMapSpecularIntensity: 0.9
    },
    approximatedFeatures: ["screen-space puddle breakup is represented by glossy PBR response until a normal-map texture is bound"],
    diagnostics: ["Wet pavement is renderer-owned PBR material data, not a CSS shine overlay."]
  },
  "neon-emissive": {
    id: "neon-emissive",
    label: "Neon emissive",
    pbr: {
      name: "cinematic/neon-emissive",
      baseColor: [0.05, 0.78, 1, 1],
      metallic: 0,
      roughness: 0.22,
      emissiveColor: [0.05, 0.78, 1],
      emissiveStrength: 4.8
    },
    approximatedFeatures: [],
    diagnostics: ["Neon proof is an emissive renderer material and can drive bloom/practical light evidence."]
  },
  "hero-prop-glow": {
    id: "hero-prop-glow",
    label: "Hero prop glow",
    pbr: {
      name: "cinematic/hero-prop-glow",
      baseColor: [0.42, 0.95, 1, 1],
      metallic: 0,
      roughness: 0.28,
      emissiveColor: [0.18, 0.82, 1],
      emissiveStrength: 2.6,
      clearcoatFactor: 0.25
    },
    approximatedFeatures: ["subsurface scattering is approximated with emissive PBR color"],
    diagnostics: ["Hero prop glow is real material data and must not be replaced by a DOM halo."]
  },
  "rain-dark-metal": {
    id: "rain-dark-metal",
    label: "Rain dark metal",
    pbr: {
      name: "cinematic/rain-dark-metal",
      baseColor: [0.32, 0.34, 0.36, 1],
      metallic: 0.82,
      roughness: 0.24,
      clearcoatFactor: 0.48,
      clearcoatRoughnessFactor: 0.12
    },
    approximatedFeatures: ["water beads require texture/normal detail from the route asset to be fully represented"],
    diagnostics: ["Metal wetness is encoded as PBR parameters."]
  },
  "cinematic-set-concrete": {
    id: "cinematic-set-concrete",
    label: "Cinematic set concrete",
    pbr: {
      name: "cinematic/set-concrete",
      baseColor: [0.23, 0.24, 0.25, 1],
      metallic: 0,
      roughness: 0.62,
      environmentMapIntensity: 0.22,
      environmentMapSpecularIntensity: 0.32
    },
    approximatedFeatures: [],
    diagnostics: ["Set material is renderer-owned PBR scene content."]
  }
};

export function listCinematicMaterialPresets(): readonly CinematicMaterialPreset[] {
  return (Object.keys(MATERIAL_PRESETS) as CinematicMaterialPresetId[]).map(createCinematicMaterialPreset);
}

export function createCinematicMaterialPreset(id: CinematicMaterialPresetId): CinematicMaterialPreset {
  const preset = MATERIAL_PRESETS[id];
  return {
    ...preset,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `material:${id}`,
      feature: "material",
      label: preset.label,
      source: "renderer-material",
      diagnostics: preset.diagnostics
    })
  };
}

export function createCinematicPBRMaterial(id: CinematicMaterialPresetId, overrides: PBRMaterialOptions = {}): PBRMaterial {
  const preset = createCinematicMaterialPreset(id);
  return new PBRMaterial({
    ...preset.pbr,
    ...overrides,
    name: overrides.name ?? preset.pbr.name
  });
}

export function resolveCinematicMaterialPresetId(tags: readonly string[]): CinematicMaterialPresetId {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.some((tag) => tag.includes("neon") || tag.includes("emissive"))) return "neon-emissive";
  if (lower.some((tag) => tag.includes("flower") || tag.includes("hero") || tag.includes("glow"))) return "hero-prop-glow";
  if (lower.some((tag) => tag.includes("metal") || tag.includes("robot"))) return "rain-dark-metal";
  if (lower.some((tag) => tag.includes("wet") || tag.includes("pavement") || tag.includes("rain"))) return "wet-pavement";
  return "cinematic-set-concrete";
}

// Merged verbatim from ./ArchitecturalMaterialCatalog.ts (PRD-15 T6.6, owner 01, APPLIED BY LANE 15)

export type ArchitecturalMaterialCategory = "wood" | "stone" | "metal" | "fabric" | "glass" | "ceramic";

export interface ArchitecturalMaterialDescriptor {
  readonly id: string;
  readonly label: string;
  readonly category: ArchitecturalMaterialCategory;
  readonly baseColor: readonly [number, number, number, number];
  readonly roughness: number;
  readonly metallic: number;
  readonly normalStrength: number;
  readonly ambientOcclusion: number;
  readonly alpha?: number;
  readonly textureFixture?: ProceduralTextureFixtureKind;
  readonly knownLimits: readonly string[];
}

export interface ArchitecturalMaterialCatalogSummary {
  readonly materialCount: number;
  readonly categories: readonly ArchitecturalMaterialCategory[];
  readonly categoryCounts: Readonly<Record<ArchitecturalMaterialCategory, number>>;
  readonly texturedMaterialCount: number;
  readonly source: "origin-master-examples-arch-viz-material-library-adapted";
  readonly claimBoundary: string;
}

const knownLimits = [
  "Adapted from the old arch-viz material library as deterministic current-engine PBR presets.",
  "These are procedural/local material presets, not scanned production material assets or Unity/Unreal physical material parity evidence."
] as const;

const catalog = [
  material("oak", "Oak Wood", "wood", [0.545, 0.396, 0.259, 1], 0.65, 0, 0.8, 0.85, "wood-plank"),
  material("walnut", "Walnut Wood", "wood", [0.361, 0.239, 0.176, 1], 0.6, 0, 0.75, 0.8, "wood-plank"),
  material("pine", "Pine Wood", "wood", [0.816, 0.694, 0.502, 1], 0.7, 0, 0.6, 0.9, "wood-plank"),
  material("mahogany", "Mahogany Wood", "wood", [0.502, 0.227, 0.145, 1], 0.55, 0, 0.7, 0.82, "wood-plank"),
  material("birch", "Birch Wood", "wood", [0.937, 0.878, 0.737, 1], 0.68, 0, 0.5, 0.92, "wood-plank"),
  material("teak", "Teak Wood", "wood", [0.682, 0.478, 0.278, 1], 0.5, 0, 0.65, 0.88, "wood-plank"),
  material("marble-carrara", "Carrara Marble", "stone", [0.94, 0.93, 0.91, 1], 0.25, 0, 0.4, 0.95, "marble"),
  material("granite-black", "Black Granite", "stone", [0.12, 0.12, 0.13, 1], 0.15, 0, 0.3, 0.7, "marble"),
  material("limestone", "Limestone", "stone", [0.847, 0.812, 0.729, 1], 0.75, 0, 0.6, 0.85, "concrete-asphalt"),
  material("concrete", "Polished Concrete", "stone", [0.502, 0.502, 0.502, 1], 0.6, 0, 0.5, 0.8, "concrete-asphalt"),
  material("slate", "Slate Stone", "stone", [0.259, 0.275, 0.29, 1], 0.7, 0, 0.7, 0.75, "concrete-asphalt"),
  material("sandstone", "Sandstone", "stone", [0.761, 0.643, 0.467, 1], 0.8, 0, 0.65, 0.83, "concrete-asphalt"),
  material("chrome", "Polished Chrome", "metal", [0.549, 0.556, 0.554, 1], 0.05, 1, 0.1, 1),
  material("steel-brushed", "Brushed Steel", "metal", [0.651, 0.651, 0.651, 1], 0.3, 1, 0.4, 0.95, "sci-fi-panel"),
  material("copper", "Polished Copper", "metal", [0.955, 0.637, 0.538, 1], 0.2, 1, 0.2, 0.98),
  material("brass", "Polished Brass", "metal", [0.875, 0.78, 0.455, 1], 0.25, 1, 0.15, 0.97),
  material("aluminum", "Brushed Aluminum", "metal", [0.913, 0.921, 0.925, 1], 0.35, 1, 0.3, 0.96, "sci-fi-panel"),
  material("metal-black", "Matte Black Metal", "metal", [0.02, 0.02, 0.02, 1], 0.6, 1, 0.2, 0.75),
  material("cotton", "Cotton Fabric", "fabric", [0.863, 0.859, 0.847, 1], 0.85, 0, 0.6, 0.88),
  material("velvet", "Velvet Fabric", "fabric", [0.122, 0.161, 0.267, 1], 0.9, 0, 0.8, 0.7),
  material("leather", "Leather", "fabric", [0.435, 0.286, 0.184, 1], 0.55, 0, 0.5, 0.82),
  material("linen", "Linen Fabric", "fabric", [0.906, 0.878, 0.831, 1], 0.88, 0, 0.7, 0.86),
  material("wool", "Wool Fabric", "fabric", [0.584, 0.541, 0.494, 1], 0.92, 0, 0.75, 0.84),
  material("glass-clear", "Clear Glass", "glass", [0.95, 0.95, 0.95, 0.38], 0.05, 0, 0.1, 1),
  material("glass-frosted", "Frosted Glass", "glass", [0.9, 0.9, 0.9, 0.62], 0.4, 0, 0.6, 0.95),
  material("glass-tinted", "Tinted Glass", "glass", [0.651, 0.753, 0.769, 0.58], 0.08, 0, 0.1, 0.98),
  material("glass-smoked", "Smoked Glass", "glass", [0.275, 0.275, 0.275, 0.52], 0.1, 0, 0.1, 0.85),
  material("ceramic-white", "White Ceramic", "ceramic", [0.961, 0.961, 0.961, 1], 0.15, 0, 0.2, 0.98),
  material("terracotta", "Terracotta", "ceramic", [0.729, 0.376, 0.278, 1], 0.7, 0, 0.5, 0.85),
  material("tile-glazed", "Glazed Tile", "ceramic", [0.847, 0.831, 0.804, 1], 0.12, 0, 0.15, 0.96),
  material("porcelain", "Porcelain", "ceramic", [0.941, 0.933, 0.922, 1], 0.18, 0, 0.25, 0.97)
] as const satisfies readonly ArchitecturalMaterialDescriptor[];

export function createArchitecturalMaterialCatalog(): readonly ArchitecturalMaterialDescriptor[] {
  return catalog;
}

export function architecturalMaterialCatalogSummary(): ArchitecturalMaterialCatalogSummary {
  const categories = ["wood", "stone", "metal", "fabric", "glass", "ceramic"] as const;
  return {
    materialCount: catalog.length,
    categories,
    categoryCounts: Object.fromEntries(categories.map((category) => [
      category,
      catalog.filter((entry) => entry.category === category).length
    ])) as Readonly<Record<ArchitecturalMaterialCategory, number>>,
    texturedMaterialCount: catalog.filter((entry) => entry.textureFixture).length,
    source: "origin-master-examples-arch-viz-material-library-adapted",
    claimBoundary: "Catalog proves a deterministic local architectural material taxonomy for browser examples; it does not prove scanned material, Unity, or Unreal parity."
  };
}

export function architecturalMaterialDescriptor(id: string): ArchitecturalMaterialDescriptor {
  const descriptor = catalog.find((entry) => entry.id === id);
  if (!descriptor) throw new RangeError(`Unknown architectural material preset: ${id}`);
  return descriptor;
}

export function createArchitecturalMaterial(id: string): PBRMaterial | TexturedPBRMaterial {
  const descriptor = architecturalMaterialDescriptor(id);
  const renderState = descriptor.category === "glass"
    ? { cullMode: "none" as const, blend: true, depthWrite: false }
    : { cullMode: "none" as const };
  if (descriptor.textureFixture) {
    return new TexturedPBRMaterial({
      name: `architectural-${descriptor.id}`,
      baseColor: descriptor.baseColor,
      baseColorTexture: createProceduralTexture(descriptor.textureFixture, { width: 96, height: 96, label: `architectural-${descriptor.id}-texture` }),
      roughness: descriptor.roughness,
      metallic: descriptor.metallic,
      renderState
    });
  }
  return new PBRMaterial({
    name: `architectural-${descriptor.id}`,
    baseColor: descriptor.baseColor,
    roughness: descriptor.roughness,
    metallic: descriptor.metallic,
    renderState
  });
}

function material(
  id: string,
  label: string,
  category: ArchitecturalMaterialCategory,
  baseColor: readonly [number, number, number, number],
  roughness: number,
  metallic: number,
  normalStrength: number,
  ambientOcclusion: number,
  textureFixture?: ProceduralTextureFixtureKind
): ArchitecturalMaterialDescriptor {
  return { id, label, category, baseColor, roughness, metallic, normalStrength, ambientOcclusion, textureFixture, knownLimits };
}

// Merged verbatim from ./animation/AnimationMaterialStyle.ts (PRD-15 T6.6, owner 01, APPLIED BY LANE 15)

export type AnimationMaterialTreatment = "preserve-pbr" | "soft-toon" | "cel" | "flat-readable";

export interface AnimationMaterialStyleOptions {
  readonly treatment?: AnimationMaterialTreatment | undefined;
  readonly outline?: boolean | undefined;
  readonly rampSteps?: number | undefined;
  readonly saturationBoost?: number | undefined;
  readonly roughnessFloor?: number | undefined;
}

export interface AnimationMaterialStyle {
  readonly kind: "animation-material-style";
  readonly treatment: AnimationMaterialTreatment;
  readonly outline: boolean;
  readonly rampSteps: number;
  readonly saturationBoost: number;
  readonly roughnessFloor: number;
  readonly assetOverrideMetadata: readonly string[];
}

export function createAnimationMaterialStyle(options: AnimationMaterialStyleOptions = {}): AnimationMaterialStyle {
  const treatment = options.treatment ?? "soft-toon";
  return {
    kind: "animation-material-style",
    treatment,
    outline: options.outline ?? treatment === "cel",
    rampSteps: options.rampSteps ?? (treatment === "cel" ? 4 : 7),
    saturationBoost: options.saturationBoost ?? 0.08,
    roughnessFloor: options.roughnessFloor ?? 0.48,
    assetOverrideMetadata: ["animationMaterialTreatment", "toonRampSteps", "outlineEligible", "preserveSkinning"]
  };
}
