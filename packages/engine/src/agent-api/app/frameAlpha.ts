// PR 0b-1 seam (CONTRACTS.md §3.2) — C-23 runtime alpha computation, verbatim from createAuraApp.
export function computeRuntimeAlpha(dt: number, runtimeFixedDt: number): number {
  return runtimeFixedDt > 0 ? Math.max(0, Math.min(1, (dt % runtimeFixedDt) / runtimeFixedDt)) : 0;
}
