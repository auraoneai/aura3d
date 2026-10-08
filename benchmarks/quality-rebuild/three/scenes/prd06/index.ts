/**
 * Lane prd06 three.js-side index (CONTRACTS.md §3.8). The adapter module
 * `skinnedCharacterPosed.ts` renders the shared lane spec through runThreeScene;
 * lane 12 wires `three/scenes/prdNN/` modules into the capture router.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "../../../scenes/prd06/crossfade-filmstrip";
import { prd06MorphFace } from "../../../scenes/prd06/morph-face";
import { prd06IkSlope } from "../../../scenes/prd06/ik-slope";
import { prd06CharacterHero } from "../../../scenes/prd06/character-hero";
import { prd06PerfTierLow, prd06PerfTierMedium, prd06PerfTierHigh, prd06PerfTierUltra } from "../../../scenes/prd06/perf-tier";

export { default as prd06SkinnedCharacterPosed } from "./skinned-character-posed";
export { default as prd06CrossfadeFilmstrip } from "./crossfade-filmstrip";
export { default as prd06MorphFace } from "./morph-face";
export { default as prd06IkSlope } from "./ik-slope";
export { default as prd06CharacterHero } from "./character-hero";
export { default as prd06PerfTierLow } from "./perf-tier-low";
export { default as prd06PerfTierMedium } from "./perf-tier-medium";
export { default as prd06PerfTierHigh } from "./perf-tier-high";
export { default as prd06PerfTierUltra } from "./perf-tier-ultra";

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
