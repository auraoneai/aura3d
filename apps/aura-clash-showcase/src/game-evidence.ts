/** Lazy route evidence sections (PRD-09 §6.5). */
export const mountedEvidence: Record<string, unknown> = {};
export const sections = {
  auraClash: (): unknown => mountedEvidence.auraClash ?? { status: "unbound" }
};
