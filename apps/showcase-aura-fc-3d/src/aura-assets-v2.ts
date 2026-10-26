/**
 * Aura FC 3D — route-local typed-asset manifest.
 *
 * Registers the Meshy GLBs and WAV SFX used by Aura FC 3D through the engine's
 * `defineAuraAssets`, with unquoted keys so `tools/remote-capture.sh` copies
 * every referenced payload from `public/aura-assets/` into the capture serve tree.
 */
import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  fcFloodlightPylonMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcFloodlightPylonMeshy.636dc3fc.glb",
    hash: "sha256-636dc3fcd362a58d33a876063bd33cfc7904bb59d7f06cbeb30f82d4ca6fda8a",
    bounds: [0.631, 1.903, 0.239]
  },
  fcGlacierDomeMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcGlacierDomeMeshy.32b82759.glb",
    hash: "sha256-32b827592359ba3734fe1553d0bdcac014923101d45c3886c6b097f04c2cb4d5",
    bounds: [1.818, 1.209, 1.903]
  },
  fcHeroTrophyMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcHeroTrophyMeshy.b101d73c.glb",
    hash: "sha256-b101d73c079fd37ba3114d42a002ff2b965f7ca31ab340a90aa245f9866e949a",
    bounds: [1.024, 1.902, 0.613]
  },
  fcMatchBallMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcMatchBallMeshy.b97f043f.glb",
    hash: "sha256-b97f043fb34c695590425933afcce9008aba484d6df9cf14a8b114484d340004",
    bounds: [1.902, 1.902, 1.901]
  },
  fcScoreboardGantryMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcScoreboardGantryMeshy.0c6d8221.glb",
    hash: "sha256-0c6d8221b111f6b1f2be65ba369aa1d15f013acd586c9149e34719a8273eb5c6",
    bounds: [1.902, 1.284, 0.246]
  },
  fcSoccerStrikerMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcSoccerStrikerMeshyAthlete.1b37df23.glb",
    hash: "sha256-1b37df23525f254dc5bb8483a512d850db21a1f4e67cb056aec68a143633d686",
    bounds: [0.671, 1.891, 0.481]
  },
  fcGoalkeeperMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcGoalkeeperMeshyAthlete.b9fe367e.glb",
    hash: "sha256-b9fe367eb7cc0fa9806d1a39ea85de8d21d38e7e68632fbdff9e5f9015fdd1e7",
    bounds: [0.688, 1.899, 0.508]
  },
  fcSoccerGoalNetMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fcSoccerGoalNetMeshy.9750a4a6.glb",
    hash: "sha256-011c9e65cc2a229025f233dc80015bb3e9d3405146b59182d1c8e07593273eb4",
    bounds: [1.897, 1.282, 0.8]
  },
  rooftopShooterCleanMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopShooterCleanMeshy.2be27d6a.glb",
    hash: "sha256-fcf0841169f4c4add2d0fd64bf3addec20b810b46d237d89e070188a9aaff3b2",
    bounds: [0.627, 1.874, 0.41]
  },
  rooftopDefenderMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopDefenderMeshyClean.1e9df651.glb",
    hash: "sha256-1e9df6514b4a34f62b7f6f0eead31724252bd7d02a495e752e61668ed9473c55",
    bounds: [0.831, 1.886, 0.646]
  },
  "hoopsAthleteGuard": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hoopsAthleteGuardClean.b9f501b4.glb",
    hash: "sha256-b9f501b40572bca9f132b2814ab8f930301b0b896778f3db0f353a1ec3d0c695",
    bounds: [0.905, 1.903, 0.404],
    sizeBytes: 1600572,
  },
  "hoopsAthleteBig": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hoopsAthleteBigClean.a53256dd.glb",
    hash: "sha256-a53256ddcacf537775870136a8a112fb9ec208783d57298f365164b54555c910",
    bounds: [0.878, 1.903, 0.429],
    sizeBytes: 1325852,
  },
  diamondDugout: {
    type: "model",
    format: "glb",
    url: "/aura-assets/diamondDugout.bfacebd6.glb",
    hash: "sha256-bfacebd60d24235f7ef06c8c21ec71f9e490a12efbfb64c991a45f55105d9ed3",
    bounds: [1.903, 1.579, 1.176]
  },
  diamondStadium: {
    type: "model",
    format: "glb",
    url: "/aura-assets/diamondStadium.2aa65131.glb",
    hash: "sha256-2aa65131072a1c4ae4d32d123994aa94e8650317975325782d9c9207513b155b",
    bounds: [1.903, 0.562, 1.653]
  },
  hoopsBallCart: {
    type: "model",
    format: "glb",
    url: "/aura-assets/hoopsBallCart.046e8fde.glb",
    hash: "sha256-046e8fde0aa8e6c9c4cb4e8a3a2ea5f060d6916ab8dfda5dc1c013be7671bfe8",
    bounds: [1.906, 1.31, 1.459]
  },
  hoopsCheckSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsCheckSfx.405a831d.wav",
    hash: "sha256-405a831d3b901ca15f9a628f96e3136be8a2da626660da946ccf18fd2f610ba3"
  },
  hoopsBoardThudSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsBoardThudSfx.b2f87b29.wav",
    hash: "sha256-b2f87b29f4b1f28e434ec5a5ef411a08595226c01ba37aa332f44dd548208eb3"
  },
  hoopsRimClankSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsRimClankSfx.7909dddd.wav",
    hash: "sha256-7909ddddb6a2df92d50ce8d2693d6543fe2b108fa146b83b4a8c3262cd9285cd"
  },
  hoopsSwishSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsSwishSfx.fdab5827.wav",
    hash: "sha256-fdab5827ad885ff1824877f81c5b968341ce228997248b0b168ee0bc3872046f"
  },
  hoopsCrowdSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsCrowdSfx.3bfb8d46.wav",
    hash: "sha256-3bfb8d4652078c59aa46f93957a24d2322bd86f2a60846f4fe6aea288c09be5e"
  },
  hoopsFanfareSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsFanfareSfx.0b88e74e.wav",
    hash: "sha256-0b88e74e5c40057ced8b5a19140d2ad4f6f15bd7963668fcd44c4aaf719f0a33"
  },
  hoopsBuzzerSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsBuzzerSfx.84d252a1.wav",
    hash: "sha256-84d252a1e66e638ec7c9c0896348ab619f0279f60edc50ff2609ca1ab584625e"
  },
  hoopsBlockSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/hoopsBlockSfx.48c91229.wav",
    hash: "sha256-48c91229537384ad140ffe2064dfbe5f798768e3b89549517761717187cc630e"
  },
  diamondClickSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondClickSfx.6a970d1d.wav",
    hash: "sha256-6a970d1d51543575e978c9735afa795d6eb6f086faa7cadfc19d9ee834fe39da"
  },
  diamondConfirmSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondConfirmSfx.70982d28.wav",
    hash: "sha256-70982d2827bd33a15e2ba174d40133aa21bea3b879bcf19e8da5714cb6693843"
  },
  diamondHomerBigSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondHomerBigSfx.7d3a6654.wav",
    hash: "sha256-7d3a66547131d29df72f20b49b11c258d55985550bb5004763eb25cf1979ee38"
  }
} as const);

export type RouteAssetKey = keyof typeof assets;
