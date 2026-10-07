/**
 * Lane prd06 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { prd06SkinnedCharacterPosed } from "./skinnedCharacterPosed";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd06-skinned-character-posed", spec: prd06SkinnedCharacterPosed }
];
