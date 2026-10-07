/**
 * Lane prd06 three.js-side index (CONTRACTS.md §3.8). The adapter module
 * `skinnedCharacterPosed.ts` renders the shared lane spec through runThreeScene;
 * lane 12 wires `three/scenes/prdNN/` modules into the capture router.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "../../../scenes/prd06/crossfade-filmstrip";

export { default as prd06SkinnedCharacterPosed } from "./skinned-character-posed";
export { default as prd06CrossfadeFilmstrip } from "./crossfade-filmstrip";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed },
  { id: "prd06-crossfade-filmstrip", spec: prd06CrossfadeFilmstrip }
];
