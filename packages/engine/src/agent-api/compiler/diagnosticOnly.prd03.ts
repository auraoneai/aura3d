/**
 * PRD-03 — C-36 diagnostic-only option fields, merge record.
 *
 * Fields the agent-api records on `effect` nodes but the postprocess bridge
 * (`compiler/postprocess.ts`) does not yet submit to the renderer. Each entry
 * clears as its lane wiring lands (C-36: "lanes clear their entries as wired").
 * The engine lane barrel merges this record into `DIAGNOSTIC_ONLY_FIELDS`.
 */

import type { OptionCoverageRow } from "../../contracts/compiler.js";

export const PRD03_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "effect.colorGrade.exposure": { reason: "C-13: pinned to 1 on the legacy chain; Phase 1 wires authored exposure (A3D_QR_POST)", ownerPrd: 3 },
  "effect.colorGrade.shadows": { reason: "C-13: recorded, no legacy consumer; Phase 5/6 grade v2", ownerPrd: 3 },
  "effect.colorGrade.highlights": { reason: "C-13: recorded, no legacy consumer; Phase 5/6 grade v2", ownerPrd: 3 },
  "effect.colorGrade.lut": { reason: "C-13: LUT authoring recorded, no legacy consumer; Phase 5 v2 LUT stage", ownerPrd: 3 },
  "effect.antiAlias.intensity": { reason: "C-13: mode selects the pass; intensity has no FXAA consumer", ownerPrd: 3 }
};

/**
 * C-36 option-coverage probes for the post builders lane 03 owns
 * (`nodes/effects.post.ts`): each row is an authored field whose value must
 * survive the compile to the submitted postprocess options.
 */
export const PRD03_OPTION_COVERAGE: readonly OptionCoverageRow[] = [
  { builder: "effects.bloom", field: "intensity", probeValueA: 0.5, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.bloom", field: "threshold", probeValueA: 0.2, probeValueB: 0.8, ownerPrd: 3 },
  { builder: "effects.bloom", field: "radius", probeValueA: 0.2, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.bloom", field: "softKnee", probeValueA: 0.1, probeValueB: 0.7, ownerPrd: 3 },
  { builder: "effects.bloom", field: "shoulder", probeValueA: 0.1, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.bloom", field: "quality", probeValueA: "low", probeValueB: "high", ownerPrd: 3 },
  { builder: "effects.neonBloom", field: "intensity", probeValueA: 0.4, probeValueB: 0.8, ownerPrd: 3 },
  { builder: "effects.neonBloom", field: "threshold", probeValueA: 0.1, probeValueB: 0.6, ownerPrd: 3 },
  { builder: "effects.ambientOcclusion", field: "intensity", probeValueA: 0.3, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.ambientOcclusion", field: "radius", probeValueA: 0.5, probeValueB: 1.5, ownerPrd: 3 },
  { builder: "effects.ambientOcclusion", field: "density", probeValueA: 0.2, probeValueB: 0.8, ownerPrd: 3 },
  { builder: "effects.contactOcclusion", field: "intensity", probeValueA: 0.3, probeValueB: 0.8, ownerPrd: 3 },
  { builder: "effects.contactOcclusion", field: "radius", probeValueA: 0.3, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.contactOcclusion", field: "density", probeValueA: 0.4, probeValueB: 0.9, ownerPrd: 3 },
  { builder: "effects.colorGrade", field: "contrast", probeValueA: 0.9, probeValueB: 1.2, ownerPrd: 3 },
  { builder: "effects.colorGrade", field: "saturation", probeValueA: 0.5, probeValueB: 1.4, ownerPrd: 3 },
  { builder: "effects.antiAlias", field: "mode", probeValueA: "fxaa", probeValueB: "msaa", ownerPrd: 3 },
  { builder: "effects.antiAlias", field: "intensity", probeValueA: 0.4, probeValueB: 1, ownerPrd: 3 }
];
