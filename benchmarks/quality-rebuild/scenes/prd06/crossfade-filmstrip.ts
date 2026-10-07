/**
 * Lane prd06 scene `prd06-crossfade-filmstrip` (PRD-06 T1.14). Soldier
 * crossfade choreography — Idle → Walk at t = 0.5 s, Walk → Run at t = 1.5 s,
 * 0.25 s fades with warp — with `strip: { frames: 8, … }` (C-30) for the
 * side-by-side filmstrip, and per-frame bone samples on the Aura side feeding
 * `MotionMetrics.ts` (§17.3 continuity C ≤ 1.5, foot slide, phase error).
 *
 * Unlike the frozen `animation:{clip,time}` scenes, this choreography is
 * *live*: the adapters keep stepping/rendering after READY so the strip
 * captures moving frames. The choreography is declared once here and driven
 * identically by both adapters (three uses `crossFadeTo(…, 0.25, true)`).
 */
import type { SceneSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";

export interface CrossfadeTransitionSpec {
  /** Sim time (seconds after READY) at which the crossfade is triggered. */
  readonly at: number;
  readonly clip: string;
  /** Fade duration (seconds) — `crossFadeTo(…, fadeSeconds, warp)` on both sides. */
  readonly fadeSeconds: number;
  readonly warp: boolean;
}

/** Lane-local extension carried on the spec (same pattern as prd08's `motion`). */
export interface CrossfadeFilmstripSpec extends SceneSpec {
  readonly owner: "prd06";
  readonly motion: {
    /** Runtime node id the Aura adapter registers on the model node. */
    readonly runtimeId: string;
    /** Clip playing at sim t = 0 (before the first transition). */
    readonly initialClip: string;
    readonly transitions: readonly CrossfadeTransitionSpec[];
    /** Sim seconds after READY at which the choreography ends and metrics finalize. */
    readonly horizonSeconds: number;
    /** Fixed cadence for engine bone sampling (§17.3: "fixed 60 Hz"). */
    readonly sampleHz: number;
    /** Every skeleton joint sampled per frame — MotionMetrics filters the humanoid subset. */
    readonly sampledBones: readonly string[];
    /** Bones used for the foot-slide metric (XZ drift while in contact). */
    readonly footBones: readonly string[];
    /** Pure-clip windows used as the continuity baseline (idle / walk / run solo). */
    readonly baselineWindows: readonly (readonly [number, number])[];
  };
}

// Soldier's 49-joint skeleton (fixtures/threejs-parity/assets/character/soldier.glb,
// skin 0). Mixamo `mixamorig:`-prefixed names; fingers and toes stay in the list —
// `isHumanoidMotionBone` excludes them from the continuity window.
export const SOLDIER_JOINTS: readonly string[] = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
  "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:LeftHandThumb1", "mixamorig:LeftHandThumb2",
  "mixamorig:LeftHandIndex1", "mixamorig:LeftHandIndex2", "mixamorig:LeftHandIndex3",
  "mixamorig:LeftHandMiddle1", "mixamorig:LeftHandMiddle2", "mixamorig:LeftHandMiddle3",
  "mixamorig:LeftHandRing1", "mixamorig:LeftHandRing2", "mixamorig:LeftHandRing3",
  "mixamorig:LeftHandPinky1", "mixamorig:LeftHandPinky2",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:RightHandThumb1", "mixamorig:RightHandThumb2", "mixamorig:RightHandThumb3",
  "mixamorig:RightHandIndex1", "mixamorig:RightHandIndex2", "mixamorig:RightHandIndex3",
  "mixamorig:RightHandMiddle1", "mixamorig:RightHandMiddle2", "mixamorig:RightHandMiddle3",
  "mixamorig:RightHandRing1", "mixamorig:RightHandRing2", "mixamorig:RightHandRing3",
  "mixamorig:RightHandPinky1", "mixamorig:RightHandPinky2",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase"
];

export const prd06CrossfadeFilmstrip: CrossfadeFilmstripSpec = {
  id: "prd06-crossfade-filmstrip",
  index: 107,
  title: "Crossfade filmstrip",
  purpose:
    "Soldier Idle→Walk→Run crossfades at t=0.5/1.5s, 0.25s fades (warp): " +
    "§17.3 continuity C ≤ 1.5 per transition, foot slide ≤ 2 cm walk / ≤ 3 cm run, " +
    "walk/run phase error ≤ 1% while both weighted; human 'smooth, no foot skate' " +
    "on the 8-frame strip",
  resolution: RESOLUTION,
  camera: { position: [1.6, 1.2, 3.0], target: [0, 0.9, 0], fov: 40, near: 0.05, far: 50 },
  background: { kind: "color", color: "#202329" },
  environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 1,
  lights: [{ kind: "directional", name: "sun", color: "#fff2e0", intensity: 2.5, position: [2, 4, 3], target: [0, 0, 0], castShadow: true }],
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
      name: "soldier",
      asset: "soldier",
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true,
      // Documented start state; the adapters drive the choreography live and
      // ignore the frozen `time` (strip needs moving frames).
      animation: { clip: "Idle", time: 0 }
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 2.5, bias: -0.0005, normalBias: 0.02 },
  time: 0,
  settleFrames: 4,
  owner: "prd06",
  qrFlags: ["animation"],
  masks: ["shadow-receiver", "silhouette-edge"],
  primaryRegion: "shadow-receiver",
  strip: { frames: 8, intervalMs: 300, orbitDegrees: 0 },
  motion: {
    runtimeId: "prd06-crossfade-soldier",
    initialClip: "Idle",
    transitions: [
      { at: 0.5, clip: "Walk", fadeSeconds: 0.25, warp: true },
      { at: 1.5, clip: "Run", fadeSeconds: 0.25, warp: true }
    ],
    horizonSeconds: 2.6,
    sampleHz: 60,
    sampledBones: SOLDIER_JOINTS,
    // ToeBase joints are the contact points — the ankle (LeftFoot) pivot sits
    // ~10 cm up, outside the §17.3 inferred-contact rule (height < 3 cm).
    footBones: ["mixamorig:LeftToeBase", "mixamorig:RightToeBase"],
    // Pure-clip windows: idle before fade 1, walk between fades, run after fade 2.
    baselineWindows: [[0, 0.4], [0.85, 1.4], [1.85, 2.4]]
  }
};
