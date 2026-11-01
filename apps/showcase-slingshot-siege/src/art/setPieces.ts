/**
 * GU47 WP-36 (SS47-A1): this game's own Meshy set pieces, admitted with `aura3d assets import-meshy --prefix sling`
 * (licence and rights rows in ../assets/models/provenance/). Presentation only: no collider, nothing feeds the sim.
 *
 * - sling_seaStackIsland (WP-36 key slingSeaStackIsland, Meshy text-to-3d refine task 01a18c0a, 2026-10-30): a chalk
 *   sea-stack islet with a pennant, drawn once on the far sea behind the fort (1 draw, no shadow).
 */
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";

type ModelAsset = AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly bounds: readonly [number, number, number] };

const rights = {
  license: "Meshy generated asset (paid API, plan terms at generation time)",
  author: "AuraOne (Meshy text-to-3d via Kiro Prism)",
  provenance: { sourceUrl: "https://www.meshy.ai/terms", source: "GU47 WP-36 slingshot-siege/slingSeaStackIsland, task 01a18c0a-601a-7067-b7cb-4d734dd52575" }
};

const definitions = {
  sling_seaStackIsland: {
    type: "model",
    format: "glb",
    url: new URL("../assets/models/sling_seaStackIsland.glb", import.meta.url).pathname,
    sha256: "36abc76c91d99c861f9834c84c26be8fd92df1d9f48fd50f81927e2bac2e5160",
    sizeBytes: 1469036,
    bounds: [1.903, 1.506, 1.903],
    metadata: rights
  }
} satisfies Record<string, ModelAsset>;

export const setPieces: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/**
 * Where the islet sits: on the seabed sea (its disc ends at z -28) behind the arch, about 7.6 m across. The GLB is
 * centred on its origin with its sand plinth in the lowest fifth, so y = -0.45 + 0.3 x height x scale puts the plinth
 * just under the sea. Round g12p4r7 placed it at z -32, past the sea disc, where it floated against the horizon.
 */
export const SEA_STACK_PLACEMENT = { position: [3, 1.36, -22] as [number, number, number], rotationY: -0.6, scale: 4 } as const;
