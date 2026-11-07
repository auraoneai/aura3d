// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneSnapshot } from "../nodes/types.js";
import type { MutableDiagnostics } from "../diagnostics.js";
import { renderer } from "../rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { snapshotDiagnostics } from "../diagnostics.js";

/*
 * Apps that published the legacy page-global route state (body dataset + window.__AURA3D_ROUTE_READY__).
 * Embedded instances opt out with `routeState: false`; the rest are tracked so the page globals are
 * cleared when the last publisher is disposed instead of outliving every app.
 */
const routePublishers = new Set<MutableDiagnostics>();

/** Marks `owner` as a publisher of page-global route state. Called once per app that has not opted out. */
export function enrollRouteState(owner: MutableDiagnostics): void {
  routePublishers.add(owner);
}

/** Stops `owner` publishing and clears the page globals when it was the last publisher. */
export function releaseRouteState(owner: MutableDiagnostics): void {
  if (!routePublishers.delete(owner) || routePublishers.size > 0) return;
  if (typeof document !== "undefined" && document.body) {
    const dataset = document.body.dataset;
    delete dataset.aura3dReady;
    delete dataset.aura3dDrawCalls;
    delete dataset.aura3dRuntimeBackend;
    delete dataset.aura3dRendererMode;
  }
  if (typeof window !== "undefined") delete (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__;
}

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
  if (!routePublishers.has(diagnostics)) return;
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
  // An app that opted out (`routeState: false`) or was already disposed never writes the page globals.
  if (!routePublishers.has(diagnostics)) return;
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
