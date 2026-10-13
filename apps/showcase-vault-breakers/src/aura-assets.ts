import { defineAuraAssets } from "@aura3d/engine";

// Fresh route-local typed assets (B4 port). The four GLBs are the coherent
// re-admission set from the trashed route's model pool: the same CC0
// Aura3D-synthesis files (identical sha256 to their root-catalog entries),
// re-staged app-locally under public/aura-assets like the Blockfall pilot.
// Bounds and hashes are the measured values of the staged files.
export const assets = defineAuraAssets({
  vaultBreakersBall: {
    type: "model",
    format: "glb",
    url: "/aura-assets/vault-breakers-ball.glb",
    bounds: [0.28, 0.28, 0.28],
    hash: "sha256-49b8a09b2f9333b150eb24a9416073618c49bb11c7a48bc79174789791a17a31",
    metadata: {
      materials: ["chrome-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Vault Breakers model family",
      sourcePath: "apps/showcase-vault-breakers/assets/models/vaultBreakersBall.glb"
    }
  },
  vaultBreakersFlipperReal: {
    type: "model",
    format: "glb",
    url: "/aura-assets/vault-breakers-flipper-real.glb",
    bounds: [5.235, 1.394, 1.86],
    hash: "sha256-ae70acd937068af1b31ab1316272c2dedb6072542ed714052d74aec2614a4d16",
    metadata: {
      materials: ["Material.002"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Vault Breakers model family",
      sourcePath: "apps/showcase-vault-breakers/assets/models/vaultBreakersFlipperReal.glb"
    }
  },
  vaultBreakersMechanisms: {
    type: "model",
    format: "glb",
    url: "/aura-assets/vault-breakers-mechanisms.glb",
    bounds: [5.13, 0.34, 7.06],
    hash: "sha256-274e6bf9d38b2a7a6b78c977d8e0dc726d9139ae479c6af4a5c29dd5c237dbd6",
    metadata: {
      materials: ["brassMechanisms-material", "cyanMechanisms-material", "targetFaces-material", "slingshots-material", "laneGuides-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Vault Breakers model family",
      sourcePath: "apps/showcase-vault-breakers/assets/models/vaultBreakersMechanisms.glb"
    }
  },
  vaultBreakersVaultDoor: {
    type: "model",
    format: "glb",
    url: "/aura-assets/vault-breakers-vault-door.glb",
    bounds: [0.52, 0.515, 0.09],
    hash: "sha256-af04f8d4b05a9bf42d11b9248d406d74040022f7fae88b228cf3e5f277d60467",
    metadata: {
      materials: ["rim-material", "disc-material", "wheel-material", "statusLeds-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Vault Breakers model family",
      sourcePath: "apps/showcase-vault-breakers/assets/models/vaultBreakersVaultDoor.glb"
    }
  }
} as const);
