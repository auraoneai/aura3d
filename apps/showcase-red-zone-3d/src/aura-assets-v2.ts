/**
 * Red Zone 3D — route-local typed-asset manifest.
 *
 * Registers the Meshy GLBs generated specifically for this game through the
 * engine's own `defineAuraAssets`, producing proper branded `AuraAssetRef`s —
 * the same mechanism src/aura-assets.ts uses, kept route-local so this app has
 * no imports outside its own directory. Provenance: artifacts/meshy/rz-*
 * dirs (task.json + rights.json per asset).
 *
 * Keys are intentionally unquoted: the remote-capture serve-tree assembler
 * (tools/remote-capture.sh) globs `apps/<route>/src/aura-assets-*.ts` and
 * extracts `key: { url }` entries with an unquoted-key regex, then copies each
 * referenced payload from public/ into the capture serve tree.
 */
import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  rzFloodlightPylonMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzFloodlightPylonMeshy.8b4b487c.glb",
    hash: "sha256-8b4b487ca2879f04e128e1e2208bd9a652c030cac2e66328be275c6cf82a2f76",
    bounds: [0.721, 1.903, 0.72]
  },
  rzScoreboardGantryMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzScoreboardGantryMeshy.074aba14.glb",
    hash: "sha256-074aba14774630569c0673a163c7c0b8c7df1f1aba6ed69b143dbd7e683cbb6b",
    bounds: [1.902, 0.817, 1.233]
  },
  rzFootballMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzFootballMeshy.b7a28a16.glb",
    hash: "sha256-b7a28a1681ca08193ae54ba9dc1554ca52630d01ccbbe4efc1c0ab06e5b8fdeb",
    bounds: [1.9, 1.265, 1.25]
  },
  rzLombardiCupMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzLombardiCupMeshy.35a24607.glb",
    hash: "sha256-35a2460780fa005ead8e51dee961b5eb1497e64fcd99c726b30b8ebc85eb535e",
    bounds: [1.331, 1.901, 0.752]
  },
  rzAltitudeDomeMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzAltitudeDomeMeshy.d55978a7.glb",
    hash: "sha256-d55978a78dd57a3e0f3be99e5c9da0d332adaae2fdd94516e315748a5b990e9e",
    bounds: [1.899, 0.769, 1.879]
  }
} as const);

export type RouteAssetKey = keyof typeof assets;
