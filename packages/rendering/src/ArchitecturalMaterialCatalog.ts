import { PBRMaterial } from "./PBRMaterial";
import { TexturedPBRMaterial } from "./TexturedPBRMaterial";
import { type ProceduralTextureFixtureKind, createProceduralTexture } from "./ProceduralTextureFixtures";

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
