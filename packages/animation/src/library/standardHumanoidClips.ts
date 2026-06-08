import { AnimationTrack } from "../AnimationTrack.js";
import {
  AnimationClipRegistry,
  createAnimationClipRegistry,
  type AnimationClipDefinition
} from "../AnimationClipRegistry.js";
import { HUMANOID_BONES, type HumanoidBoneName, type HumanoidRigDefinition } from "../HumanoidRetargeting.js";

/**
 * The STANDARD performance vocabulary (Phase 2.4). These 8 ids are the contract the Animation
 * Studio drives — every shared library, retarget target, and state graph speaks exactly these.
 */
export const STANDARD_CLIP_IDS = ["idle", "talk", "gesture", "point", "nod", "walk", "run", "react"] as const;
export type StandardClipId = typeof STANDARD_CLIP_IDS[number];

/** Locomotion subset of the vocabulary (used by the locomotion blend / studio clip-map check). */
export const STANDARD_LOCOMOTION_CLIP_IDS = ["idle", "walk", "run"] as const;

type Quat = readonly [number, number, number, number];
type Vec3 = readonly [number, number, number];

const FRAME_RATE = 30;

/**
 * The rig-neutral humanoid these clips are authored against. Bone names are the canonical
 * {@link HUMANOID_BONES} (identity bindings), so an identity retarget map is a no-op and the clips
 * can be retargeted onto any inferred character rig via {@link createHumanoidRetargetingMap}.
 */
export const STANDARD_LIBRARY_RIG: HumanoidRigDefinition = {
  id: "aura3d.standard-humanoid",
  name: "Aura3D Standard Humanoid (shared clip library rig)",
  units: "meters",
  facingAxis: "z",
  scale: 1,
  bones: Object.fromEntries(
    HUMANOID_BONES.map((bone) => [bone, { name: bone }])
  ) as HumanoidRigDefinition["bones"],
  metadata: {
    library: "aura3d.standard-humanoid-clips",
    clipVocabulary: [...STANDARD_CLIP_IDS]
  }
};

/** Euler (radians, XYZ) -> quaternion. Compact authoring helper for the procedural clips. */
function euler(x: number, y: number, z: number): Quat {
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

const IDENTITY: Quat = [0, 0, 0, 1];

/** Build a looping quaternion (rotation) track for a bone from per-frame Euler samples. */
function rotationTrack(
  bone: HumanoidBoneName,
  duration: number,
  samples: readonly { readonly t: number; readonly e: Vec3 }[]
): AnimationTrack {
  const keyframes = samples.map((sample) => ({
    time: sample.t,
    value: euler(sample.e[0], sample.e[1], sample.e[2]) as [number, number, number, number],
    interpolation: "linear" as const
  }));
  // Pad to duration so the clip loops cleanly back to its first pose.
  if (keyframes[keyframes.length - 1]!.time < duration) {
    keyframes.push({ time: duration, value: [...keyframes[0]!.value], interpolation: "linear" });
  }
  return new AnimationTrack({ target: `${bone}.rotation`, valueType: "quaternion", keyframes });
}

/** Build a looping vector3 (translation) track for a bone, used for hip bob / sway. */
function translationTrack(
  bone: HumanoidBoneName,
  duration: number,
  samples: readonly { readonly t: number; readonly p: Vec3 }[]
): AnimationTrack {
  const keyframes = samples.map((sample) => ({
    time: sample.t,
    value: [...sample.p] as [number, number, number],
    interpolation: "linear" as const
  }));
  if (keyframes[keyframes.length - 1]!.time < duration) {
    keyframes.push({ time: duration, value: [...keyframes[0]!.value], interpolation: "linear" });
  }
  return new AnimationTrack({ target: `${bone}.translation`, valueType: "vector3", keyframes });
}

function clip(
  id: StandardClipId,
  duration: number,
  tracks: readonly AnimationTrack[],
  loop: boolean,
  tags: readonly string[]
): AnimationClipDefinition<StandardClipId> {
  return {
    id,
    name: id,
    duration,
    frameRate: FRAME_RATE,
    loop,
    tags,
    tracks,
    source: "aura3d.standard-humanoid-clips",
    metadata: { rig: STANDARD_LIBRARY_RIG.id, procedural: true }
  };
}

// --- idle: visible breathing + head turns + weight-shift sway -----------------------------------
// Amplitudes are deliberately readable (not the old ±2° "alive but invisible" idle): spine breathes
// ~0.16 rad, head turns ~0.34 rad peak-to-peak, hips shift ~6 cm laterally so a viewer can tell the
// character is standing/living rather than frozen.
function idleClip(): AnimationClipDefinition<StandardClipId> {
  const d = 4;
  return clip(
    "idle",
    d,
    [
      // Weight shift left -> right plus a clear breathing bob.
      translationTrack("hips", d, [
        { t: 0, p: [0.03, 0, 0] },
        { t: 1, p: [0.02, 0.03, 0] },
        { t: 2, p: [-0.03, 0.01, 0] },
        { t: 3, p: [-0.02, 0.03, 0] }
      ]),
      // Breathing: spine flexes/extends well past the visibility floor (~0.16 rad swing).
      rotationTrack("spine", d, [
        { t: 0, e: [0.04, 0, 0.04] },
        { t: 1, e: [0.18, 0, 0.03] },
        { t: 2, e: [0.05, 0, -0.05] },
        { t: 3, e: [0.16, 0, -0.03] }
      ]),
      rotationTrack("chest", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 1, e: [0.12, 0, 0.02] },
        { t: 2, e: [0.02, 0, 0] },
        { t: 3, e: [0.1, 0, -0.02] }
      ]),
      // Idle head turns: a slow look-around, ~0.34 rad peak-to-peak yaw + a little pitch.
      rotationTrack("head", d, [
        { t: 0, e: [0.02, 0.18, 0] },
        { t: 1, e: [0.06, 0.1, 0.04] },
        { t: 2, e: [0.04, -0.16, 0] },
        { t: 3, e: [-0.04, -0.06, -0.04] }
      ]),
      rotationTrack("neck", d, [
        { t: 0, e: [0, 0.08, 0] },
        { t: 2, e: [0, -0.08, 0] }
      ])
    ],
    true,
    ["idle", "performance", "loop"]
  );
}

// --- talk: real conversational hand gestures + torso + head -------------------------------------
// A speaking beat must read as "talking with the hands": both arms swing through ~0.5+ rad, the
// forearms beat with the cadence, the chest counter-rotates, and the head punctuates.
function talkClip(): AnimationClipDefinition<StandardClipId> {
  const d = 2;
  return clip(
    "talk",
    d,
    [
      rotationTrack("head", d, [
        { t: 0, e: [0, 0.04, 0] },
        { t: 0.5, e: [0.16, 0.12, 0] },
        { t: 1, e: [-0.1, -0.1, 0] },
        { t: 1.5, e: [0.14, 0.06, 0] }
      ]),
      rotationTrack("neck", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.5, e: [0.09, 0.05, 0] },
        { t: 1.5, e: [-0.07, -0.05, 0] }
      ]),
      rotationTrack("chest", d, [
        { t: 0, e: [0, -0.06, 0] },
        { t: 0.6, e: [0.04, 0.12, 0] },
        { t: 1.3, e: [0.02, -0.1, 0] }
      ]),
      // Right hand does the lead gesture: up-and-out beats (~0.55 rad swing in Z plus pitch).
      rotationTrack("rightUpperArm", d, [
        { t: 0, e: [0, 0, -0.2] },
        { t: 0.6, e: [0.45, -0.1, -0.62] },
        { t: 1.2, e: [0.1, 0, -0.25] },
        { t: 1.7, e: [0.35, -0.05, -0.5] }
      ]),
      rotationTrack("rightLowerArm", d, [
        { t: 0, e: [0, 0, -0.35] },
        { t: 0.6, e: [0, -0.2, -0.95] },
        { t: 1.2, e: [0, 0, -0.4] },
        { t: 1.7, e: [0, -0.15, -0.8] }
      ]),
      // Left hand supports with its own beat (~0.5 rad swing).
      rotationTrack("leftUpperArm", d, [
        { t: 0, e: [0, 0, 0.2] },
        { t: 0.8, e: [0.35, 0.1, 0.6] },
        { t: 1.5, e: [0.1, 0, 0.28] }
      ]),
      rotationTrack("leftLowerArm", d, [
        { t: 0, e: [0, 0, 0.3] },
        { t: 0.8, e: [0, 0.15, 0.75] },
        { t: 1.5, e: [0, 0, 0.35] }
      ])
    ],
    true,
    ["talk", "performance", "loop", "upper-body"]
  );
}

// --- gesture: one-shot BIG expressive both-arm sweep --------------------------------------------
// A full presentational sweep: the lead arm raises ~1.1 rad and opens out, the off arm mirrors, the
// torso opens with it. Unmistakably a "big gesture", not a twitch.
function gestureClip(): AnimationClipDefinition<StandardClipId> {
  const d = 1.1;
  return clip(
    "gesture",
    d,
    [
      rotationTrack("rightUpperArm", d, [
        { t: 0, e: [0, 0, -0.2] },
        { t: 0.45, e: [1.1, -0.35, -1.15] },
        { t: 0.8, e: [0.7, -0.2, -0.85] }
      ]),
      rotationTrack("rightLowerArm", d, [
        { t: 0, e: [0, 0, -0.3] },
        { t: 0.45, e: [0, -0.6, -1.2] },
        { t: 0.8, e: [0, -0.3, -0.8] }
      ]),
      rotationTrack("leftUpperArm", d, [
        { t: 0, e: [0, 0, 0.2] },
        { t: 0.5, e: [0.95, 0.35, 1.1] },
        { t: 0.85, e: [0.6, 0.2, 0.8] }
      ]),
      rotationTrack("leftLowerArm", d, [
        { t: 0, e: [0, 0, 0.3] },
        { t: 0.5, e: [0, 0.5, 1.1] }
      ]),
      rotationTrack("chest", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.45, e: [-0.08, 0.28, 0] }
      ]),
      rotationTrack("head", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.45, e: [-0.12, 0.1, 0] }
      ])
    ],
    false,
    ["gesture", "performance", "one-shot", "upper-body"]
  );
}

// --- point: one-shot directional arm extension --------------------------------------------------
function pointClip(): AnimationClipDefinition<StandardClipId> {
  const d = 0.9;
  return clip(
    "point",
    d,
    [
      rotationTrack("rightShoulder", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.35, e: [0, -0.15, 0] }
      ]),
      rotationTrack("rightUpperArm", d, [
        { t: 0, e: [0, 0, -0.2] },
        { t: 0.35, e: [0, -0.25, -1.55] },
        { t: 0.7, e: [0, -0.25, -1.55] }
      ]),
      rotationTrack("rightLowerArm", d, [
        { t: 0, e: [0, 0, -0.35] },
        { t: 0.35, e: [0, 0, 0] },
        { t: 0.7, e: [0, 0, 0] }
      ]),
      rotationTrack("head", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.35, e: [0, -0.35, 0] },
        { t: 0.7, e: [0, -0.3, 0] }
      ])
    ],
    false,
    ["point", "performance", "one-shot", "upper-body"]
  );
}

// --- nod: one-shot affirmative head nod ---------------------------------------------------------
function nodClip(): AnimationClipDefinition<StandardClipId> {
  const d = 0.8;
  return clip(
    "nod",
    d,
    [
      rotationTrack("head", d, [
        { t: 0, e: [-0.06, 0, 0] },
        { t: 0.2, e: [0.42, 0, 0] },
        { t: 0.4, e: [-0.1, 0, 0] },
        { t: 0.6, e: [0.34, 0, 0] }
      ]),
      rotationTrack("neck", d, [
        { t: 0, e: [-0.02, 0, 0] },
        { t: 0.2, e: [0.18, 0, 0] },
        { t: 0.4, e: [-0.02, 0, 0] },
        { t: 0.6, e: [0.14, 0, 0] }
      ])
    ],
    false,
    ["nod", "performance", "one-shot"]
  );
}

// --- react: one-shot surprised recoil (torso + arms + head) -------------------------------------
function reactClip(): AnimationClipDefinition<StandardClipId> {
  const d = 1;
  return clip(
    "react",
    d,
    [
      rotationTrack("spine", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.18, e: [-0.5, 0, 0] },
        { t: 0.6, e: [-0.18, 0, 0] }
      ]),
      rotationTrack("head", d, [
        { t: 0, e: [0, 0, 0] },
        { t: 0.18, e: [-0.4, 0, 0] },
        { t: 0.6, e: [-0.12, 0, 0] }
      ]),
      rotationTrack("leftUpperArm", d, [
        { t: 0, e: [0, 0, 0.2] },
        { t: 0.2, e: [-0.7, 0, 1.1] },
        { t: 0.6, e: [-0.3, 0, 0.6] }
      ]),
      rotationTrack("rightUpperArm", d, [
        { t: 0, e: [0, 0, -0.2] },
        { t: 0.2, e: [-0.7, 0, -1.1] },
        { t: 0.6, e: [-0.3, 0, -0.6] }
      ]),
      translationTrack("hips", d, [
        { t: 0, p: [0, 0, 0] },
        { t: 0.18, p: [0, 0, -0.12] },
        { t: 0.6, p: [0, 0, -0.04] }
      ])
    ],
    false,
    ["react", "performance", "one-shot"]
  );
}

/** Build a symmetric two-step leg/arm cycle for walk or run. */
function legCycle(id: "walk" | "run", duration: number, amplitude: number, lift: number, bob: number): AnimationClipDefinition<StandardClipId> {
  const half = duration / 2;
  return clip(
    id,
    duration,
    [
      // Hip vertical bob (two bobs per stride).
      translationTrack("hips", duration, [
        { t: 0, p: [0, 0, 0] },
        { t: half / 2, p: [0, bob, 0] },
        { t: half, p: [0, 0, 0] },
        { t: half + half / 2, p: [0, bob, 0] }
      ]),
      // Legs swing in opposition.
      rotationTrack("leftUpperLeg", duration, [
        { t: 0, e: [amplitude, 0, 0] },
        { t: half, e: [-amplitude, 0, 0] }
      ]),
      rotationTrack("rightUpperLeg", duration, [
        { t: 0, e: [-amplitude, 0, 0] },
        { t: half, e: [amplitude, 0, 0] }
      ]),
      rotationTrack("leftLowerLeg", duration, [
        { t: 0, e: [0, 0, 0] },
        { t: half / 2, e: [lift, 0, 0] },
        { t: half, e: [0, 0, 0] }
      ]),
      rotationTrack("rightLowerLeg", duration, [
        { t: 0, e: [lift, 0, 0] },
        { t: half / 2, e: [0, 0, 0] },
        { t: half, e: [lift, 0, 0] }
      ]),
      // Arms counter-swing to the legs.
      rotationTrack("leftUpperArm", duration, [
        { t: 0, e: [-amplitude * 0.8, 0, 0.15] },
        { t: half, e: [amplitude * 0.8, 0, 0.15] }
      ]),
      rotationTrack("rightUpperArm", duration, [
        { t: 0, e: [amplitude * 0.8, 0, -0.15] },
        { t: half, e: [-amplitude * 0.8, 0, -0.15] }
      ]),
      rotationTrack("spine", duration, [
        { t: 0, e: [0.05, amplitude * 0.15, 0] },
        { t: half, e: [0.05, -amplitude * 0.15, 0] }
      ])
    ],
    true,
    [id, "locomotion", "loop", "lower-body"]
  );
}

// Walk: strong staged stride. Upper-leg swing of ±0.55 rad gives a 1.1 rad peak-to-peak step that
// reads clearly even on a previz rig; knees lift, arms counter-swing, torso twists.
function walkClip(): AnimationClipDefinition<StandardClipId> {
  return legCycle("walk", 1, 0.55, 0.7, 0.04);
}

// Run: bigger and faster (rig permitting) — ±0.9 rad upper-leg swing, deep knee lift, strong bob.
function runClip(): AnimationClipDefinition<StandardClipId> {
  return legCycle("run", 0.6, 0.9, 1.1, 0.07);
}

/** Ordered list of all standard library clip definitions (idle first). */
export function createStandardHumanoidClipDefinitions(): readonly AnimationClipDefinition<StandardClipId>[] {
  return [
    idleClip(),
    talkClip(),
    gestureClip(),
    pointClip(),
    nodClip(),
    walkClip(),
    runClip(),
    reactClip()
  ];
}

/**
 * Shared, rig-neutral {@link AnimationClipRegistry} populated with the 8 standard performance clips
 * authored on {@link STANDARD_LIBRARY_RIG} (canonical {@link HUMANOID_BONES}). The clips are COMPACT
 * procedural keyframe loops/one-shots — real, samplable {@link AnimationTrack} data, not mocap and
 * not placeholders. They give the studio a guaranteed, retargetable performance vocabulary even when
 * a source GLB ships only one (or zero) usable clips.
 */
export function createStandardHumanoidClipRegistry(): AnimationClipRegistry<StandardClipId> {
  return createAnimationClipRegistry<StandardClipId>(createStandardHumanoidClipDefinitions());
}
