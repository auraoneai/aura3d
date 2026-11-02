// Craterline GP's route-local typed assets (GU47 WP-36 rows admitted with `aura3d assets import-meshy --prefix
// strange-orbit-port`). The older Meshy models stay in examples/strange-orbit-port/models.ts.
//
// The URL stays ROOT-RELATIVE: the file lives in this app's public/aura-assets and ships through
// copyRouteLocalAuraAssets (marketing/scripts/build-showcase-routes.mjs). An absolute `new URL(..., import.meta.url)`
// is a remote URL to the production bridge, the model becomes `unsafe-url` and the whole scene fails to mount.
import { defineAuraAssets, type AuraAssetDefinition } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (paid API, plan terms at generation time)";

const definitions = {
  // GU47 SO47-M1 (craterPylon): Meshy retexture of the gate pylon (examples/strange-orbit-port/assets/models/pylon.glb)
  // in painted terracotta with teal bands. NOT a pure retexture: the optimizer rewrote the mesh (position hash changed,
  // 21,812 -> 8,024 triangles), same proportions (0.351 x 2 x 0.351 vs 0.334 x 1.903 x 0.334, ratio 0.1755 both).
  "strange_orbit_port_craterPylon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/strange_orbit_port_craterPylon.da045484.glb",
    hash: "sha256-da0454845b8de6198d168068890a1c00ca89af8027104e828697d157d8d1c584",
    bounds: [0.351, 2, 0.351],
    sizeBytes: 697984,
    metadata: {
      materials: ["material-0"],
      animations: [],
      provenance: {
        sourcePath: "public/aura-assets/strange_orbit_port_craterPylon.da045484.glb",
        license: LICENSE,
        licenseName: LICENSE,
        licenseUrl: "https://www.meshy.ai/terms",
        licenseRaw: "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (examples/strange-orbit-port/assets/models/pylon.glb) (GU47 WP-36, strange-orbit-port/craterPylon). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        sourceFamily: "meshy",
        retrievedAt: "2026-11-01T21:51:22.654Z",
        evidence: [
          "examples/strange-orbit-port/assets/provenance/strange_orbit_port_craterPylon.rights.json",
          "examples/strange-orbit-port/assets/provenance/strange_orbit_port_craterPylon.meta.json",
          "wp36:artifacts/gu47-meshy/strange-orbit-port/craterPylon/opt/thumbnail.png"
        ]
      },
      sourcePath: "public/aura-assets/strange_orbit_port_craterPylon.da045484.glb",
      outputPath: "public/aura-assets/strange_orbit_port_craterPylon.da045484.glb",
      license: LICENSE,
      boundsMetadata: { min: [-0.176, -1, -0.176], max: [0.176, 1, 0.176], size: [0.351, 2, 0.351], center: [0, 0, 0], maxDimension: 2, grounded: false }
    }
  }
} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
