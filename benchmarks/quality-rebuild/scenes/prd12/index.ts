/**
 * Lane prd12 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 *
 * `prd12-skinned-character-walk` (PRD-12 §9.2): companion to base scene 08 —
 * the soldier GLB playing the Walk clip at t = 1.25 s, so the
 * DepthPass-ignores-skinning defect (research 19 C4) is visible in the shadow.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import type { SceneSpec } from "../../shared/types";

const skinnedCharacterWalk: SceneSpec = {
  id: "prd12-skinned-character-walk",
  index: 121,
  title: "Skinned character walk",
  purpose: "Soldier Walk clip sampled at t=1.25s; skinned shadow must follow the animated pose",
  resolution: { width: 1280, height: 720, devicePixelRatio: 1 },
  toneMapping: "aces-filmic",
  exposure: 1,
  time: 1.25,
  settleFrames: 4,
  camera: { position: [0.6, 1.0, 2.6], target: [0, 0.8, 0], fov: 40, near: 0.05, far: 50 },
  background: { kind: "color", color: "#202329" },
  environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
  lights: [
    { kind: "directional", name: "sun", color: "#fff2e0", intensity: 2.5, position: [2, 4, 3], target: [0, 0, 0], castShadow: true }
  ],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [6, 1, 6],
      position: [0, 0, 0],
      material: { color: "#6d7076", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "model",
      name: "soldier walking",
      asset: "soldier",
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true,
      animation: { clip: "Walk", time: 1.25 }
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 2.5, bias: -0.0005, normalBias: 0.02 },
  owner: "prd12",
  referenceProfile: "contract",
  masks: ["object-id", "shadow-receiver", "metal", "silhouette-edge"],
  brokenControls: ["no-aa", "no-tonemap", "dpr-half", "albedo-only", "no-shadows", "no-ibl"],
  primaryCriterion: "Skinned shadow follows the Walk pose, not the bind pose",
  primaryRegion: "shadow-receiver"
};

import { REF_SCENES } from "./ref-scenes";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: skinnedCharacterWalk.id, spec: skinnedCharacterWalk },
  // §9.3 showcase references. Routable so calibration can run; they hold no
  // calibrated thresholds yet, so the gate reports them "non-discriminating"
  // until their panel admission (§9.4).
  ...REF_SCENES.map((spec) => ({ id: spec.id, spec }))
];
