// Dependency-free runtime reporting helpers for apps/common/src/runtime.ts.
// Kept separate so unit tests (and the repo typecheck) can use them without
// pulling in the renderer-bound production runtime.

export interface A3DProductionBackendSelection {
  readonly requested: "webgl2";
  readonly active: "webgl2";
  readonly missingFeatures: readonly string[];
  readonly deviceLost: boolean;
}

export type A3DProductionReadiness =
  | { readonly state: "pending"; readonly status: string }
  | { readonly state: "ready"; readonly stage: "first-frame"; readonly backend: "webgl2" }
  | { readonly state: "failed"; readonly code: "RENDERER_MOUNT_FAILED"; readonly message: string };

/** Minimal structural shape `withProductionReporting` reads from a runtime record. */
export interface A3DProductionReportable {
  readonly status: string;
  readonly error?: string;
  readonly lifecycle: { readonly message: string };
}

/** Adds `backendSelection` and `readiness` to a runtime record (idempotent; pure). */
export function withProductionReporting<T extends A3DProductionReportable>(runtime: T): T & { readonly backendSelection: A3DProductionBackendSelection; readonly readiness: A3DProductionReadiness } {
  const readiness: A3DProductionReadiness =
    runtime.status === "error"
      ? { state: "failed", code: "RENDERER_MOUNT_FAILED", message: runtime.error ?? runtime.lifecycle.message }
      : runtime.status === "ready" || runtime.status === "animating"
        ? { state: "ready", stage: "first-frame", backend: "webgl2" }
        : { state: "pending", status: runtime.status };
  return { ...runtime, backendSelection: { requested: "webgl2", active: "webgl2", missingFeatures: [], deviceLost: false }, readiness };
}
