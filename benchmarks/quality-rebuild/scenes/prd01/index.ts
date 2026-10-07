/**
 * Lane prd01 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 * Specs are engine-agnostic (see `./types`); adapters under
 * `aura3d/scenes/prd01` and `three/scenes/prd01` consume them.
 */

import type { BenchSceneRegistration } from "../../shared/registry";
import { PRD01_SCENE_SPECS } from "./scenes";

export const scenes: readonly BenchSceneRegistration[] = Object.entries(PRD01_SCENE_SPECS).map(([id, spec]) => ({
  id,
  spec
}));

export { PRD01_SCENE_SPECS };
export type { Prd01LaneSceneSpec } from "./types";
