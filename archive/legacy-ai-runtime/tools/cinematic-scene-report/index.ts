import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCinematicDirector } from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const CINEMATIC_SCENE_REPORT = "tests/reports/ai-scene/cinematic-scene-report.json";

export function createCinematicSceneReport() {
  const director = createCinematicDirector();
  const plan = director.plan({
    sceneId: "greenhouse-previs",
    prompt: "Use a slow dolly push, sunrise rim light, soft fog, floating dust, and an emotional close on a glowing flower.",
    mood: ["hopeful", "cinematic", "warm"]
  });
  const unsupportedCases = [
    ...(plan.cameras.length > 0 ? [] : [unsupported("camera-plan", "No camera plan generated.")]),
    ...(plan.shots.length > 0 ? [] : [unsupported("shot-plan", "No shot plan generated.")]),
    ...(plan.timeline.length > 0 ? [] : [unsupported("timeline", "No timeline cues generated.")]),
    ...(plan.vfx.length > 0 ? [] : [unsupported("vfx", "No VFX cues generated.")])
  ];
  return {
    schema: "a3d-cinematic-scene-report",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [
        "packages/ai-scene/src/AuraCinematicDirector.ts",
        "packages/ai-scene/src/AuraCameraPlanner.ts",
        "packages/ai-scene/src/AuraLightingPlanner.ts",
        "packages/ai-scene/src/AuraTimelinePlanner.ts"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      {
        id: "cinematic-plan",
        path: "createCinematicDirector.plan",
        present: true,
        status: "present",
        detail: `${plan.cameras.length} cameras, ${plan.shots.length} shots, ${plan.timeline.length} timeline cues, ${plan.vfx.length} VFX cues.`
      }
    ],
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases,
    plan
  };
}

export function writeCinematicSceneReport(report = createCinematicSceneReport(), path = CINEMATIC_SCENE_REPORT): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Fix cinematic director planning." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createCinematicSceneReport();
  writeCinematicSceneReport(report);
  if (!report.pass) {
    console.error(`Cinematic scene report failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Cinematic scene report passed. Report: ${CINEMATIC_SCENE_REPORT}`);
  }
}
