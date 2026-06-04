import type { AuraApp, AuraDiagnostics, AuraSceneSnapshot } from "../agent-api/index.js";

export interface AuraRouteHealth {
  readonly status: "ready" | "error";
  readonly drawCalls: number;
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
}

export function createAuraRouteHealth(app: AuraApp): AuraRouteHealth {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    drawCalls: diagnostics.drawCalls,
    diagnostics,
    scene: app.scene
  };
}

export function assertAuraRouteReady(health: AuraRouteHealth): void {
  if (health.status !== "ready") throw new Error(`Aura3D route is not ready: ${health.diagnostics.errors.join("; ")}`);
  if (health.drawCalls <= 0) throw new Error("Aura3D route did not draw any frames.");
}
