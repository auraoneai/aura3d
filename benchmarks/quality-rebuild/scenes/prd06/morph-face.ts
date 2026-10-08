/**
 * Lane prd06 scene `prd06-morph-face` (PRD-06 T2.9): a morph-target head held
 * at a fixed frame of named weights, rendered identically by both adapters.
 *
 * PRD-06 asks for a licensed ARKit-52 head with ≤ 32 non-zero viseme targets
 * (so High tier drops nothing). No ARKit-52 asset is admitted in-repo yet —
 * RobotExpressive's face morphs (`Angry`/`Surprised`/`Sad`, 3 targets) stand
 * in per the PRD's stand-in clause, so the spec carries
 * `admittedAsReference: false` until Q-05-2 admits a real head.
 *
 * The morph weights are applied AFTER the actor loads (no clip, no freeze —
 * a frozen clip would replace the pose including the morph region). Both
 * adapters write the same `{name: weight}` record: three through
 * `mesh.morphTargetInfluences[morphTargetDictionary[name]]`, aura through the
 * runtime handle `setMorphTargets`.
 */
import type { SceneSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";

/** Fixed-frame weights (RobotExpressive target names; 2 non-zero of 3). */
export const PRD06_MORPH_FACE_WEIGHTS = {
  Angry: 0.4,
  Surprised: 0.6,
  Sad: 0
} as const;

export interface MorphFaceSpec extends SceneSpec {
  readonly owner: "prd06";
  /** Never a reference baseline — stand-in asset pending Q-05-2 (ARKit-52 head). */
  readonly admittedAsReference: false;
  readonly morphFace: {
    /** Runtime node id the Aura adapter registers on the model node. */
    readonly runtimeId: string;
    /** Named morph-target weights — identical on both adapters. */
    readonly weights: Readonly<Record<string, number>>;
  };
}

export const prd06MorphFace: MorphFaceSpec = {
  id: "prd06-morph-face",
  index: 108,
  title: "Morph face (fixed weights)",
  purpose:
    "RobotExpressive face morphs held at fixed named weights — morph-target " +
    "material parity and the morph path's place in the deformer chain " +
    "(stand-in for an ARKit-52 head until Q-05-2)",
  resolution: RESOLUTION,
  // Head framing: RobotExpressive is ~4.6 native units tall; the face sits
  // in the upper third — aim just below the head centre.
  camera: { position: [0.45, 3.7, 2.1], target: [0, 3.45, 0], fov: 38, near: 0.05, far: 50 },
  background: { kind: "color", color: "#202329" },
  environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 1,
  lights: [{ kind: "directional", name: "sun", color: "#fff2e0", intensity: 2.5, position: [2, 4, 3], target: [0, 3.4, 0], castShadow: true }],
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
      name: "robot expressive face",
      asset: "robotExpressive",
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 2.5, bias: -0.0005, normalBias: 0.02 },
  time: 0,
  settleFrames: 4,
  owner: "prd06",
  qrFlags: ["animation"],
  admittedAsReference: false,
  morphFace: {
    runtimeId: "prd06-morph-face-head",
    weights: PRD06_MORPH_FACE_WEIGHTS
  },
  masks: ["silhouette-edge"],
  primaryRegion: "silhouette-edge"
};
