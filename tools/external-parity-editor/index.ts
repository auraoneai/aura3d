import { fileURLToPath } from "node:url";
import { baseReport, readJson, sourceFilesFromReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const existing = readJson(root, "tests/reports/external-parity-editor-authoring.json");
const prefabWorkflow = readJson(root, "tests/reports/external-parity-editor-prefab-workflow.json");
const authoredWorkflow = existing && typeof existing === "object" && "authoredWorkflow" in existing && typeof existing.authoredWorkflow === "object" && existing.authoredWorkflow !== null
  ? existing.authoredWorkflow as Record<string, unknown>
  : {};
const timelineEvidence = existing && typeof existing === "object" && "timelineEvidence" in existing && typeof existing.timelineEvidence === "object" && existing.timelineEvidence !== null
  ? existing.timelineEvidence as Record<string, unknown>
  : {};
const visualScriptingEvidence = existing && typeof existing === "object" && "visualScriptingEvidence" in existing && typeof existing.visualScriptingEvidence === "object" && existing.visualScriptingEvidence !== null
  ? existing.visualScriptingEvidence as Record<string, unknown>
  : {};
const gizmoEvidence = existing && typeof existing === "object" && "gizmoEvidence" in existing && typeof existing.gizmoEvidence === "object" && existing.gizmoEvidence !== null
  ? existing.gizmoEvidence as Record<string, unknown>
  : {};
const editorStateEvidence = existing && typeof existing === "object" && "editorStateEvidence" in existing && typeof existing.editorStateEvidence === "object" && existing.editorStateEvidence !== null
  ? existing.editorStateEvidence as Record<string, unknown>
  : {};
const timelineModelEvidence = timelineEvidence.evidence && typeof timelineEvidence.evidence === "object" && timelineEvidence.evidence !== null
  ? timelineEvidence.evidence as Record<string, unknown>
  : {};
const visualScriptingModelEvidence = visualScriptingEvidence.evidence && typeof visualScriptingEvidence.evidence === "object" && visualScriptingEvidence.evidence !== null
  ? visualScriptingEvidence.evidence as Record<string, unknown>
  : {};
const editorStateModelEvidence = editorStateEvidence.evidence && typeof editorStateEvidence.evidence === "object" && editorStateEvidence.evidence !== null
  ? editorStateEvidence.evidence as Record<string, unknown>
  : {};
const checks = [
  {
    id: "external-parity-editor-authoring-report-produced-by-editor-agent",
    passed: existing?.ok === true,
    evidencePaths: ["tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor authoring report is not yet passing.",
  },
  {
    id: "external-parity-editor-hierarchy-save-load-export",
    passed: existing?.ok === true && authoredWorkflow.hierarchyPersisted === true && authoredWorkflow.savedAndReloaded === true && authoredWorkflow.exportedStaticApp === true,
    evidencePaths: ["tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor hierarchy operations are not proven through save/load/export evidence.",
  },
  {
    id: "external-parity-editor-inspector-edits-persist",
    passed: existing?.ok === true && authoredWorkflow.inspectorEditsPersisted === true,
    evidencePaths: ["tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor inspector edits are not proven to persist for material, physics, script, animation, audio, and particles.",
  },
  {
    id: "external-parity-editor-prefab-round-trip",
    passed: prefabWorkflow?.ok === true,
    evidencePaths: ["tests/browser/editor-prefab-workflow.spec.ts", "tests/reports/external-parity-editor-prefab-workflow.json", "packages/editor-runtime/src/PrefabRegistry.ts"],
    blocker: "External parity editor prefab workflow is not proven through create, instantiate, save, reload, and export evidence.",
  },
  {
    id: "external-parity-editor-profiler-debug-panels",
    passed: existing?.ok === true && authoredWorkflow.profilerDiagnosticsVisible === true,
    evidencePaths: ["apps/editor/src/panels/ProfilerPanel.ts", "tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor profiler/debug diagnostics are not visible in the browser authoring flow.",
  },
  {
    id: "external-parity-editor-timeline-track-clip-authoring",
    passed: existing?.ok === true &&
      authoredWorkflow.timelineTrackClipEvidence === true &&
      Number(timelineEvidence.trackCount) >= 4 &&
      Number(timelineEvidence.clipCount) >= 5 &&
      timelineModelEvidence.oldCodebasePort === true &&
      timelineModelEvidence.boundedTimelineAuthoring === true &&
      timelineModelEvidence.clipEasing === true &&
      timelineModelEvidence.clipBlending === true &&
      timelineModelEvidence.muteLockState === true &&
      timelineModelEvidence.loopPlayback === true &&
      timelineModelEvidence.signalMarkers === true,
    evidencePaths: ["packages/editor-runtime/src/TimelineModel.ts", "apps/editor/src/panels/TimelinePanel.ts", "tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor timeline does not prove real track/clip/easing/blending/loop/signal authoring evidence.",
  },
  {
    id: "external-parity-editor-visual-scripting-authoring",
    passed: existing?.ok === true &&
      authoredWorkflow.visualScriptingAuthoringEvidence === true &&
      Number(visualScriptingEvidence.nodeCount) >= 10 &&
      Number(visualScriptingEvidence.edgeCount) >= 7 &&
      Number(visualScriptingEvidence.catalogSize) >= 30 &&
      visualScriptingEvidence.selectedOutput === "fast" &&
      Array.isArray(visualScriptingEvidence.loopIndices) &&
      visualScriptingEvidence.loopIndices.length === 3 &&
      visualScriptingModelEvidence.oldCodebasePort === true &&
      visualScriptingModelEvidence.editorVisibleGraph === true &&
      visualScriptingModelEvidence.mathLogicFlowCatalog === true &&
      visualScriptingModelEvidence.deterministicExecution === true &&
      visualScriptingModelEvidence.blockedUnityUnrealVisualScriptingParity === true,
    evidencePaths: ["packages/scripting/src/VisualNodeCatalog.ts", "packages/scripting/src/VisualGraphExecutor.ts", "apps/editor/src/panels/VisualScriptPanel.ts", "tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor does not prove visible bounded visual-scripting graph authoring and deterministic execution evidence.",
  },
  {
    id: "external-parity-editor-gizmo-snap-space-pivot-authoring",
    passed: existing?.ok === true &&
      authoredWorkflow.gizmoSnapSpacePivotEvidence === true &&
      gizmoEvidence.snapEnabled === true &&
      Number(gizmoEvidence.positionSnap) === 0.5 &&
      Number(gizmoEvidence.rotationSnapDegrees) === 15 &&
      Number(gizmoEvidence.scaleSnap) === 0.25 &&
      gizmoEvidence.spaceMode === "world" &&
      gizmoEvidence.pivotMode === "center",
    evidencePaths: ["packages/editor-runtime/src/Gizmo.ts", "packages/editor-runtime/src/EditorRuntime.ts", "apps/editor/src/viewport/EditorViewport.ts", "tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor gizmos do not prove snap, space, and pivot authoring evidence.",
  },
  {
    id: "external-parity-editor-persistent-state-model",
    passed: existing?.ok === true &&
      authoredWorkflow.editorStatePersistenceEvidence === true &&
      editorStateEvidence.persisted === true &&
      editorStateModelEvidence.oldCodebasePort === true &&
      editorStateModelEvidence.persistentEditorState === true &&
      editorStateModelEvidence.viewportSettings === true &&
      editorStateModelEvidence.gridSnapSettings === true &&
      editorStateModelEvidence.transformSpacePivotMode === true,
    evidencePaths: ["packages/editor-runtime/src/EditorStateModel.ts", "packages/editor-runtime/src/EditorRuntime.ts", "apps/editor/src/EditorShell.ts", "apps/editor/src/viewport/EditorViewport.ts", "tests/browser/editor-authoring-external-parity.spec.ts", "tests/reports/external-parity-editor-authoring.json"],
    blocker: "External parity editor does not prove persistent active-tool, viewport, grid/snap, transform-space, and pivot state evidence.",
  },
] as const;
const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
const report = {
  ...baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:external-parity-editor",
    runIdPrefix: "external-parity-editor",
    sourceFiles: ["tools/external-parity-editor/index.ts", "tests/reports/external-parity-editor-authoring.json", "tests/reports/external-parity-editor-prefab-workflow.json"],
    violations,
  }),
  subsystem: "editor-authoring",
  checks,
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (existing?.ok === true && violations.length === 0) {
    const normalized = {
      ...existing,
      ...baseReport(root, {
        ok: true,
        command: "pnpm verify:external-parity-editor",
        runIdPrefix: "external-parity-editor",
        sourceFiles: sourceFilesFromReport(existing, [
          "tools/external-parity-editor/index.ts",
          "packages/editor-runtime/src/Gizmo.ts",
          "packages/editor-runtime/src/EditorStateModel.ts",
          "packages/editor-runtime/src/EditorRuntime.ts",
          "packages/editor-runtime/src/TimelineModel.ts",
          "packages/scripting/src/VisualNodeCatalog.ts",
          "packages/scripting/src/VisualGraphExecutor.ts",
          "apps/editor/src/panels/TimelinePanel.ts",
          "apps/editor/src/panels/VisualScriptPanel.ts",
          "apps/editor/src/viewport/EditorViewport.ts",
          "tests/browser/editor-authoring-external-parity.spec.ts",
          "tests/browser/editor-prefab-workflow.spec.ts",
          "tests/reports/external-parity-editor-prefab-workflow.json",
          "examples/external-editor-authored-app/index.html",
        ], "tests/reports/external-parity-editor-authoring.json"),
        screenshotPaths: Array.isArray(existing.screenshotPaths) ? existing.screenshotPaths.filter((path): path is string => typeof path === "string") : [],
      }),
      normalizedBy: "tools/external-parity-editor/index.ts",
      checks,
    };
    writeJson(root, "tests/reports/external-parity-editor-authoring.json", normalized);
    console.log(JSON.stringify({ ok: true, normalized: "tests/reports/external-parity-editor-authoring.json" }, null, 2));
    process.exit(0);
  }
  writeJson(root, "tests/reports/external-parity-editor-authoring.json", report);
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
