/**
 * Lane prd06 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { prd06SkinnedCharacterPosed } from "./skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "./crossfade-filmstrip";
import { prd06MorphFace } from "./morph-face";
import { prd06IkSlope } from "./ik-slope";
import { prd06CharacterHero } from "./character-hero";
import { prd06PerfTierLow, prd06PerfTierMedium, prd06PerfTierHigh, prd06PerfTierUltra } from "./perf-tier";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed },
  { id: "prd06-crossfade-filmstrip", spec: prd06CrossfadeFilmstrip },
  { id: "prd06-morph-face", spec: prd06MorphFace },
  { id: "prd06-ik-slope", spec: prd06IkSlope, admittedAsReference: false },
  { id: "prd06-character-hero", spec: prd06CharacterHero, admittedAsReference: false },
  { id: "prd06-perf-tier-low", spec: prd06PerfTierLow, admittedAsReference: false },
  { id: "prd06-perf-tier-medium", spec: prd06PerfTierMedium, admittedAsReference: false },
  { id: "prd06-perf-tier-high", spec: prd06PerfTierHigh, admittedAsReference: false },
  { id: "prd06-perf-tier-ultra", spec: prd06PerfTierUltra, admittedAsReference: false }
];
