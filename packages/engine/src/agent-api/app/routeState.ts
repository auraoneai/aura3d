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

/*
 * Ready is marked at mount-settle, which can precede the first rendered frame;
 * without a live mirror `data-aura3d-draw-calls` would stay at the mount-time
 * snapshot (often 0) forever, and route-health consumers would read a stale
 * count on every route. The frame loop calls this after each render so the
 * diagnostics attributes always reflect the last real frame.
 */
export function updateRouteDiagnostics(diagnostics: MutableDiagnostics): void {
  if (typeof document !== "undefined" && document.body.dataset.aura3dReady !== undefined) {
    // Backend and mode are constants of a mount and are written by markRouteState; reading them here
    // would force the full renderer report to be rebuilt every frame.
    // Written every frame, but the value is usually the same as last frame's: a DOM attribute write (mutation record,
    // style invalidation) is only worth issuing when the number changed.
    const drawCalls = String(diagnostics.drawCalls);
    const dataset = document.body.dataset;
    if (dataset.aura3dDrawCalls !== drawCalls) dataset.aura3dDrawCalls = drawCalls;
  }
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
