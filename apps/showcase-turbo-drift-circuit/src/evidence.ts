/** Lazy route evidence sections (PRD-09 §6.5). */
export type EvidenceCollect = () => Record<string, unknown>;
let collect: EvidenceCollect | undefined;
export function bindTurboEvidence(fn: EvidenceCollect): void { collect = fn; }
export const sections = {
  turbo: (): Record<string, unknown> =>
    (collect ?? (() => ({ status: "unbound" })))()
};
