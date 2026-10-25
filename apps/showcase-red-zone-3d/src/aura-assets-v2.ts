/**
 * Red Zone 3D — route-local typed-asset manifest.
 *
 * Registers the Meshy GLBs and WAV SFX used by Red Zone 3D through the
 * engine's `defineAuraAssets`, with unquoted keys so `tools/remote-capture.sh`
 * copies every referenced payload from `public/aura-assets/` into the capture
 * serve tree.
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
  },
  rzQuarterbackMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzQuarterbackClean.f0bb6fc8.glb",
    hash: "sha256-f0bb6fc8b5e2248349485671745a659a738dde313a5b945131ca4d35a196436c",
    bounds: [0.89, 1.897, 0.505]
  },
  rzDefenderLinemanMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzDefenderLinemanClean.5f680591.glb",
    hash: "sha256-5f68059132b5db08e8d46e76cc71afb075d37906f5ba9f729fc69cef291618ca",
    bounds: [1.147, 1.896, 1.672]
  },
  rzFieldGoalPostMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rzFieldGoalPostMeshy.2521e08f.glb",
    hash: "sha256-0f638ea81945e27ae6f911a376b7db9042c0d8b1fde1ca3d1f7dc4cdbb03128c",
    bounds: [0.55, 1.899, 0.203]
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
    url: "/aura-assets/rooftopDefenderMeshy.c53681c7.glb",
    hash: "sha256-783ec8135ef8aaf1e9d6b2351b37f0573a859b99612370a8fb072660121e6ce6",
    bounds: [0.831, 1.886, 0.646]
  },
  gallerySecurityGuardMeshy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gallerySecurityGuardMeshy.e45c9d16.glb",
    hash: "sha256-4d66273f50e7fe1ba1b814f8c44f665186d9e74292dfce10e7308454dca72bd9",
    bounds: [0.739, 1.896, 0.483]
  },
  "hoopsAthleteGuard": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hoopsAthleteGuardClean.609d3371.glb",
    hash: "sha256-609d337132e4ac92fc53e5a1139a10fa23a6fc8d75cbc6fe0ab90c1cb19509a3",
    bounds: [0.905, 1.903, 0.404],
    sizeBytes: 1806752,
  },
  "hoopsAthleteBig": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hoopsAthleteBigClean.0143c69e.glb",
    hash: "sha256-0143c69efacdb0e67a5c684eaa5b1578cf0225daaf11c602797ad1c8c181dce0",
    bounds: [0.878, 1.903, 0.429],
    sizeBytes: 1690460,
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
