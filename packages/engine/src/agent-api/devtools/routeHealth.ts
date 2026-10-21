// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneSnapshot, AuraDiagnostics, AuraApp } from "../nodes/types.js";

/**
 * threejs-parity §8 (docs/workflows/threejs-parity-gaps.md): route-health
 * snapshots carry the parity IDs a port has actually exercised (e.g.
 * `"SG-01"`, `"AD-01"`, `"SH-07"`), connecting port evidence to route health.
 * The field ships empty-able now — individual Crayon ports populate it as
 * they progress through the parity gates; `[]` is the honest default.
 */
export interface AuraRouteHealthSnapshotOptions {
  readonly parityIds?: readonly string[];
}

export function createAuraRouteHealthSnapshot(app: AuraApp, options: AuraRouteHealthSnapshotOptions = {}): {
  readonly status: "ready" | "error";
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
  readonly parityIds: readonly string[];
} {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    diagnostics,
    scene: app.scene,
    parityIds: [...(options.parityIds ?? [])]
  };
}
