/**
 * Lane prd15 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 *
 * T4.7's two `prd15-lean-*` fixture scenes were removed in T8.1 with
 * `@aura3d/lean` itself (the deprecated §7.5 shim they existed to capture).
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { instancingSizeSpec } from "./instancing-size";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: instancingSizeSpec.id, spec: instancingSizeSpec }
];
