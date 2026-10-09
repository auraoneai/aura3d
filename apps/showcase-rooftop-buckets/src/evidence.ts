/**
 * evidence.ts — lazy route evidence sections (PRD-09 §6.5). Loaded through the
 * evidence channel's `sections()` loader only when `?evidence=1` or
 * `__AURA3D_EVIDENCE_OPT_IN__` is set; production play never imports this.
 */
export type EvidenceCollect = () => Record<string, unknown>;

let collect: EvidenceCollect | undefined;

export function bindRooftopEvidence(fn: EvidenceCollect): void {
  collect = fn;
}

export const sections = {
  rooftopBuckets: (): Record<string, unknown> =>
    (collect ?? (() => ({ status: "unbound" })))()
};
