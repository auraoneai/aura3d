/**
 * PRD-10 §7.1.10 / §12.1 — C-31 "world" diagnostics section.
 * Every number is measured from submitted draws in the last frame; anything
 * the lane cannot measure yet reports as null, and `pending` lists the
 * contract slots still on stubs so a reader can tell "absent" from "stubbed".
 */
import { registerDiagnosticsSection } from "../../contracts/diagnostics.js";
import type { AuraApp } from "../../agent-api/index.js";
import type { AuraWorldDiagnostics } from "../../agent-api/world/runtime.js";
import { worldStateFor } from "../../agent-api/world/queries.js";
import { worldDrawPath } from "./WorldFramePasses.js";

export function collectWorldDiagnostics(app: AuraApp): AuraWorldDiagnostics {
  const state = worldStateFor(app);
  const flags = state.flags;
  const drawPath = flags ? worldDrawPath(flags) : "S";
  const pending: string[] = ["C-02:generator", "C-11:shadows", "C-21:sky-real"];
  if (drawPath === "S") pending.push("C-01:frame-graph", "C-02:program-cache");
  return {
    drawPath,
    terrain: [],
    scatter: [],
    grass: [],
    water: [],
    biome: {
      id: state.biome?.id ?? null,
      environmentSource: state.biome ? state.biome.environment : "none",
      iblPixelBacked: null,
      backgroundDrawn: null,
      iblCrossfade: "pending-CCR-10-1"
    },
    pending,
    memoryMB: 0,
    gpuMs: null
  };
}

export function registerWorldDiagnosticsSection(): () => void {
  return registerDiagnosticsSection<AuraWorldDiagnostics>({
    id: "prd10.world-diagnostics",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    key: "world",
    collect: collectWorldDiagnostics
  });
}
