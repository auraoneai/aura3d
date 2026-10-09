/**
 * evidence.ts — lazy route evidence sections (PRD-09 §6.5). Loaded through the
 * evidence channel's `sections()` loader only when evidence is requested;
 * production play never imports this.
 */
export type EvidenceCollect = () => Record<string, unknown>;

let collect: EvidenceCollect | undefined;

export function bindPulseEvidence(fn: EvidenceCollect): void {
  collect = fn;
}

export const sections = {
  pulse: (): Record<string, unknown> =>
    (collect ?? (() => ({ status: "unbound" })))()
};
