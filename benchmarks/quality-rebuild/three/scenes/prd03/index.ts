/**
 * Lane prd03 three.js adapter index (CONTRACTS.md §3.8, C-30). Reference side
 * of every lane scene: same spec through `runThreeScene` (three r185).
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export const scenes: readonly BenchSceneRegistration[] = (
  Object.keys(PRD03_SCENE_SPECS) as (keyof typeof PRD03_SCENE_SPECS)[]
).map((id) => ({ id, spec: PRD03_SCENE_SPECS[id] }));
