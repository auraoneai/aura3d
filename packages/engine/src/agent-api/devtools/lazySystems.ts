// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { collectAuraLazySystemEvidence, markAuraLazySystemLoaded, markAuraLazySystemRequested } from "../lazySystemEvidence.js";

export const lazySystems = {
  markRequested: markAuraLazySystemRequested,
  markLoaded: markAuraLazySystemLoaded,
  collect: collectAuraLazySystemEvidence
} as const;
