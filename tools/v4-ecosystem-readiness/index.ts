import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

type Check = {
  readonly id: string;
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
};

type V4EcosystemReadinessReport = {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly boundedEcosystemDocsAccessibilityDeviceMatrix: boolean;
  readonly ecosystemSuperiority: false;
  readonly documentationCoverage: readonly Check[];
  readonly accessibilityCoverage: readonly Check[];
  readonly deviceMatrixCoverage: readonly Check[];
  readonly violations: readonly string[];
};

const reportPath = "tests/reports/v4-ecosystem-readiness.json";

const documentationFiles = [
  "docs/api/public-api.md",
  "docs/api/readme.md",
  "docs/project/tutorials-basic-app.md",
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-asset-viewer.md",
  "docs/project/tutorials-editor-app.md",
  "docs/examples/product-demos.md",
  "docs/examples/external-demos.md",
  "docs/project/compatibility.md",
  "docs/project/browser-hardware-matrix.md",
  "docs/project/site-map.md",
  "docs/project/claim-guidelines.md",
  "docs/project/known-limits.md",
] as const;

const accessibilityTargets = [
  { id: "product-configurator", path: "examples/product-configurator/main.ts", canvasId: "product-configurator-canvas", markers: ["aria-label", "aria-pressed", "tabindex"] },
  { id: "architecture-viewer", path: "examples/architecture-viewer/main.ts", canvasId: "architecture-viewer-canvas", markers: ["aria-label", "aria-pressed", "tabindex"] },
  { id: "game-slice", path: "examples/game-slice/main.ts", canvasId: "game-slice-canvas", markers: ["aria-label", "tabindex"] },
  { id: "asset-viewer", path: "examples/asset-viewer/main.ts", canvasId: "asset-viewer-canvas", markers: ["aria-label", "tabIndex"] },
  { id: "material-showroom", path: "examples/material-showroom/main.ts", canvasId: "material-showroom-canvas", markers: ["aria-label", "tabindex"] },
  { id: "shadow-lab", path: "examples/shadow-lab/main.ts", canvasId: "shadow-lab-render-canvas", markers: ["aria-label", "tabindex"] },
  { id: "postprocess-lab", path: "examples/postprocess-lab/main.ts", canvasId: "postprocess-lab-canvas", markers: ["aria-label", "tabindex"] },
  { id: "large-world-streaming", path: "examples/large-world-streaming/main.ts", canvasId: "large-world-canvas", markers: ["aria-label", "tabindex"] },
  { id: "racing-showcase", path: "examples/racing-showcase/main.ts", canvasId: "racing-showcase-canvas", markers: ["aria-label", "tabindex"] },
] as const;

const sourceFiles = [
  "tools/v4-ecosystem-readiness/index.ts",
  ...documentationFiles,
  ...accessibilityTargets.map((target) => target.path),
  "tests/reports/browser-hardware-matrix.json",
  "tests/reports/v4-current-capability.json",
  "tests/reports/v4-visual-quality.json",
] as const;

export function createV4EcosystemReadinessReport(root = process.cwd()): V4EcosystemReadinessReport {
  const currentCapability = readJson(root, "tests/reports/v4-current-capability.json");
  const visualQuality = readJson(root, "tests/reports/v4-visual-quality.json");
  const browserMatrix = readJson(root, "tests/reports/browser-hardware-matrix.json");

  const documentationCoverage = [
    check("docs-required-files-exist", documentationFiles.every((path) => existsSync(join(root, path))), documentationFiles, ["required API, tutorial, example, compatibility, claim, and known-limit docs must exist"]),
    check("api-docs-v4-public-exports", textIncludes(root, "docs/api/public-api.md", ["createV4RenderPresetEvidence", "createV4EnvironmentLighting", "sampleV4LdrPostprocessReadback"]), ["docs/api/public-api.md"], ["public API docs must list current V4 render preset and environment helpers"]),
    check("tutorials-link-running-browser-evidence", documentationFiles.filter((path) => path.startsWith("docs/project/tutorials-")).every((path) => textIncludes(root, path, ["pnpm"])), documentationFiles.filter((path) => path.startsWith("docs/project/tutorials-")), ["tutorial docs must include runnable verification or serve commands"]),
    check("compatibility-and-claim-boundary-docs", textIncludes(root, "docs/project/compatibility.md", ["Do not claim broad browser or device compatibility"]) && textIncludes(root, "docs/project/claim-guidelines.md", ["claim"]), ["docs/project/compatibility.md", "docs/project/claim-guidelines.md"], ["compatibility and claim-boundary docs must explicitly block broad unsupported wording"]),
  ] as const;

  const accessibilityCoverage = accessibilityTargets.map((target) => {
    const text = readText(root, target.path);
    const hasCanvas = text.includes(target.canvasId);
    const hasMarkers = target.markers.every((marker) => text.includes(marker));
    return check(
      `example-accessibility-${target.id}`,
      hasCanvas && hasMarkers,
      [target.path],
      [`${target.id} must expose a named/focusable canvas or equivalent labeled viewport/control state markers`]
    );
  });

  const browserRows = Array.isArray(browserMatrix?.browserRows) ? browserMatrix.browserRows.filter(isRecord) : [];
  const testedRows = browserRows.filter((row) => row.status === "tested");
  const deviceMatrixCoverage = [
    check("bounded-browser-hardware-matrix-present", browserMatrix?.ok === true && testedRows.length >= 1, ["tests/reports/browser-hardware-matrix.json", "docs/project/browser-hardware-matrix.md"], ["browser hardware matrix must include at least one tested browser row"]),
    check("browser-matrix-records-os-user-agent-and-gpu-status", testedRows.some((row) => isRecord(row.os) && typeof row.userAgent === "string" && isRecord(row.gpu) && typeof row.gpu.adapterStatus === "string" && typeof row.gpu.deviceStatus === "string"), ["tests/reports/browser-hardware-matrix.json"], ["tested browser rows must record OS, user agent, adapter status, and device status"]),
    check("v4-local-capability-and-visual-quality-reports-present", currentCapability?.ok === true && visualQuality?.ok === true, ["tests/reports/v4-current-capability.json", "tests/reports/v4-visual-quality.json"], ["current capability and visual quality reports must be present before ecosystem readiness is counted"]),
  ] as const;

  const allChecks = [...documentationCoverage, ...accessibilityCoverage, ...deviceMatrixCoverage];
  const violations = allChecks.flatMap((entry) => entry.passed ? [] : entry.blockers.map((blocker) => `${entry.id}: ${blocker}`));
  const boundedReady = violations.length === 0;

  return {
    ...baseReport(root, {
      ok: boundedReady,
      command: "pnpm audit:v4-ecosystem-readiness",
      runIdPrefix: "v4-ecosystem-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "broad better-than-Three.js language",
        "broad better-than-Babylon.js language",
        "production-ready language",
        "ecosystem superiority language",
      ],
    }),
    auditComplete: true,
    boundedEcosystemDocsAccessibilityDeviceMatrix: boundedReady,
    ecosystemSuperiority: false,
    documentationCoverage,
    accessibilityCoverage,
    deviceMatrixCoverage,
    violations,
  };
}

function check(id: string, passed: boolean, evidencePaths: readonly string[], blockers: readonly string[]): Check {
  return {
    id,
    passed,
    evidencePaths,
    blockers: passed ? [] : blockers,
  };
}

function readText(root: string, path: string): string {
  const fullPath = join(root, path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function textIncludes(root: string, path: string, markers: readonly string[]): boolean {
  const text = readText(root, path);
  return markers.every((marker) => text.includes(marker));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4EcosystemReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    boundedEcosystemDocsAccessibilityDeviceMatrix: report.boundedEcosystemDocsAccessibilityDeviceMatrix,
    ecosystemSuperiority: report.ecosystemSuperiority,
    violations: report.violations,
    report: reportPath,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
