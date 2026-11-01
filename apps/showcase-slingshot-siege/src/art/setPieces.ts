/**
 * GU47 WP-36 (SS47-A1): this game's own Meshy set pieces, admitted with `aura3d assets import-meshy --prefix sling`
 * (licence and rights rows in ../assets/models/provenance/). Presentation only: no collider, nothing feeds the sim.
 *
 * - sling_seaStackIsland (WP-36 key slingSeaStackIsland, Meshy text-to-3d refine task 01a18c0a, 2026-10-30): a chalk
 *   sea-stack islet with a pennant, drawn once on the far sea behind the fort (1 draw, no shadow).
 *
 * GU47 phase 7 (4.7.6, Task B draw budget): the island's static set dressing baked into three GLBs by
 * ../../tools/bake-static-sets.mjs from ./staticSets.placements.json (the placements the stage drew one model() node at a
 * time: 3 pine trees of 23 meshes each, 2 conifer rows of 6, 4 boulders, 5 back rocks). Every placement keeps its
 * transform; geometry, UVs, materials and textures are the source asset's, joined to one primitive per material, so the
 * 95 meshes draw as 8. Licences are the source assets' (CC-BY-4.0, objaverse; credits in `metadata`).
 */
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";

type ModelAsset = AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly bounds: readonly [number, number, number] };

const rights = {
  license: "Meshy generated asset (paid API, plan terms at generation time)",
  author: "AuraOne (Meshy text-to-3d via Kiro Prism)",
  provenance: { sourceUrl: "https://www.meshy.ai/terms", source: "GU47 WP-36 slingshot-siege/slingSeaStackIsland, task 01a18c0a-601a-7067-b7cb-4d734dd52575" }
};

/** Baked static sets keep their source assets' licence (CC-BY-4.0 objaverse); the bake only joins placements. */
function bakedRights(sources: string): { readonly license: string; readonly author: string; readonly provenance: { readonly sourceUrl: string; readonly source: string } } {
  return {
    license: "CC-BY-4.0",
    author: sources,
    provenance: { sourceUrl: "https://huggingface.co/datasets/allenai/objaverse", source: `GU47 phase 7 bake (tools/bake-static-sets.mjs) of ${sources}` }
  };
}

const definitions = {
  sling_seaStackIsland: {
    type: "model",
    format: "glb",
    url: new URL("../assets/models/sling_seaStackIsland.glb", import.meta.url).pathname,
    sha256: "36abc76c91d99c861f9834c84c26be8fd92df1d9f48fd50f81927e2bac2e5160",
    sizeBytes: 1469036,
    bounds: [1.903, 1.506, 1.903],
    metadata: rights
  },
  // GU47 phase 7 (4.7.6): baked static sets (see the header). Drawn at the origin with scaleMode "world": the bake
  // already applied each placement's model() normalisation.
  sling_islandTrees: {
    type: "model",
    format: "glb",
    url: new URL("../assets/models/sling_islandTrees.glb", import.meta.url).pathname,
    sha256: "bd8d86f8f584d5ce351fb64ee9ca89d267556ac944ee8fd8e642e087c55eeda9",
    sizeBytes: 6928332,
    bounds: [22.17, 0.3, 6.45],
    metadata: bakedRights("propPineTree (winwoods, objaverse 99fb6a37547840e3a295689df032ba28) x3 and propConifer (PeToDes, objaverse bbfdda74227e47558b49337f2bb35254) x2")
  },
  sling_rocksA: {
    type: "model",
    format: "glb",
    url: new URL("../assets/models/sling_rocksA.glb", import.meta.url).pathname,
    sha256: "cc22f8e4a553d39fb5eb083e0366180779faaf4900b3fff030ed00579859b5df",
    sizeBytes: 9332024,
    bounds: [29.29, 6.49, 16.24],
    metadata: bakedRights("propRockA (3dhdscan, objaverse 519c813e95af46a59e010539cd02ac5f) x4")
  },
  sling_rocksB: {
    type: "model",
    format: "glb",
    url: new URL("../assets/models/sling_rocksB.glb", import.meta.url).pathname,
    sha256: "1dd9191210d3671040bebb6a7482034619d570d5044a43e18f4bf330acc94908",
    sizeBytes: 3699828,
    bounds: [32.05, 2.56, 6.49],
    metadata: bakedRights("propRockB (lukica, objaverse 4724b6687ef548f0b431c50e0d03f274) x5")
  }
} satisfies Record<string, ModelAsset>;

export const setPieces: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/**
 * Where the islet sits: on the seabed sea (its disc ends at z -28) behind the arch, about 7.6 m across, sunk so its
 * wooden diorama plinth and beach are under the sea and only the chalk stack and pennant rise out of it. Rounds
 * g12p4r7 (z -32, past the sea disc) and g12p4r8 (y 1.36) showed the plinth floating above the water.
 */
export const SEA_STACK_PLACEMENT = { position: [3, -1.2, -22] as [number, number, number], rotationY: -0.6, scale: 4 } as const;
