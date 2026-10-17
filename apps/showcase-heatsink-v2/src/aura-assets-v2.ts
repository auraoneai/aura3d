import { defineAuraAssets } from "@aura3d/engine";

/**
 * Route-local Meshy-generated 3D assets for Thermal Drift (v2) with verified sha256 hashes.
 */
export const v2Assets = defineAuraAssets({
  td2DronePyre: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-drone-pyre.glb",
    hash: "sha256-3d7e33017db14df853f8e72d8dfbd0abe29c9b623d525fcfc8c9fa66ec7d8dd6",
    bounds: [3.2, 1.4, 4.1],
    role: "primaryVehicle"
  },
  td2DroneBoss: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-drone-boss.glb",
    hash: "sha256-de441be2c28aadaae0b16a957c94d9e8a81cac441db8901229839c098c5a4b6b",
    bounds: [4.4, 1.9, 5.2],
    role: "primaryVehicle"
  },
  td2CoolingTower: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-cooling-tower.glb",
    hash: "sha256-3ef7cd910acfe07bb90cf95a0683afe7f53fb086aa28246edd26c50775220a1f",
    bounds: [12, 22, 12],
    role: "setDressing"
  },
  td2TowerNeon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/td2-tower-neon.glb",
    hash: "sha256-64f5a78711a0216b1e325a78c8652a4be9bfac7d7ba664a597562b0c282fab20",
    bounds: [18, 48, 18],
    role: "setDressing"
  }
});
