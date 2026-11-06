/**
 * Backend selection and readiness reporting for the showcase games (work package W-6).
 *
 * 5.0 reports which renderer backend was requested and which one is active (`diagnostics().backendSelection`) and
 * exposes `app.readiness()`. The 5.0.0 incident (no game drew a frame) was invisible to every non-browser check, so every
 * game page should publish this report on a QA hook. The helpers are structural (no engine import) and tolerate
 * pre-5.0 apps and ports that expose no app handle.
 */

export interface BackendSelectionReport {
  readonly requested: string;
  readonly active: string;
  readonly fallbackReason?: string;
  readonly missingFeatures: readonly string[];
  readonly deviceLost: boolean;
}

export type ReadinessReport =
  | { readonly state: "ready"; readonly stage?: string; readonly backend?: string }
  | { readonly state: "failed"; readonly code: string; readonly message: string }
  | { readonly state: "cancelled" | "disposed" | "superseded" }
  | { readonly state: "unsupported" };

export interface AppReportingLike {
  diagnostics?(): unknown;
  readiness?(options?: { stage?: "renderer" | "first-frame"; signal?: AbortSignal }): Promise<unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Reads `backendSelection` from an `AuraDiagnostics`-shaped value (also accepts the nested `renderer.backendSelection`). */
export function readBackendSelection(diagnostics: unknown): BackendSelectionReport | undefined {
  if (!isRecord(diagnostics)) return undefined;
  const renderer = isRecord(diagnostics.renderer) ? diagnostics.renderer : undefined;
  const raw = diagnostics.backendSelection ?? renderer?.backendSelection;
  if (!isRecord(raw)) return undefined;
  const active = typeof raw.active === "string" ? raw.active : typeof diagnostics.backend === "string" ? diagnostics.backend : undefined;
  if (!active) return undefined;
  return {
    requested: typeof raw.requested === "string" ? raw.requested : active,
    active,
    ...(typeof raw.fallbackReason === "string" ? { fallbackReason: raw.fallbackReason } : {}),
    missingFeatures: Array.isArray(raw.missingFeatures) ? raw.missingFeatures.filter((f): f is string => typeof f === "string") : [],
    deviceLost: raw.deviceLost === true
  };
}

/** One line for the `?diag=1` panel, e.g. `backend auto->webgl2 (no-webgpu-adapter)`. */
export function formatBackendSelection(selection: BackendSelectionReport): string {
  const arrow = selection.requested === selection.active ? selection.active : `${selection.requested}->${selection.active}`;
  const notes = [selection.fallbackReason, selection.deviceLost ? "device-lost" : undefined, selection.missingFeatures.length ? `missing ${selection.missingFeatures.join("+")}` : undefined].filter(Boolean);
  return `backend ${arrow}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

/** Normalises `app.readiness()`; `{ state: "unsupported" }` for apps that predate it. Never throws. */
export async function readReadiness(app: AppReportingLike, stage: "renderer" | "first-frame" = "first-frame"): Promise<ReadinessReport> {
  if (typeof app.readiness !== "function") return { state: "unsupported" };
  try {
    const outcome = await app.readiness({ stage });
    if (!isRecord(outcome) || typeof outcome.state !== "string") return { state: "unsupported" };
    switch (outcome.state) {
      case "ready":
        return { state: "ready", ...(typeof outcome.stage === "string" ? { stage: outcome.stage } : {}), ...(typeof outcome.backend === "string" ? { backend: outcome.backend } : {}) };
      case "failed":
        return { state: "failed", code: String(outcome.code ?? "unknown"), message: String(outcome.message ?? "") };
      case "cancelled":
      case "disposed":
      case "superseded":
        return { state: outcome.state };
      default:
        return { state: "unsupported" };
    }
  } catch (error) {
    return { state: "failed", code: "READINESS_THREW", message: error instanceof Error ? error.message : String(error) };
  }
}

export interface PublishedBackendReport {
  readonly backendSelection?: BackendSelectionReport;
  readonly readiness: ReadinessReport;
}

/** Collects both reports and, when `target` is given (e.g. `window.__AURA_GAME__`), publishes them there. */
export async function publishBackendReport(app: AppReportingLike, target?: Record<string, unknown>, stage: "renderer" | "first-frame" = "first-frame"): Promise<PublishedBackendReport> {
  const readiness = await readReadiness(app, stage);
  let backendSelection: BackendSelectionReport | undefined;
  try {
    backendSelection = readBackendSelection(app.diagnostics?.());
  } catch {
    backendSelection = undefined;
  }
  const report: PublishedBackendReport = { ...(backendSelection ? { backendSelection } : {}), readiness };
  if (target) target.backendReport = report;
  return report;
}
