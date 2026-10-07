// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneSnapshot, AuraDiagnostics, AuraApp } from "../nodes/types.js";
import { scene } from "../nodes/scene.js";

export function createAuraRouteHealthSnapshot(app: AuraApp): {
  readonly status: "ready" | "error";
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
} {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    diagnostics,
    scene: app.scene
  };
}
