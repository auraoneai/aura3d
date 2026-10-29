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
  gridCruiser: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVehRobotaxi.f1726137.glb",
    hash: "sha256-f17261376159d4c4e3603879a1505f891780b7835f0656b957fe56b3d4c3e95c",
    bounds: [0.8921, 1.4132, 1.9017]
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
  gridBldgVictorian: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopBldg_victorian.39183fbd.glb",
    hash: "sha256-39183fbdb70ed181352c097a0fbdf6ceaa3bceb21481f22b48e57b3509513aa0",
    bounds: [0.912, 1.737, 1.918]
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
  },
  gridSkylineTowerL: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerL.48cef1cc.glb",
    hash: "sha256-48cef1cc6f54ab2e2f2d3a57c51279101b90b0364b4ae57fe7aba0bde6a6d1de",
    bounds: [40, 202.8, 40]
  },
  gridSkylineTowerT: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
    hash: "sha256-3e5f0a0cbf4bbef5e8b0f7cfdb028fd1f18c4044efc079f44f1a3d943cf9c452",
    bounds: [51, 177.4632, 19.3]
  },
  gridSkylineTowerX: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerX.69d0e56e.glb",
    hash: "sha256-69d0e56ed3fec36848c16ddfec4f3953d52a27fab19eefaa5995cb64639d816c",
    bounds: [29.8922, 183.9244, 20.1828]
  },
  gridBayOverpass: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkOverpass.c6bb161f.glb",
    hash: "sha256-c6bb161fecdc3f00f006903a20433d1905804ce99277686cbcfe9a5ff867687b",
    bounds: [80, 26.2, 12.2]
  }
});

export type GridAssetKey = keyof typeof assets;

/** Root `aura.assets.json` id of every entry above (the production build copies files by these ids). */
export const CATALOG_IDS: Readonly<Record<GridAssetKey, string>> = {
  gridCruiser: "gridCruiser",
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
  gridBldgVictorian: "teleopBldg_victorian",
  gridBldgMidrise: "teleopBldg_midrise",
  gridBldgGlassTower: "teleopBldg_glasstower",
  gridBldgArtDeco: "teleopBldg_artdeco",
  gridSkylineTowerL: "heatsinkTowerL",
  gridSkylineTowerT: "heatsinkTowerT",
  gridSkylineTowerX: "heatsinkTowerX",
  gridBayOverpass: "heatsinkOverpass"
};
