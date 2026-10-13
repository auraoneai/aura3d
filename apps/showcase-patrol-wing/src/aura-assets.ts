import { defineAuraAssets } from "@aura3d/engine";

// Fresh route-local typed assets (B5 port). The four GLBs are the coherent
// re-admission set from the trashed route's model pool: the same CC0
// Aura3D-synthesis files (identical sha256 to their root-catalog entries),
// regenerated deterministically by scripts/build-models.mjs and re-staged
// app-locally under public/aura-assets like the Blockfall/Vault pilots.
// Bounds and hashes are the measured values of the staged files. The
// 19.8 MB Meshy hero (patrolAircraftMeshy) is deliberately not re-admitted:
// the authored patrolWingPlane is the airframe the salvaged FlightModel's
// +X-forward axes were tuned against, and one synthesis family keeps the
// craft, drones, and pad visually coherent.
export const assets = defineAuraAssets({
  patrolWingPlane: {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrol-plane.glb",
    bounds: [2.96, 0.88, 3.56],
    hash: "sha256-59b5f48521f44ec5c56ce95b3d58a4e8c9eb99d7b02e0a36a44429631df09ade",
    metadata: {
      materials: ["fuselage-material", "canopy-material", "wing-material", "trim-material", "tail-material", "engines-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Patrol Wing model family",
      sourcePath: "apps/showcase-patrol-wing/assets/models/patrolWingPlane.glb"
    }
  },
  patrolWingDroneA: {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrol-drone-a.glb",
    bounds: [1.545, 0.64, 1.8],
    hash: "sha256-85a89a42c35ab35aa6c39a8e187080b3868c5f90f8c2425f3d97ed3dfedd7250",
    metadata: {
      materials: ["frame-material", "arms-material", "rotors-material", "eye-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Patrol Wing model family",
      sourcePath: "apps/showcase-patrol-wing/assets/models/patrolWingDroneA.glb"
    }
  },
  patrolWingDroneB: {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrol-drone-b.glb",
    bounds: [1.545, 0.6, 1.52],
    hash: "sha256-d3bc4133591fa9a6c6770217744b06ee9e3d9a3db626d7baecc141db10a4e6e2",
    metadata: {
      materials: ["frame-material", "arms-material", "rotors-material", "eye-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Patrol Wing model family",
      sourcePath: "apps/showcase-patrol-wing/assets/models/patrolWingDroneB.glb"
    }
  },
  patrolWingPadBeacon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrol-pad-beacon.glb",
    bounds: [4.4, 0.54, 4.4],
    hash: "sha256-e91f821164182982b3223a1ba7055c74c76cf80ffc081140269aea7dcf3de0e4",
    metadata: {
      materials: ["deck-material", "ring-material", "beacons-material"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Patrol Wing model family",
      sourcePath: "apps/showcase-patrol-wing/assets/models/patrolWingPadBeacon.glb"
    }
  }
} as const);
