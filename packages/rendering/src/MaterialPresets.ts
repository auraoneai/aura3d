import { Material } from "./Material";
import { PBRMaterial, type PBRMaterialOptions } from "./PBRMaterial";
import { UnlitMaterial, type UnlitMaterialOptions } from "./UnlitMaterial";

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
