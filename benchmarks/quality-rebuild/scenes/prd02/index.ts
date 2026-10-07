/**
 * Lane prd02 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 * Specs live in ./specs.ts; masks in ./masks.ts; the lane page and capture
 * runner in lane-main.ts / capture-lane.mjs.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { prd02SceneIds, prd02Specs } from "./specs";

export const scenes: readonly BenchSceneRegistration[] = prd02SceneIds.map((id) => ({
  id,
  spec: prd02Specs[id]
}));
