/* §6.9 skip registry — shared by `renderer/PostprocessExecution` (CPU-pass
 * record-and-skip), `webgl2/LegacyPost` (v2-route degradations) and
 * `post/v2Stages` (HDR-stage degradations). Lives in `post/` so the v2
 * drivers can record without importing the renderer barrel (import-cycle
 * safe). `postSections` folds these into `diagnostics().post.skipped`. */
const postSkippedReasonsSet = new Set<string>();

export function recordPostSkipped(reason: string): void {
  postSkippedReasonsSet.add(reason);
}

export function postSkippedReasons(): readonly string[] {
  return [...postSkippedReasonsSet];
}

/** `import.meta.env.PROD` / `process.env.NODE_ENV === "production"`. */
export function postProductionBuild(): boolean {
  const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
  if (meta.env?.PROD) return true;
  return (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } })
    .process?.env?.NODE_ENV === "production";
}
