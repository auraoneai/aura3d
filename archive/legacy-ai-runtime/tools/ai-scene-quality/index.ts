import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProductionPngStats } from "../production-runtime-report-bridge/pngStats";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const AI_SCENE_QUALITY_REPORT = "tests/reports/ai-scene/quality.json";

const screenshotPaths = [
  "tests/reports/ai-scene/screenshots/prompt-to-scene.png",
  "tests/reports/ai-scene/screenshots/scene-patch-before.png",
  "tests/reports/ai-scene/screenshots/scene-patch-after.png"
] as const;

export function createAISceneQualityReport() {
  const screenshotEvidence = screenshotPaths.map((path) => {
    const present = existsSync(resolve(path));
    const stats = present ? readProductionPngStats(resolve(path)) : null;
    const pass = stats !== null
      && stats.width >= 1_000
      && stats.height >= 700
      && stats.nonBlackPixels > stats.width * stats.height * 0.05
      && stats.uniqueColorBuckets >= 18
      && stats.localContrast >= 2;
    return { path, present, status: present ? "present" : "missing", stats, pass };
  });
  const promptEvidencePath = "tests/reports/ai-scene/prompt-to-scene-evidence.json";
  const promptEvidence = existsSync(resolve(promptEvidencePath)) ? JSON.parse(readFileSync(resolve(promptEvidencePath), "utf8")) as { pass?: boolean } : null;
  const unsupportedCases = [
    ...screenshotEvidence.filter((entry) => !entry.pass).map((entry) => unsupported(entry.path, `${entry.path} does not pass screenshot quality thresholds.`)),
    ...(promptEvidence?.pass === true ? [] : [unsupported("prompt-evidence", "Prompt-to-scene evidence report is missing or failing.")])
  ];
  return {
    schema: "a3d-ai-scene-quality",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [...screenshotPaths],
      requiredReports: [promptEvidencePath],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: screenshotEvidence.map((entry) => ({
      id: entry.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
      path: entry.path,
      present: entry.present,
      status: entry.status,
      detail: entry.pass ? "Screenshot passed AI scene visual quality thresholds." : "Screenshot missing or below threshold.",
      stats: entry.stats
    })),
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases
  };
}

export function writeAISceneQualityReport(report = createAISceneQualityReport(), path = AI_SCENE_QUALITY_REPORT): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Refresh AI scene screenshots and route evidence." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createAISceneQualityReport();
  writeAISceneQualityReport(report);
  if (!report.pass) {
    console.error(`AI scene quality failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene quality passed. Report: ${AI_SCENE_QUALITY_REPORT}`);
  }
}
