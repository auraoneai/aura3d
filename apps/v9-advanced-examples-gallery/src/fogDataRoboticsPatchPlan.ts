import type { RouteEvidencePlan } from "./advancedRouteEvidence";

export interface FogDataRoboticsBlocker {
  readonly routeId: RouteEvidencePlan["routeId"];
  readonly blocker: string;
  readonly helperModule: string;
  readonly sceneBuilderIntegration: string;
  readonly remainingGate: string;
}

export const fogDataRoboticsBlockers: readonly FogDataRoboticsBlocker[] = [
  {
    routeId: "fog-cathedral",
    blocker: "Atmosphere reads as flat/cropped unless haze, occlusion, dust, and aperture evidence are layered in the accepted camera.",
    helperModule: "fogCathedralEvidence.ts",
    sceneBuilderIntegration: "Use createFogCathedralEvidence() from buildFogCathedral after fog/sun/beams are read, replacing the current private addCathedralAtmosphere path.",
    remainingGate: "Screenshot review must prove no visible crop edge and must keep volumetric/god-ray claims labeled as geometry approximations."
  },
  {
    routeId: "data-galaxy",
    blocker: "Dense particle scene needs visible performance and formation evidence without claiming GPU compute particles.",
    helperModule: "dataGalaxyEvidence.ts",
    sceneBuilderIntegration: "Use createDataGalaxyEvidence() from buildDataGalaxy to append live inference-token, attractor, connection, and telemetry batches around existing point clouds.",
    remainingGate: "Frame cadence and current screenshot hashes must prove the selected particle budget remains readable and performant."
  },
  {
    routeId: "robotics-lab",
    blocker: "Robotics route needs visible timeline/state/safety/path evidence while imported clip/material fidelity remains candidate-only.",
    helperModule: "roboticsLabEvidence.ts",
    sceneBuilderIntegration: "Use createRoboticsLabEvidence() from buildRoboticsLab to append timeline playhead, inspection marker, safety zones, paths, skeleton, and monitor batches.",
    remainingGate: "Imported animation clip switching, grounding, material fidelity, and camera follow still require visual review before acceptance."
  }
];

export const sharedIntegrationNotes = [
  "Do not edit sceneBuilders.ts until its owner is clear; the app directory is currently untracked in git status, so existing route code should be treated as shared.",
  "All helper outputs are plain transforms/items/labels and can be adapted through existing item(...) and instancedItem(...) helpers.",
  "Helpers intentionally document unsupported volumetric fog, GPU-compute particles, CAD import, live telemetry, IK, and articulated robot dynamics instead of faking those gates.",
  "After integration, run the focused route Playwright gate for fog-cathedral, data-galaxy, and robotics-lab plus pnpm v9:advanced-gallery:review."
] as const;

