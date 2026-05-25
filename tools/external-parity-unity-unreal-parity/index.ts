import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { createAssetImportPreflightReport } from "@galileo3d/assets";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface V4UnityUnrealParityReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly unityParity: boolean;
  readonly unrealParity: boolean;
  readonly replacement: boolean;
  readonly externalEngineBaselines: {
    readonly unity: ExternalEngineBaseline;
    readonly unreal: ExternalEngineBaseline;
  };
  readonly editorEvidence: V4EditorWorkflowEvidence;
  readonly renderingEvidence: V4RenderingWorkflowEvidence;
  readonly workflowAreas: readonly {
    readonly id: string;
    readonly requiredForParity: string;
    readonly currentEvidence: string;
    readonly ready: boolean;
    readonly blockers: readonly string[];
  }[];
  readonly assetImportPreflight: V4AssetImportPreflightEvidence;
  readonly deploymentEvidence: V4DeploymentWorkflowEvidence;
  readonly runtimeEvidence: V4RuntimeWorkflowEvidence;
  readonly violations: readonly string[];
}

interface ExternalEngineBaseline {
  readonly engine: "unity" | "unreal";
  readonly executable: string | null;
  readonly executableSource: "env" | "path" | "not-found";
  readonly cliSmokeRequired: boolean;
  readonly cliSmokeRan: boolean;
  readonly cliSmokeOk: boolean;
  readonly cliSmokeCommand: readonly string[];
  readonly cliSmokeOutput: string | null;
  readonly baselineReportPath: string;
  readonly baselineReportPresent: boolean;
  readonly baselineReportOk: boolean;
  readonly baselineReport: ExternalRenderWorkflowBaselineValidation;
  readonly assetImportWorkflowReportPath: string;
  readonly assetImportWorkflowReportPresent: boolean;
  readonly assetImportWorkflowReportOk: boolean;
  readonly assetImportWorkflowReport: ExternalAssetImportWorkflowBaselineValidation;
  readonly productVisualBaselineReportPath: string;
  readonly productVisualBaselinePresent: boolean;
  readonly productVisualBaselineOk: boolean;
  readonly sceneBaselines: readonly ExternalSceneBaselineValidation[];
  readonly blockers: readonly string[];
}

interface ExternalSceneBaselineValidation {
  readonly engine: "unity" | "unreal";
  readonly baselineKind: string;
  readonly sceneDescriptorId: string;
  readonly sceneDescriptorVersion: string;
  readonly descriptorSha256: string | null;
  readonly descriptorPath: string;
  readonly reportPath: string;
  readonly present: boolean;
  readonly ok: boolean;
  readonly screenshot?: {
    readonly ok: boolean;
    readonly path?: string;
    readonly width?: number;
    readonly height?: number;
    readonly byteLength?: number;
    readonly nonBlankPixels?: number;
    readonly colorBuckets?: number;
    readonly sha256?: string;
    readonly reason?: string;
  };
  readonly runnerEvidence?: {
    readonly ok: boolean;
    readonly path?: string;
    readonly sha256?: string;
    readonly violations: readonly string[];
  };
  readonly diffAgainstGalileo?: ExternalSceneBaselineDiff;
  readonly violations: readonly string[];
}

interface ExternalRenderWorkflowBaselineValidation {
  readonly engine: "unity" | "unreal";
  readonly reportPath: string;
  readonly present: boolean;
  readonly ok: boolean;
  readonly violations: readonly string[];
}

interface ExternalAssetImportWorkflowBaselineValidation {
  readonly engine: "unity" | "unreal";
  readonly reportPath: string;
  readonly present: boolean;
  readonly ok: boolean;
  readonly runnerEvidencePath?: string;
  readonly runnerEvidenceSha256?: string;
  readonly violations: readonly string[];
}

interface ExternalSceneBaselineDiff {
  readonly baselineEngine: "galileo";
  readonly comparedEngine: "unity" | "unreal";
  readonly baselineKind: string;
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
  readonly reason?: string;
}

interface V4AssetImportPreflightEvidence {
  readonly source: "origin-master-asset-importer-adapted";
  readonly currentPipeline: "gltf-first";
  readonly supportedFormats: readonly string[];
  readonly conversionRequiredFormats: readonly string[];
  readonly blockedFormats: readonly string[];
  readonly profiles: readonly string[];
  readonly diagnosticCodes: readonly string[];
  readonly claimBoundary: string;
}

interface V4DeploymentWorkflowEvidence {
  readonly staticExportOk: boolean;
  readonly staticExportOutputDir?: string;
  readonly staticDemoServerSmokeOk: boolean;
  readonly publicDeploymentSmokeOk: boolean;
  readonly publicDeploymentUrl?: string;
  readonly publicDeploymentRunbookPath: "tests/reports/public-demo-deployment-runbook.md";
  readonly githubPagesWorkflowPath: ".github/workflows/v4-public-demo-deploy.yml";
  readonly claimBoundary: string;
}

interface V4RuntimeWorkflowEvidence {
  readonly runtimeReportOk: boolean;
  readonly completedRuntimeTaskCount: number;
  readonly gameSliceStatus?: string;
  readonly gameSliceDrawCalls: number;
  readonly gameSliceFeatureEvidenceCount: number;
  readonly gameSliceNonBlankPixels: number;
  readonly mobileTouchEvidence: boolean;
  readonly blockedTaskCount: number;
  readonly oldBranchRuntimePortEvidence: readonly string[];
  readonly claimBoundary: string;
}

interface V4EditorWorkflowEvidence {
  readonly editorReportOk: boolean;
  readonly prefabReportOk: boolean;
  readonly passedCheckCount: number;
  readonly authoredWorkflowSignals: readonly string[];
  readonly importedAssetCount: number;
  readonly exportedStaticApp: boolean;
  readonly staticExportWithoutEditorCode: boolean;
  readonly prefabNodeCount: number;
  readonly prefabExportedNodeCount: number;
  readonly timelineTrackCount: number;
  readonly timelineClipCount: number;
  readonly visualScriptingNodeCount: number;
  readonly gpuPickingEvidence: boolean;
  readonly localizationLocaleCount: number;
  readonly accessibilityAaContrastPasses: boolean;
  readonly claimBoundary: string;
}

interface V4RenderingWorkflowEvidence {
  readonly renderingReportOk: boolean;
  readonly renderingValidationCount: number;
  readonly renderingScreenshotCount: number;
  readonly productVisualReportOk: boolean;
  readonly productVisualThreeJs: boolean;
  readonly productVisualBabylon: boolean;
  readonly productVisualUnity: boolean;
  readonly productVisualUnreal: boolean;
  readonly boundedPbrVisualParity: boolean;
  readonly boundedShadowVisualParity: boolean;
  readonly boundedHdrRenderTargetParity: boolean;
  readonly postprocessRealSceneValidation: boolean;
  readonly forwardShadowSamplingValidation: boolean;
  readonly claimBoundary: string;
}

const reportPath = "tests/reports/external-parity-unity-unreal-parity.json";
const sourceFiles = [
  "tools/external-parity-unity-unreal-parity/index.ts",
  "apps/editor/src/EditorShell.ts",
  "apps/editor/src/export/StaticProjectExporter.ts",
  "apps/editor/src/project/ProjectSerializer.ts",
  "examples/external-editor-authored-app/main.ts",
  "tests/browser/editor-authoring-external-parity.spec.ts",
  "tests/browser/editor-prefab-workflow.spec.ts",
  "tests/reports/external-parity-editor-authoring.json",
  "tests/reports/external-parity-editor-prefab-workflow.json",
  "tests/reports/external-parity-external-engine-baselines.json",
  "tests/reports/external-parity-product-visual-parity.json",
  "tests/reports/external-parity-pbr-visual-parity.json",
  "tests/reports/external-parity-shadow-visual-parity.json",
  "tests/reports/external-parity-hdr-visual-parity.json",
  "tests/reports/external-parity-rendering.json",
  "packages/assets/src/AssetImportPreflight.ts",
  "packages/assets/src/OBJLoader.ts",
  "packages/assets/tests/assets.test.ts",
  "tests/unit/assets/asset-import-preflight.test.ts",
  "tests/reports/external-demo-static-export.json",
  "tests/reports/static-demo-server-smoke.json",
  "tests/reports/public-demo-deployment-smoke.json",
  "tests/reports/public-demo-deployment-runbook.md",
  "tests/reports/external-parity-runtime.json",
  "examples/game-slice/main.ts",
  "tests/browser/runtime-external-parity.spec.ts",
  ".github/workflows/v4-public-demo-deploy.yml",
  "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
  "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json",
  "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json",
  "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json",
  "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json",
  "tests/reports/external-parity-unity-product-visual-baseline.json",
  "tests/reports/external-parity-unreal-product-visual-baseline.json",
  "tests/reports/external-parity-unity-pbr-visual-baseline.json",
  "tests/reports/external-parity-unreal-pbr-visual-baseline.json",
  "tests/reports/external-parity-unity-shadow-visual-baseline.json",
  "tests/reports/external-parity-unreal-shadow-visual-baseline.json",
  "tests/reports/external-parity-unity-hdr-render-target-baseline.json",
  "tests/reports/external-parity-unreal-hdr-render-target-baseline.json",
  "tests/reports/external-parity-unity-postprocess-suite-baseline.json",
  "tests/reports/external-parity-unreal-postprocess-suite-baseline.json",
  "tests/reports/external-parity-unity-asset-import-workflow.json",
  "tests/reports/external-parity-unreal-asset-import-workflow.json",
  "tests/reports/external-parity-product-visual-parity/galileo-product.png",
  "tests/reports/external-parity-pbr-visual-parity/galileo-pbr.png",
  "tests/reports/external-parity-shadow-visual-parity/galileo-shadow.png",
  "tests/reports/external-parity-hdr-visual-parity/galileo-hdr.png",
  "tests/reports/comparison-screenshots/galileo-postprocess.png",
] as const;

export function createV4UnityUnrealParityReport(root = process.cwd()): V4UnityUnrealParityReport {
  const editorEvidence = createEditorWorkflowEvidence(root);
  const baselineKit = readJson(root, "tests/reports/external-parity-external-engine-baselines.json");
  const baselineKitSlots = externalBaselineSlotSummary(baselineKit);
  const baselineSlots = externalBaselineSlots(baselineKit);
  const baselineKitEvidence = baselineKit?.ok === true
    ? `External baseline kit exists at ${String(baselineKit.kitRoot)} with prepared slots: ${baselineKitSlots}.`
    : "External baseline kit is absent; run pnpm verify:external-parity-external-engine-baselines.";
  const assetImportPreflight = createAssetImportPreflightEvidence();
  const assetImportEvidence = `Asset import preflight evidence exists from ${assetImportPreflight.source}: current pipeline is ${assetImportPreflight.currentPipeline}, supported formats are ${assetImportPreflight.supportedFormats.join(", ")}, and ${assetImportPreflight.conversionRequiredFormats.join(", ")} are recognized as conversion-required instead of claimed native imports.`;
  const deploymentEvidence = createDeploymentWorkflowEvidence(root);
  const deploymentEvidenceText = deploymentEvidence.staticExportOk && deploymentEvidence.staticDemoServerSmokeOk
    ? `Local static demo export exists at ${deploymentEvidence.staticExportOutputDir ?? "unknown output"} and local static-server smoke passes; public deployment smoke is ${deploymentEvidence.publicDeploymentSmokeOk ? "passing" : "still blocked"}; GitHub Pages workflow path is ${deploymentEvidence.githubPagesWorkflowPath}.`
    : "Local static demo export or local static-server smoke is missing; run pnpm preflight:external-parity-production-readiness.";
  const runtimeEvidence = createRuntimeWorkflowEvidence(root);
  const runtimeEvidenceText = runtimeEvidence.runtimeReportOk
    ? `V4 runtime report passes with ${runtimeEvidence.completedRuntimeTaskCount} completed runtime tasks, ${runtimeEvidence.gameSliceFeatureEvidenceCount} game-slice feature evidence keys, ${runtimeEvidence.gameSliceDrawCalls} draw calls, ${runtimeEvidence.gameSliceNonBlankPixels} nonblank browser pixels, and mobile/touch evidence ${runtimeEvidence.mobileTouchEvidence ? "present" : "absent"}.`
    : "V4 runtime report is missing or failing; run pnpm verify:external-parity-runtime.";
  const renderingEvidence = createRenderingWorkflowEvidence(root);
  const renderingEvidenceText = renderingEvidence.renderingReportOk
    ? `V4 rendering report passes with ${renderingEvidence.renderingValidationCount} browser validations, ${renderingEvidence.renderingScreenshotCount} screenshot paths, product visual parity against Three.js=${renderingEvidence.productVisualThreeJs} and Babylon.js=${renderingEvidence.productVisualBabylon}, bounded PBR=${renderingEvidence.boundedPbrVisualParity}, bounded shadows=${renderingEvidence.boundedShadowVisualParity}, and bounded HDR targets=${renderingEvidence.boundedHdrRenderTargetParity}.`
    : "V4 rendering report is missing or failing; run pnpm verify:external-parity-rendering.";
  const unity = externalEngineBaseline(root, "unity", baselineSlots);
  const unreal = externalEngineBaseline(root, "unreal", baselineSlots);
  const workflowAreas = [
    workflowArea("editor-authoring", "Unity/Unreal-style durable scene authoring, hierarchy editing, inspector editing, prefab/material workflows, save/load, and exported play-mode validation.", `${editorEvidence.editorReportOk ? `V4 editor authoring passes ${editorEvidence.passedCheckCount} checks with ${editorEvidence.authoredWorkflowSignals.length} authoring workflow signals, ${editorEvidence.timelineTrackCount} timeline tracks, ${editorEvidence.visualScriptingNodeCount} visual-scripting nodes, prefab export node count ${editorEvidence.prefabExportedNodeCount}, and static export without editor code ${editorEvidence.staticExportWithoutEditorCode}.` : "V4 editor authoring report is absent or failing."} ${baselineKitEvidence}`, [
      "Editor evidence is scoped to current Galileo3D fixtures and browser workflows, not Unity/Unreal project/workflow equivalence.",
      ...externalBaselineBlockers(unity, "Unity"),
      ...externalBaselineBlockers(unreal, "Unreal"),
    ]),
    workflowArea("asset-import", "Importer parity for production glTF/FBX/USD/material/animation pipelines and editor import settings.", `V4 has glTF asset-corpus, compression evidence, and bounded import preflight evidence. ${assetImportEvidence} ${baselineKitEvidence}`, [
      "Native FBX/USD/USDZ/DAE import is not implemented; those formats are preflighted as external-conversion-required before glTF browser evidence is valid. OBJ support is bounded to native geometry-only import through OBJLoader.",
      ...externalAssetImportWorkflowBlockers(unity, "Unity"),
      ...externalAssetImportWorkflowBlockers(unreal, "Unreal"),
      "glTF coverage remains bounded by the local V4 corpus and does not prove full DCC pipeline parity without external Unity/Unreal import baselines.",
    ]),
    workflowArea("runtime-systems", "Comparable physics, animation, particles, audio, scripting, scene streaming, and gameplay runtime workflows.", `${runtimeEvidenceText} V4 also has scoped game-slice and large-world streaming evidence. ${baselineKitEvidence}`, [
      "No Unity/Unreal runtime project with the same gameplay systems is built and measured.",
      "Current runtime evidence is browser-focused and does not cover native build targets or engine editor play mode.",
      ...externalBaselineBlockers(unity, "Unity"),
      ...externalBaselineBlockers(unreal, "Unreal"),
    ]),
    workflowArea("rendering", "Same-asset visual parity across lighting, shadows, HDR, postprocess, animation, particles, and product scenes.", `${renderingEvidenceText} ${baselineKitEvidence}`, [
      "No Unity/Unreal rendered output is produced.",
      ...externalBaselineBlockers(unity, "Unity"),
      ...externalBaselineBlockers(unreal, "Unreal"),
      "Current renderer reports keep broad HDR/shadow/postprocess/PBR parity blocked.",
    ]),
    workflowArea("deployment", "Build/package/deploy workflow parity, profiling, crash diagnostics, versioning, support, and release operations.", `${deploymentEvidenceText} No Unity/Unreal deployment baseline exists in this repo.`, [
      "No native/mobile/console/WebGL Unity or Unreal deployment comparison is executed.",
      ...(deploymentEvidence.publicDeploymentSmokeOk ? [] : ["Durable public HTTPS demo deployment validation is not attached for the current static export."]),
      "Production support, crash diagnostics, platform packaging, and release-operation parity remain unproven.",
    ]),
  ] as const;
  const violations = workflowAreas.flatMap((area) => area.blockers.map((blocker) => `${area.id}: ${blocker}`));
  const sharedWorkflowReady = workflowAreas.every((area) => area.ready);
  const unityParity = sharedWorkflowReady && unity.blockers.length === 0;
  const unrealParity = sharedWorkflowReady && unreal.blockers.length === 0;
  const replacement = unityParity && unrealParity;
  return {
    ...baseReport(root, {
      ok: true,
      command: "pnpm audit:external-parity-unity-unreal-parity",
      runIdPrefix: "external-parity-unity-unreal-parity",
      sourceFiles,
      violations,
      blockedClaims: [
        "Unity parity",
        "Unreal parity",
        "Unity/Unreal replacement language",
        "production-ready language",
      ],
    }),
    auditComplete: true,
    unityParity,
    unrealParity,
    replacement,
    externalEngineBaselines: {
      unity,
      unreal,
    },
    editorEvidence,
    renderingEvidence,
    workflowAreas,
    assetImportPreflight,
    deploymentEvidence,
    runtimeEvidence,
    violations,
  };
}

function createRenderingWorkflowEvidence(root: string): V4RenderingWorkflowEvidence {
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const productVisual = readJson(root, "tests/reports/external-parity-product-visual-parity.json");
  const pbrVisual = readJson(root, "tests/reports/external-parity-pbr-visual-parity.json");
  const shadowVisual = readJson(root, "tests/reports/external-parity-shadow-visual-parity.json");
  const hdrVisual = readJson(root, "tests/reports/external-parity-hdr-visual-parity.json");
  const renderingValidations = Array.isArray(rendering?.validations) ? rendering.validations : [];
  const screenshotPaths = Array.isArray(rendering?.screenshotPaths) ? rendering.screenshotPaths : [];
  const renderedProductVisualParity = isRecord(productVisual?.renderedProductVisualParity) ? productVisual.renderedProductVisualParity : {};
  return {
    renderingReportOk: rendering?.ok === true,
    renderingValidationCount: renderingValidations.length,
    renderingScreenshotCount: screenshotPaths.length,
    productVisualReportOk: productVisual?.ok === true,
    productVisualThreeJs: renderedProductVisualParity.threejs === true,
    productVisualBabylon: renderedProductVisualParity.babylon === true,
    productVisualUnity: renderedProductVisualParity.unity === true,
    productVisualUnreal: renderedProductVisualParity.unreal === true,
    boundedPbrVisualParity: boundedLocalVisualParity(pbrVisual, "boundedPbrVisualParity"),
    boundedShadowVisualParity: boundedLocalVisualParity(shadowVisual, "boundedShadowVisualParity"),
    boundedHdrRenderTargetParity: boundedLocalVisualParity(hdrVisual, "boundedHdrRenderTargetParity"),
    postprocessRealSceneValidation: renderingValidations.some((entry) => isRecord(entry) && entry.name === "postprocess-lab-v4-preset" && entry.ok === true),
    forwardShadowSamplingValidation: renderingValidations.some((entry) => isRecord(entry) && entry.name === "forward-pass-shadow-map-sampling" && entry.ok === true),
    claimBoundary: "Local browser rendering evidence covers Galileo3D, Three.js, Babylon.js, and scoped V4 renderer features, but it is not Unity/Unreal rendered-output parity until real external same-scene baselines and visual diffs pass.",
  };
}

function boundedLocalVisualParity(report: Record<string, unknown> | null, field: string): boolean {
  const value = report?.[field];
  if (value === true) return true;
  return isRecord(value) && value.threejs === true && value.babylon === true;
}

function createEditorWorkflowEvidence(root: string): V4EditorWorkflowEvidence {
  const editor = readJson(root, "tests/reports/external-parity-editor-authoring.json");
  const prefab = readJson(root, "tests/reports/external-parity-editor-prefab-workflow.json");
  const authoredWorkflow = isRecord(editor?.authoredWorkflow) ? editor.authoredWorkflow : {};
  const checks = Array.isArray(editor?.checks) ? editor.checks : [];
  const passedCheckCount = checks.filter((check) => isRecord(check) && check.passed === true).length;
  const exportedEvidence = isRecord(editor?.exportedEvidence) ? editor.exportedEvidence : {};
  const exportedFeatureEvidence = isRecord(exportedEvidence.featureEvidence) ? exportedEvidence.featureEvidence : {};
  const timeline = isRecord(editor?.timelineEvidence) ? editor.timelineEvidence : {};
  const visualScripting = isRecord(editor?.visualScriptingEvidence) ? editor.visualScriptingEvidence : {};
  const editorPicking = isRecord(editor?.editorPicking) ? editor.editorPicking : {};
  const localizationAccessibility = isRecord(editor?.localizationAccessibility) ? editor.localizationAccessibility : {};
  const accessibility = isRecord(localizationAccessibility.accessibility) ? localizationAccessibility.accessibility : {};
  const prefabChecks = Array.isArray(prefab?.checks) ? prefab.checks : [];
  const prefabMetrics = prefabChecks
    .map((check) => isRecord(check) && isRecord(check.metrics) ? check.metrics : null)
    .find((metrics): metrics is Record<string, unknown> => metrics !== null) ?? {};
  return {
    editorReportOk: editor?.ok === true,
    prefabReportOk: prefab?.ok === true,
    passedCheckCount,
    authoredWorkflowSignals: uniqueSorted(Object.entries(authoredWorkflow).flatMap(([key, value]) => value === true ? [key] : [])),
    importedAssetCount: Number(exportedEvidence.assetCount ?? 0),
    exportedStaticApp: authoredWorkflow.exportedStaticApp === true,
    staticExportWithoutEditorCode: exportedFeatureEvidence.usesEditorCode === false,
    prefabNodeCount: Number(prefabMetrics.prefabNodeCount ?? 0),
    prefabExportedNodeCount: Number(prefabMetrics.exportedNodeCount ?? 0),
    timelineTrackCount: Number(timeline.trackCount ?? 0),
    timelineClipCount: Number(timeline.clipCount ?? 0),
    visualScriptingNodeCount: Number(visualScripting.nodeCount ?? 0),
    gpuPickingEvidence: isRecord(editorPicking.evidence) && editorPicking.evidence.colorIdEncoding === true && editorPicking.evidence.raycastFallback === true,
    localizationLocaleCount: Number(localizationAccessibility.localeCount ?? 0),
    accessibilityAaContrastPasses: accessibility.aaContrastPasses === true,
    claimBoundary: "Browser editor authoring evidence covers current Galileo3D hierarchy, inspector, prefab, timeline, visual-scripting, picking, localization/accessibility, and static-export workflows, but it is not Unity Editor or Unreal Editor project/workflow equivalence.",
  };
}

function createAssetImportPreflightEvidence(): V4AssetImportPreflightEvidence {
  const samples = [
    createAssetImportPreflightReport("fixtures/assets/v4/product/v4-product-speaker/v4-product-speaker.gltf", { profile: "high-quality", fileBytes: 256_000 }),
    createAssetImportPreflightReport("fixtures/assets/v4/product/v4-product-speaker/v4-product-speaker.glb", { profile: "web", fileBytes: 256_000 }),
    createAssetImportPreflightReport("external-dcc-scene.fbx", { profile: "balanced", fileBytes: 1_024_000 }),
    createAssetImportPreflightReport("external-dcc-stage.usd", { profile: "high-quality", fileBytes: 1_024_000 }),
    createAssetImportPreflightReport("external-ar-package.usdz", { profile: "mobile", fileBytes: 768_000 }),
    createAssetImportPreflightReport("external-mesh.obj", { profile: "web", fileBytes: 512_000 }),
    createAssetImportPreflightReport("external-scene.dae", { profile: "balanced", fileBytes: 512_000 }),
    createAssetImportPreflightReport("external-unknown.asset", { profile: "balanced", fileBytes: 128_000 }),
  ];
  const supportedFormats = uniqueSorted(samples.filter((report) => report.status === "supported").map((report) => report.format));
  const conversionRequiredFormats = uniqueSorted(samples.filter((report) => report.status === "convert-required").map((report) => report.format));
  const blockedFormats = uniqueSorted(samples.filter((report) => report.status === "blocked").map((report) => report.format));
  const profiles = uniqueSorted(samples.map((report) => report.profile));
  const diagnosticCodes = uniqueSorted(samples.flatMap((report) => report.diagnostics.map((diagnostic) => diagnostic.code)));
  const claimBoundary = samples[0]?.claimBoundary ?? "Asset import preflight evidence is unavailable.";
  return {
    source: "origin-master-asset-importer-adapted",
    currentPipeline: "gltf-first",
    supportedFormats,
    conversionRequiredFormats,
    blockedFormats,
    profiles,
    diagnosticCodes,
    claimBoundary,
  };
}

function createDeploymentWorkflowEvidence(root: string): V4DeploymentWorkflowEvidence {
  const staticExport = readJson(root, "tests/reports/external-demo-static-export.json");
  const staticServerSmoke = readJson(root, "tests/reports/static-demo-server-smoke.json");
  const publicDeploymentSmoke = readJson(root, "tests/reports/public-demo-deployment-smoke.json");
  return {
    staticExportOk: staticExport?.ok === true,
    ...(typeof staticExport?.outputDir === "string" ? { staticExportOutputDir: staticExport.outputDir } : {}),
    staticDemoServerSmokeOk: staticServerSmoke?.ok === true,
    publicDeploymentSmokeOk: publicDeploymentSmoke?.ok === true,
    ...(typeof publicDeploymentSmoke?.deploymentUrl === "string" ? { publicDeploymentUrl: publicDeploymentSmoke.deploymentUrl } : {}),
    publicDeploymentRunbookPath: "tests/reports/public-demo-deployment-runbook.md",
    githubPagesWorkflowPath: ".github/workflows/v4-public-demo-deploy.yml",
    claimBoundary: "Local static export, GitHub Pages workflow, and static-server smoke evidence do not prove Unity/Unreal deployment parity or production readiness until durable public HTTPS validation and native engine deployment baselines pass.",
  };
}

function createRuntimeWorkflowEvidence(root: string): V4RuntimeWorkflowEvidence {
  const runtime = readJson(root, "tests/reports/external-parity-runtime.json");
  const gameSlice = isRecord(runtime?.gameSlice) ? runtime.gameSlice : {};
  const state = isRecord(gameSlice.state) ? gameSlice.state : {};
  const diagnostics = isRecord(state.diagnostics) ? state.diagnostics : {};
  const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
  const pixels = isRecord(gameSlice.pixels) ? gameSlice.pixels : {};
  const mobileTouch = isRecord(runtime?.mobileTouch) ? runtime.mobileTouch : {};
  const completedTasks = Array.isArray(runtime?.completedTasks) ? runtime.completedTasks : [];
  const blockedTasks = Array.isArray(runtime?.blockedTasks) ? runtime.blockedTasks : [];
  const oldBranchRuntimePortEvidence = uniqueSorted(Object.keys(featureEvidence).filter((key) => key.startsWith("oldBranch")));
  return {
    runtimeReportOk: runtime?.ok === true,
    completedRuntimeTaskCount: completedTasks.length,
    ...(typeof state.status === "string" ? { gameSliceStatus: state.status } : {}),
    gameSliceDrawCalls: Number(diagnostics.drawCalls ?? 0),
    gameSliceFeatureEvidenceCount: Object.keys(featureEvidence).length,
    gameSliceNonBlankPixels: Number(pixels.nonBlankPixels ?? 0),
    mobileTouchEvidence: isRecord(mobileTouch.assetViewer) && isRecord(mobileTouch.editor) && isRecord(mobileTouch.game),
    blockedTaskCount: blockedTasks.length,
    oldBranchRuntimePortEvidence,
    claimBoundary: "Browser runtime evidence covers current Galileo3D game-slice systems and old-branch runtime concept ports, but it is not native Unity/Unreal editor play-mode, build-target, profiler, middleware, or runtime project parity.",
  };
}

function workflowArea(id: string, requiredForParity: string, currentEvidence: string, blockers: readonly string[]) {
  return {
    id,
    requiredForParity,
    currentEvidence,
    ready: blockers.length === 0,
    blockers,
  };
}

function externalEngineBaseline(root: string, engine: "unity" | "unreal", baselineSlots: readonly Record<string, unknown>[]): ExternalEngineBaseline {
  const envName = engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR";
  const envPath = process.env[envName];
  const pathExecutable = findExternalEditorExecutable(engine);
  const executable = normalizeEditorExecutablePath(engine, envPath) ?? pathExecutable;
  const executableSource = executable ? (envPath && executable === envPath ? "env" : "path") : "not-found";
  const cliSmokeRequired = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE === "true";
  const cliSmokeCommand = executable ? cliCommandFor(engine, executable) : [];
  const cliSmoke = executable && cliSmokeRequired ? runCliSmoke(cliSmokeCommand) : { ok: false, output: null };
  const baselineReportPath = engine === "unity" ? "tests/reports/external-parity-unity-baseline-render.json" : "tests/reports/external-parity-unreal-baseline-render.json";
  const baselineReport = validateRenderWorkflowBaseline(root, engine, baselineReportPath);
  const baselineReportPresent = baselineReport.present;
  const assetImportWorkflowReportPath = `tests/reports/external-parity-${engine}-asset-import-workflow.json`;
  const assetImportWorkflowReport = validateAssetImportWorkflowBaseline(root, engine, assetImportWorkflowReportPath);
  const assetImportWorkflowReportPresent = assetImportWorkflowReport.present;
  const productVisualBaselineReportPath = `tests/reports/external-parity-${engine}-product-visual-baseline.json`;
  const productVisualBaselinePresent = existsSync(join(root, productVisualBaselineReportPath));
  const productVisualBaselineOk = hasValidatedProductVisualBaseline(root, engine);
  const sceneBaselines = baselineSlots.map((slot) => validateExternalSceneBaseline(root, engine, slot));
  const blockers = [
    ...(executable ? [] : [`${engine} editor executable not found; set ${envName} to a local editor binary or add it to PATH.`]),
    ...(cliSmokeRequired ? (cliSmoke.ok ? [] : [`${engine} CLI smoke did not pass.`]) : [`${engine} CLI smoke was not run; set G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true to verify the editor binary.`]),
    ...(baselineReport.ok ? [] : [`${baselineReportPath} is missing or invalid; no same-scene ${engine} render/workflow baseline is attached: ${baselineReport.violations.join("; ")}`]),
    ...(assetImportWorkflowReport.ok ? [] : [`${assetImportWorkflowReportPath} is missing or invalid; no same-scene ${engine} asset-import workflow baseline is attached: ${assetImportWorkflowReport.violations.join("; ")}`]),
    ...(productVisualBaselineOk ? [] : [
      productVisualBaselinePresent
        ? `${productVisualBaselineReportPath} is present but did not pass the product visual baseline validation in tests/reports/external-parity-product-visual-parity.json.`
        : `${productVisualBaselineReportPath} is missing; no validated same-scene ${engine} product visual baseline is attached.`,
    ]),
    ...sceneBaselines.flatMap((baseline) =>
      baseline.ok ? [] : [`${baseline.reportPath} is missing or invalid for ${baseline.baselineKind}: ${baseline.violations.join("; ")}`]
    ),
  ];
  return {
    engine,
    executable,
    executableSource,
    cliSmokeRequired,
    cliSmokeRan: Boolean(executable && cliSmokeRequired),
    cliSmokeOk: Boolean(executable && cliSmokeRequired && cliSmoke.ok),
    cliSmokeCommand,
    cliSmokeOutput: cliSmoke.output,
    baselineReportPath,
    baselineReportPresent,
    baselineReportOk: baselineReport.ok,
    baselineReport,
    assetImportWorkflowReportPath,
    assetImportWorkflowReportPresent,
    assetImportWorkflowReportOk: assetImportWorkflowReport.ok,
    assetImportWorkflowReport,
    productVisualBaselineReportPath,
    productVisualBaselinePresent,
    productVisualBaselineOk,
    sceneBaselines,
    blockers,
  };
}

function validateRenderWorkflowBaseline(root: string, engine: "unity" | "unreal", reportPath: string): ExternalRenderWorkflowBaselineValidation {
  const report = readJson(root, reportPath);
  const metrics = isRecord(report?.metrics) ? report.metrics : {};
  const violations = [
    ...(isRecord(report) ? [] : [`${reportPath} is missing`]),
    ...(report?.ok === true ? [] : ["baseline render report must set ok=true"]),
    ...(report?.engine === engine ? [] : [`baseline render report must set engine="${engine}"`]),
    ...(report?.sameSceneRenderWorkflowBaseline === true ? [] : ["baseline render report must set sameSceneRenderWorkflowBaseline=true"]),
    ...(report?.kitRoot === "fixtures/external-engine-baselines/v4" ? [] : ["baseline render report must use kitRoot=fixtures/external-engine-baselines/v4"]),
    ...(Number(metrics.sceneDescriptorSlots) >= 5 ? [] : ["metrics.sceneDescriptorSlots must be at least 5"]),
    ...(metrics.editorProjectOpened === true ? [] : ["metrics.editorProjectOpened must be true"]),
    ...(metrics.descriptorSceneBuilt === true ? [] : ["metrics.descriptorSceneBuilt must be true"]),
    ...(metrics.renderedFrameCaptured === true ? [] : ["metrics.renderedFrameCaptured must be true"]),
    ...(metrics.cliSmokeRan === true ? [] : ["metrics.cliSmokeRan must be true"]),
  ];
  return {
    engine,
    reportPath,
    present: isRecord(report),
    ok: violations.length === 0,
    violations,
  };
}

function validateAssetImportWorkflowBaseline(root: string, engine: "unity" | "unreal", reportPath: string): ExternalAssetImportWorkflowBaselineValidation {
  const report = readJson(root, reportPath);
  const metrics = isRecord(report?.metrics) ? report.metrics : {};
  const runnerEvidence = isRecord(report?.runnerEvidence) ? report.runnerEvidence : {};
  const runnerEvidencePath = typeof report?.runnerEvidencePath === "string" ? report.runnerEvidencePath : undefined;
  const runnerEvidenceSha256 = typeof report?.runnerEvidenceSha256 === "string" ? report.runnerEvidenceSha256 : undefined;
  const conversionRequiredFormats = Array.isArray(runnerEvidence.conversionRequiredFormats) ? runnerEvidence.conversionRequiredFormats : [];
  const nativeSupportedFormats = Array.isArray(runnerEvidence.nativeSupportedFormats) ? runnerEvidence.nativeSupportedFormats : [];
  const violations = [
    ...(isRecord(report) ? [] : [`${reportPath} is missing`]),
    ...(report?.ok === true ? [] : ["asset import workflow report must set ok=true"]),
    ...(report?.engine === engine ? [] : [`asset import workflow report must set engine="${engine}"`]),
    ...(report?.sameSceneAssetImportWorkflowBaseline === true ? [] : ["asset import workflow report must set sameSceneAssetImportWorkflowBaseline=true"]),
    ...(report?.kitRoot === "fixtures/external-engine-baselines/v4" ? [] : ["asset import workflow report must use kitRoot=fixtures/external-engine-baselines/v4"]),
    ...(runnerEvidencePath ? [] : ["asset import workflow report must include runnerEvidencePath"]),
    ...(runnerEvidenceSha256?.match(/^[0-9a-f]{64}$/) ? [] : ["asset import workflow report must include runnerEvidenceSha256 as a 64-character hex hash"]),
    ...(runnerEvidencePath && existsSync(join(root, runnerEvidencePath)) ? [] : ["asset import workflow runner evidence sidecar is missing"]),
    ...(runnerEvidence.ok === true ? [] : ["embedded runner evidence ok must be true"]),
    ...(runnerEvidence.engine === engine ? [] : [`embedded runner evidence engine must be ${engine}`]),
    ...(runnerEvidence.workflowKind === "asset-import" ? [] : ["embedded runner evidence workflowKind must be asset-import"]),
    ...(metrics.editorProjectOpened === true ? [] : ["metrics.editorProjectOpened must be true"]),
    ...(metrics.assetImportWorkflowRan === true ? [] : ["metrics.assetImportWorkflowRan must be true"]),
    ...(Number(metrics.importedGltfAssets) >= 1 ? [] : ["metrics.importedGltfAssets must be at least 1"]),
    ...(Number(metrics.importedMeshes) >= 1 ? [] : ["metrics.importedMeshes must be at least 1"]),
    ...(Number(metrics.importedMaterials) >= 1 ? [] : ["metrics.importedMaterials must be at least 1"]),
    ...(Number(metrics.importedTextures) >= 1 ? [] : ["metrics.importedTextures must be at least 1"]),
    ...(Number(metrics.conversionRequiredFormats) >= 4 ? [] : ["metrics.conversionRequiredFormats must be at least 4"]),
    ...(conversionRequiredFormats.includes("fbx") && conversionRequiredFormats.includes("usd") && conversionRequiredFormats.includes("dae") && nativeSupportedFormats.includes("obj")
      ? []
      : ["embedded runner evidence conversionRequiredFormats must include fbx/usd/dae and nativeSupportedFormats must include obj for the audited bounded native OBJ import path"]),
  ];
  return {
    engine,
    reportPath,
    present: isRecord(report),
    ok: violations.length === 0,
    runnerEvidencePath,
    runnerEvidenceSha256,
    violations,
  };
}

function validateExternalSceneBaseline(root: string, engine: "unity" | "unreal", slot: Record<string, unknown>): ExternalSceneBaselineValidation {
  const baselineKind = typeof slot.baselineKind === "string" ? slot.baselineKind : "unknown";
  const sceneDescriptorId = typeof slot.id === "string" ? slot.id : "unknown";
  const descriptorPath = typeof slot.descriptorPath === "string" ? slot.descriptorPath : "";
  const descriptor = descriptorPath.length > 0 ? readJson(root, descriptorPath) : null;
  const descriptorSha256 = descriptorPath.length > 0 ? sha256File(root, descriptorPath) : null;
  const sceneDescriptorVersion = typeof descriptor?.schemaVersion === "string" ? descriptor.schemaVersion : "unknown";
  const viewport = isRecord(descriptor?.viewport) ? descriptor.viewport : {};
  const targets = isRecord(slot.targetReports) ? slot.targetReports : {};
  const reportPath = typeof targets[engine] === "string" ? targets[engine] : `tests/reports/external-parity-${engine}-${baselineKind}-baseline.json`;
  const report = readJson(root, reportPath);
  const metrics = isRecord(report?.metrics) ? report.metrics : {};
  const minimumEvidence = isRecord(descriptor?.minimumEvidence) ? descriptor.minimumEvidence : {};
  const screenshot = isRecord(report) ? validateExternalBaselineScreenshot(root, report, minimumEvidence, viewport) : { ok: false, reason: "baseline report missing" };
  const screenshotPath = isRecord(report) && typeof report.screenshotPath === "string" ? report.screenshotPath : undefined;
  const runnerEvidence = isRecord(report)
    ? validateExternalRunnerEvidence(root, report, {
      engine,
      baselineKind,
      sceneDescriptorId,
      sceneDescriptorVersion,
      screenshotPath: screenshotPath ?? "",
      minimumEvidence,
      width: screenshot.width,
      height: screenshot.height,
    })
    : { ok: false, violations: ["baseline report missing"] };
  const galileoScreenshotPath = galileoScreenshotPathForBaselineKind(baselineKind);
  const diffAgainstGalileo = screenshot.ok && screenshotPath && galileoScreenshotPath
    ? createExternalSceneScreenshotDiff(root, baselineKind, galileoScreenshotPath, screenshotPath, engine)
    : undefined;
  const metricViolations = Object.entries(minimumEvidence).flatMap(([name, value]) => {
    if (typeof value !== "number") return [];
    const actual = Number(metrics[name]);
    return actual >= value ? [] : [`metrics.${name} must be at least ${value}`];
  });
  const violations = [
    ...(isRecord(report) ? [] : [`${reportPath} is missing; no same-scene ${engine} ${baselineKind} baseline is attached.`]),
    ...(report?.ok === true ? [] : ["baseline report must set ok=true"]),
    ...(report?.engine === engine ? [] : [`baseline report must set engine="${engine}"`]),
    ...(report?.baselineKind === baselineKind ? [] : [`baseline report must set baselineKind="${baselineKind}"`]),
    ...(report?.sameSceneExternalBaseline === true ? [] : ["baseline report must set sameSceneExternalBaseline=true"]),
    ...(report?.sceneDescriptorId === sceneDescriptorId ? [] : [`baseline report must use sceneDescriptorId=${sceneDescriptorId}`]),
    ...(report?.sceneDescriptorVersion === sceneDescriptorVersion ? [] : [`baseline report must use sceneDescriptorVersion=${sceneDescriptorVersion}`]),
    ...(descriptorSha256 && report?.descriptorSha256 === descriptorSha256 ? [] : [`baseline report must use descriptorSha256=${descriptorSha256 ?? "available fixture descriptor hash"}`]),
    ...(report?.visualDiffAgainstGalileo === true ? [] : ["baseline report must set visualDiffAgainstGalileo=true"]),
    ...metricViolations,
    ...(screenshot.ok ? [] : [`screenshot validation failed: ${screenshot.reason ?? "unknown reason"}`]),
    ...runnerEvidence.violations.map((violation) => `runner evidence validation failed: ${violation}`),
    ...(diffAgainstGalileo?.pass === false ? [`external screenshot diff failed against current Galileo ${baselineKind} render: ${diffAgainstGalileo.reason ?? "thresholds exceeded"}`] : []),
  ];
  return {
    engine,
    baselineKind,
    sceneDescriptorId,
    sceneDescriptorVersion,
    descriptorSha256,
    descriptorPath,
    reportPath,
    present: isRecord(report),
    ok: violations.length === 0,
    screenshot: {
      ok: screenshot.ok,
      path: screenshotPath,
      width: screenshot.width,
      height: screenshot.height,
      byteLength: screenshot.byteLength,
      nonBlankPixels: screenshot.nonBlankPixels,
      colorBuckets: screenshot.colorBuckets,
      sha256: screenshot.sha256,
      reason: screenshot.ok ? undefined : screenshot.reason,
    },
    runnerEvidence: {
      ok: runnerEvidence.ok,
      path: runnerEvidence.path,
      sha256: runnerEvidence.sha256,
      violations: runnerEvidence.violations,
    },
    diffAgainstGalileo,
    violations,
  };
}

function validateExternalRunnerEvidence(root: string, report: Record<string, unknown>, expected: {
  readonly engine: "unity" | "unreal";
  readonly baselineKind: string;
  readonly sceneDescriptorId: string;
  readonly sceneDescriptorVersion: string;
  readonly screenshotPath: string;
  readonly minimumEvidence: Record<string, unknown>;
  readonly width?: number;
  readonly height?: number;
}): {
  readonly ok: boolean;
  readonly path?: string;
  readonly sha256?: string;
  readonly violations: readonly string[];
} {
  const evidencePath = typeof report.runnerEvidencePath === "string" ? report.runnerEvidencePath : "";
  const expectedSha256 = typeof report.runnerEvidenceSha256 === "string" ? report.runnerEvidenceSha256 : "";
  const reportEvidence = isRecord(report.runnerEvidence) ? report.runnerEvidence : null;
  if (evidencePath.length === 0) {
    return { ok: false, violations: ["baseline report must include runnerEvidencePath"] };
  }
  const fullPath = join(root, evidencePath);
  if (!existsSync(fullPath)) {
    return { ok: false, path: evidencePath, violations: [`runner evidence sidecar is missing at ${evidencePath}`] };
  }
  const evidenceText = readFileSync(fullPath, "utf8");
  const actualSha256 = createHash("sha256").update(evidenceText).digest("hex");
  const parsedEvidence = parseJsonRecord(evidenceText);
  const metrics = isRecord(parsedEvidence?.metrics) ? parsedEvidence.metrics : {};
  const reportBaselineMetrics = isRecord(report.metrics) ? report.metrics : {};
  const reportMetrics = isRecord(reportEvidence?.metrics) ? reportEvidence.metrics : {};
  const violations = [
    ...(expectedSha256.match(/^[0-9a-f]{64}$/) ? [] : ["baseline report must include runnerEvidenceSha256 as a 64-character hex hash"]),
    ...(expectedSha256.length === 0 || expectedSha256 === actualSha256 ? [] : ["runnerEvidenceSha256 does not match sidecar contents"]),
    ...(parsedEvidence ? [] : ["runner evidence sidecar must contain a JSON object"]),
    ...(reportEvidence ? [] : ["baseline report must embed runnerEvidence object"]),
    ...(parsedEvidence?.ok === true ? [] : ["runner evidence ok must be true"]),
    ...(parsedEvidence?.engine === expected.engine ? [] : [`runner evidence engine must be ${expected.engine}`]),
    ...(parsedEvidence?.baselineKind === expected.baselineKind ? [] : [`runner evidence baselineKind must be ${expected.baselineKind}`]),
    ...(parsedEvidence?.sceneDescriptorId === expected.sceneDescriptorId ? [] : [`runner evidence sceneDescriptorId must be ${expected.sceneDescriptorId}`]),
    ...(parsedEvidence?.sceneDescriptorVersion === expected.sceneDescriptorVersion ? [] : [`runner evidence sceneDescriptorVersion must be ${expected.sceneDescriptorVersion}`]),
    ...(parsedEvidence?.screenshotPath === expected.screenshotPath ? [] : ["runner evidence screenshotPath must match baseline screenshotPath"]),
    ...(parsedEvidence?.renderedFrameCaptured === true ? [] : ["runner evidence renderedFrameCaptured must be true"]),
    ...(parsedEvidence?.cameraConfigured === true ? [] : ["runner evidence cameraConfigured must be true"]),
    ...(expected.width === undefined || Number(metrics.width) === expected.width ? [] : [`runner evidence metrics.width ${Number(metrics.width)} must equal ${expected.width}`]),
    ...(expected.height === undefined || Number(metrics.height) === expected.height ? [] : [`runner evidence metrics.height ${Number(metrics.height)} must equal ${expected.height}`]),
    ...minimumEvidenceViolations("runner evidence metrics", metrics, expected.minimumEvidence),
    ...reportMetricsMustMatchRunnerEvidence(reportBaselineMetrics, metrics, expected.minimumEvidence),
    ...(reportEvidence && parsedEvidence ? embeddedRunnerEvidenceViolations(reportEvidence, parsedEvidence) : []),
    ...(reportEvidence && parsedEvidence ? minimumEvidenceViolations("embedded runner evidence metrics", reportMetrics, expected.minimumEvidence) : []),
  ];
  return {
    ok: violations.length === 0,
    path: evidencePath,
    sha256: actualSha256,
    violations,
  };
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function minimumEvidenceViolations(prefix: string, metrics: Record<string, unknown>, minimumEvidence: Record<string, unknown>): string[] {
  return Object.entries(minimumEvidence).flatMap(([key, minimum]) => {
    if (key === "width" || key === "height" || key === "nonBlankPixels" || key === "colorBuckets" || typeof minimum !== "number") return [];
    const value = Number(metrics[key]);
    return Number.isFinite(value) && value >= minimum ? [] : [`${prefix}.${key} ${value} must be at least ${minimum}`];
  });
}

function embeddedRunnerEvidenceViolations(embedded: Record<string, unknown>, sidecar: Record<string, unknown>): string[] {
  const keys = ["ok", "engine", "baselineKind", "sceneDescriptorId", "sceneDescriptorVersion", "screenshotPath", "renderedFrameCaptured", "cameraConfigured"] as const;
  const violations = keys.flatMap((key) => embedded[key] === sidecar[key] ? [] : [`embedded runnerEvidence.${key} must match sidecar`]);
  const embeddedMetrics = isRecord(embedded.metrics) ? embedded.metrics : {};
  const sidecarMetrics = isRecord(sidecar.metrics) ? sidecar.metrics : {};
  return [
    ...violations,
    ...Object.keys(sidecarMetrics).flatMap((key) => embeddedMetrics[key] === sidecarMetrics[key] ? [] : [`embedded runnerEvidence.metrics.${key} must match sidecar`]),
  ];
}

function reportMetricsMustMatchRunnerEvidence(reportMetrics: Record<string, unknown>, runnerMetrics: Record<string, unknown>, minimumEvidence: Record<string, unknown>): string[] {
  return runnerBackedMetricKeys(minimumEvidence).flatMap((key) => {
    const reportValue = Number(reportMetrics[key]);
    const runnerValue = Number(runnerMetrics[key]);
    return Number.isFinite(reportValue) && Number.isFinite(runnerValue) && reportValue === runnerValue
      ? []
      : [`metrics.${key} must match runner evidence metric ${key}`];
  });
}

function runnerBackedMetricKeys(minimumEvidence: Record<string, unknown>): string[] {
  return ["width", "height", ...Object.keys(minimumEvidence).filter((key) => key !== "width" && key !== "height" && key !== "nonBlankPixels" && key !== "colorBuckets")];
}

function hasValidatedProductVisualBaseline(root: string, engine: "unity" | "unreal"): boolean {
  const productVisualParity = readJson(root, "tests/reports/external-parity-product-visual-parity.json");
  if (productVisualParity?.ok !== true) return false;
  const renderedProductVisualParity = isRecord(productVisualParity.renderedProductVisualParity)
    ? productVisualParity.renderedProductVisualParity
    : {};
  const externalBaselines = isRecord(productVisualParity.externalBaselines)
    ? productVisualParity.externalBaselines
    : {};
  const baseline = isRecord(externalBaselines[engine]) ? externalBaselines[engine] : {};
  return renderedProductVisualParity[engine] === true && baseline.ok === true && baseline.present === true;
}

function externalBaselineBlockers(baseline: ExternalEngineBaseline, label: "Unity" | "Unreal"): readonly string[] {
  return baseline.blockers.map((blocker) => `${label} baseline: ${blocker}`);
}

function externalAssetImportWorkflowBlockers(baseline: ExternalEngineBaseline, label: "Unity" | "Unreal"): readonly string[] {
  if (baseline.assetImportWorkflowReportOk) return [];
  return [
    `${label} asset-import workflow: ${baseline.assetImportWorkflowReportPath} is missing or invalid; no real editor import workflow evidence is attached: ${baseline.assetImportWorkflowReport.violations.join("; ")}`,
  ];
}

function externalBaselineSlotSummary(report: Record<string, unknown> | null): string {
  const slots = externalBaselineSlots(report);
  const kinds = slots
    .map((slot) => typeof slot.baselineKind === "string" ? slot.baselineKind : "")
    .filter((kind) => kind.length > 0);
  return kinds.length > 0 ? kinds.join(", ") : "product-visual only";
}

function externalBaselineSlots(report: Record<string, unknown> | null): readonly Record<string, unknown>[] {
  return Array.isArray(report?.sceneSlots) ? report.sceneSlots.filter(isRecord) : [];
}

function validateExternalBaselineScreenshot(root: string, report: Record<string, unknown>, minimumEvidence: Record<string, unknown>, viewport: Record<string, unknown>): {
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly nonBlankPixels?: number;
  readonly colorBuckets?: number;
  readonly sha256?: string;
  readonly reason?: string;
} {
  const screenshotPath = typeof report.screenshotPath === "string" ? report.screenshotPath : "";
  if (screenshotPath.length === 0) return { ok: false, reason: "missing screenshotPath" };
  const fullPath = join(root, screenshotPath);
  if (!existsSync(fullPath)) return { ok: false, reason: "screenshot missing" };
  const byteLength = statSync(fullPath).size;
  const data = readFileSync(fullPath);
  const png = readPngPixels(data);
  if (!png.ok) return { ok: false, byteLength, reason: png.reason };
  const expectedWidth = Number(minimumEvidence.width ?? viewport.width ?? 1);
  const expectedHeight = Number(minimumEvidence.height ?? viewport.height ?? 1);
  const minNonBlankPixels = Number(minimumEvidence.nonBlankPixels ?? 1);
  const minColorBuckets = Number(minimumEvidence.colorBuckets ?? 1);
  const expectedSha256 = typeof report.screenshotSha256 === "string" ? report.screenshotSha256 : "";
  const actualSha256 = createHash("sha256").update(data).digest("hex");
  const failures = [
    ...(png.width === expectedWidth ? [] : [`width ${png.width} !== ${expectedWidth}`]),
    ...(png.height === expectedHeight ? [] : [`height ${png.height} !== ${expectedHeight}`]),
    ...(byteLength > 8_192 ? [] : [`byteLength ${byteLength} <= 8192`]),
    ...(png.nonBlankPixels >= minNonBlankPixels ? [] : [`nonBlankPixels ${png.nonBlankPixels} < ${minNonBlankPixels}`]),
    ...(png.colorBuckets >= minColorBuckets ? [] : [`colorBuckets ${png.colorBuckets} < ${minColorBuckets}`]),
    ...(expectedSha256.length === 0 || expectedSha256 === actualSha256 ? [] : ["sha256 mismatch"]),
  ];
  return {
    ok: failures.length === 0,
    width: png.width,
    height: png.height,
    byteLength,
    nonBlankPixels: png.nonBlankPixels,
    colorBuckets: png.colorBuckets,
    sha256: actualSha256,
    reason: failures.length === 0 ? undefined : `external baseline screenshot failed pixel validation: ${failures.join(", ")}`,
  };
}

function sha256File(root: string, path: string): string | null {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return null;
  return createHash("sha256").update(readFileSync(fullPath, "utf8")).digest("hex");
}

function readPngPixels(data: Buffer): {
  readonly ok: true;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
} | { readonly ok: false; readonly reason: string } {
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
  if (width <= 0 || height <= 0) return { ok: false, reason: "PNG has zero dimensions" };
  if (bitDepth !== 8) return { ok: false, reason: `unsupported PNG bit depth ${bitDepth}` };
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (channels === 0) return { ok: false, reason: `unsupported PNG color type ${colorType}` };
  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd + 4 > data.length) return { ok: false, reason: "truncated PNG chunk" };
    if (type === "IDAT") idatChunks.push(data.subarray(chunkStart, chunkEnd));
    if (type === "IEND") break;
    offset = chunkEnd + 4;
  }
  if (idatChunks.length === 0) return { ok: false, reason: "PNG has no IDAT data" };
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const expectedLength = (stride + 1) * height;
  if (inflated.length < expectedLength) return { ok: false, reason: "inflated PNG data is truncated" };
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const pixels = new Uint8Array(width * height * 4);
  const buckets = new Set<string>();
  let nonBlankPixels = 0;
  let readOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset] ?? 0;
    if (filter > 4) return { ok: false, reason: `unsupported PNG filter ${filter}` };
    readOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[readOffset + x] ?? 0;
      const left = x >= channels ? current[x - channels] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      current[x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const r = current[index] ?? 0;
      const g = channels === 1 ? r : current[index + 1] ?? 0;
      const b = channels === 1 ? r : current[index + 2] ?? 0;
      const a = channels === 4 ? current[index + 3] ?? 255 : 255;
      const pixelIndex = (y * width + x) * 4;
      pixels[pixelIndex] = r;
      pixels[pixelIndex + 1] = g;
      pixels[pixelIndex + 2] = b;
      pixels[pixelIndex + 3] = a;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    current.copy(previous);
    current.fill(0);
    readOffset += stride;
  }
  return { ok: true, width, height, pixels, nonBlankPixels, colorBuckets: buckets.size };
}

function galileoScreenshotPathForBaselineKind(baselineKind: string): string | null {
  switch (baselineKind) {
    case "pbr-visual":
      return "tests/reports/external-parity-pbr-visual-parity/galileo-pbr.png";
    case "shadow-visual":
      return "tests/reports/external-parity-shadow-visual-parity/galileo-shadow.png";
    case "hdr-render-target":
      return "tests/reports/external-parity-hdr-visual-parity/galileo-hdr.png";
    case "postprocess-suite":
      return "tests/reports/comparison-screenshots/galileo-postprocess.png";
    case "product-visual":
      return "tests/reports/external-parity-product-visual-parity/galileo-product.png";
    default:
      return null;
  }
}

function createExternalSceneScreenshotDiff(root: string, baselineKind: string, galileoScreenshotPath: string, comparedScreenshotPath: string, engine: "unity" | "unreal"): ExternalSceneBaselineDiff {
  const baselineFullPath = join(root, galileoScreenshotPath);
  const comparedFullPath = join(root, comparedScreenshotPath);
  if (!existsSync(baselineFullPath)) {
    return failedExternalSceneDiff(baselineKind, engine, galileoScreenshotPath, comparedScreenshotPath, `current Galileo ${baselineKind} screenshot is missing`);
  }
  if (!existsSync(comparedFullPath)) {
    return failedExternalSceneDiff(baselineKind, engine, galileoScreenshotPath, comparedScreenshotPath, `external ${engine} ${baselineKind} screenshot is missing`);
  }
  const baseline = readPngPixels(readFileSync(baselineFullPath));
  const compared = readPngPixels(readFileSync(comparedFullPath));
  if (!baseline.ok) {
    return failedExternalSceneDiff(baselineKind, engine, galileoScreenshotPath, comparedScreenshotPath, `current Galileo ${baselineKind} screenshot failed PNG validation: ${baseline.reason}`);
  }
  if (!compared.ok) {
    return failedExternalSceneDiff(baselineKind, engine, galileoScreenshotPath, comparedScreenshotPath, `external ${engine} ${baselineKind} screenshot failed PNG validation: ${compared.reason}`);
  }
  const width = Math.min(baseline.width, compared.width);
  const height = Math.min(baseline.height, compared.height);
  if (width <= 0 || height <= 0) {
    return failedExternalSceneDiff(baselineKind, engine, galileoScreenshotPath, comparedScreenshotPath, "screenshot diff requires non-empty images");
  }
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const baselineIndex = (y * baseline.width + x) * 4;
      const comparedIndex = (y * compared.width + x) * 4;
      const rDelta = Math.abs((baseline.pixels[baselineIndex] ?? 0) - (compared.pixels[comparedIndex] ?? 0));
      const gDelta = Math.abs((baseline.pixels[baselineIndex + 1] ?? 0) - (compared.pixels[comparedIndex + 1] ?? 0));
      const bDelta = Math.abs((baseline.pixels[baselineIndex + 2] ?? 0) - (compared.pixels[comparedIndex + 2] ?? 0));
      const pixelDelta = Math.max(rDelta, gDelta, bDelta);
      totalAbsoluteDelta += rDelta + gDelta + bDelta;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
      if (pixelDelta > 2) changedPixels += 1;
    }
  }
  const comparedPixels = width * height;
  const changedPixelRatio = changedPixels / comparedPixels;
  const meanAbsoluteError = totalAbsoluteDelta / (comparedPixels * 3);
  const thresholds = externalSceneDiffThresholds(baselineKind);
  const pass = changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError;
  return {
    baselineEngine: "galileo",
    comparedEngine: engine,
    baselineKind,
    baselinePath: galileoScreenshotPath,
    comparedPath: comparedScreenshotPath,
    width,
    height,
    comparedPixels,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass,
    thresholds,
    reason: pass ? undefined : `changedPixelRatio ${changedPixelRatio.toFixed(6)} > ${thresholds.maxChangedPixelRatio} or meanAbsoluteError ${meanAbsoluteError.toFixed(6)} > ${thresholds.maxMeanAbsoluteError}`,
  };
}

function externalSceneDiffThresholds(baselineKind: string): { readonly maxChangedPixelRatio: number; readonly maxMeanAbsoluteError: number } {
  switch (baselineKind) {
    case "pbr-visual":
      return { maxChangedPixelRatio: 0.4, maxMeanAbsoluteError: 35 };
    case "shadow-visual":
      return { maxChangedPixelRatio: 0.3, maxMeanAbsoluteError: 22 };
    case "hdr-render-target":
      return { maxChangedPixelRatio: 0.3, maxMeanAbsoluteError: 26 };
    case "postprocess-suite":
      return { maxChangedPixelRatio: 0.03, maxMeanAbsoluteError: 3 };
    default:
      return { maxChangedPixelRatio: 0.15, maxMeanAbsoluteError: 8 };
  }
}

function failedExternalSceneDiff(baselineKind: string, engine: "unity" | "unreal", baselinePath: string, comparedPath: string, reason: string): ExternalSceneBaselineDiff {
  return {
    baselineEngine: "galileo",
    comparedEngine: engine,
    baselineKind,
    baselinePath,
    comparedPath,
    width: 0,
    height: 0,
    comparedPixels: 0,
    changedPixels: 0,
    changedPixelRatio: 1,
    meanAbsoluteError: 255,
    maxChannelDelta: 255,
    pass: false,
    thresholds: externalSceneDiffThresholds(baselineKind),
    reason,
  };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function findExternalEditorExecutable(engine: "unity" | "unreal"): string | null {
  const names = engine === "unity" ? ["Unity", "unity"] : ["UnrealEditor-Cmd", "UnrealEditor", "unreal"];
  return findOnPath(names) ?? findMacEditorBundleExecutable(engine);
}

function normalizeEditorExecutablePath(engine: "unity" | "unreal", path: string | undefined): string | null {
  if (!path) return null;
  if (existsSync(path) && !path.endsWith(".app")) return path;
  const appExecutable = engine === "unity"
    ? join(path, "Contents/MacOS/Unity")
    : join(path, "Contents/MacOS/UnrealEditor");
  return existsSync(appExecutable) ? appExecutable : null;
}

function findOnPath(names: readonly string[]): string | null {
  for (const name of names) {
    const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(name)}`], { encoding: "utf8" });
    const output = result.status === 0 ? result.stdout.trim().split("\n")[0] : "";
    if (output) return output;
  }
  return null;
}

function findMacEditorBundleExecutable(engine: "unity" | "unreal"): string | null {
  const candidates = engine === "unity" ? unityMacCandidates() : unrealMacCandidates();
  return candidates.find((path) => existsSync(path)) ?? null;
}

function unityMacCandidates(): string[] {
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

function unrealMacCandidates(): string[] {
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

function editorSearchRoots(engine: "unity" | "unreal"): readonly string[] {
  const envName = engine === "unity" ? "G3D_UNITY_SEARCH_ROOTS" : "G3D_UNREAL_SEARCH_ROOTS";
  const defaults = engine === "unity"
    ? ["/Applications", "/Users/Shared/Unity"]
    : ["/Applications", "/Users/Shared/Epic Games", "/Users/Shared"];
  const envRoots = process.env[envName]
    ?.split(":")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) ?? [];
  return uniqueStrings([...envRoots, ...defaults]);
}

function safeReadDirectoryNames(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function cliCommandFor(engine: "unity" | "unreal", executable: string): readonly string[] {
  return engine === "unity" ? [executable, "-version"] : [executable, "-version"];
}

function runCliSmoke(command: readonly string[]): { readonly ok: boolean; readonly output: string | null } {
  if (command.length === 0) return { ok: false, output: null };
  const [executable, ...args] = command;
  const result = spawnSync(executable, args, { encoding: "utf8", timeout: 20_000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().slice(0, 2_000);
  return {
    ok: result.status === 0 && output.length > 0,
    output: output || null,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueSorted(values: readonly string[]): string[] {
  return uniqueStrings(values).sort();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4UnityUnrealParityReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    unityParity: report.unityParity,
    unrealParity: report.unrealParity,
    replacement: report.replacement,
    blockedAreas: report.workflowAreas.length,
    report: reportPath,
  }, null, 2));
}
