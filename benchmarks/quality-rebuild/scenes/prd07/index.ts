/**
 * Lane prd07 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`;
 * registered here so the C-30 aggregation (`shared/registry.ts` ALL_SCENES)
 * carries the lane entries and the conformance suite can check ids, owner
 * prefix and both adapters.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { flipbook, impactLibrary, particlesFountain, particlesStress, trailsBeams } from "./specs";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: particlesFountain.id, spec: particlesFountain },
  { id: flipbook.id, spec: flipbook },
  { id: particlesStress.id, spec: particlesStress },
  { id: impactLibrary.id, spec: impactLibrary },
  { id: trailsBeams.id, spec: trailsBeams }
];

export { getPrd07SceneSpec, prd07Specs } from "./specs";
export type { Prd07SceneSpec, Prd07SceneId } from "./specs";
