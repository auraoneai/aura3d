import { existsCheck, fileIncludes, writeReport } from "../check-common";

const checks = [
  existsCheck("packages/engine/src/devtools/AuraDiagnosticsOverlay.ts", "diagnostics overlay"),
  existsCheck("packages/engine/src/devtools/AuraAssetPanel.ts", "asset panel"),
  existsCheck("packages/engine/src/devtools/AuraPerformancePanel.ts", "performance panel"),
  existsCheck("packages/engine/src/testing/screenshot.ts", "screenshot helper"),
  existsCheck("packages/engine/src/testing/routeHealth.ts", "route health helper"),
  fileIncludes("packages/engine/src/agent-api/index.ts", ["diagnostics", "assetPanel", "performancePanel", "warnings"], "one option diagnostics")
];

writeReport("tests/reports/agent-devtools.json", "aura3d-agent-devtools", checks);
