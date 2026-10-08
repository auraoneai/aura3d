/**
 * PRD-06 — C-36 diagnostic-only fields + option coverage, merge record.
 *
 * C-19 `animation.*` spec fields the PR 0a seed missed (the PoseMixer-era
 * members the legacy chain never consumed). The engine lane barrel
 * (`lanes/prd06.ts`) merges this record into `DIAGNOSTIC_ONLY_FIELDS`;
 * entries clear as their wiring lands — the five `animation.diagnostics.*`
 * timing fields instrumented in Phase 1+ (mixerMs/constraintsMs/springsMs/
 * paletteBytes/cpuMs via `GLTFSceneAnimationApplyResult.phaseTimings`) are
 * already out.
 */

import type { OptionCoverageRow } from "../../contracts/compiler.js";

export const PRD06_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {};

/**
 * C-36 option-coverage probes for the `animation.*` spec fields the lane
 * consumes on the actor-dispatch path (`applyProductionActorAnimation` /
 * `resolveProductionActorAnimationSeconds`).
 */
export const PRD06_OPTION_COVERAGE: readonly OptionCoverageRow[] = [
  { builder: "animation", field: "clip", probeValueA: "Idle", probeValueB: "Walk", ownerPrd: 6 },
  { builder: "animation", field: "loop", probeValueA: true, probeValueB: false, ownerPrd: 6 },
  { builder: "animation", field: "captureTime", probeValueA: 0, probeValueB: 0.5, ownerPrd: 6 },
  { builder: "animation", field: "duration", probeValueA: 0.5, probeValueB: 2, ownerPrd: 6 },
  { builder: "animation", field: "startTime", probeValueA: 0, probeValueB: 1, ownerPrd: 6 },
  { builder: "animation", field: "speed", probeValueA: 0.5, probeValueB: 2, ownerPrd: 6 }
];
