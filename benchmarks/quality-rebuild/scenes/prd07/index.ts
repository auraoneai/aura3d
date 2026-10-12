/**
 * Lane prd07 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`;
 * registered here so the C-30 aggregation (`shared/registry.ts` ALL_SCENES)
 * carries the lane entries and the conformance suite can check ids, owner
 * prefix and both adapters.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import {
  decalsScene,
  flipbook,
  fogHeight,
  fogTransition,
  impactLibrary,
  litSmoke,
  outdoorSky,
  particlesFountain,
  particlesStress,
  rainNight,
  skyTimeOfDay,
  skyH06,
  skyH09,
  skyH12,
  skyH18,
  skyH21,
  snowScene,
  softParticles,
  trailsBeams,
  underwater,
  volumetricShafts,
  waterInterleave
} from "./specs";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: particlesFountain.id, spec: particlesFountain },
  { id: flipbook.id, spec: flipbook },
  { id: particlesStress.id, spec: particlesStress },
  { id: impactLibrary.id, spec: impactLibrary },
  { id: trailsBeams.id, spec: trailsBeams },
  { id: skyTimeOfDay.id, spec: skyTimeOfDay },
  // 07 Phase D S4 — the five §17 hours, one scene id each.
  { id: skyH06.id, spec: skyH06 },
  { id: skyH09.id, spec: skyH09 },
  { id: skyH12.id, spec: skyH12 },
  { id: skyH18.id, spec: skyH18 },
  // Not in the `suite=promote promote_flag=vfx` scene list (nor is
  // prd07-sky-timeofday): their three.js reference frame is pure black at
  // night (status "blank"), so metrics.promote scores them NO-REFERENCE and
  // cannot measure the flag. They stay registered for flags-bisect / judges.
  { id: skyH21.id, spec: skyH21 },
  { id: outdoorSky.id, spec: outdoorSky },
  { id: fogHeight.id, spec: fogHeight },
  { id: fogTransition.id, spec: fogTransition },
  { id: underwater.id, spec: underwater },
  // P5-T8 scenes — authored at 61c7960 but never appended here; registered
  // now so ALL_SCENES (and the capture matrix) actually covers them.
  { id: rainNight.id, spec: rainNight },
  { id: snowScene.id, spec: snowScene },
  { id: volumetricShafts.id, spec: volumetricShafts },
  { id: litSmoke.id, spec: litSmoke },
  { id: softParticles.id, spec: softParticles },
  { id: waterInterleave.id, spec: waterInterleave },
  // P6-T7 §6.9 merged decals + surface trail.
  { id: decalsScene.id, spec: decalsScene }
];

export { getPrd07SceneSpec, prd07Specs } from "./specs";
export type { Prd07SceneSpec, Prd07SceneId } from "./specs";
