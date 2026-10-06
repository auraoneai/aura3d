// PR 0b-2 seam (CONTRACTS.md §3.3) — transmission capture, owned by PRD 04.
// The capture runs via the C-01 `transmission` frame phase: PRD 04's lane barrel
// registers the contributor below; with its flag off it contributes nothing.

import type { FrameContributor } from "../contracts/frameGraph.js";

export const TRANSMISSION_PHASE = "transmission" as const;

/** Stub contributor: declares the phase so PRD 01's dispatcher has the hook. */
export const transmissionFrameContributor: FrameContributor = {
  id: "prd04.transmission",
  owner: "prd04",
  flag: "A3D_QR_MATERIALS",
  phases: [TRANSMISSION_PHASE]
};
