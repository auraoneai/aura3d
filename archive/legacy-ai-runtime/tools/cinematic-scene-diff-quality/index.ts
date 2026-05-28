import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";
import { readCinematicPngStats } from "../cinematic-scene-quality/pngStats";

export const CINEMATIC_SCENE_DIFF_QUALITY_REPORT = "tests/reports/cinematic/scene-diff-quality.json";

const beforePath = "tests/reports/cinematic/screenshots/cinematic-scene-before.png";
const afterPath = "tests/reports/cinematic/screenshots/cinematic-scene-after.png";

interface CinematicFailure {
  readonly id: string;
  readonly severity: "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

export function createCinematicSceneDiffQualityReport(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const before = readStatsIfPresent(resolvedRoot, beforePath);
  const after = readStatsIfPresent(resolvedRoot, afterPath);
  const statsDelta = before && after
    ? {
        uniqueColorBuckets: after.uniqueColorBuckets - before.uniqueColorBuckets,
        localContrast: Number((after.localContrast - before.localContrast).toFixed(6)),
        foregroundCoverage: Number((after.foregroundCoverage - before.foregroundCoverage).toFixed(6))
      }
    : null;
  const failures: CinematicFailure[] = [];
  if (!before) failures.push(failure("missing-before", `${beforePath} is missing.`));
  if (!after) failures.push(failure("missing-after", `${afterPath} is missing.`));
  if (statsDelta && Math.abs(statsDelta.uniqueColorBuckets) < 8 && Math.abs(statsDelta.localContrast) < 2 && Math.abs(statsDelta.foregroundCoverage) < 0.01) {
    failures.push(failure("weak-visible-diff", "Scene patch screenshots do not show a meaningful visual change."));
  }
  return {
    schema: "a3d-cinematic-scene-diff-quality",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolvedRoot) || "."),
      providerMode: "fixture",
      backend: "webgl2",
      requiredFiles: [beforePath, afterPath],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      screenshotEvidence("before", beforePath, Boolean(before), before),
      screenshotEvidence("after", afterPath, Boolean(after), after),
      {
        id: "scene-diff-delta",
        path: CINEMATIC_SCENE_DIFF_QUALITY_REPORT,
        present: Boolean(statsDelta),
        status: statsDelta ? "present" as const : "missing" as const,
        detail: "Pixel-stat delta between before and after cinematic patch screenshots.",
        statsDelta
      }
    ],
    providerMode: "fixture",
    backend: "webgl2",
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: [beforePath, afterPath].map((path) => ({ path, present: existsSync(resolve(resolvedRoot, path)) }))
  };
}

export function writeCinematicSceneDiffQualityReport(report = createCinematicSceneDiffQualityReport(), reportPath = CINEMATIC_SCENE_DIFF_QUALITY_REPORT): void {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function readStatsIfPresent(root: string, path: string) {
  const absolute = resolve(root, path);
  return existsSync(absolute) ? readCinematicPngStats(absolute) : null;
}

function screenshotEvidence(id: string, path: string, present: boolean, stats: unknown) {
  return {
    id,
    path: redactSecrets(path),
    present,
    status: present ? "present" as const : "missing" as const,
    detail: present ? "Cinematic scene diff screenshot was analyzed." : "Cinematic scene diff screenshot is missing.",
    stats
  };
}

function failure(id: string, detail: string): CinematicFailure {
  return {
    id,
    severity: "blocked",
    detail,
    nextAction: "Capture before/after cinematic patch screenshots with a visible renderer-owned change."
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createCinematicSceneDiffQualityReport();
  writeCinematicSceneDiffQualityReport(report);
  if (!report.pass) {
    console.error(`Cinematic scene diff quality failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Cinematic scene diff quality passed. Report: ${CINEMATIC_SCENE_DIFF_QUALITY_REPORT}`);
  }
}
