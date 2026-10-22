import { existsCheck, fileIncludes, writeReport } from "../check-common";

const checks = [
  existsCheck("packages/engine/src/devtools/AuraDiagnosticsOverlay.ts", "diagnostics overlay"),
  existsCheck("packages/engine/src/devtools/AuraAssetPanel.ts", "asset panel"),
  existsCheck("packages/engine/src/devtools/AuraPerformancePanel.ts", "performance panel"),
  existsCheck("packages/engine/src/testing/screenshot.ts", "screenshot helper"),
  existsCheck("packages/engine/src/testing/routeHealth.ts", "route health helper"),
  // After the agent-api Phase 3 split index.ts is a barrel: the single
  // `diagnostics` option contract lives in nodes/types/runtime.ts
  // (AuraDiagnosticsOptions.overlay/assetPanel/performancePanel), the warnings
  // state in diagnostics.ts, and index.ts still re-exports both.
  fileIncludes("packages/engine/src/agent-api/index.ts", ["diagnostics", "AuraDiagnosticsOptions"], "one option diagnostics barrel"),
  fileIncludes("packages/engine/src/agent-api/nodes/types/runtime.ts", ["diagnostics", "assetPanel", "performancePanel"], "one option diagnostics contract"),
  fileIncludes("packages/engine/src/agent-api/diagnostics.ts", ["diagnostics", "warnings"], "diagnostics warnings state")
];

writeReport("tests/reports/agent-devtools.json", "aura3d-agent-devtools", checks);
