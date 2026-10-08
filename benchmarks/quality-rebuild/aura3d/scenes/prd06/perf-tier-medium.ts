/**
 * Lane adapter `prd06-perf-tier-medium` (PRD-06 §13, S12), aura3d side: the
 * shared spec through runAuraScene — looping `animate()` per actor, foot-IK
 * constraints + spring chains on heroes via the actor extension
 * (`animation.footIk`/`springChains` wired in common.ts).
 * `?a3d-qr=animation` enables the flag-gated actor extension.
 */
import { prd06PerfTierMedium } from "../../../scenes/prd06/perf-tier";
import { runAuraScene } from "../../common";

export default (host: HTMLElement) => runAuraScene(prd06PerfTierMedium, host);
