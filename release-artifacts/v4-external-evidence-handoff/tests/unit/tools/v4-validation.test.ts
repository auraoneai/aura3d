import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { validateV4ClaimGates } from "../../../tools/v4-claim-gates/index.js";
import { createV4BroadParityReadinessReport } from "../../../tools/v4-broad-parity-readiness/index.js";
import { createV4ProductionReadinessReport, validatePublicDemoDeploymentSmokeEvidence } from "../../../tools/v4-production-readiness/index.js";
import { createV4PbrGltfReadinessReport } from "../../../tools/v4-pbr-gltf-readiness/index.js";
import { collectPbrVisualEvidencePaths } from "../../../tools/v4-pbr-visual-parity/index.js";
import { collectProductVisualEvidencePaths, validateExternalProductVisualBaseline } from "../../../tools/v4-product-visual-parity/index.js";
import { collectShadowVisualEvidencePaths } from "../../../tools/v4-shadow-visual-parity/index.js";
import { collectHdrVisualEvidencePaths } from "../../../tools/v4-hdr-visual-parity/index.js";
import { collectPostprocessSuiteEvidencePaths } from "../../../tools/v4-postprocess-suite/index.js";
import { createStaticDemoServerSmokeReport } from "../../../tools/static-demo-server-smoke/index.js";
import { createPublicDemoDeploymentSmokeReport } from "../../../tools/public-demo-deployment-smoke/index.js";
import { ingestPublicDemoDeploymentReportArtifacts } from "../../../tools/public-demo-deployment-artifacts/index.js";
import { createV4UnityUnrealParityReport } from "../../../tools/v4-unity-unreal-parity/index.js";
import { createV4ExternalEngineBaselineKit } from "../../../tools/v4-external-engine-baselines/index.js";
import { createV4ExternalEvidenceReadinessReport } from "../../../tools/v4-external-evidence-readiness/index.js";
import { createV4CompletionAuditReport } from "../../../tools/v4-completion-audit/index.js";
import { createV4ParityStatusSummary } from "../../../tools/v4-parity-status/index.js";
import { createV4LocalPortStatusSummary } from "../../../tools/v4-local-port-status/index.js";
import { createV4ExternalHostDoctorReport } from "../../../tools/v4-external-host-doctor/index.js";
import { createV4ExternalHostRunnerReport } from "../../../tools/v4-external-host-runner/index.js";
import { createV4GithubExternalReadinessReport, type CommandResult, type CommandRunner } from "../../../tools/v4-github-external-readiness/index.js";
import { createV4ExternalEvidenceHandoffReport, verifyAndRecordV4ExternalEvidenceHandoffPackage, verifyV4ExternalEvidenceHandoffPackage } from "../../../tools/v4-external-evidence-handoff/index.js";
import { createV4HdrRenderTargetReadinessReport } from "../../../tools/v4-hdr-render-target-readiness/index.js";
import { createV4PbrReferenceReadinessReport } from "../../../tools/v4-pbr-reference-readiness/index.js";
import { createV4ShadowMapReadinessReport } from "../../../tools/v4-shadow-map-readiness/index.js";
import { baseReport } from "../../../tools/v4-reporting/index.js";
import { validateV4ReportFreshness } from "../../../tools/v4-reporting/index.js";
import { validateVisualGateEntry } from "../../../tools/v4-visual-quality/index.js";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "g3d-v4-validation-"));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function expectNodeCommandFailure(root: string, args: readonly string[], message: RegExp): void {
  const result = spawnSync(process.execPath, [...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  expect(result.status).not.toBe(0);
  expect(`${result.stderr}\n${result.stdout}`).toMatch(message);
}

const publicDemoIds = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;

const publicDemoCanvasMarkers: Record<(typeof publicDemoIds)[number], string> = {
  "product-configurator": "product-configurator-canvas",
  "architecture-viewer": "architecture-viewer-canvas",
  "game-slice": "game-slice-canvas",
  "racing-showcase": "racing-showcase-canvas",
  "large-world-streaming": "large-world-canvas",
};

function writeRunnerEvidenceSidecar(root: string, screenshotPath: string, evidence: {
  readonly engine: "unity" | "unreal";
  readonly baselineKind: string;
  readonly sceneDescriptorId: string;
  readonly sceneDescriptorVersion: string;
  readonly metrics: Record<string, number>;
}): void {
  writeFileSync(join(root, `${screenshotPath}.evidence.json`), JSON.stringify({
    ok: true,
    engine: evidence.engine,
    baselineKind: evidence.baselineKind,
    sceneDescriptorId: evidence.sceneDescriptorId,
    sceneDescriptorVersion: evidence.sceneDescriptorVersion,
    screenshotPath,
    renderedFrameCaptured: true,
    cameraConfigured: true,
    metrics: evidence.metrics
  }, null, 2));
}

function writePublicDeploymentFixture(root: string): string {
  const outputDir = "release-artifacts/external-demos/0.1.0-alpha.0";
  const publicDeploymentManifestPath = `${outputDir}/public-deployment-manifest.json`;
  mkdirSync(join(root, outputDir), { recursive: true });
  mkdirSync(join(root, "tests", "reports"), { recursive: true });
  mkdirSync(join(root, "examples", "product-configurator"), { recursive: true });
  const sourcePath = "examples/product-configurator/main.ts";
  const sourceBody = "export const productConfiguratorDemo = true;\n";
  writeFileSync(join(root, sourcePath), sourceBody);
  const sourceFileHashes = [{
    path: sourcePath,
    sha256: createHash("sha256").update(sourceBody).digest("hex")
  }];
  const files = [
    ["index", "index.html", "index.html", 100, publicDemoIds.map((id) => `./${id}/`)],
    ...publicDemoIds.flatMap((id) => [
      [`${id}:html`, `${id}/index.html`, `${id}/index.html`, 100, ["Galileo3D"]],
      [`${id}:script`, `${id}/main.js`, `${id}/main.js`, 10_000, [publicDemoCanvasMarkers[id]]],
    ]),
  ] as const;
  const manifestFiles = files.map(([, localPath]) => {
    const path = `${outputDir}/${localPath}`;
    const body = `Galileo3D ${localPath} ${publicDemoIds.map((id) => `./${id}/`).join(" ")} ${Object.values(publicDemoCanvasMarkers).join(" ")} ${"x".repeat(10_100)}`;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
    return { path, sha256: createHash("sha256").update(body).digest("hex") };
  });
  writeFileSync(join(root, `${outputDir}/static-integrity-manifest.json`), JSON.stringify({
    schemaVersion: "g3d-static-demo-integrity-v1",
    files: manifestFiles,
    sourceFileHashes
  }, null, 2));
  writeFileSync(join(root, publicDeploymentManifestPath), JSON.stringify({
    schemaVersion: "g3d-public-demo-deployment-v1",
    files: files.map(([id, localPath, publicPath, minBytes, contentMarkers], index) => ({
      id,
      localPath: `${outputDir}/${localPath}`,
      publicPath,
      sha256: manifestFiles[index]?.sha256,
      minBytes,
      contentMarkers,
    })),
    sourceFileHashes
  }, null, 2));
  writeFileSync(join(root, "tests", "reports", "external-demo-static-export.json"), JSON.stringify({
    ok: true,
    outputDir,
    integrityManifestPath: `${outputDir}/static-integrity-manifest.json`,
    publicDeploymentManifestPath,
    deploymentCommandPlanPath: `${outputDir}/deployment-command-plan.json`,
    rollbackPlanPath: "docs/project/deployment-rollback.md",
    demos: publicDemoIds.map((id) => ({ id })),
    sourceFileHashes,
  }, null, 2));
  writeFileSync(join(root, `${outputDir}/deployment-command-plan.json`), JSON.stringify({ ok: true }, null, 2));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "deployment-rollback.md"), "# Rollback\n");
  return publicDeploymentManifestPath;
}

function writePublicDeploymentSmokeFixture(root: string, deploymentUrl = "https://demo.galileo3d.com/"): void {
  const staticExport = JSON.parse(readFileSync(join(root, "tests", "reports", "external-demo-static-export.json"), "utf8")) as {
    integrityManifestPath: string;
    publicDeploymentManifestPath: string;
  };
  const publicDeploymentManifest = JSON.parse(readFileSync(join(root, staticExport.publicDeploymentManifestPath), "utf8")) as {
    files: {
      id: string;
      localPath: string;
      publicPath: string;
      minBytes: number;
      contentMarkers: string[];
    }[];
  };
  const checks = publicDeploymentManifest.files.map((file) => {
    const bytes = readFileSync(join(root, file.localPath));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      id: file.id,
      url: new URL(file.publicPath, deploymentUrl).toString(),
      status: 200,
      bytes: bytes.byteLength,
      sha256,
      matchedStaticIntegrity: true,
      contentOk: true,
      contentMarkers: file.contentMarkers
    };
  });
  writeFileSync(join(root, "tests", "reports", "public-demo-deployment-smoke.json"), JSON.stringify({
    ok: true,
    command: "pnpm verify:public-demo-deployment",
    deploymentUrl,
    sourceManifestPath: staticExport.integrityManifestPath,
    publicDeploymentManifestPath: staticExport.publicDeploymentManifestPath,
    requiredDemos: publicDemoIds,
    checks,
    violations: []
  }, null, 2));
}

function writePublicDemoWorkflowFixture(root: string, source?: string): void {
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "v4-public-demo-deploy.yml"), source ?? `
name: V4 Public Demo Deploy
on:
  workflow_dispatch:
permissions:
  pages: write
  id-token: write
jobs:
  build:
    steps:
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
      - run: pnpm build:external-demos
      - run: pnpm verify:static-demo-server-smoke
  deploy:
    environment:
      name: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
      - run: pnpm verify:public-demo-deployment
        env:
          G3D_PUBLIC_DEMO_URL: \${{ steps.deployment.outputs.page_url }}
      - run: pnpm audit:v4-production-readiness
      - run: pnpm audit:v4-external-evidence-readiness
      - run: pnpm audit:v4-broad-parity || true
      - run: pnpm audit:v4-completion || true
      - run: pnpm verify:v4-report-freshness
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          path: |
            tests/reports/public-demo-deployment-smoke.json
            tests/reports/public-demo-deployment-runbook.md
            tests/reports/v4-production-readiness.json
            tests/reports/v4-external-evidence-readiness.json
            tests/reports/v4-external-evidence-missing-artifacts.md
            tests/reports/v4-broad-parity-readiness.json
            tests/reports/v4-completion-audit.json
            tests/reports/v4-completion-audit-runbook.md
            tests/reports/v4-report-freshness.json
`);
}

function writeStaticDemoServerSmokeFixture(root: string): void {
  mkdirSync(join(root, "tests", "reports"), { recursive: true });
  writeFileSync(join(root, "tests", "reports", "static-demo-server-smoke.json"), JSON.stringify({ ok: true }, null, 2));
}

describe("v4 validation tools", () => {
  it("blocks unscoped v4 competitor and production claims while allowing scoped blocked language", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "examples", "bad"), { recursive: true });
    mkdirSync(join(root, "docs", "v4"), { recursive: true });
    writeFileSync(join(root, "examples", "bad", "README.md"), "Galileo3D is better than Three.js.\n");
    writeFileSync(join(root, "docs", "v4", "decision-gates.md"), "Still disallowed: production-ready claims remain blocked.\n");

    const report = validateV4ClaimGates(root);

    expect(report.ok).toBe(false);
    expect(report.blockedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "examples/bad/README.md", claim: "broad better-than-Three.js language" }),
    ]));
    expect(report.scopedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "docs/project/v4-decision-gates.md", claim: "production-ready language", scoped: true }),
    ]));
  });

  it("detects stale v4 reports by source hash", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "v4"), { recursive: true });
    writeFileSync(join(root, "docs", "v4", "README.md"), "before\n");
    const report = baseReport(root, {
      ok: true,
      command: "test",
      runIdPrefix: "test",
      sourceFiles: ["docs/project/v4-readme.md"],
    });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-current-capability.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(root, "docs", "v4", "README.md"), "after\n");

    const issues = validateV4ReportFreshness(root, ["tests/reports/v4-current-capability.json"]);

    expect(issues).toEqual([
      expect.objectContaining({ path: "tests/reports/v4-current-capability.json", message: expect.stringContaining("Freshness source changed") }),
    ]);
  });

  it("rejects known-bad v4 visual manifest entries before manual review can override them", () => {
    const screenshot = {
      id: "game-slice",
      path: "tests/reports/v4-example-screenshots/game-slice.png",
      minNonBlankPixels: 12_000,
      minColorBuckets: 6,
      minOccupiedAreaRatio: 0.18,
      minOccupiedQuadrants: 3
    };
    const good = {
      screenshotPath: screenshot.path,
      visualClaim: "Current textured game scene",
      claimBoundary: "Bounded runtime example with screenshot evidence.",
      featureEvidence: {
        levelAssetLoaded: true,
        playerAssetLoaded: true,
        proceduralTextureFixturesApplied: true,
        screenshotEvidencePath: screenshot.path
      },
      pixelStats: { nonBlankPixels: 18_000, colorBuckets: 12, occupiedAreaRatio: 0.72, occupiedQuadrants: 4 }
    };

    expect(validateVisualGateEntry(good, screenshot).passed).toBe(true);
    expect(validateVisualGateEntry({ ...good, pixelStats: { nonBlankPixels: 20, colorBuckets: 1, occupiedAreaRatio: 0.72, occupiedQuadrants: 4 } }, screenshot)).toMatchObject({ passed: false, darkOrFlat: true });
    expect(validateVisualGateEntry({ ...good, pixelStats: { nonBlankPixels: 18_000, colorBuckets: 12, occupiedAreaRatio: 0.04, occupiedQuadrants: 1 } }, screenshot)).toMatchObject({ passed: false, spatiallyWeak: true });
    expect(validateVisualGateEntry({ ...good, screenshotPath: "tests/reports/v4-example-screenshots/old.png" }, screenshot)).toMatchObject({ passed: false, stale: true });
    expect(validateVisualGateEntry({ ...good, visualClaim: "debug placeholder wireframe", featureEvidence: { screenshotEvidencePath: "missing.png" } }, screenshot)).toMatchObject({ passed: false, debugDominated: true });
    expect(validateVisualGateEntry({ ...good, featureEvidence: {}, visualClaim: "primitive cube scene" }, screenshot)).toMatchObject({ passed: false, primitiveOnly: true });
  });

  it("keeps broad parity claims blocked until explicit claim-specific evidence exists", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-current-capability.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-rendering.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-corpus.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-engine-comparison.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-comparison-threejs.json"), JSON.stringify({
      ok: true,
      claimUsable: false,
      unsupportedByThisReport: ["broad better-than-Three.js claims"]
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-comparison-babylon.json"), JSON.stringify({
      ok: true,
      claimUsable: false,
      unsupportedByThisReport: ["broad better-than-Babylon.js claims"]
    }, null, 2));

    const report = createV4BroadParityReadinessReport(root);

    expect(report.ok).toBe(false);
    expect(report.claimReady).toBe(false);
    expect(report.summary).toMatchObject({ totalClaims: 13, readyClaims: 0, blockedClaims: 13 });
    expect(report.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "threejs-broad-superiority",
        ready: false,
        blockers: expect.arrayContaining([
          "comparison report sets claimUsable=false",
          "comparison report still lists unsupported marker: broad better-than-Three.js claims"
        ])
      }),
      expect.objectContaining({
        id: "unity-unreal-replacement",
        ready: false,
        blockers: expect.arrayContaining(["Unity/Unreal parity report is missing or failing"])
      }),
      expect.objectContaining({
        id: "rendered-product-visual-parity",
        ready: false,
        blockers: expect.arrayContaining(["missing renderedProductVisualParity.unity=true"])
      })
    ]));
  });

  it("breaks full glTF parity into explicit remaining evidence dimensions", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    const validationAssets = Array.from({ length: 8 }, (_, index) => ({
      asset: { id: `fixture-${index}`, visualDiffRequired: true },
      ok: true,
      boundedGltfLoaderVisualParity: { threejs: true, babylon: true },
    }));
    const renders = validationAssets.flatMap((validation) => [
      { assetId: validation.asset.id, engine: "galileo3d", metrics: { meshCount: 1, materialCount: 1, vertexCount: 3, drawCalls: 1, nonBlankPixels: 6000 } },
      { assetId: validation.asset.id, engine: "threejs", metrics: { meshCount: 1, materialCount: 1, vertexCount: 3, drawCalls: 1, nonBlankPixels: 6000 } },
      { assetId: validation.asset.id, engine: "babylon", metrics: { meshCount: 1, materialCount: 1, vertexCount: 3, drawCalls: 1, nonBlankPixels: 6000 } },
    ]);
    writeFileSync(join(root, "tests", "reports", "v4-rendering.json"), JSON.stringify({ ok: true, validations: [] }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-corpus.json"), JSON.stringify({
      ok: true,
      assetCount: 8,
      assets: Array.from({ length: 8 }, (_, index) => ({
        id: `fixture-${index}`,
        features: index === 0 ? ["skin", "animated-morph-weights", "root-motion-diagnostic"] : [],
        materialFeatures: [],
        unsupportedFeatures: [],
        loaderDiagnostics: { extensionsUsed: ["KHR_materials_unlit"], unsupportedExtensions: [] },
      })),
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-compression.json"), JSON.stringify({ ok: true, validations: [] }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-material-fidelity.json"), JSON.stringify({ ok: true, validations: [] }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-khronos-gltf-visuals.json"), JSON.stringify({
      ok: true,
      sourceAssetCount: 17,
      visualAssetCount: 17,
      fullPinnedCorpusVisualParity: true,
      validations: [],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "gltf-100-classification.json"), JSON.stringify({
      sourceManifest: { assetCount: 100 },
      summary: { pass: 38, warn: 62, expectedFail: 0 },
      assets: Array.from({ length: 100 }, (_, index) => ({
        id: index === 0 ? "fixture-0" : `khronos-${index}`,
        expectedStatus: index === 0 ? "warn" : "pass",
      })),
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "asset-compatibility-threejs.json"), JSON.stringify({
      assets: [
        { id: "multi-uv-test", loaders: [{ loader: "galileo3d", status: "expected-fail" }] },
        { id: "meshopt-cube-test", loaders: [{ loader: "galileo3d", status: "expected-fail" }] },
      ],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-engine-comparison.json"), JSON.stringify({
      ok: true,
      unsupportedByThisReport: ["full-corpus and extension visual pixel parity for external Three.js/Babylon.js glTF loader output"],
      gltfCompatibility: {
        summary: {
          assetCount: 17,
          galileo3d: { pass: 11, warn: 4, "expected-fail": 2, "not-run": 0 },
          threejs: { pass: 4, warn: 13, "expected-fail": 0, "not-run": 0 },
          babylonjs: { pass: 13, warn: 4, "expected-fail": 0, "not-run": 0 },
          blenderExport: { pass: 0, warn: 0, "expected-fail": 0, "not-run": 17 },
        },
        blenderExportValidation: { summary: { fixtureCount: 3, pass: 3, warn: 0, fail: 0 } },
      },
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-visual-parity.json"), JSON.stringify({ ok: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-reference-readiness.json"), JSON.stringify({ ok: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-gltf-loader-visual-parity.json"), JSON.stringify({
      ok: true,
      boundedGltfLoaderVisualParity: { threejs: true, babylon: true },
      validations: validationAssets,
      renders,
      diffs: validationAssets.flatMap((validation) => [
        { assetId: validation.asset.id, engine: "threejs", pass: true },
        { assetId: validation.asset.id, engine: "babylon", pass: true },
      ]),
      violations: ["claim: this report covers selected deterministic local glTF fixtures, not full glTF corpus visual parity."],
    }, null, 2));

    const report = createV4PbrGltfReadinessReport(root);
    const dimensionById = new Map(report.gltfParityDimensions.map((dimension) => [dimension.id, dimension]));

    expect(report.gltfParity).toBe(false);
    expect(dimensionById.get("bounded-three-babylon-loader-visual-fixtures")).toMatchObject({ ready: true });
    expect(dimensionById.get("full-external-loader-visual-corpus-parity")).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        "v4-gltf-loader-visual-parity does not set fullGltfLoaderVisualParity=true.",
        "v4-engine-comparison still blocks full-corpus external Three.js/Babylon glTF visual parity.",
      ]),
    });
    expect(dimensionById.get("khronos-100-production-classification")).toMatchObject({
      ready: false,
      metrics: expect.objectContaining({ warn: 61, rawWarn: 62, visualValidatedWarnings: 1 }),
    });
    expect(dimensionById.get("same-corpus-loader-compatibility")).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(["Galileo3D has 2 unrecovered expected-fail compatibility entries: multi-uv-test, meshopt-cube-test."]),
    });
    expect(dimensionById.get("blender-export-same-corpus-coverage")).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(["same-corpus Blender-export coverage is incomplete (17 not-run, 0 expected-fail entries)."]),
    });
    expect(report.gltfBlockers).toEqual(expect.arrayContaining([
      expect.stringContaining("full-external-loader-visual-corpus-parity:"),
      expect.stringContaining("khronos-100-production-classification: 61 Khronos 100 entries"),
      expect.stringContaining("same-corpus-loader-compatibility: Galileo3D has 2 unrecovered expected-fail"),
      expect.stringContaining("blender-export-same-corpus-coverage: same-corpus Blender-export coverage is incomplete"),
    ]));
  });

  it("does not require impossible benchmark wins on intentionally equivalent scene dimensions", () => {
    const three = JSON.parse(readFileSync(join(process.cwd(), "tests", "reports", "v4-comparison-threejs.json"), "utf8"));
    const babylon = JSON.parse(readFileSync(join(process.cwd(), "tests", "reports", "v4-comparison-babylon.json"), "utf8"));
    for (const report of [three, babylon]) {
      const blockers = String(report.broadSuperiority?.blockers?.join("\n") ?? "");
      expect(report.claimUsable).toBe(false);
      expect(blockers).not.toContain("benchmark win count is not broad enough");
      expect(blockers).toContain("broad-superiority evidence matrix is incomplete");
      for (const outcome of Object.values(report.comparisonOutcomes?.byCompetitor ?? {}) as Array<{ summary?: { losses?: number; unavailable?: number }; scenes?: Array<Record<string, { result?: string }>> }>) {
        expect(outcome.summary?.losses ?? 0).toBe(0);
        expect(outcome.summary?.unavailable ?? 0).toBe(0);
        expect(outcome.scenes?.every((scene) => Object.values(scene).some((metric) => metric?.result === "win"))).toBe(true);
      }
    }
  });

  it("collects product visual render and diff artifacts into screenshot evidence paths", () => {
    const paths = collectProductVisualEvidencePaths({
      renders: [
        {
          engine: "galileo",
          screenshotPath: "tests/reports/v4-product-visual-parity/galileo-product.png",
          bundleBytes: 1,
          metrics: {
            width: 720,
            height: 480,
            nonBlankPixels: 1,
            colorBuckets: 1,
            drawCalls: 1,
            materialCount: 1,
            productParts: 1,
            turntableHotspots: 1,
            captureViews: 1,
            batchTasks: 1,
          },
        },
        {
          engine: "threejs",
          screenshotPath: "tests/reports/v4-product-visual-parity/threejs-product.png",
          bundleBytes: 1,
          metrics: {
            width: 720,
            height: 480,
            nonBlankPixels: 1,
            colorBuckets: 1,
            drawCalls: 1,
            materialCount: 1,
            productParts: 1,
            turntableHotspots: 1,
            captureViews: 1,
            batchTasks: 1,
          },
        },
      ],
      diffs: [{
        baselineEngine: "galileo",
        comparedEngine: "threejs",
        baselinePath: "tests/reports/v4-product-visual-parity/galileo-product.png",
        comparedPath: "tests/reports/v4-product-visual-parity/threejs-product.png",
        diffPath: "tests/reports/v4-product-visual-parity/threejs-product-diff.png",
        width: 720,
        height: 480,
        comparedPixels: 345_600,
        changedPixels: 10,
        changedPixelRatio: 0.001,
        meanAbsoluteError: 0.1,
        maxChannelDelta: 2,
        pass: true,
        thresholds: {
          maxChangedPixelRatio: 0.15,
          maxMeanAbsoluteError: 8,
        },
      }],
      externalBaselines: {
        unity: {
          engine: "unity",
          reportPath: "tests/reports/v4-unity-product-visual-baseline.json",
          ok: true,
          present: true,
          requiredSceneDescriptorId: "v4-deterministic-product-visual-parity",
          requiredSceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
          screenshot: {
            ok: true,
            path: "tests/reports/v4-product-visual-parity/unity-product.png",
          },
          runnerEvidence: {
            ok: true,
            violations: [],
          },
          diffAgainstGalileo: {
            baselineEngine: "galileo",
            comparedEngine: "unity",
            baselinePath: "tests/reports/v4-product-visual-parity/galileo-product.png",
            comparedPath: "tests/reports/v4-product-visual-parity/unity-product.png",
            width: 720,
            height: 480,
            comparedPixels: 345_600,
            changedPixels: 10,
            changedPixelRatio: 0.001,
            meanAbsoluteError: 0.1,
            maxChannelDelta: 2,
            pass: true,
            thresholds: {
              maxChangedPixelRatio: 0.15,
              maxMeanAbsoluteError: 8,
            },
          },
          violations: [],
        },
        unreal: {
          engine: "unreal",
          reportPath: "tests/reports/v4-unreal-product-visual-baseline.json",
          ok: false,
          present: false,
          requiredSceneDescriptorId: "v4-deterministic-product-visual-parity",
          requiredSceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
          screenshot: {
            ok: false,
            reason: "baseline report missing",
          },
          runnerEvidence: {
            ok: false,
            violations: ["baseline report missing"],
          },
          violations: ["baseline report missing"],
        },
      },
    });

    expect(paths).toEqual([
      "tests/reports/v4-product-visual-parity/galileo-product.png",
      "tests/reports/v4-product-visual-parity/threejs-product.png",
      "tests/reports/v4-product-visual-parity/threejs-product-diff.png",
      "tests/reports/v4-product-visual-parity/unity-product.png",
    ]);
  });

  it("collects PBR, shadow, and HDR visual render and diff artifacts into screenshot evidence paths", () => {
    const pbrPaths = collectPbrVisualEvidencePaths({
      renders: [
        { screenshotPath: "tests/reports/v4-pbr-visual-parity/galileo-pbr.png" },
        { screenshotPath: "tests/reports/v4-pbr-visual-parity/threejs-pbr.png" },
      ],
      diffs: [{
        baselinePath: "tests/reports/v4-pbr-visual-parity/galileo-pbr.png",
        comparedPath: "tests/reports/v4-pbr-visual-parity/threejs-pbr.png",
        diffPath: "tests/reports/v4-pbr-visual-parity/threejs-pbr-diff.png",
      }],
    } as never);
    const shadowPaths = collectShadowVisualEvidencePaths({
      renders: [
        { screenshotPath: "tests/reports/v4-shadow-visual-parity/galileo-shadow.png" },
        { screenshotPath: "tests/reports/v4-shadow-visual-parity/babylon-shadow.png" },
      ],
      diffs: [{
        baselinePath: "tests/reports/v4-shadow-visual-parity/galileo-shadow.png",
        comparedPath: "tests/reports/v4-shadow-visual-parity/babylon-shadow.png",
        diffPath: "tests/reports/v4-shadow-visual-parity/babylon-shadow-diff.png",
      }],
    } as never);
    const hdrPaths = collectHdrVisualEvidencePaths({
      renders: [
        { screenshotPath: "tests/reports/v4-hdr-visual-parity/galileo-hdr.png" },
        { screenshotPath: "tests/reports/v4-hdr-visual-parity/threejs-hdr.png" },
      ],
      diffs: [{
        baselinePath: "tests/reports/v4-hdr-visual-parity/galileo-hdr.png",
        comparedPath: "tests/reports/v4-hdr-visual-parity/threejs-hdr.png",
        diffPath: "tests/reports/v4-hdr-visual-parity/threejs-hdr-diff.png",
      }],
    } as never);

    expect(pbrPaths).toEqual([
      "tests/reports/v4-pbr-visual-parity/galileo-pbr.png",
      "tests/reports/v4-pbr-visual-parity/threejs-pbr.png",
      "tests/reports/v4-pbr-visual-parity/threejs-pbr-diff.png",
    ]);
    expect(shadowPaths).toEqual([
      "tests/reports/v4-shadow-visual-parity/galileo-shadow.png",
      "tests/reports/v4-shadow-visual-parity/babylon-shadow.png",
      "tests/reports/v4-shadow-visual-parity/babylon-shadow-diff.png",
    ]);
    expect(hdrPaths).toEqual([
      "tests/reports/v4-hdr-visual-parity/galileo-hdr.png",
      "tests/reports/v4-hdr-visual-parity/threejs-hdr.png",
      "tests/reports/v4-hdr-visual-parity/threejs-hdr-diff.png",
    ]);
  });

  it("collects postprocess suite lab and same-scene comparison artifacts into screenshot evidence paths", () => {
    const paths = collectPostprocessSuiteEvidencePaths({
      rendering: {
        screenshotPaths: [
          "tests/reports/v4-example-screenshots/postprocess-lab.png",
          "tests/reports/v4-example-screenshots/shadow-lab.png",
        ],
        validations: [
          {
            name: "postprocess-lab-runtime-color-management-controls",
            screenshotPath: "tests/reports/v4-example-screenshots/postprocess-lab-color-controls.png",
          },
          {
            name: "shadow-lab-pcf",
            screenshotPath: "tests/reports/v4-example-screenshots/shadow-lab.png",
          },
        ],
      },
      comparison: {
        screenshotDiffs: [{
          sceneId: "postprocess",
          baselinePath: "tests/reports/comparison-rendered-screenshots/galileo-postprocess.png",
          comparedPath: "tests/reports/comparison-rendered-screenshots/threejs-postprocess.png",
          diffPath: "tests/reports/comparison-diffs/threejs-postprocess.png",
        }],
        artifacts: {
          renderedBenchmarkVisuals: {
            paths: [
              "tests/reports/comparison-rendered-screenshots/galileo-postprocess.png",
              "tests/reports/comparison-rendered-screenshots/galileo-product-configurator.png",
            ],
          },
          screenshotDiffs: {
            paths: [
              "tests/reports/comparison-diffs/threejs-postprocess.png",
              "tests/reports/comparison-diffs/threejs-product-configurator.png",
            ],
          },
        },
      },
      hdrBrowser: {
        screenshotPaths: ["tests/reports/v4-hdr-render-target-postprocess.png"],
      },
    });

    expect(paths).toEqual([
      "tests/reports/v4-example-screenshots/postprocess-lab.png",
      "tests/reports/v4-example-screenshots/postprocess-lab-color-controls.png",
      "tests/reports/comparison-rendered-screenshots/galileo-postprocess.png",
      "tests/reports/comparison-rendered-screenshots/threejs-postprocess.png",
      "tests/reports/comparison-diffs/threejs-postprocess.png",
      "tests/reports/v4-hdr-render-target-postprocess.png",
    ]);
  });

  it("records audited blockers for production and Unity/Unreal parity without marking them ready", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-current-capability.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-rendering.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-corpus.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-engine-comparison.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-visual-quality.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-broad-parity-readiness.json"), JSON.stringify({ claimReady: false, summary: { blockedClaims: 13 } }, null, 2));

    const production = createV4ProductionReadinessReport(root);
    const unityUnreal = createV4UnityUnrealParityReport(root);

    expect(production).toMatchObject({
      ok: true,
      auditComplete: true,
      productionReady: false,
    });
    expect(production.releaseAreas.some((area) => !area.ready)).toBe(true);
    expect(production.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("No clean external install/import smoke reproduction"),
      expect.stringContaining("No durable public deployment URL validation"),
    ]));
    expect(unityUnreal).toMatchObject({
      ok: true,
      auditComplete: true,
      unityParity: false,
      unrealParity: false,
      replacement: false,
    });
    expect(unityUnreal.editorEvidence).toMatchObject({
      editorReportOk: false,
      prefabReportOk: false,
      passedCheckCount: 0,
      authoredWorkflowSignals: [],
      importedAssetCount: 0,
      exportedStaticApp: false,
      staticExportWithoutEditorCode: false,
      prefabNodeCount: 0,
      prefabExportedNodeCount: 0,
      timelineTrackCount: 0,
      timelineClipCount: 0,
      visualScriptingNodeCount: 0,
      gpuPickingEvidence: false,
      localizationLocaleCount: 0,
      accessibilityAaContrastPasses: false,
    });
    expect(unityUnreal.renderingEvidence).toMatchObject({
      renderingReportOk: true,
      renderingValidationCount: 0,
      renderingScreenshotCount: 0,
      productVisualReportOk: false,
      productVisualThreeJs: false,
      productVisualBabylon: false,
      productVisualUnity: false,
      productVisualUnreal: false,
      boundedPbrVisualParity: false,
      boundedShadowVisualParity: false,
      boundedHdrRenderTargetParity: false,
      postprocessRealSceneValidation: false,
      forwardShadowSamplingValidation: false,
    });
    expect(unityUnreal.workflowAreas).toHaveLength(5);
    const assetImportArea = unityUnreal.workflowAreas.find((area) => area.id === "asset-import");
    expect(unityUnreal.assetImportPreflight).toMatchObject({
      source: "origin-master-asset-importer-adapted",
      currentPipeline: "gltf-first",
      supportedFormats: ["glb", "gltf", "obj"],
      conversionRequiredFormats: ["dae", "fbx", "usd", "usdz"],
      blockedFormats: ["unknown"],
      diagnosticCodes: expect.arrayContaining([
        "ASSET_IMPORT_OBJ_NATIVE_BOUNDED",
        "ASSET_IMPORT_GLTF_SUPPORTED",
        "ASSET_IMPORT_EXTERNAL_CONVERSION_REQUIRED",
        "ASSET_IMPORT_FORMAT_BLOCKED",
      ]),
    });
    expect(assetImportArea?.currentEvidence).toContain("bounded import preflight evidence");
    expect(assetImportArea?.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("Native FBX/USD/USDZ/DAE import is not implemented"),
      expect.stringContaining("Unity asset-import workflow"),
      expect.stringContaining("Unreal asset-import workflow"),
    ]));
    expect(unityUnreal.violations.join("\n")).not.toContain("No FBX/USD/Unity package/Unreal asset import workflow is compared");
    expect(unityUnreal.deploymentEvidence).toMatchObject({
      staticExportOk: false,
      staticDemoServerSmokeOk: false,
      publicDeploymentSmokeOk: false,
      publicDeploymentRunbookPath: "tests/reports/public-demo-deployment-runbook.md",
      githubPagesWorkflowPath: ".github/workflows/v4-public-demo-deploy.yml",
    });
    expect(unityUnreal.runtimeEvidence).toMatchObject({
      runtimeReportOk: false,
      completedRuntimeTaskCount: 0,
      gameSliceDrawCalls: 0,
      gameSliceFeatureEvidenceCount: 0,
      gameSliceNonBlankPixels: 0,
      mobileTouchEvidence: false,
      blockedTaskCount: 0,
    });
    expect(unityUnreal.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("unity editor executable not found"),
      expect.stringContaining("tests/reports/v4-unity-baseline-render.json is missing"),
      expect.stringContaining("No Unity/Unreal rendered output"),
      expect.stringContaining("tests/reports/v4-unreal-baseline-render.json is missing"),
    ]));
  });

  it("credits local deployment packaging without clearing Unity/Unreal deployment parity", () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writeStaticDemoServerSmokeFixture(root);
    writePublicDeploymentSmokeFixture(root, "https://demo.galileo3d.com/");
    writePublicDemoWorkflowFixture(root);

    const report = createV4UnityUnrealParityReport(root);
    const deploymentArea = report.workflowAreas.find((area) => area.id === "deployment");

    expect(report.deploymentEvidence).toMatchObject({
      staticExportOk: true,
      staticDemoServerSmokeOk: true,
      publicDeploymentSmokeOk: true,
      publicDeploymentUrl: "https://demo.galileo3d.com/",
      staticExportOutputDir: "release-artifacts/external-demos/0.1.0-alpha.0",
    });
    expect(deploymentArea?.currentEvidence).toContain("Local static demo export exists");
    expect(deploymentArea?.blockers.join("\n")).not.toContain("Durable public HTTPS demo deployment validation");
    expect(deploymentArea?.blockers).toEqual(expect.arrayContaining([
      "No native/mobile/console/WebGL Unity or Unreal deployment comparison is executed.",
      "Production support, crash diagnostics, platform packaging, and release-operation parity remain unproven.",
    ]));
    expect(report.replacement).toBe(false);
  });

  it("summarizes browser runtime evidence without clearing native Unity/Unreal runtime parity", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-runtime.json"), JSON.stringify({
      ok: true,
      completedTasks: [{ task: "runtime orchestration" }, { task: "old branch physics" }],
      blockedTasks: ["generated local assets only"],
      mobileTouch: {
        assetViewer: { status: "ready" },
        editor: { status: "ready" },
        game: { status: "ready" },
      },
      gameSlice: {
        state: {
          status: "ready",
          diagnostics: { drawCalls: 44 },
          featureEvidence: {
            oldBranchAdaptiveDifficultyPort: true,
            oldBranchCloudServicesPort: true,
            physicsController: true,
          },
        },
        pixels: { nonBlankPixels: 57_600 },
      },
    }, null, 2));

    const report = createV4UnityUnrealParityReport(root);
    const runtimeArea = report.workflowAreas.find((area) => area.id === "runtime-systems");

    expect(report.runtimeEvidence).toMatchObject({
      runtimeReportOk: true,
      completedRuntimeTaskCount: 2,
      gameSliceStatus: "ready",
      gameSliceDrawCalls: 44,
      gameSliceFeatureEvidenceCount: 3,
      gameSliceNonBlankPixels: 57_600,
      mobileTouchEvidence: true,
      blockedTaskCount: 1,
      oldBranchRuntimePortEvidence: ["oldBranchAdaptiveDifficultyPort", "oldBranchCloudServicesPort"],
    });
    expect(runtimeArea?.currentEvidence).toContain("V4 runtime report passes with 2 completed runtime tasks");
    expect(runtimeArea?.blockers).toEqual(expect.arrayContaining([
      "No Unity/Unreal runtime project with the same gameplay systems is built and measured.",
      "Current runtime evidence is browser-focused and does not cover native build targets or engine editor play mode.",
    ]));
    expect(report.unityParity).toBe(false);
    expect(report.unrealParity).toBe(false);
  });

  it("summarizes browser editor workflow evidence without clearing Unity/Unreal editor parity", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-editor-authoring.json"), JSON.stringify({
      ok: true,
      authoredWorkflow: {
        hierarchyPersisted: true,
        inspectorEditsPersisted: true,
        exportedStaticApp: true,
        openedEditor: true,
      },
      checks: [
        { id: "hierarchy", passed: true },
        { id: "inspector", passed: true },
        { id: "pending", passed: false },
      ],
      exportedEvidence: {
        assetCount: 1,
        featureEvidence: {
          usesEditorCode: false,
        },
      },
      timelineEvidence: {
        trackCount: 4,
        clipCount: 6,
      },
      visualScriptingEvidence: {
        nodeCount: 10,
      },
      editorPicking: {
        evidence: {
          colorIdEncoding: true,
          raycastFallback: true,
        },
      },
      localizationAccessibility: {
        localeCount: 3,
        accessibility: {
          aaContrastPasses: true,
        },
      },
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-editor-prefab-workflow.json"), JSON.stringify({
      ok: true,
      checks: [{ passed: true, metrics: { prefabNodeCount: 2, exportedNodeCount: 4 } }],
    }, null, 2));

    const report = createV4UnityUnrealParityReport(root);
    const editorArea = report.workflowAreas.find((area) => area.id === "editor-authoring");

    expect(report.editorEvidence).toMatchObject({
      editorReportOk: true,
      prefabReportOk: true,
      passedCheckCount: 2,
      authoredWorkflowSignals: ["exportedStaticApp", "hierarchyPersisted", "inspectorEditsPersisted", "openedEditor"],
      importedAssetCount: 1,
      exportedStaticApp: true,
      staticExportWithoutEditorCode: true,
      prefabNodeCount: 2,
      prefabExportedNodeCount: 4,
      timelineTrackCount: 4,
      timelineClipCount: 6,
      visualScriptingNodeCount: 10,
      gpuPickingEvidence: true,
      localizationLocaleCount: 3,
      accessibilityAaContrastPasses: true,
    });
    expect(editorArea?.currentEvidence).toContain("V4 editor authoring passes 2 checks");
    expect(editorArea?.blockers).toEqual(expect.arrayContaining([
      "Editor evidence is scoped to current Galileo3D fixtures and browser workflows, not Unity/Unreal project/workflow equivalence.",
    ]));
    expect(report.replacement).toBe(false);
  });

  it("summarizes local rendering evidence without clearing Unity/Unreal rendered parity", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-rendering.json"), JSON.stringify({
      ok: true,
      screenshotPaths: ["shadow.png", "postprocess.png"],
      validations: [
        { name: "postprocess-lab-v4-preset", ok: true },
        { name: "forward-pass-shadow-map-sampling", ok: true },
      ],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity.json"), JSON.stringify({
      ok: true,
      renderedProductVisualParity: {
        threejs: true,
        babylon: true,
        unity: false,
        unreal: false,
      },
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-visual-parity.json"), JSON.stringify({ ok: true, boundedPbrVisualParity: { threejs: true, babylon: true } }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-shadow-visual-parity.json"), JSON.stringify({ ok: true, boundedShadowVisualParity: { threejs: true, babylon: true } }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-hdr-visual-parity.json"), JSON.stringify({ ok: true, boundedHdrRenderTargetParity: { threejs: true, babylon: true } }, null, 2));

    const report = createV4UnityUnrealParityReport(root);
    const renderingArea = report.workflowAreas.find((area) => area.id === "rendering");

    expect(report.renderingEvidence).toMatchObject({
      renderingReportOk: true,
      renderingValidationCount: 2,
      renderingScreenshotCount: 2,
      productVisualReportOk: true,
      productVisualThreeJs: true,
      productVisualBabylon: true,
      productVisualUnity: false,
      productVisualUnreal: false,
      boundedPbrVisualParity: true,
      boundedShadowVisualParity: true,
      boundedHdrRenderTargetParity: true,
      postprocessRealSceneValidation: true,
      forwardShadowSamplingValidation: true,
    });
    expect(renderingArea?.currentEvidence).toContain("product visual parity against Three.js=true and Babylon.js=true");
    expect(renderingArea?.blockers).toEqual(expect.arrayContaining([
      "No Unity/Unreal rendered output is produced.",
      "Current renderer reports keep broad HDR/shadow/postprocess/PBR parity blocked.",
    ]));
    expect(report.replacement).toBe(false);
  });

  it("persists external evidence readiness summaries and next actions", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    mkdirSync(join(root, "fixtures", "external-engine-baselines", "v4"), { recursive: true });
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writePublicDeploymentFixture(root);
    writeFileSync(
      join(root, ".github", "workflows", "v4-external-engine-baselines.yml"),
      readFileSync(join(process.cwd(), ".github", "workflows", "v4-external-engine-baselines.yml"), "utf8")
    );
    writeFileSync(
      join(root, ".github", "workflows", "v4-public-demo-deploy.yml"),
      readFileSync(join(process.cwd(), ".github", "workflows", "v4-public-demo-deploy.yml"), "utf8")
    );
    writeFileSync(join(root, "package.json"), readFileSync(join(process.cwd(), "package.json"), "utf8"));
    for (const toolPath of [
      "tools/v4-external-host-runner/index.ts",
      "tools/v4-external-host-doctor/index.ts",
      "tools/v4-external-evidence-handoff/index.ts",
      "tools/v4-external-evidence-readiness/index.ts",
    ]) {
      mkdirSync(dirname(join(root, toolPath)), { recursive: true });
      writeFileSync(join(root, toolPath), readFileSync(join(process.cwd(), toolPath), "utf8"));
    }
    writeFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "external-baseline-command-plan.json"), JSON.stringify({
      captures: [{
        engine: "unity",
        baselineKind: "product-visual",
        descriptorPath: "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
        expectedScreenshotPath: "tests/reports/v4-product-visual/unity-product-visual-baseline.png",
        expectedRunnerEvidencePath: "tests/reports/v4-product-visual/unity-product-visual-baseline.png.evidence.json",
        targetReportPath: "tests/reports/v4-unity-product-visual-baseline.json",
        minimumEvidence: { width: 720, height: 480, drawCalls: 18 },
        reportCommand: "node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity product-visual tests/reports/v4-product-visual/unity-product-visual-baseline.png tests/reports/v4-unity-product-visual-baseline.json",
        validationCommands: ["pnpm audit:v4-product-visual-parity"],
      }],
      renderWorkflowBaselineReports: [],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      sceneSlots: [
        { baselineKind: "product-visual", targetReports: { unity: "tests/reports/v4-unity-product-visual-baseline.json", unreal: "tests/reports/v4-unreal-product-visual-baseline.json" } },
        { baselineKind: "pbr-visual", targetReports: { unity: "tests/reports/v4-unity-pbr-visual-baseline.json", unreal: "tests/reports/v4-unreal-pbr-visual-baseline.json" } },
        { baselineKind: "shadow-visual", targetReports: { unity: "tests/reports/v4-unity-shadow-visual-baseline.json", unreal: "tests/reports/v4-unreal-shadow-visual-baseline.json" } },
        { baselineKind: "hdr-render-target", targetReports: { unity: "tests/reports/v4-unity-hdr-render-target-baseline.json", unreal: "tests/reports/v4-unreal-hdr-render-target-baseline.json" } },
        { baselineKind: "postprocess-suite", targetReports: { unity: "tests/reports/v4-unity-postprocess-suite-baseline.json", unreal: "tests/reports/v4-unreal-postprocess-suite-baseline.json" } },
      ],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-unity-unreal-parity.json"), JSON.stringify({
      unityParity: false,
      unrealParity: false,
      replacement: false,
      editorEvidence: {
        editorReportOk: true,
        passedCheckCount: 9,
        authoredWorkflowSignals: ["openedEditor", "savedAndReloaded", "exportedStaticApp"],
        timelineTrackCount: 4,
        visualScriptingNodeCount: 10,
        prefabExportedNodeCount: 4,
        staticExportWithoutEditorCode: true,
        claimBoundary: "Browser editor authoring evidence does not prove Unity/Unreal editor workflow equivalence.",
      },
      assetImportPreflight: {
        currentPipeline: "gltf-first",
        supportedFormats: ["glb", "gltf"],
        conversionRequiredFormats: ["fbx", "obj", "usd"],
        claimBoundary: "Asset import preflight does not prove native Unity/Unreal/DCC import parity.",
      },
      runtimeEvidence: {
        runtimeReportOk: true,
        completedRuntimeTaskCount: 33,
        gameSliceStatus: "ready",
        gameSliceDrawCalls: 44,
        oldBranchRuntimePortEvidence: ["oldBranchSpaceEnvironmentPort", "oldBranchInputActionBindingPort"],
        claimBoundary: "Browser runtime evidence does not prove native Unity/Unreal runtime parity.",
      },
      renderingEvidence: {
        renderingReportOk: true,
        renderingValidationCount: 10,
        renderingScreenshotCount: 12,
        productVisualThreeJs: true,
        productVisualBabylon: true,
        productVisualUnity: false,
        productVisualUnreal: false,
        boundedPbrVisualParity: false,
        boundedShadowVisualParity: false,
        boundedHdrRenderTargetParity: false,
        postprocessRealSceneValidation: true,
        forwardShadowSamplingValidation: true,
        claimBoundary: "Local rendering evidence does not prove Unity/Unreal rendered-output parity.",
      },
      deploymentEvidence: {
        staticExportOk: true,
        staticExportOutputDir: "release-artifacts/external-demos/0.1.0-alpha.0",
        staticDemoServerSmokeOk: true,
        publicDeploymentSmokeOk: false,
        githubPagesWorkflowPath: ".github/workflows/v4-public-demo-deploy.yml",
        claimBoundary: "Local static export evidence does not prove production deployment readiness.",
      },
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity.json"), JSON.stringify({
      visualParityReady: false,
      renderedProductVisualParity: { threejs: true, babylon: true, unity: false, unreal: false },
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), JSON.stringify({ productionReady: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-gltf-readiness.json"), JSON.stringify({
      pbrParity: false,
      gltfParity: false,
      pbrBlockers: ["external Unity/Unreal PBR parity is missing"],
      gltfParityDimensions: [{
        id: "blender-export-same-corpus-coverage",
        ready: false,
        metrics: { sameCorpusNotRun: 77 },
      }],
    }, null, 2));
    const previousUnity = process.env.G3D_UNITY_EDITOR;
    const previousUnreal = process.env.G3D_UNREAL_EDITOR;
    const previousCliSmoke = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
    const previousPublicUrl = process.env.G3D_PUBLIC_DEMO_URL;
    delete process.env.G3D_UNITY_EDITOR;
    delete process.env.G3D_UNREAL_EDITOR;
    delete process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
    delete process.env.G3D_PUBLIC_DEMO_URL;

    const report = createV4ExternalEvidenceReadinessReport(root);

    expect(report.externalEvidenceReady).toBe(false);
    expect(report.missingArtifactRunbookPath).toBe("tests/reports/v4-external-evidence-missing-artifacts.md");
    expect(report.localPreflight).toMatchObject({
      canRunExternalEvidenceHere: false,
      firstMissingCapability: "unity-editor-executable",
      unity: {
        engine: "unity",
        envName: "G3D_UNITY_EDITOR",
        envSet: false,
        executableAvailable: false,
        cliSmokeOptIn: false,
        smokeReportPath: "tests/reports/v4-unity-editor-cli-smoke.json",
      },
      unreal: {
        engine: "unreal",
        envName: "G3D_UNREAL_EDITOR",
        envSet: false,
        executableAvailable: false,
        cliSmokeOptIn: false,
        smokeReportPath: "tests/reports/v4-unreal-editor-cli-smoke.json",
      },
      publicDeployment: {
        envName: "G3D_PUBLIC_DEMO_URL",
        envSet: false,
        durableHttpsCandidate: false,
        command: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
      },
    });
    expect(report.canRunExternalEvidenceHere).toBe(false);
    expect(report.firstMissingCapability).toBe("unity-editor-executable");
    expect(report.totalArtifacts).toBe(32);
    expect(report.readyArtifacts).toBe(2);
    expect(report.blockedArtifacts).toBe(30);
    expect(report.firstBlockedArtifact).toBe("unity:editor-cli-smoke");
    expect(report.summary).toMatchObject({
      totalAreas: 11,
      readyAreas: 3,
      blockedAreas: 8,
      firstBlockedArea: "github-remote-external-readiness",
      totalArtifacts: 32,
      readyArtifacts: 2,
      blockedArtifacts: 30,
      firstBlockedArtifact: "unity:editor-cli-smoke",
    });
    expect(report.areas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "github-remote-external-readiness",
        ready: false,
        evidencePaths: ["tests/reports/v4-github-external-readiness.json"],
        blockers: ["tests/reports/v4-github-external-readiness.json is missing; run pnpm audit:v4-github-external-readiness."],
      }),
    ]));
    expect(report.requiredCommands).toEqual(expect.arrayContaining([
      "pnpm status:v4-local-port",
      "pnpm status:v4-parity",
      "pnpm prepare:v4-external-evidence-handoff",
      "pnpm doctor:v4-external-host",
      "pnpm audit:v4-github-external-readiness",
      "pnpm run:v4-external-host-evidence",
      "pnpm run:v4-external-host-evidence:execute",
      "pnpm preflight:v4-parity:after-external-evidence",
      "pnpm preflight:v4-production-readiness",
      "pnpm dry-run:v4-unity-baselines",
      "pnpm dry-run:v4-unreal-baselines",
      "pnpm write:v4-external-baseline-reports",
      "pnpm verify:v4-external-baseline-reports",
    ]));
    expect(report.sourceFileHashes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "package.json" }),
      expect.objectContaining({ path: "tools/v4-external-host-doctor/index.ts" }),
      expect.objectContaining({ path: "tools/v4-external-host-runner/index.ts" }),
      expect.objectContaining({ path: "tools/v4-external-evidence-handoff/index.ts" }),
      expect.objectContaining({ path: "tools/v4-external-evidence-readiness/index.ts" }),
    ]));
    expect(report.nextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        areaId: "unity-external-baselines",
        localEvidence: expect.arrayContaining([
          expect.stringContaining("Browser editor evidence ok=true with 9 passed checks"),
          expect.stringContaining("Asset import preflight is gltf-first"),
          expect.stringContaining("Browser runtime report ok=true with 33 completed runtime tasks"),
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "unity editor executable discovery and CLI smoke report.",
          "unity render workflow report for the current external baseline kit.",
        ]),
        commands: expect.arrayContaining([
          "export G3D_UNITY_EDITOR=/absolute/path/to/Unity",
          "pnpm doctor:v4-external-host:strict",
          "pnpm run:v4-external-host-evidence",
          "pnpm run:v4-external-host-evidence:execute",
          "pnpm preflight:v4-parity:after-external-evidence",
          "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
          "or run .github/workflows/v4-external-engine-baselines.yml on a self-hosted runner labeled unity",
          "pnpm ingest:v4-external-baseline-artifacts --dry-run path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
          "pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
          "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity",
          "node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unity tests/reports/v4-unity-baseline-render.json",
          "pnpm audit:v4-unity-unreal-parity",
        ]),
        evidencePaths: expect.arrayContaining([
          "tests/reports/v4-unity-editor-cli-smoke.json",
          "tests/reports/v4-unity-baseline-render.json",
        ]),
      }),
      expect.objectContaining({
        areaId: "durable-public-demo-deployment",
        localEvidence: expect.arrayContaining([
          expect.stringContaining("Local deployment evidence: staticExportOk=true"),
          "Local static export evidence does not prove production deployment readiness.",
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "Static export must be deployed to a durable public HTTPS origin.",
          "Public deployment smoke must return current HTTP/hash/content-marker evidence for every manifest file.",
        ]),
        commands: expect.arrayContaining([
          "pnpm preflight:v4-production-readiness",
          "pnpm build:external-demos",
          "review tests/reports/public-demo-deployment-runbook.md for exact public paths, hashes, and content markers",
          "pnpm doctor:v4-external-host:strict",
          "pnpm run:v4-external-host-evidence",
          "pnpm run:v4-external-host-evidence:execute",
          "pnpm preflight:v4-parity:after-external-evidence",
          "or run .github/workflows/v4-public-demo-deploy.yml and download v4-public-demo-deployment-reports",
          "pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports",
          "pnpm audit:v4-production-readiness",
        ]),
        evidencePaths: expect.arrayContaining([
          "tests/reports/public-demo-deployment-runbook.md",
        ]),
      }),
    ]));
    expect(report.artifactChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({
        areaId: "external-baseline-ci-workflow",
        id: "github-actions:self-hosted-unity-unreal-baselines",
        kind: "ci-workflow",
        ready: true,
        path: ".github/workflows/v4-external-engine-baselines.yml",
      }),
      expect.objectContaining({
        areaId: "public-deployment-ci-workflow",
        id: "github-actions:public-demo-deployment",
        kind: "ci-workflow",
        ready: true,
        path: ".github/workflows/v4-public-demo-deploy.yml",
      }),
      expect.objectContaining({
        areaId: "unity-external-baselines",
        id: "unity:editor-cli-smoke",
        kind: "editor-cli-smoke",
        ready: false,
        path: "tests/reports/v4-unity-editor-cli-smoke.json",
        localEvidence: expect.arrayContaining([
          "unity CLI smoke command and target report path are prepared locally.",
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true.",
        ]),
      }),
      expect.objectContaining({
        areaId: "unity-external-baselines",
        kind: "external-scene-baseline",
        ready: false,
        path: "tests/reports/v4-unity-product-visual-baseline.json",
        localEvidence: expect.arrayContaining([
          expect.stringContaining("unity product-visual descriptor, Galileo reference, report writer command, and validation thresholds are prepared locally."),
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "Run the unity capture on a real Unity editor host.",
          "Attach the real external screenshot and runner-evidence sidecar, then generate the baseline report with the prepared writer command.",
        ]),
      }),
      expect.objectContaining({
        areaId: "unreal-external-baselines",
        kind: "render-workflow-report",
        ready: false,
        path: "tests/reports/v4-unreal-baseline-render.json",
        localEvidence: expect.arrayContaining([
          "unreal render workflow report command and baseline kit slots are prepared locally.",
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "Open/build/render the current baseline kit in a real Unreal editor workflow and write tests/reports/v4-unreal-baseline-render.json with ok=true.",
        ]),
      }),
      expect.objectContaining({
        areaId: "unity-external-baselines",
        id: "unity:asset-import-workflow",
        kind: "asset-import-workflow-report",
        ready: false,
        path: "tests/reports/v4-unity-asset-import-workflow.json",
        expectedRunnerEvidencePath: "tests/reports/v4-unity-asset-import-workflow.evidence.json",
        command: "node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json",
        localEvidence: expect.arrayContaining([
          "unity asset-import workflow report schema, template, writer command, and target report path are prepared locally.",
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          "Run the unity asset-import workflow in a real Unity editor project and write the runner-evidence sidecar.",
        ]),
      }),
      expect.objectContaining({
        areaId: "unreal-external-baselines",
        id: "unreal:asset-import-workflow",
        kind: "asset-import-workflow-report",
        ready: false,
        path: "tests/reports/v4-unreal-asset-import-workflow.json",
        expectedRunnerEvidencePath: "tests/reports/v4-unreal-asset-import-workflow.evidence.json",
      }),
      expect.objectContaining({
        areaId: "final-external-parity-audits",
        id: "production-readiness",
        kind: "final-audit-report",
        ready: false,
        path: "tests/reports/v4-production-readiness.json",
        requiredExternalEvidence: expect.arrayContaining([
          "Rerun this final audit after real Unity, Unreal, PBR, deployment, and completion evidence has been ingested.",
        ]),
      }),
      expect.objectContaining({
        areaId: "durable-public-demo-deployment",
        id: "public:index",
        kind: "public-deployment-check",
        ready: false,
        runbookPath: "tests/reports/public-demo-deployment-runbook.md",
        localEvidence: expect.arrayContaining([
          expect.stringContaining("Static export manifest lists"),
        ]),
        requiredExternalEvidence: expect.arrayContaining([
          expect.stringContaining("Serve index.html"),
        ]),
      }),
    ]));
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("unity-external-baselines/unity:editor-cli-smoke: tests/reports/v4-unity-editor-cli-smoke.json is missing"),
      expect.stringContaining("unity-external-baselines/unity:product-visual: tests/reports/v4-unity-product-visual-baseline.json is missing"),
    ]));
    expect(readFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), "utf8")).toContain("\"nextActions\"");
    expect(readFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), "utf8")).toContain("\"artifactChecklist\"");
    expect(readFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), "utf8")).toContain("\"firstMissingCapability\": \"unity-editor-executable\"");
    const runbook = readFileSync(join(root, "tests", "reports", "v4-external-evidence-missing-artifacts.md"), "utf8");
    expect(runbook).toContain("# V4 External Evidence Missing Artifacts");
    expect(runbook).toContain("## Local Preflight");
    expect(runbook).toContain("Can run external evidence on this host now: no");
    expect(runbook).toContain("First missing capability: `unity-editor-executable`");
    expect(runbook).toContain("Unity executable available: no");
    expect(runbook).toContain("Unreal executable available: no");
    expect(runbook).toContain("Public deployment durable HTTPS candidate: no");
    expect(runbook).toContain("## Local Refresh Commands");
    expect(runbook).toContain("pnpm status:v4-local-port");
    expect(runbook).toContain("pnpm status:v4-parity");
    expect(runbook).toContain("pnpm prepare:v4-external-evidence-handoff");
    expect(runbook).toContain("pnpm doctor:v4-external-host");
    expect(runbook).toContain("pnpm run:v4-external-host-evidence");
    expect(runbook).toContain("pnpm run:v4-external-host-evidence:execute");
    expect(runbook).toContain("pnpm preflight:v4-parity:after-external-evidence");
    expect(runbook).toContain("pnpm preflight:v4-parity");
    expect(runbook).toContain("pnpm refresh:v4-readiness-reports");
    expect(runbook).toContain("## Next Actions");
    expect(runbook).toContain("G3D_UNITY_EDITOR and G3D_UNREAL_EDITOR must be configured as Actions variables or secrets; the checked-in workflow sets G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true internally.");
    expect(runbook).toContain("configure G3D_UNITY_EDITOR and G3D_UNREAL_EDITOR as Actions variables or secrets; the workflow sets G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true internally");
    expect(runbook).not.toContain("G3D_UNITY_EDITOR, G3D_UNREAL_EDITOR, and G3D_RUN_UNITY_UNREAL_CLI_SMOKE must be configured as Actions variables or secrets.");
    expect(runbook).not.toContain("configure G3D_UNITY_EDITOR, G3D_UNREAL_EDITOR, and G3D_RUN_UNITY_UNREAL_CLI_SMOKE as Actions variables or secrets");
    expect(runbook).toContain("### unity-external-baselines");
    expect(runbook).toContain("Local evidence already present:");
    expect(runbook).toContain("Browser editor evidence ok=true with 9 passed checks");
    expect(runbook).toContain("Asset import preflight is gltf-first");
    expect(runbook).toContain("External evidence still required:");
    expect(runbook).toContain("unity editor executable discovery and CLI smoke report.");
    expect(runbook).toContain("pnpm ingest:v4-external-baseline-artifacts --dry-run path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits");
    expect(runbook).toContain("pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits");
    expect(runbook).not.toContain("pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-external-baseline-final-audits");
    expect(runbook).not.toContain("pnpm ingest:v4-external-baseline-artifacts path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits");
    expect(runbook).toContain("### durable-public-demo-deployment");
    expect(runbook).toContain("Local deployment evidence: staticExportOk=true");
    expect(runbook).toContain("Static export must be deployed to a durable public HTTPS origin.");
    expect(runbook).toContain("pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports");
    expect(runbook).toContain("- [ ] `unity:editor-cli-smoke`");
    expect(runbook).toContain("Target path: `tests/reports/v4-unity-editor-cli-smoke.json`");
    expect(runbook).toContain("- [ ] `unity:product-visual`");
    expect(runbook).toContain("Target path: `tests/reports/v4-unity-product-visual-baseline.json`");
    expect(runbook).toContain("Expected screenshot:");
    expect(runbook).toContain("Minimum evidence:");
    expect(runbook).toContain("`drawCalls`: 18");
    expect(runbook).toContain("Local evidence already present:");
    expect(runbook).toContain("unity CLI smoke command and target report path are prepared locally.");
    expect(runbook).toContain("External evidence still required:");
    expect(runbook).toContain("Run the unity editor CLI smoke against a real Unity editor executable");
    expect(runbook).toContain("unity product-visual descriptor, Galileo reference, report writer command, and validation thresholds are prepared locally.");
    expect(runbook).toContain("Attach the real external screenshot and runner-evidence sidecar");
    expect(runbook).toContain("Runbook: `tests/reports/public-demo-deployment-runbook.md`");
    expect(runbook).toContain("Static export manifest lists");
    expect(runbook).toContain("Serve index.html from a durable public HTTPS origin");
    expect(runbook).toContain("## Ready Artifacts");
    expect(runbook).toContain("- [x] `github-actions:self-hosted-unity-unreal-baselines`");
    expect(runbook).toContain("- [x] `github-actions:public-demo-deployment`");
    expect(runbook).toContain("## Required Final Commands");
    expect(runbook).toContain("pnpm status:v4-local-port");
    expect(runbook).toContain("pnpm status:v4-parity");
    expect(runbook).toContain("pnpm prepare:v4-external-evidence-handoff");
    restoreEnv("G3D_UNITY_EDITOR", previousUnity);
    restoreEnv("G3D_UNREAL_EDITOR", previousUnreal);
    restoreEnv("G3D_RUN_UNITY_UNREAL_CLI_SMOKE", previousCliSmoke);
    restoreEnv("G3D_PUBLIC_DEMO_URL", previousPublicUrl);
  });

  it("keeps the external evidence preflight wired through the runnable Unity and Unreal dry-run helpers", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      readonly scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};
    const v4Readme = readFileSync(join(process.cwd(), "docs", "v4", "README.md"), "utf8");

    expect(scripts["dry-run:v4-unity-baselines"]).toBe("node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --dry-run");
    expect(scripts["dry-run:v4-unreal-baselines"]).toBe("node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --dry-run");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm verify:v4-external-engine-baselines");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm dry-run:v4-unity-baselines");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm dry-run:v4-unreal-baselines");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm run:v4-external-host-evidence");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm audit:v4-github-external-readiness");
    expect(scripts["preflight:v4-external-evidence"]).toContain("pnpm audit:v4-external-evidence-readiness");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).toContain("pnpm verify:v4-external-engine-baselines");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).toContain("pnpm dry-run:v4-unity-baselines");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).toContain("pnpm dry-run:v4-unreal-baselines");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).not.toContain("pnpm run:v4-external-host-evidence");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).toContain("pnpm audit:v4-github-external-readiness");
    expect(scripts["preflight:v4-external-evidence:after-execute"]).toContain("pnpm audit:v4-external-evidence-readiness");
    expect(scripts["preflight:v4-production-readiness"]).toContain("pnpm build:external-demos");
    expect(scripts["preflight:v4-production-readiness"]).toContain("pnpm verify:static-demo-server-smoke");
    expect(scripts["preflight:v4-production-readiness"]).toContain("pnpm audit:v4-production-readiness");
    expect(scripts["preflight:v4-parity"]).toContain("pnpm preflight:v4-production-readiness");
    expect(scripts["preflight:v4-parity"]).toContain("pnpm preflight:v4-external-evidence");
    expect(scripts["preflight:v4-parity"]).toContain("pnpm refresh:v4-readiness-reports");
    expect(scripts["preflight:v4-parity"]).toContain("pnpm prepare:v4-external-evidence-handoff");
    expect(scripts["preflight:v4-parity"]).toContain("pnpm verify:v4-external-evidence-handoff");
    expect(scripts["preflight:v4-parity:after-external-evidence"]).toContain("pnpm preflight:v4-production-readiness");
    expect(scripts["preflight:v4-parity:after-external-evidence"]).toContain("pnpm preflight:v4-external-evidence:after-execute");
    expect(scripts["preflight:v4-parity:after-external-evidence"]).toContain("pnpm refresh:v4-readiness-reports");
    expect(scripts["preflight:v4-parity:after-external-evidence"]).toContain("pnpm verify:v4-external-evidence-handoff");
    expect(scripts["status:v4-parity"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-parity-status/index.ts");
    expect(scripts["status:v4-local-port"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-local-port-status/index.ts");
    expect(scripts["prepare:v4-external-evidence-handoff"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-evidence-handoff/index.ts");
    expect(scripts["verify:v4-external-evidence-handoff"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-evidence-handoff/index.ts --verify");
    expect(scripts["audit:v4-github-external-readiness"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-github-external-readiness/index.ts");
    expect(scripts["doctor:v4-external-host"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-host-doctor/index.ts");
    expect(scripts["doctor:v4-external-host:strict"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-host-doctor/index.ts --strict");
    expect(scripts["run:v4-external-host-evidence"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-host-runner/index.ts");
    expect(scripts["run:v4-external-host-evidence:execute"]).toBe("tsx --tsconfig tsconfig.base.json tools/v4-external-host-runner/index.ts --execute");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("tools/v4-claim-gates/index.ts");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("tools/v4-assets/index.ts");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("tools/v4-current-capability/index.ts");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-pbr-reference-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-postprocess-suite");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-shadow-map-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-hdr-render-target-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-unity-unreal-parity");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-pbr-gltf-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-github-external-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-external-evidence-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-ecosystem-readiness");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-broad-parity");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm audit:v4-completion");
    expect(scripts["refresh:v4-readiness-reports"]).toContain("pnpm verify:v4-report-freshness");
    expect(v4Readme).toContain("pnpm status:v4-parity");
    expect(v4Readme).toContain("pnpm status:v4-local-port");
    expect(v4Readme).toContain("pnpm prepare:v4-external-evidence-handoff");
    expect(v4Readme).toContain("pnpm verify:v4-external-evidence-handoff");
    expect(v4Readme).toContain("pnpm doctor:v4-external-host");
    expect(v4Readme).toContain("pnpm doctor:v4-external-host:strict");
    expect(v4Readme).toContain("pnpm run:v4-external-host-evidence");
    expect(v4Readme).toContain("pnpm run:v4-external-host-evidence:execute");
    expect(v4Readme).toContain("pnpm preflight:v4-parity:after-external-evidence");
    expect(v4Readme).toContain("tests/reports/v4-external-host-doctor.json");
    expect(v4Readme).toContain("tests/reports/v4-external-host-runner.json");
    expect(v4Readme).toContain("reads the generated reports and does not refresh them");
    expect(v4Readme).toContain("prepares the external-evidence handoff package");
    expect(v4Readme).toContain("verifies the handoff package manifest");
    expect(v4Readme).toContain("pnpm preflight:v4-parity");
    expect(v4Readme).toContain("pnpm refresh:v4-readiness-reports");
  });

  it("audits GitHub external evidence prerequisites without dispatching workflows", () => {
    const root = fixtureRoot();
    const calls: string[] = [];
    const results = new Map<string, CommandResult>([
      ["git config --get remote.origin.url", { status: 0, stdout: "https://github.com/gchahal1982/G3D2025.git\n", stderr: "" }],
      ["git rev-parse --abbrev-ref HEAD", { status: 0, stdout: "preserve/g3d-v2-execution-state\n", stderr: "" }],
      ["git ls-remote --heads origin preserve/g3d-v2-execution-state", { status: 0, stdout: "abc123\trefs/heads/preserve/g3d-v2-execution-state\n", stderr: "" }],
      ["gh repo view gchahal1982/G3D2025 --json defaultBranchRef", { status: 0, stdout: JSON.stringify({ defaultBranchRef: { name: "main" } }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/contents/.github/workflows/v4-external-engine-baselines.yml?ref=main", { status: 0, stdout: JSON.stringify({ name: "v4-external-engine-baselines.yml" }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/contents/.github/workflows/v4-public-demo-deploy.yml?ref=main", { status: 0, stdout: JSON.stringify({ name: "v4-public-demo-deploy.yml" }), stderr: "" }],
      ["gh workflow list --repo gchahal1982/G3D2025", { status: 0, stdout: "v4-external-engine-baselines.yml\tactive\nv4-public-demo-deploy.yml\tactive\n", stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/pages", { status: 0, stdout: JSON.stringify({ html_url: "https://gchahal1982.github.io/G3D2025/", status: "built" }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/actions/runners", { status: 0, stdout: JSON.stringify({ runners: [
        { name: "unity-host", labels: [{ name: "self-hosted" }, { name: "unity" }] },
        { name: "unreal-host", labels: [{ name: "self-hosted" }, { name: "unreal" }] },
      ] }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/actions/variables", { status: 0, stdout: JSON.stringify({ variables: [] }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/actions/secrets", { status: 0, stdout: JSON.stringify({ secrets: [{ name: "G3D_UNITY_EDITOR" }, { name: "G3D_UNREAL_EDITOR" }] }), stderr: "" }],
    ]);
    const runner: CommandRunner = (command, args) => {
      const key = `${command} ${args.join(" ")}`;
      calls.push(key);
      return results.get(key) ?? { status: 1, stdout: "", stderr: `unexpected command: ${key}` };
    };

    const report = createV4GithubExternalReadinessReport(root, runner);

    expect(report.githubExternalReady).toBe(true);
    expect(report.repo).toBe("gchahal1982/G3D2025");
    expect(report.currentBranch).toBe("preserve/g3d-v2-execution-state");
    expect(report.defaultBranch).toBe("main");
    expect(report.blockers).toEqual([]);
    expect(report.checks.workflowsOnDefaultBranch.ready).toBe(true);
    expect(report.checks.pagesConfigured.ready).toBe(true);
    expect(report.checks.selfHostedRunners.ready).toBe(true);
    expect(report.checks.actionsConfiguration.ready).toBe(true);
    expect(report.checks.actionsConfiguration.evidence).toContain("G3D_RUN_UNITY_UNREAL_CLI_SMOKE is set to true inside .github/workflows/v4-external-engine-baselines.yml.");
    expect(calls).not.toEqual(expect.arrayContaining([
      expect.stringContaining("workflow run"),
      expect.stringContaining("git push"),
    ]));
    expect(readFileSync(join(root, "tests", "reports", "v4-github-external-readiness.json"), "utf8")).toContain("\"githubExternalReady\": true");
  });

  it("keeps GitHub external readiness blocked when workflows and runners are not configured", () => {
    const root = fixtureRoot();
    const results = new Map<string, CommandResult>([
      ["git config --get remote.origin.url", { status: 0, stdout: "https://github.com/gchahal1982/G3D2025.git\n", stderr: "" }],
      ["git rev-parse --abbrev-ref HEAD", { status: 0, stdout: "preserve/g3d-v2-execution-state\n", stderr: "" }],
      ["git ls-remote --heads origin preserve/g3d-v2-execution-state", { status: 0, stdout: "", stderr: "" }],
      ["gh repo view gchahal1982/G3D2025 --json defaultBranchRef", { status: 0, stdout: JSON.stringify({ defaultBranchRef: { name: "main" } }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/contents/.github/workflows/v4-external-engine-baselines.yml?ref=main", { status: 1, stdout: "", stderr: "not found" }],
      ["gh api repos/gchahal1982/G3D2025/contents/.github/workflows/v4-public-demo-deploy.yml?ref=main", { status: 1, stdout: "", stderr: "not found" }],
      ["gh workflow list --repo gchahal1982/G3D2025", { status: 0, stdout: "ci.yml\tactive\n", stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/pages", { status: 1, stdout: "", stderr: "not found" }],
      ["gh api repos/gchahal1982/G3D2025/actions/runners", { status: 0, stdout: JSON.stringify({ runners: [] }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/actions/variables", { status: 0, stdout: JSON.stringify({ variables: [] }), stderr: "" }],
      ["gh api repos/gchahal1982/G3D2025/actions/secrets", { status: 0, stdout: JSON.stringify({ secrets: [] }), stderr: "" }],
    ]);
    const runner: CommandRunner = (command, args) => results.get(`${command} ${args.join(" ")}`) ?? { status: 1, stdout: "", stderr: "unexpected command" };

    const report = createV4GithubExternalReadinessReport(root, runner);

    expect(report.githubExternalReady).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining([
      "currentBranchOnRemote: current branch preserve/g3d-v2-execution-state is not present on origin; push it before opening the external-evidence PR.",
      "workflowsOnDefaultBranch: .github/workflows/v4-external-engine-baselines.yml is not readable on default branch main.",
      "workflowsOnDefaultBranch: .github/workflows/v4-public-demo-deploy.yml is not readable on default branch main.",
      "workflowsOnDefaultBranch: gh workflow list does not show both V4 external evidence workflows as discoverable.",
      "pagesConfigured: GitHub Pages is not configured with a durable HTTPS URL for public deployment smoke evidence.",
      "selfHostedRunners: No self-hosted runner labeled unity is registered.",
      "selfHostedRunners: No self-hosted runner labeled unreal is registered.",
      "actionsConfiguration: G3D_UNITY_EDITOR is not configured as an Actions variable or secret.",
      "actionsConfiguration: G3D_UNREAL_EDITOR is not configured as an Actions variable or secret.",
    ]));
    expect(report.nextCommands).toEqual(expect.arrayContaining([
      "git push origin preserve/g3d-v2-execution-state",
      "Open and merge a PR that lands the V4 workflow files on main.",
      "Enable GitHub Pages for the repository.",
      "Register self-hosted GitHub Actions runners labeled unity and unreal.",
    ]));
  });

  it("summarizes the current V4 parity status without mutating reports", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-completion-audit.json"), JSON.stringify({
      ok: false,
      achievedCriteria: 2,
      totalCriteria: 13,
      criteria: [
        { id: "full-gltf-parity", achieved: true },
        { id: "full-webgpu-parity", achieved: true },
        {
          id: "unity-parity",
          requestedClaim: "Unity parity",
          achieved: false,
          blockerType: "mixed",
          evidencePaths: ["tests/reports/v4-unity-unreal-parity.json"],
          localEvidence: ["browser editor evidence is present"],
          requiredExternalEvidence: ["unity editor executable discovery and CLI smoke report."],
          blockers: ["unity editor executable not found"],
        },
      ],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), JSON.stringify({
      externalEvidenceReady: false,
      firstMissingCapability: "unity-editor-executable",
      firstBlockedArtifact: "unity:editor-cli-smoke",
      summary: {
        firstBlockedArea: "github-remote-external-readiness",
        firstBlockedArtifact: "unity:editor-cli-smoke",
      },
      artifactChecklist: [{
        areaId: "unity-external-baselines",
        id: "unity:editor-cli-smoke",
        kind: "editor-cli-smoke",
        ready: false,
        path: "tests/reports/v4-unity-editor-cli-smoke.json",
        command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        validationCommands: ["pnpm audit:v4-external-evidence-readiness"],
        localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
        requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
        blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing"],
      }],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-github-external-readiness.json"), JSON.stringify({
      githubExternalReady: false,
      repo: "gchahal1982/G3D2025",
      currentBranch: "preserve/g3d-v2-execution-state",
      defaultBranch: "main",
      blockers: [
        "currentBranchOnRemote: current branch preserve/g3d-v2-execution-state is not present on origin; push it before opening the external-evidence PR.",
        "workflowsOnDefaultBranch: .github/workflows/v4-external-engine-baselines.yml is not readable on default branch main.",
      ],
      nextCommands: [
        "git push origin preserve/g3d-v2-execution-state",
        "Open and merge a PR that lands the V4 workflow files on main.",
      ],
      reportPath: "tests/reports/v4-github-external-readiness.json",
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), JSON.stringify({ productionReady: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-unity-unreal-parity.json"), JSON.stringify({
      unityParity: false,
      unrealParity: false,
      replacement: false,
    }, null, 2));

    const status = createV4ParityStatusSummary(root);

    expect(status).toMatchObject({
      ok: false,
      achievedCriteria: 2,
      totalCriteria: 13,
      achievedCriteriaIds: ["full-gltf-parity", "full-webgpu-parity"],
      missingCriteriaIds: ["unity-parity"],
      firstMissingCriterion: {
        id: "unity-parity",
        requestedClaim: "Unity parity",
        blockerType: "mixed",
        evidencePaths: ["tests/reports/v4-unity-unreal-parity.json"],
        localEvidence: ["browser editor evidence is present"],
        requiredExternalEvidence: ["unity editor executable discovery and CLI smoke report."],
        blockers: ["unity editor executable not found"],
      },
      productionReady: false,
      externalEvidenceReady: false,
      unityParity: false,
      unrealParity: false,
      unityUnrealReplacement: false,
      firstMissingCapability: "unity-editor-executable",
      firstBlockedExternalArea: "github-remote-external-readiness",
      firstBlockedExternalArtifact: "unity:editor-cli-smoke",
      firstBlockedExternalArtifactDetails: {
        areaId: "unity-external-baselines",
        id: "unity:editor-cli-smoke",
        kind: "editor-cli-smoke",
        path: "tests/reports/v4-unity-editor-cli-smoke.json",
        command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        validationCommands: ["pnpm audit:v4-external-evidence-readiness"],
        localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
        requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
        blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing"],
      },
      githubExternalReady: false,
      githubExternalReadiness: {
        repo: "gchahal1982/G3D2025",
        currentBranch: "preserve/g3d-v2-execution-state",
        defaultBranch: "main",
        blockers: [
          "currentBranchOnRemote: current branch preserve/g3d-v2-execution-state is not present on origin; push it before opening the external-evidence PR.",
          "workflowsOnDefaultBranch: .github/workflows/v4-external-engine-baselines.yml is not readable on default branch main.",
        ],
        nextCommands: [
          "git push origin preserve/g3d-v2-execution-state",
          "Open and merge a PR that lands the V4 workflow files on main.",
        ],
        reportPath: "tests/reports/v4-github-external-readiness.json",
      },
      completionRunbookPath: "tests/reports/v4-completion-audit-runbook.md",
      externalEvidenceRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md",
      commands: {
        localPreflight: "pnpm preflight:v4-parity",
        postExternalEvidencePreflight: "pnpm preflight:v4-parity:after-external-evidence",
        reportRefresh: "pnpm refresh:v4-readiness-reports",
        externalEvidencePreflight: "pnpm preflight:v4-external-evidence",
        productionPreflight: "pnpm preflight:v4-production-readiness",
      },
    });
  });

  it("separates completed local docs and old-codebase ports from blocked external parity evidence", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "v3"), { recursive: true });
    mkdirSync(join(root, "docs", "v4"), { recursive: true });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "docs", "v3", "README.md"), "- [x] V3 local row complete.\n");
    writeFileSync(join(root, "docs", "v4", "README.md"), "- [x] V4 local row complete.\n");
    writeFileSync(join(root, "docs", "v4", "old-codebase-port-plan.md"), "- [x] Old branch port row complete.\n");
    writeFileSync(join(root, "tests", "reports", "v4-completion-audit.json"), JSON.stringify({
      ok: false,
      achievedCriteria: 2,
      totalCriteria: 13,
      criteria: [
        { id: "full-gltf-parity", achieved: true },
        { id: "full-webgpu-parity", achieved: true },
        { id: "unity-parity", achieved: false },
      ],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), JSON.stringify({
      externalEvidenceReady: false,
      firstMissingCapability: "unity-editor-executable",
      firstBlockedArtifact: "unity:editor-cli-smoke",
      summary: {
        firstBlockedArea: "github-remote-external-readiness",
        firstBlockedArtifact: "unity:editor-cli-smoke",
      },
      artifactChecklist: [{
        areaId: "unity-external-baselines",
        id: "unity:editor-cli-smoke",
        kind: "editor-cli-smoke",
        ready: false,
        path: "tests/reports/v4-unity-editor-cli-smoke.json",
        command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        validationCommands: ["pnpm audit:v4-external-evidence-readiness"],
        localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
        requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
        blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing"],
      }],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-github-external-readiness.json"), JSON.stringify({
      githubExternalReady: false,
      repo: "gchahal1982/G3D2025",
      currentBranch: "preserve/g3d-v2-execution-state",
      defaultBranch: "main",
      blockers: [
        "currentBranchOnRemote: current branch preserve/g3d-v2-execution-state is not present on origin; push it before opening the external-evidence PR.",
      ],
      nextCommands: [
        "git push origin preserve/g3d-v2-execution-state",
      ],
      reportPath: "tests/reports/v4-github-external-readiness.json",
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), JSON.stringify({ productionReady: false }, null, 2));

    const status = createV4LocalPortStatusSummary(root);

    expect(status).toMatchObject({
      ok: false,
      localDocsComplete: true,
      oldCodebasePortPlanComplete: true,
      docsV3: { total: 0, files: [] },
      docsV4: { total: 0, files: [] },
      oldCodebasePortPlan: { total: 0, files: [] },
      achievedCriteria: 2,
      totalCriteria: 13,
      achievedCriteriaIds: ["full-gltf-parity", "full-webgpu-parity"],
      missingCriteriaIds: ["unity-parity"],
      productionReady: false,
      externalEvidenceReady: false,
      firstMissingCapability: "unity-editor-executable",
      firstBlockedExternalArea: "github-remote-external-readiness",
      firstBlockedExternalArtifact: "unity:editor-cli-smoke",
      firstBlockedExternalArtifactDetails: {
        areaId: "unity-external-baselines",
        id: "unity:editor-cli-smoke",
        kind: "editor-cli-smoke",
        path: "tests/reports/v4-unity-editor-cli-smoke.json",
        command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        validationCommands: ["pnpm audit:v4-external-evidence-readiness"],
        localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
        requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
        blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing"],
      },
      githubExternalReady: false,
      githubExternalReadiness: {
        repo: "gchahal1982/G3D2025",
        currentBranch: "preserve/g3d-v2-execution-state",
        defaultBranch: "main",
        blockers: [
          "currentBranchOnRemote: current branch preserve/g3d-v2-execution-state is not present on origin; push it before opening the external-evidence PR.",
        ],
        nextCommands: [
          "git push origin preserve/g3d-v2-execution-state",
        ],
        reportPath: "tests/reports/v4-github-external-readiness.json",
      },
      claimBoundary: "Local docs and old-codebase port plan rows are complete, but broad parity remains blocked by external evidence or production deployment gates.",
      evidencePaths: {
        oldCodebasePortPlan: "docs/project/v4-old-codebase-port-plan.md",
        completionAudit: "tests/reports/v4-completion-audit.json",
        externalEvidence: "tests/reports/v4-external-evidence-readiness.json",
        completionRunbook: "tests/reports/v4-completion-audit-runbook.md",
        externalEvidenceRunbook: "tests/reports/v4-external-evidence-missing-artifacts.md",
      },
      commands: {
        localPortStatus: "pnpm status:v4-local-port",
        parityStatus: "pnpm status:v4-parity",
        localPreflight: "pnpm preflight:v4-parity",
        postExternalEvidencePreflight: "pnpm preflight:v4-parity:after-external-evidence",
        reportRefresh: "pnpm refresh:v4-readiness-reports",
        externalEvidencePreflight: "pnpm preflight:v4-external-evidence",
      },
    });
  });

  it("writes an external evidence handoff inventory without clearing blocked parity artifacts", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "fixtures", "external-engine-baselines", "v4"), { recursive: true });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "RUNBOOK.md"), "# runbook\n");
    writeFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "product-visual-parity-scene.json"), "{}\n");
    writeFileSync(join(root, "tests", "reports", "galileo-product.png"), rgbaPng(8, 8, [80, 120, 180, 255]));
    writeFileSync(join(root, "tests", "reports", "v4-external-evidence-missing-artifacts.md"), "# missing\n");
    writeFileSync(join(root, "tests", "reports", "v4-completion-audit-runbook.md"), "# completion\n");
    writeFileSync(join(root, "tests", "reports", "v4-github-external-readiness.json"), JSON.stringify({
      ok: true,
      githubExternalReady: false,
      blockers: ["current branch is not present on origin"],
    }, null, 2));
    writeFileSync(join(root, ".github", "workflows", "v4-external-engine-baselines.yml"), "name: external\n");
    writeFileSync(join(root, ".github", "workflows", "v4-public-demo-deploy.yml"), "name: deploy\n");
    writeFileSync(join(root, "docs/project/v4-parity-execution-prompt.md"), "# Coding-Related Parity Execution Prompt\n\n## Goal 12: Full glTF Parity\n\n## Goal 13: Full WebGPU Parity\n");
    mkdirSync(join(root, "release-artifacts"), { recursive: true });
    writeFileSync(join(root, "release-artifacts", "v4-external-evidence-operator-runbook.md"), [
      "# V4 External Evidence Operator Runbook",
      "",
      "Handoff integrity is now split by scope.",
      "",
      "```json",
      "{\"restorePreflight\":{\"ok\":true}}",
      "```",
      "",
      "```sh",
      "mkdir -p release-artifacts",
      "cp /path/to/v4-external-evidence-handoff/release-artifacts/v4-current-handoff-supplement.patch release-artifacts/",
      "```",
      "",
      "Patch-only transfers must copy the patch files into `release-artifacts/` before applying them.",
      "The supplement patch does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout.",
      "",
    ].join("\n"));
    writeFileSync(join(root, "release-artifacts", "v4-parity-external-evidence-pr.md"), [
      "# Add V4 Parity Execution And External Evidence Workflows",
      "",
      "Repo-side handoff verification scope.",
      "",
      "Standalone operator package verification also passed.",
      "",
      "Patch-only transfers must copy the patch files into `release-artifacts/` before applying them.",
      "The supplement patch does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout.",
      "",
    ].join("\n"));
    writeFileSync(join(root, "release-artifacts", "codingrelated-completion-audit.md"), "# Codingrelated Completion Audit\n\nStandalone package verification scope.\n\n`release-artifacts/v4-current-handoff-supplement.patch` was regenerated from the current handoff set. A two-patch simulation against `HEAD^` also passes.\n");
    writeFileSync(join(root, "release-artifacts", "v4-parity-external-evidence-workflows.patch"), "diff --git a/docs/project/v4-parity-execution-prompt.md b/docs/project/v4-parity-execution-prompt.md\n");
    writeFileSync(join(root, "release-artifacts", "v4-current-handoff-supplement.patch"), [
      "diff --git a/tools/v4-external-evidence-handoff/index.ts b/tools/v4-external-evidence-handoff/index.ts",
      "restorePreflight",
      "verificationScope",
      "Cannot restore because the handoff package failed integrity verification.",
      "Handoff integrity is now split by scope",
      "Repo-side handoff verification scope",
      "Standalone package verification scope",
      "current handoff set",
      "two-patch simulation",
    ].join("\n"));
    mkdirSync(join(root, "tests", "unit", "tools"), { recursive: true });
    writeFileSync(join(root, "tests", "unit", "tools", "v4-validation.test.ts"), readFileSync(join(process.cwd(), "tests", "unit", "tools", "v4-validation.test.ts"), "utf8"));
    writeFileSync(join(root, "package.json"), readFileSync(join(process.cwd(), "package.json"), "utf8"));
	    for (const toolPath of [
	      "tools/external-demo-export/index.ts",
	      "tools/external-demo-validation/index.ts",
      "tools/v4-claim-gates/index.ts",
      "tools/v4-assets/index.ts",
      "tools/v4-examples/index.ts",
      "tools/v4-current-capability/index.ts",
	      "tools/v4-reporting/index.ts",
	      "tools/v4-parity-status/index.ts",
      "tools/v4-local-port-status/index.ts",
      "tools/v4-external-host-runner/index.ts",
      "tools/v4-external-host-doctor/index.ts",
      "tools/v4-github-external-readiness/index.ts",
      "tools/v4-external-evidence-handoff/index.ts",
      "tools/v4-external-evidence-readiness/index.ts",
	      "tools/v4-external-engine-baselines/index.ts",
	      "tools/v4-report-freshness/index.ts",
	      "tools/v4-pbr-reference-readiness/index.ts",
	      "tools/v4-shadow-map-readiness/index.ts",
	      "tools/v4-hdr-render-target-readiness/index.ts",
	      "tools/v4-production-readiness/index.ts",
	      "tools/v4-pbr-gltf-readiness/index.ts",
	      "tools/v4-ecosystem-readiness/index.ts",
	      "tools/v4-broad-parity-readiness/index.ts",
	      "tools/v4-completion-audit/index.ts",
	      "tools/v4-product-visual-parity/index.ts",
      "tools/v4-product-visual-parity/productScene.ts",
      "tools/v4-pbr-visual-parity/index.ts",
      "tools/v4-shadow-visual-parity/index.ts",
      "tools/v4-hdr-visual-parity/index.ts",
      "tools/v4-postprocess-suite/index.ts",
      "tools/v4-unity-unreal-parity/index.ts",
      "tools/static-demo-server-smoke/index.ts",
      "tools/package-provenance/index.ts",
      "tools/compare-engines/index.ts",
      "tools/public-demo-deployment-smoke/index.ts",
      "tools/public-demo-deployment-artifacts/index.ts",
      "packages/assets/src/AssetImportPreflight.ts",
      "packages/assets/src/OBJLoader.ts",
      "packages/assets/src/index.ts",
      "packages/assets/tests/assets.test.ts",
      "examples/portfolio/main.ts",
      "examples/portfolio/README.md",
      "tests/browser/example-portfolio.spec.ts",
      "tests/browser/example-screenshot-audit-v4.spec.ts",
      "tests/unit/assets/asset-import-preflight.test.ts",
    ]) {
      mkdirSync(dirname(join(root, toolPath)), { recursive: true });
      writeFileSync(join(root, toolPath), readFileSync(join(process.cwd(), toolPath), "utf8"));
    }
    writePublicDeploymentFixture(root);
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      artifacts: [
        { path: "fixtures/external-engine-baselines/v4/RUNBOOK.md" },
        { path: "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json" },
      ],
      sceneSlots: [{
        galileoReferenceScreenshot: { path: "tests/reports/galileo-product.png" },
      }],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-evidence-readiness.json"), JSON.stringify({
      readyArtifacts: 2,
      blockedArtifacts: 28,
      firstBlockedArtifact: "unity:editor-cli-smoke",
      firstMissingCapability: "unity-editor-executable",
      artifactChecklist: [
        {
          areaId: "unity-external-baselines",
          id: "unity:editor-cli-smoke",
          kind: "editor-cli-smoke",
          ready: false,
          path: "tests/reports/v4-unity-editor-cli-smoke.json",
          command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
          localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
          requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
          blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing or does not contain ok=true for engine=\"unity\""],
        },
        { areaId: "external-baseline-ci-workflow", id: "github-actions:self-hosted-unity-unreal-baselines", kind: "ci-workflow", ready: true, path: ".github/workflows/v4-external-engine-baselines.yml", blockers: [] },
      ],
    }, null, 2));
    mkdirSync(join(root, "tests", "reports", "v4-product-visual-parity"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity", "galileo-product.png"), patternedPng(720, 480, "reference"));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity", "threejs-product.png"), patternedPng(720, 480, "inverted"));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity", "threejs-product-diff.png"), patternedPng(720, 480, "reference"));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity.json"), JSON.stringify({
      ok: true,
      screenshotPaths: [
        "tests/reports/v4-product-visual-parity/galileo-product.png",
        "tests/reports/v4-product-visual-parity/threejs-product.png",
        "tests/reports/v4-product-visual-parity/threejs-product-diff.png"
      ],
    }, null, 2));

    const report = createV4ExternalEvidenceHandoffReport(root);
    const runbook = readFileSync(join(root, "tests", "reports", "v4-external-evidence-handoff.md"), "utf8");

    expect(report.ok).toBe(true);
    expect(report.handoffFilesReady).toBe(true);
    expect(report.packagedFilesReady).toBe(true);
    expect(report.packageDir).toBe("release-artifacts/v4-external-evidence-handoff");
    expect(report.packageArchivePath).toBe("release-artifacts/v4-external-evidence-handoff.tar.gz");
    expect(report.packageArchiveSha256Path).toBe("release-artifacts/v4-external-evidence-handoff.tar.gz.sha256");
    expect(report.transferManifestPath).toBe("release-artifacts/v4-external-evidence-handoff.transfer.json");
    expect(report.packageManifestPath).toBe("release-artifacts/v4-external-evidence-handoff/manifest.json");
    expect(report.packageReadmePath).toBe("release-artifacts/v4-external-evidence-handoff/START_HERE.md");
    expect(report.packageStandaloneVerifyScriptPath).toBe("release-artifacts/v4-external-evidence-handoff/VERIFY_PACKAGE_INTEGRITY.mjs");
    expect(report.packageRestoreScriptPath).toBe("release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs");
    expect(report.packageExternalHostScriptPath).toBe("release-artifacts/v4-external-evidence-handoff/RUN_EXTERNAL_HOST_PREFLIGHT.mjs");
    expect(report.commands.localRefresh).toContain("pnpm verify:v4-external-evidence-handoff");
    expect(report.blockedArtifacts).toBe(28);
    expect(report.firstBlockedArtifact).toBe("unity:editor-cli-smoke");
    expect(report.firstMissingCapability).toBe("unity-editor-executable");
    expect(report.blockedArtifactChecklist).toEqual([expect.objectContaining({
      areaId: "unity-external-baselines",
      id: "unity:editor-cli-smoke",
      path: "tests/reports/v4-unity-editor-cli-smoke.json",
      localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
      requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
    })]);
    expect(report.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/RUNBOOK.md", exists: true, kind: "baseline-kit" }),
      expect.objectContaining({ path: "tests/reports/galileo-product.png", exists: true, kind: "galileo-reference" }),
      expect.objectContaining({ path: "tests/reports/v4-product-visual-parity.json", exists: true, kind: "local-evidence" }),
      expect.objectContaining({ path: "tests/reports/v4-product-visual-parity/threejs-product-diff.png", exists: true, kind: "local-evidence" }),
      expect.objectContaining({ path: "release-artifacts/external-demos/0.1.0-alpha.0/public-deployment-manifest.json", exists: true, kind: "static-export" }),
      expect.objectContaining({ path: "tests/reports/v4-external-host-doctor.json", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "tests/reports/v4-external-host-runner.json", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "tests/reports/v4-github-external-readiness.json", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "docs/project/v4-parity-execution-prompt.md", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "release-artifacts/v4-external-evidence-operator-runbook.md", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "release-artifacts/v4-parity-external-evidence-pr.md", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "release-artifacts/codingrelated-completion-audit.md", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "release-artifacts/v4-parity-external-evidence-workflows.patch", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "release-artifacts/v4-current-handoff-supplement.patch", exists: true, kind: "runbook" }),
      expect.objectContaining({ path: "package.json", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "packages/assets/src/AssetImportPreflight.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "packages/assets/src/OBJLoader.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "examples/portfolio/main.ts", exists: true, kind: "local-evidence" }),
      expect.objectContaining({ path: "examples/portfolio/README.md", exists: true, kind: "local-evidence" }),
      expect.objectContaining({ path: "tests/browser/example-portfolio.spec.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tests/browser/example-screenshot-audit-v4.spec.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tests/unit/assets/asset-import-preflight.test.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tests/unit/tools/v4-validation.test.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/external-demo-export/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/external-demo-validation/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-examples/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-claim-gates/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-assets/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-current-capability/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-reporting/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-parity-status/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-local-port-status/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-external-host-runner/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-github-external-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-external-engine-baselines/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-report-freshness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-pbr-reference-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-shadow-map-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-hdr-render-target-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-production-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-pbr-gltf-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-ecosystem-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-broad-parity-readiness/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-completion-audit/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-product-visual-parity/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-product-visual-parity/productScene.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-pbr-visual-parity/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-shadow-visual-parity/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-hdr-visual-parity/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-postprocess-suite/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/v4-unity-unreal-parity/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/static-demo-server-smoke/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/package-provenance/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: "tools/compare-engines/index.ts", exists: true, kind: "tooling" }),
      expect.objectContaining({ path: ".github/workflows/v4-public-demo-deploy.yml", exists: true, kind: "workflow" }),
    ]));
    expect(report.packagedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "fixtures/external-engine-baselines/v4/RUNBOOK.md",
        packagePath: "release-artifacts/v4-external-evidence-handoff/fixtures/external-engine-baselines/v4/RUNBOOK.md",
        copied: true,
      }),
      expect.objectContaining({
        path: "release-artifacts/external-demos/0.1.0-alpha.0/public-deployment-manifest.json",
        packagePath: "release-artifacts/v4-external-evidence-handoff/release-artifacts/external-demos/0.1.0-alpha.0/public-deployment-manifest.json",
        copied: true,
      }),
      expect.objectContaining({
        path: "tests/reports/v4-product-visual-parity/threejs-product-diff.png",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tests/reports/v4-product-visual-parity/threejs-product-diff.png",
        copied: true,
      }),
      expect.objectContaining({
        path: "tests/reports/v4-external-host-runner.json",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tests/reports/v4-external-host-runner.json",
        copied: true,
      }),
      expect.objectContaining({
        path: "docs/project/v4-parity-execution-prompt.md",
        packagePath: "release-artifacts/v4-external-evidence-handoff/docs/project/v4-parity-execution-prompt.md",
        copied: true,
      }),
      expect.objectContaining({
        path: "release-artifacts/v4-current-handoff-supplement.patch",
        packagePath: "release-artifacts/v4-external-evidence-handoff/release-artifacts/v4-current-handoff-supplement.patch",
        copied: true,
      }),
      expect.objectContaining({
        path: "tests/unit/tools/v4-validation.test.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tests/unit/tools/v4-validation.test.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-production-readiness/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-production-readiness/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-broad-parity-readiness/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-broad-parity-readiness/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-completion-audit/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-completion-audit/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-parity-status/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-parity-status/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-local-port-status/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-local-port-status/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-external-engine-baselines/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-external-engine-baselines/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-report-freshness/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-report-freshness/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-product-visual-parity/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-product-visual-parity/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-product-visual-parity/productScene.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-product-visual-parity/productScene.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-pbr-visual-parity/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-pbr-visual-parity/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-shadow-visual-parity/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-shadow-visual-parity/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-hdr-visual-parity/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-hdr-visual-parity/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-postprocess-suite/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-postprocess-suite/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/v4-unity-unreal-parity/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/v4-unity-unreal-parity/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/static-demo-server-smoke/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/static-demo-server-smoke/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/package-provenance/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/package-provenance/index.ts",
        copied: true,
      }),
      expect.objectContaining({
        path: "tools/compare-engines/index.ts",
        packagePath: "release-artifacts/v4-external-evidence-handoff/tools/compare-engines/index.ts",
        copied: true,
      }),
    ]));
    expect(report.commands.unityHost).toContain("node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project");
    expect(report.commands.ingestAndFinalAudit).toContain("pnpm status:v4-parity");
    const verified = verifyAndRecordV4ExternalEvidenceHandoffPackage(root);
    expect(verified).toMatchObject({
      ok: true,
      verificationScope: {
        packageInternalEntries: true,
        archiveAndSidecar: true,
        externalParityEvidence: false,
      },
      packageManifestPath: "release-artifacts/v4-external-evidence-handoff/manifest.json",
      packageArchivePath: "release-artifacts/v4-external-evidence-handoff.tar.gz",
      packageArchiveSha256Path: "release-artifacts/v4-external-evidence-handoff.tar.gz.sha256",
      transferManifestPath: "release-artifacts/v4-external-evidence-handoff.transfer.json",
      violations: [],
    });
    const recordedReport = JSON.parse(readFileSync(join(root, "tests", "reports", "v4-external-evidence-handoff.json"), "utf8")) as {
      readonly packageVerification?: {
        readonly ok?: boolean;
        readonly verificationScope?: {
          readonly packageInternalEntries?: boolean;
          readonly archiveAndSidecar?: boolean;
          readonly externalParityEvidence?: boolean;
        };
        readonly checkedFiles?: number;
        readonly violations?: readonly string[];
      };
    };
    expect(recordedReport.packageVerification).toMatchObject({
      ok: true,
      verificationScope: {
        packageInternalEntries: true,
        archiveAndSidecar: true,
        externalParityEvidence: false,
      },
      checkedFiles: verified.checkedFiles,
      violations: [],
    });
    const recordedTransferManifest = JSON.parse(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff.transfer.json"), "utf8")) as {
      readonly packageVerification?: {
        readonly ok?: boolean;
        readonly verificationScope?: {
          readonly packageInternalEntries?: boolean;
          readonly archiveAndSidecar?: boolean;
          readonly externalParityEvidence?: boolean;
        };
        readonly checkedFiles?: number;
        readonly violations?: readonly string[];
      };
    };
    expect(recordedTransferManifest.packageVerification).toMatchObject({
      ok: true,
      verificationScope: {
        packageInternalEntries: true,
        archiveAndSidecar: true,
        externalParityEvidence: false,
      },
      checkedFiles: verified.checkedFiles,
      violations: [],
    });
    const packageReadme = readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8");
    expect(packageReadme).toContain("Patch-only transfers must copy the patch files into `release-artifacts/` before applying them.");
    expect(packageReadme).toContain("does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout");
    const operatorRunbook = readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-external-evidence-operator-runbook.md"), "utf8");
    expect(operatorRunbook).toContain("mkdir -p release-artifacts");
    expect(operatorRunbook).toContain("cp /path/to/v4-external-evidence-handoff/release-artifacts/v4-current-handoff-supplement.patch release-artifacts/");
    expect(operatorRunbook).toContain("Patch-only transfers must copy the patch files into `release-artifacts/` before applying them.");
    expect(operatorRunbook).toContain("does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout");
    const packagedPrBody = readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-parity-external-evidence-pr.md"), "utf8");
    expect(packagedPrBody).toContain("Patch-only transfers must copy the patch files into `release-artifacts/` before applying them.");
    expect(packagedPrBody).toContain("does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout");
    const restoreScript = readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RESTORE_INTO_CHECKOUT.mjs"), "utf8");
    expect(restoreScript).toContain("VERIFY_PACKAGE_INTEGRITY.mjs");
    expect(restoreScript).toContain("Cannot restore because the handoff package failed integrity verification.");
    expect(restoreScript).toContain("\"tools/v4-reporting\"");
    expect(restoreScript).toContain("\"tools/v4-parity-status\"");
    expect(restoreScript).toContain("\"tools/v4-local-port-status\"");
    expect(restoreScript).toContain("\"tools/v4-github-external-readiness\"");
    expect(restoreScript).toContain("\"tools/v4-external-engine-baselines\"");
    expect(restoreScript).toContain("\"tools/v4-product-visual-parity\"");
    expect(restoreScript).toContain("\"tools/v4-postprocess-suite\"");
    expect(restoreScript).toContain("\"tools/compare-engines\"");
    expect(restoreScript).toContain("\"pnpm status:v4-local-port\"");
    const runnerReportPath = join(root, "tests", "reports", "v4-external-host-runner.json");
    const dryRunRunner = JSON.parse(readFileSync(runnerReportPath, "utf8")) as Record<string, unknown>;
    writeFileSync(runnerReportPath, JSON.stringify({
      ...dryRunRunner,
      execute: true,
      command: "pnpm run:v4-external-host-evidence:execute",
      claimBoundary: "synthetic execute marker that must not be overwritten by handoff packaging",
    }, null, 2));
    createV4ExternalEvidenceHandoffReport(root);
    expect(JSON.parse(readFileSync(runnerReportPath, "utf8"))).toMatchObject({
      execute: true,
      command: "pnpm run:v4-external-host-evidence:execute",
      claimBoundary: "synthetic execute marker that must not be overwritten by handoff packaging",
    });
    const previousUnity = process.env.G3D_UNITY_EDITOR;
    const previousUnreal = process.env.G3D_UNREAL_EDITOR;
    const previousSmokeOptIn = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
    const previousPublicUrl = process.env.G3D_PUBLIC_DEMO_URL;
    try {
      delete process.env.G3D_UNITY_EDITOR;
      delete process.env.G3D_UNREAL_EDITOR;
      delete process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
      delete process.env.G3D_PUBLIC_DEMO_URL;
      const blockedDoctor = createV4ExternalHostDoctorReport(root);
      expect(blockedDoctor).toMatchObject({
        ok: true,
        externalHostReady: false,
        handoffPackageReady: true,
        externalEvidenceReady: false,
        firstMissingCapability: "unity-editor-executable",
        firstBlockedArtifact: "unity:editor-cli-smoke",
        firstBlockedArtifactDetails: {
          areaId: "unity-external-baselines",
          id: "unity:editor-cli-smoke",
          kind: "editor-cli-smoke",
          path: "tests/reports/v4-unity-editor-cli-smoke.json",
          command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
          localEvidence: ["unity CLI smoke command and target report path are prepared locally."],
          requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
          blockers: ["tests/reports/v4-unity-editor-cli-smoke.json is missing or does not contain ok=true for engine=\"unity\""],
        },
        missingArtifactRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md",
        externalReadinessSummary: {
          firstBlockedArea: "unity-external-baselines",
          firstBlockedArtifact: "unity:editor-cli-smoke",
          blockedArtifacts: 28,
        },
        reportPath: "tests/reports/v4-external-host-doctor.json",
      });
      expect(blockedDoctor.nextCommands).toEqual(expect.arrayContaining([
        "export G3D_UNITY_EDITOR=/absolute/path/to/Unity",
        "export G3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd",
        "export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true",
        "export G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/",
        "pnpm doctor:v4-external-host",
        "pnpm run:v4-external-host-evidence",
      ]));
      const blockedRunner = createV4ExternalHostRunnerReport(root);
      expect(blockedRunner).toMatchObject({
        ok: true,
        execute: false,
        readyToExecute: false,
        firstMissingCapability: "unity-editor-executable",
        externalEvidenceReady: false,
        firstBlockedArtifact: "unity:editor-cli-smoke",
        firstBlockedArtifactDetails: {
          id: "unity:editor-cli-smoke",
          command: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        },
        missingArtifactRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md",
        externalReadinessSummary: {
          firstBlockedArea: "unity-external-baselines",
          firstBlockedArtifact: "unity:editor-cli-smoke",
          blockedArtifacts: 28,
        },
        reportPath: "tests/reports/v4-external-host-runner.json",
      });
      expect(blockedRunner.commands.map((command) => command.id)).toEqual([
        "external-host-doctor",
        "unity-editor-cli-smoke",
        "unity-baseline-captures",
        "unreal-editor-cli-smoke",
        "unreal-baseline-captures",
        "public-demo-deployment-smoke",
        "refresh-readiness-reports",
        "final-parity-status",
        "final-parity-preflight",
      ]);
      expect(blockedRunner.results.every((result) => result.skipped)).toBe(true);
      expect(blockedRunner.commands).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "unity-baseline-captures",
          expectedEvidencePaths: expect.arrayContaining([
            "tests/reports/v4-unity-product-visual-baseline.json",
            "tests/reports/v4-unity-postprocess-suite-baseline.json",
          ]),
          validationCommands: expect.arrayContaining([
            "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity",
            "pnpm verify:v4-external-baseline-reports",
          ]),
        }),
        expect.objectContaining({
          id: "public-demo-deployment-smoke",
          expectedEvidencePaths: expect.arrayContaining([
            "tests/reports/public-demo-deployment-smoke.json",
            "tests/reports/public-demo-deployment-runbook.md",
          ]),
        }),
      ]));
      expect(blockedRunner.sourceFileHashes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "package.json" }),
        expect.objectContaining({ path: "tools/v4-external-host-runner/index.ts" }),
        expect.objectContaining({ path: "tools/v4-external-host-doctor/index.ts" }),
      ]));
      writeFileSync(join(root, "Unity"), "#!/bin/sh\n");
      writeFileSync(join(root, "UnrealEditor-Cmd"), "#!/bin/sh\n");
      process.env.G3D_UNITY_EDITOR = join(root, "Unity");
      process.env.G3D_UNREAL_EDITOR = join(root, "UnrealEditor-Cmd");
      process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE = "true";
      process.env.G3D_PUBLIC_DEMO_URL = "https://demo.galileo3d.example-host.com/";
      const readyDoctor = createV4ExternalHostDoctorReport(root);
      expect(readyDoctor).toMatchObject({
        ok: true,
        externalHostReady: true,
        handoffPackageReady: true,
        externalEvidenceReady: false,
        firstMissingCapability: undefined,
        firstBlockedArtifact: "unity:editor-cli-smoke",
      });
      expect(readyDoctor.nextCommands).toEqual(expect.arrayContaining([
        "node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project",
        "node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject",
        "pnpm run:v4-external-host-evidence:execute",
        "pnpm preflight:v4-parity:after-external-evidence",
      ]));
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-doctor.json"), "utf8")).toContain("\"externalHostReady\": true");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-doctor.json"), "utf8")).toContain("\"externalEvidenceReady\": false");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-doctor.json"), "utf8")).toContain("\"firstBlockedArtifact\": \"unity:editor-cli-smoke\"");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-doctor.json"), "utf8")).toContain("\"firstBlockedArtifactDetails\"");
      const readyRunner = createV4ExternalHostRunnerReport(root);
      expect(readyRunner).toMatchObject({
        ok: true,
        execute: false,
        readyToExecute: true,
        externalEvidenceReady: false,
        firstBlockedArtifact: "unity:editor-cli-smoke",
        firstBlockedArtifactDetails: {
          id: "unity:editor-cli-smoke",
          requiredExternalEvidence: ["Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true."],
        },
        firstMissingCapability: undefined,
      });
      expect(readyRunner.commands).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "unity-editor-cli-smoke", command: ["node", "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs", "unity", "tests/reports/v4-unity-editor-cli-smoke.json"] }),
        expect.objectContaining({ id: "unity-baseline-captures", command: ["node", "fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs", "--project", ".tmp/v4-unity-baseline-project"] }),
        expect.objectContaining({ id: "unreal-editor-cli-smoke", command: ["node", "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs", "unreal", "tests/reports/v4-unreal-editor-cli-smoke.json"] }),
        expect.objectContaining({ id: "public-demo-deployment-smoke", command: ["pnpm", "verify:public-demo-deployment"] }),
        expect.objectContaining({ id: "final-parity-preflight", command: ["pnpm", "preflight:v4-parity:after-external-evidence"] }),
      ]));
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-runner.json"), "utf8")).toContain("\"readyToExecute\": true");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-runner.json"), "utf8")).toContain("\"expectedEvidencePaths\"");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-runner.json"), "utf8")).toContain("\"firstBlockedArtifact\": \"unity:editor-cli-smoke\"");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-runner.json"), "utf8")).toContain("\"firstBlockedArtifactDetails\"");
      expect(readFileSync(join(root, "tests", "reports", "v4-external-host-runner.json"), "utf8")).toContain("\"sourceFileHashes\"");
    } finally {
      restoreEnv("G3D_UNITY_EDITOR", previousUnity);
      restoreEnv("G3D_UNREAL_EDITOR", previousUnreal);
      restoreEnv("G3D_RUN_UNITY_UNREAL_CLI_SMOKE", previousSmokeOptIn);
      restoreEnv("G3D_PUBLIC_DEMO_URL", previousPublicUrl);
    }
    expect(verified.checkedFiles).toBeGreaterThan(report.packagedFiles.length);
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "manifest.json"), "utf8")).toContain("\"entryPoints\"");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff.tar.gz")).byteLength).toBeGreaterThan(1024);
    const archiveShaSidecar = readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff.tar.gz.sha256"), "utf8");
    expect(archiveShaSidecar).toContain("release-artifacts/v4-external-evidence-handoff.tar.gz");
    expect(archiveShaSidecar.trim().split(/\s+/u)[0]).toHaveLength(64);
    const transferManifest = JSON.parse(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff.transfer.json"), "utf8")) as {
      readonly schemaVersion?: string;
      readonly claimBoundary?: string;
      readonly packageDir?: string;
      readonly packageArchivePath?: string;
      readonly packageArchiveSha256Path?: string;
      readonly archiveBytes?: number;
      readonly archiveSha256?: string;
      readonly archive?: { readonly bytes?: number; readonly sha256?: string };
      readonly packageManifestPath?: string;
      readonly packageEntryPoints?: Record<string, string>;
      readonly transferCommands?: readonly string[];
    };
    expect(transferManifest.schemaVersion).toBe("g3d-v4-external-evidence-transfer-v1");
    expect(transferManifest.claimBoundary).toContain("not parity evidence");
    expect(transferManifest.packageDir).toBe("release-artifacts/v4-external-evidence-handoff");
    expect(transferManifest.packageArchivePath).toBe("release-artifacts/v4-external-evidence-handoff.tar.gz");
    expect(transferManifest.packageArchiveSha256Path).toBe("release-artifacts/v4-external-evidence-handoff.tar.gz.sha256");
    expect(transferManifest.packageManifestPath).toBe("release-artifacts/v4-external-evidence-handoff/manifest.json");
    expect(transferManifest.archiveBytes).toBeGreaterThan(1024);
    expect(transferManifest.archive?.bytes).toBe(transferManifest.archiveBytes);
    expect(transferManifest.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(transferManifest.archive?.sha256).toBe(transferManifest.archiveSha256);
    expect(transferManifest.packageEntryPoints).toMatchObject({
      standaloneVerify: "release-artifacts/v4-external-evidence-handoff/VERIFY_PACKAGE_INTEGRITY.mjs",
      restoreIntoCheckout: "release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs",
      externalHostPreflight: "release-artifacts/v4-external-evidence-handoff/RUN_EXTERNAL_HOST_PREFLIGHT.mjs",
    });
    expect(transferManifest.transferCommands).toEqual(expect.arrayContaining([
      "shasum -a 256 -c release-artifacts/v4-external-evidence-handoff.tar.gz.sha256",
      "tar -xzf release-artifacts/v4-external-evidence-handoff.tar.gz",
      "node VERIFY_PACKAGE_INTEGRITY.mjs",
      "node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D",
      "node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D",
      "pnpm run:v4-external-host-evidence:execute",
      "pnpm preflight:v4-parity:after-external-evidence",
      "pnpm status:v4-parity",
    ]));
    const restoreTarget = join(root, "restore-target");
    mkdirSync(restoreTarget, { recursive: true });
    writeFileSync(join(restoreTarget, "package.json"), JSON.stringify({ name: "@galileo3d/restore-target" }, null, 2));
    const restoreDryRun = JSON.parse(execFileSync(process.execPath, [
      join(root, "release-artifacts", "v4-external-evidence-handoff", "RESTORE_INTO_CHECKOUT.mjs"),
      "--dry-run",
      restoreTarget,
    ], { encoding: "utf8" })) as {
      readonly ok: boolean;
      readonly command: string;
      readonly dryRun: boolean;
      readonly restorePreflight: {
        readonly ok: boolean;
        readonly command: string;
        readonly checkedFiles: number;
        readonly verificationScope?: {
          readonly packageInternalEntries?: boolean;
          readonly archiveAndSidecar?: boolean;
          readonly externalParityEvidence?: boolean;
        };
      };
      readonly restored: readonly { readonly entry: string; readonly kind: string }[];
      readonly nextCommands: readonly string[];
    };
    expect(restoreDryRun).toMatchObject({
      ok: true,
      command: "RESTORE_INTO_CHECKOUT",
      dryRun: true,
      restorePreflight: {
        ok: true,
        command: "VERIFY_PACKAGE_INTEGRITY",
        verificationScope: {
          packageInternalEntries: true,
          archiveAndSidecar: false,
          externalParityEvidence: false,
        },
      },
    });
    expect(restoreDryRun.restorePreflight.checkedFiles).toBeGreaterThan(0);
    expect(restoreDryRun.restored).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: ".github", kind: "directory" }),
      expect.objectContaining({ entry: "docs", kind: "directory" }),
      expect.objectContaining({ entry: "fixtures", kind: "directory" }),
      expect.objectContaining({ entry: "docs/project/v4-parity-execution-prompt.md", kind: "file" }),
      expect.objectContaining({ entry: "examples/portfolio", kind: "directory" }),
      expect.objectContaining({ entry: "package.json", kind: "file" }),
      expect.objectContaining({ entry: "packages/assets/src/OBJLoader.ts", kind: "file" }),
      expect.objectContaining({ entry: "release-artifacts/external-demos", kind: "directory" }),
      expect.objectContaining({ entry: "release-artifacts/v4-external-evidence-operator-runbook.md", kind: "file" }),
      expect.objectContaining({ entry: "release-artifacts/v4-current-handoff-supplement.patch", kind: "file" }),
      expect.objectContaining({ entry: "tests/reports", kind: "directory" }),
      expect.objectContaining({ entry: "tests/browser/example-portfolio.spec.ts", kind: "file" }),
      expect.objectContaining({ entry: "tests/browser/example-screenshot-audit-v4.spec.ts", kind: "file" }),
      expect.objectContaining({ entry: "tests/unit/tools/v4-validation.test.ts", kind: "file" }),
      expect.objectContaining({ entry: "tools/v4-examples", kind: "directory" }),
      expect.objectContaining({ entry: "tools/v4-external-host-runner", kind: "directory" }),
      expect.objectContaining({ entry: "tools/v4-external-engine-baselines", kind: "directory" }),
      expect.objectContaining({ entry: "tools/v4-product-visual-parity", kind: "directory" }),
      expect.objectContaining({ entry: "tools/v4-postprocess-suite", kind: "directory" }),
      expect.objectContaining({ entry: "tools/compare-engines", kind: "directory" }),
    ]));
    expect(restoreDryRun.nextCommands).toEqual(expect.arrayContaining([
      "pnpm verify:v4-external-evidence-handoff",
      "pnpm doctor:v4-external-host",
      "pnpm run:v4-external-host-evidence",
      "pnpm run:v4-external-host-evidence:execute",
      "pnpm preflight:v4-parity:after-external-evidence",
    ]));
    const fakeBin = join(root, "fake-bin");
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@galileo3d/external-host-fixture" }, null, 2));
    const fakePnpm = join(fakeBin, "pnpm");
    writeFileSync(fakePnpm, "#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$G3D_FAKE_PNPM_LOG\"\nexit \"${G3D_FAKE_PNPM_EXIT:-0}\"\n");
    chmodSync(fakePnpm, 0o755);
    const externalHostScript = join(root, "release-artifacts", "v4-external-evidence-handoff", "RUN_EXTERNAL_HOST_PREFLIGHT.mjs");
    const fakePnpmLog = join(root, "fake-pnpm.log");
    const successPreflight = execFileSync(process.execPath, [externalHostScript, root], {
      encoding: "utf8",
      env: {
        ...process.env,
        G3D_FAKE_PNPM_EXIT: "0",
        G3D_FAKE_PNPM_LOG: fakePnpmLog,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    });
    expect(successPreflight).toContain("\"command\": \"RUN_EXTERNAL_HOST_PREFLIGHT\"");
    expect(successPreflight).toContain("\"ok\": true");
    expect(successPreflight).toContain("run-unity-baseline-captures.mjs");
    expect(JSON.parse(successPreflight)).toMatchObject({
      ok: true,
      command: "RUN_EXTERNAL_HOST_PREFLIGHT",
      doctorStatus: 0,
      doctorStdout: "",
      doctorStderr: "",
      doctorReportPath: "tests/reports/v4-external-host-doctor.json",
    });
    expect(readFileSync(fakePnpmLog, "utf8")).toContain("doctor:v4-external-host:strict");
    writeFileSync(join(root, "tests", "reports", "v4-external-host-doctor.json"), JSON.stringify({
      externalHostReady: false,
      handoffPackageReady: true,
      externalEvidenceReady: false,
      firstMissingCapability: "unity-editor-executable",
      firstBlockedArtifact: "unity:editor-cli-smoke",
      missingArtifactRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md",
    }, null, 2));
    const failedPreflight = spawnSync(process.execPath, [externalHostScript, root], {
      encoding: "utf8",
      env: {
        ...process.env,
        G3D_FAKE_PNPM_EXIT: "7",
        G3D_FAKE_PNPM_LOG: fakePnpmLog,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    });
    expect(failedPreflight.status).toBe(7);
    const failedPreflightJson = JSON.parse(failedPreflight.stdout) as {
      readonly ok: boolean;
      readonly doctorStatus: number;
      readonly doctorReportPath: string;
      readonly doctorSummary: {
        readonly firstMissingCapability?: string;
        readonly firstBlockedArtifact?: string;
      } | null;
      readonly reason: string;
    };
    expect(failedPreflightJson).toMatchObject({
      ok: false,
      doctorStatus: 7,
      doctorReportPath: "tests/reports/v4-external-host-doctor.json",
      reason: "External host doctor failed. Fix the missing Unity/Unreal/public deployment capabilities and rerun this command.",
    });
    expect(failedPreflightJson.doctorSummary).toMatchObject({
      firstMissingCapability: "unity-editor-executable",
      firstBlockedArtifact: "unity:editor-cli-smoke",
    });
    expect(failedPreflight.stderr).toBe("");
    const standaloneVerifyScript = join(root, "release-artifacts", "v4-external-evidence-handoff", "VERIFY_PACKAGE_INTEGRITY.mjs");
    const standaloneVerify = execFileSync(process.execPath, [standaloneVerifyScript], { encoding: "utf8" });
    expect(standaloneVerify).toContain("\"command\": \"VERIFY_PACKAGE_INTEGRITY\"");
    expect(standaloneVerify).toContain("\"ok\": true");
    expect(standaloneVerify).toContain("\"packageInternalEntries\": true");
    expect(standaloneVerify).toContain("\"archiveAndSidecar\": false");
    expect(standaloneVerify).toContain("\"externalParityEvidence\": false");
    const packagedBaselineRunbookPath = join(root, "release-artifacts", "v4-external-evidence-handoff", "fixtures", "external-engine-baselines", "v4", "RUNBOOK.md");
    const packagedBaselineRunbook = readFileSync(packagedBaselineRunbookPath, "utf8");
    writeFileSync(packagedBaselineRunbookPath, "corrupt\n");
    const corrupted = verifyV4ExternalEvidenceHandoffPackage(root);
    expect(corrupted.ok).toBe(false);
    expect(corrupted.violations.join("\n")).toContain("fixtures/external-engine-baselines/v4/RUNBOOK.md: packaged");
    const standaloneCorrupted = spawnSync(process.execPath, [standaloneVerifyScript], { encoding: "utf8" });
    expect(standaloneCorrupted.status).toBe(1);
    expect(`${standaloneCorrupted.stdout}\n${standaloneCorrupted.stderr}`).toContain("\"ok\": false");
    expect(`${standaloneCorrupted.stdout}\n${standaloneCorrupted.stderr}`).toContain("sha256");
    const refusedRestore = spawnSync(process.execPath, [
      join(root, "release-artifacts", "v4-external-evidence-handoff", "RESTORE_INTO_CHECKOUT.mjs"),
      "--dry-run",
      join(root, "restore-target"),
    ], { encoding: "utf8" });
    expect(refusedRestore.status).toBe(1);
    expect(`${refusedRestore.stdout}\n${refusedRestore.stderr}`).toContain("Cannot restore because the handoff package failed integrity verification.");
    expect(`${refusedRestore.stdout}\n${refusedRestore.stderr}`).toContain("verifierResult");
    writeFileSync(packagedBaselineRunbookPath, packagedBaselineRunbook);
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "manifest.json"), "utf8")).toContain("g3d-v4-external-evidence-handoff-package-v1");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("V4 External Evidence Handoff Package");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("## First Blocked Artifact");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("Artifact: `unity-external-baselines/unity:editor-cli-smoke`");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("Prepared command: `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json`");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("unity CLI smoke command and target report path are prepared locally.");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("Run the unity editor CLI smoke against a real Unity editor executable");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("release-artifacts/v4-external-evidence-handoff.tar.gz");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("## Transfer Manifest Verification");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("release-artifacts/v4-external-evidence-handoff.transfer.json.packageVerification");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("checks package-internal files only");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("does not check the outer archive checksum");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("pnpm verify:v4-external-evidence-handoff");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("node VERIFY_PACKAGE_INTEGRITY.mjs");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("pnpm doctor:v4-external-host:strict");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("pnpm run:v4-external-host-evidence");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("pnpm run:v4-external-host-evidence:execute");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("## GitHub Workflow Route");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).toContain("pnpm preflight:v4-parity:after-external-evidence");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "START_HERE.md"), "utf8")).not.toContain("rerun `pnpm preflight:v4-parity`");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RESTORE_INTO_CHECKOUT.mjs"), "utf8")).toContain("RESTORE_INTO_CHECKOUT");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RESTORE_INTO_CHECKOUT.mjs"), "utf8")).toContain("dryRun");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RUN_EXTERNAL_HOST_PREFLIGHT.mjs"), "utf8")).toContain("RUN_EXTERNAL_HOST_PREFLIGHT");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RUN_EXTERNAL_HOST_PREFLIGHT.mjs"), "utf8")).toContain("pnpm");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "RUN_EXTERNAL_HOST_PREFLIGHT.mjs"), "utf8")).toContain("doctor:v4-external-host:strict");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tests", "reports", "v4-external-evidence-handoff.json"), "utf8")).toContain("\"claimBoundary\"");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tests", "reports", "v4-external-evidence-handoff.md"), "utf8")).toContain("# V4 External Evidence Handoff");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "docs/project/v4-parity-execution-prompt.md"), "utf8")).toContain("Goal 12: Full glTF Parity");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "docs/project/v4-parity-execution-prompt.md"), "utf8")).toContain("Goal 13: Full WebGPU Parity");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-external-evidence-operator-runbook.md"), "utf8")).toContain("External Evidence Operator Runbook");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-external-evidence-operator-runbook.md"), "utf8")).toContain("Handoff integrity is now split by scope");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-external-evidence-operator-runbook.md"), "utf8")).toContain("\"restorePreflight\"");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-parity-external-evidence-pr.md"), "utf8")).toContain("V4 Parity Execution");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-parity-external-evidence-pr.md"), "utf8")).toContain("Repo-side handoff verification scope");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-parity-external-evidence-pr.md"), "utf8")).toContain("Standalone operator package verification also passed");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "codingrelated-completion-audit.md"), "utf8")).toContain("Codingrelated Completion Audit");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "codingrelated-completion-audit.md"), "utf8")).toContain("Standalone package verification scope");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "codingrelated-completion-audit.md"), "utf8")).toContain("current handoff set");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "codingrelated-completion-audit.md"), "utf8")).toContain("two-patch simulation against `HEAD^`");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-parity-external-evidence-workflows.patch"), "utf8")).toContain("docs/project/v4-parity-execution-prompt.md");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-current-handoff-supplement.patch"), "utf8")).toContain("tools/v4-external-evidence-handoff/index.ts");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tests", "unit", "tools", "v4-validation.test.ts"), "utf8")).toContain("createV4ExternalEvidenceHandoffReport");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tools", "v4-external-engine-baselines", "index.ts"), "utf8")).toContain("createV4ExternalEngineBaselineKit");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tools", "v4-product-visual-parity", "productScene.ts"), "utf8")).toContain("productVisualParityScene");
    expect(readFileSync(join(root, "release-artifacts", "v4-external-evidence-handoff", "tools", "compare-engines", "index.ts"), "utf8")).toContain("compare-engines");
    expect(readFileSync(join(root, "tests", "reports", "v4-external-evidence-handoff.json"), "utf8")).toContain("\"claimBoundary\"");
    expect(runbook).toContain("# V4 External Evidence Handoff");
    expect(runbook).toContain("Package directory: `release-artifacts/v4-external-evidence-handoff`");
    expect(runbook).toContain("Package archive: `release-artifacts/v4-external-evidence-handoff.tar.gz`");
    expect(runbook).toContain("Package archive checksum: `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`");
    expect(runbook).toContain("Transfer manifest: `release-artifacts/v4-external-evidence-handoff.transfer.json`");
    expect(runbook).toContain("Package readme: `release-artifacts/v4-external-evidence-handoff/START_HERE.md`");
    expect(runbook).toContain("Package standalone integrity script: `release-artifacts/v4-external-evidence-handoff/VERIFY_PACKAGE_INTEGRITY.mjs`");
    expect(runbook).toContain("Package restore script: `release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs`");
    expect(runbook).toContain("Package external-host preflight script: `release-artifacts/v4-external-evidence-handoff/RUN_EXTERNAL_HOST_PREFLIGHT.mjs`");
    expect(runbook).toContain("unity-external-baselines/unity:editor-cli-smoke");
    expect(runbook).toContain("pnpm run:v4-external-host-evidence");
    expect(runbook).toContain("pnpm preflight:v4-parity:after-external-evidence");

    const supplementPatchPath = join(root, "release-artifacts", "v4-external-evidence-handoff", "release-artifacts", "v4-current-handoff-supplement.patch");
    const supplementPatch = readFileSync(supplementPatchPath, "utf8");
    writeFileSync(supplementPatchPath, supplementPatch.replaceAll("restorePreflight", "staleRestorePreflight"));
    const staleSupplement = verifyV4ExternalEvidenceHandoffPackage(root);
    expect(staleSupplement.ok).toBe(false);
    expect(staleSupplement.violations.join("\n")).toContain("v4-current-handoff-supplement.patch is missing required marker: restorePreflight");
    writeFileSync(supplementPatchPath, supplementPatch);
    const restoredSupplement = verifyV4ExternalEvidenceHandoffPackage(root);
    expect(restoredSupplement.violations).toEqual([]);
    expect(restoredSupplement.ok).toBe(true);

    rmSync(join(root, "release-artifacts", "v4-parity-external-evidence-workflows.patch"), { force: true });
    rmSync(join(root, "release-artifacts", "v4-current-handoff-supplement.patch"), { force: true });
    const withoutOptionalPatches = createV4ExternalEvidenceHandoffReport(root);
    expect(withoutOptionalPatches.ok).toBe(true);
    expect(withoutOptionalPatches.files.map((file) => file.path)).not.toContain("release-artifacts/v4-parity-external-evidence-workflows.patch");
    expect(withoutOptionalPatches.files.map((file) => file.path)).not.toContain("release-artifacts/v4-current-handoff-supplement.patch");
    expect(verifyV4ExternalEvidenceHandoffPackage(root).ok).toBe(true);
  }, 20_000);

  it("resolves Unity and Unreal macOS app bundle env paths to editor executables", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    const unityApp = join(root, "Unity.app");
    const unrealApp = join(root, "UnrealEditor.app");
    mkdirSync(join(unityApp, "Contents", "MacOS"), { recursive: true });
    mkdirSync(join(unrealApp, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(unityApp, "Contents", "MacOS", "Unity"), "#!/bin/sh\n");
    writeFileSync(join(unrealApp, "Contents", "MacOS", "UnrealEditor"), "#!/bin/sh\n");
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      sceneSlots: []
    }, null, 2));

    const previousUnity = process.env.G3D_UNITY_EDITOR;
    const previousUnreal = process.env.G3D_UNREAL_EDITOR;
    const previousCliSmoke = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
    try {
      process.env.G3D_UNITY_EDITOR = unityApp;
      process.env.G3D_UNREAL_EDITOR = unrealApp;
      delete process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;

      const unityUnreal = createV4UnityUnrealParityReport(root);
      const externalEvidence = createV4ExternalEvidenceReadinessReport(root);

      expect(unityUnreal.externalEngineBaselines.unity.executable).toBe(join(unityApp, "Contents", "MacOS", "Unity"));
      expect(unityUnreal.externalEngineBaselines.unreal.executable).toBe(join(unrealApp, "Contents", "MacOS", "UnrealEditor"));
      expect(unityUnreal.externalEngineBaselines.unity.blockers.join("\n")).not.toContain("unity editor executable not found");
      expect(unityUnreal.externalEngineBaselines.unreal.blockers.join("\n")).not.toContain("unreal editor executable not found");
      expect(externalEvidence.areas.find((area) => area.id === "unity-external-baselines")?.blockers.join("\n")).not.toContain("G3D_UNITY_EDITOR is not set");
      expect(externalEvidence.areas.find((area) => area.id === "unreal-external-baselines")?.blockers.join("\n")).not.toContain("G3D_UNREAL_EDITOR is not set");
      expect(externalEvidence.localPreflight.unity.envExecutable).toBe(join(unityApp, "Contents", "MacOS", "Unity"));
      expect(externalEvidence.localPreflight.unreal.envExecutable).toBe(join(unrealApp, "Contents", "MacOS", "UnrealEditor"));
      expect(externalEvidence.localPreflight.unity.executableAvailable).toBe(true);
      expect(externalEvidence.localPreflight.unreal.executableAvailable).toBe(true);
      expect(externalEvidence.localPreflight.unity.blockers.join("\n")).not.toContain("executable");
      expect(externalEvidence.localPreflight.unreal.blockers.join("\n")).not.toContain("executable");
    } finally {
      if (previousUnity === undefined) {
        delete process.env.G3D_UNITY_EDITOR;
      } else {
        process.env.G3D_UNITY_EDITOR = previousUnity;
      }
      if (previousUnreal === undefined) {
        delete process.env.G3D_UNREAL_EDITOR;
      } else {
        process.env.G3D_UNREAL_EDITOR = previousUnreal;
      }
      if (previousCliSmoke === undefined) {
        delete process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
      } else {
        process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE = previousCliSmoke;
      }
    }
  }, 15_000);

  it("auto-discovers Unity and Unreal from configurable macOS search roots", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      sceneSlots: []
    }, null, 2));
    const unityRoot = join(root, "unity-root");
    const unrealRoot = join(root, "unreal-root");
    const unityExecutable = join(unityRoot, "Unity", "Hub", "Editor", "2026.1.0f1", "Unity.app", "Contents", "MacOS", "Unity");
    const unrealExecutable = join(unrealRoot, "Epic Games", "UE_6.0", "Engine", "Binaries", "Mac", "UnrealEditor-Cmd");
    mkdirSync(dirname(unityExecutable), { recursive: true });
    mkdirSync(dirname(unrealExecutable), { recursive: true });
    writeFileSync(unityExecutable, "#!/bin/sh\n");
    writeFileSync(unrealExecutable, "#!/bin/sh\n");

    const previousUnity = process.env.G3D_UNITY_EDITOR;
    const previousUnreal = process.env.G3D_UNREAL_EDITOR;
    const previousUnityRoots = process.env.G3D_UNITY_SEARCH_ROOTS;
    const previousUnrealRoots = process.env.G3D_UNREAL_SEARCH_ROOTS;
    const previousCliSmoke = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;
    try {
      delete process.env.G3D_UNITY_EDITOR;
      delete process.env.G3D_UNREAL_EDITOR;
      process.env.G3D_UNITY_SEARCH_ROOTS = unityRoot;
      process.env.G3D_UNREAL_SEARCH_ROOTS = unrealRoot;
      delete process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE;

      const unityUnreal = createV4UnityUnrealParityReport(root);
      const externalEvidence = createV4ExternalEvidenceReadinessReport(root);

      expect(unityUnreal.externalEngineBaselines.unity.executable).toBe(unityExecutable);
      expect(unityUnreal.externalEngineBaselines.unreal.executable).toBe(unrealExecutable);
      expect(externalEvidence.localPreflight.unity.autoDiscoveredExecutable).toBe(unityExecutable);
      expect(externalEvidence.localPreflight.unreal.autoDiscoveredExecutable).toBe(unrealExecutable);
      expect(externalEvidence.localPreflight.unity.searchRoots).toEqual(expect.arrayContaining([unityRoot]));
      expect(externalEvidence.localPreflight.unreal.searchRoots).toEqual(expect.arrayContaining([unrealRoot]));
      expect(externalEvidence.localPreflight.unity.searchRootsEnvName).toBe("G3D_UNITY_SEARCH_ROOTS");
      expect(externalEvidence.localPreflight.unreal.searchRootsEnvName).toBe("G3D_UNREAL_SEARCH_ROOTS");
      expect(externalEvidence.localPreflight.unity.executableAvailable).toBe(true);
      expect(externalEvidence.localPreflight.unreal.executableAvailable).toBe(true);
      const runbook = readFileSync(join(root, "tests", "reports", "v4-external-evidence-missing-artifacts.md"), "utf8");
      expect(runbook).toContain("Unity search roots env: `G3D_UNITY_SEARCH_ROOTS`");
      expect(runbook).toContain("Unreal search roots env: `G3D_UNREAL_SEARCH_ROOTS`");
      expect(runbook).toContain(unityRoot);
      expect(runbook).toContain(unrealRoot);
    } finally {
      restoreEnv("G3D_UNITY_EDITOR", previousUnity);
      restoreEnv("G3D_UNREAL_EDITOR", previousUnreal);
      restoreEnv("G3D_UNITY_SEARCH_ROOTS", previousUnityRoots);
      restoreEnv("G3D_UNREAL_SEARCH_ROOTS", previousUnrealRoots);
      restoreEnv("G3D_RUN_UNITY_UNREAL_CLI_SMOKE", previousCliSmoke);
    }
  }, 15_000);

  it("does not count ok-only external scene reports as ready without runner sidecar evidence", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      sceneSlots: [{
        baselineKind: "pbr-visual",
        targetReports: {
          unity: "tests/reports/v4-unity-pbr-visual-baseline.json"
        }
      }],
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-unity-pbr-visual-baseline.json"), JSON.stringify({
      ok: true,
      engine: "unity",
      baselineKind: "pbr-visual",
      sameSceneExternalBaseline: true,
      sceneDescriptorId: "v4-pbr-visual-parity-scene",
      sceneDescriptorVersion: "v4-pbr-visual-parity-scene-v1",
      screenshotPath: "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png",
      metrics: {
        width: 960,
        height: 540,
        nonBlankPixels: 518_400,
        colorBuckets: 64,
        drawCalls: 12,
        materialCount: 11,
        featureCount: 11
      }
    }, null, 2));

    const report = createV4ExternalEvidenceReadinessReport(root);
    const unityArea = report.areas.find((area) => area.id === "unity-external-baselines");

    expect(unityArea?.ready).toBe(false);
    expect(unityArea?.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("lacks validated runner evidence sidecar")
    ]));
  }, 15_000);

  it("rejects Unity and Unreal baseline reports whose screenshots do not contain required pixel evidence", () => {
    const root = fixtureRoot();
    const descriptorPath = "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json";
    const screenshotPath = "tests/reports/v4-product-visual-parity/unity-product-baseline.png";
    mkdirSync(join(root, "fixtures", "external-engine-baselines", "v4"), { recursive: true });
    mkdirSync(join(root, "tests", "reports", "v4-product-visual-parity"), { recursive: true });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, descriptorPath), JSON.stringify({
      schemaVersion: "v4-product-visual-parity-scene-v1",
      minimumEvidence: {
        width: 720,
        height: 480,
        nonBlankPixels: 10_001,
        colorBuckets: 2,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18
      }
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      kitRoot: "fixtures/external-engine-baselines/v4",
      sceneSlots: [{
        id: "v4-deterministic-product-visual-parity",
        baselineKind: "product-visual",
        descriptorPath,
        targetReports: {
          unity: "tests/reports/v4-unity-product-visual-baseline.json",
          unreal: "tests/reports/v4-unreal-product-visual-baseline.json"
        }
      }]
    }, null, 2));
    writeFileSync(join(root, screenshotPath), rgbaPng(720, 480, [0, 0, 0, 255]));
    writeFileSync(join(root, "tests", "reports", "v4-unity-product-visual-baseline.json"), JSON.stringify({
      ok: true,
      engine: "unity",
      baselineKind: "product-visual",
      sameSceneExternalBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      metrics: {
        width: 720,
        height: 480,
        nonBlankPixels: 345_600,
        colorBuckets: 12,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18
      }
    }, null, 2));

    const report = createV4UnityUnrealParityReport(root);
    const unityProduct = report.externalEngineBaselines.unity.sceneBaselines.find((baseline) => baseline.baselineKind === "product-visual");

    expect(unityProduct).toMatchObject({
      present: true,
      ok: false,
      screenshot: {
        ok: false,
        width: 720,
        height: 480,
        nonBlankPixels: 0,
        colorBuckets: 0
      }
    });
    expect(unityProduct?.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("screenshot validation failed: external baseline screenshot failed pixel validation")
    ]));
  });

  it("rejects product visual baselines that self-report good Unity metrics with a flat screenshot", () => {
    const root = fixtureRoot();
    const screenshotPath = "tests/reports/v4-product-visual-parity/unity-product-baseline.png";
    mkdirSync(join(root, "tests", "reports", "v4-product-visual-parity"), { recursive: true });
    writeFileSync(join(root, screenshotPath), rgbaPng(720, 480, [0, 0, 0, 255]));

    const validation = validateExternalProductVisualBaseline(root, {
      ok: true,
      engine: "unity",
      sameSceneProductBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      metrics: {
        width: 720,
        height: 480,
        nonBlankPixels: 345_600,
        colorBuckets: 12,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18
      }
    }, "unity");

    expect(validation).toMatchObject({
      present: true,
      ok: false,
      screenshot: {
        ok: false,
        width: 720,
        height: 480,
        nonBlankPixels: 0,
        colorBuckets: 0
      }
    });
    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("screenshot validation failed: external baseline screenshot failed pixel validation")
    ]));
  });

  it("rejects product visual baselines that omit ecommerce turntable workflow metrics", () => {
    const root = fixtureRoot();
    const screenshotPath = "tests/reports/v4-product-visual-parity/unity-product-baseline.png";
    mkdirSync(join(root, "tests", "reports", "v4-product-visual-parity"), { recursive: true });
    writeFileSync(join(root, screenshotPath), patternedPng(720, 480, "reference"));

    const validation = validateExternalProductVisualBaseline(root, {
      ok: true,
      engine: "unity",
      sameSceneProductBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      metrics: {
        width: 720,
        height: 480,
        nonBlankPixels: 345_600,
        colorBuckets: 12,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18
      }
    }, "unity");

    expect(validation).toMatchObject({
      present: true,
      ok: false,
      screenshot: {
        ok: true,
        width: 720,
        height: 480
      }
    });
    expect(validation.screenshot?.nonBlankPixels ?? 0).toBeGreaterThan(10_000);
    expect(validation.violations).toEqual(expect.arrayContaining([
      "metrics.turntableHotspots must be at least 3",
      "metrics.captureViews must be at least 4",
      "metrics.batchTasks must be at least 4",
      "runner evidence validation failed: baseline report must include runnerEvidencePath"
    ]));
  });

  it("accepts product visual baselines only when runner sidecar evidence matches the report", () => {
    const root = fixtureRoot();
    const screenshotPath = "tests/reports/v4-product-visual-parity/unity-product-baseline.png";
    const runnerEvidencePath = `${screenshotPath}.evidence.json`;
    mkdirSync(join(root, "tests", "reports", "v4-product-visual-parity"), { recursive: true });
    writeFileSync(join(root, screenshotPath), patternedPng(720, 480, "reference"));
    writeRunnerEvidenceSidecar(root, screenshotPath, {
      engine: "unity",
      baselineKind: "product-visual",
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      metrics: {
        width: 720,
        height: 480,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4
      }
    });
    const runnerEvidence = JSON.parse(readFileSync(join(root, runnerEvidencePath), "utf8"));
    const runnerEvidenceSha256 = createHash("sha256").update(readFileSync(join(root, runnerEvidencePath), "utf8")).digest("hex");

    const missingSidecar = validateExternalProductVisualBaseline(root, {
      ok: true,
      engine: "unity",
      sameSceneProductBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      screenshotSha256: createHash("sha256").update(readFileSync(join(root, screenshotPath))).digest("hex"),
      metrics: {
        width: 720,
        height: 480,
        nonBlankPixels: 345_600,
        colorBuckets: 12,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4
      }
    }, "unity");
    expect(missingSidecar.ok).toBe(false);
    expect(missingSidecar.runnerEvidence).toMatchObject({
      ok: false,
      violations: ["baseline report must include runnerEvidencePath"]
    });

    const valid = validateExternalProductVisualBaseline(root, {
      ok: true,
      engine: "unity",
      sameSceneProductBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      screenshotSha256: createHash("sha256").update(readFileSync(join(root, screenshotPath))).digest("hex"),
      runnerEvidencePath,
      runnerEvidenceSha256,
      runnerEvidence,
      metrics: {
        width: 720,
        height: 480,
        nonBlankPixels: 345_600,
        colorBuckets: 12,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4
      }
    }, "unity");

    expect(valid.runnerEvidence).toMatchObject({
      ok: true,
      path: runnerEvidencePath,
      sha256: runnerEvidenceSha256,
      violations: []
    });
    expect(valid.violations).not.toEqual(expect.arrayContaining([
      expect.stringContaining("runner evidence validation failed")
    ]));
  });

  it("rejects external scene baselines whose screenshots pass pixel checks but fail real Galileo diff", () => {
    const root = fixtureRoot();
    const descriptorPath = "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json";
    const galileoPath = "tests/reports/v4-pbr-visual-parity/galileo-pbr.png";
    const screenshotPath = "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png";
    mkdirSync(join(root, "fixtures", "external-engine-baselines", "v4"), { recursive: true });
    mkdirSync(join(root, "tests", "reports", "v4-pbr-visual-parity"), { recursive: true });
    mkdirSync(join(root, "tests", "reports", "v4-pbr-visual"), { recursive: true });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, descriptorPath), JSON.stringify({
      schemaVersion: "v4-pbr-visual-parity-scene-v1",
      id: "v4-pbr-visual-parity-scene",
      baselineKind: "pbr-visual",
      minimumEvidence: {
        width: 960,
        height: 540,
        nonBlankPixels: 30_001,
        colorBuckets: 7,
        drawCalls: 12,
        materialCount: 11,
        featureCount: 11
      }
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-external-engine-baselines.json"), JSON.stringify({
      ok: true,
      kitRoot: "fixtures/external-engine-baselines/v4",
      sceneSlots: [{
        id: "v4-pbr-visual-parity-scene",
        baselineKind: "pbr-visual",
        descriptorPath,
        targetReports: {
          unity: "tests/reports/v4-unity-pbr-visual-baseline.json"
        }
      }]
    }, null, 2));
    writeFileSync(join(root, galileoPath), patternedPng(960, 540, "reference"));
    writeFileSync(join(root, screenshotPath), patternedPng(960, 540, "inverted"));
    writeFileSync(join(root, "tests", "reports", "v4-unity-pbr-visual-baseline.json"), JSON.stringify({
      ok: true,
      engine: "unity",
      baselineKind: "pbr-visual",
      sameSceneExternalBaseline: true,
      sceneDescriptorId: "v4-pbr-visual-parity-scene",
      sceneDescriptorVersion: "v4-pbr-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      screenshotPath,
      metrics: {
        width: 960,
        height: 540,
        nonBlankPixels: 518_400,
        colorBuckets: 64,
        drawCalls: 12,
        materialCount: 11,
        featureCount: 11
      }
    }, null, 2));

    const report = createV4UnityUnrealParityReport(root);
    const unityPbr = report.externalEngineBaselines.unity.sceneBaselines.find((baseline) => baseline.baselineKind === "pbr-visual");

    expect(unityPbr).toMatchObject({
      present: true,
      ok: false,
      screenshot: {
        ok: true,
        width: 960,
        height: 540
      },
      diffAgainstGalileo: {
        pass: false,
        baselinePath: galileoPath,
        comparedPath: screenshotPath
      }
    });
    expect(unityPbr?.violations).toEqual(expect.arrayContaining([
      "runner evidence validation failed: baseline report must include runnerEvidencePath",
      expect.stringContaining("external screenshot diff failed against current Galileo pbr-visual render")
    ]));
  }, 15_000);

  it("packages external baseline report writer and current Galileo reference screenshots", () => {
    const root = fixtureRoot();
    const references = [
      ["tests/reports/v4-product-visual-parity/galileo-product.png", 720, 480],
      ["tests/reports/v4-pbr-visual-parity/galileo-pbr.png", 960, 540],
      ["tests/reports/v4-shadow-visual-parity/galileo-shadow.png", 720, 480],
      ["tests/reports/v4-hdr-visual-parity/galileo-hdr.png", 720, 420],
      ["tests/reports/comparison-screenshots/galileo-postprocess.png", 960, 540],
    ] as const;
    for (const [path, width, height] of references) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), patternedPng(width, height, "reference"));
    }
    writeRunnerEvidenceSidecar(root, "tests/reports/v4-product-visual-parity/galileo-product.png", {
      engine: "unity",
      baselineKind: "product-visual",
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      metrics: {
        width: 720,
        height: 480,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4
      }
    });
    const unityProductScreenshotPath = "tests/reports/v4-product-visual/unity-product-visual-baseline.png";
    mkdirSync(join(root, "tests", "reports", "v4-product-visual"), { recursive: true });
    writeFileSync(join(root, unityProductScreenshotPath), patternedPng(720, 480, "reference"));
    writeRunnerEvidenceSidecar(root, unityProductScreenshotPath, {
      engine: "unity",
      baselineKind: "product-visual",
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      metrics: {
        width: 720,
        height: 480,
        drawCalls: 18,
        materialCount: 7,
        productParts: 18,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4
      }
    });
    const unityProductEvidencePath = `${unityProductScreenshotPath}.evidence.json`;
    const unityProductEvidence = JSON.parse(readFileSync(join(root, unityProductEvidencePath), "utf8"));
    writeFileSync(join(root, unityProductEvidencePath), JSON.stringify({
      ...unityProductEvidence,
      screenshotPath: join(root, unityProductScreenshotPath)
    }, null, 2));

    const kit = createV4ExternalEngineBaselineKit(root);
    const writerPath = join(root, "fixtures", "external-engine-baselines", "v4", "write-baseline-report.mjs");
    const verifierPath = join(root, "fixtures", "external-engine-baselines", "v4", "verify-baseline-reports.mjs");
    const generatedReportPath = "tests/reports/v4-unity-product-visual-baseline.json";
    expectNodeCommandFailure(root, [
      writerPath,
      "unity",
      "pbr-visual",
      "tests/reports/v4-pbr-visual-parity/galileo-pbr.png",
      "tests/reports/v4-unity-pbr-visual-baseline-missing-evidence.json",
    ], /Missing external runner evidence sidecar/);
    writeRunnerEvidenceSidecar(root, "tests/reports/v4-pbr-visual-parity/galileo-pbr.png", {
      engine: "unity",
      baselineKind: "pbr-visual",
      sceneDescriptorId: "v4-pbr-visual-parity-scene",
      sceneDescriptorVersion: "v4-pbr-visual-parity-scene-v1",
      metrics: {
        width: 960,
        height: 540,
        drawCalls: 1,
        materialCount: 1,
        featureCount: 1
      }
    });
    expectNodeCommandFailure(root, [
      writerPath,
      "unity",
      "pbr-visual",
      "tests/reports/v4-pbr-visual-parity/galileo-pbr.png",
      "tests/reports/v4-unity-pbr-visual-baseline-weak-evidence.json",
    ], /runner evidence metrics\.drawCalls 1 < minimum 12/);
    execFileSync(process.execPath, [
      writerPath,
      "unity",
      "product-visual",
      unityProductScreenshotPath,
      generatedReportPath,
    ], { cwd: root });
    const verifierAllowMissing = JSON.parse(execFileSync(process.execPath, [
      verifierPath,
      "--engine",
      "unity",
      "--allow-missing",
    ], { cwd: root, encoding: "utf8" }));
    expectNodeCommandFailure(root, [
      verifierPath,
      "--engine",
      "unity",
    ], /missing target report/i);
    const generatedReport = JSON.parse(readFileSync(join(root, generatedReportPath), "utf8"));
    const baselineSchema = JSON.parse(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "baseline-report.schema.json"), "utf8"));
    const pbrDescriptor = JSON.parse(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "pbr-visual-parity-scene.json"), "utf8"));
    const shadowDescriptor = JSON.parse(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "shadow-visual-parity-scene.json"), "utf8"));
    const commandPlan = JSON.parse(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "external-baseline-command-plan.json"), "utf8"));
    const baselineRunbook = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "RUNBOOK.md"), "utf8");
    const unityBatchRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unity", "run-unity-baseline-captures.mjs"), "utf8");
    const unityRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unity", "V4ExternalVisualBaselineRunner.cs"), "utf8");
    const unityAssetImportRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unity", "V4ExternalAssetImportWorkflowRunner.cs"), "utf8");
    const unrealBatchRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "run-unreal-baseline-captures.mjs"), "utf8");
    const unrealRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "v4_external_visual_baseline_runner.py"), "utf8");
    const unrealAssetImportRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "v4_external_asset_import_workflow_runner.py"), "utf8");
    const unrealProductRunner = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "product_visual_parity_baseline.py"), "utf8");

    expect(kit.ok).toBe(true);
    expect(kit.galileoReferenceScreenshotsReady).toBe(true);
    expect(kit.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs", kind: "report-writer", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/write-baseline-report.mjs", kind: "report-writer", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", kind: "report-writer", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/unity/V4ExternalAssetImportWorkflowRunner.cs", kind: "unity-runner", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/unreal/v4_external_asset_import_workflow_runner.py", kind: "unreal-runner", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", kind: "report-writer", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs", kind: "report-writer", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/RUNBOOK.md", kind: "readme", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/external-baseline-command-plan.json", kind: "command-plan", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs", kind: "unity-batch-runner", ok: true }),
      expect.objectContaining({ path: "fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs", kind: "unreal-batch-runner", ok: true }),
    ]));
    expect(verifierAllowMissing).toMatchObject({
      ok: true,
      engine: "unity",
      selectedSlots: 5,
      validReports: 1,
      missingReports: 4,
      failedReports: 0,
    });
    expect(verifierAllowMissing.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        baselineKind: "product-visual",
        ok: true,
        runnerEvidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ]));
    expect(kit.baselineCommandPlanPath).toBe("fixtures/external-engine-baselines/v4/external-baseline-command-plan.json");
    expect(kit.baselineExecutionPlan.claimBoundary).toContain("real Unity and Unreal editor runs");
    expect(kit.baselineExecutionPlan.unity.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        baselineKind: "product-visual",
        descriptorPath: "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
        targetReportPath: "tests/reports/v4-unity-product-visual-baseline.json",
        reportCommand: expect.stringContaining("write-baseline-report.mjs unity product-visual"),
      }),
    ]));
    expect(kit.baselineExecutionPlan.unreal.steps).toHaveLength(5);
    expect(kit.sceneSlots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        baselineKind: "product-visual",
        galileoReferenceScreenshot: expect.objectContaining({
          path: "tests/reports/v4-product-visual-parity/galileo-product.png",
          ok: true,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
      expect.objectContaining({
        baselineKind: "postprocess-suite",
        galileoReferenceScreenshot: expect.objectContaining({ ok: true }),
      }),
    ]));
    expect(generatedReport).toMatchObject({
      ok: true,
      engine: "unity",
      baselineKind: "product-visual",
      sameSceneExternalBaseline: true,
      sameSceneProductBaseline: true,
      sceneDescriptorId: "v4-deterministic-product-visual-parity",
      sceneDescriptorVersion: "v4-product-visual-parity-scene-v1",
      visualDiffAgainstGalileo: true,
      runnerEvidencePath: "tests/reports/v4-product-visual/unity-product-visual-baseline.png.evidence.json",
      runnerEvidence: {
        ok: true,
        engine: "unity",
        baselineKind: "product-visual",
        screenshotPath: unityProductScreenshotPath,
        renderedFrameCaptured: true,
        cameraConfigured: true,
      },
      metrics: {
        width: 720,
        height: 480,
        productParts: 18,
        materialCount: 7,
        turntableHotspots: 3,
        captureViews: 4,
        batchTasks: 4,
      },
    });
    expect(generatedReport.screenshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(generatedReport.runnerEvidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(generatedReport.metrics.nonBlankPixels).toBeGreaterThan(10_000);
    expect(JSON.parse(readFileSync(join(root, unityProductEvidencePath), "utf8")).screenshotPath).toBe(unityProductScreenshotPath);
    expect(baselineSchema.allOf).toHaveLength(5);
    expect(baselineSchema.allOf).toEqual(expect.arrayContaining([
      expect.objectContaining({
        if: expect.objectContaining({ properties: expect.objectContaining({ baselineKind: { const: "product-visual" } }) }),
        then: expect.objectContaining({
          properties: expect.objectContaining({
            sceneDescriptorId: { const: "v4-deterministic-product-visual-parity" },
            sceneDescriptorVersion: { const: "v4-product-visual-parity-scene-v1" },
            sameSceneProductBaseline: { const: true },
            metrics: expect.objectContaining({
              required: expect.arrayContaining(["turntableHotspots", "captureViews", "batchTasks"]),
              properties: expect.objectContaining({
                width: { const: 720 },
                height: { const: 480 },
                nonBlankPixels: { type: "number", minimum: 10_001 },
                turntableHotspots: { type: "number", minimum: 3 },
                captureViews: { type: "number", minimum: 4 },
                batchTasks: { type: "number", minimum: 4 },
              }),
            }),
          }),
        }),
      }),
      expect.objectContaining({
        if: expect.objectContaining({ properties: expect.objectContaining({ baselineKind: { const: "pbr-visual" } }) }),
        then: expect.objectContaining({
          properties: expect.objectContaining({
            sceneDescriptorId: { const: "v4-pbr-visual-parity-scene" },
            metrics: expect.objectContaining({
              required: expect.arrayContaining(["materialCount", "featureCount"]),
              properties: expect.objectContaining({
                width: { const: 960 },
                height: { const: 540 },
                nonBlankPixels: { type: "number", minimum: 30_001 },
                featureCount: { type: "number", minimum: 11 },
              }),
            }),
          }),
        }),
      }),
      expect.objectContaining({
        if: expect.objectContaining({ properties: expect.objectContaining({ baselineKind: { const: "shadow-visual" } }) }),
        then: expect.objectContaining({
          properties: expect.objectContaining({
            metrics: expect.objectContaining({
              required: expect.arrayContaining(["shadowEvidencePixels"]),
              properties: expect.objectContaining({
                shadowEvidencePixels: { type: "number", minimum: 701 },
              }),
            }),
          }),
        }),
      }),
      expect.objectContaining({
        if: expect.objectContaining({ properties: expect.objectContaining({ baselineKind: { const: "hdr-render-target" } }) }),
        then: expect.objectContaining({
          properties: expect.objectContaining({
            metrics: expect.objectContaining({
              required: expect.arrayContaining(["toneMappedPatches"]),
              properties: expect.objectContaining({
                toneMappedPatches: { type: "number", minimum: 3 },
              }),
            }),
          }),
        }),
      }),
      expect.objectContaining({
        if: expect.objectContaining({ properties: expect.objectContaining({ baselineKind: { const: "postprocess-suite" } }) }),
        then: expect.objectContaining({
          properties: expect.objectContaining({
            metrics: expect.objectContaining({
              required: expect.arrayContaining(["implementedEffects", "realSceneEffects"]),
              properties: expect.objectContaining({
                implementedEffects: { type: "number", minimum: 14 },
                realSceneEffects: { type: "number", minimum: 14 },
              }),
            }),
          }),
        }),
      }),
    ]));
    expect(pbrDescriptor.parts).toHaveLength(11);
    expect(pbrDescriptor.materials).toHaveLength(11);
    expect(shadowDescriptor.parts).toHaveLength(5);
    expect(commandPlan).toMatchObject({
      schemaVersion: "g3d-v4-external-baseline-command-plan-v1",
      requiredEnvironment: {
        unityEditor: "G3D_UNITY_EDITOR",
        unitySearchRoots: "G3D_UNITY_SEARCH_ROOTS",
        unrealEditor: "G3D_UNREAL_EDITOR",
        unrealSearchRoots: "G3D_UNREAL_SEARCH_ROOTS",
        cliSmokeFlag: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
      },
      reportWriter: {
        cliSmokeCommandTemplate: expect.stringContaining("run-editor-cli-smoke.mjs"),
        commandTemplate: expect.stringContaining("write-baseline-report.mjs"),
        verifyCommandTemplate: expect.stringContaining("verify-baseline-reports.mjs"),
      },
    });
    expect(commandPlan.renderWorkflowBaselineReports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engine: "unity",
        cliSmokeReportPath: "tests/reports/v4-unity-editor-cli-smoke.json",
        cliSmokeCommand: expect.stringContaining("run-editor-cli-smoke.mjs unity"),
      }),
      expect.objectContaining({
        engine: "unreal",
        cliSmokeReportPath: "tests/reports/v4-unreal-editor-cli-smoke.json",
        cliSmokeCommand: expect.stringContaining("run-editor-cli-smoke.mjs unreal"),
      }),
    ]));
    expect(commandPlan.assetImportWorkflowReports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engine: "unity",
        runnerPath: "fixtures/external-engine-baselines/v4/unity/V4ExternalAssetImportWorkflowRunner.cs",
        targetReportPath: "tests/reports/v4-unity-asset-import-workflow.json",
      }),
      expect.objectContaining({
        engine: "unreal",
        runnerPath: "fixtures/external-engine-baselines/v4/unreal/v4_external_asset_import_workflow_runner.py",
        targetReportPath: "tests/reports/v4-unreal-asset-import-workflow.json",
      }),
    ]));
    expect(commandPlan.captures).toHaveLength(10);
    expect(commandPlan.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engine: "unity",
        baselineKind: "product-visual",
        expectedScreenshotPath: "tests/reports/v4-product-visual/unity-product-visual-baseline.png",
        targetReportPath: "tests/reports/v4-unity-product-visual-baseline.json",
        captureInstruction: expect.stringContaining("V4ExternalVisualBaselineRunner.CaptureFromCommandLine"),
        reportCommand: expect.stringContaining("write-baseline-report.mjs unity product-visual"),
      }),
      expect.objectContaining({
        engine: "unreal",
        baselineKind: "postprocess-suite",
        targetReportPath: "tests/reports/v4-unreal-postprocess-suite-baseline.json",
      }),
    ]));
    expect(commandPlan.blockedUntilAllCapturesPass).toContain("Unity/Unreal replacement language");
    expect(baselineRunbook).toContain("pnpm audit:v4-external-evidence-readiness");
    expect(baselineRunbook).toContain("V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor");
    expect(baselineRunbook).toContain("run-unity-baseline-captures.mjs --project /absolute/path/to/unity-project");
    expect(baselineRunbook).toContain("run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject");
    expect(baselineRunbook).toContain("ingest-external-baseline-artifacts.mjs");
    expect(baselineRunbook).toContain("only accepts artifact contents under `tests/reports/`");
    expect(baselineRunbook).toContain("tests/reports/v4-external-evidence-missing-artifacts.md");
    expect(baselineRunbook).toContain("artifactChecklist");
    expect(baselineRunbook).toContain("Blocked artifacts: 0");
    expect(baselineRunbook).toContain("pnpm audit:v4-completion");
    expect(baselineRunbook).toContain("G3D_UNITY_SEARCH_ROOTS");
    expect(baselineRunbook).toContain("G3D_UNREAL_SEARCH_ROOTS");
    expect(baselineRunbook).toContain(".github/workflows/v4-external-engine-baselines.yml");
    expect(baselineRunbook).toContain("self-hosted runners labeled `unity` and/or `unreal`");
    expect(unityRunner).toContain("JsonUtility.FromJson<BaselineSceneDescriptor>");
    expect(unityRunner).toContain("public static void CaptureFromCommandLine()");
    expect(unityRunner).toContain("CommandLineValue(\"--descriptor\")");
    expect(unityRunner).toContain("CaptureDescriptor(descriptor, resolvedKind, screenshotPath)");
    expect(unityRunner).toContain("foreach (var part in descriptor.parts)");
    expect(unityRunner).toContain("Path.GetDirectoryName(screenshotPath)");
    expect(unityRunner).not.toContain("Path.GetDirectoryName(ScreenshotPath)");
    expect(unityRunner).toContain("CaptureCameraPng(camera, targetWidth, targetHeight, screenshotPath)");
    expect(unityRunner).toContain("camera.Render()");
    expect(unityRunner).toContain("File.WriteAllBytes(screenshotPath, bytes)");
    expect(unityRunner).toContain("synchronously wrote a rendered camera PNG");
    expect(unityAssetImportRunner).toContain("V4ExternalAssetImportWorkflowRunner");
    expect(unityAssetImportRunner).toContain("AssetDatabase.ImportAsset");
    expect(unityAssetImportRunner).toContain("conversionRequiredFormats");
    expect(unityAssetImportRunner).toContain("This sidecar is valid only when produced by a real Unity editor import run");
    expect(unityRunner).not.toContain("ScreenCapture.CaptureScreenshot");
    expect(unityBatchRunner).toContain("V4ExternalVisualBaselineRunner.CaptureFromCommandLine");
    expect(unityBatchRunner).toContain("V4ExternalAssetImportWorkflowRunner.cs");
    expect(unityBatchRunner).toContain("V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine");
    expect(unityBatchRunner).toContain("write-asset-import-workflow-report.mjs");
    expect(unityBatchRunner).toContain("assetImportWorkflow.runnerEvidencePath");
    expect(unityBatchRunner).toContain("G3D_EXTERNAL_ASSET_IMPORT_SAMPLE");
    expect(unityBatchRunner).toContain("write-all-baseline-reports.mjs");
    expect(unityBatchRunner).toContain("write-render-workflow-report.mjs");
    const unityBatchDryRun = JSON.parse(execFileSync(process.execPath, [
      join(root, "fixtures", "external-engine-baselines", "v4", "unity", "run-unity-baseline-captures.mjs"),
      "--dry-run",
    ], { cwd: root, encoding: "utf8" })) as Record<string, unknown>;
    expect(unityBatchDryRun).toMatchObject({ ok: true, dryRun: true, unityCaptureCount: 5, assetImportWorkflowCount: 1 });
    expect(JSON.stringify(unityBatchDryRun)).toContain("V4ExternalVisualBaselineRunner.CaptureFromCommandLine");
    expect(JSON.stringify(unityBatchDryRun)).toContain("V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine");
    expect(JSON.stringify(unityBatchDryRun)).toContain("write-asset-import-workflow-report.mjs");
    expect(JSON.stringify(unityBatchDryRun)).toContain("tests/assets/corpus/khronos/Fox/Fox.glb");
    expect(unrealBatchRunner).toContain("v4_external_visual_baseline_runner.py");
    expect(unrealBatchRunner).toContain("v4_external_asset_import_workflow_runner.py");
    expect(unrealBatchRunner).toContain("-ExecutePythonScript=");
    expect(unrealBatchRunner).toContain("quoteUnrealPythonArg");
    expect(unrealBatchRunner).toContain("write-asset-import-workflow-report.mjs");
    expect(unrealBatchRunner).toContain("assetImportWorkflow.runnerEvidencePath");
    expect(unrealBatchRunner).toContain("G3D_EXTERNAL_ASSET_IMPORT_SAMPLE");
    expect(unrealBatchRunner).toContain("write-all-baseline-reports.mjs");
    expect(unrealBatchRunner).toContain("write-render-workflow-report.mjs");
    const unrealBatchDryRun = JSON.parse(execFileSync(process.execPath, [
      join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "run-unreal-baseline-captures.mjs"),
      "--dry-run",
    ], { cwd: root, encoding: "utf8" })) as Record<string, unknown>;
    expect(unrealBatchDryRun).toMatchObject({ ok: true, dryRun: true, unrealCaptureCount: 5, assetImportWorkflowCount: 1 });
    expect(JSON.stringify(unrealBatchDryRun)).toContain("-ExecutePythonScript=");
    expect(JSON.stringify(unrealBatchDryRun)).toContain("\\\"");
    expect(JSON.stringify(unrealBatchDryRun)).toContain("v4_external_asset_import_workflow_runner.py");
    expect(JSON.stringify(unrealBatchDryRun)).toContain("write-asset-import-workflow-report.mjs");
    expect(JSON.stringify(unrealBatchDryRun)).toContain("tests/assets/corpus/khronos/Fox/Fox.glb");
    expect(unrealRunner).toContain("def build_descriptor_parts()");
    expect(unrealRunner).toContain("component.set_static_mesh(load_mesh(geometry))");
    expect(unrealRunner).toContain("component.set_material(0, material)");
    expect(unrealRunner).toContain("screenshot_captured = False");
    expect(unrealRunner).toContain("os.path.exists(SCREENSHOT_PATH)");
    expect(unrealRunner).toContain("\"renderedFrameCaptured\": screenshot_captured");
    expect(unrealRunner).toContain("waited for a rendered PNG");
    expect(unrealRunner).toContain("/Engine/BasicShapes/Cube.Cube");
    expect(unrealAssetImportRunner).toContain("v4-unreal-asset-import-workflow.evidence.json");
    expect(unrealAssetImportRunner).toContain("AssetImportTask");
    expect(unrealAssetImportRunner).toContain("conversionRequiredFormats");
    expect(unrealAssetImportRunner).toContain("This sidecar is valid only when produced by a real Unreal editor import run");
    expect(unrealProductRunner).toContain("runpy.run_path(GENERIC_RUNNER");
    const smokeWriter = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "run-editor-cli-smoke.mjs"), "utf8");
    const renderWorkflowWriter = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "write-render-workflow-report.mjs"), "utf8");
    const assetImportWorkflowWriter = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "write-asset-import-workflow-report.mjs"), "utf8");
    const artifactIngester = readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "ingest-external-baseline-artifacts.mjs"), "utf8");
    expect(smokeWriter).toContain("Usage: node run-editor-cli-smoke.mjs <unity|unreal>");
    expect(smokeWriter).toContain("No \" + engine + \" editor executable found");
    expect(smokeWriter).toContain("G3D_UNITY_SEARCH_ROOTS");
    expect(smokeWriter).toContain("G3D_UNREAL_SEARCH_ROOTS");
    expect(smokeWriter).toContain("Unity\", \"Hub\", \"Editor");
    expect(smokeWriter).toContain("Epic Games");
    expect(smokeWriter).toContain("UnrealEditor-Cmd");
    expect(smokeWriter).toContain("normalizeEditorExecutablePath");
    expect(smokeWriter).toContain("Contents/MacOS/Unity");
    expect(smokeWriter).toContain("Contents/MacOS/UnrealEditor");
    expect(renderWorkflowWriter).toContain("Missing external editor CLI smoke report");
    expect(renderWorkflowWriter).toContain("cliSmokeReportPath: smokeReportPath");
    expect(assetImportWorkflowWriter).toContain("Usage: node write-asset-import-workflow-report.mjs <unity|unreal> <runner-evidence-path>");
    expect(assetImportWorkflowWriter).toContain("Missing external asset-import workflow evidence sidecar");
    expect(assetImportWorkflowWriter).toContain("sameSceneAssetImportWorkflowBaseline");
    expect(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unity", "v4-unity-asset-import-workflow.template.json"), "utf8")).toContain("sameSceneAssetImportWorkflowBaseline");
    expect(readFileSync(join(root, "fixtures", "external-engine-baselines", "v4", "unreal", "v4-unreal-asset-import-workflow.template.json"), "utf8")).toContain("sameSceneAssetImportWorkflowBaseline");
    expect(artifactIngester).toContain("allowedPrefixes");
    expect(artifactIngester).toContain("tests/reports/");
    expect(artifactIngester).toContain("audit:v4-external-evidence-readiness");
    const artifactRoot = join(root, "_downloaded-artifact");
    mkdirSync(join(artifactRoot, "tests", "reports"), { recursive: true });
    mkdirSync(join(artifactRoot, "v4-product-visual"), { recursive: true });
    mkdirSync(join(artifactRoot, "tmp"), { recursive: true });
    writeFileSync(join(artifactRoot, "tests", "reports", "v4-unity-editor-cli-smoke.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-unity-asset-import-workflow.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-unity-asset-import-workflow.evidence.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-unreal-editor-cli-smoke.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-unreal-asset-import-workflow.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-unreal-asset-import-workflow.evidence.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-product-visual", "unity-product-visual-baseline.png.evidence.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "tmp", "ignored.txt"), "ignore me\n");
    const ingestDryRun = JSON.parse(execFileSync(process.execPath, [
      join(root, "fixtures", "external-engine-baselines", "v4", "ingest-external-baseline-artifacts.mjs"),
      "--dry-run",
      "_downloaded-artifact",
    ], { cwd: root, encoding: "utf8" })) as Record<string, unknown>;
    expect(ingestDryRun).toMatchObject({
      ok: true,
      dryRun: true,
      copiedFiles: 7,
      skippedFiles: 1,
    });
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unity-editor-cli-smoke.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unreal-editor-cli-smoke.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unity-asset-import-workflow.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unity-asset-import-workflow.evidence.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unreal-asset-import-workflow.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-unreal-asset-import-workflow.evidence.json");
    expect(JSON.stringify(ingestDryRun)).toContain("tests/reports/v4-product-visual/unity-product-visual-baseline.png.evidence.json");
  }, 15_000);

  it("provides a manual self-hosted workflow for external Unity and Unreal baselines", () => {
    const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "v4-external-engine-baselines.yml"), "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("engine:");
    expect(workflow).toContain("asset_import_sample:");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("runs-on: [self-hosted, unity]");
    expect(workflow).toContain("runs-on: [self-hosted, unreal]");
    expect(workflow).toContain("G3D_UNITY_EDITOR");
    expect(workflow).toContain("G3D_UNITY_SEARCH_ROOTS");
    expect(workflow).toContain("G3D_UNREAL_EDITOR");
    expect(workflow).toContain("G3D_UNREAL_SEARCH_ROOTS");
    expect(workflow).toContain("G3D_EXTERNAL_ASSET_IMPORT_SAMPLE");
    expect(workflow).toContain("G3D_RUN_UNITY_UNREAL_CLI_SMOKE: \"true\"");
    expect(workflow).toContain("run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json");
    expect(workflow).toContain("run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json");
    expect(workflow).toContain("run-unity-baseline-captures.mjs --project");
    expect(workflow).toContain("run-unreal-baseline-captures.mjs --project");
    expect(workflow).toContain("final-audits:");
    expect(workflow).toContain("pattern: v4-*-baseline-evidence");
    expect(workflow).toContain("merge-multiple: true");
	    expect(workflow).toContain("ingest-external-baseline-artifacts.mjs --no-audit _v4-external-baseline-evidence");
	    expect(workflow).toContain("pnpm audit:v4-pbr-reference-readiness || true");
	    expect(workflow).toContain("pnpm audit:v4-pbr-gltf-readiness || true");
	    expect(workflow).toContain("pnpm audit:v4-shadow-map-readiness || true");
	    expect(workflow).toContain("pnpm audit:v4-hdr-render-target-readiness || true");
	    expect(workflow).toContain("pnpm audit:v4-postprocess-suite || true");
	    expect(workflow).toContain("v4-external-baseline-final-audits");
	    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("tests/reports/v4-unity-asset-import-workflow.json");
    expect(workflow).toContain("tests/reports/v4-unity-asset-import-workflow.evidence.json");
    expect(workflow).toContain("tests/reports/v4-unity-product-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unity-pbr-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unity-shadow-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unity-hdr-render-target-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unity-postprocess-suite-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unreal-asset-import-workflow.json");
    expect(workflow).toContain("tests/reports/v4-unreal-asset-import-workflow.evidence.json");
    expect(workflow).toContain("tests/reports/v4-unreal-product-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unreal-pbr-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unreal-shadow-visual-baseline.json");
    expect(workflow).toContain("tests/reports/v4-unreal-hdr-render-target-baseline.json");
	    expect(workflow).toContain("tests/reports/v4-unreal-postprocess-suite-baseline.json");
	    expect(workflow).toContain("tests/reports/v4-pbr-reference-readiness.json");
	    expect(workflow).toContain("tests/reports/v4-pbr-gltf-readiness.json");
	    expect(workflow).toContain("tests/reports/v4-shadow-map-readiness.json");
	    expect(workflow).toContain("tests/reports/v4-hdr-render-target-readiness.json");
	    expect(workflow).toContain("tests/reports/v4-postprocess-suite.json");
	    expect(workflow).toContain("tests/reports/v4-external-evidence-missing-artifacts.md");
    expect(workflow).toContain("tests/reports/v4-completion-audit-runbook.md");
    expect(workflow).toContain("pnpm audit:v4-unity-unreal-parity || true");
  });

  it("rejects static demo server artifacts whose bytes match integrity but miss required content markers", async () => {
    const root = fixtureRoot();
    const outputDir = "release-artifacts/external-demos/0.1.0-alpha.0";
    const demos = publicDemoIds;
    mkdirSync(join(root, outputDir), { recursive: true });
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    mkdirSync(join(root, "examples", "product-configurator"), { recursive: true });
    const sourcePath = "examples/product-configurator/main.ts";
    const sourceBody = "export const productConfiguratorDemo = true;\n";
    writeFileSync(join(root, sourcePath), sourceBody);
    const sourceFileHashes = [{
      path: sourcePath,
      sha256: createHash("sha256").update(sourceBody).digest("hex")
    }];

    const files: { path: string; sha256: string }[] = [];
    const writeStaticFile = (path: string, contents: string) => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), contents);
      files.push({ path, sha256: createHash("sha256").update(contents).digest("hex") });
    };
    writeStaticFile(`${outputDir}/index.html`, publicDemoIds.map((id) => `<a href="./${id}/">${id}</a>`).join(""));
    for (const demo of demos) {
      writeStaticFile(`${outputDir}/${demo}/index.html`, "<!doctype html><title>Galileo3D</title><script type=\"module\" src=\"./main.js\"></script>");
      const marker = demo === "game-slice" ? "missing-game-marker" : publicDemoCanvasMarkers[demo];
      writeStaticFile(`${outputDir}/${demo}/main.js`, `${marker}\n${"x".repeat(10_100)}`);
    }
    writeFileSync(join(root, `${outputDir}/static-integrity-manifest.json`), JSON.stringify({
      schemaVersion: "g3d-static-demo-integrity-v1",
      files,
      sourceFileHashes
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "external-demo-static-export.json"), JSON.stringify({
      ok: true,
      outputDir,
      integrityManifestPath: `${outputDir}/static-integrity-manifest.json`,
      demos: demos.map((id) => ({
        id,
        outputHtml: `${outputDir}/${id}/index.html`,
        outputScript: `${outputDir}/${id}/main.js`
      })),
      sourceFileHashes
    }, null, 2));

    const report = await createStaticDemoServerSmokeReport(root);

    expect(report.ok).toBe(false);
    expect(report.demos.find((demo) => demo.id === "game-slice")?.script).toMatchObject({
      integrityMatched: true,
      contentOk: false,
      contentMarkers: ["game-slice-canvas"]
    });
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("game-slice: script served bytes do not contain expected content markers")
    ]));
  });

  it("rejects static demo server smoke when the static export source graph is stale", async () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writeFileSync(join(root, "examples", "product-configurator", "main.ts"), "export const productConfiguratorDemo = false;\n");

    const report = await createStaticDemoServerSmokeReport(root);

    expect(report.ok).toBe(false);
    expect(report.localServerUrl).toBe("");
    expect(report.violations).toEqual(expect.arrayContaining([
      "Static demo export is stale because source changed after export: examples/product-configurator/main.ts."
    ]));
  });

  it("loads public deployment manifest paths before requiring a durable public URL", async () => {
    const root = fixtureRoot();
    const outputDir = "release-artifacts/external-demos/0.1.0-alpha.0";
    const publicDeploymentManifestPath = writePublicDeploymentFixture(root);

    const previousUrl = process.env.G3D_PUBLIC_DEMO_URL;
    delete process.env.G3D_PUBLIC_DEMO_URL;
    try {
      const report = await createPublicDemoDeploymentSmokeReport(root);
      const runbook = readFileSync(join(root, "tests", "reports", "public-demo-deployment-runbook.md"), "utf8");

      expect(report.ok).toBe(false);
      expect(report.deploymentRunbookPath).toBe("tests/reports/public-demo-deployment-runbook.md");
      expect(report.publicDeploymentManifestPath).toBe(publicDeploymentManifestPath);
      expect(report.deploymentExecutionPlan).toMatchObject({
        requiredCommand: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
        sourceManifestPath: `${outputDir}/static-integrity-manifest.json`,
        publicDeploymentManifestPath,
      });
      expect(report.deploymentExecutionPlan.filesToDeploy).toHaveLength(11);
      expect(report.deploymentExecutionPlan.filesToDeploy).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "game-slice:script",
          publicPath: "game-slice/main.js",
          contentMarkers: ["game-slice-canvas"],
        }),
        expect.objectContaining({
          id: "racing-showcase:script",
          publicPath: "racing-showcase/main.js",
          contentMarkers: ["racing-showcase-canvas"],
        }),
        expect.objectContaining({
          id: "large-world-streaming:script",
          publicPath: "large-world-streaming/main.js",
          contentMarkers: ["large-world-canvas"],
        }),
      ]));
      expect(report.deploymentExecutionPlan.validationCommands).toEqual(expect.arrayContaining([
        "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
        "pnpm audit:v4-production-readiness",
      ]));
      expect(report.violations).toEqual(expect.arrayContaining([
        "G3D_PUBLIC_DEMO_URL is not set to a durable public demo origin.",
        "Public deployment checks did not cover the index plus all required demo HTML/script files.",
      ]));
      expect(report.violations).not.toEqual(expect.arrayContaining([
        expect.stringContaining("Public deployment manifest is missing"),
        expect.stringContaining("Public deployment manifest does not list"),
      ]));
      expect(runbook).toContain("# V4 Public Demo Deployment Runbook");
      expect(runbook).toContain("Deployment ready: no");
      expect(runbook).toContain("Checks completed: 0 / 11");
      expect(runbook).toContain("### game-slice:script");
      expect(runbook).toContain("Local path: `release-artifacts/external-demos/0.1.0-alpha.0/game-slice/main.js`");
      expect(runbook).toContain("### racing-showcase:script");
      expect(runbook).toContain("### large-world-streaming:script");
      expect(runbook).toContain("G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment");
      expect(runbook).toContain("pnpm audit:v4-completion");
    } finally {
      if (previousUrl === undefined) {
        delete process.env.G3D_PUBLIC_DEMO_URL;
      } else {
        process.env.G3D_PUBLIC_DEMO_URL = previousUrl;
      }
    }
  });

  it("rejects public deployment smoke when the static export source graph is stale", async () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writeFileSync(join(root, "examples", "product-configurator", "main.ts"), "export const productConfiguratorDemo = false;\n");

    const previousUrl = process.env.G3D_PUBLIC_DEMO_URL;
    delete process.env.G3D_PUBLIC_DEMO_URL;
    try {
      const report = await createPublicDemoDeploymentSmokeReport(root);

      expect(report.ok).toBe(false);
      expect(report.checks).toEqual([]);
      expect(report.violations).toEqual(expect.arrayContaining([
        "Static demo export is stale because source changed after export: examples/product-configurator/main.ts."
      ]));
    } finally {
      if (previousUrl === undefined) {
        delete process.env.G3D_PUBLIC_DEMO_URL;
      } else {
        process.env.G3D_PUBLIC_DEMO_URL = previousUrl;
      }
    }
  });

  it("rejects private placeholder public deployment URLs before attempting fetch checks", async () => {
    const invalidUrls = [
      "https://localhost:4443/",
      "https://127.0.0.1/",
      "https://192.168.0.4/",
      "https://demo.example/",
      "http://demo.galileo3d.com/",
    ];
    const previousUrl = process.env.G3D_PUBLIC_DEMO_URL;
    try {
      for (const url of invalidUrls) {
        const root = fixtureRoot();
        const publicDeploymentManifestPath = writePublicDeploymentFixture(root);
        process.env.G3D_PUBLIC_DEMO_URL = url;

        const report = await createPublicDemoDeploymentSmokeReport(root);

        expect(report.ok).toBe(false);
        expect(report.deploymentUrl).toBeNull();
        expect(report.publicDeploymentManifestPath).toBe(publicDeploymentManifestPath);
        expect(report.checks).toEqual([]);
        expect(report.violations).toEqual(expect.arrayContaining([
          `G3D_PUBLIC_DEMO_URL must be a durable public HTTPS origin, not localhost/private/reserved/placeholder host: ${url}.`,
          "Public deployment checks did not cover the index plus all required demo HTML/script files.",
        ]));
        expect(report.violations).not.toEqual(expect.arrayContaining([
          expect.stringContaining("expected HTTP 200"),
          expect.stringContaining("public bytes do not match"),
        ]));
      }
    } finally {
      if (previousUrl === undefined) {
        delete process.env.G3D_PUBLIC_DEMO_URL;
      } else {
        process.env.G3D_PUBLIC_DEMO_URL = previousUrl;
      }
    }
  });

  it("does not let ok-only public deployment reports satisfy production readiness", () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writeFileSync(join(root, "tests", "reports", "public-demo-deployment-smoke.json"), JSON.stringify({
      ok: true,
      deploymentUrl: "https://demo.galileo3d.com/",
      checks: [],
      violations: []
    }, null, 2));

    const report = createV4ProductionReadinessReport(root);
    const deployment = report.releaseAreas.find((area) => area.id === "deployment");

    expect(deployment?.ready).toBe(false);
    expect(deployment?.blockers.join("\n")).toContain("current per-file HTTP/hash/content-marker evidence");
    expect(deployment?.blockers.join("\n")).toContain("tests/reports/public-demo-deployment-runbook.md");
    expect(deployment?.blockers.join("\n")).toContain("public deployment report does not include one check for every required deployed file");
    expect(deployment?.blockers.join("\n")).toContain("report sourceManifestPath does not match current static export report");
  });

  it("validates public deployment smoke reports against current manifest hashes and content evidence", () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writePublicDeploymentSmokeFixture(root);
    const staticExport = JSON.parse(readFileSync(join(root, "tests", "reports", "external-demo-static-export.json"), "utf8")) as Record<string, unknown>;
    const publicDeployment = JSON.parse(readFileSync(join(root, "tests", "reports", "public-demo-deployment-smoke.json"), "utf8")) as Record<string, unknown>;

    const validation = validatePublicDemoDeploymentSmokeEvidence(root, publicDeployment, staticExport);

    expect(validation).toMatchObject({
      ok: true,
      expectedChecks: 11,
      actualChecks: 11,
      blockers: []
    });

    const tampered = {
      ...publicDeployment,
      checks: (publicDeployment.checks as Record<string, unknown>[]).map((check, index) => index === 0 ? { ...check, sha256: "0".repeat(64) } : check)
    };
    expect(validatePublicDemoDeploymentSmokeEvidence(root, tampered, staticExport).blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("index: response sha256 does not match current static integrity and deployment manifests")
    ]));
  });

  it("keeps production deployment blocked when the static demo export source graph is stale", () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writePublicDeploymentSmokeFixture(root);
    writeStaticDemoServerSmokeFixture(root);
    writePublicDemoWorkflowFixture(root);
    writeFileSync(join(root, "examples", "product-configurator", "main.ts"), "export const productConfiguratorDemo = false;\n");

    const report = createV4ProductionReadinessReport(root);
    const deployment = report.releaseAreas.find((area) => area.id === "deployment");

    expect(deployment?.ready).toBe(false);
    expect(deployment?.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("static demo export is stale because source changed after export: examples/product-configurator/main.ts")
    ]));
  });

  it("validates the public demo deployment workflow before treating deployment evidence as ready", () => {
    const root = fixtureRoot();
    writePublicDeploymentFixture(root);
    writePublicDeploymentSmokeFixture(root);
    writeStaticDemoServerSmokeFixture(root);
    writePublicDemoWorkflowFixture(root, "name: placeholder\non:\n  workflow_dispatch:\n");

    const invalidReport = createV4ProductionReadinessReport(root);
    const invalidDeployment = invalidReport.releaseAreas.find((area) => area.id === "deployment");

    expect(invalidDeployment?.ready).toBe(false);
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing static demo export build");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow does not validate against the GitHub Pages deployment URL");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing Pages write permission");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing OIDC token permission");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing GitHub Pages environment");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing GitHub Pages configuration");
    expect(invalidDeployment?.blockers.join("\n")).toContain("Public demo deployment workflow is missing always-upload public deployment reports");

    writePublicDemoWorkflowFixture(root);

    const validReport = createV4ProductionReadinessReport(root);
    const validDeployment = validReport.releaseAreas.find((area) => area.id === "deployment");

    expect(validDeployment?.ready).toBe(true);
    expect(validDeployment?.blockers).toEqual([]);
    expect(validReport.productionReady).toBe(false);
  });

  it("ingests downloaded public demo deployment report artifacts without accepting unrelated files", () => {
    const root = fixtureRoot();
    const artifactRoot = join(root, "_downloaded-public-demo-reports");
    mkdirSync(join(artifactRoot, "tests", "reports"), { recursive: true });
    mkdirSync(join(artifactRoot, "other"), { recursive: true });
    writeFileSync(join(artifactRoot, "tests", "reports", "public-demo-deployment-smoke.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(artifactRoot, "v4-production-readiness.json"), JSON.stringify({ productionReady: true }, null, 2));
    writeFileSync(join(artifactRoot, "other", "unrelated.json"), JSON.stringify({ ok: true }, null, 2));

    const dryRun = ingestPublicDemoDeploymentReportArtifacts({
      root,
      artifactRoots: ["_downloaded-public-demo-reports"],
      dryRun: true,
    });

    expect(dryRun).toMatchObject({
      ok: true,
      dryRun: true,
      copiedFiles: 2,
      skippedFiles: 1,
      auditResults: [],
    });
    expect(dryRun.copied).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tests/reports/public-demo-deployment-smoke.json" }),
      expect.objectContaining({ path: "tests/reports/v4-production-readiness.json" }),
    ]));
    expect(dryRun.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "other/unrelated.json", reason: "not a public deployment report artifact" }),
    ]));

    const copied = ingestPublicDemoDeploymentReportArtifacts({
      root,
      artifactRoots: ["_downloaded-public-demo-reports"],
      noAudit: true,
    });

    expect(copied.ok).toBe(true);
    expect(readFileSync(join(root, "tests", "reports", "public-demo-deployment-smoke.json"), "utf8")).toContain("\"ok\": true");
    expect(readFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), "utf8")).toContain("\"productionReady\": true");

    const cliDryRun = JSON.parse(execFileSync("pnpm", [
      "exec",
      "tsx",
      "--tsconfig",
      "tsconfig.base.json",
      "tools/public-demo-deployment-artifacts/index.ts",
      "--dry-run",
      artifactRoot,
    ], { cwd: process.cwd(), encoding: "utf8" })) as Record<string, unknown>;
    expect(cliDryRun).toMatchObject({
      ok: true,
      dryRun: true,
      copiedFiles: 2,
      skippedFiles: 1,
    });
  });

  it("does not count full WebGPU completion from a bare boolean without the evidence matrix", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-broad-parity-readiness.json"), JSON.stringify({ claims: [] }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-unity-unreal-parity.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-gltf-readiness.json"), JSON.stringify({ gltfParity: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-webgpu-parity.json"), JSON.stringify({
      ok: true,
      fullWebGPUParity: true,
      fullWebGPUParityBlockers: [],
      blockedEvidence: [],
      supportedEvidence: [],
      validations: [],
      hardwareMatrix: { present: false, realDeviceAvailable: false }
    }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-hdr-render-target-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-shadow-map-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-postprocess-suite.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity.json"), JSON.stringify({}, null, 2));

    const report = createV4CompletionAuditReport(root);
    const webgpu = report.criteria.find((entry) => entry.id === "full-webgpu-parity");
    const runbook = readFileSync(join(root, "tests", "reports", "v4-completion-audit-runbook.md"), "utf8");

    expect(report.completionRunbookPath).toBe("tests/reports/v4-completion-audit-runbook.md");
    expect(report.externalEvidenceRunbookPath).toBe("tests/reports/v4-external-evidence-missing-artifacts.md");
    expect(webgpu?.achieved).toBe(false);
    expect(webgpu?.blockerType).toBe("mixed");
    expect(webgpu?.localEvidence).toContain("The WebGPU parity report must include a real hardware matrix, adapter/device proof, native WebGPU render/readback evidence, and feature validations before the boolean is trusted.");
    expect(webgpu?.requiredExternalEvidence).toContain("Run the WebGPU hardware matrix on real WebGPU-capable browsers/devices whenever release hardware coverage changes.");
    expect(webgpu?.blockers).toEqual(expect.arrayContaining([
      "real WebGPU hardware matrix does not prove an available adapter/device",
      "missing WebGPU supported evidence: real-webgpu-hardware-matrix-probe",
      "missing passing WebGPU validation: full-webgpu-parity-boundary",
    ]));
    expect(runbook).toContain("# V4 Completion Audit Runbook");
    expect(runbook).toContain("## Prompt-To-Artifact Checklist");
    expect(runbook).toContain("### full-webgpu-parity");
    expect(runbook).toContain("Blocker type: mixed");
    expect(runbook).toContain("Required gate field: `fullWebGPUParity + required evidence matrix`");
    expect(runbook).toContain("Local evidence already present:");
    expect(runbook).toContain("External evidence still required:");
    expect(runbook).toContain("pnpm status:v4-local-port");
    expect(runbook).toContain("pnpm status:v4-parity");
    expect(runbook).toContain("pnpm prepare:v4-external-evidence-handoff");
    expect(runbook).toContain("pnpm preflight:v4-parity");
    expect(runbook).toContain("pnpm refresh:v4-readiness-reports");
    expect(runbook).toContain("tests/reports/v4-external-evidence-missing-artifacts.md");
  });

  it("keeps WebGPU parity blocked when the hardware matrix has unsupported adapter results", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "v4-current-capability.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-rendering.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-asset-corpus.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-engine-comparison.json"), JSON.stringify({ ok: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-comparison-threejs.json"), JSON.stringify({ ok: true, claimUsable: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-comparison-babylon.json"), JSON.stringify({ ok: true, claimUsable: false }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-unity-unreal-parity.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-production-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-pbr-gltf-readiness.json"), JSON.stringify({ gltfParity: true }, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-hdr-render-target-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-shadow-map-readiness.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-postprocess-suite.json"), JSON.stringify({}, null, 2));
    writeFileSync(join(root, "tests", "reports", "v4-product-visual-parity.json"), JSON.stringify({}, null, 2));

    const supportedEvidence = [
      "real-webgpu-hardware-matrix-probe",
      "real-navigator-gpu-adapter-device-evidence",
      "real-webgpu-render-target-readback-evidence",
      "real-webgpu-render-device-feature-matrix-evidence",
      "real-webgpu-webgl2-feature-matrix-conformance",
      "native-webgpu-render-pass-submission-evidence",
      "native-webgpu-texture-to-buffer-readback-evidence",
      "real-webgpu-pbr-forward-pass-evidence",
      "real-webgpu-textured-pbr-forward-pass-evidence",
      "real-webgpu-environment-pbr-forward-pass-evidence",
      "real-webgpu-instanced-pbr-forward-pass-evidence",
      "real-webgpu-skinned-forward-pass-evidence",
      "real-webgpu-morph-forward-pass-evidence",
      "real-webgpu-shadow-map-forward-pass-evidence",
      "real-webgpu-hdr-render-target-postprocess-evidence",
      "real-webgpu-compute-particle-evidence",
      "real-webgpu-production-renderer-feature-matrix",
    ];
    const validations = [
      "real-hardware-matrix-probe",
      "real-adapter-device-evidence",
      "real-render-target-readback-evidence",
      "real-render-device-feature-matrix-evidence",
      "real-webgpu-webgl2-feature-matrix-conformance",
      "native-webgpu-render-pass-submission",
      "native-webgpu-texture-to-buffer-readback",
      "real-webgpu-pbr-forward-pass",
      "real-webgpu-textured-pbr-forward-pass",
      "real-webgpu-environment-pbr-forward-pass",
      "real-webgpu-instanced-pbr-forward-pass",
      "real-webgpu-skinned-forward-pass",
      "real-webgpu-morph-forward-pass",
      "real-webgpu-shadow-map-forward-pass",
      "real-webgpu-hdr-render-target-postprocess",
      "real-compute-particle-evidence",
      "full-webgpu-parity-boundary",
    ].map((id) => ({ id, passed: true }));
    writeFileSync(join(root, "tests", "reports", "v4-webgpu-parity.json"), JSON.stringify({
      ok: true,
      fullWebGPUParity: true,
      fullWebGPUParityBlockers: [],
      blockedEvidence: [],
      supportedEvidence,
      validations,
      hardwareMatrix: {
        present: true,
        realDeviceAvailable: true,
        allResultsSupported: false,
        unsupportedResultCount: 1
      }
    }, null, 2));

    const broad = createV4BroadParityReadinessReport(root);
    const completion = createV4CompletionAuditReport(root);
    const broadWebgpu = broad.claims.find((entry) => entry.id === "full-webgpu-parity");
    const completionWebgpu = completion.criteria.find((entry) => entry.id === "full-webgpu-parity");

    expect(broadWebgpu).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(["real WebGPU hardware matrix contains unsupported adapter/device probe results: 1"])
    });
    expect(completionWebgpu).toMatchObject({
      achieved: false,
      blockers: expect.arrayContaining(["real WebGPU hardware matrix contains unsupported adapter/device probe results: 1"])
    });
  });

  it("surfaces unresolved production parity blockers in readiness report violations", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });

    const hdr = createV4HdrRenderTargetReadinessReport(root);
    const shadow = createV4ShadowMapReadinessReport(root);
    const pbrReference = createV4PbrReferenceReadinessReport(root);

    expect(hdr.hdrRenderTargetParity).toBe(false);
    expect(hdr.violations).toEqual(expect.arrayContaining([
      "hdr-render-target-parity-blocked: actual-Unity/Unreal-HDR-runner-evidence-sidecars-and-baseline-reports",
      "hdr-render-target-parity-blocked: same-scene-HDR-IBL-comparison-against-Unity/Unreal",
      expect.stringContaining("hdr-render-target-parity-blocked: same-scene-HDR-render-target-comparison-against-"),
    ]));
    expect(shadow.shadowMapParity).toBe(false);
    expect(shadow.violations).toEqual(expect.arrayContaining([
      "shadow-map-parity-blocked: actual-Unity/Unreal-shadow-runner-evidence-sidecars-and-baseline-reports",
      "shadow-map-parity-blocked: same-scene-shadow-pixel-parity-against-Unity/Unreal",
      "shadow-map-parity-blocked: Unity/Unreal-shadow-atlas-cascade-selection-parity",
    ]));
    expect(pbrReference.fullPhysicalPbrParity).toBe(false);
    expect(pbrReference.violations).toEqual(expect.arrayContaining([
      "full-physical-pbr-parity-blocked: actual-Unity/Unreal-PBR-runner-evidence-sidecars-and-baseline-reports",
      "full-physical-pbr-parity-blocked: same-scene-reference-BRDF-pixel-parity-against-Unity/Unreal",
      "full-physical-pbr-parity-blocked: Unity/Unreal-production-caustics-transmission-refraction-parity",
    ]));
  });
});

function rgbaPng(width: number, height: number, rgba: readonly [number, number, number, number]): Buffer {
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowLength + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = rowStart + 1 + x * 4;
      raw[index] = rgba[0];
      raw[index + 1] = rgba[1];
      raw[index + 2] = rgba[2];
      raw[index + 3] = rgba[3];
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function patternedPng(width: number, height: number, mode: "reference" | "inverted"): Buffer {
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowLength + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = rowStart + 1 + x * 4;
      const seed = (x * 17 + y * 31 + ((x ^ y) & 255)) & 255;
      const r = mode === "reference" ? seed : 255 - seed;
      const g = mode === "reference" ? (x * 7 + y * 3) & 255 : (255 - ((x * 7 + y * 3) & 255));
      const b = mode === "reference" ? (x * 5 + y * 11) & 255 : (255 - ((x * 5 + y * 11) & 255));
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = 255;
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, payload: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + payload.length);
  output.writeUInt32BE(payload.length, 0);
  typeBytes.copy(output, 4);
  payload.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 8 + payload.length);
  return output;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
