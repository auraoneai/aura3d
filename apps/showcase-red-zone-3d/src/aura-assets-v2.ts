/**
 * Red Zone 3D — route-local typed-asset manifest.
 *
 * Registers the four shared-catalog GLBs the stadium dressing uses through the
 * engine's own `defineAuraAssets`, producing proper branded `AuraAssetRef`s —
 * the same mechanism src/aura-assets.ts uses, kept route-local so this app has
 * no imports outside its own directory.
 *
 * Keys are intentionally unquoted: the remote-capture serve-tree assembler
 * (tools/remote-capture.sh) globs `apps/<route>/src/aura-assets-*.ts` and
 * extracts `key: { url }` entries with an unquoted-key regex, then copies each
 * referenced payload from public/ into the capture serve tree.
 */
import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  rooftopFloodlightTowerMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopFloodlightTowerMeshy.1bfcdd0b.glb",
    hash: "sha256-1bfcdd0b57f632f8c32f1bbdf5ce5a7e57fe169e61aeb28047711dc333efca30",
    bounds: [1.8974, 1.434, 1.8967]
  },
  rooftopScoreboardRigMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopScoreboardRigMeshy.866123b7.glb",
    hash: "sha256-866123b72952441f5abb5abb0343ac6063d09a9cac9fab086bfae8c96888c29c",
    bounds: [1.905, 1.089, 1.844]
  },
  rooftopShooterCleanMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopShooterCleanMeshy.2be27d6a.glb",
    hash: "sha256-fcf0841169f4c4add2d0fd64bf3addec20b810b46d237d89e070188a9aaff3b2",
    bounds: [0.6268, 1.8741, 0.4102]
  },
  auroraHabitatDomeMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraHabitatDomeMeshy.b0e5deb5.glb",
    hash: "sha256-b0e5deb5455a3763e10a6525c55687ebc05a0ba1cbf012887b7bc5d9a638912f",
    bounds: [1.704, 1.033, 1.903]
  }
} as const);

export type RouteAssetKey = keyof typeof assets;
