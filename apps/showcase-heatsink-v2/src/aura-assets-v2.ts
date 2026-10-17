/**
 * THERMAL DRIFT v2 — app-local typed asset registry.
 *
 * Reuses the admitted heatsink catalogue GLBs (served from the repository-root
 * public/aura-assets/ bucket) plus app-local Meshy-generated hero assets under
 * this app's own public/aura-assets/ directory. Everything is registered
 * through defineAuraAssets so every model node binds a typed AuraAssetRef.
 */
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetRef } from "@aura3d/engine";
import { assets as catalogAssets } from "../../../src/aura-assets";

const heatsinkDefinitions = {
  heatsinkArch: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkArch.9a90ebd4.glb",
    hash: "sha256-9a90ebd4",
    bounds: [28, 16, 8]
  },
  heatsinkBarrierA: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBarrierA.ac31de34.glb",
    hash: "sha256-ac31de34",
    bounds: [4.2, 1.4, 1.2]
  },
  heatsinkBoostPad: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBoostPad.e58b4f3c.glb",
    hash: "sha256-e58b4f3c",
    bounds: [4.5, 0.35, 5.5]
  },
  heatsinkCheckpointRing: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCheckpointRing.67ee1db8.glb",
    hash: "sha256-67ee1db8",
    bounds: [18, 18, 2.4]
  },
  heatsinkCoolingCanister: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCoolingCanister.0199c8d5.glb",
    hash: "sha256-0199c8d5",
    bounds: [1.4, 2.2, 1.4]
  },
  heatsinkDroneBastion: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneBastion.6a09c499.glb",
    hash: "sha256-6a09c499",
    bounds: [3.2, 1.2, 3.8]
  },
  heatsinkDroneNighthawk: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneNighthawk.8113ba27.glb",
    hash: "sha256-8113ba27",
    bounds: [3.1, 1.1, 3.7]
  },
  heatsinkDroneOrion: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneOrion.988f172d.glb",
    hash: "sha256-988f172d",
    bounds: [3.0, 1.1, 3.6]
  },
  heatsinkDroneRazor: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneRazor.2f28a258.glb",
    hash: "sha256-2f28a258",
    bounds: [3.1, 1.1, 3.6]
  },
  heatsinkDroneSpectre: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneSpectre.f66809c1.glb",
    hash: "sha256-f66809c1",
    bounds: [3.0, 1.05, 3.7]
  },
  heatsinkDroneVolt: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneVolt.f1825d10.glb",
    hash: "sha256-f1825d10",
    bounds: [2.9, 1.0, 3.5]
  },
  heatsinkDroneWraith: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneWraith.c0a00195.glb",
    hash: "sha256-c0a00195",
    bounds: [2.95, 1.0, 3.6]
  },
  heatsinkExplosiveBarrel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkExplosiveBarrel.543538b2.glb",
    hash: "sha256-543538b2",
    bounds: [1.3, 1.9, 1.3]
  },
  heatsinkGantryStart: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkGantryStart.7f73743e.glb",
    hash: "sha256-7f73743e",
    bounds: [28, 14, 6]
  },
  heatsinkHoloBillboard: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkHoloBillboard.d3d7edc7.glb",
    hash: "sha256-d3d7edc7",
    bounds: [12, 8, 2.2]
  },
  heatsinkLavaFall: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkLavaFall.71c51eb3.glb",
    hash: "sha256-71c51eb3",
    bounds: [10, 22, 6]
  },
  heatsinkOverpass: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkOverpass.c6bb161f.glb",
    hash: "sha256-c6bb161f",
    bounds: [32, 14, 10]
  },
  heatsinkShieldPickup: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkShieldPickup.e3b41a15.glb",
    hash: "sha256-e3b41a15",
    bounds: [1.8, 1.8, 1.8]
  },
  heatsinkStatue: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkStatue.7ac4ef8a.glb",
    hash: "sha256-7ac4ef8a",
    bounds: [14, 28, 14]
  },
  heatsinkTowerL: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerL.48cef1cc.glb",
    hash: "sha256-48cef1cc",
    bounds: [22, 64, 22]
  },
  heatsinkTowerT: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
    hash: "sha256-3e5f0a0c",
    bounds: [24, 72, 24]
  },
  heatsinkTowerX: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerX.69d0e56e.glb",
    hash: "sha256-69d0e56e",
    bounds: [26, 78, 26]
  },
  heatsinkTunnelFrame: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTunnelFrame.1678ba89.glb",
    hash: "sha256-1678ba89",
    bounds: [26, 15, 8]
  },
  heatsinkWaterEmitter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWaterEmitter.7721726f.glb",
    hash: "sha256-7721726f",
    bounds: [8, 14, 5]
  },
  heatsinkWeaponMine: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponMine.10baedc3.glb",
    hash: "sha256-10baedc3",
    bounds: [1.6, 0.9, 1.6]
  },
  heatsinkWeaponShockwave: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponShockwave.816dd6ed.glb",
    hash: "sha256-816dd6ed",
    bounds: [2.4, 0.8, 2.4]
  }
} satisfies Record<string, AuraAssetDefinition>;

/**
 * Meshy-generated hero assets (artifacts/meshy/thermal-* → copied into this
 * app's public/aura-assets/). Optional at runtime: every consumer reads them
 * through `meshyAssets`, which is empty when the GLB never landed.
 */
const meshyDefinitions = {
  td2DronePyre: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-drone-pyre.glb",
    hash: "sha256-3d7e3301",
    optional: true,
    bounds: [4.4, 1.6, 4.6],
    metadata: { license: "Meshy-generated for Thermal Drift v2 (see artifacts/meshy/thermal-drone-pyre/rights.json)" }
  },
  td2DroneBoss: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-drone-boss.glb",
    hash: "sha256-de441be2",
    optional: true,
    bounds: [5.2, 2.0, 5.4],
    metadata: { license: "Meshy-generated for Thermal Drift v2 (see artifacts/meshy/thermal-boss-drone/rights.json)" }
  },
  td2CoolingTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-cooling-tower.glb",
    hash: "sha256-3ef7cd91",
    optional: true,
    bounds: [4.6, 9.5, 4.6],
    metadata: { license: "Meshy-generated for Thermal Drift v2 (see artifacts/meshy/thermal-cooling-tower/rights.json)" }
  },
  td2TowerNeon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-tower-neon.glb",
    hash: "sha256-64f5a787",
    optional: true,
    bounds: [16, 84, 16],
    metadata: { license: "Meshy-generated for Thermal Drift v2 (see artifacts/meshy/thermal-tower-neon/rights.json)" }
  }
} satisfies Record<string, AuraAssetDefinition>;

/** Whether each optional Meshy GLB was actually emitted into public/. */
export const MESHY_ASSETS_PRESENT = {
  td2DronePyre: true,
  td2DroneBoss: true,
  td2CoolingTower: true,
  td2TowerNeon: true
} as const;

const meshyDefs = Object.fromEntries(
  Object.entries(meshyDefinitions).filter(
    ([key]) => MESHY_ASSETS_PRESENT[key as keyof typeof MESHY_ASSETS_PRESENT]
  )
) as typeof meshyDefinitions;

type HeatsinkAssetMap = { readonly [K in keyof typeof heatsinkDefinitions]: AuraAssetRef<"model"> };
type MeshyAssetMap = { readonly [K in keyof typeof meshyDefinitions]: AuraAssetRef<"model"> };

export const assets: HeatsinkAssetMap & MeshyAssetMap & typeof catalogAssets = {
  ...defineAuraAssets(heatsinkDefinitions),
  ...defineAuraAssets(meshyDefs),
  ...catalogAssets
};
