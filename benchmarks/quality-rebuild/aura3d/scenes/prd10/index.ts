/**
 * Lane prd10 adapter index (aura3d, CONTRACTS.md §3.8). Re-exports the lane's
 * scene registrations; per-scene default-export modules live next to this file
 * (`<slug>.ts`) for the C-30 capture runner to glob.
 */
import type { BenchSceneRegistration } from "../../../shared/registry";
import { scenes as specs } from "../../../scenes/prd10/index";

export const scenes: readonly BenchSceneRegistration[] = specs;
