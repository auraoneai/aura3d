/* §6.9 skip registry — shared by `renderer/PostprocessExecution` (CPU-pass
 * record-and-skip), `webgl2/LegacyPost` (v2-route degradations) and
 * `post/v2Stages` (HDR-stage degradations). Dependency-free, so the v2
 * drivers can record without importing the renderer barrel (import-cycle
 * safe); kept out of `post/` so PostprocessExecution has no static `post/`
 * import (§9 bundle gate, prd03-post-bundle-split). `postSections` folds these into `diagnostics().post.skipped`. */
const postSkippedReasonsSet = new Set<string>();

export function recordPostSkipped(reason: string): void {
  postSkippedReasonsSet.add(reason);
}

/**
 * Withdraws a transient reason once its condition has resolved (GU47: a
 * `LUT_PENDING:<url>` recorded while a `.cube` loads must not outlive the
 * load; the registry is otherwise cumulative for the page).
 */
export function clearPostSkipped(reason: string): void {
  postSkippedReasonsSet.delete(reason);
}

export function postSkippedReasons(): readonly string[] {
  return [...postSkippedReasonsSet];
}

/**
 * C-31 stage trace: the v2 HDR stages that executed on the most recent frame
 * (e.g. `S5:taa-history`, `S5:taa-seed`). Replaced per frame by
 * `beginPostStageTrace`; read through `diagnostics().post.stagesRan`.
 */
let postStagesRanList: string[] = [];

export function beginPostStageTrace(): void {
  postStagesRanList = [];
}

export function recordPostStage(stage: string): void {
  postStagesRanList.push(stage);
}

export function postStagesRan(): readonly string[] {
  return [...postStagesRanList];
}

/**
 * PRD-03 §8.6: set by S5 when it resolved into the TAA history target this
 * frame; the Renderer consumes it before promoting the history ping-pong.
 */
let taaHistoryWritten = false;

export function markTaaHistoryWritten(): void {
  taaHistoryWritten = true;
}

export function consumeTaaHistoryWritten(): boolean {
  const written = taaHistoryWritten;
  taaHistoryWritten = false;
  return written;
}

/** Test hook — clears the §6.9 skip registry. */
export function resetPostSkipped(): void {
  postSkippedReasonsSet.clear();
}

/** `import.meta.env.PROD` / `process.env.NODE_ENV === "production"`. */
export function postProductionBuild(): boolean {
  const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
  if (meta.env?.PROD) return true;
  return (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } })
    .process?.env?.NODE_ENV === "production";
}
