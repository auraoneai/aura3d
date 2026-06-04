import type { AuraCinematicAssetCategory } from "./AuraAssetIntent.js";
import type { AuraVec3 } from "./AuraSceneIR.js";

export type AuraCinematicAssetKind = "gltf" | "procedural-set" | "procedural-mesh" | "material" | "environment" | "dom-css-overlay";

export interface AuraCinematicAssetProvenance {
  readonly source: string;
  readonly sourceTitle: string;
  readonly license: string;
  readonly licenseUrl?: string;
  readonly uri?: string;
  readonly generated: boolean;
}

export interface AuraCinematicStoryBlocking {
  readonly robot?: { readonly position: AuraVec3; readonly lookAtId: string };
  readonly flower?: { readonly position: AuraVec3 };
  readonly camera?: { readonly position: AuraVec3; readonly target: AuraVec3 };
  readonly practicalLights?: readonly { readonly id: string; readonly position: AuraVec3; readonly color: readonly [number, number, number] }[];
}

export interface AuraCinematicAssetManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly category: AuraCinematicAssetCategory;
  readonly kind: AuraCinematicAssetKind;
  readonly uri: string;
  readonly semanticTags: readonly string[];
  readonly moodTags: readonly string[];
  readonly materialTags: readonly string[];
  readonly scaleMeters?: readonly [number, number, number];
  readonly visualQuality: number;
  readonly materialReadiness: number;
  readonly rendererOwned: boolean;
  readonly substituteKind?: "real-asset" | "procedural-geometry" | "renderer-material" | "dom-css-only";
  readonly lightMetadata?: {
    readonly color: readonly [number, number, number];
    readonly intensity: number;
    readonly castsLight: boolean;
  };
  readonly storyBlocking?: AuraCinematicStoryBlocking;
  readonly provenance: AuraCinematicAssetProvenance;
}

export interface AuraCinematicAssetManifest {
  readonly schema: "aura3d.cinematic-assets/1.0";
  readonly generatedAt: string;
  readonly entries: readonly AuraCinematicAssetManifestEntry[];
}

export const AURA_CINEMATIC_ASSET_MANIFEST: AuraCinematicAssetManifest = {
  schema: "aura3d.cinematic-assets/1.0",
  generatedAt: "2026-05-27T00:00:00.000Z",
  entries: [
    {
      id: "robot-expressive",
      label: "Robot Expressive",
      category: "character-robot",
      kind: "gltf",
      uri: "fixtures/threejs-parity/assets/character/robot-expressive.glb",
      semanticTags: ["robot", "character", "expressive", "hero"],
      moodTags: ["lonely", "hopeful", "cinematic", "previs"],
      materialTags: ["metal", "painted", "riggable"],
      scaleMeters: [1, 1.6, 1],
      visualQuality: 0.86,
      materialReadiness: 0.76,
      rendererOwned: true,
      substituteKind: "real-asset",
      provenance: {
        source: "repository fixture",
        sourceTitle: "threejs-parity robot-expressive.glb",
        license: "repository fixture",
        uri: "fixtures/threejs-parity/assets/character/robot-expressive.glb",
        generated: false
      }
    },
    {
      id: "glowing-flower",
      label: "Generated Glowing Flower Mesh",
      category: "prop",
      kind: "procedural-mesh",
      uri: "fixtures/cinematic-assets/procedural/glowing-flower.json",
      semanticTags: ["glowing-flower", "flower", "emissive", "hero-prop"],
      moodTags: ["hopeful", "neon", "cinematic"],
      materialTags: ["translucent", "emissive", "petal", "stem"],
      scaleMeters: [0.4, 0.55, 0.4],
      visualQuality: 0.82,
      materialReadiness: 0.9,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      provenance: {
        source: "Aura3D procedural fixture",
        sourceTitle: "glowing flower generated mesh descriptor",
        license: "MIT-compatible repository fixture",
        uri: "fixtures/cinematic-assets/procedural/glowing-flower.json",
        generated: true
      }
    },
    {
      id: "rainy-neon-alley",
      label: "Rainy Neon Alley Procedural Set",
      category: "urban-environment",
      kind: "procedural-set",
      uri: "fixtures/cinematic-assets/procedural/rainy-neon-alley.json",
      semanticTags: ["rainy-neon-alley", "alley", "street", "urban", "environment", "depth"],
      moodTags: ["rainy", "neon", "night", "lonely"],
      materialTags: ["wet-pavement", "brick", "metal", "puddles"],
      scaleMeters: [6, 4, 14],
      visualQuality: 0.84,
      materialReadiness: 0.88,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      storyBlocking: {
        robot: { position: [-0.7, 0, 0.35], lookAtId: "flower-hero" },
        flower: { position: [0.2, 0.02, -1.2] },
        camera: { position: [0, 0.9, 4.2], target: [-0.1, 0.55, -0.75] },
        practicalLights: [
          { id: "neon-practical-left", position: [-1.9, 2.1, -1.8], color: [1, 0.22, 0.75] },
          { id: "neon-practical-right", position: [1.7, 1.7, -3.3], color: [0.1, 0.85, 1] }
        ]
      },
      provenance: {
        source: "Aura3D procedural fixture",
        sourceTitle: "rainy neon alley generated set descriptor",
        license: "MIT-compatible repository fixture",
        uri: "fixtures/cinematic-assets/procedural/rainy-neon-alley.json",
        generated: true
      }
    },
    {
      id: "wet-pavement",
      label: "Wet Pavement Renderer Material",
      category: "ground-stage-surface",
      kind: "material",
      uri: "fixtures/cinematic-assets/materials/wet-pavement.json",
      semanticTags: ["wet-pavement", "asphalt", "ground", "reflective", "puddles"],
      moodTags: ["rainy", "night", "neon"],
      materialTags: ["wet", "clearcoat", "reflective", "rough-asphalt"],
      scaleMeters: [6, 0.04, 10],
      visualQuality: 0.8,
      materialReadiness: 0.96,
      rendererOwned: true,
      substituteKind: "renderer-material",
      provenance: {
        source: "Aura3D material preset fixture",
        sourceTitle: "wet pavement material descriptor",
        license: "MIT-compatible repository fixture",
        uri: "fixtures/cinematic-assets/materials/wet-pavement.json",
        generated: true
      }
    },
    {
      id: "neon-practical-light",
      label: "Neon Practical Light Geometry",
      category: "emissive-neon-panel",
      kind: "procedural-mesh",
      uri: "fixtures/cinematic-assets/procedural/neon-practical-light.json",
      semanticTags: ["neon-practical-light", "emissive", "practical-light", "neon-panel"],
      moodTags: ["neon", "night", "cinematic"],
      materialTags: ["emissive", "magenta", "cyan", "bloom"],
      scaleMeters: [1.2, 0.25, 0.08],
      visualQuality: 0.83,
      materialReadiness: 0.94,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      lightMetadata: { color: [1, 0.22, 0.78], intensity: 3.6, castsLight: true },
      provenance: {
        source: "Aura3D procedural fixture",
        sourceTitle: "neon practical light generated mesh descriptor",
        license: "MIT-compatible repository fixture",
        uri: "fixtures/cinematic-assets/procedural/neon-practical-light.json",
        generated: true
      }
    },
    {
      id: "concept-car",
      label: "Concept Car",
      category: "vehicle",
      kind: "gltf",
      uri: "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
      semanticTags: ["vehicle", "car", "product"],
      moodTags: ["studio", "cinematic"],
      materialTags: ["paint", "metal", "glass"],
      visualQuality: 0.8,
      materialReadiness: 0.78,
      rendererOwned: true,
      substituteKind: "real-asset",
      provenance: { source: "repository fixture", sourceTitle: "car-concept.glb", license: "repository fixture", uri: "fixtures/threejs-parity/assets/vehicles/car-concept.glb", generated: false }
    },
    {
      id: "duck-product-prop",
      label: "Duck Product Prop",
      category: "product",
      kind: "gltf",
      uri: "fixtures/asset-corpus/duck.glb",
      semanticTags: ["product", "prop", "duck"],
      moodTags: ["studio", "bright"],
      materialTags: ["plastic", "yellow"],
      visualQuality: 0.72,
      materialReadiness: 0.68,
      rendererOwned: true,
      substituteKind: "real-asset",
      provenance: { source: "repository fixture", sourceTitle: "duck.glb", license: "repository fixture", uri: "fixtures/asset-corpus/duck.glb", generated: false }
    },
    {
      id: "procedural-forest-clearing",
      label: "Procedural Forest Clearing",
      category: "nature-environment",
      kind: "procedural-set",
      uri: "fixtures/cinematic-assets/procedural/forest-clearing.json",
      semanticTags: ["forest", "nature", "clearing", "environment"],
      moodTags: ["organic", "mist", "day"],
      materialTags: ["bark", "leaves", "soil"],
      visualQuality: 0.72,
      materialReadiness: 0.74,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      provenance: { source: "Aura3D procedural fixture", sourceTitle: "forest clearing generated set descriptor", license: "MIT-compatible repository fixture", generated: true }
    },
    {
      id: "procedural-product-studio",
      label: "Procedural Product Studio",
      category: "studio-environment",
      kind: "procedural-set",
      uri: "fixtures/cinematic-assets/procedural/product-studio.json",
      semanticTags: ["studio", "product", "cyclorama", "environment"],
      moodTags: ["clean", "studio", "commercial"],
      materialTags: ["matte", "floor", "softbox"],
      visualQuality: 0.76,
      materialReadiness: 0.82,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      provenance: { source: "Aura3D procedural fixture", sourceTitle: "product studio generated set descriptor", license: "MIT-compatible repository fixture", generated: true }
    },
    {
      id: "procedural-architectural-interior",
      label: "Procedural Architectural Interior",
      category: "architectural-interior",
      kind: "procedural-set",
      uri: "fixtures/cinematic-assets/procedural/architectural-interior.json",
      semanticTags: ["architecture", "interior", "gallery", "environment"],
      moodTags: ["quiet", "gallery", "previs"],
      materialTags: ["concrete", "glass", "wood"],
      visualQuality: 0.7,
      materialReadiness: 0.78,
      rendererOwned: true,
      substituteKind: "procedural-geometry",
      provenance: { source: "Aura3D procedural fixture", sourceTitle: "architectural interior generated set descriptor", license: "MIT-compatible repository fixture", generated: true }
    },
    {
      id: "studio-small-08-hdr",
      label: "Studio Small 08 HDR",
      category: "hdr-environment",
      kind: "environment",
      uri: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
      semanticTags: ["hdr", "environment-light", "studio"],
      moodTags: ["soft", "studio"],
      materialTags: ["lighting"],
      visualQuality: 0.7,
      materialReadiness: 1,
      rendererOwned: true,
      substituteKind: "real-asset",
      provenance: { source: "repository fixture", sourceTitle: "studio_small_08_1k.hdr", license: "repository fixture", uri: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", generated: false }
    }
  ]
};
