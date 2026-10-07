/**
 * Lane prd06 Aura3D-side index (CONTRACTS.md §3.8). The adapter module
 * `skinnedCharacterPosed.ts` renders the shared lane spec through runAuraScene;
 * lane 12 wires `aura3d/scenes/prdNN/` modules into the capture router.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "../../../scenes/prd06/crossfade-filmstrip";
import { prd06MorphFace } from "../../../scenes/prd06/morph-face";
import { prd06IkSlope } from "../../../scenes/prd06/ik-slope";

export { default as prd06SkinnedCharacterPosed } from "./skinned-character-posed";
export { default as prd06CrossfadeFilmstrip } from "./crossfade-filmstrip";
export { default as prd06MorphFace } from "./morph-face";
export { default as prd06IkSlope } from "./ik-slope";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed },
  { id: "prd06-crossfade-filmstrip", spec: prd06CrossfadeFilmstrip },
  { id: "prd06-morph-face", spec: prd06MorphFace },
  { id: "prd06-ik-slope", spec: prd06IkSlope, admittedAsReference: false }
];
