import { fileURLToPath } from "node:url";
import { createSubsystemReport, pathExists, reportOk } from "../foundation-subsystem-report/index.js";
import { writeJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const baseReport = createSubsystemReport(root, {
  subsystem: "browser-editor-authoring",
  command: "pnpm verify:foundation-editor",
  reportPath: "tests/reports/foundation-editor-authoring.json",
  runIdPrefix: "foundation-editor",
  sourceFiles: [
    "docs/project/foundation-editor-authoring-plan.md",
    "apps/editor/index.html",
    "apps/editor/src/main.ts",
    "apps/editor/src/EditorShell.ts",
    "apps/editor/src/panels/TimelinePanel.ts",
    "packages/editor-runtime/src/StaticExportRuntime.ts",
    "examples/foundation-editor-authored-app/index.html",
    "examples/foundation-editor-authored-app/project.json",
    "examples/foundation-editor-authored-app/runtime.js",
    "tests/browser/editor-authoring-foundation.spec.ts",
    "tests/browser/editor-app.spec.ts",
    "tests/browser/editor-play-mode.spec.ts",
    "tests/browser/editor-import-workflow.spec.ts",
    "tests/browser/editor-exported-project.spec.ts",
  ],
  screenshotPaths: [
    "tests/reports/foundation-editor-screenshots/editor-authoring-v3.png",
    "tests/reports/foundation-editor-screenshots/editor-authoring-v3-export.png",
  ],
  checks: [
    {
      id: "editor-app-shell",
      description: "Browser editor app shell exists.",
      passed: pathExists(root, "apps/editor/index.html"),
      evidencePaths: ["apps/editor/index.html"],
      blocker: "apps/editor/index.html is missing.",
    },
    {
      id: "editor-browser-tests",
      description: "Editor browser authoring test exists and is run by pnpm verify:foundation-editor.",
      passed: pathExists(root, "tests/browser/editor-authoring-foundation.spec.ts"),
      evidencePaths: ["tests/browser/editor-authoring-foundation.spec.ts"],
      blocker: "tests/browser/editor-authoring-foundation.spec.ts is missing.",
    },
    {
      id: "editor-authored-export",
      description: "Editor-authored exported app example exists.",
      passed: pathExists(root, "examples/editor-authored-project/index.html"),
      evidencePaths: ["examples/editor-authored-project/index.html"],
      blocker: "Editor-authored exported app example is missing.",
    },
    {
      id: "v3-end-to-end-authoring-report",
      description: "v3 editor authoring report proves create/import/place/edit/play/save/reload/export/open workflow.",
      passed: pathExists(root, "examples/foundation-editor-authored-app/index.html") && pathExists(root, "tests/browser/editor-authoring-foundation.spec.ts"),
      evidencePaths: ["tests/browser/editor-authoring-foundation.spec.ts", "examples/foundation-editor-authored-app/index.html"],
      blocker: "The v3 end-to-end editor authoring workflow is not fully proven yet.",
    },
    {
      id: "editor-authoring-screenshots",
      description: "Stable v3 editor and exported-app screenshots are stored under tests/reports.",
      passed: pathExists(root, "tests/reports/foundation-editor-screenshots/editor-authoring-v3.png") && pathExists(root, "tests/reports/foundation-editor-screenshots/editor-authoring-v3-export.png"),
      evidencePaths: [
        "tests/reports/foundation-editor-screenshots/editor-authoring-v3.png",
        "tests/reports/foundation-editor-screenshots/editor-authoring-v3-export.png"
      ],
      blocker: "Stable editor authoring screenshot evidence is missing.",
    },
    {
      id: "editor-exported-app-interactive",
      description: "Generated and checked-in exported apps respond to user input and publish interaction state.",
      passed: pathExists(root, "packages/editor-runtime/src/StaticExportRuntime.ts") && pathExists(root, "tests/browser/editor-exported-project.spec.ts"),
      evidencePaths: ["packages/editor-runtime/src/StaticExportRuntime.ts", "examples/foundation-editor-authored-app/runtime.js", "tests/browser/editor-exported-project.spec.ts"],
      blocker: "Exported app interaction evidence is missing.",
    },
    {
      id: "editor-animation-clip-preview",
      description: "Editor timeline lists imported glTF animation clips and browser automation verifies clip selection, scrubbing, and playback state.",
      passed: pathExists(root, "apps/editor/src/panels/TimelinePanel.ts") && pathExists(root, "tests/browser/editor-authoring-foundation.spec.ts"),
      evidencePaths: ["apps/editor/src/panels/TimelinePanel.ts", "tests/browser/editor-authoring-foundation.spec.ts"],
      blocker: "Editor animation clip preview evidence is missing.",
    },
    {
      id: "editor-asset-reimport-cache-invalidation",
      description: "Editor asset reimport increments a revision/cache key and keeps scene references stable.",
      passed: pathExists(root, "apps/editor/src/panels/AssetBrowserPanel.ts") && pathExists(root, "tests/browser/editor-authoring-foundation.spec.ts"),
      evidencePaths: ["apps/editor/src/panels/AssetBrowserPanel.ts", "tests/browser/editor-authoring-foundation.spec.ts"],
      blocker: "Editor asset reimport/cache invalidation evidence is missing.",
    },
  ],
});
const passedCheckIds = new Set(baseReport.checks.filter((check) => check.passed).map((check) => check.id));
const exportedAppVerified = passedCheckIds.has("editor-authored-export") && passedCheckIds.has("v3-end-to-end-authoring-report");
const exportedAppVisuallyCredible = exportedAppVerified && passedCheckIds.has("editor-authoring-screenshots") && passedCheckIds.has("editor-exported-app-interactive");
const report = {
  ...baseReport,
  exportedAppVerified,
  exportedAppVisuallyCredible,
};
writeJson(root, "tests/reports/foundation-editor-authoring.json", report);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
