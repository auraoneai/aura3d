// Cumulus Dash's route-local typed assets: Meshy models admitted after the shared catalog froze (GU47 WP-36).
// The game's original Meshy set stays in examples/kid-goku-beyond-the-clouds-port/models.ts.
import { defineAuraAssets, type AuraAssetDefinition } from "@aura3d/engine";

const definitions = {
  // GU47 WP-36 (cumulusTowerA, PRD CD-06): Meshy text-to-3d storm tower, admitted with
  // `aura3d assets import-meshy --prefix cloud-runner-port --name cumulusTowerA --profile environment`
  // (rights and task metadata in evidence/game-upgrades-47/cloud-runner-port/meshy).
  cloud_runner_port_cumulusTowerA: {
    type: "model",
    format: "glb",
    // Route-local: lives in this app's public/aura-assets and ships through copyRouteLocalAuraAssets. The URL stays
    // root-relative: an absolute `new URL(..., import.meta.url)` is a remote URL to the production bridge, the model
    // becomes `unsafe-url` and the whole scene fails to mount (RENDERER_MOUNT_FAILED, black frame).
    url: "/aura-assets/cloud_runner_port_cumulusTowerA.3b883368.glb",
    hash: "sha256-3b88336882a3178d6cf25eb5eff99030871bb0536a5e5ab0d8e25778f3255049",
    bounds: [1.898, 1.471, 1.643],
    sizeBytes: 1998220,
    metadata: {
      materials: ["material-0"],
      animations: [],
      humanoid: false,
      textures: ["image-0", "image-1", "image-2"],
      triangles: 51404,
      provenance: {
        sourcePath: "artifacts/gu47-meshy/cloud-runner-port/cumulusTowerA/opt/model.glb",
        license: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseName: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseUrl: "https://www.meshy.ai/terms",
        licenseRaw: "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, cloud-runner-port/cumulusTowerA). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        sourceFamily: "meshy",
        retrievedAt: "2026-11-01T21:47:50.815Z",
        evidence: [
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusTowerA.rights.json",
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusTowerA.meta.json",
          "wp36:artifacts/gu47-meshy/cloud-runner-port/cumulusTowerA/opt/thumbnail.png"
        ]
      },
      sourcePath: "public/aura-assets/cloud_runner_port_cumulusTowerA.3b883368.glb",
      outputPath: "public/aura-assets/cloud_runner_port_cumulusTowerA.3b883368.glb",
      license: "Meshy generated asset (paid API, plan terms at generation time)",
      boundsMetadata: {
        min: [-0.948, -0.735, -0.82],
        max: [0.95, 0.736, 0.823],
        size: [1.898, 1.471, 1.643],
        center: [0.001, 0, 0.002],
        maxDimension: 1.898,
        grounded: false
      },
      role: "background"
    }
  }
} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
