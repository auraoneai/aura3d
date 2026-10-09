/** Lazy route evidence sections (PRD-09 §6.5). */
export type EvidenceCollect = () => Record<string, unknown>;
let collect: EvidenceCollect | undefined;
export function bindGalleryEvidence(fn: EvidenceCollect): void { collect = fn; }
export const sections = {
  gallery: (): Record<string, unknown> =>
    (collect ?? (() => ({ status: "unbound" })))()
};
