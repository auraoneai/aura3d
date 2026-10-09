/**
 * evidence.ts — lazy route evidence sections (PRD-09 §6.5). Loaded through
 * the evidence channel's `sections()` loader only when evidence is requested.
 */
export type EvidenceCollect = () => Record<string, unknown>;

let collect: EvidenceCollect | undefined;

export function bindGravityEvidence(fn: EvidenceCollect): void {
  collect = fn;
}

export const sections = {
  gravity: (): Record<string, unknown> =>
    (collect ?? (() => ({ status: "unbound" })))()
};
