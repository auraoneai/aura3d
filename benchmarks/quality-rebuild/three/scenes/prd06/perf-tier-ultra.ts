/**
 * Lane adapter `prd06-perf-tier-ultra` (PRD-06 §13, S12), three r185 side: the
 * shared spec through runThreeScene — looping AnimationMixer per actor
 * (`loop:true` wires `loopMixers` stepped per frame in common.ts), CCDIKSolver
 * foot-IK on heroes, SkeletonUtils clone per skinned instance.
 * Reference/parity review side; the aura side owns the budget evaluation.
 */
import { prd06PerfTierUltra } from "../../../scenes/prd06/perf-tier";
import { runThreeScene } from "../../common";

export default (host: HTMLElement) => runThreeScene(prd06PerfTierUltra, host);
