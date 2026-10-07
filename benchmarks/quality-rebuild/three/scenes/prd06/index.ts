/**
 * Lane prd06 three.js-side index (CONTRACTS.md §3.8). The adapter module
 * `skinnedCharacterPosed.ts` renders the shared lane spec through runThreeScene;
 * lane 12 wires `three/scenes/prdNN/` modules into the capture router.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinnedCharacterPosed";

export { default as prd06SkinnedCharacterPosed } from "./skinnedCharacterPosed";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed }
];
