/**
 * GU47 WP-36 (SS47-A1): this game's own Meshy set pieces, admitted with `aura3d assets import-meshy --prefix sling`
 * (licence and rights rows in ../assets/models/provenance/). Presentation only: no collider, nothing feeds the sim.
 *
 * - sling_seaStackIsland (WP-36 key slingSeaStackIsland, Meshy text-to-3d refine task 01a18c0a, 2026-10-30): a chalk
 *   sea-stack islet with a pennant, drawn once on the far sea behind the fort (1 draw, no shadow).
 *
 * - Wave 2 (2026-11-03, GU47 WP-36 second batch): five more far set pieces, each one draw, no shadow, no collider, drawn
 *   on the far sea behind the island and never in the flight lane: sling_lighthouseIslet (every chapter, left),
 *   sling_quarryCrane (chapter 1, on the right headland), sling_greenhouseFrame (chapter 2), sling_curtainWall (chapter 4)
 *   and sling_crystalCrater (chapter 5), the last four on the right. Optimized GLBs were decimated to the PRD caps
 *   (15k / 20k triangles, 1024 px textures; the greenhouse lattice resisted edge collapse and went through meshopt
 *   sloppy simplification, 29.9k to 19.3k). Rights and task rows are in ../assets/models/provenance/.
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

function meshyRights(key: string, task: string): typeof rights {
  return { ...rights, provenance: { sourceUrl: "https://www.meshy.ai/terms", source: `GU47 WP-36 wave 2 slingshot-siege/${key}, task ${task}` } };
}

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
    url: "/assets/models/sling_seaStackIsland.glb",
    sha256: "36abc76c91d99c861f9834c84c26be8fd92df1d9f48fd50f81927e2bac2e5160",
    sizeBytes: 1469036,
    bounds: [1.903, 1.506, 1.903],
    metadata: rights
  },
  // GU47 wave 2: far set pieces (see the header).
  sling_lighthouseIslet: {
    type: "model", format: "glb",
    url: "/assets/models/sling_lighthouseIslet.glb",
    sha256: "a731a66bcadc3a133fdac377d9a3597f2f404074dd3a871323bfdb08640b8107", sizeBytes: 983224, bounds: [1.9, 1.26, 1.9],
    metadata: meshyRights("slingLighthouseIslet", "01a1a4d0-b12c-70d8-aff7-44139c4218e6")
  },
  sling_quarryCrane: {
    type: "model", format: "glb",
    url: "/assets/models/sling_quarryCrane.glb",
    sha256: "4b90d151c6be436fd09ee4b73a37f1ac375123ae814f23a6c2aa4e240e270556", sizeBytes: 1299116, bounds: [1.88, 1.52, 1.03],
    metadata: meshyRights("slingQuarryCrane", "01a1a4d0-f4db-74be-894e-44483fb264b5")
  },
  sling_greenhouseFrame: {
    type: "model", format: "glb",
    url: "/assets/models/sling_greenhouseFrame.glb",
    sha256: "488865a4cbbec34720bf8b2353bc36bf41f8e99eb19ee569aaa0c7ecc76aa791", sizeBytes: 1990200, bounds: [1.64, 1.9, 1.69],
    metadata: meshyRights("slingGreenhouseFrame", "01a1a4d1-588d-76db-bc5e-e7e072bfd0d7")
  },
  sling_curtainWall: {
    type: "model", format: "glb",
    url: "/assets/models/sling_curtainWall.glb",
    sha256: "cebad157ea77ce791cd575c1bc790effc7c2d1054889e021172a062c3d232a74", sizeBytes: 1448180, bounds: [1.9, 1.39, 1.9],
    metadata: meshyRights("slingCurtainWall", "01a1a4d2-1743-733a-b410-c6a8fbbdf593")
  },
  sling_crystalCrater: {
    type: "model", format: "glb",
    url: "/assets/models/sling_crystalCrater.glb",
    sha256: "a179006d20fb555d6cbce89d202e651afd1accd68d9281a127fd45e7c620df47", sizeBytes: 1045984, bounds: [1.9, 0.9, 1.64],
    metadata: meshyRights("slingCrystalCrater", "01a1a4d2-9c25-75f5-9c4b-745cae90eab4")
  },
  // GU47 phase 7 (4.7.6): baked static sets (see the header). Drawn at the origin with scaleMode "world": the bake
  // already applied each placement's model() normalisation.
  sling_islandTrees: {
    type: "model",
    format: "glb",
    url: "/assets/models/sling_islandTrees.glb",
    sha256: "bd8d86f8f584d5ce351fb64ee9ca89d267556ac944ee8fd8e642e087c55eeda9",
    sizeBytes: 6928332,
    bounds: [22.17, 0.3, 6.45],
    metadata: bakedRights("propPineTree (winwoods, objaverse 99fb6a37547840e3a295689df032ba28) x3 and propConifer (PeToDes, objaverse bbfdda74227e47558b49337f2bb35254) x2")
  },
  sling_rocksA: {
    type: "model",
    format: "glb",
    url: "/assets/models/sling_rocksA.glb",
    sha256: "cc22f8e4a553d39fb5eb083e0366180779faaf4900b3fff030ed00579859b5df",
    sizeBytes: 9332024,
    bounds: [29.29, 6.49, 16.24],
    metadata: bakedRights("propRockA (3dhdscan, objaverse 519c813e95af46a59e010539cd02ac5f) x4")
  },
  sling_rocksB: {
    type: "model",
    format: "glb",
    url: "/assets/models/sling_rocksB.glb",
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

/**
 * Wave-2 far set pieces (presentation only). Each sits behind the island on the far sea, outside the flight lane, with
 * its thin sand or ice base at the waterline (SEA_LEVEL -0.26), the crane on the right headland. Rotations face the
 * default aim camera (-2.5, 4, 15.5).
 */
export interface FarSetPiece {
  readonly key: "sling_lighthouseIslet" | "sling_quarryCrane" | "sling_greenhouseFrame" | "sling_curtainWall" | "sling_crystalCrater";
  readonly chapters: readonly number[] | "all";
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: number;
}
export const FAR_SET_PIECES: readonly FarSetPiece[] = [
  { key: "sling_lighthouseIslet", chapters: "all", position: [-16.5, 2.0, -22.5], rotationY: 0.35, scale: 4.4 },
  { key: "sling_quarryCrane", chapters: [1], position: [22, 3.7, -23.5], rotationY: -0.5, scale: 4.2 },
  { key: "sling_greenhouseFrame", chapters: [2], position: [16.5, 3.1, -19.5], rotationY: -0.5, scale: 4.4 },
  { key: "sling_curtainWall", chapters: [4], position: [16.5, 2.5, -19.5], rotationY: -0.5, scale: 4.0 },
  { key: "sling_crystalCrater", chapters: [5], position: [16.5, 1.6, -19.5], rotationY: -0.5, scale: 4.8 }
];

/** The far set pieces drawn in a chapter. */
export function farSetPiecesFor(chapterId: number): readonly FarSetPiece[] {
  return FAR_SET_PIECES.filter((p) => p.chapters === "all" || p.chapters.includes(chapterId));
}
