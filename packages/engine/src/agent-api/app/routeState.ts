// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneSnapshot } from "../nodes/types.js";
import type { MutableDiagnostics } from "../diagnostics.js";
import { renderer } from "../rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { snapshotDiagnostics } from "../diagnostics.js";

export function markRouteReady(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("ready", snapshot, diagnostics);
}

export function markRouteError(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("error", snapshot, diagnostics);
}

function markRouteState(status: "ready" | "error", snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  if (typeof document !== "undefined") {
    document.body.dataset.aura3dReady = status === "ready" ? "true" : "error";
    document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
    document.body.dataset.aura3dRuntimeBackend = diagnostics.renderer.runtime.backend;
    document.body.dataset.aura3dRendererMode = diagnostics.renderer.rendererMode;
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = {
      status,
      scene: snapshot,
      diagnostics: snapshotDiagnostics(diagnostics)
    };
  }
}
