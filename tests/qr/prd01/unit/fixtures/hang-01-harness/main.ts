/**
 * 01-HANG fixture: the Aura3D half of the lane-01 harness entry
 * (tests/qr/prd01/harness/main.ts) without the comparison engine. It keeps the
 * structure that code-split the rendering lanes: the aura prd01 scenes are
 * static imports of the entry, and the engine-only tools are dynamic imports,
 * so shared rendering modules are candidates for lazy chunks.
 */

import { scenes as auraScenes } from "../../../../../../benchmarks/quality-rebuild/aura3d/scenes/prd01/index";

const tools: Record<string, () => Promise<unknown>> = {
  "render-targets": () => import("../../../harness/renderTargets"),
  "program-compile": () => import("../../../harness/programCompile"),
  "parallel-compile": () => import("../../../harness/parallelCompile"),
  perf: () => import("../../../harness/perf"),
  app: () => import("../../../harness/appTools")
};

(window as unknown as { __QR_SCENES__?: unknown }).__QR_SCENES__ = auraScenes;
const tool = tools[new URLSearchParams(window.location.search).get("tools") ?? ""];
if (tool) void tool();
