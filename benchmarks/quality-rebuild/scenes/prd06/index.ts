/**
 * Lane prd06 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { prd06SkinnedCharacterPosed } from "./skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "./crossfade-filmstrip";
import { prd06MorphFace } from "./morph-face";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed },
  { id: "prd06-crossfade-filmstrip", spec: prd06CrossfadeFilmstrip },
  { id: "prd06-morph-face", spec: prd06MorphFace }
];
