import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";
import { evaluateCinematicColorMetrics } from "./colorMetrics";
import { collectCinematicSourceEvidence, evaluateCinematicCompositionMetrics, type CinematicSourceEvidence } from "./compositionMetrics";
import { readCinematicPngStats, type CinematicPngStats } from "./pngStats";

export const CINEMATIC_SCREENSHOT_QUALITY_REPORT = "tests/reports/cinematic/screenshot-quality.json";
export const DEFAULT_CINEMATIC_SCREENSHOT = "tests/reports/cinematic/screenshots/cinematic-prompt-to-scene.png";

export interface CinematicSceneQualityOptions {
  readonly root?: string;
  readonly screenshotPath?: string;
  readonly screenshots?: readonly string[];
  readonly providerMode?: "fixture" | "mock" | "live" | "local";
  readonly backend?: string;
  readonly sourceEvidence?: CinematicSourceEvidence;
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}

export interface CinematicQualityFailure {
  readonly id: string;
  readonly severity: "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

export function createCinematicSceneQualityReport(options: CinematicSceneQualityOptions = {}) {
  const root = resolve(options.root ?? process.cwd());
  const screenshots = [...(options.screenshots ?? [options.screenshotPath ?? DEFAULT_CINEMATIC_SCREENSHOT])];
  const sourceEvidence = options.sourceEvidence ?? collectCinematicSourceEvidence(root);
  const screenshotEvidence = screenshots.map((path) => analyzeScreenshot(root, path, sourceEvidence));
  const failures = screenshotEvidence.flatMap((entry) => entry.failures);
  const providerMode = options.providerMode ?? sourceEvidence.providerMode;
  const backend = options.backend ?? sourceEvidence.backend;
  return {
    schema: "a3d-cinematic-screenshot-quality",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode,
      backend,
      requiredFiles: screenshots.map(redactSecrets),
      requiredReports: [],
      environment: collectProviderEnvironment(options.env ?? process.env)
    },
    evidence: [
      {
        id: "cinematic-source-evidence",
        path: sourceEvidence.routePath,
        present: true,
        status: "present" as const,
        detail: "Audited route source for renderer-owned cinematic evidence versus DOM/CSS overlays.",
        sourceEvidence
      },
      ...screenshotEvidence
    ],
    providerMode,
    backend,
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: screenshotEvidence.map((entry) => ({
      path: entry.path,
      present: entry.present,
      stats: entry.stats,
      pass: entry.pass,
      failures: entry.failures.map((failure) => failure.detail)
    }))
  };
}

export function writeCinematicSceneQualityReport(
  report = createCinematicSceneQualityReport(),
  reportPath = CINEMATIC_SCREENSHOT_QUALITY_REPORT
): void {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function analyzeScreenshot(root: string, path: string, sourceEvidence: CinematicSourceEvidence) {
  const absolute = resolve(root, path);
  const present = existsSync(absolute);
  const stats = present ? readCinematicPngStats(absolute) : null;
  const gates = stats
    ? [
        ...evaluateCinematicColorMetrics(stats),
        ...evaluateCinematicCompositionMetrics(stats, sourceEvidence)
      ]
    : [];
  const failures: CinematicQualityFailure[] = present && stats
    ? gates.filter((gate) => !gate.pass).map((gate) => failure(gate.id, `${gate.detail} actual=${gate.actual} threshold=${gate.threshold}`))
    : [failure("missing-screenshot", `${path} is missing.`)];
  return {
    id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    path: redactSecrets(path),
    present,
    status: present ? "present" as const : "missing" as const,
    detail: present ? "Captured cinematic route screenshot and evaluated cinematic previs visual gates." : "Screenshot is missing.",
    stats,
    gates,
    pass: failures.length === 0,
    failures
  };
}

function failure(id: string, detail: string): CinematicQualityFailure {
  return {
    id,
    severity: "blocked",
    detail,
    nextAction: "Move cinematic evidence into renderer-owned scene content and refresh screenshots."
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createCinematicSceneQualityReport();
  writeCinematicSceneQualityReport(report);
  if (!report.pass) {
    console.error(`Cinematic screenshot quality failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Cinematic screenshot quality passed. Report: ${CINEMATIC_SCREENSHOT_QUALITY_REPORT}`);
  }
}
