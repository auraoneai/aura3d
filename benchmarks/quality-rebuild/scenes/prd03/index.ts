/**
 * Lane prd03 scene index (CONTRACTS.md §3.8, C-30). Scene ids are `<owner>-<slug>`.
 * Specs live in `./specs.ts`; the engine adapters live under
 * `aura3d/scenes/prd03/` and `three/scenes/prd03/` and resolve through the
 * page router once `main.ts`/`shared/scenes.ts` route lane ids (qr-request to
 * prd12 — see evidence/prd03/phase0/qr-requests.md).
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { PRD03_SCENE_SPECS } from "./specs";

export const scenes: readonly BenchSceneRegistration[] = (
  Object.entries(PRD03_SCENE_SPECS) as [keyof typeof PRD03_SCENE_SPECS, unknown][]
).map(([id, spec]) => ({ id, spec }));
