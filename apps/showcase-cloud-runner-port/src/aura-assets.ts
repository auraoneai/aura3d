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
  },
  // GU47 wave 2 (cumulusTowerB, PRD CD-06): Meshy text-to-3d storm tower, simplified to 19,998 triangles / 1024 textures (meshopt) and admitted with `aura3d assets import-meshy --prefix cloud-runner-port --name cumulusTowerB --profile environment`.
  cloud_runner_port_cumulusTowerB: {
    type: "model",
    format: "glb",
    // Route-local and root-relative (see cumulusTowerA): an absolute import.meta.url URL is unsafe-url and black-frames the scene.
    url: "/aura-assets/cloud_runner_port_cumulusTowerB.87ff0b39.glb",
    hash: "sha256-87ff0b39f5825b522b9cb374d597d2191da008e56fd3333b9e353b19637d6b87",
    bounds: [1.48, 1.7, 1.9],
    sizeBytes: 1319772,
    metadata: {
      materials: ["material-0"],
      animations: [],
      humanoid: false,
      textures: ["image-0", "image-1", "image-2"],
      triangles: 19998,
      provenance: {
        sourcePath: "artifacts/gu47-meshy/cloud-runner-port/cumulusTowerB/opt/model.glb",
        license: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseName: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseUrl: "https://www.meshy.ai/terms",
        licenseRaw: "Generated 2026-11-03 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 wave 2, cloud-runner-port/cumulusTowerB). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        sourceFamily: "meshy",
        retrievedAt: "2026-11-03T21:06:00.000Z",
        evidence: [
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusTowerB.rights.json",
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusTowerB.meta.json",
          "wave2:artifacts/gu47-meshy/cloud-runner-port/cumulusTowerB/opt/thumbnail.png"
        ]
      },
      sourcePath: "public/aura-assets/cloud_runner_port_cumulusTowerB.87ff0b39.glb",
      outputPath: "public/aura-assets/cloud_runner_port_cumulusTowerB.87ff0b39.glb",
      license: "Meshy generated asset (paid API, plan terms at generation time)",
      boundsMetadata: {
        min: [-0.74, -0.852, -0.952],
        max: [0.74, 0.848, 0.948],
        size: [1.48, 1.7, 1.9],
        center: [0.0, -0.002, -0.002],
        maxDimension: 1.9,
        grounded: false
      },
      role: "backdrop"
    }
  },
  // GU47 wave 2 (cumulusHut, PRD CD-13): Meshy text-to-3d stone hut, simplified to 14,395 triangles / 1024 textures (meshopt) and admitted with `aura3d assets import-meshy --prefix cloud-runner-port --name cumulusHut --profile environment`.
  cloud_runner_port_cumulusHut: {
    type: "model",
    format: "glb",
    // Route-local and root-relative (see cumulusTowerA): an absolute import.meta.url URL is unsafe-url and black-frames the scene.
    url: "/aura-assets/cloud_runner_port_cumulusHut.091fb62e.glb",
    hash: "sha256-091fb62e6a13b0c261f0efe05f5e17dd61b1988635f770cfca98b92972ceb598",
    bounds: [1.896, 1.286, 1.581],
    sizeBytes: 659996,
    metadata: {
      materials: ["material-0"],
      animations: [],
      humanoid: false,
      textures: ["image-0", "image-1", "image-2"],
      triangles: 14395,
      provenance: {
        sourcePath: "artifacts/gu47-meshy/cloud-runner-port/cumulusHut/opt/model.glb",
        license: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseName: "Meshy generated asset (paid API, plan terms at generation time)",
        licenseUrl: "https://www.meshy.ai/terms",
        licenseRaw: "Generated 2026-11-03 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 wave 2, cloud-runner-port/cumulusHut). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        sourceFamily: "meshy",
        retrievedAt: "2026-11-03T21:06:00.000Z",
        evidence: [
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusHut.rights.json",
          "evidence/game-upgrades-47/cloud-runner-port/meshy/cloud_runner_port_cumulusHut.meta.json",
          "wave2:artifacts/gu47-meshy/cloud-runner-port/cumulusHut/opt/thumbnail.png"
        ]
      },
      sourcePath: "public/aura-assets/cloud_runner_port_cumulusHut.091fb62e.glb",
      outputPath: "public/aura-assets/cloud_runner_port_cumulusHut.091fb62e.glb",
      license: "Meshy generated asset (paid API, plan terms at generation time)",
      boundsMetadata: {
        min: [-0.951, -0.642, -0.796],
        max: [0.945, 0.644, 0.786],
        size: [1.896, 1.286, 1.581],
        center: [-0.003, 0.001, -0.005],
        maxDimension: 1.896,
        grounded: false
      },
      role: "world"
    }
  }
} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
