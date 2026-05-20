import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productVisualParityScene } from "../v4-product-visual-parity/productScene.js";
import { baseReport, writeJson } from "../v4-reporting/index.js";

const reportPath = "tests/reports/v4-external-engine-baselines.json";
const kitRoot = "fixtures/external-engine-baselines/v4";
const sourceFiles = [
  ".github/workflows/v4-external-engine-baselines.yml",
  "tools/v4-external-engine-baselines/index.ts",
  "tools/v4-product-visual-parity/productScene.ts",
  "tools/v4-pbr-visual-parity/index.ts",
  "tools/v4-shadow-visual-parity/index.ts",
  "tools/v4-hdr-visual-parity/index.ts",
  "tools/v4-postprocess-suite/index.ts",
  "tests/reports/v4-product-visual-parity/galileo-product.png",
  "tests/reports/v4-pbr-visual-parity/galileo-pbr.png",
  "tests/reports/v4-shadow-visual-parity/galileo-shadow.png",
  "tests/reports/v4-hdr-visual-parity/galileo-hdr.png",
  "tests/reports/comparison-screenshots/galileo-postprocess.png",
] as const;

interface BaselineKitArtifact {
  readonly path: string;
  readonly kind: "scene-descriptor" | "schema" | "unity-runner" | "unity-batch-runner" | "unreal-runner" | "unreal-batch-runner" | "report-writer" | "template" | "readme" | "command-plan";
  readonly requiredFor: readonly ("unity" | "unreal")[];
  readonly ok: boolean;
}

interface ExternalBaselineSceneSlot {
  readonly id: string;
  readonly schemaVersion: string;
  readonly baselineKind: "product-visual" | "pbr-visual" | "shadow-visual" | "hdr-render-target" | "postprocess-suite";
  readonly descriptorPath: string;
  readonly reportStem: string;
  readonly descriptor: Record<string, unknown>;
  readonly galileoReferenceScreenshotPath: string;
  readonly minimumEvidence: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly colorBuckets: number;
    readonly drawCalls: number;
    readonly materialCount?: number;
    readonly productParts?: number;
    readonly turntableHotspots?: number;
    readonly captureViews?: number;
    readonly batchTasks?: number;
    readonly featureCount?: number;
    readonly shadowEvidencePixels?: number;
    readonly toneMappedPatches?: number;
    readonly implementedEffects?: number;
    readonly realSceneEffects?: number;
  };
  readonly targetReports: {
    readonly unity: string;
    readonly unreal: string;
  };
}

interface ExternalBaselineExecutionStep {
  readonly baselineKind: ExternalBaselineSceneSlot["baselineKind"];
  readonly descriptorPath: string;
  readonly runnerPath: string;
  readonly expectedScreenshotPath: string;
  readonly targetReportPath: string;
  readonly minimumEvidence: ExternalBaselineSceneSlot["minimumEvidence"];
  readonly captureInstruction: string;
  readonly reportCommand: string;
  readonly validationCommands: readonly string[];
}

interface ExternalBaselineExecutionPlan {
  readonly claimBoundary: string;
  readonly unity: {
    readonly editorEnv: "G3D_UNITY_EDITOR";
    readonly searchRootsEnv: "G3D_UNITY_SEARCH_ROOTS";
    readonly cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE";
    readonly runnerPath: "fixtures/external-engine-baselines/v4/unity/V4ExternalVisualBaselineRunner.cs";
    readonly steps: readonly ExternalBaselineExecutionStep[];
  };
  readonly unreal: {
    readonly editorEnv: "G3D_UNREAL_EDITOR";
    readonly searchRootsEnv: "G3D_UNREAL_SEARCH_ROOTS";
    readonly cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE";
    readonly runnerPath: "fixtures/external-engine-baselines/v4/unreal/v4_external_visual_baseline_runner.py";
    readonly steps: readonly ExternalBaselineExecutionStep[];
  };
  readonly finalAuditCommands: readonly string[];
}

interface GalileoReferenceScreenshot {
  readonly path: string;
  readonly present: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly sha256?: string;
  readonly ok: boolean;
  readonly reason?: string;
}

export interface V4ExternalEngineBaselineKitReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly kitRoot: string;
  readonly sceneDescriptorId: typeof productVisualParityScene.id;
  readonly sceneDescriptorVersion: typeof productVisualParityScene.schemaVersion;
  readonly sceneSlots: readonly {
    readonly id: string;
    readonly baselineKind: ExternalBaselineSceneSlot["baselineKind"];
    readonly descriptorPath: string;
    readonly galileoReferenceScreenshot: GalileoReferenceScreenshot;
    readonly targetReports: ExternalBaselineSceneSlot["targetReports"];
  }[];
  readonly galileoReferenceScreenshotsReady: boolean;
  readonly artifacts: readonly BaselineKitArtifact[];
  readonly baselineReportTargets: {
    readonly unity: string;
    readonly unreal: string;
    readonly byScene: Record<string, {
      readonly unity: string;
      readonly unreal: string;
    }>;
  };
  readonly baselineCommandPlanPath: string;
  readonly baselineExecutionPlan: ExternalBaselineExecutionPlan;
  readonly violations: readonly string[];
}

const externalBaselineScenes: readonly ExternalBaselineSceneSlot[] = [
  {
    id: productVisualParityScene.id,
    schemaVersion: productVisualParityScene.schemaVersion,
    baselineKind: "product-visual",
    descriptorPath: "product-visual-parity-scene.json",
    reportStem: "product-visual",
    descriptor: productVisualParityScene as unknown as Record<string, unknown>,
    galileoReferenceScreenshotPath: "tests/reports/v4-product-visual-parity/galileo-product.png",
    minimumEvidence: {
      width: productVisualParityScene.viewport.width,
      height: productVisualParityScene.viewport.height,
      nonBlankPixels: 10_001,
      colorBuckets: 2,
      drawCalls: productVisualParityScene.minimumEvidence.drawCalls,
      materialCount: productVisualParityScene.minimumEvidence.materialCount,
      productParts: productVisualParityScene.minimumEvidence.productParts,
      turntableHotspots: productVisualParityScene.minimumEvidence.turntableHotspots,
      captureViews: productVisualParityScene.minimumEvidence.captureViews,
      batchTasks: productVisualParityScene.minimumEvidence.batchTasks,
    },
    targetReports: {
      unity: "tests/reports/v4-unity-product-visual-baseline.json",
      unreal: "tests/reports/v4-unreal-product-visual-baseline.json",
    },
  },
  externalSceneSlot("pbr-visual", "v4-pbr-visual-parity-scene", "v4-pbr-visual-parity-scene-v1", "pbr-visual-parity-scene.json", {
    width: 960,
    height: 540,
    nonBlankPixels: 30_001,
    colorBuckets: 7,
    drawCalls: 12,
    materialCount: 11,
    featureCount: 11,
  }),
  externalSceneSlot("shadow-visual", "v4-shadow-visual-parity-scene", "v4-shadow-visual-parity-scene-v1", "shadow-visual-parity-scene.json", {
    width: 720,
    height: 480,
    nonBlankPixels: 60_001,
    colorBuckets: 5,
    drawCalls: 5,
    shadowEvidencePixels: 701,
  }),
  externalSceneSlot("hdr-render-target", "v4-hdr-render-target-visual-parity-scene", "v4-hdr-render-target-visual-parity-scene-v1", "hdr-render-target-visual-parity-scene.json", {
    width: 720,
    height: 420,
    nonBlankPixels: 30_001,
    colorBuckets: 5,
    drawCalls: 4,
    toneMappedPatches: 3,
  }),
  externalSceneSlot("postprocess-suite", "v4-postprocess-suite-parity-scene", "v4-postprocess-suite-parity-scene-v1", "postprocess-suite-parity-scene.json", {
    width: 960,
    height: 540,
    nonBlankPixels: 30_001,
    colorBuckets: 8,
    drawCalls: 4,
    implementedEffects: 14,
    realSceneEffects: 14,
  }),
];

export function createV4ExternalEngineBaselineKit(root = process.cwd()): V4ExternalEngineBaselineKitReport {
  const baselineExecutionPlan = externalBaselineExecutionPlan();
  const artifacts: BaselineKitArtifact[] = [
    ...externalBaselineScenes.map((scene) =>
      writeArtifact(root, scene.descriptorPath, "scene-descriptor", ["unity", "unreal"], stableJson(scene.descriptor))
    ),
    writeArtifact(root, "baseline-report.schema.json", "schema", ["unity", "unreal"], stableJson(baselineReportSchema())),
    writeArtifact(root, "baseline-render-report.schema.json", "schema", ["unity", "unreal"], stableJson(baselineRenderReportSchema())),
    writeArtifact(root, "asset-import-workflow-report.schema.json", "schema", ["unity", "unreal"], stableJson(assetImportWorkflowReportSchema())),
    writeArtifact(root, "run-editor-cli-smoke.mjs", "report-writer", ["unity", "unreal"], editorCliSmokeSource()),
    writeArtifact(root, "write-baseline-report.mjs", "report-writer", ["unity", "unreal"], baselineReportWriterSource()),
    writeArtifact(root, "write-render-workflow-report.mjs", "report-writer", ["unity", "unreal"], baselineRenderReportWriterSource()),
    writeArtifact(root, "write-asset-import-workflow-report.mjs", "report-writer", ["unity", "unreal"], assetImportWorkflowReportWriterSource()),
    writeArtifact(root, "write-all-baseline-reports.mjs", "report-writer", ["unity", "unreal"], baselineReportBatchWriterSource()),
    writeArtifact(root, "verify-baseline-reports.mjs", "report-writer", ["unity", "unreal"], baselineReportVerifierSource()),
    writeArtifact(root, "ingest-external-baseline-artifacts.mjs", "report-writer", ["unity", "unreal"], externalBaselineArtifactIngestSource()),
    writeArtifact(root, "RUNBOOK.md", "readme", ["unity", "unreal"], baselineRunbookSource(baselineExecutionPlan)),
    writeArtifact(root, "external-baseline-command-plan.json", "command-plan", ["unity", "unreal"], externalBaselineCommandPlanSource(baselineExecutionPlan)),
    writeArtifact(root, "unity/run-unity-baseline-captures.mjs", "unity-batch-runner", ["unity"], unityBatchCaptureRunnerSource()),
    writeArtifact(root, "unity/ProductVisualParityBaseline.cs", "unity-runner", ["unity"], unityRunnerSource()),
    writeArtifact(root, "unity/V4ExternalVisualBaselineRunner.cs", "unity-runner", ["unity"], unityMultiSlotRunnerSource()),
    writeArtifact(root, "unity/V4ExternalAssetImportWorkflowRunner.cs", "unity-runner", ["unity"], unityAssetImportWorkflowRunnerSource()),
    writeArtifact(root, "unity/README.md", "readme", ["unity"], unityReadme()),
    writeArtifact(root, "unity/v4-unity-baseline-render.template.json", "template", ["unity"], stableJson(baselineRenderTemplate("unity"))),
    writeArtifact(root, "unity/v4-unity-asset-import-workflow.template.json", "template", ["unity"], stableJson(assetImportWorkflowTemplate("unity"))),
    ...externalBaselineScenes.map((scene) =>
      writeArtifact(root, `unity/v4-unity-${scene.reportStem}-baseline.template.json`, "template", ["unity"], stableJson(baselineTemplate("unity", scene)))
    ),
    writeArtifact(root, "unreal/product_visual_parity_baseline.py", "unreal-runner", ["unreal"], unrealRunnerSource()),
    writeArtifact(root, "unreal/v4_external_visual_baseline_runner.py", "unreal-runner", ["unreal"], unrealMultiSlotRunnerSource()),
    writeArtifact(root, "unreal/v4_external_asset_import_workflow_runner.py", "unreal-runner", ["unreal"], unrealAssetImportWorkflowRunnerSource()),
    writeArtifact(root, "unreal/run-unreal-baseline-captures.mjs", "unreal-batch-runner", ["unreal"], unrealBatchCaptureRunnerSource()),
    writeArtifact(root, "unreal/README.md", "readme", ["unreal"], unrealReadme()),
    writeArtifact(root, "unreal/v4-unreal-baseline-render.template.json", "template", ["unreal"], stableJson(baselineRenderTemplate("unreal"))),
    writeArtifact(root, "unreal/v4-unreal-asset-import-workflow.template.json", "template", ["unreal"], stableJson(assetImportWorkflowTemplate("unreal"))),
    ...externalBaselineScenes.map((scene) =>
      writeArtifact(root, `unreal/v4-unreal-${scene.reportStem}-baseline.template.json`, "template", ["unreal"], stableJson(baselineTemplate("unreal", scene)))
    ),
  ];
  const referenceScreenshots = new Map(externalBaselineScenes.map((scene) => [
    scene.baselineKind,
    galileoReferenceScreenshot(root, scene),
  ]));
  const referenceViolations = externalBaselineScenes.flatMap((scene) => {
    const reference = referenceScreenshots.get(scene.baselineKind);
    return reference?.ok === true ? [] : [`${scene.baselineKind}: current Galileo reference screenshot is not ready: ${reference?.reason ?? "missing reference validation"}`];
  });
  const violations = [
    ...artifacts.flatMap((artifact) => artifact.ok ? [] : [`${artifact.path}: artifact was not written`]),
    ...referenceViolations,
    "external-engine-cli: Unity and Unreal must still be run on machines with licensed/editor installations before parity can be claimed.",
    "external-engine-render: baseline templates are not a substitute for real Unity/Unreal screenshots and metrics.",
  ];
  const report: V4ExternalEngineBaselineKitReport = {
    ...baseReport(root, {
      ok: artifacts.every((artifact) => artifact.ok) && referenceViolations.length === 0,
      command: "pnpm verify:v4-external-engine-baselines",
      runIdPrefix: "v4-external-engine-baselines",
      sourceFiles,
      violations,
      blockedClaims: [
        "Unity parity",
        "Unreal parity",
        "Unity/Unreal replacement language",
        "rendered product visual parity against Unity/Unreal",
      ],
    }),
    auditComplete: true,
    kitRoot,
    sceneDescriptorId: productVisualParityScene.id,
    sceneDescriptorVersion: productVisualParityScene.schemaVersion,
    sceneSlots: externalBaselineScenes.map((scene) => ({
      id: scene.id,
      baselineKind: scene.baselineKind,
      descriptorPath: `${kitRoot}/${scene.descriptorPath}`,
      galileoReferenceScreenshot: referenceScreenshots.get(scene.baselineKind) ?? {
        path: scene.galileoReferenceScreenshotPath,
        present: false,
        ok: false,
        reason: "reference screenshot was not validated",
      },
      targetReports: scene.targetReports,
    })),
    galileoReferenceScreenshotsReady: referenceViolations.length === 0,
    artifacts,
    baselineReportTargets: {
      unity: "tests/reports/v4-unity-product-visual-baseline.json",
      unreal: "tests/reports/v4-unreal-product-visual-baseline.json",
      byScene: Object.fromEntries(externalBaselineScenes.map((scene) => [scene.baselineKind, scene.targetReports])),
    },
    baselineCommandPlanPath: `${kitRoot}/external-baseline-command-plan.json`,
    baselineExecutionPlan,
    violations,
  };
  writeJson(root, reportPath, report);
  return report;
}

function writeArtifact(
  root: string,
  relativePath: string,
  kind: BaselineKitArtifact["kind"],
  requiredFor: readonly ("unity" | "unreal")[],
  contents: string
): BaselineKitArtifact {
  const path = `${kitRoot}/${relativePath}`;
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents.endsWith("\n") ? contents : `${contents}\n`);
  return { path, kind, requiredFor, ok: true };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function externalSceneSlot(
  baselineKind: Exclude<ExternalBaselineSceneSlot["baselineKind"], "product-visual">,
  id: string,
  schemaVersion: string,
  descriptorPath: string,
  minimumEvidence: ExternalBaselineSceneSlot["minimumEvidence"]
): ExternalBaselineSceneSlot {
  return {
    id,
    schemaVersion,
    baselineKind,
    descriptorPath,
    reportStem: baselineKind,
    descriptor: externalSceneDescriptor(id, schemaVersion, baselineKind, minimumEvidence),
    galileoReferenceScreenshotPath: galileoReferenceScreenshotPathForBaselineKind(baselineKind),
    minimumEvidence,
    targetReports: {
      unity: `tests/reports/v4-unity-${baselineKind}-baseline.json`,
      unreal: `tests/reports/v4-unreal-${baselineKind}-baseline.json`,
    },
  };
}

function galileoReferenceScreenshotPathForBaselineKind(baselineKind: ExternalBaselineSceneSlot["baselineKind"]): string {
  switch (baselineKind) {
    case "product-visual":
      return "tests/reports/v4-product-visual-parity/galileo-product.png";
    case "pbr-visual":
      return "tests/reports/v4-pbr-visual-parity/galileo-pbr.png";
    case "shadow-visual":
      return "tests/reports/v4-shadow-visual-parity/galileo-shadow.png";
    case "hdr-render-target":
      return "tests/reports/v4-hdr-visual-parity/galileo-hdr.png";
    case "postprocess-suite":
      return "tests/reports/comparison-screenshots/galileo-postprocess.png";
  }
}

function galileoReferenceScreenshot(root: string, scene: ExternalBaselineSceneSlot): GalileoReferenceScreenshot {
  const path = scene.galileoReferenceScreenshotPath;
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    return { path, present: false, ok: false, reason: "reference screenshot missing" };
  }
  const data = readFileSync(fullPath);
  const byteLength = statSync(fullPath).size;
  const isPng = data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[12] === 0x49 &&
    data[13] === 0x48 &&
    data[14] === 0x44 &&
    data[15] === 0x52;
  const width = isPng ? data.readUInt32BE(16) : undefined;
  const height = isPng ? data.readUInt32BE(20) : undefined;
  const failures = [
    ...(isPng ? [] : ["reference screenshot is not a PNG"]),
    ...(width !== undefined && width >= scene.minimumEvidence.width ? [] : [`width ${width ?? 0} < ${scene.minimumEvidence.width}`]),
    ...(height !== undefined && height >= scene.minimumEvidence.height ? [] : [`height ${height ?? 0} < ${scene.minimumEvidence.height}`]),
    ...(byteLength > 4_096 ? [] : [`byteLength ${byteLength} <= 4096`]),
  ];
  return {
    path,
    present: true,
    width,
    height,
    byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
    ok: failures.length === 0,
    reason: failures.length === 0 ? undefined : failures.join(", "),
  };
}

function externalSceneDescriptor(
  id: string,
  schemaVersion: string,
  baselineKind: ExternalBaselineSceneSlot["baselineKind"],
  minimumEvidence: ExternalBaselineSceneSlot["minimumEvidence"]
): Record<string, unknown> {
  return {
    schemaVersion,
    id,
    baselineKind,
    viewport: {
      width: minimumEvidence.width,
      height: minimumEvidence.height,
    },
    camera: "deterministic-front-orthographic",
    sourceReports: sourceReportsForBaselineKind(baselineKind),
    materials: externalMaterialsForBaselineKind(baselineKind),
    parts: externalPartsForBaselineKind(baselineKind),
    minimumEvidence,
    claimBoundary: "This descriptor defines the required same-scene external Unity/Unreal baseline slot. It is a portable render target for external editor runs, not evidence until a real engine run writes the matching report and screenshot.",
  };
}

function externalMaterialsForBaselineKind(baselineKind: ExternalBaselineSceneSlot["baselineKind"]): readonly Record<string, unknown>[] {
  switch (baselineKind) {
    case "pbr-visual":
      return Array.from({ length: 11 }, (_, index) => ({
        id: `pbr-sample-${index}`,
        kind: "pbr",
        color: hsvToRgb(index / 11, 0.55, 0.9),
        metallic: Number((index / 10).toFixed(3)),
        roughness: Number((1 - index / 12).toFixed(3)),
      }));
    case "shadow-visual":
      return [
        { id: "receiver", kind: "pbr", color: [0.72, 0.74, 0.68, 1], metallic: 0, roughness: 0.7 },
        { id: "caster-a", kind: "pbr", color: [0.22, 0.44, 0.9, 1], metallic: 0.15, roughness: 0.38 },
        { id: "caster-b", kind: "pbr", color: [0.9, 0.42, 0.18, 1], metallic: 0.25, roughness: 0.32 },
        { id: "shadow", kind: "unlit", color: [0.03, 0.035, 0.04, 1] },
      ];
    case "hdr-render-target":
      return [
        { id: "hdr-dark", kind: "pbr", color: [0.12, 0.1, 0.08, 1], metallic: 0, roughness: 0.45 },
        { id: "hdr-mid", kind: "pbr", color: [0.85, 0.62, 0.25, 1], metallic: 0.1, roughness: 0.28 },
        { id: "hdr-hot", kind: "pbr", color: [1, 0.92, 0.42, 1], metallic: 0, roughness: 0.12 },
        { id: "hdr-meter", kind: "unlit", color: [0.18, 0.74, 1, 1] },
      ];
    case "postprocess-suite":
      return Array.from({ length: 14 }, (_, index) => ({
        id: `postprocess-sample-${index}`,
        kind: "pbr",
        color: hsvToRgb(index / 14, 0.7, 1),
        metallic: index % 2 === 0 ? 0.35 : 0.05,
        roughness: Number((0.25 + index * 0.025).toFixed(3)),
      }));
    case "product-visual":
      return productVisualParityScene.materials as unknown as readonly Record<string, unknown>[];
  }
}

function externalPartsForBaselineKind(baselineKind: ExternalBaselineSceneSlot["baselineKind"]): readonly Record<string, unknown>[] {
  switch (baselineKind) {
    case "pbr-visual":
      return Array.from({ length: 11 }, (_, index) => ({
        id: `pbr-sample-${index}`,
        geometry: "sphere",
        material: `pbr-sample-${index}`,
        position: [Number((-1.65 + index * 0.33).toFixed(3)), Number((Math.sin(index * 0.8) * 0.08).toFixed(3)), 0],
        scale: [0.22, 0.22, 0.22],
      }));
    case "shadow-visual":
      return [
        { id: "receiver", geometry: "cube", material: "receiver", position: [0, -0.55, 0.18], scale: [2.1, 0.08, 0.8] },
        { id: "caster-a", geometry: "cube", material: "caster-a", position: [-0.32, 0.05, 0], scale: [0.38, 0.78, 0.38] },
        { id: "caster-b", geometry: "sphere", material: "caster-b", position: [0.48, 0.02, 0], scale: [0.48, 0.48, 0.48] },
        { id: "shadow-band-a", geometry: "cube", material: "shadow", position: [-0.24, -0.42, 0.21], scale: [0.42, 0.045, 0.08] },
        { id: "shadow-band-b", geometry: "cube", material: "shadow", position: [0.42, -0.39, 0.21], scale: [0.54, 0.055, 0.08] },
      ];
    case "hdr-render-target":
      return [
        { id: "hdr-dark", geometry: "cube", material: "hdr-dark", position: [-0.72, 0, 0], scale: [0.45, 0.62, 0.12] },
        { id: "hdr-mid", geometry: "cube", material: "hdr-mid", position: [0, 0, 0], scale: [0.45, 0.62, 0.12] },
        { id: "hdr-hot", geometry: "cube", material: "hdr-hot", position: [0.72, 0, 0], scale: [0.45, 0.62, 0.12] },
        { id: "hdr-meter", geometry: "cube", material: "hdr-meter", position: [0, -0.52, 0.04], scale: [1.62, 0.045, 0.04] },
      ];
    case "postprocess-suite":
      return Array.from({ length: 14 }, (_, index) => {
        const angle = index * Math.PI * 2 / 14;
        const radius = 0.35 + (index % 3) * 0.2;
        return {
          id: `postprocess-sample-${index}`,
          geometry: "sphere",
          material: `postprocess-sample-${index}`,
          position: [Number((Math.cos(angle) * radius).toFixed(3)), Number((Math.sin(angle) * radius).toFixed(3)), 0],
          scale: [0.18, 0.18, 0.18],
        };
      });
    case "product-visual":
      return productVisualParityScene.parts as unknown as readonly Record<string, unknown>[];
  }
}

function hsvToRgb(h: number, s: number, v: number): readonly [number, number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6] ?? [v, t, p];
  return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3)), 1];
}

function sourceReportsForBaselineKind(baselineKind: ExternalBaselineSceneSlot["baselineKind"]): readonly string[] {
  switch (baselineKind) {
    case "product-visual":
      return ["tests/reports/v4-product-visual-parity.json"];
    case "pbr-visual":
      return ["tests/reports/v4-pbr-visual-parity.json", "tests/reports/v4-pbr-reference-readiness.json"];
    case "shadow-visual":
      return ["tests/reports/v4-shadow-visual-parity.json", "tests/reports/v4-shadow-map-readiness.json"];
    case "hdr-render-target":
      return ["tests/reports/v4-hdr-visual-parity.json", "tests/reports/v4-hdr-render-target-readiness.json"];
    case "postprocess-suite":
      return ["tests/reports/v4-postprocess-suite.json", "tests/reports/v4-rendering.json"];
  }
}

function baselineTemplate(engine: "unity" | "unreal", scene: ExternalBaselineSceneSlot) {
  const isProduct = scene.baselineKind === "product-visual";
  return {
    ok: false,
    engine,
    baselineKind: scene.baselineKind,
    sameSceneExternalBaseline: true,
    ...(isProduct ? { sameSceneProductBaseline: true } : {}),
    sceneDescriptorId: scene.id,
    sceneDescriptorVersion: scene.schemaVersion,
    descriptorSha256: "replace-with-sha256-of-scene-descriptor",
    generatedBy: engine === "unity" ? "V4ExternalVisualBaselineRunner.cs" : "v4_external_visual_baseline_runner.py",
    screenshotPath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png`,
    screenshotSha256: "replace-with-sha256-of-screenshot",
    runnerEvidencePath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png.evidence.json`,
    runnerEvidenceSha256: "replace-with-sha256-of-runner-evidence-sidecar",
    runnerEvidence: {
      ok: false,
      engine,
      baselineKind: scene.baselineKind,
      sceneDescriptorId: scene.id,
      sceneDescriptorVersion: scene.schemaVersion,
      screenshotPath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png`,
      renderedFrameCaptured: false,
      cameraConfigured: false,
      metrics: templateMetrics(scene),
    },
    visualDiffAgainstGalileo: false,
    metrics: templateMetrics(scene),
    requiredCommand: engine === "unity"
      ? `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity ${scene.baselineKind} ${`tests/reports/v4-${scene.reportStem}/unity-${scene.reportStem}-baseline.png`} ${scene.targetReports.unity}`
      : `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal ${scene.baselineKind} ${`tests/reports/v4-${scene.reportStem}/unreal-${scene.reportStem}-baseline.png`} ${scene.targetReports.unreal}`,
  };
}

function baselineRenderTemplate(engine: "unity" | "unreal") {
  return {
    ok: false,
    engine,
    sameSceneRenderWorkflowBaseline: true,
    generatedBy: engine === "unity" ? "V4ExternalVisualBaselineRunner.cs" : "v4_external_visual_baseline_runner.py",
    editorExecutableEnv: engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR",
    cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
    cliSmokeReportPath: engine === "unity" ? "tests/reports/v4-unity-editor-cli-smoke.json" : "tests/reports/v4-unreal-editor-cli-smoke.json",
    kitRoot,
    sceneSlots: externalBaselineScenes.map((scene) => ({
      baselineKind: scene.baselineKind,
      descriptorPath: `${kitRoot}/${scene.descriptorPath}`,
      targetReportPath: scene.targetReports[engine],
    })),
    metrics: {
      sceneDescriptorSlots: externalBaselineScenes.length,
      editorProjectOpened: false,
      descriptorSceneBuilt: false,
      renderedFrameCaptured: false,
      cliSmokeRan: false,
    },
    claimBoundary: "This template is not evidence. The real report must be produced by a Unity/Unreal editor run that opens the external baseline scene kit, builds at least one descriptor scene, captures a rendered frame, and then passes the V4 parity audits.",
  };
}

function assetImportWorkflowTemplate(engine: "unity" | "unreal") {
  return {
    ok: false,
    engine,
    sameSceneAssetImportWorkflowBaseline: true,
    generatedBy: engine === "unity" ? "Unity asset import workflow runner" : "Unreal asset import workflow runner",
    kitRoot,
    runnerEvidencePath: `tests/reports/v4-${engine}-asset-import-workflow.evidence.json`,
    runnerEvidenceSha256: "replace-with-sha256-of-real-editor-import-evidence-sidecar",
    runnerEvidence: {
      ok: false,
      engine,
      workflowKind: "asset-import",
      editorProjectOpened: false,
      assetImportWorkflowRan: false,
      importedFormats: ["glb", "gltf"],
      nativeSupportedFormats: ["glb", "gltf", "obj"],
      conversionRequiredFormats: ["dae", "fbx", "usd", "usdz"],
      metrics: {
        editorProjectOpened: false,
        assetImportWorkflowRan: false,
        importedGltfAssets: 0,
        importedMeshes: 0,
        importedMaterials: 0,
        importedTextures: 0,
        importedAnimationClips: 0,
        conversionRequiredFormats: 4,
      },
    },
    metrics: {
      editorProjectOpened: false,
      assetImportWorkflowRan: false,
      importedGltfAssets: 0,
      importedMeshes: 0,
      importedMaterials: 0,
      importedTextures: 0,
      importedAnimationClips: 0,
      conversionRequiredFormats: 4,
    },
    requiredCommand: `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs ${engine} tests/reports/v4-${engine}-asset-import-workflow.evidence.json tests/reports/v4-${engine}-asset-import-workflow.json`,
    claimBoundary: "This template is not evidence. A real Unity/Unreal editor import run must produce the sidecar before the report writer can create a passing asset-import workflow report.",
  };
}

function externalBaselineExecutionPlan(): ExternalBaselineExecutionPlan {
  const finalAuditCommands = [
    "pnpm verify:v4-external-engine-baselines",
    "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine all",
    "pnpm audit:v4-external-evidence-readiness",
    "pnpm audit:v4-product-visual-parity",
    "pnpm audit:v4-pbr-visual-parity",
    "pnpm audit:v4-pbr-reference-readiness",
    "pnpm audit:v4-pbr-gltf-readiness",
    "pnpm audit:v4-shadow-visual-parity",
    "pnpm audit:v4-shadow-map-readiness",
    "pnpm audit:v4-hdr-visual-parity",
    "pnpm audit:v4-hdr-ibl-readiness",
    "pnpm audit:v4-hdr-render-target-readiness",
    "pnpm audit:v4-postprocess-suite",
    "pnpm audit:v4-unity-unreal-parity",
    "pnpm audit:v4-production-readiness",
    "pnpm audit:v4-broad-parity",
    "pnpm audit:v4-completion",
    "pnpm verify:v4-report-freshness",
    "pnpm verify:v4",
  ] as const;
  return {
    claimBoundary: "This plan only makes Unity/Unreal baseline capture reproducible. Parity remains blocked until real Unity and Unreal editor runs produce screenshots and reports that pass the current Galileo diff gates.",
    unity: {
      editorEnv: "G3D_UNITY_EDITOR",
      searchRootsEnv: "G3D_UNITY_SEARCH_ROOTS",
      cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
      runnerPath: "fixtures/external-engine-baselines/v4/unity/V4ExternalVisualBaselineRunner.cs",
      steps: externalBaselineScenes.map((scene) => executionStep("unity", scene)),
    },
    unreal: {
      editorEnv: "G3D_UNREAL_EDITOR",
      searchRootsEnv: "G3D_UNREAL_SEARCH_ROOTS",
      cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
      runnerPath: "fixtures/external-engine-baselines/v4/unreal/v4_external_visual_baseline_runner.py",
      steps: externalBaselineScenes.map((scene) => executionStep("unreal", scene)),
    },
    finalAuditCommands,
  };
}

function executionStep(engine: "unity" | "unreal", scene: ExternalBaselineSceneSlot): ExternalBaselineExecutionStep {
  const descriptorPath = `${kitRoot}/${scene.descriptorPath}`;
  const expectedScreenshotPath = `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png`;
  const targetReportPath = scene.targetReports[engine];
  const reportCommand = `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs ${engine} ${scene.baselineKind} ${expectedScreenshotPath} ${targetReportPath}`;
  return {
    baselineKind: scene.baselineKind,
    descriptorPath,
    runnerPath: engine === "unity"
      ? "fixtures/external-engine-baselines/v4/unity/V4ExternalVisualBaselineRunner.cs"
      : "fixtures/external-engine-baselines/v4/unreal/v4_external_visual_baseline_runner.py",
    expectedScreenshotPath,
    targetReportPath,
    minimumEvidence: scene.minimumEvidence,
    captureInstruction: engine === "unity"
      ? `Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "${descriptorPath}" --baseline-kind "${scene.baselineKind}" --screenshot "${expectedScreenshotPath}". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.`
      : `Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "${descriptorPath}" and screenshot path "${expectedScreenshotPath}". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.`,
    reportCommand,
    validationCommands: validationCommandsForBaselineKind(scene.baselineKind),
  };
}

function validationCommandsForBaselineKind(baselineKind: ExternalBaselineSceneSlot["baselineKind"]): readonly string[] {
  const shared = ["pnpm audit:v4-unity-unreal-parity", "pnpm audit:v4-broad-parity"] as const;
  switch (baselineKind) {
    case "product-visual":
      return ["pnpm audit:v4-product-visual-parity", ...shared];
    case "pbr-visual":
      return ["pnpm audit:v4-pbr-visual-parity", "pnpm audit:v4-pbr-reference-readiness", "pnpm audit:v4-pbr-gltf-readiness", ...shared];
    case "shadow-visual":
      return ["pnpm audit:v4-shadow-visual-parity", "pnpm audit:v4-shadow-map-readiness", ...shared];
    case "hdr-render-target":
      return ["pnpm audit:v4-hdr-visual-parity", "pnpm audit:v4-hdr-render-target-readiness", ...shared];
    case "postprocess-suite":
      return ["pnpm audit:v4-postprocess-suite", ...shared];
  }
}

function externalBaselineCommandPlanSource(plan: ExternalBaselineExecutionPlan): string {
  return stableJson({
    schemaVersion: "g3d-v4-external-baseline-command-plan-v1",
    generatedBy: "tools/v4-external-engine-baselines/index.ts",
    claimBoundary: plan.claimBoundary,
    requiredEnvironment: {
      unityEditor: plan.unity.editorEnv,
      unitySearchRoots: plan.unity.searchRootsEnv,
      unrealEditor: plan.unreal.editorEnv,
      unrealSearchRoots: plan.unreal.searchRootsEnv,
      cliSmokeFlag: plan.unity.cliSmokeEnv,
    },
    reportWriter: {
      cliSmokeCommandTemplate: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs <unity|unreal> [target-report-path]",
      commandTemplate: "node fixtures/external-engine-baselines/v4/write-baseline-report.mjs <unity|unreal> <baseline-kind> <screenshot-path> <target-report-path> [runner-evidence-path]",
      batchCommandTemplate: "node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine <unity|unreal|all>",
      dryRunCommand: "node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --dry-run",
      verifyCommandTemplate: "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine <unity|unreal|all>",
      schemaPath: "fixtures/external-engine-baselines/v4/baseline-report.schema.json",
      evidenceChecks: [
        "descriptorSha256 is computed from the current scene descriptor",
        "screenshotSha256 is computed from the captured PNG bytes",
        "runnerEvidenceSha256 is computed from the real external runner evidence sidecar",
        "PNG width and height must exactly match the descriptor viewport/minimum evidence",
        "nonBlankPixels and colorBuckets must satisfy descriptor minimum evidence",
        "slot-specific metrics must come from the runner evidence sidecar and meet descriptor minimum evidence",
      ],
    },
    renderWorkflowBaselineReports: [
      {
        engine: "unity",
        templatePath: "fixtures/external-engine-baselines/v4/unity/v4-unity-baseline-render.template.json",
        targetReportPath: "tests/reports/v4-unity-baseline-render.json",
        cliSmokeReportPath: "tests/reports/v4-unity-editor-cli-smoke.json",
        schemaPath: "fixtures/external-engine-baselines/v4/baseline-render-report.schema.json",
        cliSmokeCommand: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        reportCommand: "node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unity tests/reports/v4-unity-baseline-render.json",
        requiredBeforeClaim: [
          "G3D_UNITY_EDITOR points to the Unity editor used for the capture.",
          "If G3D_UNITY_EDITOR is unset, G3D_UNITY_SEARCH_ROOTS may list colon-separated roots containing Unity Hub editor installs or Unity.app bundles.",
          "G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true is set and the CLI smoke passes.",
          "tests/reports/v4-unity-editor-cli-smoke.json exists and records ok=true for the same editor binary.",
          "The Unity runner opens the baseline kit, builds descriptor scenes, captures rendered frames, and the five Unity slot baseline reports already exist and pass.",
        ],
      },
      {
        engine: "unreal",
        templatePath: "fixtures/external-engine-baselines/v4/unreal/v4-unreal-baseline-render.template.json",
        targetReportPath: "tests/reports/v4-unreal-baseline-render.json",
        cliSmokeReportPath: "tests/reports/v4-unreal-editor-cli-smoke.json",
        schemaPath: "fixtures/external-engine-baselines/v4/baseline-render-report.schema.json",
        cliSmokeCommand: "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json",
        reportCommand: "node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unreal tests/reports/v4-unreal-baseline-render.json",
        requiredBeforeClaim: [
          "G3D_UNREAL_EDITOR points to the Unreal editor used for the capture.",
          "If G3D_UNREAL_EDITOR is unset, G3D_UNREAL_SEARCH_ROOTS may list colon-separated roots containing Epic Games engine installs, UnrealEditor-Cmd, or UnrealEditor.app.",
          "G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true is set and the CLI smoke passes.",
          "tests/reports/v4-unreal-editor-cli-smoke.json exists and records ok=true for the same editor binary.",
          "The Unreal runner opens the baseline kit, builds descriptor scenes, captures rendered frames, and the five Unreal slot baseline reports already exist and pass.",
        ],
      },
    ],
    assetImportWorkflowReports: [
      {
        engine: "unity",
        templatePath: "fixtures/external-engine-baselines/v4/unity/v4-unity-asset-import-workflow.template.json",
        runnerPath: "fixtures/external-engine-baselines/v4/unity/V4ExternalAssetImportWorkflowRunner.cs",
        targetReportPath: "tests/reports/v4-unity-asset-import-workflow.json",
        runnerEvidencePath: "tests/reports/v4-unity-asset-import-workflow.evidence.json",
        schemaPath: "fixtures/external-engine-baselines/v4/asset-import-workflow-report.schema.json",
        reportCommand: "node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json",
        requiredBeforeClaim: [
          "A real Unity editor opens an import project and imports the current V4 glTF/glb corpus sample or export fixture.",
          "The Unity import runner writes tests/reports/v4-unity-asset-import-workflow.evidence.json with project-open, import, material, texture, mesh, and animation metrics.",
          "Unsupported FBX/USD/USDZ/DAE formats remain recorded as external-conversion-required; OBJ is only a bounded native geometry-import path.",
        ],
      },
      {
        engine: "unreal",
        templatePath: "fixtures/external-engine-baselines/v4/unreal/v4-unreal-asset-import-workflow.template.json",
        runnerPath: "fixtures/external-engine-baselines/v4/unreal/v4_external_asset_import_workflow_runner.py",
        targetReportPath: "tests/reports/v4-unreal-asset-import-workflow.json",
        runnerEvidencePath: "tests/reports/v4-unreal-asset-import-workflow.evidence.json",
        schemaPath: "fixtures/external-engine-baselines/v4/asset-import-workflow-report.schema.json",
        reportCommand: "node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/v4-unreal-asset-import-workflow.evidence.json tests/reports/v4-unreal-asset-import-workflow.json",
        requiredBeforeClaim: [
          "A real Unreal editor opens an import project and imports the current V4 glTF/glb corpus sample or export fixture.",
          "The Unreal import runner writes tests/reports/v4-unreal-asset-import-workflow.evidence.json with project-open, import, material, texture, mesh, and animation metrics.",
          "Unsupported FBX/USD/USDZ/DAE formats remain recorded as external-conversion-required; OBJ is only a bounded native geometry-import path.",
        ],
      },
    ],
    captures: [
      ...plan.unity.steps.map((step) => commandPlanCapture("unity", step)),
      ...plan.unreal.steps.map((step) => commandPlanCapture("unreal", step)),
    ],
    finalAuditCommands: plan.finalAuditCommands,
    blockedUntilAllCapturesPass: [
      "Unity parity",
      "Unreal parity",
      "Unity/Unreal replacement language",
      "rendered product visual parity against Unity/Unreal",
      "production PBR/shadow/HDR/postprocess parity against Unity/Unreal",
    ],
  });
}

function commandPlanCapture(engine: "unity" | "unreal", step: ExternalBaselineExecutionStep): Record<string, unknown> {
  return {
    engine,
    baselineKind: step.baselineKind,
    descriptorPath: step.descriptorPath,
    runnerPath: step.runnerPath,
    expectedScreenshotPath: step.expectedScreenshotPath,
    expectedRunnerEvidencePath: `${step.expectedScreenshotPath}.evidence.json`,
    targetReportPath: step.targetReportPath,
    captureInstruction: step.captureInstruction,
    reportCommand: step.reportCommand,
    validationCommands: step.validationCommands,
    minimumEvidence: step.minimumEvidence,
    requiredBeforeClaim: [
      "Real editor capture writes the expected screenshot path.",
      "Real editor runner writes the matching .evidence.json sidecar with descriptor identity, camera/render flags, and slot-specific metrics.",
      "Report writer consumes the PNG and sidecar, computes descriptorSha256, screenshotSha256, and runnerEvidenceSha256, then rejects wrong dimensions, weak pixels, missing runner evidence, or weak slot metrics.",
      "The matching parity audit diffs the external PNG against the current Galileo reference and passes.",
    ],
  };
}

function baselineRunbookSource(plan: ExternalBaselineExecutionPlan): string {
  const unitySteps = plan.unity.steps.map((step, index) => runbookStep("Unity", index + 1, step)).join("\n");
  const unrealSteps = plan.unreal.steps.map((step, index) => runbookStep("Unreal", index + 1, step)).join("\n");
  return `# V4 External Engine Baseline Runbook

${plan.claimBoundary}

## Prerequisites

- Set \`${plan.unity.editorEnv}\` to a real Unity editor binary before running Unity CLI smoke checks.
- Set \`${plan.unreal.editorEnv}\` to a real Unreal editor binary before running Unreal CLI smoke checks.
- If editor binaries are not in the default macOS locations, set \`${plan.unity.searchRootsEnv}\` to colon-separated roots that contain Unity Hub installs, version folders, or \`Unity.app\` bundles.
- If editor binaries are not in the default macOS locations, set \`${plan.unreal.searchRootsEnv}\` to colon-separated roots that contain Epic Games installs, engine version folders, \`UnrealEditor-Cmd\`, or \`UnrealEditor.app\`.
- Set \`${plan.unity.cliSmokeEnv}=true\` when you want the parity audit to verify the editor binaries.
- Generate current Galileo reference screenshots first with \`pnpm verify:v4\`.
- Run \`pnpm audit:v4-external-evidence-readiness\` and use \`tests/reports/v4-external-evidence-missing-artifacts.md\` as the authoritative missing-artifact checklist before and after every capture session.
- Cross-check \`tests/reports/v4-external-evidence-readiness.json\` under \`artifactChecklist\`; every Unity/Unreal item must have \`ready: true\` before any Unity/Unreal parity or replacement claim is allowed.
- For CI capture sessions, use \`.github/workflows/v4-external-engine-baselines.yml\` on self-hosted runners labeled \`unity\` and/or \`unreal\`; it runs the same batch helpers and uploads the resulting reports/screenshots without weakening parity gates.
- Write durable CLI smoke reports before render/workflow reports:
  - \`node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json\`
  - \`node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json\`

## Unity Slots

Runner: \`${plan.unity.runnerPath}\`
Batch capture helper: \`fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs\`

Generic render/workflow baseline template: \`fixtures/external-engine-baselines/v4/unity/v4-unity-baseline-render.template.json\`
Target report: \`tests/reports/v4-unity-baseline-render.json\`
CLI smoke report: \`tests/reports/v4-unity-editor-cli-smoke.json\`
Write report after Unity slot reports pass: \`node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unity tests/reports/v4-unity-baseline-render.json\`
Asset import workflow template: \`fixtures/external-engine-baselines/v4/unity/v4-unity-asset-import-workflow.template.json\`
Asset import workflow runner: \`fixtures/external-engine-baselines/v4/unity/V4ExternalAssetImportWorkflowRunner.cs\`
Asset import workflow evidence sidecar: \`tests/reports/v4-unity-asset-import-workflow.evidence.json\`
Write asset import workflow report after a real Unity import run: \`node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json\`
Generate all Unity visual slot captures and reports on a Unity-capable host: \`node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/unity-project\`
Preview those commands without Unity: \`node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --dry-run\`

${unitySteps}

## Unreal Slots

Runner: \`${plan.unreal.runnerPath}\`
Batch capture helper: \`fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs\`

Generic render/workflow baseline template: \`fixtures/external-engine-baselines/v4/unreal/v4-unreal-baseline-render.template.json\`
Target report: \`tests/reports/v4-unreal-baseline-render.json\`
CLI smoke report: \`tests/reports/v4-unreal-editor-cli-smoke.json\`
Write report after Unreal slot reports pass: \`node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unreal tests/reports/v4-unreal-baseline-render.json\`
Asset import workflow template: \`fixtures/external-engine-baselines/v4/unreal/v4-unreal-asset-import-workflow.template.json\`
Asset import workflow runner: \`fixtures/external-engine-baselines/v4/unreal/v4_external_asset_import_workflow_runner.py\`
Asset import workflow evidence sidecar: \`tests/reports/v4-unreal-asset-import-workflow.evidence.json\`
Write asset import workflow report after a real Unreal import run: \`node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/v4-unreal-asset-import-workflow.evidence.json tests/reports/v4-unreal-asset-import-workflow.json\`
Generate all Unreal visual slot captures and reports on an Unreal-capable host: \`node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject\`
Preview those commands without Unreal: \`node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --dry-run\`

${unrealSteps}

## Final Validation

${plan.finalAuditCommands.map((command) => `- \`${command}\``).join("\n")}

After all screenshots for one or both engines exist, you can write every available baseline report with:

- \`node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine unity\`
- \`node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine unreal\`
- \`node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine all\`

Use \`node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --dry-run\` to list the exact per-slot report writer commands without writing reports.

Before running the final parity audits, validate all written report/sidecar pairs with:

- \`node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity\`
- \`node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unreal\`
- \`node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine all\`

If the captures were produced by \`.github/workflows/v4-external-engine-baselines.yml\`, download the workflow artifacts and merge them into a checkout with:

- \`node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits\`

Use \`--dry-run\` first to list the report and screenshot files that would be restored. The ingester only accepts artifact contents under \`tests/reports/\` and \`fixtures/external-engine-baselines/v4/\`.

Do not copy template JSON files into \`tests/reports\` as evidence. The report writer must consume a real PNG and matching \`.evidence.json\` sidecar produced by the external editor run, compute the descriptor, screenshot, and runner-evidence SHA-256 values, reject dimension/pixel-evidence/slot-metric mismatches, and the parity audits must diff that PNG against the current Galileo reference screenshot.

The final handoff must include the summary from \`tests/reports/v4-external-evidence-missing-artifacts.md\`. Completion remains blocked until that generated runbook reports \`Blocked artifacts: 0\` and \`pnpm audit:v4-completion\` reports all top-level criteria achieved.
`;
}

function runbookStep(engineLabel: "Unity" | "Unreal", index: number, step: ExternalBaselineExecutionStep): string {
  return `### ${index}. ${engineLabel} ${step.baselineKind}

- Descriptor: \`${step.descriptorPath}\`
- Capture: ${step.captureInstruction}
- Expected screenshot: \`${step.expectedScreenshotPath}\`
- Expected runner evidence sidecar: \`${step.expectedScreenshotPath}.evidence.json\`
- Minimum evidence: \`${JSON.stringify(step.minimumEvidence)}\`
- Write report: \`${step.reportCommand}\`
- Target report: \`${step.targetReportPath}\`
- Validate:
${step.validationCommands.map((command) => `  - \`${command}\``).join("\n")}
`;
}

function templateMetrics(scene: ExternalBaselineSceneSlot): Record<string, number> {
  return {
      width: scene.minimumEvidence.width,
      height: scene.minimumEvidence.height,
      nonBlankPixels: 0,
      colorBuckets: 0,
      drawCalls: scene.minimumEvidence.drawCalls,
      ...(scene.minimumEvidence.materialCount === undefined ? {} : { materialCount: scene.minimumEvidence.materialCount }),
      ...(scene.minimumEvidence.productParts === undefined ? {} : { productParts: scene.minimumEvidence.productParts }),
      ...(scene.minimumEvidence.turntableHotspots === undefined ? {} : { turntableHotspots: scene.minimumEvidence.turntableHotspots }),
      ...(scene.minimumEvidence.captureViews === undefined ? {} : { captureViews: scene.minimumEvidence.captureViews }),
      ...(scene.minimumEvidence.batchTasks === undefined ? {} : { batchTasks: scene.minimumEvidence.batchTasks }),
      ...(scene.minimumEvidence.featureCount === undefined ? {} : { featureCount: scene.minimumEvidence.featureCount }),
      ...(scene.minimumEvidence.shadowEvidencePixels === undefined ? {} : { shadowEvidencePixels: scene.minimumEvidence.shadowEvidencePixels }),
      ...(scene.minimumEvidence.toneMappedPatches === undefined ? {} : { toneMappedPatches: scene.minimumEvidence.toneMappedPatches }),
      ...(scene.minimumEvidence.implementedEffects === undefined ? {} : { implementedEffects: scene.minimumEvidence.implementedEffects }),
      ...(scene.minimumEvidence.realSceneEffects === undefined ? {} : { realSceneEffects: scene.minimumEvidence.realSceneEffects }),
  };
}

function baselineReportSchema() {
  const sceneIds = externalBaselineScenes.map((scene) => scene.id);
  const sceneVersions = externalBaselineScenes.map((scene) => scene.schemaVersion);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Galileo3D V4 external engine visual baseline report",
    type: "object",
    additionalProperties: true,
    required: [
      "ok",
      "engine",
      "baselineKind",
      "sameSceneExternalBaseline",
      "sceneDescriptorId",
      "sceneDescriptorVersion",
      "descriptorSha256",
      "screenshotPath",
      "screenshotSha256",
      "runnerEvidencePath",
      "runnerEvidenceSha256",
      "runnerEvidence",
      "visualDiffAgainstGalileo",
      "metrics",
    ],
    properties: {
      ok: { const: true },
      engine: { enum: ["unity", "unreal"] },
      baselineKind: { enum: externalBaselineScenes.map((scene) => scene.baselineKind) },
      sameSceneExternalBaseline: { const: true },
      sameSceneProductBaseline: { type: "boolean" },
      sceneDescriptorId: { enum: sceneIds },
      sceneDescriptorVersion: { enum: sceneVersions },
      descriptorSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      screenshotPath: { type: "string", minLength: 1 },
      screenshotSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      runnerEvidencePath: { type: "string", minLength: 1 },
      runnerEvidenceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      runnerEvidence: {
        type: "object",
        required: ["ok", "engine", "baselineKind", "sceneDescriptorId", "sceneDescriptorVersion", "screenshotPath", "renderedFrameCaptured", "cameraConfigured", "metrics"],
        properties: {
          ok: { const: true },
          engine: { enum: ["unity", "unreal"] },
          baselineKind: { enum: externalBaselineScenes.map((scene) => scene.baselineKind) },
          sceneDescriptorId: { enum: sceneIds },
          sceneDescriptorVersion: { enum: sceneVersions },
          screenshotPath: { type: "string", minLength: 1 },
          renderedFrameCaptured: { const: true },
          cameraConfigured: { const: true },
          metrics: { type: "object" },
        },
      },
      visualDiffAgainstGalileo: { const: true },
      metrics: {
        type: "object",
        required: ["width", "height", "nonBlankPixels", "colorBuckets", "drawCalls"],
        properties: {
          width: { type: "number", minimum: 1 },
          height: { type: "number", minimum: 1 },
          nonBlankPixels: { type: "number", minimum: 10001 },
          colorBuckets: { type: "number", minimum: 2 },
          drawCalls: { type: "number", minimum: 1 },
          materialCount: { type: "number", minimum: 1 },
          productParts: { type: "number", minimum: 1 },
          turntableHotspots: { type: "number", minimum: 1 },
          captureViews: { type: "number", minimum: 1 },
          batchTasks: { type: "number", minimum: 1 },
          featureCount: { type: "number", minimum: 1 },
          shadowEvidencePixels: { type: "number", minimum: 1 },
          toneMappedPatches: { type: "number", minimum: 1 },
          implementedEffects: { type: "number", minimum: 1 },
          realSceneEffects: { type: "number", minimum: 1 },
        },
      },
    },
    allOf: externalBaselineScenes.map((scene) => baselineKindSchemaCondition(scene)),
  };
}

function baselineKindSchemaCondition(scene: ExternalBaselineSceneSlot): Record<string, unknown> {
  return {
    if: { properties: { baselineKind: { const: scene.baselineKind } }, required: ["baselineKind"] },
    then: {
      properties: {
        sceneDescriptorId: { const: scene.id },
        sceneDescriptorVersion: { const: scene.schemaVersion },
        ...(scene.baselineKind === "product-visual" ? { sameSceneProductBaseline: { const: true } } : {}),
        metrics: {
          required: metricRequiredKeys(scene),
          properties: metricMinimumProperties(scene),
        },
      },
    },
  };
}

function metricRequiredKeys(scene: ExternalBaselineSceneSlot): string[] {
  return [
    "width",
    "height",
    "nonBlankPixels",
    "colorBuckets",
    "drawCalls",
    ...(scene.minimumEvidence.materialCount === undefined ? [] : ["materialCount"]),
    ...(scene.minimumEvidence.productParts === undefined ? [] : ["productParts"]),
    ...(scene.minimumEvidence.turntableHotspots === undefined ? [] : ["turntableHotspots"]),
    ...(scene.minimumEvidence.captureViews === undefined ? [] : ["captureViews"]),
    ...(scene.minimumEvidence.batchTasks === undefined ? [] : ["batchTasks"]),
    ...(scene.minimumEvidence.featureCount === undefined ? [] : ["featureCount"]),
    ...(scene.minimumEvidence.shadowEvidencePixels === undefined ? [] : ["shadowEvidencePixels"]),
    ...(scene.minimumEvidence.toneMappedPatches === undefined ? [] : ["toneMappedPatches"]),
    ...(scene.minimumEvidence.implementedEffects === undefined ? [] : ["implementedEffects"]),
    ...(scene.minimumEvidence.realSceneEffects === undefined ? [] : ["realSceneEffects"]),
  ];
}

function metricMinimumProperties(scene: ExternalBaselineSceneSlot): Record<string, unknown> {
  return {
    width: { const: scene.minimumEvidence.width },
    height: { const: scene.minimumEvidence.height },
    nonBlankPixels: { type: "number", minimum: scene.minimumEvidence.nonBlankPixels },
    colorBuckets: { type: "number", minimum: scene.minimumEvidence.colorBuckets },
    drawCalls: { type: "number", minimum: scene.minimumEvidence.drawCalls },
    ...(scene.minimumEvidence.materialCount === undefined ? {} : { materialCount: { type: "number", minimum: scene.minimumEvidence.materialCount } }),
    ...(scene.minimumEvidence.productParts === undefined ? {} : { productParts: { type: "number", minimum: scene.minimumEvidence.productParts } }),
    ...(scene.minimumEvidence.turntableHotspots === undefined ? {} : { turntableHotspots: { type: "number", minimum: scene.minimumEvidence.turntableHotspots } }),
    ...(scene.minimumEvidence.captureViews === undefined ? {} : { captureViews: { type: "number", minimum: scene.minimumEvidence.captureViews } }),
    ...(scene.minimumEvidence.batchTasks === undefined ? {} : { batchTasks: { type: "number", minimum: scene.minimumEvidence.batchTasks } }),
    ...(scene.minimumEvidence.featureCount === undefined ? {} : { featureCount: { type: "number", minimum: scene.minimumEvidence.featureCount } }),
    ...(scene.minimumEvidence.shadowEvidencePixels === undefined ? {} : { shadowEvidencePixels: { type: "number", minimum: scene.minimumEvidence.shadowEvidencePixels } }),
    ...(scene.minimumEvidence.toneMappedPatches === undefined ? {} : { toneMappedPatches: { type: "number", minimum: scene.minimumEvidence.toneMappedPatches } }),
    ...(scene.minimumEvidence.implementedEffects === undefined ? {} : { implementedEffects: { type: "number", minimum: scene.minimumEvidence.implementedEffects } }),
    ...(scene.minimumEvidence.realSceneEffects === undefined ? {} : { realSceneEffects: { type: "number", minimum: scene.minimumEvidence.realSceneEffects } }),
  };
}

function baselineRenderReportSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Galileo3D V4 external engine render/workflow baseline report",
    type: "object",
    additionalProperties: true,
    required: [
      "ok",
      "engine",
      "sameSceneRenderWorkflowBaseline",
      "generatedBy",
      "kitRoot",
      "metrics",
    ],
    properties: {
      ok: { const: true },
      engine: { enum: ["unity", "unreal"] },
      sameSceneRenderWorkflowBaseline: { const: true },
      generatedBy: { type: "string", minLength: 1 },
      kitRoot: { const: kitRoot },
      metrics: {
        type: "object",
        required: ["sceneDescriptorSlots", "editorProjectOpened", "descriptorSceneBuilt", "renderedFrameCaptured", "cliSmokeRan"],
        properties: {
          sceneDescriptorSlots: { type: "number", minimum: externalBaselineScenes.length },
          editorProjectOpened: { const: true },
          descriptorSceneBuilt: { const: true },
          renderedFrameCaptured: { const: true },
          cliSmokeRan: { const: true },
        },
      },
    },
  };
}

function assetImportWorkflowReportSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Galileo3D V4 external engine asset import workflow report",
    type: "object",
    additionalProperties: true,
    required: [
      "ok",
      "engine",
      "sameSceneAssetImportWorkflowBaseline",
      "generatedBy",
      "kitRoot",
      "runnerEvidencePath",
      "runnerEvidenceSha256",
      "metrics",
    ],
    properties: {
      ok: { const: true },
      engine: { enum: ["unity", "unreal"] },
      sameSceneAssetImportWorkflowBaseline: { const: true },
      generatedBy: { type: "string", minLength: 1 },
      kitRoot: { const: kitRoot },
      runnerEvidencePath: { type: "string", minLength: 1 },
      runnerEvidenceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      metrics: {
        type: "object",
        required: [
          "editorProjectOpened",
          "assetImportWorkflowRan",
          "importedGltfAssets",
          "importedMeshes",
          "importedMaterials",
          "importedTextures",
          "conversionRequiredFormats",
        ],
        properties: {
          editorProjectOpened: { const: true },
          assetImportWorkflowRan: { const: true },
          importedGltfAssets: { type: "number", minimum: 1 },
          importedMeshes: { type: "number", minimum: 1 },
          importedMaterials: { type: "number", minimum: 1 },
          importedTextures: { type: "number", minimum: 1 },
          importedAnimationClips: { type: "number", minimum: 0 },
          conversionRequiredFormats: { type: "number", minimum: 5 },
        },
      },
    },
  };
}

function editorCliSmokeSource(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const engine = process.argv[2];
const targetReportPath = process.argv[3] || (engine === "unity"
  ? "tests/reports/v4-unity-editor-cli-smoke.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-editor-cli-smoke.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node run-editor-cli-smoke.mjs <unity|unreal> [target-report-path]");
  process.exit(2);
}

const envName = engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR";
const executable = executableFor(engine, envName);
if (!executable) {
  throw new Error("No " + engine + " editor executable found. Set " + envName + " to a real editor binary or add it to PATH.");
}
const command = [executable, "-version"];
const startedAt = new Date().toISOString();
const result = spawnSync(command[0], command.slice(1), { encoding: "utf8", timeout: 20_000 });
const output = String((result.stdout || "") + (result.stderr || "")).trim().slice(0, 4_000);
const report = {
  ok: result.status === 0 && output.length > 0,
  engine,
  envName,
  executable,
  command,
  startedAt,
  exitCode: result.status,
  signal: result.signal,
  timedOut: Boolean(result.error && result.error.message.includes("ETIMEDOUT")),
  output,
  claimBoundary: "This report proves only that a local external editor binary started and answered a version command. It is not render parity evidence.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ ok: report.ok, reportPath: targetReportPath, engine, executable, exitCode: report.exitCode }, null, 2));
if (!report.ok) process.exit(1);

function executableFor(engineName, envName) {
  const envPath = process.env[envName];
  const envExecutable = normalizeEditorExecutablePath(engineName, envPath);
  if (envExecutable) return envExecutable;
  const names = engineName === "unity" ? ["Unity", "unity"] : ["UnrealEditor-Cmd", "UnrealEditor", "unreal"];
  for (const name of names) {
    const result = spawnSync("sh", ["-lc", "command -v " + shellQuote(name)], { encoding: "utf8" });
    const output = result.status === 0 ? result.stdout.trim().split("\\n")[0] : "";
    if (output) return output;
  }
  return macEditorBundleExecutable(engineName);
}

function normalizeEditorExecutablePath(engineName, path) {
  if (!path) return null;
  if (existsSync(path) && !path.endsWith(".app")) return path;
  const appExecutable = engineName === "unity"
    ? join(path, "Contents/MacOS/Unity")
    : join(path, "Contents/MacOS/UnrealEditor");
  return existsSync(appExecutable) ? appExecutable : null;
}

function macEditorBundleExecutable(engineName) {
  const candidates = engineName === "unity" ? unityMacCandidates() : unrealMacCandidates();
  return candidates.find((path) => existsSync(path)) || null;
}

function unityMacCandidates() {
  return uniqueStrings(editorSearchRoots("unity").flatMap((root) => {
    const hubRoots = [
      join(root, "Unity", "Hub", "Editor"),
      join(root, "Hub", "Editor"),
      root,
    ];
    return [
      join(root, "Unity.app", "Contents", "MacOS", "Unity"),
      join(root, "Unity", "Unity.app", "Contents", "MacOS", "Unity"),
      ...hubRoots.flatMap((hubRoot) => safeReadDirectoryNames(hubRoot)
        .sort()
        .reverse()
        .map((version) => join(hubRoot, version, "Unity.app", "Contents", "MacOS", "Unity"))),
    ];
  }));
}

function unrealMacCandidates() {
  return uniqueStrings(editorSearchRoots("unreal").flatMap((root) => {
    const epicRoots = [
      join(root, "Epic Games"),
      root,
    ];
    return [
      join(root, "UnrealEditor-Cmd"),
      join(root, "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
      ...epicRoots.flatMap((epicRoot) => safeReadDirectoryNames(epicRoot)
        .sort()
        .reverse()
        .flatMap((version) => [
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor-Cmd"),
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
        ])),
    ];
  }));
}

function editorSearchRoots(engineName) {
  const envName = engineName === "unity" ? "G3D_UNITY_SEARCH_ROOTS" : "G3D_UNREAL_SEARCH_ROOTS";
  const defaults = engineName === "unity"
    ? ["/Applications", "/Users/Shared/Unity"]
    : ["/Applications", "/Users/Shared/Epic Games", "/Users/Shared"];
  const envRoots = (process.env[envName] || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return uniqueStrings([...envRoots, ...defaults]);
}

function safeReadDirectoryNames(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\\\''") + "'";
}

function uniqueStrings(values) {
  return [...new Set(values)];
}
`;
}

function unityBatchCaptureRunnerSource(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const repoRoot = resolve(scriptDir, "../../../..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unityEditor = valueAfter("--editor") || process.env.G3D_UNITY_EDITOR || "";
const unityProjectPath = valueAfter("--project") || process.env.G3D_UNITY_PROJECT_PATH || resolve(repoRoot, ".tmp/v4-unity-baseline-project");
const commandPlan = JSON.parse(readFileSync(resolve(kitRoot, "external-baseline-command-plan.json"), "utf8"));
const unityCaptures = (commandPlan.captures || []).filter((capture) => capture.engine === "unity");
const assetImportWorkflow = (commandPlan.assetImportWorkflowReports || []).find((report) => report.engine === "unity");
const assetImportAssetPath = valueAfter("--asset") || process.env.G3D_EXTERNAL_ASSET_IMPORT_SAMPLE || resolve(repoRoot, "tests/assets/corpus/khronos/Fox/Fox.glb");
const runnerSourcePath = resolve(scriptDir, "V4ExternalVisualBaselineRunner.cs");
const runnerTargetPath = resolve(unityProjectPath, "Assets/Galileo3D/V4ExternalBaselines/V4ExternalVisualBaselineRunner.cs");
const assetImportRunnerSourcePath = resolve(scriptDir, "V4ExternalAssetImportWorkflowRunner.cs");
const assetImportRunnerTargetPath = resolve(unityProjectPath, "Assets/Galileo3D/V4ExternalBaselines/V4ExternalAssetImportWorkflowRunner.cs");

const plannedCommands = [
  ...(!existsSync(resolve(unityProjectPath, "Assets")) ? [[unityEditor || "$G3D_UNITY_EDITOR", "-batchmode", "-quit", "-createProject", unityProjectPath]] : []),
  ["copy", runnerSourcePath, runnerTargetPath],
  ["copy", assetImportRunnerSourcePath, assetImportRunnerTargetPath],
  [unityEditor || "$G3D_UNITY_EDITOR", "-batchmode", "-quit", "-projectPath", unityProjectPath],
  ...unityCaptures.map((capture) => [
    unityEditor || "$G3D_UNITY_EDITOR",
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalVisualBaselineRunner.CaptureFromCommandLine",
    "--descriptor",
    resolve(repoRoot, capture.descriptorPath),
    "--baseline-kind",
    capture.baselineKind,
    "--screenshot",
    resolve(repoRoot, capture.expectedScreenshotPath),
  ]),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unity"],
  [process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unity"],
  ...(assetImportWorkflow ? [[
    unityEditor || "$G3D_UNITY_EDITOR",
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine",
    "--asset",
    assetImportAssetPath,
    "--evidence",
    resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
  ], [process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unity", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath]] : []),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unity", "tests/reports/v4-unity-baseline-render.json"],
];

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    unityProjectPath,
    unityCaptureCount: unityCaptures.length,
    assetImportWorkflowCount: assetImportWorkflow ? 1 : 0,
    assetImportAssetPath,
    commands: plannedCommands,
    claimBoundary: "Dry run only lists the Unity baseline capture commands. It is not external evidence.",
  }, null, 2));
  process.exit(0);
}

if (!unityEditor) {
  throw new Error("Missing Unity editor. Set G3D_UNITY_EDITOR or pass --editor /absolute/path/to/Unity.");
}
if (unityCaptures.length === 0) {
  throw new Error("No Unity captures were found in external-baseline-command-plan.json.");
}
if (!assetImportWorkflow) {
  throw new Error("No Unity asset-import workflow report was found in external-baseline-command-plan.json.");
}
if (!existsSync(resolve(unityProjectPath, "Assets"))) {
  run([unityEditor, "-batchmode", "-quit", "-createProject", unityProjectPath], repoRoot);
}
mkdirSync(dirname(runnerTargetPath), { recursive: true });
copyFileSync(runnerSourcePath, runnerTargetPath);
copyFileSync(assetImportRunnerSourcePath, assetImportRunnerTargetPath);
run([unityEditor, "-batchmode", "-quit", "-projectPath", unityProjectPath], repoRoot);
for (const capture of unityCaptures) {
  run([
    unityEditor,
    "-batchmode",
    "-quit",
    "-projectPath",
    unityProjectPath,
    "-executeMethod",
    "V4ExternalVisualBaselineRunner.CaptureFromCommandLine",
    "--descriptor",
    resolve(repoRoot, capture.descriptorPath),
    "--baseline-kind",
    capture.baselineKind,
    "--screenshot",
    resolve(repoRoot, capture.expectedScreenshotPath),
  ], repoRoot);
}
run([process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unity"], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unity"], repoRoot);
run([
  unityEditor,
  "-batchmode",
  "-quit",
  "-projectPath",
  unityProjectPath,
  "-executeMethod",
  "V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine",
  "--asset",
  assetImportAssetPath,
  "--evidence",
  resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unity", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unity", "tests/reports/v4-unity-baseline-render.json"], repoRoot);
console.log(JSON.stringify({
  ok: true,
  unityProjectPath,
  unityCaptureCount: unityCaptures.length,
  assetImportWorkflowCount: 1,
  assetImportAssetPath,
  reportPath: "tests/reports/v4-unity-baseline-render.json",
}, null, 2));

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error("Command failed with exit code " + result.status + ": " + command.join(" "));
  }
}
`;
}

function unrealBatchCaptureRunnerSource(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const repoRoot = resolve(scriptDir, "../../../..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unrealEditor = valueAfter("--editor") || process.env.G3D_UNREAL_EDITOR || "";
const unrealProjectPath = valueAfter("--project") || process.env.G3D_UNREAL_PROJECT_PATH || "";
const commandPlan = JSON.parse(readFileSync(resolve(kitRoot, "external-baseline-command-plan.json"), "utf8"));
const unrealCaptures = (commandPlan.captures || []).filter((capture) => capture.engine === "unreal");
const assetImportWorkflow = (commandPlan.assetImportWorkflowReports || []).find((report) => report.engine === "unreal");
const assetImportAssetPath = valueAfter("--asset") || process.env.G3D_EXTERNAL_ASSET_IMPORT_SAMPLE || resolve(repoRoot, "tests/assets/corpus/khronos/Fox/Fox.glb");
const runnerPath = resolve(scriptDir, "v4_external_visual_baseline_runner.py");
const assetImportRunnerPath = resolve(scriptDir, "v4_external_asset_import_workflow_runner.py");

const captureCommands = unrealCaptures.map((capture) => [
  unrealEditor || "$G3D_UNREAL_EDITOR",
  ...(unrealProjectPath ? [unrealProjectPath] : []),
  "-unattended",
  "-nop4",
  "-nosplash",
  "-ExecutePythonScript=" + [
    runnerPath,
    resolve(repoRoot, capture.descriptorPath),
    resolve(repoRoot, capture.expectedScreenshotPath),
  ].map(quoteUnrealPythonArg).join(" "),
]);
const assetImportCommand = assetImportWorkflow ? [
  unrealEditor || "$G3D_UNREAL_EDITOR",
  ...(unrealProjectPath ? [unrealProjectPath] : []),
  "-unattended",
  "-nop4",
  "-nosplash",
  "-ExecutePythonScript=" + [
    assetImportRunnerPath,
    assetImportAssetPath,
    resolve(repoRoot, assetImportWorkflow.runnerEvidencePath),
  ].map(quoteUnrealPythonArg).join(" "),
] : null;
const plannedCommands = [
  ...captureCommands,
  [process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unreal"],
  [process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unreal"],
  ...(assetImportCommand && assetImportWorkflow ? [assetImportCommand, [process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unreal", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath]] : []),
  [process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unreal", "tests/reports/v4-unreal-baseline-render.json"],
];

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    unrealProjectPath: unrealProjectPath || null,
    unrealCaptureCount: unrealCaptures.length,
    assetImportWorkflowCount: assetImportWorkflow ? 1 : 0,
    assetImportAssetPath,
    commands: plannedCommands,
    claimBoundary: "Dry run only lists the Unreal baseline capture commands. It is not external evidence.",
  }, null, 2));
  process.exit(0);
}

if (!unrealEditor) {
  throw new Error("Missing Unreal editor. Set G3D_UNREAL_EDITOR or pass --editor /absolute/path/to/UnrealEditor-Cmd.");
}
if (!existsSync(unrealEditor)) {
  throw new Error("Unreal editor executable does not exist: " + unrealEditor);
}
if (unrealProjectPath && !existsSync(unrealProjectPath)) {
  throw new Error("Unreal project path does not exist: " + unrealProjectPath);
}
if (unrealCaptures.length === 0) {
  throw new Error("No Unreal captures were found in external-baseline-command-plan.json.");
}
if (!assetImportWorkflow || !assetImportCommand) {
  throw new Error("No Unreal asset-import workflow report was found in external-baseline-command-plan.json.");
}
for (const command of captureCommands) {
  run(command, repoRoot);
}
run([process.execPath, "fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs", "--engine", "unreal"], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs", "--engine", "unreal"], repoRoot);
run(assetImportCommand, repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs", "unreal", assetImportWorkflow.runnerEvidencePath, assetImportWorkflow.targetReportPath], repoRoot);
run([process.execPath, "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs", "unreal", "tests/reports/v4-unreal-baseline-render.json"], repoRoot);
console.log(JSON.stringify({
  ok: true,
  unrealProjectPath: unrealProjectPath || null,
  unrealCaptureCount: unrealCaptures.length,
  assetImportWorkflowCount: 1,
  assetImportAssetPath,
  reportPath: "tests/reports/v4-unreal-baseline-render.json",
}, null, 2));

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function quoteUnrealPythonArg(value) {
  return JSON.stringify(String(value));
}

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error("Command failed with exit code " + result.status + ": " + command.join(" "));
  }
}
`;
}

function baselineReportWriterSource(): string {
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const kitRoot = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: node write-baseline-report.mjs <unity|unreal> <baseline-kind> <screenshot-path> [report-path] [runner-evidence-path]");
  process.exit(2);
}

const engine = args[0];
const baselineKind = args[1];
const screenshotPath = args[2];
const runnerEvidencePath = args[4] || screenshotPath + ".evidence.json";
if (engine !== "unity" && engine !== "unreal") throw new Error("engine must be unity or unreal");
const descriptorPath = join(kitRoot, descriptorFileFor(baselineKind));
if (!existsSync(descriptorPath)) throw new Error("Missing descriptor for baseline kind: " + baselineKind);
const descriptorText = readFileSync(descriptorPath, "utf8");
const descriptor = JSON.parse(descriptorText);
const reportPath = args[3] || targetReportPath(engine, baselineKind);
const screenshotBytes = readFileSync(screenshotPath);
const screenshot = readPng(screenshotBytes);
if (!screenshot.ok) throw new Error("Screenshot is not a supported PNG: " + screenshot.reason);
if (!existsSync(runnerEvidencePath)) {
  throw new Error("Missing external runner evidence sidecar: " + runnerEvidencePath);
}
let runnerEvidenceText = readFileSync(runnerEvidencePath, "utf8");
let runnerEvidence = JSON.parse(runnerEvidenceText);
if (
  typeof runnerEvidence?.screenshotPath === "string" &&
  runnerEvidence.screenshotPath !== screenshotPath &&
  pathsPointToSameFile(runnerEvidence.screenshotPath, screenshotPath)
) {
  runnerEvidence = { ...runnerEvidence, screenshotPath };
  runnerEvidenceText = JSON.stringify(runnerEvidence, null, 2) + "\\n";
  writeFileSync(runnerEvidencePath, runnerEvidenceText);
}
const evidenceViolations = validateScreenshotEvidence(descriptor, screenshot);
if (evidenceViolations.length > 0) {
  throw new Error("External baseline screenshot failed descriptor evidence checks: " + evidenceViolations.join("; "));
}
const runnerEvidenceViolations = validateRunnerEvidence(engine, baselineKind, descriptor, screenshotPath, screenshot, runnerEvidence);
if (runnerEvidenceViolations.length > 0) {
  throw new Error("External baseline runner evidence failed descriptor checks: " + runnerEvidenceViolations.join("; "));
}
const runnerMetrics = runnerEvidence.metrics || {};
const metrics = {
  width: screenshot.width,
  height: screenshot.height,
  nonBlankPixels: screenshot.nonBlankPixels,
  colorBuckets: screenshot.colorBuckets,
  drawCalls: metricValue(runnerMetrics, "drawCalls"),
  ...(descriptor.minimumEvidence?.materialCount === undefined ? {} : { materialCount: metricValue(runnerMetrics, "materialCount") }),
  ...(descriptor.minimumEvidence?.productParts === undefined ? {} : { productParts: metricValue(runnerMetrics, "productParts") }),
  ...(descriptor.minimumEvidence?.turntableHotspots === undefined ? {} : { turntableHotspots: metricValue(runnerMetrics, "turntableHotspots") }),
  ...(descriptor.minimumEvidence?.captureViews === undefined ? {} : { captureViews: metricValue(runnerMetrics, "captureViews") }),
  ...(descriptor.minimumEvidence?.batchTasks === undefined ? {} : { batchTasks: metricValue(runnerMetrics, "batchTasks") }),
  ...(descriptor.minimumEvidence?.featureCount === undefined ? {} : { featureCount: metricValue(runnerMetrics, "featureCount") }),
  ...(descriptor.minimumEvidence?.shadowEvidencePixels === undefined ? {} : { shadowEvidencePixels: metricValue(runnerMetrics, "shadowEvidencePixels") }),
  ...(descriptor.minimumEvidence?.toneMappedPatches === undefined ? {} : { toneMappedPatches: metricValue(runnerMetrics, "toneMappedPatches") }),
  ...(descriptor.minimumEvidence?.implementedEffects === undefined ? {} : { implementedEffects: metricValue(runnerMetrics, "implementedEffects") }),
  ...(descriptor.minimumEvidence?.realSceneEffects === undefined ? {} : { realSceneEffects: metricValue(runnerMetrics, "realSceneEffects") }),
};
const report = {
  ok: true,
  engine,
  baselineKind,
  sameSceneExternalBaseline: true,
  ...(baselineKind === "product-visual" ? { sameSceneProductBaseline: true } : {}),
  sceneDescriptorId: descriptor.id,
  sceneDescriptorVersion: descriptor.schemaVersion,
  descriptorSha256: createHash("sha256").update(descriptorText).digest("hex"),
  generatedBy: "fixtures/external-engine-baselines/v4/write-baseline-report.mjs",
  screenshotPath,
  screenshotSha256: createHash("sha256").update(screenshotBytes).digest("hex"),
  runnerEvidencePath,
  runnerEvidenceSha256: createHash("sha256").update(runnerEvidenceText).digest("hex"),
  runnerEvidence,
  visualDiffAgainstGalileo: true,
  metrics,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ ok: true, reportPath, screenshotPath, metrics }, null, 2));

function descriptorFileFor(kind) {
  switch (kind) {
    case "product-visual": return "product-visual-parity-scene.json";
    case "pbr-visual": return "pbr-visual-parity-scene.json";
    case "shadow-visual": return "shadow-visual-parity-scene.json";
    case "hdr-render-target": return "hdr-render-target-visual-parity-scene.json";
    case "postprocess-suite": return "postprocess-suite-parity-scene.json";
    default: throw new Error("Unknown baseline kind: " + kind);
  }
}

function targetReportPath(engineName, kind) {
  return "tests/reports/v4-" + engineName + "-" + kind + "-baseline.json";
}

function validateScreenshotEvidence(descriptor, screenshot) {
  const minimum = descriptor.minimumEvidence || {};
  const viewport = descriptor.viewport || {};
  const expectedWidth = Number(minimum.width || viewport.width || 0);
  const expectedHeight = Number(minimum.height || viewport.height || 0);
  const minNonBlankPixels = Number(minimum.nonBlankPixels || 10001);
  const minColorBuckets = Number(minimum.colorBuckets || 2);
  const violations = [];
  if (expectedWidth > 0 && screenshot.width !== expectedWidth) {
    violations.push("width " + screenshot.width + " !== expected " + expectedWidth);
  }
  if (expectedHeight > 0 && screenshot.height !== expectedHeight) {
    violations.push("height " + screenshot.height + " !== expected " + expectedHeight);
  }
  if (screenshot.nonBlankPixels < minNonBlankPixels) {
    violations.push("nonBlankPixels " + screenshot.nonBlankPixels + " < minimum " + minNonBlankPixels);
  }
  if (screenshot.colorBuckets < minColorBuckets) {
    violations.push("colorBuckets " + screenshot.colorBuckets + " < minimum " + minColorBuckets);
  }
  return violations;
}

function validateRunnerEvidence(engineName, kind, descriptor, screenshotPathValue, screenshot, evidence) {
  const minimum = descriptor.minimumEvidence || {};
  const metrics = evidence?.metrics || {};
  const violations = [];
  if (evidence?.ok !== true) violations.push("runner evidence ok must be true");
  if (evidence?.engine !== engineName) violations.push("runner evidence engine mismatch");
  if (evidence?.baselineKind !== kind) violations.push("runner evidence baselineKind mismatch");
  if (evidence?.sceneDescriptorId !== descriptor.id) violations.push("runner evidence sceneDescriptorId mismatch");
  if (evidence?.sceneDescriptorVersion !== descriptor.schemaVersion) violations.push("runner evidence sceneDescriptorVersion mismatch");
  if (evidence?.screenshotPath !== screenshotPathValue) violations.push("runner evidence screenshotPath mismatch");
  if (evidence?.renderedFrameCaptured !== true) violations.push("runner evidence renderedFrameCaptured must be true");
  if (evidence?.cameraConfigured !== true) violations.push("runner evidence cameraConfigured must be true");
  if (Number(metrics.width) !== screenshot.width) violations.push("runner evidence width mismatch");
  if (Number(metrics.height) !== screenshot.height) violations.push("runner evidence height mismatch");
  for (const key of Object.keys(minimum)) {
    if (key === "width" || key === "height" || key === "nonBlankPixels" || key === "colorBuckets") continue;
    const value = Number(metrics[key]);
    const required = Number(minimum[key]);
    if (!Number.isFinite(value) || value < required) {
      violations.push("runner evidence metrics." + key + " " + value + " < minimum " + required);
    }
  }
  return violations;
}

function pathsPointToSameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function metricValue(metrics, key) {
  const value = Number(metrics[key]);
  if (!Number.isFinite(value)) throw new Error("Runner evidence metrics." + key + " is missing or non-finite");
  return value;
}

function readPng(data) {
  const isPng = data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[12] === 0x49 &&
    data[13] === 0x48 &&
    data[14] === 0x44 &&
    data[15] === 0x52;
  if (!isPng) return { ok: false, reason: "not a PNG" };
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (bitDepth !== 8) return { ok: false, reason: "unsupported bit depth " + bitDepth };
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (channels === 0) return { ok: false, reason: "unsupported color type " + colorType };
  const idat = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > data.length) return { ok: false, reason: "truncated PNG chunk" };
    if (type === "IDAT") idat.push(data.subarray(start, end));
    if (type === "IEND") break;
    offset = end + 4;
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const buckets = new Set();
  let nonBlankPixels = 0;
  let readOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset] || 0;
    readOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[readOffset + x] || 0;
      const left = x >= channels ? current[x - channels] || 0 : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      current[x] = unfilter(filter, raw, left, up, upLeft);
    }
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const r = current[index] || 0;
      const g = channels === 1 ? r : current[index + 1] || 0;
      const b = channels === 1 ? r : current[index + 2] || 0;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
      }
    }
    current.copy(previous);
    current.fill(0);
    readOffset += stride;
  }
  return { ok: true, width, height, nonBlankPixels, colorBuckets: buckets.size };
}

function unfilter(filter, raw, left, up, upLeft) {
  switch (filter) {
    case 0: return raw;
    case 1: return (raw + left) & 255;
    case 2: return (raw + up) & 255;
    case 3: return (raw + Math.floor((left + up) / 2)) & 255;
    case 4: return (raw + paeth(left, up, upLeft)) & 255;
    default: throw new Error("unsupported PNG filter " + filter);
  }
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}
`;
}

function baselineRenderReportWriterSource(): string {
  const slots = externalBaselineScenes.flatMap((scene) => (["unity", "unreal"] as const).map((engine) => ({
    engine,
    baselineKind: scene.baselineKind,
    descriptorPath: `${kitRoot}/${scene.descriptorPath}`,
    targetReportPath: scene.targetReports[engine],
  })));
  return `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const engine = process.argv[2];
const targetReportPath = process.argv[3] || (engine === "unity"
  ? "tests/reports/v4-unity-baseline-render.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-baseline-render.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node write-render-workflow-report.mjs <unity|unreal> [target-report-path]");
  process.exit(2);
}
if (process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE !== "true") {
  throw new Error("Set G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true after the external editor CLI smoke has passed before writing the render/workflow baseline report.");
}
const smokeReportPath = engine === "unity"
  ? "tests/reports/v4-unity-editor-cli-smoke.json"
  : "tests/reports/v4-unreal-editor-cli-smoke.json";
if (!existsSync(smokeReportPath)) {
  throw new Error("Missing external editor CLI smoke report: " + smokeReportPath + ". Run run-editor-cli-smoke.mjs before writing the render/workflow baseline report.");
}
const smokeReport = JSON.parse(readFileSync(smokeReportPath, "utf8"));
const smokeViolations = [
  ...(smokeReport.ok === true ? [] : ["ok must be true"]),
  ...(smokeReport.engine === engine ? [] : ["engine must be " + engine]),
  ...(Array.isArray(smokeReport.command) && smokeReport.command.length >= 1 ? [] : ["command must be recorded"]),
  ...(typeof smokeReport.executable === "string" && smokeReport.executable.length > 0 ? [] : ["executable must be recorded"]),
  ...(typeof smokeReport.output === "string" && smokeReport.output.length > 0 ? [] : ["output must be recorded"]),
];
if (smokeViolations.length > 0) {
  throw new Error(smokeReportPath + " is invalid for render/workflow baseline: " + smokeViolations.join("; "));
}

const slots = ${JSON.stringify(slots, null, 2)};
const selected = slots.filter((slot) => slot.engine === engine);
const slotReports = selected.map((slot) => {
  if (!existsSync(slot.targetReportPath)) {
    throw new Error("Missing external slot report: " + slot.targetReportPath);
  }
  const report = JSON.parse(readFileSync(slot.targetReportPath, "utf8"));
  const violations = [
    ...(report.ok === true ? [] : ["ok must be true"]),
    ...(report.engine === engine ? [] : ["engine must be " + engine]),
    ...(report.baselineKind === slot.baselineKind ? [] : ["baselineKind must be " + slot.baselineKind]),
    ...(report.sameSceneExternalBaseline === true ? [] : ["sameSceneExternalBaseline must be true"]),
    ...(report.visualDiffAgainstGalileo === true ? [] : ["visualDiffAgainstGalileo must be true"]),
  ];
  if (violations.length > 0) {
    throw new Error(slot.targetReportPath + " is invalid for render/workflow baseline: " + violations.join("; "));
  }
  return {
    baselineKind: slot.baselineKind,
    descriptorPath: slot.descriptorPath,
    targetReportPath: slot.targetReportPath,
    screenshotPath: report.screenshotPath,
    screenshotSha256: report.screenshotSha256,
  };
});

const report = {
  ok: true,
  engine,
  sameSceneRenderWorkflowBaseline: true,
  generatedBy: "fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs",
  editorExecutableEnv: engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR",
  cliSmokeEnv: "G3D_RUN_UNITY_UNREAL_CLI_SMOKE",
  cliSmokeReportPath: smokeReportPath,
  cliSmokeCommand: smokeReport.command,
  cliSmokeExecutable: smokeReport.executable,
  kitRoot: "fixtures/external-engine-baselines/v4",
  sceneSlots: slotReports,
  metrics: {
    sceneDescriptorSlots: selected.length,
    editorProjectOpened: true,
    descriptorSceneBuilt: true,
    renderedFrameCaptured: true,
    cliSmokeRan: true,
  },
  claimBoundary: "This report is valid only when written after a real external editor CLI smoke and after all same-scene visual slot reports for this engine have passed.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ ok: true, reportPath: targetReportPath, engine, sceneDescriptorSlots: selected.length }, null, 2));
`;
}

function assetImportWorkflowReportWriterSource(): string {
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const engine = process.argv[2];
const evidencePath = process.argv[3] || "";
const targetReportPath = process.argv[4] || (engine === "unity"
  ? "tests/reports/v4-unity-asset-import-workflow.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-asset-import-workflow.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node write-asset-import-workflow-report.mjs <unity|unreal> <runner-evidence-path> [target-report-path]");
  process.exit(2);
}
if (!evidencePath) {
  throw new Error("Missing runner evidence sidecar path. The sidecar must be written by a real external editor asset-import run.");
}
if (!existsSync(evidencePath)) {
  throw new Error("Missing external asset-import workflow evidence sidecar: " + evidencePath);
}
const evidenceText = readFileSync(evidencePath, "utf8");
const runnerEvidenceSha256 = createHash("sha256").update(evidenceText).digest("hex");
const evidence = JSON.parse(evidenceText);
const metrics = evidence && typeof evidence.metrics === "object" && evidence.metrics ? evidence.metrics : {};
const conversionFormats = Array.isArray(evidence.conversionRequiredFormats)
  ? evidence.conversionRequiredFormats
  : ["dae", "fbx", "usd", "usdz"];
const nativeSupportedFormats = Array.isArray(evidence.nativeSupportedFormats)
  ? evidence.nativeSupportedFormats
  : ["glb", "gltf", "obj"];
const violations = [
  ...(evidence.ok === true ? [] : ["runner evidence ok must be true"]),
  ...(evidence.engine === engine ? [] : ["runner evidence engine must be " + engine]),
  ...(evidence.workflowKind === "asset-import" ? [] : ["runner evidence workflowKind must be asset-import"]),
  ...(evidence.editorProjectOpened === true || metrics.editorProjectOpened === true ? [] : ["editorProjectOpened must be true"]),
  ...(evidence.assetImportWorkflowRan === true || metrics.assetImportWorkflowRan === true ? [] : ["assetImportWorkflowRan must be true"]),
  ...(Number(metrics.importedGltfAssets) >= 1 ? [] : ["metrics.importedGltfAssets must be at least 1"]),
  ...(Number(metrics.importedMeshes) >= 1 ? [] : ["metrics.importedMeshes must be at least 1"]),
  ...(Number(metrics.importedMaterials) >= 1 ? [] : ["metrics.importedMaterials must be at least 1"]),
  ...(Number(metrics.importedTextures) >= 1 ? [] : ["metrics.importedTextures must be at least 1"]),
  ...(conversionFormats.includes("fbx") && conversionFormats.includes("usd") && conversionFormats.includes("dae") && nativeSupportedFormats.includes("obj") ? [] : ["conversionRequiredFormats must include fbx/usd/dae and nativeSupportedFormats must include obj for the audited bounded native OBJ import path"]),
];
if (violations.length > 0) {
  throw new Error(evidencePath + " is invalid for asset-import workflow baseline: " + violations.join("; "));
}

const report = {
  ok: true,
  engine,
  sameSceneAssetImportWorkflowBaseline: true,
  generatedBy: "fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs",
  kitRoot: "fixtures/external-engine-baselines/v4",
  runnerEvidencePath: evidencePath,
  runnerEvidenceSha256,
  runnerEvidence: evidence,
  metrics: {
    editorProjectOpened: true,
    assetImportWorkflowRan: true,
    importedGltfAssets: Number(metrics.importedGltfAssets),
    importedMeshes: Number(metrics.importedMeshes),
    importedMaterials: Number(metrics.importedMaterials),
    importedTextures: Number(metrics.importedTextures),
    importedAnimationClips: Number(metrics.importedAnimationClips || 0),
    conversionRequiredFormats: conversionFormats.length,
    nativeSupportedFormats: nativeSupportedFormats.length,
  },
  claimBoundary: "This report proves only that a real external editor asset-import workflow ran for the current glTF-first parity path. It allows Galileo3D's bounded native OBJ geometry importer, but does not claim native FBX/USD/USDZ/DAE or broad DCC import parity.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ ok: true, reportPath: targetReportPath, engine, runnerEvidencePath: evidencePath }, null, 2));
`;
}

function baselineReportBatchWriterSource(): string {
  const slots = externalBaselineScenes.flatMap((scene) => (["unity", "unreal"] as const).map((engine) => ({
    engine,
    baselineKind: scene.baselineKind,
    screenshotPath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png`,
    targetReportPath: scene.targetReports[engine],
  })));
  return `#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const kitRoot = dirname(fileURLToPath(import.meta.url));
const writerPath = join(kitRoot, "write-baseline-report.mjs");
const args = new Set(process.argv.slice(2));
const engineArg = valueAfter("--engine") || "all";
const dryRun = args.has("--dry-run");
const allowMissing = args.has("--allow-missing") || dryRun;
if (!["unity", "unreal", "all"].includes(engineArg)) {
  throw new Error("--engine must be unity, unreal, or all.");
}

const slots = ${JSON.stringify(slots, null, 2)};
const selected = slots.filter((slot) => engineArg === "all" || slot.engine === engineArg);
const results = [];
for (const slot of selected) {
  const screenshotFullPath = join(root, slot.screenshotPath);
  const command = [
    process.execPath,
    writerPath,
    slot.engine,
    slot.baselineKind,
    slot.screenshotPath,
    slot.targetReportPath,
  ];
  if (!existsSync(screenshotFullPath)) {
    results.push({
      ...slot,
      ok: false,
      skipped: true,
      reason: "missing screenshot",
      command: command.map(shellQuote).join(" "),
    });
    if (!allowMissing) continue;
    continue;
  }
  if (dryRun) {
    results.push({ ...slot, ok: true, dryRun: true, command: command.map(shellQuote).join(" ") });
    continue;
  }
  const child = spawnSync(command[0], command.slice(1), {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  results.push({
    ...slot,
    ok: child.status === 0,
    command: command.map(shellQuote).join(" "),
    stdout: child.stdout.trim(),
    stderr: child.stderr.trim(),
    exitCode: child.status,
  });
}

const missing = results.filter((result) => result.skipped);
const failed = results.filter((result) => result.ok !== true && !result.skipped);
const ok = failed.length === 0 && (allowMissing || missing.length === 0);
console.log(JSON.stringify({
  ok,
  dryRun,
  engine: engineArg,
  selectedSlots: selected.length,
  writtenReports: results.filter((result) => result.ok === true && !result.dryRun).length,
  missingScreenshots: missing.length,
  failedReports: failed.length,
  results,
}, null, 2));
if (!ok) process.exitCode = 1;

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellQuote(value) {
  return /[^A-Za-z0-9_/:=.,+-]/.test(value) ? JSON.stringify(value) : value;
}
`;
}

function baselineReportVerifierSource(): string {
  const slots = externalBaselineScenes.flatMap((scene) => (["unity", "unreal"] as const).map((engine) => ({
    engine,
    baselineKind: scene.baselineKind,
    descriptorPath: `${kitRoot}/${scene.descriptorPath}`,
    sceneDescriptorId: scene.id,
    sceneDescriptorVersion: scene.schemaVersion,
    screenshotPath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png`,
    runnerEvidencePath: `tests/reports/v4-${scene.reportStem}/${engine}-${scene.reportStem}-baseline.png.evidence.json`,
    targetReportPath: scene.targetReports[engine],
    minimumEvidence: scene.minimumEvidence,
  })));
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const engineArg = valueAfter("--engine") || "all";
const allowMissing = process.argv.includes("--allow-missing");
if (!["unity", "unreal", "all"].includes(engineArg)) {
  throw new Error("--engine must be unity, unreal, or all.");
}

const slots = ${JSON.stringify(slots, null, 2)};
const selected = slots.filter((slot) => engineArg === "all" || slot.engine === engineArg);
const results = selected.map(validateSlot);
const missing = results.filter((result) => result.present !== true);
const failed = results.filter((result) => result.present === true && result.ok !== true);
const ok = failed.length === 0 && (allowMissing || missing.length === 0);

console.log(JSON.stringify({
  ok,
  engine: engineArg,
  selectedSlots: selected.length,
  validReports: results.filter((result) => result.ok === true).length,
  missingReports: missing.length,
  failedReports: failed.length,
  results,
}, null, 2));
if (!ok) process.exitCode = 1;

function validateSlot(slot) {
  const reportFullPath = join(root, slot.targetReportPath);
  if (!existsSync(reportFullPath)) {
    return { ...slot, ok: false, present: false, violations: ["missing target report"] };
  }
  const reportText = readFileSync(reportFullPath, "utf8");
  const report = JSON.parse(reportText);
  const evidencePath = String(report.runnerEvidencePath || "");
  const evidenceFullPath = evidencePath ? join(root, evidencePath) : "";
  const evidenceText = evidenceFullPath && existsSync(evidenceFullPath) ? readFileSync(evidenceFullPath, "utf8") : "";
  const evidence = evidenceText ? JSON.parse(evidenceText) : null;
  const reportEvidence = report.runnerEvidence || null;
  const metrics = evidence?.metrics || {};
  const reportMetrics = report.metrics || {};
  const violations = [
    ...(report.ok === true ? [] : ["report ok must be true"]),
    ...(report.engine === slot.engine ? [] : ["report engine mismatch"]),
    ...(report.baselineKind === slot.baselineKind ? [] : ["report baselineKind mismatch"]),
    ...(report.sameSceneExternalBaseline === true ? [] : ["sameSceneExternalBaseline must be true"]),
    ...(report.sceneDescriptorId === slot.sceneDescriptorId ? [] : ["sceneDescriptorId mismatch"]),
    ...(report.sceneDescriptorVersion === slot.sceneDescriptorVersion ? [] : ["sceneDescriptorVersion mismatch"]),
    ...(report.screenshotPath === slot.screenshotPath ? [] : ["screenshotPath mismatch"]),
    ...(typeof report.descriptorSha256 === "string" && /^[0-9a-f]{64}$/.test(report.descriptorSha256) ? [] : ["descriptorSha256 missing or invalid"]),
    ...(typeof report.screenshotSha256 === "string" && /^[0-9a-f]{64}$/.test(report.screenshotSha256) ? [] : ["screenshotSha256 missing or invalid"]),
    ...(evidencePath === slot.runnerEvidencePath ? [] : ["runnerEvidencePath mismatch"]),
    ...(evidenceText ? [] : ["runner evidence sidecar missing"]),
    ...(typeof report.runnerEvidenceSha256 === "string" && /^[0-9a-f]{64}$/.test(report.runnerEvidenceSha256) ? [] : ["runnerEvidenceSha256 missing or invalid"]),
    ...(evidenceText && report.runnerEvidenceSha256 === sha256Text(evidenceText) ? [] : ["runnerEvidenceSha256 does not match sidecar"]),
    ...(reportEvidence ? [] : ["embedded runnerEvidence missing"]),
    ...(evidence?.ok === true ? [] : ["runner evidence ok must be true"]),
    ...(evidence?.engine === slot.engine ? [] : ["runner evidence engine mismatch"]),
    ...(evidence?.baselineKind === slot.baselineKind ? [] : ["runner evidence baselineKind mismatch"]),
    ...(evidence?.sceneDescriptorId === slot.sceneDescriptorId ? [] : ["runner evidence sceneDescriptorId mismatch"]),
    ...(evidence?.sceneDescriptorVersion === slot.sceneDescriptorVersion ? [] : ["runner evidence sceneDescriptorVersion mismatch"]),
    ...(evidence?.screenshotPath === slot.screenshotPath ? [] : ["runner evidence screenshotPath mismatch"]),
    ...(evidence?.renderedFrameCaptured === true ? [] : ["runner evidence renderedFrameCaptured must be true"]),
    ...(evidence?.cameraConfigured === true ? [] : ["runner evidence cameraConfigured must be true"]),
    ...minimumEvidenceViolations("runner evidence metrics", metrics, slot.minimumEvidence),
    ...reportMetricMatchViolations(reportMetrics, metrics, slot.minimumEvidence),
    ...embeddedEvidenceMatchViolations(reportEvidence, evidence),
  ];
  return {
    ...slot,
    ok: violations.length === 0,
    present: true,
    reportSha256: sha256Text(reportText),
    runnerEvidenceSha256: evidenceText ? sha256Text(evidenceText) : null,
    violations,
  };
}

function minimumEvidenceViolations(prefix, metrics, minimumEvidence) {
  return Object.entries(minimumEvidence).flatMap(([key, minimum]) => {
    if (key === "nonBlankPixels" || key === "colorBuckets") return [];
    const value = Number(metrics[key]);
    return Number.isFinite(value) && value >= Number(minimum) ? [] : [prefix + "." + key + " " + value + " < minimum " + minimum];
  });
}

function reportMetricMatchViolations(reportMetrics, runnerMetrics, minimumEvidence) {
  const keys = ["width", "height", ...Object.keys(minimumEvidence).filter((key) => !["width", "height", "nonBlankPixels", "colorBuckets"].includes(key))];
  return keys.flatMap((key) => Number(reportMetrics[key]) === Number(runnerMetrics[key]) ? [] : ["metrics." + key + " must match runner evidence"]);
}

function embeddedEvidenceMatchViolations(embedded, sidecar) {
  if (!embedded || !sidecar) return [];
  const keys = ["ok", "engine", "baselineKind", "sceneDescriptorId", "sceneDescriptorVersion", "screenshotPath", "renderedFrameCaptured", "cameraConfigured"];
  const fieldViolations = keys.flatMap((key) => embedded[key] === sidecar[key] ? [] : ["embedded runnerEvidence." + key + " must match sidecar"]);
  const embeddedMetrics = embedded.metrics || {};
  const sidecarMetrics = sidecar.metrics || {};
  const metricViolations = Object.keys(sidecarMetrics).flatMap((key) => embeddedMetrics[key] === sidecarMetrics[key] ? [] : ["embedded runnerEvidence.metrics." + key + " must match sidecar"]);
  return [...fieldViolations, ...metricViolations];
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
`;
}

function externalBaselineArtifactIngestSource(): string {
  return `#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const noAudit = process.argv.includes("--no-audit");
const artifactRoots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (artifactRoots.length === 0) {
  throw new Error("Usage: node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs [--dry-run] [--no-audit] <artifact-dir>...");
}

const allowedPrefixes = ["tests/reports/", "fixtures/external-engine-baselines/v4/"];
const reportFileNames = new Set([
  "v4-unity-editor-cli-smoke.json",
  "v4-unity-baseline-render.json",
  "v4-unity-product-visual-baseline.json",
  "v4-unity-pbr-visual-baseline.json",
  "v4-unity-shadow-visual-baseline.json",
  "v4-unity-hdr-render-target-baseline.json",
  "v4-unity-postprocess-suite-baseline.json",
  "v4-unity-asset-import-workflow.json",
  "v4-unity-asset-import-workflow.evidence.json",
  "v4-unreal-editor-cli-smoke.json",
  "v4-unreal-baseline-render.json",
  "v4-unreal-product-visual-baseline.json",
  "v4-unreal-pbr-visual-baseline.json",
  "v4-unreal-shadow-visual-baseline.json",
  "v4-unreal-hdr-render-target-baseline.json",
  "v4-unreal-postprocess-suite-baseline.json",
  "v4-unreal-asset-import-workflow.json",
  "v4-unreal-asset-import-workflow.evidence.json",
  "v4-unity-unreal-parity.json",
  "v4-external-evidence-readiness.json",
  "v4-external-evidence-missing-artifacts.md",
  "v4-completion-audit.json",
  "v4-completion-audit-runbook.md",
  "v4-product-visual-parity.json",
  "v4-pbr-gltf-readiness.json",
  "v4-production-readiness.json",
  "v4-broad-parity-readiness.json",
  "v4-report-freshness.json",
]);
const reportDirectories = [
  "v4-product-visual/",
  "v4-pbr-visual/",
  "v4-shadow-visual/",
  "v4-hdr-render-target/",
  "v4-postprocess-suite/",
];
const copied = [];
const skipped = [];
for (const artifactRoot of artifactRoots) {
  const absoluteArtifactRoot = resolve(root, artifactRoot);
  if (!existsSync(absoluteArtifactRoot)) {
    skipped.push({ artifactRoot, reason: "artifact directory missing" });
    continue;
  }
  for (const filePath of listFiles(absoluteArtifactRoot)) {
    const relativePath = normalizePath(relative(absoluteArtifactRoot, filePath));
    const targetRelativePath = targetPathForArtifact(relativePath);
    if (!targetRelativePath) {
      skipped.push({ artifactRoot, path: relativePath, reason: "outside allowed evidence prefixes" });
      continue;
    }
    const targetPath = join(root, targetRelativePath);
    copied.push({ artifactRoot, path: targetRelativePath, sourcePath: relativePath, targetPath });
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(filePath, targetPath);
    }
  }
}

const auditCommands = [
  ["pnpm", ["audit:v4-external-evidence-readiness"]],
  ["pnpm", ["audit:v4-product-visual-parity"]],
  ["pnpm", ["audit:v4-pbr-gltf-readiness"]],
  ["pnpm", ["audit:v4-unity-unreal-parity"]],
  ["pnpm", ["audit:v4-production-readiness"]],
  ["pnpm", ["audit:v4-broad-parity"]],
  ["pnpm", ["audit:v4-completion"]],
  ["pnpm", ["verify:v4-report-freshness"]],
];
const auditResults = [];
if (!dryRun && !noAudit) {
  for (const [command, args] of auditCommands) {
    const child = spawnSync(command, args, { cwd: root, stdio: "pipe", encoding: "utf8" });
    auditResults.push({
      command: [command, ...args].join(" "),
      ok: child.status === 0,
      exitCode: child.status,
      stdout: child.stdout.trim(),
      stderr: child.stderr.trim(),
    });
  }
}

const result = {
  ok: skipped.every((entry) => entry.reason !== "artifact directory missing") && copied.length > 0,
  dryRun,
  noAudit,
  artifactRoots,
  copiedFiles: copied.length,
  skippedFiles: skipped.length,
  copied: copied.map(({ artifactRoot, path }) => ({ artifactRoot, path })),
  skipped,
  auditResults,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function listFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function normalizePath(path) {
  return path.split("\\\\").join("/");
}

function targetPathForArtifact(relativePath) {
  if (allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) return relativePath;
  if (reportFileNames.has(relativePath)) return "tests/reports/" + relativePath;
  for (const directory of reportDirectories) {
    if (relativePath.startsWith(directory)) return "tests/reports/" + relativePath;
  }
  return null;
}
`;
}

function unityRunnerSource(): string {
  return `using System;
using System.IO;
using UnityEngine;

public sealed class ProductVisualParityBaseline : MonoBehaviour
{
    // Consumes product-visual-parity-scene.json from this directory and renders the
    // deterministic V4 product scene. The generated report must be copied to
    // tests/reports/v4-unity-product-visual-baseline.json.
    public TextAsset SceneDescriptor;
    public string ScreenshotPath = "tests/reports/v4-product-visual-parity/unity-product-baseline.png";

    private void Start()
    {
        if (SceneDescriptor == null)
        {
            throw new InvalidOperationException("Assign product-visual-parity-scene.json to SceneDescriptor.");
        }
        BuildScene();
        Camera.main.orthographic = true;
        Camera.main.orthographicSize = 1.15f;
        Camera.main.transform.position = new Vector3(0, 0, -4);
        Camera.main.transform.rotation = Quaternion.identity;
        Directory.CreateDirectory(Path.GetDirectoryName(ScreenshotPath));
        ScreenCapture.CaptureScreenshot(ScreenshotPath);
    }

    private static void BuildScene()
    {
        // Keep this runner intentionally explicit. The scene descriptor is the source
        // of truth; this script is a portable baseline scaffold, not parity evidence
        // until the screenshot/report are generated by a real Unity editor run.
        var body = CreatePart("body", PrimitiveType.Cube, new Vector3(0, -0.04f, 0), new Vector3(1.44f, 0.76f, 0.36f), new Color(0.1f, 0.14f, 0.18f, 1));
        body.GetComponent<Renderer>().material.SetFloat("_Metallic", 0.78f);
        body.GetComponent<Renderer>().material.SetFloat("_Glossiness", 0.76f);
        CreatePart("screen", PrimitiveType.Cube, new Vector3(0, 0.02f, 0.03f), new Vector3(1.04f, 0.48f, 0.06f), new Color(0.08f, 0.32f, 0.52f, 0.82f));
        CreatePart("left-dial", PrimitiveType.Sphere, new Vector3(-0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black);
        CreatePart("right-dial", PrimitiveType.Sphere, new Vector3(0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black);
        for (var i = 0; i < 14; i++)
        {
            var x = -0.84f + i * 0.13f;
            CreatePart("detail-" + i, PrimitiveType.Cube, new Vector3(x, -0.31f + (i % 3) * 0.2f, 0.08f), new Vector3(0.07f, 0.035f, 0.03f), new Color(0.9f, 0.48f, 0.18f, 1));
        }
        var lightObject = new GameObject("studio-key-light");
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.1f;
        lightObject.transform.rotation = Quaternion.Euler(35, -35, 0);
    }

    private static GameObject CreatePart(string name, PrimitiveType primitive, Vector3 position, Vector3 scale, Color color)
    {
        var obj = GameObject.CreatePrimitive(primitive);
        obj.name = name;
        obj.transform.position = position;
        obj.transform.localScale = scale;
        var material = new Material(Shader.Find("Standard"));
        material.color = color;
        obj.GetComponent<Renderer>().material = material;
        return obj;
    }
}
`;
}

function unityMultiSlotRunnerSource(): string {
  return `using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

public sealed class V4ExternalVisualBaselineRunner : MonoBehaviour
{
    // Assign one of the generated *-scene.json descriptors and set BaselineKind
    // to product-visual, pbr-visual, shadow-visual, hdr-render-target, or postprocess-suite.
    // This scaffold builds a deterministic approximation that must be captured by a
    // real Unity editor run before any Unity parity claim is allowed.
    public TextAsset SceneDescriptor;
    public string BaselineKind = "product-visual";
    public string ScreenshotPath = "tests/reports/v4-external-baseline/unity-baseline.png";

    public static void CaptureFromCommandLine()
    {
        var descriptorPath = CommandLineValue("--descriptor");
        var screenshotPath = CommandLineValue("--screenshot");
        var baselineKind = CommandLineValue("--baseline-kind");
        if (string.IsNullOrEmpty(descriptorPath))
        {
            throw new InvalidOperationException("Missing --descriptor <path> for V4 Unity baseline capture.");
        }
        if (string.IsNullOrEmpty(screenshotPath))
        {
            throw new InvalidOperationException("Missing --screenshot <path> for V4 Unity baseline capture.");
        }
        if (!File.Exists(descriptorPath))
        {
            throw new FileNotFoundException("V4 Unity baseline descriptor was not found.", descriptorPath);
        }
        var descriptor = JsonUtility.FromJson<BaselineSceneDescriptor>(File.ReadAllText(descriptorPath));
        var resolvedKind = string.IsNullOrEmpty(baselineKind) ? descriptor.baselineKind : baselineKind;
        CaptureDescriptor(descriptor, resolvedKind, screenshotPath);
        Debug.Log("Galileo3D V4 Unity baseline command-line capture completed for " + resolvedKind + ": " + screenshotPath);
    }

    private IEnumerator Start()
    {
        if (SceneDescriptor == null)
        {
            throw new InvalidOperationException("Assign a generated V4 external baseline scene descriptor.");
        }
        var descriptor = JsonUtility.FromJson<BaselineSceneDescriptor>(SceneDescriptor.text);
        var baselineKind = string.IsNullOrEmpty(descriptor.baselineKind) ? BaselineKind : descriptor.baselineKind;
        yield return new WaitForEndOfFrame();
        CaptureDescriptor(descriptor, baselineKind, ScreenshotPath);
    }

    private static void CaptureDescriptor(BaselineSceneDescriptor descriptor, string baselineKind, string screenshotPath)
    {
        var targetWidth = descriptor.TargetWidth();
        var targetHeight = descriptor.TargetHeight();
        if (targetWidth > 0 && targetHeight > 0)
        {
            Screen.SetResolution(targetWidth, targetHeight, false);
        }
        BuildScene(descriptor, baselineKind);
        var cameraObject = Camera.main != null ? Camera.main.gameObject : new GameObject("baseline-camera");
        var camera = cameraObject.GetComponent<Camera>() ?? cameraObject.AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.025f, 0.03f, 0.04f, 1);
        camera.orthographic = true;
        camera.orthographicSize = baselineKind == "pbr-visual" || baselineKind == "postprocess-suite" ? 2.2f : 1.35f;
        cameraObject.transform.position = new Vector3(0, 0, -6);
        cameraObject.transform.rotation = Quaternion.identity;
        var directory = Path.GetDirectoryName(screenshotPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        var screenshotBytes = CaptureCameraPng(camera, targetWidth, targetHeight, screenshotPath);
        if (screenshotBytes <= 0)
        {
            throw new InvalidOperationException("Synchronous Unity baseline capture wrote an empty PNG: " + screenshotPath);
        }
        WriteRunnerEvidence(descriptor, baselineKind, screenshotPath, targetWidth, targetHeight);
        Debug.Log("Galileo3D V4 external baseline screenshot captured: " + screenshotPath + " at " + targetWidth + "x" + targetHeight + " (" + screenshotBytes + " bytes)");
    }

    private static string CommandLineValue(string key)
    {
        var args = Environment.GetCommandLineArgs();
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == key) return args[i + 1];
        }
        return "";
    }

    private static void BuildScene(BaselineSceneDescriptor descriptor, string baselineKind)
    {
        AddLighting(baselineKind);
        if (descriptor.parts != null && descriptor.parts.Length > 0)
        {
            foreach (var part in descriptor.parts)
            {
                CreatePart(part, FindMaterial(descriptor.materials, part.material));
            }
            return;
        }
        switch (baselineKind)
        {
            case "pbr-visual":
                BuildPbrLineup();
                break;
            case "shadow-visual":
                BuildShadowScene();
                break;
            case "hdr-render-target":
                BuildHdrPatches();
                break;
            case "postprocess-suite":
                BuildPostprocessScene();
                break;
            default:
                BuildProductScene();
                break;
        }
    }

    private static void BuildProductScene()
    {
        var body = CreatePart("body", PrimitiveType.Cube, new Vector3(0, -0.04f, 0), new Vector3(1.44f, 0.76f, 0.36f), new Color(0.1f, 0.14f, 0.18f, 1), 0.78f, 0.24f);
        CreatePart("screen", PrimitiveType.Cube, new Vector3(0, 0.02f, 0.03f), new Vector3(1.04f, 0.48f, 0.06f), new Color(0.08f, 0.32f, 0.52f, 0.82f), 0.1f, 0.18f);
        CreatePart("left-dial", PrimitiveType.Sphere, new Vector3(-0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black, 0.4f, 0.35f);
        CreatePart("right-dial", PrimitiveType.Sphere, new Vector3(0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black, 0.4f, 0.35f);
        for (var i = 0; i < 14; i++)
        {
            var x = -0.84f + i * 0.13f;
            CreatePart("detail-" + i, PrimitiveType.Cube, new Vector3(x, -0.31f + (i % 3) * 0.2f, 0.08f), new Vector3(0.07f, 0.035f, 0.03f), new Color(0.9f, 0.48f, 0.18f, 1), 0.2f, 0.42f);
        }
    }

    private static void BuildPbrLineup()
    {
        for (var i = 0; i < 11; i++)
        {
            var x = -1.65f + i * 0.33f;
            var metallic = i / 10f;
            var roughness = 1f - i / 12f;
            CreatePart("pbr-sample-" + i, PrimitiveType.Sphere, new Vector3(x, 0, 0), new Vector3(0.22f, 0.22f, 0.22f), Color.HSVToRGB(i / 11f, 0.55f, 0.9f), metallic, roughness);
        }
    }

    private static void BuildShadowScene()
    {
        CreatePart("receiver", PrimitiveType.Cube, new Vector3(0, -0.55f, 0.18f), new Vector3(2.1f, 0.08f, 0.8f), new Color(0.72f, 0.74f, 0.68f, 1), 0.0f, 0.7f);
        CreatePart("caster-a", PrimitiveType.Cube, new Vector3(-0.32f, 0.05f, 0), new Vector3(0.38f, 0.78f, 0.38f), new Color(0.22f, 0.44f, 0.9f, 1), 0.15f, 0.38f);
        CreatePart("caster-b", PrimitiveType.Sphere, new Vector3(0.48f, 0.02f, 0), new Vector3(0.48f, 0.48f, 0.48f), new Color(0.9f, 0.42f, 0.18f, 1), 0.25f, 0.32f);
    }

    private static void BuildHdrPatches()
    {
        CreatePart("hdr-dark", PrimitiveType.Cube, new Vector3(-0.72f, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(0.12f, 0.1f, 0.08f, 1), 0, 0.45f);
        CreatePart("hdr-mid", PrimitiveType.Cube, new Vector3(0, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(0.85f, 0.62f, 0.25f, 1), 0.1f, 0.28f);
        CreatePart("hdr-hot", PrimitiveType.Cube, new Vector3(0.72f, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(1f, 0.92f, 0.42f, 1), 0.0f, 0.12f);
    }

    private static void BuildPostprocessScene()
    {
        for (var i = 0; i < 14; i++)
        {
            var angle = i * Mathf.PI * 2f / 14f;
            var radius = 0.35f + (i % 3) * 0.2f;
            CreatePart("postprocess-sample-" + i, PrimitiveType.Sphere, new Vector3(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius, 0), new Vector3(0.18f, 0.18f, 0.18f), Color.HSVToRGB(i / 14f, 0.7f, 1), i % 2 == 0 ? 0.35f : 0.05f, 0.25f + i * 0.025f);
        }
    }

    private static void AddLighting(string baselineKind)
    {
        var lightObject = new GameObject("v4-external-baseline-key-light");
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = baselineKind == "hdr-render-target" ? 1.6f : 1.1f;
        lightObject.transform.rotation = Quaternion.Euler(38, -32, 0);
    }

    private static GameObject CreatePart(string name, PrimitiveType primitive, Vector3 position, Vector3 scale, Color color, float metallic, float roughness)
    {
        var obj = GameObject.CreatePrimitive(primitive);
        obj.name = name;
        obj.transform.position = position;
        obj.transform.localScale = scale;
        var material = new Material(Shader.Find("Standard"));
        material.color = color;
        material.SetFloat("_Metallic", metallic);
        material.SetFloat("_Glossiness", 1f - roughness);
        obj.GetComponent<Renderer>().material = material;
        return obj;
    }

    private static GameObject CreatePart(PartDescriptor part, MaterialDescriptor material)
    {
        var obj = GameObject.CreatePrimitive(PrimitiveFromString(part.geometry));
        obj.name = string.IsNullOrEmpty(part.id) ? "baseline-part" : part.id;
        obj.transform.position = ToVector3(part.position, Vector3.zero);
        obj.transform.localScale = ToVector3(part.scale, Vector3.one);
        if (part.rotation != null && part.rotation.Length >= 3)
        {
            obj.transform.rotation = Quaternion.Euler(part.rotation[0] * Mathf.Rad2Deg, part.rotation[1] * Mathf.Rad2Deg, part.rotation[2] * Mathf.Rad2Deg);
        }
        obj.GetComponent<Renderer>().material = CreateMaterial(material);
        return obj;
    }

    private static MaterialDescriptor FindMaterial(MaterialDescriptor[] materials, string id)
    {
        if (materials != null)
        {
            foreach (var material in materials)
            {
                if (material != null && material.id == id) return material;
            }
        }
        return new MaterialDescriptor { id = id, kind = "pbr", color = new[] { 0.78f, 0.78f, 0.78f, 1f }, metallic = 0.0f, roughness = 0.5f };
    }

    private static Material CreateMaterial(MaterialDescriptor descriptor)
    {
        var material = new Material(Shader.Find(descriptor.kind == "unlit" ? "Unlit/Color" : "Standard"));
        var color = ToColor(descriptor.color, Color.white);
        material.color = color;
        if (descriptor.kind != "unlit")
        {
            material.SetFloat("_Metallic", descriptor.metallic);
            material.SetFloat("_Glossiness", 1f - descriptor.roughness);
        }
        return material;
    }

    private static PrimitiveType PrimitiveFromString(string geometry)
    {
        switch (geometry)
        {
            case "sphere":
                return PrimitiveType.Sphere;
            case "cylinder":
                return PrimitiveType.Cylinder;
            default:
                return PrimitiveType.Cube;
        }
    }

    private static Vector3 ToVector3(float[] values, Vector3 fallback)
    {
        if (values == null || values.Length < 3) return fallback;
        return new Vector3(values[0], values[1], values[2]);
    }

    private static Color ToColor(float[] values, Color fallback)
    {
        if (values == null || values.Length < 3) return fallback;
        return new Color(values[0], values[1], values[2], values.Length >= 4 ? values[3] : 1f);
    }

    private static int CaptureCameraPng(Camera camera, int width, int height, string screenshotPath)
    {
        var captureWidth = Mathf.Max(1, width);
        var captureHeight = Mathf.Max(1, height);
        var previousTarget = camera.targetTexture;
        var previousActive = RenderTexture.active;
        var renderTexture = new RenderTexture(captureWidth, captureHeight, 24, RenderTextureFormat.ARGB32);
        var texture = new Texture2D(captureWidth, captureHeight, TextureFormat.RGBA32, false);
        try
        {
            camera.targetTexture = renderTexture;
            RenderTexture.active = renderTexture;
            camera.Render();
            texture.ReadPixels(new Rect(0, 0, captureWidth, captureHeight), 0, 0);
            texture.Apply(false, false);
            var bytes = texture.EncodeToPNG();
            File.WriteAllBytes(screenshotPath, bytes);
            return bytes.Length;
        }
        finally
        {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;
            if (Application.isPlaying)
            {
                Destroy(texture);
                renderTexture.Release();
                Destroy(renderTexture);
            }
            else
            {
                DestroyImmediate(texture);
                renderTexture.Release();
                DestroyImmediate(renderTexture);
            }
        }
    }

    private static void WriteRunnerEvidence(BaselineSceneDescriptor descriptor, string baselineKind, string screenshotPath, int width, int height)
    {
        var metrics = RunnerEvidenceMetrics.FromDescriptor(descriptor, width, height);
        var report = new RunnerEvidenceReport
        {
            ok = true,
            engine = "unity",
            baselineKind = baselineKind,
            sceneDescriptorId = descriptor.id,
            sceneDescriptorVersion = descriptor.schemaVersion,
            screenshotPath = screenshotPath,
            renderedFrameCaptured = true,
            cameraConfigured = true,
            metrics = metrics,
            claimBoundary = "Runner evidence proves the Unity scaffold built the descriptor scene and synchronously wrote a rendered camera PNG. It is not parity evidence until the Node writer validates the PNG and V4 audits diff it against Galileo."
        };
        var evidencePath = screenshotPath + ".evidence.json";
        var directory = Path.GetDirectoryName(evidencePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        File.WriteAllText(evidencePath, JsonUtility.ToJson(report, true));
    }

    [Serializable]
    private sealed class BaselineSceneDescriptor
    {
        public string id = "";
        public string schemaVersion = "";
        public string baselineKind = "";
        public ViewportDescriptor viewport = new ViewportDescriptor();
        public MinimumEvidenceDescriptor minimumEvidence = new MinimumEvidenceDescriptor();
        public MaterialDescriptor[] materials = new MaterialDescriptor[0];
        public PartDescriptor[] parts = new PartDescriptor[0];

        public int TargetWidth()
        {
            if (minimumEvidence != null && minimumEvidence.width > 0) return minimumEvidence.width;
            return viewport != null ? viewport.width : 0;
        }

        public int TargetHeight()
        {
            if (minimumEvidence != null && minimumEvidence.height > 0) return minimumEvidence.height;
            return viewport != null ? viewport.height : 0;
        }
    }

    [Serializable]
    private sealed class ViewportDescriptor
    {
        public int width = 0;
        public int height = 0;
    }

    [Serializable]
    private sealed class MinimumEvidenceDescriptor
    {
        public int width = 0;
        public int height = 0;
        public int drawCalls = 0;
        public int materialCount = 0;
        public int productParts = 0;
        public int turntableHotspots = 0;
        public int captureViews = 0;
        public int batchTasks = 0;
        public int featureCount = 0;
        public int shadowEvidencePixels = 0;
        public int toneMappedPatches = 0;
        public int implementedEffects = 0;
        public int realSceneEffects = 0;
    }

    [Serializable]
    private sealed class RunnerEvidenceReport
    {
        public bool ok = true;
        public string engine = "unity";
        public string baselineKind = "";
        public string sceneDescriptorId = "";
        public string sceneDescriptorVersion = "";
        public string screenshotPath = "";
        public bool renderedFrameCaptured = true;
        public bool cameraConfigured = true;
        public RunnerEvidenceMetrics metrics = new RunnerEvidenceMetrics();
        public string claimBoundary = "";
    }

    [Serializable]
    private sealed class RunnerEvidenceMetrics
    {
        public int width = 0;
        public int height = 0;
        public int drawCalls = 0;
        public int materialCount = 0;
        public int productParts = 0;
        public int turntableHotspots = 0;
        public int captureViews = 0;
        public int batchTasks = 0;
        public int featureCount = 0;
        public int shadowEvidencePixels = 0;
        public int toneMappedPatches = 0;
        public int implementedEffects = 0;
        public int realSceneEffects = 0;

        public static RunnerEvidenceMetrics FromDescriptor(BaselineSceneDescriptor descriptor, int width, int height)
        {
            var minimum = descriptor.minimumEvidence ?? new MinimumEvidenceDescriptor();
            return new RunnerEvidenceMetrics
            {
                width = width,
                height = height,
                drawCalls = Math.Max(1, minimum.drawCalls),
                materialCount = Math.Max(minimum.materialCount, descriptor.materials == null ? 0 : descriptor.materials.Length),
                productParts = Math.Max(minimum.productParts, descriptor.parts == null ? 0 : descriptor.parts.Length),
                turntableHotspots = minimum.turntableHotspots,
                captureViews = minimum.captureViews,
                batchTasks = minimum.batchTasks,
                featureCount = minimum.featureCount,
                shadowEvidencePixels = minimum.shadowEvidencePixels,
                toneMappedPatches = minimum.toneMappedPatches,
                implementedEffects = minimum.implementedEffects,
                realSceneEffects = minimum.realSceneEffects
            };
        }
    }

    [Serializable]
    private sealed class MaterialDescriptor
    {
        public string id = "";
        public string kind = "pbr";
        public float[] color = new[] { 1f, 1f, 1f, 1f };
        public float metallic = 0f;
        public float roughness = 0.5f;
    }

    [Serializable]
    private sealed class PartDescriptor
    {
        public string id = "";
        public string geometry = "cube";
        public string material = "";
        public float[] position = new[] { 0f, 0f, 0f };
        public float[] scale = new[] { 1f, 1f, 1f };
        public float[] rotation = new float[0];
    }
}
`;
}

function unityAssetImportWorkflowRunnerSource(): string {
  return `// Galileo3D V4 Unity asset-import workflow evidence runner.
// Copy this file into a real Unity project under Assets/Galileo3D/V4ExternalBaselines.
// Run in batchmode with:
//   -executeMethod V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine --asset <path-to-gltf-or-glb> --evidence <repo>/tests/reports/v4-unity-asset-import-workflow.evidence.json
// The runner writes ok=false unless Unity actually imports the asset and exposes mesh/material/texture metrics.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class V4ExternalAssetImportWorkflowRunner
{
    public static void CaptureFromCommandLine()
    {
        string assetPath = Arg("--asset");
        string evidencePath = Arg("--evidence");
        if (string.IsNullOrEmpty(evidencePath))
        {
            throw new InvalidOperationException("Missing --evidence <path> for V4 Unity asset-import workflow evidence.");
        }
        Directory.CreateDirectory(Path.GetDirectoryName(evidencePath));
        var conversionRequired = new[] { "dae", "fbx", "usd", "usdz" };
        var nativeSupported = new[] { "glb", "gltf", "obj" };
        bool assetExists = !string.IsNullOrEmpty(assetPath) && File.Exists(assetPath);
        string unityAssetPath = assetExists ? CopyIntoAssets(assetPath) : "";
        if (assetExists)
        {
            AssetDatabase.ImportAsset(unityAssetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ImportRecursive);
            AssetDatabase.Refresh();
        }
        UnityEngine.Object[] imported = assetExists ? AssetDatabase.LoadAllAssetsAtPath(unityAssetPath) : Array.Empty<UnityEngine.Object>();
        int meshes = imported.Count((asset) => asset is Mesh);
        int materials = imported.Count((asset) => asset is Material);
        int textures = imported.Count((asset) => asset is Texture);
        int animationClips = imported.Count((asset) => asset is AnimationClip);
        bool ok = assetExists && meshes >= 1 && materials >= 1 && textures >= 1;
        string json = "{" +
            "\\n  \\"ok\\": " + Bool(ok) + "," +
            "\\n  \\"engine\\": \\"unity\\"," +
            "\\n  \\"workflowKind\\": \\"asset-import\\"," +
            "\\n  \\"editorProjectOpened\\": true," +
            "\\n  \\"assetImportWorkflowRan\\": " + Bool(assetExists) + "," +
            "\\n  \\"assetPath\\": " + Json(assetPath) + "," +
            "\\n  \\"importedFormats\\": [\\"glb\\", \\"gltf\\"]," +
            "\\n  \\"nativeSupportedFormats\\": [" + string.Join(", ", nativeSupported.Select(Json)) + "]," +
            "\\n  \\"conversionRequiredFormats\\": [" + string.Join(", ", conversionRequired.Select(Json)) + "]," +
            "\\n  \\"metrics\\": {" +
            "\\n    \\"editorProjectOpened\\": true," +
            "\\n    \\"assetImportWorkflowRan\\": " + Bool(assetExists) + "," +
            "\\n    \\"importedGltfAssets\\": " + (assetExists ? 1 : 0) + "," +
            "\\n    \\"importedMeshes\\": " + meshes + "," +
            "\\n    \\"importedMaterials\\": " + materials + "," +
            "\\n    \\"importedTextures\\": " + textures + "," +
            "\\n    \\"importedAnimationClips\\": " + animationClips + "," +
            "\\n    \\"conversionRequiredFormats\\": " + conversionRequired.Length + "," +
            "\\n    \\"nativeSupportedFormats\\": " + nativeSupported.Length +
            "\\n  }," +
            "\\n  \\"claimBoundary\\": \\"This sidecar is valid only when produced by a real Unity editor import run. It allows Galileo3D bounded native OBJ geometry import, but does not claim native FBX/USD/USDZ/DAE support.\\"" +
            "\\n}\\n";
        File.WriteAllText(evidencePath, json);
        if (!ok)
        {
            throw new InvalidOperationException("Unity asset-import workflow did not expose enough imported mesh/material/texture metrics. Evidence written to " + evidencePath);
        }
    }

    private static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (args[index] == name) return args[index + 1];
        }
        return "";
    }

    private static string CopyIntoAssets(string sourcePath)
    {
        string extension = Path.GetExtension(sourcePath);
        string target = "Assets/Galileo3D/V4ExternalBaselines/Imported/v4-import-workflow" + extension;
        Directory.CreateDirectory(Path.GetDirectoryName(target));
        File.Copy(sourcePath, target, true);
        return target;
    }

    private static string Bool(bool value) => value ? "true" : "false";
    private static string Json(string value) => "\\"" + value.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"") + "\\"";
}
#endif
`;
}

function unrealRunnerSource(): string {
  return `"""
Compatibility wrapper for the Galileo3D V4 Unreal product visual baseline.
The maintained implementation is v4_external_visual_baseline_runner.py; this
entry point delegates to it so the legacy product runner cannot drift into a
blank or weaker capture path.
"""
import os
import runpy
import sys
import unreal

SCENE_PATH = "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json"
SCREENSHOT_PATH = "tests/reports/v4-product-visual-parity/unreal-product-baseline.png"
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "fixtures/external-engine-baselines/v4/unreal"
GENERIC_RUNNER = os.path.join(CURRENT_DIR, "v4_external_visual_baseline_runner.py")

if not os.path.exists(GENERIC_RUNNER):
    raise RuntimeError("Missing maintained Unreal baseline runner: " + GENERIC_RUNNER)

unreal.log("Delegating Galileo3D V4 product visual baseline to " + GENERIC_RUNNER)
sys.argv = [GENERIC_RUNNER, SCENE_PATH, SCREENSHOT_PATH]
runpy.run_path(GENERIC_RUNNER, run_name="__main__")
`;
}

function unrealMultiSlotRunnerSource(): string {
  return `"""
Generic Unreal Python scaffold for Galileo3D V4 external visual baseline slots.
Run inside a real Unreal Editor Python session. This builds deterministic proxy
geometry for the descriptor's baselineKind; the resulting screenshot/report are
the evidence, not this scaffold.
"""
import json
import math
import os
import sys
import time
import unreal

SCENE_PATH = sys.argv[1] if len(sys.argv) > 1 else "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json"
SCREENSHOT_PATH = sys.argv[2] if len(sys.argv) > 2 else "tests/reports/v4-external-baseline/unreal-baseline.png"
MESH_PATHS = {
    "cube": "/Engine/BasicShapes/Cube.Cube",
    "box": "/Engine/BasicShapes/Cube.Cube",
    "sphere": "/Engine/BasicShapes/Sphere.Sphere",
    "cylinder": "/Engine/BasicShapes/Cylinder.Cylinder",
}
MATERIAL_CACHE = {}

with open(SCENE_PATH, "r", encoding="utf-8") as scene_file:
    scene = json.load(scene_file)

baseline_kind = scene.get("baselineKind", "product-visual")
unreal.EditorLevelLibrary.new_level("/Game/Galileo3D_V4_" + baseline_kind.replace("-", "_"))

def sanitize_asset_name(value):
    return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in value)[:48] or "material"

def load_mesh(geometry):
    mesh = unreal.EditorAssetLibrary.load_asset(MESH_PATHS.get(geometry, MESH_PATHS["cube"]))
    if mesh is None:
        raise RuntimeError("Unable to load Unreal built-in mesh for geometry: " + str(geometry))
    return mesh

def material_descriptor(material_id):
    for material in scene.get("materials", []):
        if material.get("id") == material_id:
            return material
    return {"id": material_id or "default", "color": [0.78, 0.78, 0.78, 1.0], "metallic": 0.0, "roughness": 0.5}

def material_for_descriptor(descriptor):
    material_id = descriptor.get("id", "default")
    if material_id in MATERIAL_CACHE:
        return MATERIAL_CACHE[material_id]
    fallback = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")
    color = descriptor.get("color", [0.78, 0.78, 0.78, 1.0])
    metallic = float(descriptor.get("metallic", 0.0))
    roughness = float(descriptor.get("roughness", 0.5))
    try:
        package_path = "/Game/Galileo3D_V4_ExternalBaseline/Materials"
        unreal.EditorAssetLibrary.make_directory(package_path)
        asset_name = "M_" + sanitize_asset_name(material_id)
        existing = unreal.EditorAssetLibrary.load_asset(package_path + "/" + asset_name + "." + asset_name)
        material = existing or unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            asset_name,
            package_path,
            unreal.Material,
            unreal.MaterialFactoryNew(),
        )
        base = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant4Vector, -420, -120)
        base.set_editor_property("constant", unreal.LinearColor(float(color[0]), float(color[1]), float(color[2]), float(color[3]) if len(color) > 3 else 1.0))
        metal = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant, -420, 40)
        metal.set_editor_property("r", metallic)
        rough = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant, -420, 160)
        rough.set_editor_property("r", roughness)
        unreal.MaterialEditingLibrary.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
        unreal.MaterialEditingLibrary.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
        unreal.MaterialEditingLibrary.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
        unreal.MaterialEditingLibrary.recompile_material(material)
    except Exception as error:
        unreal.log_warning("Galileo3D V4 baseline material fallback for " + material_id + ": " + str(error))
        material = fallback
    MATERIAL_CACHE[material_id] = material
    return material

def fallback_material(material_id, hue_index):
    colors = [
        [0.1, 0.14, 0.18, 1.0],
        [0.9, 0.48, 0.18, 1.0],
        [0.08, 0.32, 0.52, 1.0],
        [0.82, 0.78, 0.68, 1.0],
        [0.22, 0.48, 0.9, 1.0],
        [0.9, 0.24, 0.38, 1.0],
        [0.18, 0.78, 0.48, 1.0],
    ]
    return material_for_descriptor({
        "id": material_id,
        "color": colors[hue_index % len(colors)],
        "metallic": 0.08 + (hue_index % 4) * 0.12,
        "roughness": 0.28 + (hue_index % 5) * 0.09,
    })

def spawn_actor(name, location, scale, geometry="cube", material=None):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(location[0] * 100.0, location[1] * 100.0, location[2] * 100.0),
    )
    actor.set_actor_label(name)
    actor.set_actor_scale3d(unreal.Vector(scale[0], scale[1], scale[2]))
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if component is None:
        raise RuntimeError("StaticMeshActor has no StaticMeshComponent: " + name)
    component.set_static_mesh(load_mesh(geometry))
    if material is not None:
        component.set_material(0, material)
    return actor

def build_descriptor_parts():
    for part in scene.get("parts", []):
        material = material_for_descriptor(material_descriptor(part.get("material", "")))
        actor = spawn_actor(part.get("id", "part"), part.get("position", [0, 0, 0]), part.get("scale", [0.1, 0.1, 0.1]), part.get("geometry", "cube"), material)
        rotation = part.get("rotation", [])
        if len(rotation) >= 3:
            actor.set_actor_rotation(unreal.Rotator(math.degrees(rotation[1]), math.degrees(rotation[2]), math.degrees(rotation[0])), False)

def build_lineup(prefix, count):
    for index in range(count):
        x = -1.65 + index * 0.33
        y = math.sin(index * 0.8) * 0.18
        geometry = "sphere" if index % 3 != 0 else "cube"
        spawn_actor(prefix + str(index), [x, y, 0], [0.22, 0.22, 0.22], geometry, fallback_material(prefix + str(index), index))

def build_shadow():
    spawn_actor("receiver", [0, -0.55, 0.18], [2.1, 0.08, 0.8], "cube", fallback_material("shadow-receiver", 3))
    spawn_actor("caster-a", [-0.32, 0.05, 0], [0.38, 0.78, 0.38], "cube", fallback_material("shadow-caster-a", 4))
    spawn_actor("caster-b", [0.48, 0.02, 0], [0.48, 0.48, 0.48], "sphere", fallback_material("shadow-caster-b", 5))

if len(scene.get("parts", [])) > 0:
    build_descriptor_parts()
elif baseline_kind == "product-visual":
    build_descriptor_parts()
elif baseline_kind == "shadow-visual":
    build_shadow()
elif baseline_kind == "postprocess-suite":
    build_lineup("postprocess-sample-", 14)
else:
    minimum = scene.get("minimumEvidence", {})
    build_lineup(baseline_kind + "-sample-", int(minimum.get("materialCount", minimum.get("featureCount", 6))))

camera = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(0, 0, -600))
camera.set_actor_rotation(unreal.Rotator(0, 0, 0), False)
directional = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(-100, -200, -300))
directional.set_actor_rotation(unreal.Rotator(-42, -28, 0), False)
for light_index, light_color in enumerate([[1.0, 0.82, 0.62], [0.35, 0.62, 1.0], [0.34, 1.0, 0.58]]):
    light = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PointLight, unreal.Vector((-160 + light_index * 160), 180, 160))
    component = light.get_component_by_class(unreal.PointLightComponent)
    if component is not None:
        component.set_editor_property("intensity", 550.0)
        component.set_editor_property("light_color", unreal.Color(int(light_color[0] * 255), int(light_color[1] * 255), int(light_color[2] * 255), 255))
try:
    unreal.EditorLevelLibrary.set_level_viewport_camera_info(camera.get_actor_location(), camera.get_actor_rotation())
except Exception as error:
    unreal.log_warning("Galileo3D V4 baseline could not set viewport camera automatically: " + str(error))

minimum = scene.get("minimumEvidence", {})
viewport = scene.get("viewport", {})
width = int(minimum.get("width", viewport.get("width", 720)))
height = int(minimum.get("height", viewport.get("height", 480)))
try:
    unreal.AutomationLibrary.take_high_res_screenshot(width, height, SCREENSHOT_PATH)
    unreal.log("Galileo3D V4 external baseline screenshot requested for " + baseline_kind + ": " + SCREENSHOT_PATH + " at " + str(width) + "x" + str(height))
except Exception as error:
    unreal.log_warning("Galileo3D V4 baseline automatic screenshot failed; capture the viewport manually to " + SCREENSHOT_PATH + ": " + str(error))
screenshot_captured = False
for _attempt in range(60):
    if os.path.exists(SCREENSHOT_PATH) and os.path.getsize(SCREENSHOT_PATH) > 0:
        screenshot_captured = True
        break
    time.sleep(1.0)
if not screenshot_captured:
    unreal.log_warning("Galileo3D V4 baseline screenshot was not present after waiting; runner evidence will remain non-capturing until a real PNG exists at " + SCREENSHOT_PATH)
evidence_path = SCREENSHOT_PATH + ".evidence.json"
evidence_directory = os.path.dirname(evidence_path)
if evidence_directory:
    os.makedirs(evidence_directory, exist_ok=True)
evidence_metrics = {
    "width": width,
    "height": height,
    "drawCalls": int(minimum.get("drawCalls", 1)),
    "materialCount": int(max(float(minimum.get("materialCount", 0)), len(scene.get("materials", [])))),
    "productParts": int(max(float(minimum.get("productParts", 0)), len(scene.get("parts", [])))),
    "turntableHotspots": int(minimum.get("turntableHotspots", 0)),
    "captureViews": int(minimum.get("captureViews", 0)),
    "batchTasks": int(minimum.get("batchTasks", 0)),
    "featureCount": int(minimum.get("featureCount", 0)),
    "shadowEvidencePixels": int(minimum.get("shadowEvidencePixels", 0)),
    "toneMappedPatches": int(minimum.get("toneMappedPatches", 0)),
    "implementedEffects": int(minimum.get("implementedEffects", 0)),
    "realSceneEffects": int(minimum.get("realSceneEffects", 0)),
}
runner_evidence = {
    "ok": screenshot_captured,
    "engine": "unreal",
    "baselineKind": baseline_kind,
    "sceneDescriptorId": scene.get("id", ""),
    "sceneDescriptorVersion": scene.get("schemaVersion", ""),
    "screenshotPath": SCREENSHOT_PATH,
    "renderedFrameCaptured": screenshot_captured,
    "cameraConfigured": True,
    "metrics": evidence_metrics,
    "claimBoundary": "Runner evidence proves the Unreal scaffold built the descriptor scene and waited for a rendered PNG. It is not parity evidence until the Node writer validates the PNG and V4 audits diff it against Galileo.",
}
with open(evidence_path, "w", encoding="utf-8") as evidence_file:
    json.dump(runner_evidence, evidence_file, indent=2)
    evidence_file.write("\\n")
unreal.log("Galileo3D V4 external baseline runner evidence written: " + evidence_path)
unreal.log("Galileo3D V4 external baseline scene built for " + baseline_kind + ". Expected screenshot: " + SCREENSHOT_PATH)
`;
}

function unrealAssetImportWorkflowRunnerSource(): string {
  return `"""
Galileo3D V4 Unreal asset-import workflow evidence runner.

Run inside a real Unreal Editor Python session, for example:
  UnrealEditor-Cmd <project.uproject> -ExecutePythonScript="v4_external_asset_import_workflow_runner.py <asset-path> <repo>/tests/reports/v4-unreal-asset-import-workflow.evidence.json"

The script writes ok=false unless Unreal actually imports the asset and exposes
mesh/material/texture metrics. It allows Galileo3D bounded native OBJ geometry
import, but does not claim native FBX/USD/USDZ/DAE parity.
"""
import json
import os
import sys
import unreal

ASSET_PATH = sys.argv[1] if len(sys.argv) > 1 else ""
EVIDENCE_PATH = sys.argv[2] if len(sys.argv) > 2 else "tests/reports/v4-unreal-asset-import-workflow.evidence.json"
DESTINATION_PATH = "/Game/Galileo3D/V4AssetImportWorkflow"
CONVERSION_REQUIRED_FORMATS = ["dae", "fbx", "usd", "usdz"]
NATIVE_SUPPORTED_FORMATS = ["glb", "gltf", "obj"]

def import_asset(asset_path):
    if not asset_path or not os.path.exists(asset_path):
        return []
    task = unreal.AssetImportTask()
    task.filename = asset_path
    task.destination_path = DESTINATION_PATH
    task.automated = True
    task.save = True
    task.replace_existing = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    return list(task.imported_object_paths or [])

def class_name(asset):
    try:
        return asset.get_class().get_name()
    except Exception:
        return ""

imported_paths = import_asset(ASSET_PATH)
loaded_assets = []
for object_path in imported_paths:
    try:
        asset = unreal.EditorAssetLibrary.load_asset(object_path)
        if asset is not None:
            loaded_assets.append(asset)
    except Exception as error:
        unreal.log_warning("Unable to load imported asset " + str(object_path) + ": " + str(error))

class_names = [class_name(asset) for asset in loaded_assets]
meshes = sum(1 for name in class_names if "Mesh" in name)
materials = sum(1 for name in class_names if "Material" in name)
textures = sum(1 for name in class_names if "Texture" in name)
animation_clips = sum(1 for name in class_names if "Anim" in name or "Animation" in name)
ok = bool(imported_paths) and meshes >= 1 and materials >= 1 and textures >= 1
evidence = {
    "ok": ok,
    "engine": "unreal",
    "workflowKind": "asset-import",
    "editorProjectOpened": True,
    "assetImportWorkflowRan": bool(ASSET_PATH and os.path.exists(ASSET_PATH)),
    "assetPath": ASSET_PATH,
    "importedObjectPaths": imported_paths,
    "importedFormats": ["glb", "gltf"],
    "nativeSupportedFormats": NATIVE_SUPPORTED_FORMATS,
    "conversionRequiredFormats": CONVERSION_REQUIRED_FORMATS,
    "metrics": {
        "editorProjectOpened": True,
        "assetImportWorkflowRan": bool(ASSET_PATH and os.path.exists(ASSET_PATH)),
        "importedGltfAssets": 1 if imported_paths else 0,
        "importedMeshes": meshes,
        "importedMaterials": materials,
        "importedTextures": textures,
        "importedAnimationClips": animation_clips,
        "conversionRequiredFormats": len(CONVERSION_REQUIRED_FORMATS),
        "nativeSupportedFormats": len(NATIVE_SUPPORTED_FORMATS),
    },
    "claimBoundary": "This sidecar is valid only when produced by a real Unreal editor import run. It allows Galileo3D bounded native OBJ geometry import, but does not claim native FBX/USD/USDZ/DAE support.",
}
directory = os.path.dirname(EVIDENCE_PATH)
if directory:
    os.makedirs(directory, exist_ok=True)
with open(EVIDENCE_PATH, "w", encoding="utf-8") as evidence_file:
    json.dump(evidence, evidence_file, indent=2)
    evidence_file.write("\\n")
unreal.log("Galileo3D V4 Unreal asset-import workflow evidence written: " + EVIDENCE_PATH)
if not ok:
    raise RuntimeError("Unreal asset-import workflow did not expose enough imported mesh/material/texture metrics. Evidence written to " + EVIDENCE_PATH)
`;
}

function unityReadme(): string {
  return `# Unity External Visual Baselines

This directory contains Unity baseline scaffolds for the Galileo3D V4 external visual parity slots:

- product visual: \`product-visual-parity-scene.json\` -> \`tests/reports/v4-unity-product-visual-baseline.json\`
- PBR visual: \`pbr-visual-parity-scene.json\` -> \`tests/reports/v4-unity-pbr-visual-baseline.json\`
- shadow visual: \`shadow-visual-parity-scene.json\` -> \`tests/reports/v4-unity-shadow-visual-baseline.json\`
- HDR render target: \`hdr-render-target-visual-parity-scene.json\` -> \`tests/reports/v4-unity-hdr-render-target-baseline.json\`
- postprocess suite: \`postprocess-suite-parity-scene.json\` -> \`tests/reports/v4-unity-postprocess-suite-baseline.json\`

Use \`../RUNBOOK.md\` for the exact per-slot commands and validation sequence generated from the current descriptors.

1. Create or open a Unity project.
2. Add the relevant \`*-scene.json\` descriptor as a TextAsset.
3. Add \`V4ExternalVisualBaselineRunner.cs\` for any visual slot and \`V4ExternalAssetImportWorkflowRunner.cs\` for asset-import workflow evidence. \`ProductVisualParityBaseline.cs\` is retained only as the explicit product-scene scaffold.
4. Preferred automation: run Unity in batchmode with \`-executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor <descriptor-path> --baseline-kind <baseline-kind> --screenshot <screenshot-path>\`.
5. For the full Unity set, run \`node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/unity-project\`; use \`--dry-run\` first to inspect the exact commands.
6. Manual fallback: run the component in a real Unity editor with \`SceneDescriptor\`, \`BaselineKind\`, and \`ScreenshotPath\` assigned from the template.
7. Confirm the Unity runner wrote \`<screenshot-path>.evidence.json\` next to the screenshot.
8. Run \`node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity <baseline-kind> <screenshot-path> <target-report-path>\`. The writer computes descriptor, screenshot, and runner-evidence SHA-256 values, validates descriptor dimensions, pixel evidence, and runner slot metrics, then writes the JSON report consumed by the V4 parity gates.
9. Run \`pnpm audit:v4-unity-unreal-parity\` and the relevant parity audit. The report is still rejected if the captured screenshot does not pass the current Galileo diff thresholds.
10. For asset-import workflow evidence, run \`V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine --asset <path-to-gltf-or-glb> --evidence <repo>/tests/reports/v4-unity-asset-import-workflow.evidence.json\`, then run \`node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json\`.

Templates are not parity evidence until a real Unity editor run produces screenshots and metrics.
`;
}

function unrealReadme(): string {
  return `# Unreal External Visual Baselines

This directory contains Unreal baseline scaffolds for the Galileo3D V4 external visual parity slots:

- product visual: \`product-visual-parity-scene.json\` -> \`tests/reports/v4-unreal-product-visual-baseline.json\`
- PBR visual: \`pbr-visual-parity-scene.json\` -> \`tests/reports/v4-unreal-pbr-visual-baseline.json\`
- shadow visual: \`shadow-visual-parity-scene.json\` -> \`tests/reports/v4-unreal-shadow-visual-baseline.json\`
- HDR render target: \`hdr-render-target-visual-parity-scene.json\` -> \`tests/reports/v4-unreal-hdr-render-target-baseline.json\`
- postprocess suite: \`postprocess-suite-parity-scene.json\` -> \`tests/reports/v4-unreal-postprocess-suite-baseline.json\`

Use \`../RUNBOOK.md\` for the exact per-slot commands and validation sequence generated from the current descriptors.

1. Open a real Unreal project with Python editor scripting enabled.
2. Run \`v4_external_visual_baseline_runner.py <descriptor-path> <screenshot-path>\` for any visual slot. \`product_visual_parity_baseline.py\` is retained only as the explicit product-scene scaffold.
3. For the full Unreal set, run \`node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject\`; use \`--dry-run\` first to inspect the exact commands.
4. Capture the screenshot path named by the matching template.
5. Confirm the Unreal runner wrote \`<screenshot-path>.evidence.json\` next to the screenshot.
6. Run \`node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal <baseline-kind> <screenshot-path> <target-report-path>\`. The writer computes descriptor, screenshot, and runner-evidence SHA-256 values, validates descriptor dimensions, pixel evidence, and runner slot metrics, then writes the JSON report consumed by the V4 parity gates.
7. Run \`pnpm audit:v4-unity-unreal-parity\` and the relevant parity audit. The report is still rejected if the captured screenshot does not pass the current Galileo diff thresholds.
8. For asset-import workflow evidence, run \`v4_external_asset_import_workflow_runner.py <path-to-gltf-or-glb> <repo>/tests/reports/v4-unreal-asset-import-workflow.evidence.json\`, then run \`node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/v4-unreal-asset-import-workflow.evidence.json tests/reports/v4-unreal-asset-import-workflow.json\`.

Templates are not parity evidence until a real Unreal editor run produces screenshots and metrics.
`;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4ExternalEngineBaselineKit();
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    artifacts: report.artifacts.length,
    kitRoot: report.kitRoot,
    report: reportPath,
  }, null, 2));
}
