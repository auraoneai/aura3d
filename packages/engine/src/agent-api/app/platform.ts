// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { performance } from "../devtools/performanceEvidence.js";

export function devicePixelRatioSafe(): number {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

export function performanceNow(): number {
  return typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
}
