import { defineAuraAssets } from "@aura3d/engine";

/**
 * Grid Dispatch's own asset manifest (RH-06): the game imports only these entries, not the 2.6 MB root catalog.
 *
 * Keys are generic game names. `catalogId` is the id of the same file in the root `aura.assets.json`: the production build
 * (`marketing/scripts/build-showcase-routes.mjs`) copies an asset into the deploy only when its manifest id appears in the
 * route source, so the alias has to stay until the manifest ids are renamed (handoff to lane E5). Every url and hash below is
 * checked against the root manifest by tests/unit/teleoperator/assets.test.ts.
 */
export const assets = defineAuraAssets({
  // GU47 phase 4 (WP-36 dispatchPodPearl, GD-11/GD-12): the player pod is the Meshy retexture of this game's own robotaxi
  // mesh (same 29.5k-triangle geometry, centred, longest side 2), route-local under apps/showcase-teleoperator/public
  // (`aura3d assets import-meshy --into ... --prefix teleoperator`; rights and meta in public/aura-assets/meshy/provenance).
  gridCruiser: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchPodPearl.glb",
    hash: "sha256-99d368966e04d8160574d10eee242202d3c6134713e0fa7b573c665bff300ad9",
    bounds: [0.9382, 1.4863, 2]
  },
  gridRivalCruiser: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehRobotaxi.f1726137.glb",
    hash: "sha256-f17261376159d4c4e3603879a1505f891780b7835f0656b957fe56b3d4c3e95c",
    bounds: [0.8921, 1.4132, 1.9017]
  },
  gridCoupe: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehHatch.53933015.glb",
    hash: "sha256-539330153115bc87e3174152b2a9bae64315536a6813e3ad1f26246e6e5584ae",
    bounds: [1.2939, 1.1513, 1.9016]
  },
  gridTruck: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehPickup.aaee30b6.glb",
    hash: "sha256-aaee30b6487d0b33f436eec2885f9c39a258a31259569a60084a48f67a4a3fd1",
    bounds: [0.7774, 0.7276, 1.9027]
  },
  gridGt: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehCoupe.83b731ca.glb",
    hash: "sha256-83b731ca6b1fd5d63f81d5fa2308dfc071a9ec07d744c03e3790c3f4fbb34631",
    bounds: [0.9245, 0.5271, 1.9061]
  },
  gridInterceptor: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehRoadster.35a1e8b7.glb",
    hash: "sha256-35a1e8b73a975c9d6d8f4b4b4ae5bcf59feae133dec059d128cfb1b0f60255f1",
    bounds: [0.8736, 0.5225, 1.9019]
  },
  gridCablecar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopCablecar.6412a9ca.glb",
    hash: "sha256-6412a9cac8abcb7b26156602dde013b87af5d8d7127cca6606f714fc18df16de",
    bounds: [2.8885, 4.093, 8.3975]
  },
  gridSedan: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehSedan.431efea6.glb",
    hash: "sha256-431efea6742402eacb7aa4543c9223391a87fe7d66aee20e356a63f2d4af9596",
    bounds: [0.8144, 0.6568, 1.9007]
  },
  gridHatch: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehHatch.53933015.glb",
    hash: "sha256-539330153115bc87e3174152b2a9bae64315536a6813e3ad1f26246e6e5584ae",
    bounds: [1.2939, 1.1513, 1.9016]
  },
  gridTaxi: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehSedan.431efea6.glb",
    hash: "sha256-431efea6742402eacb7aa4543c9223391a87fe7d66aee20e356a63f2d4af9596",
    bounds: [0.8144, 0.6568, 1.9007]
  },
  gridVan: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehVan.6e9c71d7.glb",
    hash: "sha256-6e9c71d779c64bc31fe74c6f02376e3c7e809efefa113f1b7f46426be1863e37",
    bounds: [0.895, 1.1164, 1.9004]
  },
  gridPickup: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehPickup.aaee30b6.glb",
    hash: "sha256-aaee30b6487d0b33f436eec2885f9c39a258a31259569a60084a48f67a4a3fd1",
    bounds: [0.7774, 0.7276, 1.9027]
  },
  gridBoxTruck: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehBoxTruck.de4b81d4.glb",
    hash: "sha256-de4b81d45d5203751d7872ebde6c437ef1348d71495d8fe77442100f0422d920",
    bounds: [0.9023, 1.0833, 1.9004]
  },
  // GU47 wave 1 (WP-36 dispatchFacadeVictorian, GD-12/GD-02): Meshy retexture of this game's own Victorian facade (blue-grey
  // bay windows with lit panes; same 5,858 triangles, same aspect, centred and rescaled to longest side 2, so the position
  // hash changed), route-local like the pod (rights and meta in public/aura-assets/meshy/provenance).
  gridBldgVictorian: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchFacadeVictorian.glb",
    hash: "sha256-594d4a197910c149f2a1c8e1f8397c00d3d66d8af31299449cbfa21c1798b5ac",
    bounds: [0.951, 1.812, 2]
  },
  // GU47 wave 2 (WP-36 dispatchPyramidTower/GlassTower/BridgeTower/BridgeDeck/BuildingA/BuildingB, GD-12): Meshy text-to-3D
  // skyline landmarks, bridge set-piece and two street-front buildings, route-local like the pod. Each was simplified to
  // <= 20k triangles (skyline and bridge at 512 px textures, buildings at 1024 px); rights and meta in public/aura-assets/meshy/provenance.
  gridPyramidTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchPyramidTower.glb",
    hash: "sha256-a3a4837c4d22fd8be80f141c66df0952e8dcd6170aebad489914b61d72b179a7",
    bounds: [0.4607, 1.9038, 0.3966]
  },
  gridGlassTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchGlassTower.glb",
    hash: "sha256-ca852bc8be0e46386f529c61b505981016427b6843ceb3a6a63d0a6164b3f05c",
    bounds: [1.6673, 1.9032, 1.2667]
  },
  gridBridgeTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchBridgeTower.glb",
    hash: "sha256-67e567a458694f2bbd91c34776257889255707e4e61a136a5dd6a5bfcb419da7",
    bounds: [0.6058, 1.9022, 1.7849]
  },
  gridBridgeDeck: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchBridgeDeck.glb",
    hash: "sha256-97f12454094a4a21acf67fbd4e7fad4ef3e7c46b9d27af8fb428d16d8acff67c",
    bounds: [1.9004, 0.3736, 0.7851]
  },
  // meshy07 (GD-16): the kerbside passenger, Meshy rigged and animated (24-joint humanoid, `wave` clip only; the `idle` clip
  // was dropped because its 95 deg thigh twist fails the skin check). Armature scale baked to metres, repair-skin
  // (normalize, prune-distant, smooth-bridges x8, cut-stretch 1.6), simplified to 14.3k triangles, normal/ORM at 512 px.
  gridPassenger: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchPassengerAnimR2.glb",
    hash: "sha256-bca3eb1bdd8367585fe860341c897fb1eb095087870de175fa32def3c9e90941",
    bounds: [1.46, 1.72, 0.36]
  },
  gridBldgNew1: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchBuildingA.glb",
    hash: "sha256-c99523e53ea46a9c7e96217fabc782c147c3fdec76ae3fe9d0e1b05180a57a64",
    bounds: [1.8926, 1.4001, 1.8972]
  },
  gridBldgNew2: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meshy/models/teleoperator_dispatchBuildingB.glb",
    hash: "sha256-f20013633822bd3822c0109122427a623d28cc3b9d84e85f307816326ecaea09",
    bounds: [1.7699, 1.8896, 0.7724]
  },
  gridBldgMidrise: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopBldg_midrise.900faa17.glb",
    hash: "sha256-900faa17b4ef1e68ade58153dd5276b66d9adf1cdb34e52b2ea4c5a19e4dec12",
    bounds: [1.85, 1.893, 1.641]
  },
  gridBldgGlassTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopBldg_glasstower.6338509c.glb",
    hash: "sha256-6338509cd5bdf322c977c3c3999cc4f7dd7da1f9821beac6c8dbcc44f87d448a",
    bounds: [0.844, 1.902, 0.87]
  },
  gridBldgArtDeco: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopBldg_artdeco.9b8dc08f.glb",
    hash: "sha256-9b8dc08f5391bb79295dff5807225448e84876aa9c515439429b951218495771",
    bounds: [0.952, 1.902, 0.951]
  }
  // GU47 (D2): the borrowed Heatsink skyline towers and overpass were removed; the skyline uses this game's own towers.
});

export type GridAssetKey = keyof typeof assets;

/**
 * Root `aura.assets.json` id of every entry above (the production build copies files by these ids). `null`: a route-local
 * file under apps/showcase-teleoperator/public (the deploy flattens the app's public tree onto the origin root).
 */
export const CATALOG_IDS: Readonly<Record<GridAssetKey, string | null>> = {
  gridCruiser: null,
  gridRivalCruiser: "gridRivalCruiser",
  gridCoupe: "gridCoupe",
  gridTruck: "gridTruck",
  gridGt: "gridGt",
  gridInterceptor: "gridInterceptor",
  gridCablecar: "teleopCablecar",
  gridSedan: "gridSedan",
  gridHatch: "gridHatch",
  gridTaxi: "gridTaxi",
  gridVan: "gridVan",
  gridPickup: "gridPickup",
  gridBoxTruck: "gridBoxTruck",
  gridBldgVictorian: null,
  gridPyramidTower: null,
  gridGlassTower: null,
  gridBridgeTower: null,
  gridBridgeDeck: null,
  gridPassenger: null,
  gridBldgNew1: null,
  gridBldgNew2: null,
  gridBldgMidrise: "teleopBldg_midrise",
  gridBldgGlassTower: "teleopBldg_glasstower",
  gridBldgArtDeco: "teleopBldg_artdeco"
};
