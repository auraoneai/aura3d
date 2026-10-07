/**
 * Lane prd03 Aura3D adapter index (CONTRACTS.md §3.8, C-30). The page router
 * loads `./aura3d/scenes/prd03/<scene-id>.ts` once prd12 extends the router
 * glob; each adapter translates the shared spec via `runAuraScene`.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export const scenes: readonly BenchSceneRegistration[] = (
  Object.keys(PRD03_SCENE_SPECS) as (keyof typeof PRD03_SCENE_SPECS)[]
).map((id) => ({ id, spec: PRD03_SCENE_SPECS[id] }));
