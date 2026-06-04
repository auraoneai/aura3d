import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";
import { collectCinematicSourceEvidence } from "../cinematic-scene-quality/compositionMetrics";

export const CINEMATIC_ASSET_READINESS_REPORT = "tests/reports/cinematic/asset-readiness.json";

interface CinematicFailure {
  readonly id: string;
  readonly severity: "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

export function createCinematicAssetReadinessReport(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const sourceEvidence = collectCinematicSourceEvidence(resolvedRoot);
  const assetPaths = sourceEvidence.realAssets.map((id) => sourcePathForAsset(id));
  const assetEvidence = assetPaths.map((path) => ({
    id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    path: redactSecrets(path),
    present: existsSync(resolve(resolvedRoot, path)),
    status: existsSync(resolve(resolvedRoot, path)) ? "present" as const : "missing" as const,
    detail: "Renderer-owned cinematic asset file evidence."
  }));
  const failures: CinematicFailure[] = [];
  if (sourceEvidence.realAssets.length === 0) failures.push(failure("real-assets", "No renderer-owned cinematic assets were found."));
  if (sourceEvidence.rendererOwnedHeroProps.length === 0) failures.push(failure("hero-prop-asset", "The north-star story prop is not renderer-owned."));
  if (sourceEvidence.rendererOwnedEnvironment.length === 0) failures.push(failure("environment-asset", "The north-star environment/set is not renderer-owned."));
  if (sourceEvidence.rendererOwnedVfx.length === 0) failures.push(failure("renderer-vfx", "The north-star rain/fog/glow VFX are not renderer-owned."));
  for (const evidence of assetEvidence) {
    if (!evidence.present) failures.push(failure(`missing:${evidence.path}`, `${evidence.path} is referenced but missing.`));
  }
  return {
    schema: "a3d-cinematic-asset-readiness",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolvedRoot) || "."),
      providerMode: sourceEvidence.providerMode,
      backend: sourceEvidence.backend,
      requiredFiles: assetPaths,
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      {
        id: "source-evidence",
        path: sourceEvidence.routePath,
        present: true,
        status: "present" as const,
        detail: "Audited fixture asset roles for renderer-owned hero, prop, environment, and VFX coverage.",
        sourceEvidence
      },
      ...assetEvidence
    ],
    providerMode: sourceEvidence.providerMode,
    backend: sourceEvidence.backend,
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: []
  };
}

export function writeCinematicAssetReadinessReport(report = createCinematicAssetReadinessReport(), reportPath = CINEMATIC_ASSET_READINESS_REPORT): void {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function sourcePathForAsset(id: string): string {
  if (id === "robot-expressive") return "fixtures/threejs-parity/assets/character/robot-expressive.glb";
  if (id === "procedural-neon-alley") return "fixtures/cinematic-assets/procedural/rainy-neon-alley.json";
  if (id === "glowing-flower") return "fixtures/cinematic-assets/procedural/glowing-flower.json";
  if (id === "renderer-rain-particles") return "fixtures/cinematic-assets/procedural/rainy-neon-alley.json";
  return id;
}

function failure(id: string, detail: string): CinematicFailure {
  return {
    id,
    severity: "blocked",
    detail,
    nextAction: "Add renderer-owned cinematic assets or VFX systems for the missing role."
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createCinematicAssetReadinessReport();
  writeCinematicAssetReadinessReport(report);
  if (!report.pass) {
    console.error(`Cinematic asset readiness failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Cinematic asset readiness passed. Report: ${CINEMATIC_ASSET_READINESS_REPORT}`);
  }
}
