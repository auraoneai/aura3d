import type { AuraDiagnostics } from "../agent-api/index.js";

export interface AuraPerformancePanelSnapshot {
  readonly fps: number;
  readonly drawCalls: number;
  readonly renderSize: readonly [number, number];
  readonly backend: string;
  readonly warnings: readonly string[];
}

export function createAuraPerformancePanelSnapshot(diagnostics: AuraDiagnostics): AuraPerformancePanelSnapshot {
  return {
    fps: diagnostics.fps,
    drawCalls: diagnostics.drawCalls,
    renderSize: diagnostics.renderSize,
    backend: diagnostics.backend,
    warnings: diagnostics.warnings
  };
}
