import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const AI_SCENE_REPORT_FRESHNESS_REPORT = "tests/reports/ai-scene/report-freshness.json";

const requiredReports = [
  "tests/reports/ai-scene/route-health.json",
  "tests/reports/ai-scene/provider-contracts.json",
  "tests/reports/ai-scene/scene-ir-schema-audit.json",
  "tests/reports/ai-scene/prompt-to-scene-evidence.json",
  "tests/reports/ai-scene/scene-diff-audit.json",
  "tests/reports/ai-scene/cinematic-scene-report.json",
  "tests/reports/ai-scene/claim-scan.json",
  "tests/reports/ai-scene/secret-audit.json",
  "tests/reports/ai-scene/quality.json"
] as const;

export function createAISceneReportFreshnessReport(now = new Date()) {
  const maxAgeMs = Number(process.env.A3D_AI_SCENE_REPORT_MAX_AGE_MS ?? 1000 * 60 * 60 * 24);
  const evidence = requiredReports.map((path) => {
    const present = existsSync(resolve(path));
    const generatedAt = present ? readGeneratedAt(path) : null;
    const ageMs = generatedAt ? now.getTime() - new Date(generatedAt).getTime() : null;
    const pass = Boolean(generatedAt) && ageMs !== null && ageMs >= 0 && ageMs <= maxAgeMs;
    return { path, present, generatedAt, ageMs, maxAgeMs, pass };
  });
  const unsupportedCases = evidence.filter((entry) => !entry.pass).map((entry) => ({
    id: entry.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
    severity: "blocked" as const,
    detail: `${entry.path} is missing or stale.`,
    nextAction: "Run the AI scene report pipeline."
  }));
  return {
    schema: "a3d-ai-scene-report-freshness",
    generatedAt: now.toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [],
      requiredReports: [...requiredReports],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: evidence.map((entry) => ({
      id: entry.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
      path: entry.path,
      present: entry.present,
      status: entry.present ? "present" : "missing",
      detail: entry.pass ? "Report is fresh." : "Report is missing or stale.",
      generatedAt: entry.generatedAt,
      ageMs: entry.ageMs
    })),
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases
  };
}

export function writeAISceneReportFreshnessReport(report = createAISceneReportFreshnessReport(), path = AI_SCENE_REPORT_FRESHNESS_REPORT): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function readGeneratedAt(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createAISceneReportFreshnessReport();
  writeAISceneReportFreshnessReport(report);
  if (!report.pass) {
    console.error(`AI scene report freshness failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene report freshness passed. Report: ${AI_SCENE_REPORT_FRESHNESS_REPORT}`);
  }
}
