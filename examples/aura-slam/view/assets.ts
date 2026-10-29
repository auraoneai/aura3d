import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";

type ModelAsset = AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number] };

const glb = (file: string, hash: string, bounds: readonly [number, number, number], sizeBytes: number, source: string): ModelAsset =>
  ({
    type: "model", format: "glb", url: `/aura-assets/${file}`, hash: `sha256-${hash}`, bounds, sizeBytes,
    metadata: { materials: [], animations: [], provenance: { sourcePath: `public/aura-assets/${file}`, origin: source } }
  }) as unknown as ModelAsset;

/**
 * The three stadium dressing models the live court uses. Standalone definitions (same files and hashes as the typed manifest)
 * so the example does not depend on the repository-root `src/aura-assets.ts`. Bounds are the rendered Y-up world box (root
 * node transforms applied; C10): the seats are 33.7 x 45.8 x 144.1 m, long along Z. The repository manifest still lists the
 * pre-transform box [43.799, 152.996, 28.975].
 */
const definitions = {
  showcaseStadiumSeats: glb("showcaseStadiumSeats.afb44897.glb", "afb44897c52d32e90f42d86e64e541aec7307e09ba18da126f3e9de458cc0ebf", [33.701, 45.813, 144.138], 194740, "aura3d catalog"),
  rooftopScoreboardRigMeshy: glb("rooftopScoreboardRigMeshy.866123b7.glb", "ca7da62eace9dde10d40e2121a9f7012335048fe907e5ba01de276bf97b91582", [1.905, 1.089, 1.844], 1641312, "meshy via kiro prism"),
  rooftopFloodlightTowerMeshy: glb("rooftopFloodlightTowerMeshy.1bfcdd0b.glb", "1bfcdd0b57f632f8c32f1bbdf5ce5a7e57fe169e61aeb28047711dc333efca30", [1.8974, 1.434, 1.8967], 913928, "meshy via kiro prism")
} as const;

export const stadiumAssets: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/** Files a remote run must ship (`PUBLIC_ASSETS`). */
export const STADIUM_PUBLIC_FILES = Object.values(definitions).map((a) => a.url.replace("/aura-assets/", ""));
