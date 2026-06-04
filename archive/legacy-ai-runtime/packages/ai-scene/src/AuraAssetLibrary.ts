import type { AuraAssetRequirement } from "./AuraSceneIR.js";

export interface AuraAssetManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly uri: string;
  readonly type: AuraAssetRequirement["type"];
  readonly semanticTags: readonly string[];
  readonly styleTags: readonly string[];
  readonly license: string;
  readonly source: string;
}

export interface AuraAssetLibraryManifest {
  readonly schema: "aura3d.ai-scene.asset-library";
  readonly generatedAt: string;
  readonly entries: readonly AuraAssetManifestEntry[];
}

export const AURA_DEFAULT_ASSET_LIBRARY: AuraAssetLibraryManifest = {
  schema: "aura3d.ai-scene.asset-library",
  generatedAt: "2026-01-01T00:00:00.000Z",
  entries: [
    { id: "fixture-robot-expressive", label: "Robot Expressive", uri: "fixtures/threejs-parity/assets/character/robot-expressive.glb", type: "gltf", semanticTags: ["robot", "character", "hero"], styleTags: ["friendly", "previs"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-duck", label: "Duck Prop", uri: "fixtures/asset-corpus/duck.glb", type: "gltf", semanticTags: ["duck", "product", "prop"], styleTags: ["studio", "bright"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-concept-car", label: "Concept Car", uri: "fixtures/threejs-parity/assets/vehicles/car-concept.glb", type: "gltf", semanticTags: ["vehicle", "product", "car"], styleTags: ["cinematic", "studio"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-damaged-helmet", label: "Damaged Helmet", uri: "fixtures/asset-corpus/damaged-helmet.glb", type: "gltf", semanticTags: ["helmet", "product", "prop"], styleTags: ["pbr", "inspection"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-tokyo", label: "Tokyo District", uri: "fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb", type: "gltf", semanticTags: ["city", "street", "environment"], styleTags: ["urban", "stylized"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-water-marina", label: "Water Marina", uri: "fixtures/advanced-gallery/assets/water-cinematic-marina-blender/water-cinematic-marina-blender.glb", type: "gltf", semanticTags: ["water", "dock", "environment"], styleTags: ["cinematic", "exterior"], license: "repository fixture", source: "fixtures" },
    { id: "fixture-studio-small-08", label: "Studio Small 08 HDR", uri: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", type: "environment", semanticTags: ["light", "environment", "studio"], styleTags: ["softbox", "product"], license: "repository fixture", source: "fixtures" }
  ]
};

export function createAssetLibraryManifest(entries: readonly AuraAssetManifestEntry[] = AURA_DEFAULT_ASSET_LIBRARY.entries): AuraAssetLibraryManifest {
  return {
    schema: "aura3d.ai-scene.asset-library",
    generatedAt: new Date().toISOString(),
    entries
  };
}
