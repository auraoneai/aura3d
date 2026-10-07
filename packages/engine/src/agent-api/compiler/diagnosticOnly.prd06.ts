/**
 * PRD-06 — C-36 diagnostic-only fields + option coverage, merge record.
 *
 * C-19 `animation.*` spec fields the PR 0a seed missed (the PoseMixer-era
 * members the legacy chain never consumed), plus the C-31 diagnostics fields
 * T0.18 reports as 0 until the instrumented timings land in Phase 1+. The
 * engine lane barrel (`lanes/prd06.ts`) merges this record into
 * `DIAGNOSTIC_ONLY_FIELDS`; entries clear as their wiring lands.
 */

import type { OptionCoverageRow } from "../../contracts/compiler.js";

export const PRD06_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "animation.crossFade": { reason: "C-19: fade lives on the controller binding, not the node spec", ownerPrd: 6 },
  "animation.transition": { reason: "C-19: crossfade/inertialize transitions are PoseMixer-era", ownerPrd: 6 },
  "animation.warp": { reason: "C-19: clip time-warp is PoseMixer-era", ownerPrd: 6 },
  "animation.syncGroup": { reason: "C-19: sync groups are PoseMixer-era", ownerPrd: 6 },
  "animation.diagnostics.mixerMs": { reason: "C-19/C-31: mixer timing not instrumented until Phase 1", ownerPrd: 6 },
  "animation.diagnostics.constraintsMs": { reason: "C-19/C-31: IK/constraint timing not instrumented until T3.x", ownerPrd: 6 },
  "animation.diagnostics.springsMs": { reason: "C-19/C-31: spring-bone timing not instrumented until T4.x", ownerPrd: 6 },
  "animation.diagnostics.paletteBytes": { reason: "C-19/C-31: palette byte accounting follows CCR-06-4", ownerPrd: 6 },
  "animation.diagnostics.cpuMs": { reason: "C-19/C-31: per-actor cpu timing not instrumented until Phase 1", ownerPrd: 6 }
};

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
